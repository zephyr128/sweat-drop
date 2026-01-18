# Magene Gemini 210 BLE Integration Setup

## Overview
This document describes how to set up the Magene Gemini 210 sensor integration for the SweatDrop mobile app.

## Prerequisites
- React Native app with Expo
- Magene Gemini 210 sensor
- iOS device with Bluetooth 4.0+ or Android device with Bluetooth 4.0+

## Installation

### 1. Install BLE Libraries

For iOS (using react-native-ble-plx):
```bash
cd apps/mobile-app
npm install react-native-ble-plx
npx pod-install  # iOS only
```

For Android (using react-native-ble-manager):
```bash
cd apps/mobile-app
npm install react-native-ble-manager
```

**Note:** You may need to use a different library or configure Expo for BLE. Check Expo's documentation for BLE support.

### 2. Update app.json

Add Bluetooth permissions:

```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "NSBluetoothAlwaysUsageDescription": "This app needs Bluetooth to connect to Magene sensors for workout tracking.",
        "NSBluetoothPeripheralUsageDescription": "This app needs Bluetooth to connect to Magene sensors for workout tracking."
      }
    },
    "android": {
      "permissions": [
        "android.permission.BLUETOOTH",
        "android.permission.BLUETOOTH_ADMIN",
        "android.permission.BLUETOOTH_SCAN",
        "android.permission.BLUETOOTH_CONNECT",
        "android.permission.ACCESS_FINE_LOCATION"
      ]
    }
  }
}
```

### 3. Update BLE Service

The BLE service (`lib/ble-service.ts`) is currently a placeholder. You need to implement the actual BLE connection logic using your chosen library.

**Example with react-native-ble-plx:**

```typescript
import { BleManager, Device, Characteristic } from 'react-native-ble-plx';

const manager = new BleManager();

async connectToDevice(sensorId: string): Promise<boolean> {
  try {
    const device = await manager.connectToDevice(sensorId);
    await device.discoverAllServicesAndCharacteristics();
    
    const service = await device.readCharacteristicForService(
      '1816', // CSC Service
      '2A5B'  // CSC Measurement Characteristic
    );
    
    // Monitor notifications
    device.monitorCharacteristicForService(
      '1816',
      '2A5B',
      (error, characteristic) => {
        if (error) {
          console.error('BLE error:', error);
          return;
        }
        if (characteristic?.value) {
          this.handleMeasurement(characteristic.value);
        }
      }
    );
    
    this.device = device;
    this.isConnected = true;
    return true;
  } catch (error) {
    console.error('Connection error:', error);
    return false;
  }
}
```

## Database Migration

Run the migration to add BLE-related fields to the machines table:

```bash
# Apply migration
supabase migration up 20240101000027_magene_ble_integration.sql
```

## Testing

1. **Pair Sensor (SuperAdmin):**
   - Go to `/dashboard/super/machines` or `/dashboard/gym/[id]/machines`
   - Click the Bluetooth icon on a machine
   - Select the Magene Gemini 210 sensor from the list
   - Sensor ID will be automatically saved

2. **Print QR Label:**
   - After creating a machine, click the Print icon
   - Print the label and attach it to the machine

3. **Scan QR Code (Mobile App):**
   - Open the mobile app
   - Scan the QR code on the machine
   - App will check if machine is busy
   - If available, workout starts and machine is locked

4. **BLE Monitoring:**
   - During workout, app connects to the sensor
   - RPM is monitored in real-time
   - If RPM = 0 for 30+ seconds, workout auto-pauses
   - Heartbeat is updated every 10 seconds

5. **End Workout:**
   - When workout ends, machine is automatically unlocked
   - BLE connection is disconnected

## Troubleshooting

### BLE Connection Fails
- Ensure sensor is powered on and nearby
- Check Bluetooth permissions in device settings
- Verify sensor_id is correctly paired in admin panel

### Auto-Pause Not Working
- Check that BLE monitoring is active (check console logs)
- Verify sensor is sending data (RPM > 0)
- Check auto-pause timer logic in workout.tsx

### Machine Not Unlocking
- Check heartbeat updates (should be every 10 seconds)
- Verify unlock_machine RPC function is called on workout end
- Check database for stale locks (run `unlock_stale_machines()` function)

## Security Notes

- Only SuperAdmin can pair sensors
- Machine locks prevent concurrent workouts
- Heartbeat ensures machines unlock if app crashes
- Stale locks are automatically cleared after 30 seconds
