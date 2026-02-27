# Plan: Seamless Challenges & Badges Integration

**Kreirano:** 2025-01-27  
**Status:** Draft  
**Cilj:** Automatska integracija izazova i bedževa sa workout sistemom

---

## Pregled

Ovaj plan opisuje implementaciju sistema gde:
1. **Gym Owner** kreira izazove u Admin Panel-u (sa bedž slikom)
2. **Korisnik** radi workout u Mobile App-u
3. **Backend** automatski proverava napredak i dodeljuje bedževe
4. **Mobile App** prikazuje bedževe tokom treninga i nakon završetka

**Ključni princip:** Gym Owner samo kreira izazov - sve ostalo se dešava automatski kroz workout podatke.

---

## Trenutno Stanje Analiza

### Backend (Supabase)

**Postojeće:**
- ✅ `challenges` tabela sa poljima: `id`, `gym_id`, `challenge_type`, `name`, `description`, `target_drops`, `reward_drops`, `start_date`, `end_date`, `is_active`
- ✅ `challenge_progress` tabela koja prati napredak korisnika
- ✅ `add_drops()` funkcija već filtrira izazove po `gym_id` (linija 128 u `20240101000003_dual_wallet_system.sql`)
- ✅ `end_session()` funkcija prosleđuje `gym_id` u `add_drops()` (linija 270-277)
- ✅ `add_drops()` automatski ažurira `challenge_progress` i označava završene izazove

**Nedostaje:**
- ❌ `user_badges` tabela za trajno čuvanje bedževa
- ❌ `badge_image_url` polje u `challenges` tabeli
- ❌ Logika za automatsko dodavanje bedža kada se izazov završi
- ❌ Trigger ili funkcija za notifikacije o osvojenim bedževima

### Mobile App

**Postojeće:**
- ✅ Workout screen (`app/workout.tsx`) poziva `end_session()` RPC
- ✅ Session summary screen (`app/session-summary.tsx`) prikazuje rezultate treninga
- ✅ `useChallengeProgress()` hook za praćenje napretka izazova
- ✅ Home screen prikazuje aktivne izazove
- ✅ `UserSettingsSheet` komponenta za korisničke postavke

**Nedostaje:**
- ❌ Active Challenges overlay tokom treninga
- ❌ Badge animacija u session summary
- ❌ Trophy Room sekcija u profilu/postavkama

### Admin Panel

**Postojeće:**
- ✅ Challenges management stranica (`app/dashboard/gym/[id]/challenges/page.tsx`)
- ✅ `ChallengesManager` komponenta za kreiranje/uređivanje izazova

**Nedostaje:**
- ❌ Polje za upload bedž slike prilikom kreiranja izazova
- ❌ Statistika: koliko korisnika je osvojilo određeni bedž

---

## Faza 1: Backend / Database (Supabase DBA)

**Workspace:** `backend/supabase/`  
**Agent Role:** Supabase DBA  
**Procenjeno vreme:** 3-4 sata

### Korak 1.1: Dodavanje `badge_image_url` polja u `challenges` tabelu

**Zadatak:**
1. **Kreirati migraciju** za dodavanje `badge_image_url` polja:
   - Fajl: `migrations/YYYYMMDDHHMMSS_add_badge_image_to_challenges.sql`
   - Dodati kolonu: `badge_image_url TEXT` (NULL dozvoljen - opciono polje)
   - Dodati komentar: `COMMENT ON COLUMN public.challenges.badge_image_url IS 'URL to badge image/icon that users earn when completing this challenge'`

2. **Verifikovati RLS policies:**
   - Proveriti da li postojeće RLS policies dozvoljavaju čitanje `badge_image_url`
   - Ako ne, ažurirati policies da uključe novo polje

**Fajlovi za kreiranje:**
- `backend/supabase/migrations/YYYYMMDDHHMMSS_add_badge_image_to_challenges.sql`

**Uspeh kriterijum:**
- `challenges` tabela ima `badge_image_url` polje
- Admin panel može da čita i upisuje `badge_image_url`

---

### Korak 1.2: Kreiranje `user_badges` tabele

**Zadatak:**
1. **Kreirati `user_badges` tabelu:**
   - Fajl: `migrations/YYYYMMDDHHMMSS_create_user_badges_table.sql`
   - Polja:
     - `id UUID PRIMARY KEY`
     - `user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL`
     - `challenge_id UUID REFERENCES challenges(id) ON DELETE CASCADE NOT NULL`
     - `earned_at TIMESTAMPTZ DEFAULT NOW() NOT NULL`
     - `created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL`
   - Unique constraint: `UNIQUE(user_id, challenge_id)` (korisnik može osvojiti bedž samo jednom)

2. **Kreirati indekse:**
   - `idx_user_badges_user_id` na `user_id`
   - `idx_user_badges_challenge_id` na `challenge_id`
   - `idx_user_badges_earned_at` na `earned_at DESC` (za sortiranje)

3. **Postaviti RLS policies:**
   - Korisnici mogu da vide svoje bedževe: `SELECT` policy sa `auth.uid() = user_id`
   - Korisnici mogu da vide tuđe bedževe (za leaderboard/social): `SELECT` policy sa `USING (true)`
   - Backend funkcije mogu da dodaju bedževe: `INSERT` policy sa `SECURITY DEFINER` funkcijom

**Fajlovi za kreiranje:**
- `backend/supabase/migrations/YYYYMMDDHHMMSS_create_user_badges_table.sql`

**Uspeh kriterijum:**
- `user_badges` tabela postoji sa svim potrebnim poljima
- RLS policies su postavljene
- Indeksi su kreirani za performanse

---

### Korak 1.3: Modifikacija `add_drops()` funkcije za automatsko dodavanje bedževa

**Trenutno stanje:**
- `add_drops()` već označava završene izazove (linija 131-140 u `20240101000003_dual_wallet_system.sql`)
- Koristi `completed_at = NOW()` za identifikaciju novo-završenih izazova

**Zadatak:**
1. **Modifikovati `add_drops()` funkciju:**
   - Fajl: `migrations/YYYYMMDDHHMMSS_add_badge_awarding_to_add_drops.sql`
   - Nakon što se izazov označi kao završen (linija 131-140), dodati logiku:
     - Proveriti da li korisnik već ima bedž za taj izazov (SELECT iz `user_badges`)
     - Ako nema, dodati novi red u `user_badges` tabelu
     - Koristiti `ON CONFLICT DO NOTHING` za sigurnost (unique constraint će sprečiti duplikate)

2. **Dodati komentare:**
   - Objasniti da se bedž dodaje samo jednom (unique constraint)
   - Objasniti da bedž ostaje trajan čak i ako se izazov deaktivira

**Fajlovi za modifikaciju:**
- `backend/supabase/migrations/20240101000003_dual_wallet_system.sql` (referenca)
- `backend/supabase/migrations/YYYYMMDDHHMMSS_add_badge_awarding_to_add_drops.sql` (nova migracija)

**Integracija sa postojećim kodom:**
- Hook-ovati se u postojeću logiku za završene izazove (linija 131-140)
- Dodati `INSERT INTO user_badges` nakon `UPDATE challenge_progress SET is_completed = true`

**Uspeh kriterijum:**
- Kada korisnik završi izazov, bedž se automatski dodaje u `user_badges`
- Bedž se dodaje samo jednom (unique constraint)
- Bedž ostaje trajan čak i ako se izazov deaktivira

---

### Korak 1.4: Kreiranje RPC funkcije za dohvatanje osvojenih bedževa

**Zadatak:**
1. **Kreirati `get_user_badges()` RPC funkciju:**
   - Fajl: `migrations/YYYYMMDDHHMMSS_create_get_user_badges_rpc.sql`
   - Parametri: `p_user_id UUID`
   - Povratna vrednost: JSON sa bedževima
   - Logika:
     - JOIN `user_badges` sa `challenges` da dobije `badge_image_url` i `name`
     - Sortirati po `earned_at DESC` (najnoviji prvo)
     - Vratiti: `badge_id`, `challenge_id`, `challenge_name`, `badge_image_url`, `earned_at`

2. **Kreirati `get_badge_statistics()` RPC funkciju (za admin panel):**
   - Parametri: `p_challenge_id UUID`
   - Povratna vrednost: `total_earned INTEGER` (broj korisnika koji su osvojili bedž)
   - Logika: `SELECT COUNT(*) FROM user_badges WHERE challenge_id = p_challenge_id`

**Fajlovi za kreiranje:**
- `backend/supabase/migrations/YYYYMMDDHHMMSS_create_get_user_badges_rpc.sql`

**Uspeh kriterijum:**
- RPC funkcije vraćaju ispravne podatke
- Funkcije su pozivljive iz mobile app i admin panel

---

### Korak 1.5: Kreiranje trigger-a za notifikacije (opciono, za budućnost)

**Zadatak:**
1. **Kreirati trigger funkciju (za buduće push notifikacije):**
   - Fajl: `migrations/YYYYMMDDHHMMSS_create_badge_notification_trigger.sql`
   - Funkcija: `notify_badge_earned()` koja se poziva nakon INSERT u `user_badges`
   - Za sada: samo loguje (ili upisuje u `notifications` tabelu ako postoji)
   - U budućnosti: može slati push notifikacije

**Napomena:** Ovaj korak je opcioni i može se preskočiti za MVP. Može se implementirati kasnije kada se doda push notifikacije sistem.

**Fajlovi za kreiranje:**
- `backend/supabase/migrations/YYYYMMDDHHMMSS_create_badge_notification_trigger.sql` (opciono)

---

## Faza 2: Mobile App (React Native Coder)

**Workspace:** `apps/mobile-app/`  
**Agent Role:** React Native Coder  
**Procenjeno vreme:** 4-5 sati

### Korak 2.1: Active Challenges Overlay tokom treninga

**Trenutno stanje:**
- Workout screen (`app/workout.tsx`) već koristi `useChallengeProgress()` hook (linija 283-286)
- Challenge progress se ažurira tokom treninga

**Zadatak:**
1. **Kreirati `ActiveChallengesOverlay` komponentu:**
   - Fajl: `components/ActiveChallengesOverlay.tsx`
   - Props:
     - `challenges: ChallengeProgress[]` (iz `useChallengeProgress` hook-a)
     - `gymId: string`
     - `onClose: () => void`
   - UI:
     - Kompaktan overlay sa progress bar-ovima za aktivne izazove
     - Prikazati: naziv izazova, trenutni napredak (X / Y drops), progress bar
     - "X drops do bedža" tekst
     - Zatvori dugme (X u gornjem desnom uglu)

2. **Integrisati overlay u Workout Screen:**
   - Dodati state: `const [showChallengesOverlay, setShowChallengesOverlay] = useState(false)`
   - Dodati dugme/ikonu za otvaranje overlay-a (npr. trofej ikona u header-u)
   - Renderovati `ActiveChallengesOverlay` kada je `showChallengesOverlay === true`
   - Pozicionirati overlay preko workout UI-ja (z-index)

3. **Ažurirati challenge progress u real-time:**
   - Koristiti postojeći `useChallengeProgress` hook
   - Refresh-ovati challenge progress svakih 10-15 sekundi tokom treninga
   - Ažurirati progress bar-ove kada se challenge progress promeni

**Fajlovi za kreiranje/modifikaciju:**
- `apps/mobile-app/components/ActiveChallengesOverlay.tsx` (novi)
- `apps/mobile-app/app/workout.tsx` (modifikacija)

**Integracija sa postojećim kodom:**
- Koristiti postojeći `useChallengeProgress()` hook (linija 283-286)
- Koristiti postojeći `useBranding()` hook za boje
- Koristiti postojeći `theme` za stilove

**Uspeh kriterijum:**
- Overlay se prikazuje tokom treninga
- Progress bar-ovi se ažuriraju u real-time
- Korisnik vidi koliko drops-a mu fali do bedža

---

### Korak 2.2: Badge animacija u Session Summary

**Trenutno stanje:**
- Session summary screen (`app/session-summary.tsx`) prikazuje drops i duration
- Ne prikazuje osvojene bedževe

**Zadatak:**
1. **Kreirati `BadgeEarnedModal` komponentu:**
   - Fajl: `components/BadgeEarnedModal.tsx`
   - Props:
     - `badge: { challenge_id, challenge_name, badge_image_url, earned_at }`
     - `visible: boolean`
     - `onClose: () => void`
   - UI:
     - Full-screen modal sa animacijom
     - Badge slika u centru (velika, sa scale animacijom)
     - "Challenge Completed!" tekst
     - Naziv izazova
     - "You earned a badge!" poruka
     - "Collect" dugme

2. **Dodati animacije:**
   - Koristiti `react-native-reanimated` za smooth animacije
   - Scale animacija: badge se pojavljuje sa scale(0) → scale(1) sa bounce efektom
   - Fade animacija: pozadina se fade-in-uje
   - Konfetti efekat (opciono): koristiti `react-native-confetti-cannon` ili slično

3. **Integrisati u Session Summary:**
   - U `session-summary.tsx`, dodati logiku za proveru osvojenih bedževa:
     - Pozvati `get_user_badges()` RPC funkciju
     - Filtrirati bedževe gde je `earned_at` u poslednjih 5 minuta (novo osvojeni)
     - Prikazati `BadgeEarnedModal` za svaki novi bedž
   - Dodati sekciju "Badges Earned" ispod stats kartica

4. **Dodati badge preview u summary:**
   - Ako je osvojen bedž, prikazati malu badge ikonu pored drops stat-a
   - Link ka Trophy Room-u

**Fajlovi za kreiranje/modifikaciju:**
- `apps/mobile-app/components/BadgeEarnedModal.tsx` (novi)
- `apps/mobile-app/app/session-summary.tsx` (modifikacija)

**Integracija sa postojećim kodom:**
- Koristiti postojeći `supabase` client
- Koristiti postojeći `theme` i `getNumberStyle` za stilove
- Koristiti postojeći `LinearGradient` za pozadinu

**Uspeh kriterijum:**
- Badge animacija se prikazuje kada korisnik osvoji bedž
- Session summary prikazuje osvojene bedževe
- Animacija je smooth i privlačna

---

### Korak 2.3: Trophy Room u Profile/Settings

**Trenutno stanje:**
- `UserSettingsSheet` komponenta postoji (`components/UserSettingsSheet.tsx`)
- Ne prikazuje bedževe

**Zadatak:**
1. **Kreirati `TrophyRoom` komponentu:**
   - Fajl: `components/TrophyRoom.tsx`
   - Props:
     - `userId: string`
     - `onClose?: () => void` (opciono, ako se koristi kao modal)
   - UI:
     - Grid layout sa bedževima (2-3 kolone)
     - Svaki bedž: slika, naziv izazova, datum osvajanja
     - Empty state: "No badges yet. Complete challenges to earn badges!"
     - Sortirati po `earned_at DESC` (najnoviji prvo)

2. **Dodati Trophy Room u UserSettingsSheet:**
   - Dodati novu sekciju "Trophy Room" ili "My Badges"
   - Link/dugme koje otvara `TrophyRoom` komponentu
   - Prikazati broj osvojenih bedževa (badge count)

3. **Kreirati standalone Trophy Room screen (opciono):**
   - Fajl: `app/trophy-room.tsx`
   - Full-screen verzija Trophy Room-a
   - Dodati u routing (`app/_layout.tsx`)

4. **Dodati badge count u Home Screen:**
   - U header-u, pored drops balance, prikazati mali badge ikon sa brojem
   - Link ka Trophy Room-u

**Fajlovi za kreiranje/modifikaciju:**
- `apps/mobile-app/components/TrophyRoom.tsx` (novi)
- `apps/mobile-app/components/UserSettingsSheet.tsx` (modifikacija)
- `apps/mobile-app/app/trophy-room.tsx` (opciono, novi)
- `apps/mobile-app/app/home.tsx` (modifikacija - dodati badge count)
- `apps/mobile-app/app/_layout.tsx` (modifikacija - dodati route ako se kreira standalone screen)

**Integracija sa postojećim kodom:**
- Koristiti `get_user_badges()` RPC funkciju iz backend-a
- Koristiti postojeći `supabase` client
- Koristiti postojeći `theme` i branding za stilove
- Koristiti `expo-image` za prikaz badge slika

**Uspeh kriterijum:**
- Trophy Room prikazuje sve osvojene bedževe
- Bedževi su sortirani po datumu osvajanja
- Badge count se prikazuje u home screen header-u

---

## Faza 3: Admin Panel (Next.js Coder)

**Workspace:** `apps/admin-panel/`  
**Agent Role:** Next.js Coder  
**Procenjeno vreme:** 2-3 sata

### Korak 3.1: Dodavanje Badge Image Upload u Challenges Form

**Trenutno stanje:**
- `ChallengesManager` komponenta postoji (`components/modules/ChallengesManager.tsx`)
- Form za kreiranje izazova ne uključuje badge image upload

**Zadatak:**
1. **Dodati badge image upload polje u Challenges Form:**
   - Fajl: `components/modules/ChallengesManager.tsx` (modifikacija)
   - Dodati:
     - File input za upload slike (ili URL input za početak)
     - Preview badge slike
     - Validacija: maksimalna veličina, format (PNG, SVG, JPG)
   - Opciono: Integracija sa Supabase Storage za upload slika

2. **Ažurirati Server Action za kreiranje izazova:**
   - Fajl: `lib/actions/challenges.ts` (proveriti da li postoji)
   - Dodati `badge_image_url` polje u INSERT query
   - Ako se koristi file upload, upload-ovati sliku u Supabase Storage pre INSERT-a

3. **Ažurirati edit form:**
   - Omogućiti editovanje `badge_image_url` postojećih izazova
   - Prikazati trenutnu badge sliku ako postoji

**Fajlovi za modifikaciju:**
- `apps/admin-panel/components/modules/ChallengesManager.tsx`
- `apps/admin-panel/lib/actions/challenges.ts` (ili kreirati ako ne postoji)

**Integracija sa postojećim kodom:**
- Koristiti postojeći form pattern (react-hook-form + zod)
- Koristiti postojeći Supabase client setup
- Koristiti postojeći styling (Tailwind CSS)

**Uspeh kriterijum:**
- Gym Owner može da upload-uje badge sliku prilikom kreiranja izazova
- Badge slika se čuva u `challenges.badge_image_url`
- Edit form omogućava promenu badge slike

---

### Korak 3.2: Badge Statistics u Admin Dashboard

**Zadatak:**
1. **Kreirati `BadgeStatistics` komponentu:**
   - Fajl: `components/dashboards/BadgeStatistics.tsx`
   - Props:
     - `gymId: string`
   - UI:
     - Tabela sa izazovima i statistikama:
       - Naziv izazova
       - Badge slika (thumbnail)
       - Broj korisnika koji su osvojili bedž (`get_badge_statistics()` RPC)
       - Procenat uspešnosti (osvojeno / ukupno korisnika u gym-u)
     - Sortiranje po broju osvojenih bedževa (DESC)

2. **Dodati u Challenges Management stranicu:**
   - Fajl: `app/dashboard/gym/[id]/challenges/page.tsx` (modifikacija)
   - Dodati novu sekciju "Badge Statistics" ispod Challenges Manager-a
   - Prikazati `BadgeStatistics` komponentu

3. **Dodati badge preview u challenges listu:**
   - U `ChallengesManager` komponenti, prikazati badge thumbnail pored svakog izazova
   - Dodati tooltip sa statistikom (hover: "X users earned this badge")

**Fajlovi za kreiranje/modifikaciju:**
- `apps/admin-panel/components/dashboards/BadgeStatistics.tsx` (novi)
- `apps/admin-panel/app/dashboard/gym/[id]/challenges/page.tsx` (modifikacija)
- `apps/admin-panel/components/modules/ChallengesManager.tsx` (modifikacija - dodati badge preview)

**Integracija sa postojećim kodom:**
- Koristiti `get_badge_statistics()` RPC funkciju iz backend-a
- Koristiti postojeći Supabase server client
- Koristiti postojeći styling (Tailwind CSS)
- Koristiti postojeći chart komponente ako postoje (za vizualizaciju)

**Uspeh kriterijum:**
- Admin vidi koliko korisnika je osvojilo svaki bedž
- Statistika se prikazuje u challenges management stranici
- Badge preview se prikazuje u challenges listi

---

## Redosled Izvršavanja

**Kritična putanja:**
1. **Faza 1.1** → Dodati `badge_image_url` polje (blokira Fazu 3.1)
2. **Faza 1.2** → Kreirati `user_badges` tabelu (blokira Fazu 1.3, 2.2, 2.3)
3. **Faza 1.3** → Modifikovati `add_drops()` (blokira automatsko dodavanje bedževa)
4. **Faza 1.4** → Kreirati RPC funkcije (blokira Fazu 2.2, 2.3, 3.2)
5. **Faza 2.1** → Active Challenges Overlay (nezavisno)
6. **Faza 2.2** → Badge animacija (zavisi od 1.4)
7. **Faza 2.3** → Trophy Room (zavisi od 1.4)
8. **Faza 3.1** → Badge upload (zavisi od 1.1)
9. **Faza 3.2** → Badge statistics (zavisi od 1.4)

**Preporučeni redosled:**
1. Kompletirati Fazu 1 (svi koraci) - Backend osnova
2. Kompletirati Fazu 2 (svi koraci) - Mobile app features
3. Kompletirati Fazu 3 (svi koraci) - Admin panel enhancements

---

## Test Checklist

### Backend Testiranje
- [ ] `challenges` tabela ima `badge_image_url` polje
- [ ] `user_badges` tabela postoji sa svim poljima
- [ ] Kada korisnik završi izazov, bedž se dodaje u `user_badges`
- [ ] Bedž se dodaje samo jednom (unique constraint radi)
- [ ] `get_user_badges()` RPC vraća ispravne podatke
- [ ] `get_badge_statistics()` RPC vraća ispravne statistike

### Mobile App Testiranje
- [ ] Active Challenges Overlay se prikazuje tokom treninga
- [ ] Progress bar-ovi se ažuriraju u real-time
- [ ] Badge animacija se prikazuje u session summary
- [ ] Trophy Room prikazuje sve osvojene bedževe
- [ ] Badge count se prikazuje u home screen header-u

### Admin Panel Testiranje
- [ ] Gym Owner može da upload-uje badge sliku prilikom kreiranja izazova
- [ ] Badge slika se čuva i prikazuje u challenges listi
- [ ] Badge statistics se prikazuju u challenges management stranici
- [ ] Statistika pokazuje tačan broj korisnika koji su osvojili bedž

---

## Napomene za Implementaciju

### Postojeći Kod Hooks

**Backend:**
- `add_drops()` funkcija već filtrira izazove po `gym_id` (linija 128 u `20240101000003_dual_wallet_system.sql`)
- `end_session()` funkcija prosleđuje `gym_id` u `add_drops()` (linija 270-277)
- Challenge progress se automatski ažurira kada se dodaju drops

**Mobile App:**
- `useChallengeProgress()` hook već postoji i prati napredak izazova
- Workout screen već poziva `end_session()` RPC kada se trening završi
- Session summary screen postoji i prikazuje rezultate treninga

**Admin Panel:**
- `ChallengesManager` komponenta već postoji za kreiranje/uređivanje izazova
- Form pattern koristi react-hook-form + zod

### Ključni Fajlovi Reference

**Backend:**
- `backend/supabase/migrations/20240101000003_dual_wallet_system.sql` - `add_drops()` funkcija
- `backend/supabase/migrations/20240101000001_sweatdrop_schema.sql` - `challenges` i `challenge_progress` tabele

**Mobile App:**
- `apps/mobile-app/app/workout.tsx` - Workout screen
- `apps/mobile-app/app/session-summary.tsx` - Session summary screen
- `apps/mobile-app/hooks/useChallengeProgress.ts` - Challenge progress hook
- `apps/mobile-app/components/UserSettingsSheet.tsx` - User settings

**Admin Panel:**
- `apps/admin-panel/components/modules/ChallengesManager.tsx` - Challenges management
- `apps/admin-panel/app/dashboard/gym/[id]/challenges/page.tsx` - Challenges page

---

## Ograničenja & MVP Scope

**Fokus na MVP:**
- Badge upload može biti URL input za početak (file upload može kasnije)
- Push notifikacije su opcione (može se dodati kasnije)
- Badge sharing/social features nisu uključeni u MVP
- Badge kategorije/tipovi nisu uključeni (može se dodati kasnije)

**MVP Success Criteria:**
- ✅ Gym Owner kreira izazov sa badge slikom
- ✅ Korisnik završi workout
- ✅ Backend automatski proverava napredak i dodeljuje bedž
- ✅ Korisnik vidi bedž animaciju u session summary
- ✅ Korisnik vidi sve osvojene bedževe u Trophy Room-u
- ✅ Admin vidi statistiku osvojenih bedževa

---

**Poslednje ažurirano:** 2025-01-27  
**Sledeći pregled:** Nakon završetka Faze 1
