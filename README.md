# Orthodle Deployable Template

A daily orthopaedic diagnosis game template with:
- Manually created cases
- Radiograph/image support
- Guess tracking
- Basic daily-user analytics table
- Supabase backend
- Vercel-ready Next.js frontend

## 1. Install

```bash
npm install
npm run dev
```

## 2. Create Supabase project

Create a new Supabase project, then run the SQL in:

```bash
supabase/schema.sql
```

## 3. Environment variables

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
ADMIN_PASSWORD=choose_a_password
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

## 4. Add cases

Go to:

```bash
/admin
```

Use your `ADMIN_PASSWORD` to add daily cases. You can paste image URLs from Supabase Storage, Cloudinary, or another public image host.

## 5. Deploy

Push to GitHub, then import the repo into Vercel. Add the same env variables in Vercel settings.

## Bandwidth-efficient stats

Before deploying the aggregate stats routes, run [supabase-stats-egress.sql](supabase-stats-egress.sql) once in the Supabase SQL Editor, after the base schema and the accounts migration. The migration adds read-only summary functions and indexes; it does not rewrite any cases, visits, guesses or subscriptions. The functions are restricted to the server's Supabase service role.

The ERAS and admin audience counters share a twice-daily summary. The first request in each 12-hour window (starting at 00:00 and 12:00 UTC) refreshes it; no cron job is needed. Streak badges look up only the current player's solved days, while the top ten refreshes on its own schedule. Verify ERAS and Admin → Top streaks after deploying. To evaluate a return to the Free plan, compare daily uncached egress in Supabase Usage across several representative days; the 5 GB monthly limit works out to roughly 160 MB/day in a 31-day month.

## Daily email reminders

Players can opt in under **Daily email** in the top-right menu and unsubscribe from any reminder. Manage subscriptions and send yourself a test from **Admin → Email Reminders**.

Set `RESEND_API_KEY`, `REMINDER_FROM_EMAIL` (a verified Resend sender), and a unique random `CRON_SECRET` in Vercel's production environment, in addition to the Supabase service role key and `NEXT_PUBLIC_SITE_URL`. The existing schedule in `vercel.json` runs once per day at 13:30 UTC. Vercel supplies the secret to the sending route. Signup is unavailable if the sending settings are missing.

## Notes

This template does not include user login. It tracks anonymous session IDs in localStorage.
