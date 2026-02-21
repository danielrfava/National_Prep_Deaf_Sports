# Deaf Sports History Web App

This repository contains the complete static web application for Deaf Sports History. The project is built with HTML, JavaScript, and CSS (no frameworks like Next.js or TypeScript). It uses Supabase as the backend for data storage and retrieval.

## What is in this repository

- All source code for the static site (HTML, JS, CSS) in the src/ folder.
- Supabase integration for backend/database (see supabaseClient.js and environment variable setup).
- Architecture diagram and documentation (ARCHITECTURE_DIAGRAM.md).
- Athlete filter guide and test (ATHLETE_FILTER_GUIDE.md, TEST_ATHLETE_FILTER.md).
- Completion summary (COMPLETION_SUMMARY.md).
- Modularity standards and implementation checklist (MODULARITY_STANDARDS.md, IMPLEMENTATION_CHECKLIST.md).
- Netlify deployment guides and configuration (DEPLOY_TO_NETLIFY.md, NETLIFY_DEPLOY_GUIDE.md, netlify.toml).
- Sample data SQL for Supabase (sample-data.sql).
- All other project documentation and guides (README.md, QUICK_DEPLOY_GUIDE.md, etc.).
- All code, components, and services for the web app (src/components/, src/services/).

## Key points

- This repo is the authoritative, complete version of the Deaf Sports History static web app.
- No Next.js, no TypeScript, just static HTML/JS/CSS for easy deployment and maintenance.
- All documentation, guides, and standards are included for future development and onboarding.
- Ready for deployment on Netlify as a static site (see deployment guides).
- Supabase environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) are required for production.

## ⚠️ UI Layout & Filter Row Policy (v4.3)

- The statistics page (`src/stats.html`) must have **only one filter row** at the top (School, Sport, Stats View), styled as shown in the screenshots and demo videos.
- **Do not duplicate** the filter row or add extra filter sections—this causes confusion and layout issues. If you see a duplicate login button or filter row, remove the extra section immediately.
- All filter dropdowns are **dynamically populated** from Supabase data via JavaScript. Do not hardcode filter options in HTML.
- Soccer stats now display only GP, Goals, Assists, and Shots on Goal for both boys and girls soccer. Irrelevant columns (Minutes, Yellow Cards, Red Cards) have been removed.
- Sport detection logic improved: "Boys Soccer" and "Girls Soccer" now use soccer columns, not basketball columns.
- The navigation bar, search bar, and filter row structure are critical for a consistent user experience. If you change the layout, update this documentation and test thoroughly.
- If you see duplicate filters or login buttons, remove the extra section and keep only the main filter row and single login button at the top right.

**For new contributors:**
- Review this README and the code in `src/stats.html`, `src/main.js`, and `src/components/renderRecords.js` before making UI changes.
- Always test the site locally after edits to ensure the layout and dynamic filters work as expected.

## Critical data loading policy (all sports)

- Never hard-cap pagination by row count or page count in frontend Supabase fetch loops.
- Always paginate with `range()` in batches (currently 1000) and continue until Supabase returns fewer than `pageSize` rows.
- This rule applies to all sports and all filter states (Basketball, Baseball, Softball, Football, Volleyball, etc.).
- Reintroducing caps (like 50 pages or 50,000 rows) can silently hide valid records and create ranking/filter bugs.

Current implementation reference:
- `src/services/sportsService.js`
	- `fetchSportsRecords()`
	- `fetchSchools()`
	- `fetchSportsList()`

## Purpose

To provide a maintainable, modular, and fully documented static web application for Deaf Sports History, including all code, data, and guides needed for development, deployment, and future enhancements.
