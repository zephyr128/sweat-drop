# Feature: Verification Gate on Reward Redemption

## Context

Users can currently redeem rewards from the store without proving they are real gym members. To prevent fake account abuse and ensure reward inventory goes to actual members, we gate the `claim_reward` flow behind identity verification.

**Trigger:** When an unverified user taps "Claim" on a reward, they see a verification prompt telling them to visit reception. Once staff verifies them (one-time per gym via `verify_member_identity` RPC), all future redemptions work normally.

**Why redemption, not earlier?** Users can browse, earn drops, and explore freely. Verification only blocks the moment of value extraction (claiming a reward), which:
- Maximizes user engagement before asking for friction
- Creates a natural staff touchpoint
- Protects reward inventory from fake accounts
- Maps to real-world gym workflows (reception verifies membership)

## Dependencies

- [x] `gym_member_identities` table exists (migration `20260327000002`)
- [x] `is_verified` column exists on `gym_member_identities`
- [x] `verify_member_identity` RPC exists (staff-callable)
- [x] `gmi_user_own_select` RLS policy exists (users can read their own row)
- [x] `claim_reward` RPC exists (latest: `20260325000020`)
- [x] `reward-detail.tsx` exists with `confirmRedeem` → `handleRedeem` flow
- [x] i18n setup with EN/SR locale files for `store` namespace

## Execution Plan

### Step 1: Database — Add verification check to `claim_reward` (supabase-dba)

**Migration:** `20260331100000_gate_claim_reward_on_verification.sql`

Add a verification check **early** in `claim_reward()`, after reward validation but before balance checks:

```sql
-- After "Reward is not active" / stock / limit checks, before balance deduction:

-- Check identity verification
IF NOT EXISTS (
  SELECT 1 FROM public.gym_member_identities
  WHERE user_id = p_user_id
    AND gym_id = p_gym_id
    AND is_verified = true
) THEN
  RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT,
    'VERIFICATION_REQUIRED'::TEXT;
  RETURN;
END IF;
```

**Key decisions:**
- Error message is a machine-readable constant `VERIFICATION_REQUIRED` (not user-facing text) so the mobile app can pattern-match and show the right UI
- Check goes after limit/stock/active checks but before balance deduction — no point telling them to verify if the reward is out of stock
- No new table or column needed — uses existing `gym_member_identities.is_verified`

**After migration:**
- Run `supabase db push`
- Verify with a test: unverified user calls `claim_reward` → gets `VERIFICATION_REQUIRED`

---

### Step 2: Mobile App — Add verification check + UI gate (mobile-coder)

#### 2a. Add `VERIFICATION_REQUIRED` to error classifier

**File:** `apps/mobile-app/lib/security/reward-claim-errors.ts`

Add a new error kind `'verification_required'` that matches on `VERIFICATION_REQUIRED` in the error message string. This keeps it consistent with the existing `classifyRewardClaimError` pattern.

#### 2b. Add verification status hook or inline check

**File:** `apps/mobile-app/app/reward-detail.tsx`

On screen mount (alongside `loadReward` and `checkClaimed`), query the user's verification status:

```typescript
const checkVerification = useCallback(async () => {
  if (!session?.user || !activeGymId) return;
  const { data } = await supabase
    .from('gym_member_identities')
    .select('is_verified')
    .eq('user_id', session.user.id)
    .eq('gym_id', activeGymId)
    .maybeSingle();
  setIsVerified(data?.is_verified === true);
}, [session?.user, activeGymId]);
```

Add state: `const [isVerified, setIsVerified] = useState<boolean | null>(null);`

#### 2c. Gate the "Claim" button tap

In `confirmRedeem()`, before showing the confirmation modal, check `isVerified`:

```typescript
const confirmRedeem = () => {
  if (!reward) return;
  if (!isVerified) {
    showModal({
      title: t('verificationRequired'),
      body: t('verificationRequiredBody'),
      buttons: [
        { label: t('common:gotIt'), style: 'cancel' },
      ],
    });
    return;
  }
  // ... existing confirmation modal
};
```

#### 2d. Also handle the backend error (defense in depth)

In `handleRedeem`, add `verification_required` to the error handling switch:

```typescript
} else if (kind === 'verification_required') {
  showModal({ title: t('verificationRequired'), body: t('verificationRequiredBody') });
```

#### 2e. Optional: Show verification status badge on info card

In the info card section of `reward-detail.tsx`, add a row showing verification status when the user is NOT verified:

```
🛡️ Verification    ⚠️ Not verified
```

This is a subtle hint even before they tap Claim.

---

### Step 3: Localization — Add EN/SR strings (mobile-coder)

**File:** `apps/mobile-app/locales/en/store.json`

Add:
```json
"verificationRequired": "Verification Required",
"verificationRequiredBody": "Please visit the reception desk to verify your identity. This is a one-time step required before claiming rewards.",
"notVerified": "Not verified",
"verified": "Verified",
"verificationStatus": "Verification"
```

**File:** `apps/mobile-app/locales/sr/store.json`

Add:
```json
"verificationRequired": "Potrebna verifikacija",
"verificationRequiredBody": "Poseti recepciju da potvrdiš svoj identitet. Ovo je jednokratni korak pre preuzimanja nagrada.",
"notVerified": "Nije verifikovan/a",
"verified": "Verifikovan/a",
"verificationStatus": "Verifikacija"
```

**File:** `apps/mobile-app/locales/en/common.json` (if `gotIt` doesn't exist)

Check if `gotIt` key exists; if not add: `"gotIt": "Got it"`

**File:** `apps/mobile-app/locales/sr/common.json`

If needed: `"gotIt": "Važi"`

---

### Step 4: Admin Panel — No changes required

The admin panel already has:
- `verify_member_identity` RPC available to staff
- Identity management in the member detail view
- Receptionist role can verify members

No admin panel changes needed for this feature. Receptionists already have the tools to verify users.

---

## Data Flow

```
User taps "Claim" on reward-detail.tsx
  │
  ├─ [Client check] isVerified === false?
  │   └─ Show verification modal → STOP
  │
  ├─ [Client check] isVerified === true
  │   └─ Show confirmation modal → User confirms
  │       │
  │       └─ Call claim_reward RPC
  │           │
  │           ├─ [Server check] gym_member_identities.is_verified = false?
  │           │   └─ Return VERIFICATION_REQUIRED → Show modal
  │           │
  │           └─ [Server check] verified = true
  │               └─ Normal claim flow (balance, deduct, code, etc.)
```

## Edge Cases

1. **User has no row in `gym_member_identities`** — Treated as unverified (NOT EXISTS handles this). No need to create a row until staff verifies them.
2. **User switches gym** — Verification is per-gym. New gym = new verification needed. This is correct.
3. **Race condition** — Backend is the source of truth. Even if client cache says verified, backend re-checks.
4. **Staff un-verifies a user** — Backend will reject next claim. Client will re-fetch on next screen focus.

## Testing Requirements

- [ ] Unverified user taps Claim → sees verification modal (client-side)
- [ ] Unverified user somehow bypasses client → backend returns `VERIFICATION_REQUIRED`
- [ ] Staff verifies user via admin panel → user can now claim rewards
- [ ] User with no `gym_member_identities` row → treated as unverified
- [ ] Verified user at Gym A, switches to Gym B → unverified at Gym B
- [ ] All existing verified users → no change in behavior
- [ ] EN and SR strings render correctly
- [ ] Error classifier correctly maps `VERIFICATION_REQUIRED`

## Rollback

- Remove the verification check from `claim_reward` (revert to previous version)
- Remove client-side verification check in `reward-detail.tsx`
- Remove locale keys (optional, harmless to leave)
