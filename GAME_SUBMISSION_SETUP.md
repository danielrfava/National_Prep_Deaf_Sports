# Game Submission System - Setup Guide

## 🎯 What Was Built

A complete system for athletic directors to submit game data that you approve before publishing.

### System Components

```
PUBLIC SITE (index.html)
    ↓ [Login Button added to header]
    
ATHLETIC DIRECTOR PORTAL
├── login.html           - Login page
├── dashboard.html       - View submissions status
├── submit-game.html     - Upload game data (3 methods)
└── submit-game.js       - Handles all submissions

SMART PARSERS (The "Small Machine")
├── textParser.js        - Parses MaxPreps/Hudl paste
├── csvParser.js         - Parses CSV files
├── dataFormatter.js     - Converts to JSON → Supabase
└── Process: Input → Parse → JSON → Supabase

ADMIN PANEL (Your Interface)
└── admin-dashboard.html - Review & approve submissions

DATABASE (Supabase)
├── user_profiles        - User accounts
├── game_submissions     - Pending games (JSON stored here)
├── games                - Approved games (live)
└── player_stats         - Approved stats (live)
```

---

## 📋 Setup Steps

### STEP 1: Run the Database Schema

1. **Go to your Supabase SQL Editor**
2. **Copy the entire file:** `auth-submission-schema.sql`
3. **Paste and run it**
4. **Verify tables created:**
   - user_profiles
   - game_submissions  
   - games
   - player_stats

### STEP 2: Create Your Admin Account

1. **In Supabase Dashboard:**
   - Go to **Authentication** > **Users**
   - Click **Add User** (manual create)
   - Enter your email and password
   - Copy the **User ID** that appears

2. **Insert your admin profile:**
   ```sql
   INSERT INTO user_profiles (id, email, full_name, role)
   VALUES (
     'paste-your-user-id-here',
     'your-email@example.com',
     'Your Name',
     'admin'
   );
   ```

### STEP 3: Create Test Athletic Director Account

1. **Create auth user in Supabase** (same as Step 2)
2. **Insert athletic director profile:**
   ```sql
   INSERT INTO user_profiles (id, email, full_name, role, school_id, school_name)
   VALUES (
     'paste-ad-user-id-here',
     'ad@msd.edu',
     'John Smith',
     'athletic_director',
     'msd',
     'Maryland School for the Deaf'
   );
   ```

### STEP 4: Test the System

#### Test as Athletic Director:
1. Go to `http://localhost:5000/portal/login.html`
2. Login with AD credentials
3. Click "Submit Game Results"
4. Try all 3 methods:
   - **Paste box score** from MaxPreps
   - **Upload CSV** file
   - **Manual entry** form
5. Submit and see "Pending" status

#### Test as Admin:
1. Go to `http://localhost:5000/admin/admin-dashboard.html`
2. Login with admin credentials
3. See pending submission
4. Click "Approve & Publish"
5. Check public site - data is now live!

---

## 🔄 How It Works (The Complete Flow)

### For Athletic Directors:

```
1. Login at /portal/login.html
   ↓
2. Dashboard shows: "Submit Game Results" button
   ↓
3. Choose submission method:
   
   Option A: PASTE BOX SCORE
   ├── Copy from MaxPreps/Hudl
   ├── Paste into textarea
   ├── Click "Parse & Preview"
   ├── textParser.js extracts data
   └── Shows preview
   
   Option B: CSV UPLOAD
   ├── Export CSV from MaxPreps/Hudl/Excel
   ├── Drag & drop or browse
   ├── Click "Parse & Preview"
   ├── csvParser.js reads CSV
   └── Shows preview
   
   Option C: MANUAL FORM
   ├── Fill out game details
   ├── Enter score
   ├── Click "Preview"
   └── Shows preview
   
4. Review parsed data
   ↓
5. Click "Submit for Review"
   ↓
6. dataFormatter.js converts to JSON:
   {
     game_date: "2026-02-16",
     sport: "basketball",
     home_team_id: "msd",
     away_team_id: "isd",
     home_score: 78,
     away_score: 65,
     game_data: {
       version: "1.0",
       game: { ... },
       players: [
         {
           name: "John Smith",
           school_id: "msd",
           stats: {
             points: 24,
             rebounds: 8,
             assists: 3
           }
         }
       ]
     }
   }
   ↓
7. supabase.from('game_submissions').insert(json)
   ↓
8. Status: "PENDING" - waits for your approval
```

### For You (Admin):

```
1. Login at /admin/admin-dashboard.html
   ↓
2. See pending submissions
   ↓
3. Review game data & player stats
   ↓
4. Click "Approve" or "Reject"
   ↓
5. If APPROVED:
   ├── approve_game_submission() function runs
   ├── Inserts into games table
   ├── Inserts into player_stats table
   └── Updates submission status to "approved"
   ↓
6. Data instantly appears on public site!
```

---

## 🔐 Security Features

### Row Level Security (RLS)
All tables have RLS enabled:

```sql
Athletic Directors can:
✅ Submit games for THEIR school only
✅ View THEIR submissions only
❌ Cannot see other schools' pending submissions
❌ Cannot approve their own submissions

Admins can:
✅ View ALL submissions
✅ Approve/reject ANY submission
✅ Access all data

Public can:
✅ View approved games only
✅ View approved player stats only
❌ Cannot see pending submissions
❌ Cannot submit anything
```

### Authentication Flow
- Uses Supabase Auth (JWT tokens)
- ANON key in `env.js` is safe (RLS protects data)
- No SERVICE_ROLE key in frontend
- Passwords hashed by Supabase

---

## 📱 Mobile Support

The system is fully responsive:

- **Athletic Directors** can submit from iPads/tablets in the gym
- **Copy/paste** works on mobile browsers
- **File uploads** work on iOS/Android
- **Forms** are touch-friendly
- **Login button** adapts to small screens

---

## 🎨 User Interface

### Public Site
- Login button in upper right corner
- "👤 Login" text on desktop
- "👤" icon only on mobile

### AD Portal
- Clean card-based interface
- 3 large submission method cards
- Preview before submitting
- Track submission status

### Admin Panel
- Dashboard with stats
- Pending count, approved today, total submissions
- One-click approve
- Reject with reason modal

---

## 🔧 Customization Options

### Add More Schools
```sql
-- Just create their account
INSERT INTO user_profiles (id, email, full_name, role, school_id, school_name)
VALUES (
  'user-id',
  'ad@school.edu',
  'AD Name',
  'athletic_director',
  'school-id',
  'School Full Name'
);
```

### Auto-Approve Trusted Schools
Modify RLS policy or add logic in dataFormatter.js:
```javascript
if (trustedSchools.includes(metadata.schoolId)) {
  // Auto-approve
  await autoApprove(formattedJSON);
}
```

### Add More Sports
The parsers auto-detect sports, but you can add to normalizeSport() in dataFormatter.js

### Email Notifications
Add Supabase Edge Functions to send emails when:
- New submission received
- Submission approved/rejected

---

## 🐛 Troubleshooting

### "Connection failed"
- Check SUPABASE_URL in env.js
- Check SUPABASE_ANON_KEY in env.js
- Verify RLS policies are enabled

### "Permission denied"
- Check user has correct role in user_profiles
- Verify RLS policies match role
- Check user is logged in (session exists)

### "Parser confidence low"
- Text format not recognized
- Try CSV upload instead
- Use manual form as fallback

### "Approval fails"
- Check approve_game_submission() function exists
- Verify admin role in user_profiles
- Check games and player_stats tables exist

---

## 📊 Monitoring

### Check Pending Submissions
```sql
SELECT 
  s.*,
  u.full_name,
  u.school_name
FROM game_submissions s
JOIN user_profiles u ON s.submitted_by = u.id
WHERE status = 'pending'
ORDER BY created_at DESC;
```

### Check Recent Approvals
```sql
SELECT * FROM games
WHERE created_at >= CURRENT_DATE
ORDER BY created_at DESC;
```

### User Activity
```sql
SELECT 
  u.full_name,
  u.school_name,
  COUNT(*) as submissions
FROM game_submissions s
JOIN user_profiles u ON s.submitted_by = u.id
GROUP BY u.id, u.full_name, u.school_name
ORDER BY submissions DESC;
```

---

## 🚀 Next Steps

### Phase 1 (Now)
✅ Database schema created
✅ Parsers built (text, CSV, manual)
✅ AD portal created
✅ Admin panel created
✅ Login button added
✅ Mobile responsive

### Phase 2 (Optional)
- [ ] Email notifications
- [ ] Bulk operations (approve multiple)
- [ ] Edit submitted games
- [ ] School statistics dashboard
- [ ] Export reports (PDF/Excel)

### Phase 3 (Future)
- [ ] Camera + OCR for paper scorebooks
- [ ] Real-time game updates
- [ ] Mobile app
- [ ] API for external systems

---

## 📞 Need Help?

Everything is built with the **same direct Supabase pattern** you're already using in `upload_to_supabase.html`:

```javascript
// Your existing pattern
const { data, error } = await supabaseClient
  .from('raw_stat_rows')
  .insert(record);

// New system uses the same pattern
 const { data, error } = await supabase
  .from('game_submissions')
  .insert(formattedData);
```

All three parsers output the same JSON format, making it easy to maintain and extend!
