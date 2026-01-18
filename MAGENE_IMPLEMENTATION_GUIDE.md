# Magene Gemini 210 - Kompletne Instrukcije za Implementaciju

## 📋 Pregled
Ovaj vodič objašnjava kako da implementirate kompletan flow za Magene Gemini 210 senzor, od dodavanja uređaja do zaključavanja treninga.

---

## 🗄️ KORAK 1: Database Migration

### 1.1. Pokrenite SQL migraciju

```bash
cd backend/supabase
```

Ako koristite Supabase CLI:
```bash
supabase db push
```

Ili ručno u Supabase Dashboard:
1. Otvorite Supabase Dashboard → SQL Editor
2. Kopirajte sadržaj iz `backend/supabase/migrations/20240101000027_magene_ble_integration.sql`
3. Kliknite "Run"

### 1.2. Proverite da li su kolone dodate

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'machines' 
AND column_name IN ('sensor_id', 'qr_uuid', 'is_busy', 'current_user_id', 'last_heartbeat');
```

Trebalo bi da vidite sve 5 kolona.

---

## 💻 KORAK 2: Admin Panel - Web Bluetooth Pairing

### 2.1. Instalirajte QR biblioteku (opciono, za print label)

```bash
cd apps/admin-panel
npm install qrcode.react
# ili
npm install react-qr-code
```

**Napomena:** Ako instalacija ne radi zbog permisija, možete koristiti online QR API (već implementirano u `MachineQRPrint.tsx`).

### 2.2. Proverite da li su fajlovi ažurirani

Proverite da li su sledeći fajlovi ažurirani:
- ✅ `apps/admin-panel/components/modules/MachinesManager.tsx` - Web Bluetooth pairing
- ✅ `apps/admin-panel/components/MachineQRPrint.tsx` - Print label komponenta
- ✅ `apps/admin-panel/lib/actions/machine-actions.ts` - Server actions

### 2.3. Testiranje Web Bluetooth Pairing

1. **Ulogujte se kao SuperAdmin** u admin panel
2. Idite na `/dashboard/super/machines` ili `/dashboard/gym/[id]/machines`
3. Kliknite na **Bluetooth ikonu** (🔵) pored mašine
4. **Uključite Magene Gemini 210 senzor** (pritisnite dugme na senzoru)
5. U browseru će se pojaviti dijalog za izbor Bluetooth uređaja
6. Izaberite "Magene Gemini 210" ili sličan naziv
7. Sensor ID će se automatski popuniti

**Napomena:** Web Bluetooth radi samo u **Chrome** ili **Edge** browseru, i zahteva **HTTPS** (ili localhost za development).

---

## 📱 KORAK 3: Mobile App - BLE Biblioteke

### 3.1. Instalirajte BLE biblioteke

```bash
cd apps/mobile-app
```

**Za iOS (react-native-ble-plx):**
```bash
npm install react-native-ble-plx
cd ios
pod install
cd ..
```

**Za Android (react-native-ble-manager):**
```bash
npm install react-native-ble-manager
```

**ILI koristite Expo BLE modul (ako koristite Expo):**
```bash
npx expo install expo-bluetooth
```

### 3.2. Ažurirajte app.config.js

Dodajte Bluetooth permisije u `apps/mobile-app/app.config.js`:

Ažurirajte `apps/mobile-app/app.config.js`:

```javascript
ios: {
  // ... postojeće opcije
  infoPlist: {
    NSCameraUsageDescription: '...',
    NSBluetoothAlwaysUsageDescription:
      'This app needs Bluetooth to connect to Magene sensors for workout tracking.',
    NSBluetoothPeripheralUsageDescription:
      'This app needs Bluetooth to connect to Magene sensors for workout tracking.',
  },
},
android: {
  // ... postojeće opcije
  permissions: [
    'CAMERA',
    'android.permission.BLUETOOTH',
    'android.permission.BLUETOOTH_ADMIN',
    'android.permission.BLUETOOTH_SCAN',
    'android.permission.BLUETOOTH_CONNECT',
    'android.permission.ACCESS_FINE_LOCATION',
  ],
},
```

**Napomena:** Fajl je već ažuriran sa ovim permisijama.

### 3.3. Implementirajte BLE logiku

**Ažurirajte `apps/mobile-app/lib/ble-service.ts`** sa stvarnom BLE logikom.

**Primer za react-native-ble-plx:**

```typescript
import { BleManager, Device } from 'react-native-ble-plx';

const manager = new BleManager();

export class BLEService {
  private device: Device | null = null;
  private isConnected: boolean = false;
  private measurementCallback: ((measurement: CSCMeasurement) => void) | null = null;

  async connectToDevice(sensorId: string): Promise<boolean> {
    try {
      // Scan for device
      const device = await manager.connectToDevice(sensorId);
      await device.discoverAllServicesAndCharacteristics();
      
      // Get CSC Service (0x1816)
      const services = await device.services();
      const cscService = services.find(s => s.uuid.toLowerCase() === '1816');
      
      if (!cscService) {
        throw new Error('CSC Service not found');
      }
      
      // Get CSC Measurement Characteristic (0x2A5B)
      const characteristics = await cscService.characteristics();
      const measurementChar = characteristics.find(c => c.uuid.toLowerCase() === '2a5b');
      
      if (!measurementChar) {
        throw new Error('CSC Measurement Characteristic not found');
      }
      
      this.device = device;
      this.isConnected = true;
      
      return true;
    } catch (error) {
      console.error('[BLE] Connection error:', error);
      this.isConnected = false;
      return false;
    }
  }

  async startMonitoring(
    onMeasurement: (measurement: CSCMeasurement) => void
  ): Promise<boolean> {
    if (!this.device || !this.isConnected) {
      return false;
    }

    this.measurementCallback = onMeasurement;

    try {
      // Monitor CSC measurements
      this.device.monitorCharacteristicForService(
        '1816',
        '2A5B',
        (error, characteristic) => {
          if (error) {
            console.error('[BLE] Measurement error:', error);
            return;
          }
          
          if (characteristic?.value) {
            // Parse base64 value
            const data = Buffer.from(characteristic.value, 'base64');
            this.handleMeasurement(data.buffer);
          }
        }
      );

      return true;
    } catch (error) {
      console.error('[BLE] Failed to start monitoring:', error);
      return false;
    }
  }

  // ... ostatak koda ostaje isti
}
```

**Primer za react-native-ble-manager (Android):**

```typescript
import BleManager from 'react-native-ble-manager';

export class BLEService {
  async connectToDevice(sensorId: string): Promise<boolean> {
    try {
      await BleManager.connect(sensorId);
      await BleManager.retrieveServices(sensorId);
      
      // Enable notifications
      await BleManager.startNotification(
        sensorId,
        '1816', // CSC Service
        '2A5B'  // CSC Measurement Characteristic
      );
      
      // Listen for notifications
      BleManager.addListener('BleManagerDidUpdateValueForCharacteristic', (data) => {
        if (data.value) {
          const buffer = Buffer.from(data.value, 'base64');
          this.handleMeasurement(buffer.buffer);
        }
      });
      
      this.isConnected = true;
      return true;
    } catch (error) {
      console.error('[BLE] Connection error:', error);
      return false;
    }
  }
}
```

---

## 🔧 KORAK 4: Testiranje Kompletnog Flow-a

### 4.1. SuperAdmin - Dodavanje Mašine i Pairing

1. **Kreirajte novu mašinu:**
   - Idite na `/dashboard/super/machines`
   - Kliknite "Add Machine"
   - Unesite ime (npr. "Treadmill #1")
   - Izaberite tip (Treadmill ili Bike)
   - Kliknite "Create Machine"

2. **Pair-ujte senzor:**
   - Kliknite Bluetooth ikonu pored mašine
   - Uključite Magene Gemini 210 senzor
   - Izaberite senzor iz liste
   - Sensor ID će se automatski sačuvati

3. **Print-ujte QR label:**
   - Kliknite Print ikonu pored QR koda
   - Print-ujte label i zalepite na mašinu

### 4.2. Mobile App - Skeniranje i Trening

1. **Skenirajte QR kod:**
   - Otvorite mobile app
   - Idite na "Scan" ekran
   - Skenirajte QR kod sa mašine
   - App će proveriti da li je mašina zauzeta

2. **Pokrenite trening:**
   - Ako je mašina slobodna, trening će početi
   - Mašina će biti automatski zaključana
   - App će se povezati na BLE senzor

3. **Monitorujte trening:**
   - RPM se prikazuje u realnom vremenu
   - Ako RPM = 0 duže od 30 sekundi, trening se automatski pauzira
   - Heartbeat se update-uje svakih 10 sekundi

4. **Završite trening:**
   - Kliknite "Finish Workout"
   - Mašina će biti automatski otključana
   - BLE konekcija će biti prekinuta

### 4.3. Testiranje Anti-Cheat Logike

1. **Test 1: Concurrent Access**
   - Korisnik A skenira QR kod i počinje trening
   - Korisnik B pokušava da skenira isti QR kod
   - **Očekivano:** Korisnik B dobija poruku "Ova sprava je trenutno zauzeta"

2. **Test 2: Auto-Unlock**
   - Pokrenite trening
   - Zatvorite app bez završetka treninga
   - Sačekajte 30+ sekundi
   - **Očekivano:** Mašina se automatski otključava (heartbeat timeout)

3. **Test 3: Auto-Pause**
   - Pokrenite trening sa BLE senzorom
   - Isključite senzor ili se udaljite
   - Sačekajte 30+ sekundi
   - **Očekivano:** Trening se automatski pauzira

---

## 🐛 Troubleshooting

### Problem: Web Bluetooth ne radi
**Rešenje:**
- Koristite Chrome ili Edge browser
- Obavezno HTTPS (ili localhost za development)
- Proverite da li je Bluetooth uključen na računaru

### Problem: BLE konekcija ne radi na mobile app
**Rešenje:**
- Proverite Bluetooth permisije u device settings
- Proverite da li je senzor uključen i u blizini
- Proverite da li je `sensor_id` ispravno uparen u admin panelu

### Problem: Mašina se ne otključava
**Rešenje:**
- Proverite da li se `unlock_machine` RPC poziva na kraju treninga
- Ručno otključajte mašinu u bazi:
  ```sql
  UPDATE machines 
  SET is_busy = false, current_user_id = NULL, last_heartbeat = NULL 
  WHERE id = 'machine-id';
  ```

### Problem: Auto-pause ne radi
**Rešenje:**
- Proverite da li BLE monitoring radi (console logs)
- Proverite da li senzor šalje podatke (RPM > 0)
- Proverite auto-pause timer logiku u `workout.tsx`

---

## 📝 Checklist

- [ ] SQL migracija pokrenuta
- [ ] Web Bluetooth pairing radi u admin panelu
- [ ] QR label se print-uje ispravno
- [ ] BLE biblioteke instalirane u mobile app
- [ ] BLE logika implementirana u `ble-service.ts`
- [ ] Bluetooth permisije dodate u `app.json`
- [ ] Scan ekran proverava `is_busy` status
- [ ] Workout ekran monitoruje BLE i auto-pause
- [ ] Machine lock/unlock radi ispravno
- [ ] Heartbeat update radi svakih 10 sekundi
- [ ] Auto-unlock radi nakon 30 sekundi timeout-a

---

## 🎯 Sledeći Koraci

1. **Produkcija:**
   - Testirajte na stvarnim uređajima
   - Optimizujte BLE konekciju za bolju stabilnost
   - Dodajte error handling i retry logiku

2. **Monitoring:**
   - Dodajte analytics za BLE konekcije
   - Pratite success rate za pairing
   - Monitorujte auto-pause incidents

3. **Optimizacija:**
   - Smanjite heartbeat interval ako je potrebno
   - Optimizujte BLE scanning za brže pronalaženje senzora
   - Dodajte caching za sensor pairing

---

## 📞 Podrška

Ako imate problema, proverite:
1. Console logs u browseru (admin panel)
2. React Native debugger logs (mobile app)
3. Supabase logs (database queries)
4. BLE device logs (ako su dostupni)
