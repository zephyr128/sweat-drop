# External Pilot Release — Multi-Agent Execution Plan

> Plan za pilot launch SweatDrop-a u Vortex teretani: prod build distribuiran preko TestFlight (public link) + Play Closed Testing (web link). Trenutno gole 5× tap simulator gesture na scanner ekranu se pretvara u **server-gated demo flow** (Apple/Google reviewer + interni QA). Realni Vortex korisnici nikada ne vide simulator.
>
> **Ne otvaraj ovaj fajl agentu — pošalji mu samo njegov korak.** Ovaj README je za tebe (CEO/architect) da vidiš redosled i zavisnosti.

---

## Arhitekturna odluka (sažeto)

- `profiles.is_demo BOOLEAN` — server-side flag, samo superadmin sme da menja.
- `machines.is_demo_machine BOOLEAN` — markira mašine na koje demo nalozi smeju da kače simulator sesije.
- RPC `get_my_demo_machine()` — vraća prvu demo mašinu za caller-ov gym **ako je** caller `is_demo = true`. Bez RPC = bez simulatora u prod build-u.
- `EXPO_PUBLIC_DEV_QR_UUID` — ostaje samo u dev/preview EAS profilima kao developer convenience. **Prod build ga nema.**
- Mobile gate: 5× tap radi samo ako `useIsDemoUser() && useDemoMachine().qrUuid`.
- **Triple defense:** server flag (profil) + server flag (mašina) + odsustvo env vara u prod-u. Bilo koji od tri promaše = simulator ne može.
- **Vidljiv `DemoModeBanner`** kada je user demo (narandžasti pill na vrhu) — Apple reviewer i QA uvek vide da su u demo modu.

---

## Koraci i zavisnosti

```
Step 1 (DBA)  ──┬──► Step 2 (Mobile coder) ──► Step 3 (Mobile UI/UX)
                │                                       │
                └──► Step 4 (Admin coder)               │
                                                        ▼
                                           Step 6 (Reviewer audit)
                                                        │
                                                        ▼
                                              Step 5 (DevOps + Stores)
```

**Kritični put:** 1 → 2 → 3 → 6 → 5. Step 4 može paralelno sa 2/3, ali mora biti gotov pre nego što DevOps pošalje link Vortex korisnicima (jer admin treba da bude u stanju da menja demo flag bez SQL-a).

---

## Fajlovi za prosleđivanje (po agentu)

| Agent | Fajl koji mu šalješ | Trajanje | Blocker za |
|-------|---------------------|----------|------------|
| **supabase-dba** | [`01_supabase_dba.md`](./01_supabase_dba.md) | 2–3 h | Step 2, 4 |
| **mobile-coder** | [`02_mobile_coder.md`](./02_mobile_coder.md) | 1.5 h | Step 3, 5 |
| **mobile-ui-ux-agent** | [`03_mobile_ui_ux.md`](./03_mobile_ui_ux.md) | 30 min | Step 5 |
| **admin-coder** | [`04_admin_coder.md`](./04_admin_coder.md) | 3–4 h | seedovanje demo mašina kroz UI |
| **devops** *(ti)* | [`05_devops.md`](./05_devops.md) | 1 h aktivno + 1–3 dana review | pilot start |
| **reviewer** | [`06_reviewer.md`](./06_reviewer.md) | 1 h | merge na `main` |

---

## Realističan total

**2–4 radna dana** za sav code rad i testing + **1–3 dana** Apple/Google Beta review = **link u rukama Vortex testera za nedelju dana**.

---

## Master plan (puni kontekst)

Originalni single-file plan je u [`../external_pilot_release_plan.md`](../external_pilot_release_plan.md). Ovi koraci su iz njega derivirani 1:1 — ako neki agent treba dublji kontekst, pošalji mu i taj fajl.

---

## Posle merge-a

Update sledeće dokumente (Step 6 ovo verifikuje):
- `CHANGELOG.md`
- `MIGRATION_NOTES.md`
- `STATE_OF_THE_APP.md` → "Current Focus: External pilot release — Vortex"

---

## Out of scope (sledeća iteracija, ne sad)

- Razdvajanje bundle ID-a `com.sweatdrop.app.dev`.
- Auto-reset demo session-a (cron koji čisti drops/redemptions svakih 24h).
- Multi-gym sales demo flow.
- Open Testing track / public Play Store rollout (dolazi posle stabilnog Vortex pilota).
