# Step 3 — Mobile UI/UX: Vidljiv "DEMO MODE" Banner (mobile-ui-ux-agent)

> **Za koga:** `mobile-ui-ux-agent`. Radiš samo u `apps/mobile-app/`.
>
> **Tvoja uloga (po `.cursor/rules/mobile-ui-ux-agent.mdc`):** UI/UX consistency posle mobile-coder-a. Premium aesthetic, dynamic branding, EN/SR parity, glassmorphism gde priliči.

---

## Mandatory pre-read

1. `CHANGELOG.md` — recent UI decisions.
2. `ARCHITECTURE.md` (sekcija "Mobile App Design System") — design tokens, BlurView pattern.
3. `STATE_OF_THE_APP.md` — current focus.
4. `apps/mobile-app/app/_layout.tsx` — root layout u koji ide banner.
5. Step 2 fajl ([`02_mobile_coder.md`](./02_mobile_coder.md)) — da znaš da `useIsDemoUser` postoji.

---

## Dependencies (BLOCKER)

- ✅ Step 2 (mobile-coder) merged → `apps/mobile-app/hooks/useIsDemoUser.ts` postoji.

Ako hook nije dostupan, **STOP** i javi.

---

## Context

Apple/Google reviewer-i i interni QA tim treba **uvek vizuelno** da vide kada su u demo modu. Razlozi:
- Sprečava konfuziju "zašto su moji drops nestali" (demo nalozi mogu biti reset-ovani).
- Daje reviewer-u jasnu potvrdu da gesture za simulator radi (videćemo banner → znamo da možemo da kliknemo 5× tap).
- Sprečava team da slučajno koristi demo nalog u prod-u za realne testove.

Realni Vortex korisnici **nikad ne vide ovaj banner** (`is_demo = false` → komponenta vraća `null`).

---

## Tasks

### 3.1 Komponenta `DemoModeBanner`

**Kreiraj:** `apps/mobile-app/components/DemoModeBanner.tsx`

```typescript
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useIsDemoUser } from '@/hooks/useIsDemoUser';

/**
 * Slim banner shown across the app when the signed-in user has is_demo = true.
 * Gives Apple reviewers and internal QA visual confirmation they're in
 * a demo session. Real users never see this.
 *
 * Color choice: orange (#FF9900) intentionally diverges from any gym
 * branding palette so it's instantly recognizable as out-of-band UI.
 */
export function DemoModeBanner() {
  const isDemo = useIsDemoUser();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation('common');

  if (!isDemo) return null;

  return (
    <View
      style={[styles.container, { paddingTop: insets.top }]}
      pointerEvents="none"
    >
      <View style={styles.pill}>
        <Text style={styles.text}>{t('demoMode')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    alignItems: 'center',
    zIndex: 9999,
  },
  pill: {
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 153, 0, 0.95)',
  },
  text: {
    color: '#000',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
```

**Dizajn principi (poštuj):**
- `pointerEvents="none"` — ne sme da blokira tap-ove ispod sebe (tab bar, scan area).
- `zIndex: 9999` — uvek na vrhu, preko Stack-a.
- `paddingTop: insets.top` — respect safe area na uređajima sa notch-em.
- **Ne** koristi `useBranding()` — narandžasta je intencional (signal "ovo nije normalno").
- Ne koristi BlurView — banner mora biti instantno čitljiv, glass effect bi smanjio kontrast.

### 3.2 Mount banner u root layout

**Fajl:** `apps/mobile-app/app/_layout.tsx`

Ubaci `<DemoModeBanner />` kao **poslednji child** unutar root return-a, posle Stack-a, da renderuje preko svih ekrana:

```typescript
import { DemoModeBanner } from '@/components/DemoModeBanner';

// Inside RootLayout return:
<>
  <Stack screenOptions={...}>
    {/* ...existing screens nepromenjeno... */}
  </Stack>
  <DemoModeBanner />
</>
```

> Ako `_layout.tsx` već ima više wrappera (ThemeProvider, GestureHandlerRootView itd.), ubaci `<DemoModeBanner />` unutar najouter-nijeg providera koji obezbeđuje `SafeAreaInsets` (`SafeAreaProvider`) i koji je iznad svake navigacije.

### 3.3 Localization (EN + SR parity)

**Fajl:** `apps/mobile-app/locales/en/common.json`

Dodaj:
```json
{
  "demoMode": "DEMO MODE — simulator unlocked"
}
```

**Fajl:** `apps/mobile-app/locales/sr/common.json`

Dodaj:
```json
{
  "demoMode": "DEMO REŽIM — simulator otključan"
}
```

> Ako `common` namespace ne postoji u `locales/`, kreiraj oba fajla. Proveri kako su drugi namespace-i (`scanner`, `home`, `onboarding`) registrovani u i18n config-u (`apps/mobile-app/lib/i18n.ts` ili sl.) i dodaj `common` istom šemom.

---

## UX Checklist (po `.cursor/rules/mobile-ui-ux-agent.mdc`)

- [ ] Banner ne preklapa kritične akcije (zauzima samo top safe-area + ~24px).
- [ ] `pointerEvents="none"` testiran — tap kroz banner radi.
- [ ] EN i SR oba ima `demoMode` ključ.
- [ ] `useIsDemoUser` selector pattern (ne re-rendera kompletan layout pri svakom auth update-u).
- [ ] Visible na svim ekranima (home, scanner, wallet, store) kada je demo.
- [ ] Nevidljiv kad nije demo (komponenta vrati `null` rano, bez `useEffect` side effect-a).
- [ ] Nije dirano: drugi workspace-i (`apps/admin-panel/`, `backend/supabase/`).
- [ ] Boja `#FF9900` nije zamenjena sa branding bojom — održava signal "out-of-band UI".

---

## Smoke test

```bash
pnpm env:dev
pnpm dev:mobile
```

1. Login kao non-demo user → banner ne sme da postoji nigde.
2. U DEV Supabase: `UPDATE profiles SET is_demo = true WHERE email = '<tvoj-email>';`
3. Pull-to-refresh ili sign out / sign in → narandžasti pill se pojavi na vrhu svakog ekrana.
4. Promeni jezik na SR → tekst pill-a postane "DEMO REŽIM — simulator otključan".
5. Tap kroz banner na home screen → tap radi normalno.
6. `UPDATE profiles SET is_demo = false` → refresh → banner nestaje.

---

## Handoff

Reviewer (Step 6) verifikuje:
- Banner postoji za demo, ne za realne usere.
- Translation parity.
- Boja je narandžasta (signal-grade), ne branded.

---

## Out of scope za tebe

- ❌ Bilo šta van `apps/mobile-app/`.
- ❌ Promena logike `useIsDemoUser` (mobile-coder zaduženje).
- ❌ Dodavanje banner-a na admin panelu (admin-coder ako bude trebalo, što verovatno nije neophodno).
