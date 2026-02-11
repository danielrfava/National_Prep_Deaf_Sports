# Architecture Diagram

Static site (HTML/CSS/JS) served by Netlify.

- Browser loads src/index.html, styles.css, and main.js.
- main.js calls Supabase using supabaseClient.js.
- Supabase returns data from the sports table.

For a visual diagram, add an image or Mermaid diagram here.
