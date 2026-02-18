# Quick Deploy Guide

Local preview:

1. Copy src/env.example.js to src/env.js and fill values.
2. Open src/index.html in a browser or run a static server.

Netlify:

1. Connect repo in Netlify.
2. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
3. Create a Netlify Build Hook.
4. Add GitHub Actions secret `NETLIFY_BUILD_HOOK_URL` with that hook URL.
5. Push to `main` and deploy runs automatically.
