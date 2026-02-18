# Supabase Setup Guide

## Problem
The website is not connecting to Supabase because the credentials in `src/env.js` are empty.

## Solution: Set Up Supabase

### Step 1: Create a Supabase Project (if you don't have one)

1. Go to https://supabase.com
2. Sign up or log in
3. Click "New Project"
4. Fill in:
   - Project name: `deaf-sports-history` (or any name)
   - Database password: Create a strong password
   - Region: Choose closest to you
5. Wait for project to be created (~2 minutes)

### Step 2: Get Your Credentials

1. In your Supabase project dashboard, click on the **Settings** icon (gear icon) in the left sidebar
2. Click **API** under Project Settings
3. You'll see two important values:
   - **Project URL** - looks like: `https://abcdefghijk.supabase.co`
   - **anon/public key** - a long string starting with `eyJ...`

### Step 3: Create Database Tables

1. In Supabase dashboard, click **SQL Editor** in the left sidebar
2. Click **New query**
3. Copy and paste the content from `/workspaces/National_Prep_Deaf_Sports/schools-data.sql` and run it
4. Create a new query, copy and paste from `/workspaces/National_Prep_Deaf_Sports/sports-records-schema.sql` and run it
5. (Optional) Copy and paste from `/workspaces/National_Prep_Deaf_Sports/teams-data.sql` and run it
6. (Optional) Copy and paste from `/workspaces/National_Prep_Deaf_Sports/tournaments-data.sql` and run it

### Step 4: Update Local Environment File

Edit `/workspaces/National_Prep_Deaf_Sports/src/env.js` and replace the empty strings with your credentials:

```javascript
window.ENV = {
  SUPABASE_URL: "https://YOUR-PROJECT-ID.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.YOUR-LONG-KEY-HERE"
};
```

### Step 5: Refresh the Website

1. Refresh your browser at http://localhost:8080
2. You should now see:
   - Schools in the School dropdown (including Indiana School for the Deaf)
   - Sports appearing in filters
   - Ability to search for athlete names

## Quick Test

After setup, try searching for:
- "John Smith" (should find an Indiana School for the Deaf basketball player)
- "Indiana" (should find multiple ISD athletes)
- "Basketball" (should find multiple basketball players)

## Database Schema Overview

The main tables needed:

1. **schools** - All deaf schools (Indiana School for the Deaf, etc.)
2. **sports** - Athlete records, sports statistics
3. **teams** - Team information
4. **tournaments** - Tournament data

## Troubleshooting

If after adding credentials you still see no data:

1. Check browser console (F12) for errors
2. Verify credentials are correct (no extra spaces)
3. Ensure SQL scripts ran successfully in Supabase
4. Check that tables have data: In Supabase, go to **Table Editor** and browse the `schools` and `sports` tables

## For Production Deployment on Netlify

When deploying to Netlify, set these environment variables in Netlify dashboard:
- `VITE_SUPABASE_URL` = your Supabase URL
- `VITE_SUPABASE_ANON_KEY` = your Supabase anon key

The build script will automatically generate `env.js` from these variables.
