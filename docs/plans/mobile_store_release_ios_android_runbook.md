# Mobile Store Release Runbook (iOS + Android)

**Goal:** Ship SWEATDROP mobile safely to App Store and Play Store with controlled rollout.

## Scope

- `apps/mobile-app`
- App Store Connect
- Google Play Console
- Release operations and QA

## Preconditions

- Production API endpoints configured.
- Production push credentials configured and tested.
- Legal URLs published (Privacy Policy + Terms).
- Release manifest template prepared.

---

## Part 1 - iOS (App Store Connect)

### 1) App Record
- Confirm app id, bundle id, SKU, category, age rating.
- Set support URL, marketing URL, privacy policy URL.

### 2) Metadata
- App name/subtitle/description (EN + SR).
- Keywords and promotional text.
- Screenshots for all required form factors.
- Optional app preview video.

### 3) Build and Signing
- Build with production EAS profile.
- Verify build number increments every submission.
- Ensure distribution certificate + provisioning profile valid.
- Ensure APNs key is active for this app id.

### 4) TestFlight
- Internal test pass required before submission.
- Validate:
  - auth providers,
  - gym listing behavior,
  - check-in and workout flow,
  - redemption,
  - push delivery + deep links.

### 5) App Review Submission
- Fill export compliance.
- Add reviewer notes and test credentials.
- Explain camera/location/bluetooth usage.

### 6) Post-Approval Rollout
- Start with phased release if desired.
- Monitor crashes, auth failures, push failures.
- Pause release if thresholds breached.

---

## Part 2 - Android (Google Play)

### 1) App Record and Listing
- Confirm package id and app category.
- Add short/long description.
- Upload icon, feature graphic, screenshots.

### 2) Policy and Content
- Complete Data Safety.
- Set privacy policy URL.
- Complete content rating.
- Declare ads status and target audience.

### 3) Build and Signing
- Build production AAB.
- Verify versionCode increment per release.
- Use Play App Signing and secure upload key storage.

### 4) Testing Tracks
- Internal testing track first.
- Closed testing for pilot staff/users.
- Validate same critical journeys as iOS.

### 5) Production Rollout
- Staged rollout (recommended): 10% -> 25% -> 50% -> 100%.
- Hold/rollback on anomaly thresholds.

---

## Part 3 - Shared Release Manifest (Mandatory)

Include in release ticket:
- git SHA,
- iOS version/build number,
- Android versionName/versionCode,
- applied migration IDs,
- edge function versions,
- feature flags,
- rollback target versions,
- dashboard + alert links.

Any mismatch -> release hold.

---

## Part 4 - Go/No-Go Checks for Store Release

- [ ] iOS TestFlight smoke passed.
- [ ] Android internal/closed smoke passed.
- [ ] Push works on store-distributed binaries.
- [ ] Privacy + Terms links work in app and store listing.
- [ ] Crash-free baseline acceptable in test cohort.
- [ ] No P0/P1 open issues.

If any check fails -> **No-Go**.
