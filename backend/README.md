# SweatDrop Backend

Supabase backend for SweatDrop application.

## Setup

1. Install Supabase CLI:
```bash
npm install -g supabase
```

2. Start local Supabase:
```bash
supabase start
```

3. Run migrations:
```bash
supabase db reset
```

## Database Schema

The database includes the following main tables:

- `profiles` - User profiles extending auth.users
- `devices` - ESP32 device registrations
- `workouts` - Workout sessions
- `workout_metrics` - Real-time metrics from devices during workouts

## Migration Files

Migrations are stored in `supabase/migrations/` and run in chronological order.

## Local Development

To work with the local Supabase instance:

- Studio: http://localhost:54323
- API: http://localhost:54321
- DB: localhost:54322
