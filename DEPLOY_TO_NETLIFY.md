# Deploy to Netlify

1. Push this repository to GitHub.
2. Create a new Netlify site from the repo.
3. Set environment variables:
   - VITE_SUPABASE_URL
   - VITE_SUPABASE_ANON_KEY
4. Build command: node scripts/build-env.js
5. Publish directory: src

Netlify will generate src/env.js during build.
