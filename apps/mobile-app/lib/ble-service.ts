/**
 * BLE Service for Magene S3+ Sensor
 * Cycling Speed and Cadence Service (0x1816)
 * 
 * Supports both iOS (react-native-ble-plx) and Android (react-native-ble-manager)
 * 
 * Magene S3+ Specific:
 * - Service UUID: 0x1816 (Cycling Speed and Cadence)
 * - Characteristic UUID: 0x2A5B (CSC Measurement)
 * - Cadence Mode: Sensor must be in Cadence mode (red light) for proper readings
 * - RPM Formula: RPM = ((CrankRev_now - CrankRev_prev) × 1024 × 60) / (EventTime_now - EventTime_prev)
 */

import { Platform } from 'react-native';
import BleManager from 'react-native-ble-manager';
import { BleManager as BleManagerIOS, Device, Characteristic } from 'react-native-ble-plx';

// BLE Service UUIDs
const CSC_SERVICE_UUID = '1816'; // Cycling Speed and Cadence (Cadence mode)
const CSC_SPEED_SERVICE_UUID = '1818'; // Cycling Speed and Cadence (Speed mode)
const CSC_MEASUREMENT_CHARACTERISTIC_UUID = '2A5B'; // CSC Measurement
const CSC_FEATURE_CHARACTERISTIC_UUID = '2A5C'; // CSC Feature

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

export interface CSCMeasurement {
  wheelRevolutions: number;
  lastWheelEventTime: number; // 1/1024 seconds
  crankRevolutions: number;
  lastCrankEventTime: number; // 1/1024 seconds
  rpm: number; // Calculated RPM using Magene S3+ formula
  timestamp: number;
}

export class BLEService {
  private device: Device | string | null = null; // Device for iOS, device ID string for Android
  private isConnected: boolean = false;
  private measurementCallback: ((measurement: CSCMeasurement) => void) | null = null;
  private lastWheelRevolutions: number = 0;
  private lastCrankRevolutions: number = 0;
  private lastWheelEventTime: number = 0;
  private lastCrankEventTime: number = 0;
  private lastMeasurementTime: number = 0;
  private bleManagerIOS: BleManagerIOS | null = null;
  private notificationSubscription: any = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private onSleepCallback: (() => void) | null = null;
  private onReconnectCallback: (() => Promise<boolean>) | null = null;
  private onStatusCallback: ((status: string) => void) | null = null; // UI status callback
  // Stale Data Filter: Track last processed crankEventTime to detect duplicates
  private lastProcessedCrankEventTime: number = 0;
  private lastCrankEventTimeChange: number = 0; // Timestamp when lastCrankEventTime changed

  constructor() {
    if (Platform.OS === 'ios') {
      this.bleManagerIOS = new BleManagerIOS();
    } else {
      // Initialize Android BLE Manager
      BleManager.start({ showAlert: false }).then(() => {
        console.log('[BLE] Android BLE Manager initialized');
      }).catch((error) => {
        console.error('[BLE] Failed to initialize BLE Manager:', error);
      });
    }
  }

  /**
   * Scan for BLE devices with Cycling Speed and Cadence service
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
        
        // Start device scan for both Cadence (0x1816) and Speed (0x1818) modes
        this.bleManagerIOS!.startDeviceScan([CSC_SERVICE_UUID, CSC_SPEED_SERVICE_UUID], null, (error, device) => {
          if (error) {
            console.error('[BLE] Scan error:', error);
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
            console.log(`[BLE] Found CSC device: ${device.name || device.id}`);
          }
        });

        // Stop scanning after timeout
        scanTimeout = setTimeout(() => {
          this.bleManagerIOS?.stopDeviceScan();
          console.log(`[BLE] Scan complete, found ${devices.length} device(s)`);
          resolve(devices);
        }, timeout);
      });
    } else {
      // Android scanning
      return new Promise((resolve, reject) => {
        const devices: BLEDevice[] = [];
        const deviceMap = new Map<string, BLEDevice>(); // Use Map to avoid duplicates
        
        // Scan for both Cadence (0x1816) and Speed (0x1818) modes
        BleManager.scan([CSC_SERVICE_UUID, CSC_SPEED_SERVICE_UUID], timeout / 1000, false).then(() => {
          console.log('[BLE] Scan started');
        }).catch((error) => {
          reject(error);
        });

        // Listen for discovered devices
        const subscription = BleManager.addListener('BleManagerDiscoverPeripheral', (peripheral) => {
          if (!deviceMap.has(peripheral.id)) {
            const bleDevice: BLEDevice = {
              id: peripheral.id,
              name: peripheral.name || null,
              rssi: peripheral.rssi || null,
            };
            deviceMap.set(peripheral.id, bleDevice);
            devices.push(bleDevice);
            console.log(`[BLE] Found CSC device: ${peripheral.name || peripheral.id}`);
          }
        });

        // Stop scanning and return results after timeout
        setTimeout(() => {
          BleManager.stopScan().catch(err => console.error('[BLE] Error stopping scan:', err));
          subscription.remove();
          console.log(`[BLE] Scan complete, found ${devices.length} device(s)`);
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
   * Emit status update
   */
  private emitStatus(status: string): void {
    if (this.onStatusCallback) {
      this.onStatusCallback(status);
    }
    console.log(`[BLE Status] ${status}`);
  }

  /**
   * Connect to a specific BLE device by sensor ID
   * If sensorId is a base64 string (from Web Bluetooth), we'll scan and match by device name
   */
  async connectToDevice(sensorId: string): Promise<boolean> {
    try {
      console.log(`[BLE] Connecting to Magene S3+ sensor: ${sensorId}`);
      this.emitStatus('Initializing connection...');

      // Check if sensorId is a base64 string (from Web Bluetooth API)
      const isBase64 = /^[A-Za-z0-9+/=]+$/.test(sensorId) && sensorId.length > 20;
      
      if (isBase64) {
        console.log('[BLE] Sensor ID appears to be base64, scanning for devices by name...');
        this.emitStatus('Scanning for devices...');
        
        // Try to convert base64 to hex first
        const hexId = this.base64ToHex(sensorId);
        if (hexId) {
          console.log('[BLE] Converted base64 to hex:', hexId);
        }
        
        // Scan for devices and match by device name (most reliable)
        console.log('[BLE] Scanning for CSC devices (5 second timeout)...');
        const devices = await this.scanForDevices(5000);
        
        if (devices.length === 0) {
          throw new Error('No CSC devices found. Please ensure sensor is powered on and in Cadence mode (red light).');
        }
        
        // Sort by RSSI (strongest signal first)
        const sortedDevices = devices.sort((a, b) => (b.rssi || -100) - (a.rssi || -100));
        
        // Try to connect to the first available device (strongest signal)
        // Device name is more reliable than ID for matching
        const targetDevice = sortedDevices[0];
        console.log(`[BLE] Found ${devices.length} CSC device(s):`);
        devices.forEach((d, idx) => {
          console.log(`  [${idx + 1}] Name: ${d.name || 'Unknown'}, ID: ${d.id}, RSSI: ${d.rssi}`);
        });
        
        const deviceDisplayName = targetDevice.name || targetDevice.id;
        console.log(`[BLE] Connecting to device: ${deviceDisplayName} (ID: ${targetDevice.id}, RSSI: ${targetDevice.rssi})`);
        this.emitStatus(`Found device: ${deviceDisplayName}`);
        
        // Use the actual device ID from scan (not the base64 sensor_id)
        // Device name is logged for reference, but we use ID for connection
        return await this.connectToDeviceById(targetDevice.id);
      }

      // If not base64, try direct connection
      this.emitStatus('Connecting to device...');
      return await this.connectToDeviceById(sensorId);
    } catch (error: any) {
      console.error('[BLE] Connection error:', error);
      this.isConnected = false;
      this.device = null;
      this.emitStatus('Connection failed');
      throw error; // Re-throw to allow caller to handle cleanup
    }
  }

  /**
   * Internal method to connect to device by actual BLE ID
   */
  private async connectToDeviceById(deviceId: string): Promise<boolean> {
    try {
      console.log(`[BLE] Connecting to device ID: ${deviceId}`);
      this.emitStatus('Connecting...');

      if (Platform.OS === 'ios') {
        if (!this.bleManagerIOS) {
          throw new Error('BLE Manager not initialized');
        }

        // Connect to device
        console.log('[BLE] iOS: Connecting to device...');
        this.emitStatus('Establishing connection...');
        const device = await this.bleManagerIOS.connectToDevice(deviceId);
        console.log('[BLE] iOS: Discovering services and characteristics...');
        this.emitStatus('Discovering services...');
        await device.discoverAllServicesAndCharacteristics();

        // Get ALL services and log them
        const services = await device.services();
        console.log(`[BLE] Found ${services.length} service(s):`);
        services.forEach((service, index) => {
          console.log(`  [${index + 1}] Service UUID: ${service.uuid} (normalized: ${normalizeUUID(service.uuid)})`);
        });

        // Try to find CSC Service (Cadence mode - 0x1816)
        // Use normalized UUID comparison to handle both 128-bit and 16-bit formats
        let cscService = services.find(s => {
          return uuidMatches(s.uuid, CSC_SERVICE_UUID);
        });

        // If not found, try Speed mode (0x1818)
        if (!cscService) {
          console.log('[BLE] CSC Service (0x1816) not found, checking for Speed mode (0x1818)...');
          cscService = services.find(s => {
            return uuidMatches(s.uuid, CSC_SPEED_SERVICE_UUID);
          });

          if (cscService) {
            const errorMsg = 'Senzor je u SPEED modu (zelena lampica). Molimo vas resetujte bateriju da prebacite u CADENCE mod (crvena lampica).';
            console.error(`[BLE] ${errorMsg}`);
            this.emitStatus('Wrong mode detected');
            throw new Error(errorMsg);
          }
        }

        if (!cscService) {
          // Log all service UUIDs for debugging
          const serviceUuids = services.map(s => s.uuid).join(', ');
          throw new Error(`CSC Service (0x1816 or 0x1818) not found. Available services: ${serviceUuids}. Ensure sensor is in Cadence mode (red light).`);
        }

        console.log(`[BLE] Found CSC Service: ${cscService.uuid} (normalized: ${normalizeUUID(cscService.uuid)})`);
        this.emitStatus('Found CSC service');

        // Get ALL characteristics and log them
        const characteristics = await cscService.characteristics();
        console.log(`[BLE] Found ${characteristics.length} characteristic(s) in CSC service:`);
        characteristics.forEach((char, index) => {
          console.log(`  [${index + 1}] Characteristic UUID: ${char.uuid} (normalized: ${normalizeUUID(char.uuid)})`);
        });

        // Get CSC Measurement Characteristic
        // Use normalized UUID comparison to handle both 128-bit and 16-bit formats
        const measurementChar = characteristics.find(c => {
          return uuidMatches(c.uuid, CSC_MEASUREMENT_CHARACTERISTIC_UUID);
        });

        if (!measurementChar) {
          const charUuids = characteristics.map(c => c.uuid).join(', ');
          throw new Error(`CSC Measurement Characteristic (0x2A5B) not found. Available characteristics: ${charUuids}`);
        }

        console.log(`[BLE] Found CSC Measurement Characteristic: ${measurementChar.uuid} (normalized: ${normalizeUUID(measurementChar.uuid)})`);
        
        // Check if characteristic supports notifications
        // For iOS, check properties; for Android, we'll check in startNotification
        const properties = measurementChar.properties || [];
        const canNotify = properties.includes('notify') || properties.includes('indicate');
        console.log(`[BLE] Characteristic properties: ${properties.join(', ')}, canNotify: ${canNotify}`);
        
        if (!canNotify) {
          console.warn('[BLE] Characteristic does not support notifications, but will attempt anyway');
        }
        
        this.emitStatus('Ready to monitor');

        this.device = device;
        this.isConnected = true;

        console.log('[BLE] Connected to Magene S3+ successfully (iOS)');
        return true;
      } else {
        // Android connection
        console.log('[BLE] Android: Connecting to device...');
        this.emitStatus('Establishing connection...');
        await BleManager.connect(deviceId);
        console.log('[BLE] Android: Retrieving services...');
        this.emitStatus('Discovering services...');
        await BleManager.retrieveServices(deviceId);

        // Get ALL services and log them
        console.log('[BLE] Android: Getting services...');
        const services = await BleManager.getServices(deviceId);
        console.log(`[BLE] Found ${services.length} service(s):`);
        services.forEach((service, index) => {
          console.log(`  [${index + 1}] Service UUID: ${service.uuid} (normalized: ${normalizeUUID(service.uuid)})`);
        });

        // Try to find CSC Service (Cadence mode - 0x1816)
        // Use normalized UUID comparison to handle both 128-bit and 16-bit formats
        let cscService = services.find(s => {
          return uuidMatches(s.uuid, CSC_SERVICE_UUID);
        });

        // If not found, try Speed mode (0x1818)
        if (!cscService) {
          console.log('[BLE] CSC Service (0x1816) not found, checking for Speed mode (0x1818)...');
          cscService = services.find(s => {
            return uuidMatches(s.uuid, CSC_SPEED_SERVICE_UUID);
          });

          if (cscService) {
            const errorMsg = 'Senzor je u SPEED modu (zelena lampica). Molimo vas resetujte bateriju da prebacite u CADENCE mod (crvena lampica).';
            console.error(`[BLE] ${errorMsg}`);
            this.emitStatus('Wrong mode detected');
            throw new Error(errorMsg);
          }
        }

        if (!cscService) {
          // Log all service UUIDs for debugging
          const serviceUuids = services.map(s => s.uuid).join(', ');
          throw new Error(`CSC Service (0x1816 or 0x1818) not found. Available services: ${serviceUuids}. Ensure sensor is in Cadence mode (red light).`);
        }

        console.log(`[BLE] Found CSC Service: ${cscService.uuid}`);
        this.emitStatus('Found CSC service');

        // Get ALL characteristics and log them
        console.log('[BLE] Android: Getting characteristics...');
        const characteristics = await BleManager.getCharacteristics(deviceId, cscService.uuid);
        console.log(`[BLE] Found ${characteristics.length} characteristic(s) in CSC service:`);
        characteristics.forEach((char, index) => {
          console.log(`  [${index + 1}] Characteristic UUID: ${char.uuid}`);
        });

        // Get CSC Measurement Characteristic
        // Use normalized UUID comparison to handle both 128-bit and 16-bit formats
        const measurementChar = characteristics.find(c => {
          return uuidMatches(c.uuid, CSC_MEASUREMENT_CHARACTERISTIC_UUID);
        });

        if (!measurementChar) {
          const charUuids = characteristics.map(c => c.uuid).join(', ');
          throw new Error(`CSC Measurement Characteristic (0x2A5B) not found. Available characteristics: ${charUuids}`);
        }

        console.log(`[BLE] Found CSC Measurement Characteristic: ${measurementChar.uuid} (normalized: ${normalizeUUID(measurementChar.uuid)})`);
        
        // Check if characteristic supports notifications
        // For Android, check properties array
        const properties = measurementChar.properties || [];
        const canNotify = properties.includes('notify') || properties.includes('indicate');
        console.log(`[BLE] Characteristic properties: ${properties.join(', ')}, canNotify: ${canNotify}`);
        
        this.device = deviceId;
        this.isConnected = true;

        // Start notification immediately after connection if characteristic supports it (Android)
        if (canNotify) {
          console.log('[BLE] Android: Starting notification immediately after connection...');
          try {
            await BleManager.startNotification(deviceId, cscService.uuid, measurementChar.uuid);
            console.log('[BLE] Android: Notification started successfully');
          } catch (notifError) {
            console.warn('[BLE] Android: Could not start notification immediately, will start in startMonitoring:', notifError);
          }
        } else {
          console.warn('[BLE] Android: Characteristic does not support notifications, will attempt in startMonitoring');
        }

        console.log('[BLE] Connected to Magene S3+ successfully (Android)');
        return true;
      }
    } catch (error: any) {
      console.error('[BLE] Connection error in connectToDeviceById:', error);
      this.isConnected = false;
      this.device = null;
      throw error; // Re-throw to allow caller to handle cleanup
    }
  }

  /**
   * Start monitoring CSC measurements with heartbeat detection
   */
  async startMonitoring(
    onMeasurement: (measurement: CSCMeasurement) => void,
    onSleep?: () => void,
    onReconnect?: () => Promise<boolean>
  ): Promise<boolean> {
    if (!this.isConnected || !this.device) {
      console.error('[BLE] Not connected to device');
      return false;
    }

    this.measurementCallback = onMeasurement;
    this.onSleepCallback = onSleep || null;
    this.onReconnectCallback = onReconnect || null;

    // Reset last measurement time
    this.lastMeasurementTime = Date.now();

    try {
      if (Platform.OS === 'ios') {
        const device = this.device as Device;
        
        // Monitor characteristic
        // Use actual service UUID from device (normalized) instead of constant
        const services = await device.services();
        const cscService = services.find(s => uuidMatches(s.uuid, CSC_SERVICE_UUID));
        if (!cscService) {
          throw new Error('CSC Service not found for monitoring');
        }
        
        const characteristics = await cscService.characteristics();
        const measurementChar = characteristics.find(c => uuidMatches(c.uuid, CSC_MEASUREMENT_CHARACTERISTIC_UUID));
        if (!measurementChar) {
          throw new Error('CSC Measurement Characteristic not found for monitoring');
        }
        
        // Check if characteristic supports notifications
        const properties = measurementChar.properties || [];
        const canNotify = properties.includes('notify') || properties.includes('indicate');
        console.log(`[BLE] iOS: Characteristic properties: ${properties.join(', ')}, canNotify: ${canNotify}`);
        
        if (!canNotify) {
          console.warn('[BLE] iOS: Characteristic does not support notifications, but will attempt anyway');
        }
        
        console.log('[BLE] iOS: Starting characteristic monitoring...');
        this.notificationSubscription = device.monitorCharacteristicForService(
          cscService.uuid,
          measurementChar.uuid,
          (error, characteristic) => {
            if (error) {
              console.error('[BLE] Measurement error:', error);
              this.handleConnectionLoss();
              return;
            }

            if (characteristic?.value) {
              // Parse base64 value
              const base64Value = characteristic.value;
              const binaryString = atob(base64Value);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              
              // Advanced debug: Log all bytes as array
              const byteArray = Array.from(bytes);
              console.log(`[BLE] iOS: Raw bytes received: [${byteArray.join(', ')}]`);
              console.log(`[BLE] iOS: Byte count: ${byteArray.length}`);
              
              this.handleMeasurement(bytes.buffer);
            }
          }
        );

        console.log('[BLE] Monitoring started (iOS)');
      } else {
        const deviceId = this.device as string;
        
        // Start notifications - MUST wait for connection to complete
        // Get actual service and characteristic UUIDs from device
        const services = await BleManager.getServices(deviceId);
        const cscService = services.find(s => uuidMatches(s.uuid, CSC_SERVICE_UUID));
        if (!cscService) {
          throw new Error('CSC Service not found for monitoring');
        }
        
        const characteristics = await BleManager.getCharacteristics(deviceId, cscService.uuid);
        const measurementChar = characteristics.find(c => uuidMatches(c.uuid, CSC_MEASUREMENT_CHARACTERISTIC_UUID));
        if (!measurementChar) {
          throw new Error('CSC Measurement Characteristic not found for monitoring');
        }
        
        // Check if characteristic supports notifications
        const properties = measurementChar.properties || [];
        const canNotify = properties.includes('notify') || properties.includes('indicate');
        console.log(`[BLE] Android: Characteristic properties: ${properties.join(', ')}, canNotify: ${canNotify}`);
        
        if (!canNotify) {
          console.warn('[BLE] Android: Characteristic does not support notifications, but will attempt anyway');
        }
        
        // Focus exclusively on Service 0x1816 and Characteristic 0x2A5B
        console.log(`[BLE] Android: Starting notifications for Service ${cscService.uuid}, Characteristic ${measurementChar.uuid}...`);
        try {
          await BleManager.startNotification(deviceId, cscService.uuid, measurementChar.uuid);
          console.log('[BLE] Android: Notification started successfully');
        } catch (notifError) {
          console.error('[BLE] Android: Failed to start notification:', notifError);
          throw notifError;
        }

        // Listen for notifications
        this.notificationSubscription = BleManager.addListener(
          'BleManagerDidUpdateValueForCharacteristic',
          (data) => {
            // Check if this is the CSC Measurement characteristic
            // Use normalized UUID comparison to handle both 128-bit and 16-bit formats
            const isCSCMeasurement = data.characteristic && uuidMatches(data.characteristic, CSC_MEASUREMENT_CHARACTERISTIC_UUID);
            
            if (data.peripheral === deviceId && isCSCMeasurement) {
              if (data.value) {
                // Parse base64 value
                const binaryString = atob(data.value);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                
                // Advanced debug: Log all bytes as array
                const byteArray = Array.from(bytes);
                console.log(`[BLE] Android: Raw bytes received: [${byteArray.join(', ')}]`);
                console.log(`[BLE] Android: Byte count: ${byteArray.length}`);
                console.log(`[BLE] Android: Characteristic UUID: ${data.characteristic}`);
                
                this.handleMeasurement(bytes.buffer);
              }
            }
          }
        );

        // Listen for disconnection
        BleManager.addListener('BleManagerDisconnectPeripheral', (data) => {
          if (data.peripheral === deviceId) {
            console.log('[BLE] Device disconnected');
            this.handleConnectionLoss();
          }
        });

        console.log('[BLE] Monitoring started (Android)');
      }

      // Start heartbeat monitoring (check every 2 seconds)
      this.startHeartbeatMonitoring();

      return true;
    } catch (error) {
      console.error('[BLE] Failed to start monitoring:', error);
      return false;
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
        console.log('[BLE] Sensor appears to be asleep (no data for 10+ seconds)');
        this.onSleepCallback();
      }
    }, 2000);
  }

  /**
   * Handle connection loss
   */
  private handleConnectionLoss(): void {
    this.isConnected = false;
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
      
      // Disconnect first if connected
      if (this.isConnected) {
        await this.disconnect();
      }
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Try to reconnect using stored device ID
      if (this.device) {
        const deviceId = typeof this.device === 'string' ? this.device : this.device.id;
        console.log('[BLE] Attempting to reconnect to device:', deviceId);
        
        try {
          const connected = await this.connectToDeviceById(deviceId);
          
          if (connected && this.onReconnectCallback) {
            // Verify session ownership
            const stillOwnsSession = await this.onReconnectCallback();
            if (!stillOwnsSession) {
              console.log('[BLE] User no longer owns session, disconnecting');
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
          console.log('[BLE] Direct reconnect failed, will scan for devices:', error);
        }
      }
      
      // If direct reconnect fails or no device ID, scan for devices
      console.log('[BLE] Scanning for devices to reconnect...');
      this.emitStatus('Scanning for sensor...');
      const devices = await this.scanForDevices(5000);
      
      if (devices.length === 0) {
        throw new Error('No CSC devices found. Please ensure sensor is powered on and in Cadence mode (red light).');
      }
      
      // Connect to strongest signal
      const sortedDevices = devices.sort((a, b) => (b.rssi || -100) - (a.rssi || -100));
      const targetDevice = sortedDevices[0];
      console.log(`[BLE] Reconnecting to device: ${targetDevice.name || targetDevice.id}`);
      
      const connected = await this.connectToDeviceById(targetDevice.id);
      
      if (connected) {
        // Store device for future reconnects (use device ID string for both platforms)
        this.device = targetDevice.id;
        
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
      console.error('[BLE] Reconnect error:', error);
      this.emitStatus('Reconnect failed');
      return false;
    }
  }

  /**
   * Stop monitoring
   */
  async stopMonitoring(): Promise<void> {
    try {
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }

      if (Platform.OS === 'ios') {
        if (this.notificationSubscription) {
          this.notificationSubscription.remove();
          this.notificationSubscription = null;
        }
      } else {
        if (this.device && this.notificationSubscription) {
          const deviceId = this.device as string;
          try {
            // Get actual service and characteristic UUIDs for stopping notification
            const services = await BleManager.getServices(deviceId);
            const cscService = services.find(s => uuidMatches(s.uuid, CSC_SERVICE_UUID));
            if (cscService) {
              const characteristics = await BleManager.getCharacteristics(deviceId, cscService.uuid);
              const measurementChar = characteristics.find(c => uuidMatches(c.uuid, CSC_MEASUREMENT_CHARACTERISTIC_UUID));
              if (measurementChar) {
                await BleManager.stopNotification(deviceId, cscService.uuid, measurementChar.uuid);
              }
            }
          } catch (error) {
            console.warn('[BLE] Error stopping notification:', error);
          }
          this.notificationSubscription.remove();
          this.notificationSubscription = null;
        }
      }
    } catch (error) {
      console.error('[BLE] Error stopping monitoring:', error);
    }
    
    this.measurementCallback = null;
    this.onSleepCallback = null;
    this.onReconnectCallback = null;
  }

  /**
   * Handle CSC measurement data for Magene S3+
   * Parses binary data according to Bluetooth CSC specification
   * 
   * Magene S3+ Specific:
   * - Flags byte: bit 0 = wheel revolution present, bit 1 = crank revolution present
   * - In Cadence mode (red light), bit 1 should be set
   * - Cumulative Crank Revolutions: 16-bit little-endian (bytes 1-2)
   * - Last Crank Event Time: 16-bit little-endian, 1/1024 seconds (bytes 3-4)
   * - RPM Formula: RPM = ((CrankRev_now - CrankRev_prev) × 1024 × 60) / (EventTime_now - EventTime_prev)
   */
  private handleMeasurement(data: ArrayBuffer): void {
    const view = new DataView(data);
    let offset = 0;

    // Convert to byte array for detailed logging
    const byteArray = new Uint8Array(data);
    console.log(`[BLE] Processing measurement - Raw bytes: [${Array.from(byteArray).join(', ')}]`);
    console.log(`[BLE] Byte length: ${view.byteLength}`);

    if (view.byteLength < 1) {
      console.warn('[BLE] Invalid measurement data: too short');
      return;
    }

    // Update last measurement time (for signal indicator)
    this.lastMeasurementTime = Date.now();
    
    // Emit signal status
    this.emitStatus('Signal OK');

    // Flags byte (bit 0 = wheel revolution present, bit 1 = crank revolution present)
    const flags = view.getUint8(offset++);
    const wheelRevolutionPresent = (flags & 0x01) !== 0;
    const crankRevolutionPresent = (flags & 0x02) !== 0;

    // For Magene S3+ in Cadence mode, crank revolution should be present
    if (!crankRevolutionPresent) {
      console.warn('[BLE] Crank revolution not present. Ensure sensor is in Cadence mode (red light).');
    }

    let wheelRevolutions = 0;
    let lastWheelEventTime = 0;
    let crankRevolutions = 0;
    let lastCrankEventTime = 0;

    // Parse wheel revolution data (if present)
    if (wheelRevolutionPresent) {
      if (view.byteLength < offset + 6) {
        console.warn('[BLE] Invalid measurement data: missing wheel data');
        return;
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
        console.warn('[BLE] Invalid measurement data: missing crank data');
        return;
      }
      // Cumulative Crank Revolutions (16-bit, little-endian) - bytes 1-2
      const crankRevBytes = [view.getUint8(offset), view.getUint8(offset + 1)];
      crankRevolutions = view.getUint16(offset, true);
      offset += 2;
      console.log(`[BLE] Crank Revolutions bytes [${crankRevBytes.join(', ')}] = ${crankRevolutions}`);
      
      // Last Crank Event Time (16-bit, little-endian, 1/1024 seconds) - bytes 3-4
      const eventTimeBytes = [view.getUint8(offset), view.getUint8(offset + 1)];
      lastCrankEventTime = view.getUint16(offset, true);
      offset += 2;
      console.log(`[BLE] Last Crank Event Time bytes [${eventTimeBytes.join(', ')}] = ${lastCrankEventTime} (${(lastCrankEventTime / 1024).toFixed(3)}s)`);
      
      // Stale Data Filter: Check if lastCrankEventTime is identical to previous (duplicate data)
      if (this.lastProcessedCrankEventTime === lastCrankEventTime && this.lastProcessedCrankEventTime > 0) {
        // Duplicate data detected - sensor is sending same measurement
        console.log(`[BLE] Duplicate data detected: lastCrankEventTime unchanged (${lastCrankEventTime}). Setting RPM to 0.`);
        
        // Emit signal status only (to keep connection alive), but set RPM to 0
        this.emitStatus('Signal OK');
        
        // Create measurement with RPM = 0 to indicate no movement
        const staleMeasurement: CSCMeasurement = {
          wheelRevolutions,
          lastWheelEventTime,
          crankRevolutions,
          lastCrankEventTime,
          rpm: 0, // Force RPM to 0 for duplicate data
          timestamp: Date.now(),
        };
        
        // Emit measurement with RPM = 0
        if (this.measurementCallback) {
          this.measurementCallback(staleMeasurement);
        }
        
        // Don't update lastProcessedCrankEventTime - keep it the same to continue detecting duplicates
        return; // Exit early, don't process further
      }
      
      // New data detected - update tracking
      this.lastProcessedCrankEventTime = lastCrankEventTime;
      this.lastCrankEventTimeChange = Date.now();
    }

    // Calculate RPM using Magene S3+ formula
    // RPM = ((CrankRev_now - CrankRev_prev) × 1024 × 60) / (EventTime_now - EventTime_prev)
    let rpm = 0;

    if (crankRevolutionPresent && this.lastCrankEventTime > 0) {
      // Handle time wrap-around (16-bit value wraps at 65535)
      let timeDelta = lastCrankEventTime - this.lastCrankEventTime;
      if (timeDelta < 0) {
        // Wrap-around occurred
        timeDelta = (65535 - this.lastCrankEventTime) + lastCrankEventTime;
      }

      // Convert to seconds (1/1024 seconds per unit)
      const timeDeltaSeconds = timeDelta / 1024.0;

      // Calculate revolution delta
      let revolutionDelta = crankRevolutions - this.lastCrankRevolutions;
      if (revolutionDelta < 0) {
        // Handle wrap-around for 16-bit value
        revolutionDelta = (65535 - this.lastCrankRevolutions) + crankRevolutions;
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
          console.warn(`[BLE] RPM value ${rpm} seems too high, setting to 0`);
          rpm = 0; // Likely measurement error
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

    const measurement: CSCMeasurement = {
      wheelRevolutions,
      lastWheelEventTime,
      crankRevolutions,
      lastCrankEventTime,
      rpm: Math.round(rpm),
      timestamp: Date.now(),
    };

    // Call callback
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
      
      // Reset stale data filter tracking
      this.lastProcessedCrankEventTime = 0;
      this.lastCrankEventTimeChange = 0;
      
      console.log('[BLE] Disconnected from device');
    } catch (error) {
      console.error('[BLE] Disconnect error:', error);
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
