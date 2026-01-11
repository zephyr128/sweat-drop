# SweatDrop Admin Panel

Next.js admin panel for managing SweatDrop gym operations.

## Features

- **Gym Overview**: Dashboard with active users, total drops, and redeems
- **Rewards Manager**: Create, edit, and manage gym rewards
- **Challenges Manager**: Create and manage challenges (daily/weekly/streak)
- **Redeem Validation**: Confirm reward redemptions

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
Create a `.env.local` file with:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

3. Start the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Development

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - Type check TypeScript

## Authentication

Admin users must be added to the `gym_staff` table with appropriate gym assignments. Use Supabase Auth for authentication.

## Project Structure

- `app/` - Next.js App Router
  - `login/` - Gym login page
  - `dashboard/` - Admin dashboard
    - `rewards/` - Rewards management
    - `challenges/` - Challenges management
    - `redeems/` - Redemption validation
- `lib/` - Utility functions and Supabase client
