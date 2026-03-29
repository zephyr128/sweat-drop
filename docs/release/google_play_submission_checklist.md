# Google Play Console — Store Submission Checklist (Fillable)

**Product / ops:** Use this document per submission. Copy the file or duplicate the section for each release.  
**Related:** [Mobile Store Release Runbook](../plans/mobile_store_release_ios_android_runbook.md) · [Legal / Privacy Compliance](../plans/legal_privacy_terms_mobile_compliance_checklist.md)

---

## 1. Submission record

| Field | Value |
|--------|--------|
| Release name / ticket | |
| Target live date | |
| Submitted by (name) | |
| Play Console app name | |
| Application ID (package name) | |
| Version name (user-visible) | |
| Version code (integer, monotonic) | |
| Track for first production publish | Internal / Closed / Open / Production |

---

## 2. Store listing metadata — English (EN)

*Character limits can change; confirm in Play Console.*

| Field | Max length (guide) | EN copy |
|--------|---------------------|---------|
| **App name** | 30 | |
| **Short description** | 80 | |
| **Full description** | 4000 | |
| **Privacy policy URL** | URL | |

**EN — Full description (paste below)**

```
[paste EN full description]
```

---

## 3. Store listing metadata — Serbian (SR)

| Field | SR copy |
|--------|---------|
| **App name** (if listing localized) | |
| **Short description** | |
| **Full description** | |

**SR — Full description**

```
[paste SR full description]
```

### 3.1 Custom store listing / translations (optional)

| Locale | Listing name in Play | Notes |
|--------|----------------------|--------|
| sr | | |
| en-US / en-GB | | |
| Other | | |

---

## 4. Graphic assets & screenshot requirements

**Policy:** Meet [Google Play graphic asset requirements](https://support.google.com/googleplay/android-developer/answer/9866151) for your app category and form factors.

### 4.1 Phone (required)

| Requirement | Spec (verify in console) | Your asset |
|-------------|---------------------------|------------|
| Screenshot count | Min 2, max 8 (phone) | __ uploaded |
| Format | PNG or JPEG, 16:9 or 9:16, short side ≥ 1080 px | |
| Optional: edge-to-edge / device frame | Team standard: __ | |

### 4.2 Tablet (if app is eligible / you use tablet screenshots)

| Form factor | Min / max shots | Uploaded |
|-------------|-----------------|----------|
| 7" tablet | | __ |
| 10" tablet | | __ |

### 4.3 Feature graphic (required for most listings)

| Item | Spec | File / link |
|------|------|-------------|
| Feature graphic | 1024 × 500 px | |

### 4.4 Icon & branding

| Asset | Notes |
|-------|--------|
| High-res icon (512 × 512) | |
| Promo video (YouTube URL, optional) | |

### 4.5 Shot list (phone order = Play display order)

| # | Screen / journey | Notes |
|---|------------------|--------|
| 1 | | |
| 2 | | |
| 3 | | |
| 4 | | |
| 5 | | |
| 6 | | |
| 7 | | |
| 8 | | |

---

## 5. Privacy, Data safety, and policy declarations

### 5.1 Data Safety form (summary worksheet)

*Must match runtime behavior, permissions, and backend. Update when adding SDKs or data types.*

| Data category | Collected? | Shared? | Ephemeral / on-device only? | Required vs optional | Purpose summary |
|---------------|------------|---------|-------------------------------|----------------------|-----------------|
| Location | Y / N | Y / N | Y / N | | |
| Personal identifiers (email, name, IDs) | Y / N | Y / N | Y / N | | |
| Health & fitness | Y / N | Y / N | Y / N | | |
| Photos / videos / files | Y / N | Y / N | Y / N | | |
| App activity & diagnostics | Y / N | Y / N | Y / N | | |
| Device or other IDs | Y / N | Y / N | Y / N | | |
| Other (list) | | | | | |

**Encryption in transit:** Yes / No — notes:  

**Deletion request mechanism:** URL or in-app path:  

**Independent security review:** If applicable, link / status:  

### 5.2 Permissions declaration (Play)

| Permission | Declared in Play? | Matches manifest & runtime? | User-facing rationale in app |
|------------|-------------------|-------------------------------|------------------------------|
| `CAMERA` | | | |
| `ACCESS_FINE_LOCATION` / coarse | | | |
| `BLUETOOTH` / `BLUETOOTH_SCAN` / `CONNECT` | | | |
| Notifications | | | |
| Other | | | |

### 5.3 Ads, UGC, target audience

| Declaration | Value |
|-------------|--------|
| Contains ads? | Yes / No |
| UGC / moderation | Yes / No — summary: |
| Target audience / Families (if applicable) | |
| News app / COVID-19 / other program flags | |

### 5.4 Government apps / financial / health program extras

| Program | Applies? | Evidence / form status |
|---------|----------|-------------------------|
| | Y / N | |

---

## 6. Reviewer notes & test access

**Use Play Console fields (e.g. App access, instructions for reviewers) plus this worksheet for consistency.**

### 6.1 App access

| Item | Value |
|------|--------|
| All functionality available without login? | Yes / No |
| If No: reviewer needs credentials? | Yes / No |

### 6.2 Instructions for reviewers (paste into console)

```
[e.g. login steps, test gym, feature flags, BLE/camera needs, staging vs production]
```

### 6.3 Test account (do not store real passwords in git)

| Field | Value |
|--------|--------|
| Sign-in method | Google / Email / Other: __ |
| Test email / username | |
| Password location (vault / ticket) | |
| License / subscription state for tester | |
| Region for tester account | |

### 6.4 Demo / backup

| Item | Value |
|------|--------|
| Demo video link | |
| IP allowlist / env notes | |

---

## 7. Staged rollout percentages & halt criteria

### 7.1 Rollout plan (production)

| Stage | % of users | Timing (date / after stable window) | Actual % set in console |
|-------|------------|----------------------------------------|-------------------------|
| Stage 0 (internal / closed) | N/A | | |
| Stage 1 | e.g. 10% | | |
| Stage 2 | e.g. 25% | | |
| Stage 3 | e.g. 50% | | |
| Stage 4 | 100% | | |

### 7.2 Promotion gates (before increasing %)

| Gate | Metric | Pass criteria |
|------|--------|----------------|
| After 10% | Crash & ANR (Play Vitals) | |
| After 10% | Auth / API error budget | |
| After 25% | Support volume / critical tickets | |
| Before 100% | Product sign-off | |

### 7.3 Halt criteria (any triggers → pause rollout)

| Trigger | Threshold | Owner |
|---------|-----------|--------|
| User-perceived crash rate | > __ vs baseline | |
| ANR rate | > __ | |
| Backend 5xx / auth spike | | |
| Store review 1★ cluster | | |
| Legal / compliance flag | | |

### 7.4 Halt procedure

| Step | Owner | Done |
|------|--------|------|
| Halt release in Play Console (managed publishing if used) | | ☐ |
| Notify engineering + support | | ☐ |
| Open hotfix or rollback track plan | | ☐ |

### 7.5 Resume / hotfix

```
[Conditions to resume staged % or ship replacement versionCode]
```

---

## 8. Pre-submit console checklist (quick)

- [ ] Production AAB uploaded to correct track
- [ ] Release notes (EN) for this version
- [ ] SR listing updated if you publish SR locale
- [ ] Data Safety + Privacy policy URL accurate
- [ ] Content rating questionnaire current
- [ ] Target API level / policy deadlines met
- [ ] Reviewer credentials and instructions provided if required

---

## 9. Sign-off

| Role | Name | Date | Sign-off |
|------|------|------|----------|
| Product | | | ☐ |
| Mobile engineering | | | ☐ |
| QA | | | ☐ |
| Legal / privacy (if material change) | | | ☐ |
