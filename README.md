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

## Notes

This template does not include user login. It tracks anonymous session IDs in localStorage.
