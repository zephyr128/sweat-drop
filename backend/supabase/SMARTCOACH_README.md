# SmartCoach System

**Unified Content Provider:** Coaches and Gyms create workout plans. Users subscribe and follow plans in the mobile app with live monitoring.

## Overview

The SmartCoach system allows:
- **Freelance Coaches** to create and sell workout plans
- **Gyms** to create official plans (e.g., "Achilles Fat Burner")
- **Users** to subscribe to plans and follow them in the gym using QR scanning
- **Live Monitoring** where coaches/gyms can see real-time workout data (RPM, heart rate, etc.)

## Database Schema

### Tables Created

1. **`coach_profiles`** - Extended profiles for freelance trainers
   - `bio`, `specialty`, `rate_per_session`
   - `rating`, `total_sessions`

2. **`workout_plans`** - Polymorphic ownership (coach OR gym)
   - `coach_id` OR `gym_id` (mutually exclusive)
   - `access_level`: `'public'`, `'private'`, `'gym_members_only'`
   - `price`, `currency` (for paid plans)
   - `difficulty_level`, `category`, `thumbnail_url`

3. **`workout_plan_items`** - Individual exercises within a plan
   - `order_index` (sequence within plan)
   - `target_machine_type`: `'treadmill'` or `'bike'`
   - `target_metric`: `'time'`, `'reps'`, `'distance'`, `'rpm'`, `'custom'`
   - `target_value` (e.g., 10 minutes, 4 reps, 5.0 km)
   - `target_machine_id` (optional: lock to specific machine, or NULL for any machine of that type)

4. **`active_subscriptions`** - User subscriptions to plans/coaches
   - `plan_id` OR `coach_id` (based on `subscription_type`)
   - `status`: `'active'`, `'paused'`, `'completed'`, `'cancelled'`
   - `current_exercise_index` (tracks progress)

5. **`live_sessions`** - Real-time workout monitoring
   - Updated every 5 seconds from mobile app
   - `current_metrics` (JSONB): `{rpm: 85, heart_rate: 130, ...}`
   - `current_exercise_index`, `current_item_id`, `current_machine_id`
   - Coaches/gyms can subscribe via Supabase Realtime

### Key Functions

- **`get_user_active_plan(user_id)`** - Returns current active plan for a user
- **`get_plan_item_for_machine(plan_id, machine_id, current_index)`** - **CRITICAL:** Maps scanned machine QR to plan item

## QR Code → Plan Item Mapping

**Problem:** When a user scans a QR code on a machine, how do we know which exercise in their plan corresponds to that machine?

**Solution:** The `get_plan_item_for_machine()` RPC function:
1. Takes `plan_id`, `machine_id` (scanned), and `current_index`
2. Matches `workout_plan_items.target_machine_type` with `machines.type`
3. If `target_machine_id IS NULL`: matches any machine of that type
4. If `target_machine_id IS NOT NULL`: matches only that specific machine
5. Filters `order_index >= current_index` (only future/current exercises)
6. Returns first matching item

**See:** `SMARTCOACH_MAPPING_LOGIC.md` for detailed explanation and code examples.

## RLS Policies

- **Public plans:** Anyone can view (`access_level = 'public'`)
- **Private plans:** Only subscribers and owners can view
- **Gym plans:** Only gym members and gym admins can view
- **Live sessions:** Users can manage their own; coaches/gyms can view sessions for their plans
- **Coaches:** Can manage their own plans and view subscriptions
- **Gym admins:** Can manage their gym's plans and view subscriptions

## Migration Instructions

```bash
# Run the migration
psql -U postgres -d your_database -f backend/supabase/migrations/20240101000031_smartcoach_system.sql

# Or via Supabase CLI
supabase db reset  # If testing
supabase migration up
```

## TypeScript Types

See `backend/types/smartcoach.types.ts` for complete TypeScript interfaces:
- `CoachProfile`
- `WorkoutPlan`
- `WorkoutPlanItem`
- `ActiveSubscription`
- `LiveSession`
- `MachineToPlanItemMapping` (for mapping logic)

## Mobile App Integration

### 1. Scan QR Code
```typescript
// Extract machine UUID from QR: "sweatdrop://machine/abc-123"
const machineUuid = extractMachineUUID(qrData);

// Get machine
const { data: machine } = await supabase
  .from('machines')
  .select('*')
  .eq('qr_uuid', machineUuid)
  .single();
```

### 2. Get Active Plan
```typescript
// Get user's active subscription
const { data: subscription } = await supabase
  .from('active_subscriptions')
  .select('*, plan:workout_plans(*)')
  .eq('user_id', userId)
  .eq('status', 'active')
  .single();
```

### 3. Map Machine to Plan Item
```typescript
// Use RPC function to find matching exercise
const { data: planItem } = await supabase
  .rpc('get_plan_item_for_machine', {
    p_plan_id: subscription.plan_id,
    p_machine_id: machine.id,
    p_current_index: subscription.current_exercise_index
  })
  .single();
```

### 4. Start Live Session
```typescript
// Create/update live_sessions record
const { data: liveSession } = await supabase
  .from('live_sessions')
  .upsert({
    user_id: userId,
    subscription_id: subscription.id,
    plan_id: subscription.plan_id,
    current_exercise_index: planItem.order_index,
    current_item_id: planItem.item_id,
    current_machine_id: machine.id,
    current_metrics: {},
    status: 'active'
  })
  .select()
  .single();
```

### 5. Update Live Session (Every 5 Seconds)
```typescript
// In workout.tsx, add to useFrameCallback or setInterval
const updateLiveSession = async () => {
  await supabase
    .from('live_sessions')
    .update({
      current_metrics: {
        rpm: currentRPM,
        heart_rate: currentHeartRate,
        distance_km: currentDistance,
        calories: currentCalories,
        drops: currentDrops
      },
      last_updated_at: new Date().toISOString()
    })
    .eq('id', liveSessionId);
};
```

## Web Dashboard: Live Monitoring

Coaches and gym admins can subscribe to real-time updates:

```typescript
const subscription = supabase
  .channel('live_sessions')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'live_sessions',
      filter: `plan_id=eq.${planId}`
    },
    (payload) => {
      // Update UI with real-time data
      updateLiveSessionData(payload.new);
    }
  )
  .subscribe();
```

## Example Workout Plan

```json
{
  "id": "plan-123",
  "name": "Achilles Fat Burner",
  "gym_id": "gym-xyz",
  "access_level": "gym_members_only",
  "items": [
    {
      "order_index": 0,
      "exercise_name": "Bike Warm-up",
      "target_machine_type": "bike",
      "target_metric": "time",
      "target_value": 10,
      "target_unit": "minutes",
      "target_machine_id": null  // Any bike works
    },
    {
      "order_index": 1,
      "exercise_name": "Lat Pull-down",
      "target_machine_type": "bike",  // If using bike for resistance
      "target_metric": "reps",
      "target_value": 4,
      "target_unit": "sets",
      "sets": 4,
      "rest_seconds": 60
    },
    {
      "order_index": 2,
      "exercise_name": "Treadmill Sprint",
      "target_machine_type": "treadmill",
      "target_metric": "distance",
      "target_value": 2.0,
      "target_unit": "km",
      "target_machine_id": null  // Any treadmill works
    }
  ]
}
```

## Next Steps

1. **Run Migration:** Execute `20240101000031_smartcoach_system.sql`
2. **Generate Types:** Update `database.types.ts` with new tables
3. **Implement Mobile App:** Add QR scanning → plan item mapping logic
4. **Build Web Dashboard:** Create coach/gym plan creation UI and live monitoring
5. **Test End-to-End:** User subscribes → scans QR → follows plan → coach monitors

## Files

- **Migration:** `backend/supabase/migrations/20240101000031_smartcoach_system.sql`
- **TypeScript Types:** `backend/types/smartcoach.types.ts`
- **Mapping Logic Docs:** `backend/supabase/SMARTCOACH_MAPPING_LOGIC.md`
- **This README:** `backend/supabase/SMARTCOACH_README.md`
