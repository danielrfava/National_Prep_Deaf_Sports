# Deploy to Netlify

1. Push this repository to GitHub.
2. Create a new Netlify site from the repo.
3. Set environment variables:
   - VITE_SUPABASE_URL
   - VITE_SUPABASE_ANON_KEY
4. Build command: node scripts/build-env.js
5. Publish directory: src
6. In Netlify, create a Build Hook (Site configuration -> Build & deploy -> Build hooks).
7. In GitHub repo settings, add Actions secret:
    - NETLIFY_BUILD_HOOK_URL = your Netlify build hook URL

After this, every push to `main` automatically triggers a Netlify deploy through `.github/workflows/deploy.yml`.

Optional Windows helper:

- Use `trigger-netlify-deploy.bat` to manually trigger deploy from a Windows terminal.
- Set local env var first:
   - `set NETLIFY_BUILD_HOOK_URL=https://api.netlify.com/build_hooks/your_hook_id`

Netlify will generate src/env.js during build.
