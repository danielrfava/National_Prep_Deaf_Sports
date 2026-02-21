# Version 4.0 - Mixed School Rankings & Filter System Overhaul

**Release Date:** February 18, 2026  
**Status:** ✅ Complete and Working

---

## Version 4.1 - Modularity & All-Sports Fetch Safety

**Release Date:** February 18, 2026  
**Status:** ✅ Complete and Working

### What changed
- Refactored duplicated Supabase pagination loops into shared service helpers in `src/services/sportsService.js`.
- Enforced all-sports fetch behavior to continue paging until final partial page (no hidden caps).
- Added explicit modularity and anti-regression documentation in `MODULARITY_STANDARDS.md` and `README.md`.

### Why
- Prevents future regressions where only part of the dataset appears for certain sports/schools.
- Makes fixes centralized: pagination/retry policy now updates in one helper path instead of multiple loops.

---

## Version 4.2 - Core vs Advanced Stats UX + Football Receiving Tab

**Release Date:** February 18, 2026  
**Status:** ✅ Complete and Working

### What changed
- Added **Core vs Advanced** stat display for key sports using `+ Advanced Stats` toggle.
- Basketball now defaults to core totals-first columns (GP, PTS, PPG, REB, AST, STL, BLK) with existing extras under Advanced.
- Baseball/Softball now default to compact core views:
  - Batting core: GP, AVG, HR, RBI
  - Pitching core: GP, W, L, ERA, IP, H, R, BB, SO
- Football tabs expanded and reordered to: **Passing, Rushing, Receiving, Defense** (Defense last).
- Football core defaults per tab:
  - Passing: GP, COMP, ATT, YDS, YPG, TD, INT
  - Rushing: GP, ATT, YDS, YPG, TD, FUM
  - Receiving: GP, REC, YDS, YPG, TD, FUM
  - Defense: GP, Tackles, Solo, AST, TFL, Sacks, INT
- Kept existing extra fields available behind **Advanced Stats**.
- Fixed filter/tab overlap behavior at zoom and long school-name scenarios with responsive constraints.

### Why
- Reduces table clutter for first view while preserving full stat depth.
- Makes football navigation clearer with a dedicated Receiving tab.
- Improves reliability of layout across zoom levels and long option labels.

---

## 🎯 Major Changes

### 0. **Landing Page with Background Video** ⭐ NEW
**Feature:** Professional landing page with looping background video

**Implementation:**
- Video file: `src/assets/videos/video_1.mp4`
- Autoplays on loop, muted, full background coverage
- Dark overlay for text readability
- "Enter Statistics Portal" button to access stats
- Naming convention: `video_1.mp4`, `video_2.mp4`, etc. for easy swapping

**Files:**
- `src/index.html` - Landing page with video element
- `src/styles.css` - Video background styling (lines 685-755)

---

### 1. **Mixed School Rankings (All Schools Together)**
**Problem:** Previously only showed one school at a time (CSDF), couldn't see mixed rankings.

**Solution:** 
- Default view now shows **ALL schools mixed together** in one ranking
- Sorted by **PTS (points) descending** - highest scorer across all schools appears first
- Click any column header to re-sort by that stat (RPG, APG, SPG, etc.)

**How it works:**
- Select "All schools" dropdown → Shows players from CSDF, CSDR, ISD, TSD, MSD, etc. all ranked together
- Select specific school → Shows only that school's players
- Same for "All sports" vs specific sport

---

### 2. **School Abbreviation Display**
**Problem:** School names showed as "CSDF" for some, full names for others (CSDR, ISD not showing).

**Solution:** 
- Created `getSchoolAbbrev()` function with **flexible matching**
- Handles variations: "California School for the Deaf-Fremont" → "CSDF"
- Uses normalization (removes punctuation, spaces) and keyword matching (riverside, fremont, indiana, etc.)

**Technical Details:**
- File: `src/components/renderRecords.js`
- Function: `getSchoolAbbrev(fullSchool)`
- Supports 48+ schools with proper abbreviations

---

### 3. **Removed Unnecessary Filters**
**Problem:** Division, Deaflympics, and Record Scope filters were:
- Causing UI overlap
- Not needed yet (no D2 data, no Deaflympics data)
- Cluttering interface

**Solution:** 
- Removed Division filter entirely (can add back when D2 data exists)
- Removed Deaflympics filter (no data yet)
- Removed Record Scope filter (not necessary for current use case)

**Files Modified:**
- `src/stats.html` - Removed filter HTML elements
- `src/main.js` - Removed filter references and event listeners

---

### 4. **Fixed Supabase Pagination (Critical)**
**Problem:** 
- Supabase has **hard limit of 1000 records per request**
- Setting limit to 50,000 still only returned 1000 records
- Only saw one school (ISD) because database stopped at 1000 records

**Solution:** 
- Implemented **pagination** - fetches in batches of 1000
- Continues fetching until all records retrieved (up to 50 pages = 50,000 records)
- Now successfully fetches all 28,000+ rows from database

**Technical Implementation:**
```javascript
// Fetch in batches
let allData = [];
let page = 0;
const pageSize = 1000;

while (hasMore && allData.length < 50000) {
  request = supabase
    .from("raw_stat_rows")
    .select("*")
    .range(page * pageSize, (page + 1) * pageSize - 1);
  
  // ... filters applied ...
  
  allData = allData.concat(data);
  page++;
}
```

**Files Modified:**
- `src/services/sportsService.js`
  - `fetchSportsRecords()` - Main data fetch with pagination
  - `fetchSchools()` - School list with pagination
  - `fetchSportsList()` - Sports list with pagination

---

### 5. **Filter Initialization Fix**
**Problem:** 
- After loading school list dynamically, browser auto-selected first school instead of "All schools"
- `schoolFilter.value` contained school name when should be empty string

**Solution:**
- Use `selectedIndex = 0` to force selection of first option ("All schools")
- Added `setTimeout()` delay to ensure options loaded before resetting
- Added extensive console logging for debugging

**Code:**
```javascript
setTimeout(() => {
  schoolFilter.selectedIndex = 0; // Select "All schools"
  sportFilter.selectedIndex = 0; // Select "All sports"
  runSearch("");
}, 100);
```

---

## 📊 Performance Notes

### Initial Load Time
- **Slower than previous version** due to pagination
- Fetches ~28 batches of 1000 records each on initial load
- Shows "Loading filters..." while fetching

### Why Pagination is Necessary
- Supabase enforces 1000-record limit per request server-side
- No way to override this limit
- Pagination is the **only** solution to fetch all 28,000+ records

### Future Optimization Options
If load time becomes an issue, consider:
1. **Lazy loading** - Load first 1000, fetch more on scroll
2. **Caching** - Store results in localStorage
3. **Server-side aggregation** - Use Supabase views/functions
4. **Limit initial fetch** to top N records, load more on demand

---

## 🔧 Technical Architecture

### Data Flow
```
Page Load
  ↓
fetchSchools() + fetchSportsList() (paginated)
  ↓
Populate dropdowns
  ↓
Reset to "All schools" + "All sports"
  ↓
fetchSportsRecords() (paginated, no filters)
  ↓
Sort by PTS descending
  ↓
Render table
```

### Key Files & Functions

**src/services/sportsService.js**
- `fetchSportsRecords(query, filters)` - Main data fetch, pagination, sorting
- `fetchSchools()` - Gets unique schools from all records
- `fetchSportsList()` - Gets unique sports from all records

**src/components/renderRecords.js**
- `renderRecords(records, container, statsView, filters)` - Main rendering
- `getSchoolAbbrev(fullSchool)` - School name abbreviation
- `renderTableRows()` - Table generation with conditional column hiding
- `sortTable(column, container)` - Column header click sorting

**src/main.js**
- `init()` - Page initialization, load filters
- `buildFilters()` - Construct filter object from dropdowns
- `runSearch(query)` - Execute search with filters
- `setOptions(select, options, getLabel)` - Populate dropdown

**src/stats.html**
- Filter dropdowns (School, Sport, Stats View)
- Table container
- Pagination controls

---

## 🐛 Debugging Tools

### Console Logs (Temporary - Remove Before Production)
Current logs help identify issues:

**Filter Loading:**
```
"Loading filters..."
"Total unique schools found: X"
"Total unique sports found: X"
```

**Filter State:**
```
"After setOptions - schoolFilter options count: X"
"Reset filters - schoolFilter.selectedIndex: 0 value: "
"Built filters: {schoolId: '', sport: ''}"
```

**Data Fetching:**
```
"fetchSportsRecords called with: {query, filters}"
"Not applying school filter - showing all schools"
"Fetched X records"
"Unique schools in result: [...]"
"Sorted by PTS - Top 3: [...]"
```

**To Remove Logs:** Search for `console.log` and delete before deployment.

---

## ✅ Testing Checklist

- [x] **Default load shows mixed schools** (CSDF, CSDR, ISD, TSD, MSD, etc.)
- [x] **School abbreviations display correctly** (not full names)
- [x] **Clicking PTS column sorts properly** (highest to lowest toggle)
- [x] **Clicking other columns sorts** (RPG, APG, SPG, etc.)
- [x] **School dropdown shows all schools** (not just one)
- [x] **Sport dropdown shows all sports**
- [x] **Selecting specific school filters correctly**
- [x] **Selecting specific sport filters correctly**
- [x] **Season Stats vs Career Stats toggle works**
- [x] **Pagination shows correct record counts**
- [x] **Search bar filters records**
- [x] **All 28,000+ records accessible**

---

## 🚀 Deployment Checklist

Before deploying to GitHub Pages:

1. **Remove console.log statements** (optional, but cleaner)
   - Search codebase for `console.log`
   - Comment out or delete debugging logs

2. **Commit changes**
   ```bash
   git add .
   git commit -m "v4.0: Mixed school rankings, pagination, filter overhaul"
   git push origin main
   ```

3. **GitHub Actions will automatically deploy** (workflow already created in `.github/workflows/deploy.yml`)

4. **Verify Supabase credentials in GitHub Secrets:**
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

5. **Enable GitHub Pages** (if not already):
   - Go to repo Settings → Pages
   - Source: Deploy from a branch
   - Branch: `gh-pages` / `root`

6. **Test live site:**
   - URL: `https://danielrfava.github.io/National_Prep_Deaf_Sports/`
   - Verify all schools show in dropdown
   - Verify mixed rankings display

---

## 📝 Future Enhancements

### Suggested for v5.0
1. **Add caching** - Store fetched data in localStorage
2. **Lazy loading** - Don't fetch all 28K records upfront
3. **Division 2 support** - Add back division filter when D2 data ready
4. **Deaflympics filter** - Add back when data available
5. **Advanced filters** - Date ranges, custom stat thresholds
6. **Export functionality** - CSV/PDF download
7. **Player profiles** - Click name to see detailed stats
8. **Team pages** - School-specific pages with rosters

---

## 🔗 Related Documentation

- [SUPABASE_SETUP_GUIDE.md](SUPABASE_SETUP_GUIDE.md) - Database setup
- [DEPLOY_TO_NETLIFY.md](DEPLOY_TO_NETLIFY.md) - Alternative deployment
- [ATHLETE_FILTER_GUIDE.md](ATHLETE_FILTER_GUIDE.md) - Filter system details
- [ARCHITECTURE_DIAGRAM.md](ARCHITECTURE_DIAGRAM.md) - System architecture

---

## 💡 Key Learnings for Next Time

### 1. **Supabase Limits**
- Always check for pagination when fetching large datasets
- Default limit is 1000 records, not unlimited
- Use `.range()` for pagination, not `.limit()`

### 2. **Dynamic Dropdowns**
- Browser auto-selects first option when you add new options dynamically
- Use `selectedIndex = 0` instead of `value = ""` to explicitly select
- Add delay with `setTimeout()` to ensure options loaded

### 3. **Filter Logic**
- Check for both empty string `''` and `'all'` values
- Log filter state extensively during debugging
- Conditional column hiding improves UX when filtering

### 4. **School Name Variations**
- School names have inconsistent formats (hyphens vs commas)
- Build flexible matching with normalization
- Extract keywords for fallback matching

### 5. **Sorting Pre-applied Data**
- If data is sorted server-side, set `currentSort` state to match
- First click on column should toggle, not apply same sort
- Users expect clicking sorted column to reverse order

---

## 📞 Support Reference

If issues arise:

**Check Console First:**
- F12 → Console tab
- Look for error messages
- Verify "Fetched X records" shows large number (28,000+)
- Verify "Unique schools in result: [...]" shows multiple schools

**Common Issues:**

1. **Only one school showing**
   - Check pagination is working (console should show multiple fetch calls)
   - Verify Supabase credentials

2. **Slow loading**
   - Normal for 28K records with pagination
   - Consider optimization options above

3. **Filter not working**
   - Check console logs show correct filter values
   - Verify dropdown `selectedIndex` and `value`

4. **Abbreviations wrong**
   - Update `schoolAbbreviations` object in `renderRecords.js`
   - Add new schools with proper abbreviations

---

---

# Version 4.2 - UI Consistency, Filter Row Enforcement, and Error-Proofing

**Release Date:** February 21, 2026  
**Status:** ✅ Complete and Working

### What changed
- Fixed duplicate filter row and duplicate login button on statistics page (`src/stats.html`).
- Enforced single filter row policy and documented in `README.md`.
- Fixed JavaScript errors in filter logic (`src/main.js`), ensuring dynamic population from Supabase.
- Updated documentation for future maintainers to prevent regression.

### Why
- Prevents confusion and layout issues from duplicate UI elements.
- Ensures all filters are dynamically populated and robust against future changes.
- Makes it easy to spot and fix similar issues in future updates.

---

# Version 4.3 - Soccer Stat Columns & Sport Detection Fixes

**Release Date:** February 21, 2026  
**Status:** ⚠️ In Progress

### What changed
- Added proper soccer stat columns (GP, Goals, Assists, Shots on Goal) for both boys and girls soccer.
- Improved sport detection logic so "Boys Soccer" and "Girls Soccer" use soccer columns, not basketball columns.
- Removed irrelevant soccer columns (Minutes, Yellow Cards, Red Cards).
- Updated frontend to match Supabase data structure for soccer stats.

### Why
- Ensures soccer stats display correctly and are not mixed with basketball categories.
- Makes the stats system more robust for future sports additions.

**End of v4.3 Documentation**
