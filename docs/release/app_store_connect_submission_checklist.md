# App Store Connect — Store Submission Checklist (Fillable)

**Product / ops:** Use this document per submission. Copy the file or duplicate the section for each release.  
**Related:** [Mobile Store Release Runbook](../plans/mobile_store_release_ios_android_runbook.md) · [Legal / Privacy Compliance](../plans/legal_privacy_terms_mobile_compliance_checklist.md)

---

## 1. Submission record

| Field | Value |
|--------|--------|
| Release name / ticket | |
| Target live date | |
| Submitted by (name) | |
| App Store Connect app name | |
| Bundle ID | |
| Marketing version (CFBundleShortVersionString) | |
| Build number (CFBundleVersion) | |
| Submission ID (optional) | |

---

## 2. Metadata strings — English (EN)

*Character limits are approximate; verify in App Store Connect at submit time.*

| Field | Max length (guide) | EN copy |
|--------|---------------------|---------|
| **App name** | 30 | |
| **Subtitle** | 30 | |
| **Promotional text** (optional, can change without resubmit) | 170 | |
| **Description** | 4000 | |
| **Keywords** (comma-separated, no spaces after commas) | 100 | |
| **Support URL** | URL | |
| **Marketing URL** (optional) | URL | |
| **Privacy Policy URL** | URL | |
| **Copyright** (e.g. `2026 Your Legal Entity`) | | |
| **Whats New** (release notes for this version) | 4000 | |

**EN — Description draft (paste full text below)**

```
[paste EN description]
```

**EN — Whats New**

```
[paste EN release notes]
```

---

## 3. Metadata strings — Serbian (SR)

*If you use a single primary locale in ASC, still capture SR here for website/Play parity and future localization.*

| Field | SR copy |
|--------|---------|
| **App name** (if localized) | |
| **Subtitle** (if localized) | |
| **Description** | |
| **Keywords** (if applicable) | |
| **Whats New** | |

**SR — Description draft**

```
[paste SR description]
```

**SR — Whats New**

```
[paste SR release notes]
```

---

## 4. Screenshot and preview requirements (iOS)

**Policy:** Supply screenshots for every required **device size class** App Store Connect shows for this app (iPhone required; iPad if the app supports iPad). Re-check [Apple’s current screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications) before each submission.

### 4.1 Required sets (fill what applies)

| Device class (ASC label) | Resolution (typical) | Count (min–max) | Theme (light/dark) | Captured build |
|--------------------------|----------------------|-----------------|--------------------|----------------|
| iPhone 6.7" | e.g. 1290 × 2796 | __ of __ | | |
| iPhone 6.5" | e.g. 1284 × 2778 | __ of __ | | |
| iPhone 5.5" (if still required) | e.g. 1242 × 2208 | __ of __ | | |
| iPad 13" / 12.9" (if iPad) | per ASC | __ of __ | | |
| iPad 11" (if iPad) | per ASC | __ of __ | | |

### 4.2 Shot list (what each image should show)

Number screenshots to match upload order in ASC.

| # | Screen / journey | Caption idea (optional) | Localized? EN / SR |
|---|------------------|-------------------------|---------------------|
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |
| 6 | | | |
| 7 | | | |
| 8 | | | |

### 4.3 App Preview (optional video)

| Item | Value |
|------|--------|
| Include app preview? | Yes / No |
| Locales | |
| Duration | |
| File name / storage link | |

---

## 5. Privacy & compliance (App Store Connect)

### 5.1 App Privacy questionnaire (summary)

*Align answers with actual SDK and server behavior. Update when adding analytics, ads, or new data types.*

| Data type / practice | Collected? | Linked to user? | Used for tracking? | Notes |
|----------------------|------------|-----------------|---------------------|--------|
| Contact info (email, phone) | Y / N | Y / N | Y / N | |
| Health & fitness | Y / N | Y / N | Y / N | |
| Location (precise / coarse) | Y / N | Y / N | Y / N | |
| Identifiers (user ID, device ID) | Y / N | Y / N | Y / N | |
| Usage / diagnostics / crash | Y / N | Y / N | Y / N | |
| Other (list) | | | | |

### 5.2 Encryption / export compliance

| Question | Answer |
|----------|--------|
| Uses encryption beyond standard HTTPS? | Yes / No — details: |
| ERN / compliance documentation reference | |

### 5.3 Age rating (and optional details)

| Field | Value |
|--------|--------|
| Completed questionnaire result | |
| In-app controls / UGC? | |

### 5.4 Significant location, background modes, entitlements

*Brief text for internal alignment; reviewer-facing detail goes in §6.*

| Capability | Used? | User-visible purpose |
|------------|-------|----------------------|
| Location (when in use / always) | | |
| Bluetooth | | |
| Camera | | |
| Push notifications | | |
| Background fetch / audio / other | | |

---

## 6. Reviewer notes & test account

**Paste into App Store Connect → App Review Information → Notes.**

### 6.1 Free-form reviewer notes (draft)

```
[e.g. how to log in, where pilot gyms appear, feature flags, hardware needs, env (staging vs prod)]
```

### 6.2 Test account (do not commit real passwords in git; use a secret store or ticket-only attachment)

| Field | Value |
|--------|--------|
| Sign-in method | Email / Apple / Other: __ |
| Test email / username | |
| Password location (1Password / vault link / ticket) | |
| Pre-requisites (email verified, gym membership, etc.) | |
| Region / timezone for reviewer | |

### 6.3 Demo video / alternate path

| Item | Value |
|------|--------|
| Screen recording link (if any) | |
| Steps if account cannot be used | |

### 6.4 Contact

| Field | Value |
|--------|--------|
| First name | |
| Last name | |
| Phone (with country code) | |
| Email (monitored during review) | |

---

## 7. Phased release (iOS) & halt criteria

### 7.1 Phased release selection

| Choice | Mark |
|--------|------|
| Release to all users immediately | ☐ |
| Phased release over 7 days | ☐ |

### 7.2 Monitoring window (fill targets)

| Metric | Tool / link | Day 1–2 target | Halt if |
|--------|-------------|----------------|--------|
| Crash rate | | e.g. ≤ __% | > __% |
| Auth / session errors | | | |
| Push delivery / registration failures | | | |
| Critical reviews (1★ + keyword) | | | mentions of: __ |
| Backend error rate | | | |

### 7.3 Halt / pause procedure

| Step | Owner | Done |
|------|--------|------|
| Pause phased release in ASC | | ☐ |
| Notify engineering + support | | ☐ |
| File incident / rollback ticket | | ☐ |
| Communicate to stakeholders | | ☐ |

### 7.4 Resume criteria

```
[Define what must be true before resuming rollout or shipping a hotfix build]
```

---

## 8. Sign-off

| Role | Name | Date | Sign-off |
|------|------|------|----------|
| Product | | | ☐ |
| Mobile engineering | | | ☐ |
| QA | | | ☐ |
| Legal / privacy (if material change) | | | ☐ |
