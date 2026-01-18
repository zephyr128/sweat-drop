# 🚀 Quick Start - Magene Gemini 210

## Brzi Pregled Koraka

### 1️⃣ Database (5 minuta)
```bash
# Pokrenite migraciju
cd backend/supabase
# U Supabase Dashboard → SQL Editor, kopirajte i pokrenite:
# backend/supabase/migrations/20240101000027_magene_ble_integration.sql
```

### 2️⃣ Admin Panel - Web Bluetooth (10 minuta)
1. Otvorite `/dashboard/super/machines` kao SuperAdmin
2. Kliknite "Add Machine" → Unesite ime i tip
3. Kliknite Bluetooth ikonu 🔵 → Izaberite Magene senzor
4. Kliknite Print ikonu 🖨️ → Print-ujte QR label

**Napomena:** Koristite Chrome/Edge sa HTTPS (ili localhost).

### 3️⃣ Mobile App - BLE Setup (15 minuta)

#### Instalirajte BLE biblioteku:
```bash
cd apps/mobile-app

# Za iOS:
npm install react-native-ble-plx
cd ios && pod install && cd ..

# Za Android:
npm install react-native-ble-manager
```

#### Ažurirajte BLE Service:
Otvorite `apps/mobile-app/lib/ble-service.ts` i implementirajte stvarnu BLE logiku koristeći primer iz `MAGENE_IMPLEMENTATION_GUIDE.md`.

### 4️⃣ Testiranje (10 minuta)

1. **Admin Panel:**
   - Pair-ujte senzor na mašinu
   - Print-ujte QR label

2. **Mobile App:**
   - Skenirajte QR kod
   - Proverite da li se mašina zaključava
   - Proverite BLE konekciju (console logs)
   - Završite trening → Proverite da li se mašina otključava

## ✅ Checklist

- [ ] SQL migracija pokrenuta
- [ ] Web Bluetooth pairing radi
- [ ] QR label se print-uje
- [ ] BLE biblioteka instalirana
- [ ] BLE logika implementirana
- [ ] Scan proverava `is_busy`
- [ ] Workout monitoruje BLE
- [ ] Auto-pause radi
- [ ] Machine unlock radi

## 📚 Detaljne Instrukcije

Za kompletan vodič, pogledajte: `MAGENE_IMPLEMENTATION_GUIDE.md`

## 🆘 Problemi?

1. **Web Bluetooth ne radi?** → Koristite Chrome/Edge sa HTTPS
2. **BLE ne radi?** → Proverite permisije u device settings
3. **Mašina se ne otključava?** → Proverite `unlock_machine` RPC poziv
