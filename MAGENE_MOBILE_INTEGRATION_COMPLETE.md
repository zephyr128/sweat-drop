# ✅ Magene Gemini 210 - Kompletna Mobilna Integracija

## 📦 Instalirane Komponente

### 1. BLE Biblioteke
- ✅ `react-native-ble-manager` (Android)
- ✅ `react-native-ble-plx` (iOS)

### 2. QR Scanner
- ⚠️ **Potrebno instalirati:** `react-native-vision-camera`

```bash
cd apps/mobile-app
npm install react-native-vision-camera
```

Za iOS:
```bash
cd ios
pod install
cd ..
```

### 3. Dozvole
- ✅ Android: Bluetooth dozvole dodate u `AndroidManifest.xml`
- ✅ iOS: Bluetooth dozvole dodate u `app.config.js`
- ✅ Camera: Dozvole dodate u oba sistema

---

## 🔧 Implementirane Komponente

### 1. **BLE Service** (`lib/ble-service.ts`)
✅ Kompletna implementacija sa:
- iOS podrška (react-native-ble-plx)
- Android podrška (react-native-ble-manager)
- CSC (Cycling Speed and Cadence) parsiranje
- RPM kalkulacija iz crank revolutions
- Auto-pause detekcija

### 2. **Scanner Screen** (`components/ScannerScreen.tsx`)
✅ Komponenta sa:
- react-native-vision-camera integracija
- QR kod skeniranje
- `get_machine_status` RPC poziv
- Machine locking pre workout-a
- Session kreiranje

### 3. **Workout Screen** (`app/workout.tsx`)
✅ Ažurirano sa:
- BLE monitoring integracija
- RPM prikaz u stats grid-u
- Auto-pause overlay (10+ sekundi bez RPM)
- Heartbeat update (svakih 10 sekundi)
- Machine unlock na kraju treninga

### 4. **Database RPC** (`migrations/20240101000028_get_machine_status_rpc.sql`)
✅ Funkcija za proveru statusa mašine

---

## 🚀 Koraci za Pokretanje

### Korak 1: Instaliraj react-native-vision-camera

```bash
cd apps/mobile-app
npm install react-native-vision-camera

# iOS
cd ios && pod install && cd ..
```

### Korak 2: Pokreni Database Migracije

```sql
-- U Supabase Dashboard → SQL Editor
-- Pokreni obe migracije:
-- 1. backend/supabase/migrations/20240101000027_magene_ble_integration.sql
-- 2. backend/supabase/migrations/20240101000028_get_machine_status_rpc.sql
```

### Korak 3: Testiranje

1. **Admin Panel:**
   - Pair-uj Magene senzor na mašinu
   - Print-uj QR label

2. **Mobile App:**
   - Otvori Scan ekran
   - Skeniraj QR kod
   - Proveri da li se mašina zaključava
   - Proveri BLE konekciju (console logs)
   - Proveri RPM prikaz u workout ekranu
   - Proveri auto-pause (isključi senzor na 10+ sekundi)

---

## 📱 Flow Diagram

```
1. User skenira QR kod
   ↓
2. ScannerScreen poziva get_machine_status(qr_uuid)
   ↓
3. Proverava is_busy status
   ↓
4a. Ako je busy → Alert "Sprava zauzeta"
4b. Ako je slobodna → lock_machine() → kreira session
   ↓
5. Navigira na Workout ekran sa sensor_id
   ↓
6. Workout ekran se povezuje na BLE senzor
   ↓
7. Monitoruje RPM u realnom vremenu
   ↓
8a. RPM > 0 → Prikazuje RPM u stats grid-u
8b. RPM = 0 za 10+ sekundi → Prikazuje auto-pause overlay
8c. RPM = 0 za 30+ sekundi → Automatski pauzira trening
   ↓
9. Heartbeat update svakih 10 sekundi
   ↓
10. Na kraju treninga → unlock_machine() → disconnect BLE
```

---

## 🐛 Troubleshooting

### Problem: "react-native-vision-camera not found"
**Rešenje:**
```bash
npm install react-native-vision-camera
cd ios && pod install && cd ..
```

### Problem: BLE ne radi na Android
**Rešenje:**
- Proveri Bluetooth permisije u device settings
- Proveri da li je `BLUETOOTH_SCAN` dozvola dodata u AndroidManifest.xml
- Za Android 12+, potrebna je `ACCESS_FINE_LOCATION` dozvola

### Problem: RPM se ne prikazuje
**Rešenje:**
- Proveri da li je `sensor_id` prosleđen u workout params
- Proveri console logs za BLE measurement podatke
- Proveri da li je senzor uparen u admin panelu

### Problem: Auto-pause ne radi
**Rešenje:**
- Proveri da li BLE monitoring radi (console logs)
- Proveri `lastRPMTimeRef` vrednosti
- Proveri auto-pause timer logiku

---

## ✅ Checklist

- [x] BLE Service implementiran (iOS + Android)
- [x] ScannerScreen komponenta kreirana
- [x] Workout ekran ažuriran sa RPM prikazom
- [x] Auto-pause overlay implementiran
- [x] Machine locking/unlocking integrisan
- [x] Heartbeat update implementiran
- [x] Database RPC funkcije kreirane
- [x] Dozvole konfigurisane
- [ ] **react-native-vision-camera instaliran** (TODO)
- [ ] Database migracije pokrenute (TODO)
- [ ] Testiranje na stvarnim uređajima (TODO)

---

## 📝 Napomene

1. **react-native-vision-camera** mora biti instaliran pre testiranja
2. **Database migracije** moraju biti pokrenute pre korišćenja
3. **BLE permisije** moraju biti odobrene od strane korisnika
4. **Sensor pairing** mora biti urađen u admin panelu pre skeniranja

---

## 🎯 Sledeći Koraci

1. Instaliraj `react-native-vision-camera`
2. Pokreni database migracije
3. Testiraj na stvarnim uređajima
4. Optimizuj BLE konekciju za bolju stabilnost
5. Dodaj error handling i retry logiku
