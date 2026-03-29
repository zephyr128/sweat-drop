/**
 * BLE Service — Multi-Protocol Support
 *
 * Supports both iOS (react-native-ble-plx) and Android (react-native-ble-manager)
 *
 * Protocols:
 * - CSC (0x1816): Cycling Speed and Cadence — Magene S3+
 * - FTMS (0x1826): Fitness Machine Service — Life Fitness, Technogym, Matrix, Horizon
 * - Yesoul (0xFFF0): Proprietary — Yesoul spin bikes
 *
 * AGENT NOTE: [2026-03-02] - mobile-coder (Task 3.4)
 * Added FTMS protocol support alongside existing CSC. Protocol is auto-detected
 * at connection time based on available services, or forced via setProtocol().
 */

import { Platform } from 'react-native';
import BleManager from 'react-native-ble-manager';
import { BleManager as BleManagerIOS, Device, Characteristic } from 'react-native-ble-plx';
import { log } from '@/lib/logger';

import {
  type BLEProtocolType,
  type FTMSMachineType,
  type BLEMeasurement,
  type YesoulRawData,
  CSC_SERVICE_UUID,
  CSC_SPEED_SERVICE_UUID,
  CSC_MEASUREMENT_CHAR_UUID,
  CSC_FEATURE_CHAR_UUID,
  FTMS_SERVICE_UUID,
  FTMS_TREADMILL_DATA_CHAR_UUID,
  FTMS_INDOOR_BIKE_CHAR_UUID,
  FTMS_CROSS_TRAINER_CHAR_UUID,
  YESOUL_SERVICE_UUID,
  YESOUL_NOTIFY_CHAR_UUID,
  ALL_SCAN_SERVICE_UUIDS,
  createCSCMeasurement,
  createFTMSMeasurement,
  createYesoulMeasurement,
} from '@/lib/ble-protocol';

import {
  parseIndoorBikeData,
  parseTreadmillData,
  parseCrossTrainerData,
  estimateStepsPerMinuteFromSpeed,
} from '@/lib/ble-ftms';
import {
  parseSimulatorDescriptor,
  startWorkoutSimulator,
  type WorkoutSimulatorHandle,
  type WorkoutSimulatorDescriptor,
  type WorkoutSimulatorProfile,
} from '@/lib/workout/workout-simulator';

// Re-export types for backward compatibility
export type { BLEMeasurement } from '@/lib/ble-protocol';
export { type CSCMeasurement } from '@/lib/ble-protocol';

// Legacy constants (kept for any external references)
const CSC_MEASUREMENT_CHARACTERISTIC_UUID = CSC_MEASUREMENT_CHAR_UUID;
const CSC_FEATURE_CHARACTERISTIC_UUID = CSC_FEATURE_CHAR_UUID;

/**
 * Normalize UUID to 4-character format for comparison
 * Handles both 128-bit UUIDs (e.g., '00001816-0000-1000-8000-00805f9b34fb') 
 * and 16-bit UUIDs (e.g., '1816')
 * 
 * For 128-bit UUIDs, extracts characters 4-8 (0-indexed) after removing dashes
 * Example: '00001816-0000-1000-8000-00805f9b34fb' -> '1816'
 */
function normalizeUUID(uuid: string): string {
  if (!uuid) return '';
  
  // Remove dashes and convert to lowercase
  const normalized = uuid.toLowerCase().replace(/-/g, '');
  
  // If already 4 characters or less, return as is
  if (normalized.length <= 4) {
    return normalized;
  }
  
  // For 128-bit UUIDs, extract characters 4-8 (0-indexed)
  // Format: 00001816-0000-1000-8000-00805f9b34fb
  // After removing dashes: 0000181600001000800000805f9b34fb
  // Characters 4-8: '1816'
  if (normalized.length >= 8) {
    return normalized.substring(4, 8);
  }
  
  return normalized;
}

/**
 * Check if two UUIDs match (handles both 128-bit and 16-bit formats)
 */
function uuidMatches(uuid1: string, uuid2: string): boolean {
  const normalized1 = normalizeUUID(uuid1);
  const normalized2 = normalizeUUID(uuid2);
  return normalized1 === normalized2;
}

export interface BLEDevice {
  id: string;
  name: string | null;
  rssi: number | null;
}

export class BLEService {
  private device: Device | string | null = null; // Device for iOS, device ID string for Android
  private deviceId: string | null = null; // Always store device ID as string for reconnect
  private isConnected: boolean = false;
  private measurementCallback: ((measurement: BLEMeasurement) => void) | null = null;
  private lastWheelRevolutions: number = 0;
  private lastCrankRevolutions: number = 0;
  private lastWheelEventTime: number = 0;
  private lastCrankEventTime: number = 0;
  private lastMeasurementTime: number = 0;
  // Magene S3+ Stale Data Detection: Track last processed values to detect echo packets
  private lastProcessedCrankRevolutions: number = -1;
  private lastProcessedCrankEventTime: number = -1;
  private lastProcessedTimestamp: number = 0; // Track when last packet was processed
  private bleManagerIOS: BleManagerIOS | null = null;
  private notificationSubscription: any = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private onSleepCallback: (() => void) | null = null;
  private onReconnectCallback: (() => Promise<boolean>) | null = null;
  private onStatusCallback: ((status: string) => void) | null = null; // UI status callback
  private simulatorProfile: WorkoutSimulatorProfile | null = null;
  private simulatorDescriptor: WorkoutSimulatorDescriptor | null = null;
  private simulatorHandle: WorkoutSimulatorHandle | null = null;

  // ── FTMS Protocol Support ──
  private activeProtocol: BLEProtocolType = 'csc';       // Currently active protocol
  private ftmsMachineType: FTMSMachineType = 'bike';     // FTMS machine type hint
  private forcedProtocol: BLEProtocolType | null = null;  // If set, skip auto-detection
  private syntheticCrankCounter: number = 0;              // Monotonic counter for FTMS→CSC compat
  private ftmsNotificationSubscriptions: any[] = [];      // FTMS can have multiple char subscriptions

  constructor() {
    if (Platform.OS === 'ios') {
      this.bleManagerIOS = new BleManagerIOS();
    } else {
      // Initialize Android BLE Manager
      BleManager.start({ showAlert: false }).then(() => {
        log.debug('[BLE] Android BLE Manager initialized');
      }).catch((error) => {
        log.error('[BLE] Failed to initialize BLE Manager:', error);
      });
    }
  }

  /**
   * Set the expected BLE protocol (forces protocol instead of auto-detection).
   * Call before connectToDevice() to skip auto-detection.
   * @param protocol - 'csc' for Magene S3+, 'ftms' for gym equipment, 'yesoul' for Yesoul spin bikes
   * @param machineType - FTMS machine type hint (default: 'bike')
   */
  setProtocol(protocol: BLEProtocolType, machineType?: FTMSMachineType): void {
    this.forcedProtocol = protocol;
    if (machineType) {
      this.ftmsMachineType = machineType;
    }
    log.debug(`[BLE] Protocol forced to: ${protocol}${machineType ? ` (${machineType})` : ''}`);
  }

  /** Get the currently active protocol */
  getActiveProtocol(): BLEProtocolType {
    return this.activeProtocol;
  }

  /** Set the FTMS machine type hint (affects which characteristic to subscribe to) */
  setFTMSMachineType(type: FTMSMachineType): void {
    this.ftmsMachineType = type;
    log.debug(`[BLE] FTMS machine type set to: ${type}`);
  }

  /**
   * Scan for BLE devices with any supported service (CSC + FTMS)
   */
  async scanForDevices(timeout: number = 5000): Promise<BLEDevice[]> {
    if (Platform.OS === 'ios') {
      if (!this.bleManagerIOS) {
        throw new Error('BLE Manager not initialized');
      }

      return new Promise((resolve, reject) => {
        const devices: BLEDevice[] = [];
        const deviceMap = new Map<string, BLEDevice>(); // Use Map to avoid duplicates
        let scanTimeout: NodeJS.Timeout | null = null;
        
        // Scan for CSC (0x1816, 0x1818) and FTMS (0x1826) services
        this.bleManagerIOS!.startDeviceScan(ALL_SCAN_SERVICE_UUIDS, null, (error, device) => {
          if (error) {
            log.error('[BLE] Scan error:', error);
            this.bleManagerIOS?.stopDeviceScan();
            if (scanTimeout) clearTimeout(scanTimeout);
            reject(error);
            return;
          }

          if (device && !deviceMap.has(device.id)) {
            const bleDevice: BLEDevice = {
              id: device.id,
              name: device.name,
              rssi: device.rssi,
            };
            deviceMap.set(device.id, bleDevice);
            devices.push(bleDevice);
            log.debug(`[BLE] Found CSC device: ${device.name || device.id}`);
          }
        });

        // Stop scanning after timeout
        scanTimeout = setTimeout(() => {
          this.bleManagerIOS?.stopDeviceScan();
          log.debug(`[BLE] Scan complete, found ${devices.length} device(s)`);
          resolve(devices);
        }, timeout);
      });
    } else {
      // Android scanning
      return new Promise((resolve, reject) => {
        const devices: BLEDevice[] = [];
        const deviceMap = new Map<string, BLEDevice>(); // Use Map to avoid duplicates
        
        // Scan for CSC (0x1816, 0x1818) and FTMS (0x1826) services
        // @ts-expect-error - react-native-ble-manager types are incomplete, scan accepts service UUIDs array
        BleManager.scan(ALL_SCAN_SERVICE_UUIDS, timeout / 1000, false).then(() => {
          log.debug('[BLE] Scan started');
        }).catch((error) => {
          reject(error);
        });

        // Listen for discovered devices
        // @ts-expect-error - react-native-ble-manager types are incomplete, addListener exists at runtime
        const subscription = BleManager.addListener('BleManagerDiscoverPeripheral', (peripheral: any) => {
          if (!deviceMap.has(peripheral.id)) {
            const bleDevice: BLEDevice = {
              id: peripheral.id,
              name: peripheral.name || null,
              rssi: peripheral.rssi || null,
            };
            deviceMap.set(peripheral.id, bleDevice);
            devices.push(bleDevice);
            log.debug(`[BLE] Found CSC device: ${peripheral.name || peripheral.id}`);
          }
        });

        // Stop scanning and return results after timeout
        setTimeout(() => {
          BleManager.stopScan().catch(err => log.error('[BLE] Error stopping scan:', err));
          subscription.remove();
          log.debug(`[BLE] Scan complete, found ${devices.length} device(s)`);
          resolve(devices);
        }, timeout);
      });
    }
  }

  /**
   * Convert base64 string to hex string (if possible)
   */
  private base64ToHex(base64: string): string | null {
    try {
      const decoded = atob(base64);
      let hex = '';
      for (let i = 0; i < decoded.length; i++) {
        const charCode = decoded.charCodeAt(i);
        hex += charCode.toString(16).padStart(2, '0');
      }
      return hex;
    } catch (e) {
      return null;
    }
  }

  /**
   * Set status callback for UI feedback
   */
  setStatusCallback(callback: (status: string) => void): void {
    this.onStatusCallback = callback;
  }

  /**
   * Set measurement callback (for cleanup)
   */
  setMeasurementCallback(callback: ((measurement: BLEMeasurement) => void) | null): void {
    this.measurementCallback = callback;
  }

  /**
   * Emit status update
   */
  private emitStatus(status: string): void {
    if (this.onStatusCallback) {
      this.onStatusCallback(status);
    }
    log.debug(`[BLE Status] ${status}`);
  }

  /**
   * Connect to a specific BLE device by sensor ID
   * If sensorId is a base64 string (from Web Bluetooth), we'll scan and match by device name
   */
  async connectToDevice(sensorId: string): Promise<boolean> {
    try {
      const simulator = parseSimulatorDescriptor(sensorId);
      if (simulator) {
        this.simulatorDescriptor = simulator;
        this.simulatorProfile = simulator.profile;
        this.device = sensorId;
        this.deviceId = sensorId;
        this.isConnected = true;
        this.activeProtocol = simulator.profile === 'custom' ? 'ftms' : 'csc';
        this.lastMeasurementTime = Date.now();
        this.emitStatus(`Simulator connected (${simulator.profile})`);
        log.debug(`[BLE] Using simulator profile: ${simulator.profile}`);
        return true;
      }

      log.debug(`[BLE] Connecting to Magene S3+ sensor: ${sensorId}`);
      this.emitStatus('Initializing connection...');

      // Check if sensorId is a base64 string (from Web Bluetooth API)
      const isBase64 = /^[A-Za-z0-9+/=]+$/.test(sensorId) && sensorId.length > 20;
      
      if (isBase64) {
        log.debug('[BLE] Sensor ID appears to be base64, scanning for devices by name...');
        this.emitStatus('Scanning for devices...');
        
        // Try to convert base64 to hex first
        const hexId = this.base64ToHex(sensorId);
        if (hexId) {
          log.debug('[BLE] Converted base64 to hex:', hexId);
        }
        
        // Scan for devices and match by device name (most reliable)
        log.debug('[BLE] Scanning for CSC devices (5 second timeout)...');
        const devices = await this.scanForDevices(5000);
        
        if (devices.length === 0) {
          throw new Error('No BLE devices found. Please ensure sensor/machine is powered on and discoverable.');
        }
        
        // Sort by RSSI (strongest signal first)
        const sortedDevices = devices.sort((a, b) => (b.rssi || -100) - (a.rssi || -100));
        
        // Try to connect to the first available device (strongest signal)
        // Device name is more reliable than ID for matching
        const targetDevice = sortedDevices[0];
        log.debug(`[BLE] Found ${devices.length} CSC device(s):`);
        devices.forEach((d, idx) => {
          log.debug(`  [${idx + 1}] Name: ${d.name || 'Unknown'}, ID: ${d.id}, RSSI: ${d.rssi}`);
        });
        
        const deviceDisplayName = targetDevice.name || targetDevice.id;
        log.debug(`[BLE] Connecting to device: ${deviceDisplayName} (ID: ${targetDevice.id}, RSSI: ${targetDevice.rssi})`);
        this.emitStatus(`Found device: ${deviceDisplayName}`);
        
        // Use the actual device ID from scan (not the base64 sensor_id)
        // Device name is logged for reference, but we use ID for connection
        return await this.connectToDeviceById(targetDevice.id);
      }

      // If not base64, try direct connection
      this.emitStatus('Connecting to device...');
      return await this.connectToDeviceById(sensorId);
    } catch (error: any) {
      log.error('[BLE] Connection error:', error);
      this.isConnected = false;
      this.device = null;
      this.deviceId = null; // Clear device ID on error
      this.emitStatus('Connection failed');
      throw error; // Re-throw to allow caller to handle cleanup
    }
  }

  /**
   * Internal method to connect to device by actual BLE ID
   */
  private async connectToDeviceById(deviceId: string): Promise<boolean> {
    try {
      log.debug(`[BLE] Connecting to device ID: ${deviceId}`);
      this.emitStatus('Connecting...');

      if (Platform.OS === 'ios') {
        if (!this.bleManagerIOS) {
          throw new Error('BLE Manager not initialized');
        }

        // Connect to device
        log.debug('[BLE] iOS: Connecting to device...');
        this.emitStatus('Establishing connection...');
        const device = await this.bleManagerIOS.connectToDevice(deviceId);
        log.debug('[BLE] iOS: Discovering services and characteristics...');
        this.emitStatus('Discovering services...');
        await device.discoverAllServicesAndCharacteristics();

        // Get ALL services and log them
        const services = await device.services();
        log.debug(`[BLE] Found ${services.length} service(s):`);
        services.forEach((service, index) => {
          log.debug(`  [${index + 1}] Service UUID: ${service.uuid} (normalized: ${normalizeUUID(service.uuid)})`);
        });

        // ── PROTOCOL DETECTION ──
        // Check for all supported services
        const yesoulService = services.find(s => uuidMatches(s.uuid, YESOUL_SERVICE_UUID));
        const ftmsService = services.find(s => uuidMatches(s.uuid, FTMS_SERVICE_UUID));
        const cscCadenceService = services.find(s => uuidMatches(s.uuid, CSC_SERVICE_UUID));
        const cscSpeedService = services.find(s => uuidMatches(s.uuid, CSC_SPEED_SERVICE_UUID));

        // Priority: Yesoul > FTMS > CSC
        const useYesoul = (this.forcedProtocol === 'yesoul') ||
          (!this.forcedProtocol && yesoulService && !ftmsService && !cscCadenceService);

        const useFTMS = !useYesoul && (
          (this.forcedProtocol === 'ftms') ||
          (!this.forcedProtocol && ftmsService) ||
          (this.forcedProtocol !== 'csc' && ftmsService && !cscCadenceService)
        );

        // ── Yesoul Protocol ──
        if (useYesoul && yesoulService) {
          log.debug(`[BLE] Yesoul Service found: ${yesoulService.uuid}`);
          this.emitStatus('Found Yesoul bike');
          this.activeProtocol = 'yesoul';
          this.syntheticCrankCounter = 0;

          // Validate FFF4 notify characteristic exists
          const chars = await yesoulService.characteristics();
          const hasNotify = chars.some(c => uuidMatches(c.uuid, YESOUL_NOTIFY_CHAR_UUID));

          log.debug(`[BLE] Yesoul characteristics — Notify (FFF4): ${hasNotify}`);

          if (!hasNotify) {
            throw new Error('Yesoul service found but FFF4 notify characteristic missing.');
          }

          this.device = device;
          this.deviceId = device.id;
          this.isConnected = true;
          this.emitStatus('Ready (Yesoul bike)');
          log.debug('[BLE] Connected via Yesoul proprietary protocol (iOS)');
          return true;
        }

        // ── FTMS Protocol ──
        if (useFTMS && ftmsService) {
          log.debug(`[BLE] FTMS Service found: ${ftmsService.uuid}`);
          this.emitStatus('Found FTMS service');
          this.activeProtocol = 'ftms';
          this.syntheticCrankCounter = 0;

          // FTMS characteristic discovery happens in startMonitoring()
          // Just validate the service has at least one data characteristic
          const chars = await ftmsService.characteristics();
          const hasTreadmill = chars.some(c => uuidMatches(c.uuid, FTMS_TREADMILL_DATA_CHAR_UUID));
          const hasBike = chars.some(c => uuidMatches(c.uuid, FTMS_INDOOR_BIKE_CHAR_UUID));
          const hasCrossTrainer = chars.some(c => uuidMatches(c.uuid, FTMS_CROSS_TRAINER_CHAR_UUID));

          log.debug(`[BLE] FTMS characteristics — Treadmill: ${hasTreadmill}, Bike: ${hasBike}, CrossTrainer: ${hasCrossTrainer}`);

          if (!hasTreadmill && !hasBike && !hasCrossTrainer) {
            throw new Error('FTMS service found but no supported data characteristics (Treadmill/Bike/CrossTrainer).');
          }

          // Auto-detect machine type from available characteristics
          if (hasBike) this.ftmsMachineType = 'bike';
          else if (hasTreadmill) this.ftmsMachineType = 'treadmill';
          else if (hasCrossTrainer) this.ftmsMachineType = 'elliptical';

          this.emitStatus(`Ready (FTMS ${this.ftmsMachineType})`);
          this.device = device;
          this.deviceId = device.id;
          this.isConnected = true;
          log.debug(`[BLE] Connected via FTMS (${this.ftmsMachineType}) (iOS)`);
          return true;
        }

        // ── CSC Protocol (existing logic) ──
        this.activeProtocol = 'csc';

        // Try to find CSC Service (Cadence mode - 0x1816)
        let cscService = cscCadenceService;

        // If not found, check Speed mode (0x1818) — wrong mode for Magene
        if (!cscService && cscSpeedService) {
          const errorMsg = 'Senzor je u SPEED modu (zelena lampica). Molimo vas resetujte bateriju da prebacite u CADENCE mod (crvena lampica).';
          log.error(`[BLE] ${errorMsg}`);
          this.emitStatus('Wrong mode detected');
          throw new Error(errorMsg);
        }

        if (!cscService) {
          const serviceUuids = services.map(s => s.uuid).join(', ');
          throw new Error(`No supported BLE service found (CSC 0x1816, FTMS 0x1826, or Yesoul 0xFFF0). Available: ${serviceUuids}`);
        }

        log.debug(`[BLE] Found CSC Service: ${cscService.uuid} (normalized: ${normalizeUUID(cscService.uuid)})`);
        this.emitStatus('Found CSC service');

        // Get ALL characteristics and log them
        const characteristics = await cscService.characteristics();
        log.debug(`[BLE] Found ${characteristics.length} characteristic(s) in CSC service:`);
        characteristics.forEach((char, index) => {
          log.debug(`  [${index + 1}] Characteristic UUID: ${char.uuid} (normalized: ${normalizeUUID(char.uuid)})`);
        });

        // Get CSC Measurement Characteristic
        const measurementChar = characteristics.find(c => {
          return uuidMatches(c.uuid, CSC_MEASUREMENT_CHARACTERISTIC_UUID);
        });

        if (!measurementChar) {
          const charUuids = characteristics.map(c => c.uuid).join(', ');
          throw new Error(`CSC Measurement Characteristic (0x2A5B) not found. Available: ${charUuids}`);
        }

        log.debug(`[BLE] Found CSC Measurement Characteristic: ${measurementChar.uuid}`);
        
        const properties = (measurementChar as any).properties || [];
        const canNotify = properties.includes('notify') || properties.includes('indicate');
        
        if (!canNotify) {
          log.warn('[BLE] Characteristic does not support notifications, but will attempt anyway');
        }
        
        this.emitStatus('Ready to monitor');
        this.device = device;
        this.deviceId = device.id;
        this.isConnected = true;

        log.debug('[BLE] Connected via CSC (Magene S3+) (iOS)');
        return true;
      } else {
        // Android connection
        log.debug('[BLE] Android: Connecting to device...');
        this.emitStatus('Establishing connection...');
        await BleManager.connect(deviceId);
        log.debug('[BLE] Android: Retrieving services...');
        this.emitStatus('Discovering services...');
        await BleManager.retrieveServices(deviceId);

        // Get ALL services and log them
        log.debug('[BLE] Android: Getting services...');
        // @ts-expect-error - react-native-ble-manager types are incomplete, getServices exists at runtime
        const services = await BleManager.getServices(deviceId);
        log.debug(`[BLE] Found ${services.length} service(s):`);
        services.forEach((service: any, index: number) => {
          log.debug(`  [${index + 1}] Service UUID: ${service.uuid} (normalized: ${normalizeUUID(service.uuid)})`);
        });

        // ── PROTOCOL DETECTION ──
        const yesoulService = services.find((s: any) => uuidMatches(s.uuid, YESOUL_SERVICE_UUID));
        const ftmsService = services.find((s: any) => uuidMatches(s.uuid, FTMS_SERVICE_UUID));
        const cscCadenceService = services.find((s: any) => uuidMatches(s.uuid, CSC_SERVICE_UUID));
        const cscSpeedService = services.find((s: any) => uuidMatches(s.uuid, CSC_SPEED_SERVICE_UUID));

        // Priority: Yesoul > FTMS > CSC
        const useYesoul = (this.forcedProtocol === 'yesoul') ||
          (!this.forcedProtocol && yesoulService && !ftmsService && !cscCadenceService);

        const useFTMS = !useYesoul && (
          (this.forcedProtocol === 'ftms') ||
          (!this.forcedProtocol && ftmsService) ||
          (this.forcedProtocol !== 'csc' && ftmsService && !cscCadenceService)
        );

        // ── Yesoul Protocol ──
        if (useYesoul && yesoulService) {
          log.debug(`[BLE] Yesoul Service found: ${yesoulService.uuid}`);
          this.emitStatus('Found Yesoul bike');
          this.activeProtocol = 'yesoul';
          this.syntheticCrankCounter = 0;

          // Validate FFF4 notify characteristic
          // @ts-expect-error - react-native-ble-manager types are incomplete, getCharacteristics exists at runtime
          const chars = await BleManager.getCharacteristics(deviceId, yesoulService.uuid);
          const hasNotify = chars.some((c: any) => uuidMatches(c.uuid, YESOUL_NOTIFY_CHAR_UUID));

          log.debug(`[BLE] Yesoul characteristics — Notify (FFF4): ${hasNotify}`);

          if (!hasNotify) {
            throw new Error('Yesoul service found but FFF4 notify characteristic missing.');
          }

          this.device = deviceId;
          this.deviceId = deviceId;
          this.isConnected = true;
          this.emitStatus('Ready (Yesoul bike)');
          log.debug('[BLE] Connected via Yesoul proprietary protocol (Android)');
          return true;
        }

        // ── FTMS Protocol ──
        if (useFTMS && ftmsService) {
          log.debug(`[BLE] FTMS Service found: ${ftmsService.uuid}`);
          this.emitStatus('Found FTMS service');
          this.activeProtocol = 'ftms';
          this.syntheticCrankCounter = 0;

          // Validate FTMS data characteristics
          // @ts-expect-error - react-native-ble-manager types are incomplete, getCharacteristics exists at runtime
          const chars = await BleManager.getCharacteristics(deviceId, ftmsService.uuid);
          const hasTreadmill = chars.some((c: any) => uuidMatches(c.uuid, FTMS_TREADMILL_DATA_CHAR_UUID));
          const hasBike = chars.some((c: any) => uuidMatches(c.uuid, FTMS_INDOOR_BIKE_CHAR_UUID));
          const hasCrossTrainer = chars.some((c: any) => uuidMatches(c.uuid, FTMS_CROSS_TRAINER_CHAR_UUID));

          log.debug(`[BLE] FTMS characteristics — Treadmill: ${hasTreadmill}, Bike: ${hasBike}, CrossTrainer: ${hasCrossTrainer}`);

          if (!hasTreadmill && !hasBike && !hasCrossTrainer) {
            throw new Error('FTMS service found but no supported data characteristics.');
          }

          if (hasBike) this.ftmsMachineType = 'bike';
          else if (hasTreadmill) this.ftmsMachineType = 'treadmill';
          else if (hasCrossTrainer) this.ftmsMachineType = 'elliptical';

          this.device = deviceId;
          this.deviceId = deviceId;
          this.isConnected = true;
          this.emitStatus(`Ready (FTMS ${this.ftmsMachineType})`);
          log.debug(`[BLE] Connected via FTMS (${this.ftmsMachineType}) (Android)`);
          return true;
        }

        // ── CSC Protocol (existing logic) ──
        this.activeProtocol = 'csc';

        let cscService = cscCadenceService;

        if (!cscService && cscSpeedService) {
          const errorMsg = 'Senzor je u SPEED modu (zelena lampica). Molimo vas resetujte bateriju da prebacite u CADENCE mod (crvena lampica).';
          log.error(`[BLE] ${errorMsg}`);
          this.emitStatus('Wrong mode detected');
          throw new Error(errorMsg);
        }

        if (!cscService) {
          const serviceUuids = services.map((s: any) => s.uuid).join(', ');
          throw new Error(`No supported BLE service found (CSC 0x1816, FTMS 0x1826, or Yesoul 0xFFF0). Available: ${serviceUuids}`);
        }

        log.debug(`[BLE] Found CSC Service: ${cscService.uuid}`);
        this.emitStatus('Found CSC service');

        // Get ALL characteristics and log them
        log.debug('[BLE] Android: Getting characteristics...');
        // @ts-expect-error - react-native-ble-manager types are incomplete, getCharacteristics exists at runtime
        const characteristics = await BleManager.getCharacteristics(deviceId, cscService.uuid);
        log.debug(`[BLE] Found ${characteristics.length} characteristic(s) in CSC service:`);
        characteristics.forEach((char: any, index: number) => {
          log.debug(`  [${index + 1}] Characteristic UUID: ${char.uuid}`);
        });

        const measurementChar = characteristics.find((c: any) => {
          return uuidMatches(c.uuid, CSC_MEASUREMENT_CHARACTERISTIC_UUID);
        });

        if (!measurementChar) {
          const charUuids = characteristics.map((c: any) => c.uuid).join(', ');
          throw new Error(`CSC Measurement Characteristic (0x2A5B) not found. Available: ${charUuids}`);
        }

        log.debug(`[BLE] Found CSC Measurement Characteristic: ${measurementChar.uuid}`);
        
        const properties = (measurementChar as any).properties || [];
        const canNotify = properties.includes('notify') || properties.includes('indicate');
        
        this.device = deviceId;
        this.deviceId = deviceId;
        this.isConnected = true;

        // Start notification immediately after connection if characteristic supports it (Android)
        if (canNotify) {
          try {
            await BleManager.startNotification(deviceId, cscService.uuid, measurementChar.uuid);
            log.debug('[BLE] Android: CSC notification started successfully');
          } catch (notifError) {
            log.warn('[BLE] Android: Could not start notification immediately:', notifError);
          }
        }

        log.debug('[BLE] Connected via CSC (Magene S3+) (Android)');
        return true;
      }
    } catch (error: any) {
      log.error('[BLE] Connection error in connectToDeviceById:', error);
      this.isConnected = false;
      this.device = null;
      this.deviceId = null; // Clear device ID on error
      throw error; // Re-throw to allow caller to handle cleanup
    }
  }

  /**
   * Start monitoring BLE measurements with heartbeat detection.
   * Automatically routes to CSC or FTMS based on activeProtocol set during connection.
   */
  async startMonitoring(
    onMeasurement: (measurement: BLEMeasurement) => void,
    onSleep?: () => void,
    onReconnect?: () => Promise<boolean>
  ): Promise<boolean> {
    if (!this.isConnected || !this.device) {
      log.error('[BLE] Not connected to device');
      return false;
    }

    this.measurementCallback = onMeasurement;
    this.onSleepCallback = onSleep || null;
    this.onReconnectCallback = onReconnect || null;

    // Reset last measurement time
    this.lastMeasurementTime = Date.now();

    try {
      if (this.simulatorProfile) {
        this.simulatorHandle = startWorkoutSimulator({
          profile: this.simulatorProfile,
          customConfig: this.simulatorDescriptor?.customConfig,
          onMeasurement: (measurement) => {
            this.lastMeasurementTime = Date.now();
            this.emitStatus('Signal OK');
            if (this.measurementCallback) {
              this.measurementCallback(measurement);
            }
          },
          onDisconnect: () => {
            this.handleConnectionLoss();
          },
          onStatus: (status) => this.emitStatus(status),
        });
        this.startHeartbeatMonitoring();
        return true;
      }

      // Route to protocol-specific monitoring
      if (this.activeProtocol === 'ftms') {
        await this.startFTMSMonitoring();
      } else if (this.activeProtocol === 'yesoul') {
        await this.startYesoulMonitoring();
      } else {
        await this.startCSCMonitoring();
      }

      // Start heartbeat monitoring (check every 2 seconds)
      this.startHeartbeatMonitoring();

      return true;
    } catch (error) {
      log.error('[BLE] Failed to start monitoring:', error);
      return false;
    }
  }

  /**
   * Start CSC protocol monitoring (existing Magene S3+ logic)
   */
  private async startCSCMonitoring(): Promise<void> {
    if (Platform.OS === 'ios') {
      const device = this.device as Device;
      
      const services = await device.services();
      const cscService = services.find(s => uuidMatches(s.uuid, CSC_SERVICE_UUID));
      if (!cscService) {
        throw new Error('CSC Service not found for monitoring');
      }
      
      const characteristics = await cscService.characteristics();
      const measurementChar = characteristics.find((c: any) => uuidMatches(c.uuid, CSC_MEASUREMENT_CHARACTERISTIC_UUID));
      if (!measurementChar) {
        throw new Error('CSC Measurement Characteristic not found for monitoring');
      }
      
      const properties = (measurementChar as any).properties || [];
      const canNotify = properties.includes('notify') || properties.includes('indicate');
      
      if (!canNotify) {
        log.warn('[BLE] iOS: CSC characteristic does not support notifications, attempting anyway');
      }
      
      log.debug('[BLE] iOS: Starting CSC monitoring...');
      this.notificationSubscription = device.monitorCharacteristicForService(
        cscService.uuid,
        measurementChar.uuid,
        (error, characteristic) => {
          if (error) {
            log.error('[BLE] CSC measurement error:', error);
            this.handleConnectionLoss();
            return;
          }

            if (characteristic?.value) {
              const bytes = this.base64ToBytes(characteristic.value);
              if (bytes) {
                this.handleCSCMeasurement(bytes.buffer as ArrayBuffer);
              }
            }
          }
        );

      log.debug('[BLE] CSC monitoring started (iOS)');
    } else {
      const deviceId = this.device as string;
      
      // @ts-expect-error - react-native-ble-manager types are incomplete, getServices exists at runtime
      const services = await BleManager.getServices(deviceId);
      const cscService = services.find((s: any) => uuidMatches(s.uuid, CSC_SERVICE_UUID));
      if (!cscService) {
        throw new Error('CSC Service not found for monitoring');
      }
      
      // @ts-expect-error - react-native-ble-manager types are incomplete, getCharacteristics exists at runtime
      const characteristics = await BleManager.getCharacteristics(deviceId, cscService.uuid);
      const measurementChar = characteristics.find((c: any) => uuidMatches(c.uuid, CSC_MEASUREMENT_CHARACTERISTIC_UUID));
      if (!measurementChar) {
        throw new Error('CSC Measurement Characteristic not found for monitoring');
      }
      
      try {
        await BleManager.startNotification(deviceId, cscService.uuid, measurementChar.uuid);
      } catch (notifError) {
        log.error('[BLE] Android: Failed to start CSC notification:', notifError);
        throw notifError;
      }

      // @ts-expect-error - react-native-ble-manager types are incomplete, addListener exists at runtime
      this.notificationSubscription = BleManager.addListener(
        'BleManagerDidUpdateValueForCharacteristic',
        (data: any) => {
          const isCSCMeasurement = data.characteristic && uuidMatches(data.characteristic, CSC_MEASUREMENT_CHARACTERISTIC_UUID);
          
          if (data.peripheral === deviceId && isCSCMeasurement) {
            if (data.value) {
              const bytes = this.base64ToBytes(data.value);
              if (bytes) {
                this.handleCSCMeasurement(bytes.buffer as ArrayBuffer);
              }
            }
          }
        }
      );

      // @ts-expect-error - react-native-ble-manager types are incomplete, addListener exists at runtime
      BleManager.addListener('BleManagerDisconnectPeripheral', (data: any) => {
        if (data.peripheral === deviceId) {
          log.debug('[BLE] Device disconnected');
          this.handleConnectionLoss();
        }
      });

      log.debug('[BLE] CSC monitoring started (Android)');
    }
  }

  /**
   * Start FTMS protocol monitoring.
   * Subscribes to the appropriate data characteristic based on machine type.
   */
  private async startFTMSMonitoring(): Promise<void> {
    // Determine which FTMS characteristic(s) to monitor based on machine type
    const charUUIDs: string[] = [];
    switch (this.ftmsMachineType) {
      case 'treadmill':
        charUUIDs.push(FTMS_TREADMILL_DATA_CHAR_UUID);
        break;
      case 'elliptical':
        charUUIDs.push(FTMS_CROSS_TRAINER_CHAR_UUID);
        break;
      case 'bike':
      default:
        charUUIDs.push(FTMS_INDOOR_BIKE_CHAR_UUID);
        break;
    }

    log.debug(`[BLE] Starting FTMS monitoring for ${this.ftmsMachineType}, chars: ${charUUIDs.join(', ')}`);

    if (Platform.OS === 'ios') {
      const device = this.device as Device;
      const services = await device.services();
      const ftmsService = services.find(s => uuidMatches(s.uuid, FTMS_SERVICE_UUID));
      if (!ftmsService) {
        throw new Error('FTMS Service not found for monitoring');
      }

      const characteristics = await ftmsService.characteristics();

      for (const targetCharUUID of charUUIDs) {
        const dataChar = characteristics.find(c => uuidMatches(c.uuid, targetCharUUID));
        if (!dataChar) {
          log.warn(`[BLE] FTMS characteristic ${targetCharUUID} not found, skipping`);
          continue;
        }

        log.debug(`[BLE] iOS: Subscribing to FTMS characteristic ${dataChar.uuid}`);
        const sub = device.monitorCharacteristicForService(
          ftmsService.uuid,
          dataChar.uuid,
          (error, characteristic) => {
            if (error) {
              log.error('[BLE] FTMS measurement error:', error);
              this.handleConnectionLoss();
              return;
            }

            if (characteristic?.value) {
              const bytes = this.base64ToBytes(characteristic.value);
              if (bytes) {
                this.handleFTMSMeasurement(bytes.buffer as ArrayBuffer, targetCharUUID);
              }
            }
          }
        );
        this.ftmsNotificationSubscriptions.push(sub);
      }

      // Use the first subscription as the main one (for stopMonitoring compat)
      if (this.ftmsNotificationSubscriptions.length > 0) {
        this.notificationSubscription = this.ftmsNotificationSubscriptions[0];
      }

      log.debug('[BLE] FTMS monitoring started (iOS)');
    } else {
      const deviceId = this.device as string;
      // @ts-expect-error - react-native-ble-manager types are incomplete, getServices exists at runtime
      const services = await BleManager.getServices(deviceId);
      const ftmsService = services.find((s: any) => uuidMatches(s.uuid, FTMS_SERVICE_UUID));
      if (!ftmsService) {
        throw new Error('FTMS Service not found for monitoring');
      }

      // @ts-expect-error - react-native-ble-manager types are incomplete, getCharacteristics exists at runtime
      const characteristics = await BleManager.getCharacteristics(deviceId, ftmsService.uuid);

      for (const targetCharUUID of charUUIDs) {
        const dataChar = characteristics.find((c: any) => uuidMatches(c.uuid, targetCharUUID));
        if (!dataChar) {
          log.warn(`[BLE] FTMS characteristic ${targetCharUUID} not found, skipping`);
          continue;
        }

        try {
          await BleManager.startNotification(deviceId, ftmsService.uuid, dataChar.uuid);
          log.debug(`[BLE] Android: FTMS notification started for ${dataChar.uuid}`);
        } catch (notifError) {
          log.error(`[BLE] Android: Failed to start FTMS notification for ${targetCharUUID}:`, notifError);
        }
      }

      // Listen for FTMS data notifications
      // @ts-expect-error - react-native-ble-manager types are incomplete, addListener exists at runtime
      this.notificationSubscription = BleManager.addListener(
        'BleManagerDidUpdateValueForCharacteristic',
        (data: any) => {
          if (data.peripheral !== deviceId) return;
          if (!data.value || !data.characteristic) return;

          // Determine which FTMS characteristic this data came from
          for (const targetCharUUID of charUUIDs) {
            if (uuidMatches(data.characteristic, targetCharUUID)) {
              const bytes = this.base64ToBytes(data.value);
              if (bytes) {
                this.handleFTMSMeasurement(bytes.buffer as ArrayBuffer, targetCharUUID);
              }
              break;
            }
          }
        }
      );

      // @ts-expect-error - react-native-ble-manager types are incomplete, addListener exists at runtime
      BleManager.addListener('BleManagerDisconnectPeripheral', (data: any) => {
        if (data.peripheral === deviceId) {
          log.debug('[BLE] FTMS device disconnected');
          this.handleConnectionLoss();
        }
      });

      log.debug('[BLE] FTMS monitoring started (Android)');
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  YESOUL PROTOCOL (FFF0 Proprietary)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Parse Yesoul FFF4 notify packet (12 bytes).
   *
   * Packet format:
   *   [0]    0x51      Header
   *   [1]    0x1C      Message type
   *   [2-3]            Sequence counter
   *   [4]    uint8     Resistance (raw 0-78, level = raw / 2.4)
   *   [5]    0x00      Padding
   *   [6]    uint8     RPM (cadence)
   *   [7]    0x00      Padding
   *   [8-9]  uint16 LE Power × 10 (Watts)
   *   [10]             Checksum
   *   [11]   0x00      Padding
   */
  private parseYesoulPacket(bytes: Uint8Array): YesoulRawData | null {
    // Validate packet
    if (bytes.length < 12) return null;
    if (bytes[0] !== 0x51) return null;
    if (bytes[1] !== 0x1C) return null;

    const rpm = bytes[6];
    const resistanceRaw = bytes[4];
    const powerW = ((bytes[9] << 8) | bytes[8]) / 10;

    // Sanity checks
    if (rpm > 200) return null;           // unrealistic RPM
    if (resistanceRaw > 100) return null; // unrealistic resistance
    if (powerW > 2000) return null;       // unrealistic power

    return { rpm, resistanceRaw, powerW };
  }

  /**
   * Handle incoming Yesoul measurement data (called from notification callback).
   */
  private handleYesoulMeasurement(bytes: Uint8Array): void {
    // TEMP DEBUG — raw byte inspection
    const hex = Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0').toUpperCase())
      .join(' ');
    log.debug(`[Yesoul RAW] len=${bytes.length} ${hex}`);
    log.debug(`[Yesoul BYTES] [4]=${bytes[4]} [6]=${bytes[6]} [8]=${bytes[8]} [9]=${bytes[9]}`);

    this.lastMeasurementTime = Date.now();
    this.emitStatus('Signal OK');
    this.syntheticCrankCounter++;

    const raw = this.parseYesoulPacket(bytes);
    if (!raw) {
      log.warn('[BLE] Invalid Yesoul packet, skipping');
      return;
    }

    const measurement = createYesoulMeasurement(
      raw,
      this.syntheticCrankCounter,
    );

    log.debug(
      `[BLE] Yesoul: RPM=${raw.rpm}` +
      ` resistance=${Math.round(raw.resistanceRaw / 2.4)}` +
      ` power=${raw.powerW}W` +
      ` speed=${measurement.speed?.toFixed(1)}km/h`
    );

    if (this.measurementCallback) {
      this.measurementCallback(measurement);
    }
  }

  /**
   * Start Yesoul protocol monitoring.
   * Subscribes to FFF4 notify characteristic for metrics data.
   */
  private async startYesoulMonitoring(): Promise<void> {
    log.debug('[BLE] Starting Yesoul monitoring...');

    if (Platform.OS === 'ios') {
      const device = this.device as Device;
      const services = await device.services();
      const yesoulService = services.find(s => uuidMatches(s.uuid, YESOUL_SERVICE_UUID));
      if (!yesoulService) {
        throw new Error('Yesoul service not found for monitoring');
      }

      const chars = await yesoulService.characteristics();
      const notifyChar = chars.find(c => uuidMatches(c.uuid, YESOUL_NOTIFY_CHAR_UUID));
      if (!notifyChar) {
        throw new Error('Yesoul FFF4 notify characteristic not found');
      }

      log.debug('[BLE] iOS: Subscribing to Yesoul FFF4...');
      this.notificationSubscription = device.monitorCharacteristicForService(
        yesoulService.uuid,
        notifyChar.uuid,
        (error, characteristic) => {
          if (error) {
            log.error('[BLE] Yesoul measurement error:', error);
            this.handleConnectionLoss();
            return;
          }

          if (characteristic?.value) {
            const bytes = this.base64ToBytes(characteristic.value);
            if (bytes) {
              this.handleYesoulMeasurement(bytes);
            }
          }
        }
      );

      log.debug('[BLE] Yesoul monitoring started (iOS)');
    } else {
      // Android
      const deviceId = this.device as string;
      // @ts-expect-error - react-native-ble-manager types are incomplete, getServices exists at runtime
      const services = await BleManager.getServices(deviceId);
      const yesoulService = services.find((s: any) => uuidMatches(s.uuid, YESOUL_SERVICE_UUID));
      if (!yesoulService) {
        throw new Error('Yesoul service not found for monitoring');
      }

      await BleManager.startNotification(
        deviceId,
        yesoulService.uuid,
        YESOUL_NOTIFY_CHAR_UUID,
      );

      // @ts-expect-error - react-native-ble-manager types are incomplete, addListener exists at runtime
      this.notificationSubscription = BleManager.addListener(
        'BleManagerDidUpdateValueForCharacteristic',
        (data: any) => {
          if (data.peripheral !== deviceId) return;
          if (!uuidMatches(data.characteristic, YESOUL_NOTIFY_CHAR_UUID)) return;
          if (!data.value) return;

          const bytes = this.base64ToBytes(data.value);
          if (bytes) {
            this.handleYesoulMeasurement(bytes);
          }
        }
      );

      // @ts-expect-error - react-native-ble-manager types are incomplete, addListener exists at runtime
      BleManager.addListener('BleManagerDisconnectPeripheral', (data: any) => {
        if (data.peripheral === deviceId) {
          log.debug('[BLE] Yesoul device disconnected');
          this.handleConnectionLoss();
        }
      });

      log.debug('[BLE] Yesoul monitoring started (Android)');
    }
  }

  /**
   * Convert base64 string to Uint8Array (shared utility for iOS/Android)
   */
  private base64ToBytes(base64: string): Uint8Array | null {
    try {
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    } catch {
      return null;
    }
  }

  /**
   * Start heartbeat monitoring to detect sensor sleep
   */
  private startHeartbeatMonitoring(): void {
    // Clear existing interval
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Check every 2 seconds
    this.heartbeatInterval = setInterval(() => {
      const timeSinceLastMeasurement = Date.now() - this.lastMeasurementTime;
      
      // Update signal status based on time since last measurement
      if (timeSinceLastMeasurement > 5000) {
        this.emitStatus('Signal Lost');
      } else {
        this.emitStatus('Signal OK');
      }
      
      // If no data for 10 seconds, trigger sleep callback
      if (timeSinceLastMeasurement > 10000 && this.onSleepCallback) {
        log.debug('[BLE] Sensor appears to be asleep (no data for 10+ seconds)');
        this.onSleepCallback();
      }
    }, 2000);
  }

  /**
   * Handle connection loss
   * Preserves device ID for reconnect attempts
   */
  private handleConnectionLoss(): void {
    log.debug('[BLE] Connection loss detected, preserving device ID for reconnect');
    this.isConnected = false;
    // Don't clear device or deviceId - keep them for reconnect
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Reconnect to device
   * If device ID is not available or connection fails, will scan for devices
   */
  async reconnect(): Promise<boolean> {
    try {
      this.emitStatus('Reconnecting...');

      if (this.simulatorProfile) {
        this.isConnected = true;
        if (this.measurementCallback) {
          this.simulatorHandle?.stop();
          this.simulatorHandle = startWorkoutSimulator({
            profile: this.simulatorProfile,
            customConfig: this.simulatorDescriptor?.customConfig,
            onMeasurement: (measurement) => {
              this.lastMeasurementTime = Date.now();
              this.emitStatus('Signal OK');
              if (this.measurementCallback) {
                this.measurementCallback(measurement);
              }
            },
            onDisconnect: () => this.handleConnectionLoss(),
            onStatus: (status) => this.emitStatus(status),
          });
        }
        this.startHeartbeatMonitoring();
        return true;
      }
      
      // Disconnect first if connected
      if (this.isConnected) {
        await this.disconnect();
      }
      
      // Wait a bit for cleanup
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Try to reconnect using stored device ID (prefer deviceId over device)
      const deviceId = this.deviceId || (this.device ? (typeof this.device === 'string' ? this.device : this.device.id) : null);
      
      log.debug('[BLE] Reconnect - deviceId:', this.deviceId, 'device:', this.device ? (typeof this.device === 'string' ? this.device : this.device.id) : null);
      
      if (deviceId) {
        log.debug('[BLE] Attempting to reconnect to device:', deviceId);
        
        try {
          const connected = await this.connectToDeviceById(deviceId);
          
          if (connected && this.onReconnectCallback) {
            // Verify session ownership
            const stillOwnsSession = await this.onReconnectCallback();
            if (!stillOwnsSession) {
              log.debug('[BLE] User no longer owns session, disconnecting');
              await this.disconnect();
              return false;
            }
          }
          
          if (connected) {
            // Restart monitoring
            if (this.measurementCallback) {
              await this.startMonitoring(
                this.measurementCallback,
                this.onSleepCallback || undefined,
                this.onReconnectCallback || undefined
              );
            }
          }
          
          return connected;
        } catch (error) {
          log.debug('[BLE] Direct reconnect failed, will scan for devices:', error);
        }
      }
      
      // If direct reconnect fails or no device ID, scan for devices
      log.debug('[BLE] Scanning for devices to reconnect...');
      this.emitStatus('Scanning for sensor...');
      const devices = await this.scanForDevices(5000);
      
      if (devices.length === 0) {
        throw new Error('No BLE devices found. Please ensure sensor/machine is powered on and discoverable.');
      }
      
      // Connect to strongest signal
      const sortedDevices = devices.sort((a, b) => (b.rssi || -100) - (a.rssi || -100));
      const targetDevice = sortedDevices[0];
      log.debug(`[BLE] Reconnecting to device: ${targetDevice.name || targetDevice.id}`);
      
      const connected = await this.connectToDeviceById(targetDevice.id);
      
      if (connected) {
        // Store device and device ID for future reconnects (use device ID string for both platforms)
        this.device = targetDevice.id;
        this.deviceId = targetDevice.id;
        
        // Restart monitoring
        if (this.measurementCallback) {
          await this.startMonitoring(
            this.measurementCallback,
            this.onSleepCallback || undefined,
            this.onReconnectCallback || undefined
          );
        }
      }
      
      return connected;
    } catch (error) {
      log.error('[BLE] Reconnect error:', error);
      this.emitStatus('Reconnect failed');
      return false;
    }
  }

  /**
   * Stop monitoring (CSC and FTMS)
   */
  async stopMonitoring(): Promise<void> {
    try {
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
      if (this.simulatorHandle) {
        this.simulatorHandle.stop();
        this.simulatorHandle = null;
      }

      if (Platform.OS === 'ios') {
        // Clean up main subscription
        if (this.notificationSubscription) {
          this.notificationSubscription.remove();
          this.notificationSubscription = null;
        }
        // Clean up FTMS subscriptions (iOS uses separate subscription objects)
        for (const sub of this.ftmsNotificationSubscriptions) {
          try { sub.remove(); } catch { /* ignore */ }
        }
        this.ftmsNotificationSubscriptions = [];
      } else {
        if (this.device && this.notificationSubscription) {
          const deviceId = this.device as string;
          try {
            // @ts-expect-error - react-native-ble-manager types are incomplete, getServices exists at runtime
            const services = await BleManager.getServices(deviceId);

            if (this.activeProtocol === 'ftms') {
              // Stop FTMS notifications
              const ftmsService = services.find((s: any) => uuidMatches(s.uuid, FTMS_SERVICE_UUID));
              if (ftmsService) {
                // @ts-expect-error - react-native-ble-manager types are incomplete, getCharacteristics exists at runtime
                const chars = await BleManager.getCharacteristics(deviceId, ftmsService.uuid);
                for (const char of chars) {
                  if (
                    uuidMatches(char.uuid, FTMS_INDOOR_BIKE_CHAR_UUID) ||
                    uuidMatches(char.uuid, FTMS_TREADMILL_DATA_CHAR_UUID) ||
                    uuidMatches(char.uuid, FTMS_CROSS_TRAINER_CHAR_UUID)
                  ) {
                    try {
                      await BleManager.stopNotification(deviceId, ftmsService.uuid, char.uuid);
                    } catch { /* ignore */ }
                  }
                }
              }
            } else if (this.activeProtocol === 'yesoul') {
              // Stop Yesoul notification
              const yesoulService = services.find((s: any) => uuidMatches(s.uuid, YESOUL_SERVICE_UUID));
              if (yesoulService) {
                try {
                  await BleManager.stopNotification(deviceId, yesoulService.uuid, YESOUL_NOTIFY_CHAR_UUID);
                } catch { /* ignore */ }
              }
            } else {
              // Stop CSC notification
              const cscService = services.find((s: any) => uuidMatches(s.uuid, CSC_SERVICE_UUID));
              if (cscService) {
                // @ts-expect-error - react-native-ble-manager types are incomplete, getCharacteristics exists at runtime
                const characteristics = await BleManager.getCharacteristics(deviceId, cscService.uuid);
                const measurementChar = characteristics.find((c: any) => uuidMatches(c.uuid, CSC_MEASUREMENT_CHARACTERISTIC_UUID));
                if (measurementChar) {
                  await BleManager.stopNotification(deviceId, cscService.uuid, measurementChar.uuid);
                }
              }
            }
          } catch (error) {
            log.warn('[BLE] Error stopping notification:', error);
          }
          this.notificationSubscription.remove();
          this.notificationSubscription = null;
        }
      }
    } catch (error) {
      log.error('[BLE] Error stopping monitoring:', error);
    }
    
    this.measurementCallback = null;
    this.onSleepCallback = null;
    this.onReconnectCallback = null;
  }

  /**
   * Handle CSC measurement data for Magene S3+
   * Battery Optimization: 'Dumb' service - only passes raw data, no RPM decay logic
   * All RPM logic (watchdog timer, decay) handled in workout.tsx
   *
   * Magene S3+ Specific:
   * - Flags byte: bit 0 = wheel revolution present, bit 1 = crank revolution present
   * - Cumulative Crank Revolutions: 16-bit LE (bytes 1-2)
   * - Last Crank Event Time: 16-bit LE, 1/1024 seconds (bytes 3-4)
   * - RPM = ((CrankRev_now - CrankRev_prev) × 60) / timeDeltaSeconds
   */
  private handleCSCMeasurement(data: ArrayBuffer): void {
    const view = new DataView(data);
    let offset = 0;

    if (view.byteLength < 1) {
      return; // Invalid data, silently ignore
    }

    // Update last measurement time (for signal indicator)
    this.lastMeasurementTime = Date.now();
    
    // Emit signal status
    this.emitStatus('Signal OK');

    // Flags byte (bit 0 = wheel revolution present, bit 1 = crank revolution present)
    const flags = view.getUint8(offset++);
    const wheelRevolutionPresent = (flags & 0x01) !== 0;
    const crankRevolutionPresent = (flags & 0x02) !== 0;

    let wheelRevolutions = 0;
    let lastWheelEventTime = 0;
    let crankRevolutions = 0;
    let lastCrankEventTime = 0;

    // Parse wheel revolution data (if present)
    if (wheelRevolutionPresent) {
      if (view.byteLength < offset + 6) {
        return; // Invalid data, silently ignore
      }
      // Wheel revolutions (32-bit, little-endian)
      wheelRevolutions = view.getUint32(offset, true);
      offset += 4;
      // Last wheel event time (16-bit, little-endian, 1/1024 seconds)
      lastWheelEventTime = view.getUint16(offset, true);
      offset += 2;
    }

    // Parse crank revolution data (if present) - REQUIRED for Magene S3+ Cadence mode
    if (crankRevolutionPresent) {
      if (view.byteLength < offset + 4) {
        return; // Invalid data, silently ignore
      }
      // Cumulative Crank Revolutions (16-bit, little-endian) - bytes 1-2
      crankRevolutions = view.getUint16(offset, true);
      offset += 2;
      
      // Last Crank Event Time (16-bit, little-endian, 1/1024 seconds) - bytes 3-4
      lastCrankEventTime = view.getUint16(offset, true);
      offset += 2;
      
      // Magene S3+ Stale Data Detection: If same crankRevolutions AND same lastCrankEventTime, ignore (echo packet)
      // BUT: Allow update if more than 100ms passed (timestamp must refresh for watchdog)
      const now = Date.now();
      const timeSinceLastProcessed = now - this.lastProcessedTimestamp;
      
      if (
        this.lastProcessedCrankRevolutions === crankRevolutions &&
        this.lastProcessedCrankEventTime === lastCrankEventTime &&
        this.lastProcessedCrankRevolutions >= 0 &&
        this.lastProcessedCrankEventTime >= 0 &&
        timeSinceLastProcessed < 100 // Only block if less than 100ms passed
      ) {
        // Echo packet detected (same data within 100ms) - ignore silently
        return;
      }
      
      // Update processed values for next check
      this.lastProcessedCrankRevolutions = crankRevolutions;
      this.lastProcessedCrankEventTime = lastCrankEventTime;
      this.lastProcessedTimestamp = now;
    }

    // Calculate RPM using Magene S3+ formula
    // RPM = ((CrankRev_now - CrankRev_prev) × 1024 × 60) / (EventTime_now - EventTime_prev)
    let rpm = 0;

    if (crankRevolutionPresent && this.lastCrankEventTime > 0) {
      // CRITICAL: Handle time wrap-around (16-bit value wraps at 65535)
      // EventTime is in 1/1024 seconds, so max value is 65535/1024 ≈ 64 seconds
      let timeDelta = lastCrankEventTime - this.lastCrankEventTime;
      
      // Check for wrap-around: if delta is negative and large, it's likely wrap-around
      // Also check if delta is suspiciously large (> 60 seconds = 61440 units)
      if (timeDelta < 0) {
        // Negative delta - check if it's wrap-around or stale data
        const wrapAroundDelta = (65535 - this.lastCrankEventTime) + lastCrankEventTime;
        if (wrapAroundDelta < 61440) { // Less than 60 seconds - likely wrap-around
          timeDelta = wrapAroundDelta;
        } else {
          // Stale data - delta too large, ignore
          return;
        }
      } else if (timeDelta > 61440) {
        // Delta too large (> 60 seconds) - likely stale data
        return;
      }

      // Convert to seconds (1/1024 seconds per unit)
      const timeDeltaSeconds = timeDelta / 1024.0;

      // Calculate revolution delta with wrap-around handling
      let revolutionDelta = crankRevolutions - this.lastCrankRevolutions;
      if (revolutionDelta < 0) {
        // Check if it's wrap-around or stale data
        const wrapAroundDelta = (65535 - this.lastCrankRevolutions) + crankRevolutions;
        if (wrapAroundDelta < 1000) { // Reasonable wrap-around (less than 1000 revolutions)
          revolutionDelta = wrapAroundDelta;
        } else {
          // Stale data - ignore
          return;
        }
      }

      // Apply Magene S3+ RPM formula
      if (timeDeltaSeconds > 0 && revolutionDelta > 0) {
        // RPM = ((CrankRev_now - CrankRev_prev) × 1024 × 60) / (EventTime_now - EventTime_prev)
        // Since EventTime is already in 1/1024 seconds, we simplify:
        // RPM = (revolutionDelta × 1024 × 60) / (timeDelta × 1024)
        // RPM = (revolutionDelta × 60) / timeDeltaSeconds
        rpm = (revolutionDelta / timeDeltaSeconds) * 60.0;
        
        // Sanity check: RPM should be between 0 and 200 for cycling
        if (rpm > 200) {
          rpm = 0; // Likely measurement error
        }
        
        // Minimum RPM threshold: If calculated RPM < 5, treat as 0
        if (rpm > 0 && rpm < 5) {
          rpm = 0;
        }
      } else if (timeDeltaSeconds === 0) {
        // Same timestamp, no movement
        rpm = 0;
      }
    }

    // Update last values
    this.lastWheelRevolutions = wheelRevolutions;
    this.lastCrankRevolutions = crankRevolutions;
    this.lastWheelEventTime = lastWheelEventTime;
    this.lastCrankEventTime = lastCrankEventTime;

    // Precision Fix: Use raw float RPM value (not rounded) for smooth transitions
    const rawRPM = rpm;

    const measurement = createCSCMeasurement({
      wheelRevolutions,
      lastWheelEventTime,
      crankRevolutions,
      lastCrankEventTime,
      rpm: rawRPM,
    });

    // Debug: Temporary log to diagnose stuck RPM issue
    log.debug('[BLE] CSC measurement, RPM:', measurement.rpm, 'Callback:', !!this.measurementCallback);
    
    if (this.measurementCallback) {
      this.measurementCallback(measurement);
    } else {
      log.warn('[BLE] measurementCallback is null!');
    }
  }

  /**
   * Handle FTMS measurement data.
   * Routes to the appropriate parser based on characteristic UUID,
   * then wraps parsed data into a BLEMeasurement via createFTMSMeasurement().
   */
  private handleFTMSMeasurement(data: ArrayBuffer, charUUID: string): void {
    // Update last measurement time
    this.lastMeasurementTime = Date.now();
    this.emitStatus('Signal OK');

    // Increment synthetic crank counter for CSC backward compat
    this.syntheticCrankCounter++;

    let rpm = 0;
    let speed: number | null = null;
    let power: number | null = null;
    let distance: number | null = null;
    let incline: number | null = null;
    let calories: number | null = null;
    let heartRate: number | null = null;
    let resistance: number | null = null;
    let steps: number | null = null;
    let elapsedTime: number | null = null;

    if (uuidMatches(charUUID, FTMS_INDOOR_BIKE_CHAR_UUID)) {
      const bikeData = parseIndoorBikeData(data);
      if (!bikeData) return;
      rpm = bikeData.cadence;
      speed = bikeData.speed;
      power = bikeData.power;
      distance = bikeData.distance;
      resistance = bikeData.resistance;
      calories = bikeData.totalEnergy;
      heartRate = bikeData.heartRate;
      elapsedTime = bikeData.elapsedTime;
    } else if (uuidMatches(charUUID, FTMS_TREADMILL_DATA_CHAR_UUID)) {
      const treadmillData = parseTreadmillData(data);
      if (!treadmillData) return;
      // Treadmills don't have cadence — estimate steps/min from speed
      rpm = estimateStepsPerMinuteFromSpeed(treadmillData.speed);
      speed = treadmillData.speed;
      power = treadmillData.power;
      distance = treadmillData.distance;
      incline = treadmillData.incline;
      calories = treadmillData.totalEnergy;
      heartRate = treadmillData.heartRate;
      elapsedTime = treadmillData.elapsedTime;
    } else if (uuidMatches(charUUID, FTMS_CROSS_TRAINER_CHAR_UUID)) {
      const crossTrainerData = parseCrossTrainerData(data);
      if (!crossTrainerData) return;
      // Cross trainers may report step count instead of cadence
      rpm = crossTrainerData.stepCount ?? 0;
      speed = crossTrainerData.speed;
      power = crossTrainerData.power;
      distance = crossTrainerData.distance;
      incline = crossTrainerData.incline;
      resistance = crossTrainerData.resistance;
      calories = crossTrainerData.totalEnergy;
      heartRate = crossTrainerData.heartRate;
      elapsedTime = crossTrainerData.elapsedTime;
    } else {
      log.warn(`[BLE] Unknown FTMS characteristic: ${charUUID}`);
      return;
    }

    // Sanity checks
    if (rpm > 300) rpm = 0;  // FTMS max reasonable RPM
    if (rpm < 0) rpm = 0;

    const measurement = createFTMSMeasurement(
      { rpm, speed, power, distance, incline, calories, heartRate, resistance, steps, elapsedTime },
      this.syntheticCrankCounter,
    );

    if (this.measurementCallback) {
      this.measurementCallback(measurement);
    }
  }

  /**
   * Disconnect from device
   */
  async disconnect(): Promise<void> {
    try {
      await this.stopMonitoring();

      if (Platform.OS === 'ios') {
        if (this.device) {
          const device = this.device as Device;
          await device.cancelConnection();
        }
      } else {
        if (this.device) {
          await BleManager.disconnect(this.device as string);
        }
      }

      this.isConnected = false;
      this.device = null;
      this.deviceId = null;
      this.activeProtocol = 'csc'; // Reset to default
      this.syntheticCrankCounter = 0;
      this.ftmsNotificationSubscriptions = [];
      this.simulatorProfile = null;
      this.simulatorDescriptor = null;
      this.simulatorHandle = null;
      
      log.debug('[BLE] Disconnected from device');
    } catch (error) {
      log.error('[BLE] Disconnect error:', error);
    }
  }

  /**
   * Check if connected
   */
  getConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Get last measurement time (for auto-pause detection)
   */
  getLastMeasurementTime(): number {
    return this.lastMeasurementTime;
  }
}

// Singleton instance
export const bleService = new BLEService();
