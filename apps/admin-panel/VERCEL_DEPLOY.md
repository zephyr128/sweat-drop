# Vercel Deployment Guide

## Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **GitHub Repository**: Ensure your code is pushed to GitHub
3. **Supabase Project**: Have your Supabase credentials ready

## Deployment Steps

### 1. Connect Repository to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repository
3. Select the repository containing the admin panel

### 2. Configure Project Settings

**IMPORTANT**: Since this is a monorepo, you MUST set the root directory:

1. Go to **Settings** → **General**
2. Scroll to **Root Directory**
3. Click **Edit**
4. Set to: `apps/admin-panel`
5. Click **Save**

**Framework Preset**: Next.js (auto-detected)

**Build Command**: `npm run build` (will run in `apps/admin-panel` directory)

**Output Directory**: `.next` (default)

**Install Command**: `npm install` (will run in `apps/admin-panel` directory)

### 3. Set Environment Variables

In Vercel project settings, add these environment variables:

#### Required:
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anonymous key

#### Optional (but recommended):
- `SUPABASE_SERVICE_ROLE_KEY` - For server actions (creating users, etc.)
- `NEXT_PUBLIC_APP_URL` - Your Vercel deployment URL (for invitation emails)

### 4. Deploy

Click "Deploy" and wait for the build to complete.

## Troubleshooting

### Build Fails with TypeScript Errors

- Ensure all TypeScript errors are fixed locally
- Run `npm run type-check` before deploying
- Check build logs in Vercel dashboard

### Build Fails with Module Not Found

- Ensure all dependencies are in `package.json`
- Run `npm install` locally to verify
- Check that `node_modules` is not committed to git

### Environment Variables Not Working

- Ensure variables are prefixed with `NEXT_PUBLIC_` for client-side access
- Restart deployment after adding new environment variables
- Check variable names match exactly (case-sensitive)

### 404 Errors on Routes

- Ensure `middleware.ts` is properly configured
- Check that routes exist in `app/` directory
- Verify authentication is working

### Database Connection Issues

- Verify Supabase URL and keys are correct
- Check Supabase project is active
- Ensure RLS policies allow access from Vercel IPs (if needed)

## Post-Deployment

1. **Test Authentication**: Log in and verify session works
2. **Test Routes**: Navigate through all dashboard sections
3. **Check Logs**: Monitor Vercel function logs for errors
4. **Set Custom Domain**: Configure custom domain in Vercel settings (optional)

## Environment Variables Reference

See `.env.example` for all available environment variables.
