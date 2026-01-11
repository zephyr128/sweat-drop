# SweatDrop

Fitness tracking platform with React Native mobile app, Next.js admin panel, Supabase backend, and ESP32 firmware.

## Project Structure

```
sweatdrop/
├── apps/
│   ├── mobile-app/      # React Native + Expo mobile app
│   └── admin-panel/     # Next.js admin panel
├── backend/
│   └── supabase/        # Supabase schema and migrations
├── hardware/            # ESP32 firmware
└── docs/                # Documentation
```

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Supabase CLI (for local development)

### Setup

1. Install dependencies:
```bash
npm install
```

2. Set up Supabase:
```bash
cd backend
supabase start
supabase db reset
```

3. Configure environment variables:

**Mobile App** (`apps/mobile-app/.env`):
```
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

**Admin Panel** (`apps/admin-panel/.env.local`):
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

4. Start development:
```bash
# Mobile app
npm run dev:mobile

# Admin panel
npm run dev:admin
```

## Features

### Mobile App
- **Onboarding & Auth**: Email/Apple/Google authentication with username setup
- **QR Scan & Workout**: Scan QR codes on equipment to start workouts
- **Active Workout**: Real-time drops counter and session tracking
- **Session Summary**: View workout results and percentile rankings
- **Wallet**: Track drops earned (today, this week, this month)
- **Rewards Store**: Browse and redeem rewards with drops
- **Challenges**: Participate in daily/weekly/streak challenges
- **Leaderboards**: View rankings by period (daily/weekly/monthly) and scope (gym/city/country)

### Admin Panel
- **Gym Overview**: Dashboard with active users, total drops, and redeems
- **Rewards Manager**: Create, edit, and manage gym rewards
- **Challenges Manager**: Create and manage challenges (daily/weekly/streak)
- **Redeem Validation**: Confirm reward redemptions

## Database Schema

The database includes the following main tables:
- `gyms` - Gym locations
- `equipment` - Equipment with QR codes
- `profiles` - User profiles extending auth.users
- `sessions` - Workout sessions
- `drops_transactions` - Drops currency transactions
- `rewards` - Rewards that can be redeemed
- `redemptions` - Reward redemption requests
- `challenges` - Gym challenges
- `challenge_progress` - User challenge progress
- `gym_staff` - Gym staff/admin users

## Development

- `npm run dev:mobile` - Start mobile app development server
- `npm run dev:admin` - Start admin panel development server
- `npm run lint` - Run linting across all workspaces
- `npm run type-check` - Type check all workspaces

## Technology Stack

- **Mobile**: React Native + Expo + TypeScript
- **Admin**: Next.js 14 + TypeScript + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Realtime)
- **Hardware**: ESP32 (firmware to be implemented)

## License

Private
