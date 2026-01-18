# SmartCoach System Migration - Setup Instructions

## Migracija: `20240101000031_smartcoach_system.sql`

Ova migracija kreira kompletan SmartCoach sistem:
- Tabele: `coach_profiles`, `workout_plans`, `workout_plan_items`, `active_subscriptions`, `live_sessions`
- RPC funkcije: `get_user_active_plan`, `get_plan_item_for_machine`, `upsert_live_session`, `close_stale_live_sessions`
- RLS politike za sve tabele
- Automatsko zatvaranje stale sesija (2+ minuta bez update-a)

## Način 1: Supabase Dashboard (SQL Editor)

### Korak 1: Otvori SQL Editor
1. Idi na [Supabase Dashboard](https://supabase.com/dashboard)
2. Izaberi svoj projekt
3. Klikni na **SQL Editor** u levoj navigaciji

### Korak 2: Kopiraj i pokreni migraciju
1. Otvori fajl: `backend/supabase/migrations/20240101000031_smartcoach_system.sql`
2. Kopiraj **CEO** sadržaj fajla
3. Zalepi u SQL Editor
4. Klikni **RUN** (ili pritisni `Ctrl+Enter` / `Cmd+Enter`)

### Korak 3: Proveri da li je migracija uspešna
- Trebalo bi da vidiš poruku: "Success. No rows returned"
- Proveri tabele: Table Editor > trebalo bi da vidiš nove tabele:
  - `coach_profiles`
  - `workout_plans`
  - `workout_plan_items`
  - `active_subscriptions`
  - `live_sessions`

## Način 2: Supabase CLI (ako koristiš lokalni Supabase)

```bash
# 1. Idi u root projekta
cd /Users/np/Projects/sweatdrop

# 2. Poveži se sa Supabase projektom (ako nisi)
supabase link --project-ref your-project-ref

# 3. Pokreni migraciju
supabase db push

# Ili direktno pokreni SQL fajl
supabase db execute --file backend/supabase/migrations/20240101000031_smartcoach_system.sql
```

## Način 3: Direktno preko psql (ako imaš pristup)

```bash
# Iz backend/supabase direktorijuma
psql -h your-supabase-host.supabase.co \
     -U postgres \
     -d postgres \
     -f migrations/20240101000031_smartcoach_system.sql
```

## Post-migracija: Opcionalno - Automatsko zatvaranje sesija (pg_cron)

### Korak 1: Omogući pg_cron extension
1. U Supabase Dashboard, idi na **Database** > **Extensions**
2. Pretraži "pg_cron"
3. Klikni **Enable**

### Korak 2: Zakazi automatski cleanup (svake 2 minuta)

U SQL Editor, pokreni:

```sql
SELECT cron.schedule(
  'close-stale-live-sessions',
  '*/2 * * * *', -- Cron expression: svake 2 minuta
  $$SELECT public.close_stale_live_sessions();$$
);
```

### Korak 3: Proveri da li je zakazano

```sql
SELECT * FROM cron.job WHERE jobname = 'close-stale-live-sessions';
```

### Da ukloniš zakazivanje (ako treba):

```sql
SELECT cron.unschedule('close-stale-live-sessions');
```

## Provera uspešnosti migracije

Nakon pokretanja migracije, proveri da li sve radi:

### 1. Proveri da li postoje tabele:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'coach_profiles',
    'workout_plans',
    'workout_plan_items',
    'active_subscriptions',
    'live_sessions'
  )
ORDER BY table_name;
```

Trebalo bi da vidiš svih 5 tabela.

### 2. Proveri da li postoje funkcije:

```sql
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name IN (
    'get_user_active_plan',
    'get_plan_item_for_machine',
    'upsert_live_session',
    'close_stale_live_sessions'
  )
ORDER BY routine_name;
```

Trebalo bi da vidiš sve 4 funkcije.

### 3. Testiraj RPC funkciju (opciono):

```sql
-- Test get_plan_item_for_machine (vratiće prazan rezultat ako nema planova)
SELECT * FROM public.get_plan_item_for_machine(
  '00000000-0000-0000-0000-000000000000'::UUID, -- plan_id
  '00000000-0000-0000-0000-000000000000'::UUID, -- machine_id
  0 -- current_index
);
```

## Troubleshooting

### Problem: "relation already exists"
- Rešenje: Migracija koristi `CREATE TABLE IF NOT EXISTS`, tako da bi trebalo da prođe. Ako ipak dobiješ grešku, verovatno je tabela već kreirana - proveri Table Editor.

### Problem: "permission denied for schema"
- Rešenje: Proveri da si ulogovan kao `postgres` user ili da imaš potrebne dozvole.

### Problem: "extension pg_cron does not exist"
- Rešenje: pg_cron extension nije dostupan u svim Supabase planovima. Ako nije dostupan, pozivaj `close_stale_live_sessions()` iz backend servisa (Edge Function, API route, itd.) svake 2 minuta.

### Problem: RPC funkcije ne rade
- Rešenje: Proveri da li su GRANT EXECUTE permissions postavljene:
```sql
GRANT EXECUTE ON FUNCTION public.get_user_active_plan(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_plan_item_for_machine(UUID, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_live_session(UUID, UUID, UUID, INTEGER, UUID, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_stale_live_sessions() TO authenticated;
```

## Sledeći koraci

1. ✅ Migracija pokrenuta
2. ✅ Tabele kreirane
3. ✅ RPC funkcije dostupne
4. ⬜ (Opcionalno) pg_cron zakazan
5. ⬜ Testiraj kreiranje workout plana u admin panelu
6. ⬜ Testiraj mobile app SmartCoach integraciju

## Dokumentacija

- **Mapping Logic:** `backend/supabase/SMARTCOACH_MAPPING_LOGIC.md`
- **README:** `backend/supabase/SMARTCOACH_README.md`
- **TypeScript Types:** `backend/types/smartcoach.types.ts`
