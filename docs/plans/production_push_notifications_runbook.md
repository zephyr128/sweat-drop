# Production Push Notifications Runbook

**Goal:** Guarantee reliable push delivery in production for iOS and Android.

## 1) Credentials and Config

### iOS
- APNs key configured for the correct bundle id.
- App built with production profile and correct project id.

### Android
- FCM credentials configured in Expo/EAS project.
- Production build uses production env vars.

### Environment Split
- Dev tokens remain in dev tables/environment.
- Prod tokens are collected only from production binaries.

## 2) Token Lifecycle Verification

- Fresh install -> login -> token saved in profile.
- Reinstall -> token refresh updates profile token.
- Logout/login -> token remains valid and mapped to user.
- Opt-out notifications -> app respects user choice.

## 3) Delivery Test Matrix

### Direct send test (`send-push`)
- Single token success
- Multi-token partial failure
- Invalid token handling

### Triggered sends
- Happy hour reminder
- Re-engagement
- Staff/admin-triggered campaign

## 4) Deep Link Validation

- Notification tap opens expected screen.
- Background and cold-start cases both validated.

## 5) Monitoring and Alerting

- Log sent/success/failure counts per run.
- Alert on failure spikes by platform.
- Track invalid token rate and cleanup strategy.

### Edge function observability (`send-push` v2)

- **Structured logs:** `send-push` emits one JSON line per invocation (`event: "send-push"`) with `client_ref` (when callers pass it), `requested`, `valid_tokens`, `skipped_invalid`, `deduped_in_request`, `sent` (valid tokens submitted to Expo), `receipt_ok` / `receipt_error` (per Expo ticket), `batches_attempted`, `batches_failed`, and `duration_ms`. Schedulers (`re-engagement`, `streak-reminder`, `drops-expiry-warning`, `finalize-arena`, `notify-arena-participants`, `distribute-leaderboard-prizes`, `send-happy-hour-reminders`) emit their own `event` field for correlation.
- **Response body:** Prefer `receipt_ok` for “actually accepted by Expo for delivery” counts. Legacy `sent` remains the count of valid tokens submitted (after prefix filter + per-request dedupe), not guaranteed deliveries.
- **Batch safety:** `send-push` continues on partial Expo/HTTP failures per 100-message batch; see `batch_summaries` in the JSON body when debugging.
- **Secrets:** Do not log `Authorization` headers, service role keys, or full Expo push tokens. Error logs use truncated messages only.
- **Optional raw batches:** Callers may pass `include_raw_batches: true` on `send-push` for deep debugging; default omits large `result` payloads.

### Idempotency expectations

- **Happy hour reminders:** DB dedupe (`happy_hour_reminder_logs`) is the source of truth; safe under cron retries. Note: the log row is inserted before the push call—if Expo fails after insert, that user will not receive a retry for that window until a new migration/flow changes ordering (operational tradeoff).
- **Re-engagement / streak / drops expiry:** No delivery log table yet; idempotency relies on the scheduler running once per window. Avoid overlapping duplicate cron schedules.

## 6) Go/No-Go Push Gate

- [ ] iOS production push success confirmed on physical device.
- [ ] Android production push success confirmed on physical device.
- [ ] Triggered campaigns deliver with dedupe guarantees.
- [ ] Failure logs are actionable and monitored.

If any item fails -> do not start broad rollout.
