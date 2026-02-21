# NEW VERSION ATTEMPT

## Modernize Player Statistics Page (Plain HTML/CSS/JS, Netlify)

### Requirements
- Use plain HTML, CSS, and JS (no frameworks).
- Site hosted on Netlify.
- Redesign Player Statistics page UI to match modern sports dashboards (ESPN/MaxPreps style).
- Preserve all filtering logic, keep filters dynamic and sport-specific.
- Do NOT hardcode basketball-only assumptions.

### New Page Structure
1. Sticky Navbar (existing)
2. Page Header section (new)
3. Sticky Filter Bar Card (wrap existing filters)
4. Summary Stat Cards row (new, dynamic)
5. Table Card (wrap existing table)
6. Pagination (existing)

### Page Header
- H1: Dynamic sport title (e.g., HS Boys Basketball — Career Stats)
- Subtitle: Player Statistics
- Optional muted description
- Divider line

### Filter Bar Card
- Wrap dropdowns in card container
- White background, rounded corners (14px), soft shadow, padding 16–24px
- Good spacing between dropdowns
- “Reset Filters” button on right
- Sticky under navbar
- Future-ready for more filters

### Summary Stat Cards
- 3–4 cards above table
- Values from filtered dataset
- Cards adapt to sport/stat view
- Examples: Total Players, Total Schools, Seasons Count, top metric
- Card styling: white, rounded, shadow, big number + small label, responsive grid

### Table Styling Upgrade
- Wrap table in card container
- Sticky header row
- Subtle row separators, row hover highlight
- Right-align numeric columns
- Player name bold, school muted
- Increased row height/spacing
- Smooth transitions (150–250ms)
- Dynamic columns per sport/stat view

### CSS Design System
- Add variables:
  :root{
    --bg: #f6f7fb;
    --card: #ffffff;
    --text: #111827;
    --muted: #6b7280;
    --border: #e5e7eb;
    --shadow: 0 10px 25px rgba(0,0,0,.08);
    --radius: 14px;
    --accent: #2563eb;
  }
- Page bg = light gray, cards = white, soft shadows, 8px rhythm

### Interactions
- Hover states on buttons/nav/table rows
- Focus ring for dropdowns/buttons
- Active filter styling
- Optional: loading skeleton

### Mobile Requirements
- Filters stack vertically
- Summary cards stack
- Table horizontally scrollable
- Touch-friendly buttons/inputs

### Deliverables
- Updated HTML structure
- New/updated CSS file
- Minimal JS changes for UI behavior
- Do NOT break filter logic or hardcode columns
- Do NOT change Netlify setup

---

This file contains the future instruction for the Player Statistics page redesign. Use this as the reference for the "NEW VERSION ATTEMPT" tomorrow.