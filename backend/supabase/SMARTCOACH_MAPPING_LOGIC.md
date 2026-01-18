# SmartCoach: Machine QR → Plan Item Mapping Logic

## Problem Statement

**How do we map a scanned machine QR code to a specific exercise in a user's active workout plan?**

When a user scans a QR code on a machine (e.g., `sweatdrop://machine/abc-123`), the mobile app needs to:
1. Identify the machine by its `qr_uuid`
2. Find the user's active workout plan subscription
3. Determine which exercise in that plan corresponds to this machine
4. Start tracking that exercise

## Solution Architecture

### Database Function: `get_plan_item_for_machine`

The key function that solves this mapping is:

```sql
get_plan_item_for_machine(
  p_plan_id UUID,
  p_machine_id UUID,
  p_current_index INTEGER DEFAULT 0
)
```

**How it works:**
1. Takes the user's `plan_id`, scanned `machine_id`, and current `exercise_index`
2. Queries `workout_plan_items` table
3. Joins with `machines` table to match:
   - `target_machine_type` must match `machines.type` (treadmill/bike)
   - Either `target_machine_id IS NULL` (any machine of that type) OR `target_machine_id = machine.id` (specific machine)
4. Filters items where `order_index >= current_index` (only future/current exercises)
5. Returns the first matching item

### Mobile App Flow

```
User scans QR code
    ↓
Extract machine UUID from QR: "abc-123"
    ↓
Query: SELECT * FROM machines WHERE qr_uuid = 'abc-123'
    ↓
Machine found: { id: 'xyz', type: 'bike', ... }
    ↓
Query: SELECT * FROM active_subscriptions 
       WHERE user_id = current_user AND status = 'active'
    ↓
Subscription found: { plan_id: 'plan-123', current_exercise_index: 2, ... }
    ↓
Call RPC: get_plan_item_for_machine(plan_id='plan-123', machine_id='xyz', current_index=2)
    ↓
Result: { item_id: 'item-5', order_index: 3, exercise_name: 'Bike Interval', ... }
    ↓
Start Live Session with this item
    ↓
Update live_sessions every 5 seconds with metrics
```

### Edge Cases

#### Case 1: Machine Type Mismatch
**Scenario:** User scans a bike, but current exercise requires treadmill.

**Solution:** 
- `get_plan_item_for_machine` returns `NULL` (no match)
- Mobile app shows error: "This machine doesn't match your current exercise. Please use a treadmill."
- Optionally: Show which exercise in the plan uses this machine (if it's a future exercise)

#### Case 2: Specific Machine Required
**Scenario:** Plan item has `target_machine_id = 'machine-xyz'` (locked to specific machine).

**Solution:**
- Function only matches if scanned machine UUID equals `target_machine_id`
- Prevents user from using wrong machine even if type matches

#### Case 3: Any Machine of Type Works
**Scenario:** Plan item has `target_machine_id = NULL` (any bike will work).

**Solution:**
- Function matches any machine where `machines.type = 'bike'`
- User can use any bike in the gym

#### Case 4: Exercise Already Completed
**Scenario:** User scans a machine for an exercise they already completed (`order_index < current_index`).

**Solution:**
- Function filters `WHERE order_index >= current_index`
- Returns `NULL` if no future exercises match
- Mobile app suggests: "This exercise is already completed. Moving to next exercise..."

#### Case 5: Multiple Matches (Same Machine Type)
**Scenario:** Plan has multiple bike exercises in sequence.

**Solution:**
- Function returns first match with `LIMIT 1`
- `order_index >= current_index` ensures we get the next uncompleted exercise
- If user completes Exercise 3 (bike), next scan will match Exercise 4 (bike)

### Implementation Example (TypeScript/React Native)

```typescript
import { supabase } from '@/lib/supabase';

async function handleQRCodeScan(qrData: string) {
  // 1. Extract machine UUID from QR code
  const machineUuid = extractMachineUUID(qrData); // e.g., "abc-123"
  
  // 2. Get machine details
  const { data: machine, error: machineError } = await supabase
    .from('machines')
    .select('*')
    .eq('qr_uuid', machineUuid)
    .single();
  
  if (!machine || machineError) {
    throw new Error('Machine not found');
  }
  
  // 3. Get user's active subscription
  const { data: subscription, error: subError } = await supabase
    .from('active_subscriptions')
    .select('*, plan:workout_plans(*)')
    .eq('user_id', currentUser.id)
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(1)
    .single();
  
  if (!subscription || !subscription.plan) {
    throw new Error('No active workout plan found');
  }
  
  // 4. Map machine to plan item using RPC function
  const { data: planItem, error: itemError } = await supabase
    .rpc('get_plan_item_for_machine', {
      p_plan_id: subscription.plan_id,
      p_machine_id: machine.id,
      p_current_index: subscription.current_exercise_index
    })
    .single();
  
  if (!planItem || itemError) {
    // No matching exercise found
    showError('This machine doesn\'t match your current workout plan');
    return;
  }
  
  // 5. Start/update live session
  await startLiveSession({
    subscription_id: subscription.id,
    plan_id: subscription.plan_id,
    current_item_id: planItem.item_id,
    current_machine_id: machine.id,
    current_exercise_index: planItem.order_index
  });
  
  // 6. Navigate to workout screen
  navigation.navigate('Workout', {
    planId: subscription.plan_id,
    itemId: planItem.item_id,
    machineId: machine.id
  });
}
```

### Alternative: Client-Side Mapping (If RPC not available)

If you prefer client-side logic:

```typescript
async function mapMachineToPlanItem(
  machineId: string,
  planId: string,
  currentIndex: number
): Promise<WorkoutPlanItem | null> {
  // 1. Get machine
  const { data: machine } = await supabase
    .from('machines')
    .select('*')
    .eq('id', machineId)
    .single();
  
  // 2. Get all plan items
  const { data: items } = await supabase
    .from('workout_plan_items')
    .select('*')
    .eq('plan_id', planId)
    .gte('order_index', currentIndex)
    .order('order_index', { ascending: true });
  
  // 3. Find first matching item
  const matchingItem = items?.find(item => {
    // Type must match
    if (item.target_machine_type !== machine.type) return false;
    
    // Either no specific machine required OR this specific machine
    if (item.target_machine_id && item.target_machine_id !== machine.id) return false;
    
    return true;
  });
  
  return matchingItem || null;
}
```

## Live Session Updates

Once a live session is started, the mobile app updates it every 5 seconds:

```typescript
// In workout.tsx, add to useFrameCallback or setInterval
const updateLiveSession = useCallback(async () => {
  if (!liveSessionId) return;
  
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
}, [liveSessionId, currentRPM, currentHeartRate, ...]);
```

## Coach/Gym Dashboard: Real-time Monitoring

The web dashboard subscribes to `live_sessions` changes using Supabase Realtime:

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

This allows coaches/gym admins to see live metrics (RPM, heart rate, etc.) as users exercise.

## Summary

**The mapping logic is simple:**
1. QR code → Machine UUID
2. Machine UUID → Machine details (type: bike/treadmill)
3. Active subscription → Plan ID + Current exercise index
4. RPC function: `get_plan_item_for_machine(plan_id, machine_id, current_index)` → Matching plan item
5. Start tracking with that item

**Key Design Decisions:**
- **Polymorphic ownership:** Plans can be owned by coaches OR gyms (not both)
- **Flexible machine matching:** Items can require specific machines OR any machine of a type
- **Order-based progression:** `order_index` ensures users follow the plan sequence
- **Real-time updates:** `live_sessions` table updated every 5 seconds for monitoring
