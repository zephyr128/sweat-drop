# ✅ Magene S3+ - Kompletna Implementacija

## 📋 Pregled
Kompletna integracija Magene S3+ senzora sa specifičnom formulom za RPM kalkulaciju, auto-reconnect funkcionalnošću i live monitoring-om.

---

## 🔧 Implementirane Funkcionalnosti

### 1. **BLE Service - Magene S3+ Specifična Formula** (`lib/ble-service.ts`)

✅ **RPM Kalkulacija:**
```typescript
// Magene S3+ Formula:
// RPM = ((CrankRev_now - CrankRev_prev) × 1024 × 60) / (EventTime_now - EventTime_prev)
// 
// Pošto je EventTime već u 1/1024 sekundi, formula se pojednostavljuje:
// RPM = (revolutionDelta / timeDeltaSeconds) × 60
```

✅ **Parsiranje CSC Podataka:**
- Flags byte: bit 0 = wheel revolution, bit 1 = crank revolution
- Cumulative Crank Revolutions: 16-bit little-endian (bytes 1-2)
- Last Crank Event Time: 16-bit little-endian, 1/1024 seconds (bytes 3-4)
- Handle wrap-around za 16-bit vrednosti

✅ **Auto-Reconnect & Sleep Handling:**
- Heartbeat monitoring (provera svakih 2 sekunde)
- Sleep detekcija (10+ sekundi bez podataka)
- Auto-reconnect sa proverom session ownership-a
- Callback sistem za sleep i reconnect evente

### 2. **Admin Panel - Cadence Mode Warning** (`components/modules/MachinesManager.tsx`)

✅ **Upozorenje pre Pairing-a:**
- Dialog upozorava SuperAdmin-a da senzor mora biti u Cadence modu (crveno svetlo)
- Pairing se ne može nastaviti bez potvrde

### 3. **QR Kod sa Sensor Type** (`components/MachineQRPrint.tsx`)

✅ **Format:**
```
sweatdrop://machine/{qr_uuid}?sensor=csc
```

✅ **Parsiranje u ScannerScreen:**
- Automatski detektuje `sensor=csc` parametar
- Backward compatible sa starim formatom (default: CSC)

### 4. **Database - last_rpm Field** (`migrations/20240101000029_add_last_rpm_to_machines.sql`)

✅ **Dodato:**
- `last_rpm` INTEGER kolona u `machines` tabeli
- `update_machine_rpm()` RPC funkcija
- `reset_machine_rpm()` funkcija za cleanup
- Indeks za brže pretrage

### 5. **Workout Screen - Live Monitoring** (`app/workout.tsx`)

✅ **RPM Prikaz:**
- RPM se prikazuje u stats grid-u (4. stat)
- Prikazuje se samo ako je senzor povezan
- Boja se menja (primary kada RPM > 0, secondary kada RPM = 0)

✅ **Auto-Pause Overlay:**
- Warning overlay nakon 10 sekundi bez RPM-a
- Auto-pause nakon 30 sekundi bez RPM-a

✅ **Sensor Asleep Overlay:**
- Prikazuje se kada nema podataka 10+ sekundi
- "Ponovo Poveži" dugme za reconnect
- Proverava session ownership pre reconnect-a

✅ **Live RPM Update:**
- Ažurira `last_rpm` u bazi svakih 30 sekundi
- Heartbeat update svakih 10 sekundi
- Reset RPM-a kada se mašina otključa

---

## 📊 Database Schema

### Machines Table
```sql
ALTER TABLE machines ADD COLUMN:
- sensor_id TEXT UNIQUE
- qr_uuid UUID UNIQUE DEFAULT gen_random_uuid()
- is_busy BOOLEAN DEFAULT false
- current_user_id UUID REFERENCES profiles(id)
- last_heartbeat TIMESTAMPTZ
- last_rpm INTEGER DEFAULT 0  -- NEW
```

### RPC Functions
1. `get_machine_status(qr_uuid)` - Vraća status mašine
2. `lock_machine(machine_id, user_id)` - Zaključava mašinu
3. `unlock_machine(machine_id, user_id)` - Otključava mašinu
4. `update_machine_heartbeat(machine_id, user_id)` - Update heartbeat-a
5. `update_machine_rpm(machine_id, user_id, rpm)` - Update RPM-a (NEW)
6. `reset_machine_rpm()` - Reset RPM-a za sve otključane mašine (NEW)

---

## 🔄 Flow Diagram

```
1. SuperAdmin Pair-uje Senzor
   ↓
   ⚠️ Dialog: "Proverite da li je senzor u Cadence modu (crveno svetlo)"
   ↓
2. QR Kod se Generiše
   Format: sweatdrop://machine/{qr_uuid}?sensor=csc
   ↓
3. User Skenira QR Kod
   ↓
4. ScannerScreen poziva get_machine_status()
   ↓
5. Proverava is_busy → lock_machine() → kreira session
   ↓
6. Navigira na Workout sa sensor_id
   ↓
7. Workout se Povezuje na BLE
   ↓
8. BLE Monitoring:
   - Čita CSC podatke (0x2A5B)
   - Parsira Cumulative Crank Revolutions
   - Kalkuliše RPM koristeći Magene S3+ formulu
   - Ažurira last_rpm u bazi (svakih 30s)
   - Heartbeat update (svakih 10s)
   ↓
9. Sleep Detection:
   - Ako nema podataka 10+ sekundi → "Sensor Asleep" overlay
   - "Ponovo Poveži" dugme → reconnect sa ownership proverom
   ↓
10. Auto-Pause:
    - Ako RPM = 0 za 10+ sekundi → Warning overlay
    - Ako RPM = 0 za 30+ sekundi → Auto-pause
   ↓
11. End Workout:
    - unlock_machine()
    - reset_machine_rpm()
    - disconnect BLE
```

---

## 🧪 Test Scenariji

### Test 1: Cadence Mode Warning
1. SuperAdmin klikne "Pair Sensor"
2. **Očekivano:** Dialog upozorava o Cadence modu
3. Ako korisnik klikne "Cancel" → Pairing se prekida
4. Ako korisnik klikne "OK" → Pairing nastavlja

### Test 2: RPM Kalkulacija
1. Pokreni trening sa Magene S3+ senzorom
2. Rotiraj pedale (crank)
3. **Očekivano:** RPM se prikazuje u realnom vremenu
4. Proveri console logs za measurement podatke

### Test 3: Sleep Detection
1. Pokreni trening
2. Isključi senzor ili se udalji
3. Sačekaj 10+ sekundi
4. **Očekivano:** "Sensor Asleep" overlay sa "Ponovo Poveži" dugmetom

### Test 4: Auto-Reconnect
1. Kada se pojavi "Sensor Asleep" overlay
2. Klikni "Ponovo Poveži"
3. Uključi senzor
4. **Očekivano:** Senzor se ponovo povezuje i monitoring nastavlja

### Test 5: Session Ownership Verification
1. User A pokrene trening
2. User A isključi app
3. User A pokuša reconnect
4. **Očekivano:** Reconnect uspešan (session ownership proveren)
5. User B pokuša da skenira isti QR
6. **Očekivano:** "Sprava zauzeta" poruka

### Test 6: Live RPM Update
1. Pokreni trening
2. Proveri `machines.last_rpm` u bazi
3. **Očekivano:** `last_rpm` se ažurira svakih 30 sekundi sa trenutnim RPM-om

---

## 📝 Važne Napomene

### Magene S3+ Specifičnosti:
1. **Cadence Mode:** Senzor MORA biti u Cadence modu (crveno svetlo) za ispravno čitanje
2. **RPM Formula:** Koristi specifičnu formulu za Magene S3+
3. **Wrap-Around:** Handle-uje 16-bit wrap-around za Event Time i Revolutions

### BLE Connection:
- iOS: Koristi `react-native-ble-plx`
- Android: Koristi `react-native-ble-manager`
- Oba sistema podržavaju CSC Service (0x1816) i Characteristic (0x2A5B)

### Database Updates:
- `last_rpm` se ažurira svakih 30 sekundi tokom aktivnog treninga
- `last_heartbeat` se ažurira svakih 10 sekundi
- Oba se reset-uju kada se mašina otključa

---

## ✅ Checklist

- [x] BLE Service sa Magene S3+ RPM formulom
- [x] CSC podaci parsiranje (Cumulative Crank Revolutions)
- [x] Auto-reconnect sa session ownership proverom
- [x] Sleep detection (10+ sekundi)
- [x] Admin Panel Cadence mode warning
- [x] QR kod sa sensor type parametrom
- [x] Database `last_rpm` polje
- [x] `update_machine_rpm()` RPC funkcija
- [x] Workout screen RPM prikaz
- [x] Sensor Asleep overlay sa reconnect dugmetom
- [x] Live RPM update u bazi (svakih 30s)
- [x] Heartbeat update (svakih 10s)

---

## 🚀 Sledeći Koraci

1. **Testiranje:**
   - Testiraj na stvarnom Magene S3+ senzoru
   - Proveri RPM kalkulaciju sa različitim brzinama
   - Testiraj auto-reconnect funkcionalnost

2. **Optimizacija:**
   - Optimizuj BLE scanning za brže pronalaženje
   - Dodaj retry logiku za failed connections
   - Optimizuj database update frequency

3. **Monitoring:**
   - Dodaj analytics za BLE connection success rate
   - Monitoruj RPM accuracy
   - Pratite auto-pause incidents

---

## 📞 Troubleshooting

### Problem: RPM je uvek 0
**Rešenje:**
- Proveri da li je senzor u Cadence modu (crveno svetlo)
- Proveri console logs za measurement podatke
- Proveri da li je `crankRevolutionPresent` flag postavljen

### Problem: Auto-reconnect ne radi
**Rešenje:**
- Proveri session ownership proveru
- Proveri da li je `is_busy` još uvek true
- Proveri BLE permisije

### Problem: last_rpm se ne ažurira
**Rešenje:**
- Proveri da li je `update_machine_rpm` RPC pozvan
- Proveri da li je `rpm > 0` pre update-a
- Proveri database logs

---

## 🎯 Ključne Implementacije

### RPM Formula (Magene S3+)
```typescript
// Handle wrap-around
let timeDelta = lastCrankEventTime - this.lastCrankEventTime;
if (timeDelta < 0) {
  timeDelta = (65535 - this.lastCrankEventTime) + lastCrankEventTime;
}

const timeDeltaSeconds = timeDelta / 1024.0;
let revolutionDelta = crankRevolutions - this.lastCrankRevolutions;
if (revolutionDelta < 0) {
  revolutionDelta = (65535 - this.lastCrankRevolutions) + crankRevolutions;
}

// Magene S3+ Formula
if (timeDeltaSeconds > 0 && revolutionDelta > 0) {
  rpm = (revolutionDelta / timeDeltaSeconds) * 60.0;
}
```

### Sleep Detection
```typescript
// Check every 2 seconds
this.heartbeatInterval = setInterval(() => {
  const timeSinceLastMeasurement = Date.now() - this.lastMeasurementTime;
  
  if (timeSinceLastMeasurement > 10000 && this.onSleepCallback) {
    this.onSleepCallback(); // Trigger "Sensor Asleep" overlay
  }
}, 2000);
```

### Auto-Reconnect
```typescript
async reconnect(): Promise<boolean> {
  // Disconnect → Wait → Reconnect
  await this.disconnect();
  await new Promise(resolve => setTimeout(resolve, 1000));
  const connected = await this.connectToDevice(deviceId);
  
  // Verify session ownership
  if (connected && this.onReconnectCallback) {
    const stillOwnsSession = await this.onReconnectCallback();
    if (!stillOwnsSession) {
      await this.disconnect();
      return false;
    }
  }
  
  return connected;
}
```

---

Sve je implementirano i spremno za testiranje! 🎉
