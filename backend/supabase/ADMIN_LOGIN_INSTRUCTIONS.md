# Kako da se uloguješ kao Admin

## Problem
Ako si pokrenuo `SEED_ADMIN_AUTO.sql`, skripta je samo kreirala profil u `public.profiles` tabeli, ali **nije kreirala korisnika u `auth.users`**. Zbog toga nemaš email i password za login.

## Rešenje: Kreiraj korisnika u Supabase Auth

### Korak 1: Kreiraj korisnika u Supabase Dashboard

1. **Otvori Supabase Dashboard**
   - Idi na: https://supabase.com/dashboard
   - Izaberi svoj projekat

2. **Idi na Authentication**
   - U levom meniju klikni na **"Authentication"**
   - Zatim klikni na **"Users"** tab

3. **Kreiraj novog korisnika**
   - Klikni na dugme **"Add user"** (gore desno)
   - Izaberi **"Create new user"**
   
4. **Unesi podatke**
   - **Email**: `admin@sweatdrop.com` (ili bilo koji email)
   - **Password**: Unesi jak password (npr. `Admin123!`)
   - **Auto Confirm User**: ✅ **OBVEZNO CHECKIRAJ OVO!**
   - **Send invitation email**: Možeš ostaviti prazno
   
5. **Kreiraj korisnika**
   - Klikni **"Create user"**
   - **KOPIRAJ User ID** koji se pojavi (trebaće ti u sledećem koraku)

### Korak 2: Poveži profil sa korisnikom

1. **Otvori SQL Editor**
   - U Supabase Dashboard-u klikni na **"SQL Editor"** u levom meniju

2. **Pokreni ovu skriptu** (zameni `YOUR_USER_ID_HERE` sa kopiranim User ID-om):

```sql
-- Zameni 'YOUR_USER_ID_HERE' sa User ID-om iz koraka 1
UPDATE public.profiles
SET 
  role = 'superadmin',
  admin_gym_id = NULL,
  email = (SELECT email FROM auth.users WHERE id = 'YOUR_USER_ID_HERE')
WHERE id = 'YOUR_USER_ID_HERE';

-- Ako profil ne postoji, kreiraj ga:
INSERT INTO public.profiles (id, email, username, role, admin_gym_id, total_drops)
SELECT 
  id,
  email,
  COALESCE(split_part(email, '@', 1), 'admin'),
  'superadmin',
  NULL,
  0
FROM auth.users
WHERE id = 'YOUR_USER_ID_HERE'
ON CONFLICT (id) DO UPDATE
SET 
  role = 'superadmin',
  admin_gym_id = NULL,
  email = EXCLUDED.email;
```

3. **Verifikuj da je sve OK**:

```sql
SELECT 
  p.id,
  p.email,
  p.username,
  p.role,
  u.email as auth_email,
  u.confirmed_at
FROM public.profiles p
JOIN auth.users u ON p.id = u.id
WHERE p.role = 'superadmin';
```

### Korak 3: Login u Admin Panel

1. **Otvori admin panel**: `http://localhost:3000/login`
2. **Unesi**:
   - **Email**: Email koji si uneo u koraku 1 (npr. `admin@sweatdrop.com`)
   - **Password**: Password koji si uneo u koraku 1
3. **Klikni "Sign in"**

## Alternativa: Ako već imaš korisnika

Ako već imaš korisnika u `auth.users` (možda si se registrovao preko mobile app-a):

1. **Pronađi svoj User ID**:
```sql
SELECT id, email FROM auth.users WHERE email = 'tvoj-email@example.com';
```

2. **Update-uj profil**:
```sql
UPDATE public.profiles
SET 
  role = 'superadmin',
  admin_gym_id = NULL
WHERE id = (SELECT id FROM auth.users WHERE email = 'tvoj-email@example.com');
```

3. **Login sa tim email-om i password-om** koji si koristio za registraciju

## Troubleshooting

### "Invalid login credentials"
- Proveri da li korisnik postoji u `auth.users`
- Proveri da li je `confirmed_at` postavljen (trebalo bi ako si checkirao "Auto Confirm User")
- Proveri da li koristiš tačan email i password

### "User not found"
- Proveri da li profil postoji: `SELECT * FROM public.profiles WHERE email = 'tvoj-email@example.com';`
- Proveri da li je role postavljen: `SELECT role FROM public.profiles WHERE email = 'tvoj-email@example.com';`

### "Access denied"
- Proveri da li je role = 'superadmin': `SELECT role FROM public.profiles WHERE id = 'tvoj-user-id';`
