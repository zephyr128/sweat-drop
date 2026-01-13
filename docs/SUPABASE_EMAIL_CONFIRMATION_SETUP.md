# Kako da popraviš Sign Up Problem - Email Confirmation

## Problem

Kada pokušaš da se registruješ sa email/password, ništa se ne dešava ili dobijaš grešku.

## Uzrok

Supabase može da zahteva **email confirmation** pre nego što korisnik može da se uloguje. Ako je email confirmation omogućen, korisnik mora da klikne na link u email-u pre nego što može da nastavi.

## Rešenje

### Opcija 1: Onemogući Email Confirmation (Za Development)

1. Idi na **Supabase Dashboard** > **Authentication** > **Providers**
2. Klikni na **Email** provider
3. Pronađi opciju **"Confirm email"** ili **"Enable email confirmations"**
4. **Onemogući** je (toggle OFF)
5. Klikni **"Save"**

**Napomena:** Ovo je dobro za development/testing, ali za produkciju bi trebalo da omogućiš email confirmation.

### Opcija 2: Omogući Email Confirmation (Za Produkciju)

Ako želiš da zadržiš email confirmation:

1. Proveri da li je email confirmation omogućen u Supabase
2. Kada se korisnik registruje, Supabase će poslati email sa confirmation link-om
3. Korisnik mora da klikne na link u email-u
4. Nakon toga, korisnik može da se uloguje

**Kod je već ažuriran** da prikazuje poruku "Check your email" kada je email confirmation potreban.

## Provera

### 1. Proveri Supabase Settings

**Supabase Dashboard** > **Authentication** > **Providers** > **Email**:
- Proveri da li je **"Enable email confirmations"** ON ili OFF
- Proveri da li je **"Enable sign ups"** ON

### 2. Proveri Email Templates

**Supabase Dashboard** > **Authentication** > **Email Templates**:
- Proveri da li postoji "Confirm signup" template
- Ako ne postoji, Supabase će koristiti default template

### 3. Proveri Console Logs

U Expo DevTools ili terminal, proveri da li vidiš:
- `Sign up error:` - ako postoji greška
- `Sign up exception:` - ako postoji exception

### 4. Proveri Network Requests

U Expo DevTools, proveri Network tab:
- Da li se šalje request na Supabase?
- Koji je status code (200, 400, 500)?
- Šta je u response body?

## Troubleshooting

### Problem: "User already registered"

**Rešenje:**
- Korisnik sa tim email-om već postoji
- Pokušaj sa drugim email-om ili uloguj se umesto sign up

### Problem: "Email rate limit exceeded"

**Rešenje:**
- Previše email-ova je poslato u kratkom vremenu
- Sačekaj nekoliko minuta ili onemogući email confirmation za development

### Problem: Email ne stiže

**Rešenje:**
1. Proveri spam folder
2. Proveri da li je email adresa tačna
3. Proveri Supabase email settings (možda nije konfigurisan SMTP)
4. Za development, onemogući email confirmation

### Problem: "Invalid email" greška

**Rešenje:**
- Proveri da li je email format validan
- Proveri da nema razmaka u email-u

## Kod Ažuriranja

Kod je već ažuriran da:
1. Prikazuje poruku ako je email confirmation potreban
2. Loguje greške u console
3. Bolje obrađuje različite scenarije

## Preporuka za Development

Za development/testing, **onemogući email confirmation**:
- Brže testiranje
- Ne zavisi od email servisa
- Lakše za debugging

Za produkciju, **omogući email confirmation**:
- Bolja sigurnost
- Verifikacija email adresa
- Manje spam naloga
