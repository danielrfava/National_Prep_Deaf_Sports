# 🗄️ SUPABASE SETUP - Step by Step

## 📋 **STEP 1: Open Supabase SQL Editor**

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project: **National Prep Deaf Sports**
3. Click **"SQL Editor"** in the left sidebar (icon looks like </> )
4. Click **"New Query"** button

---

## 📝 **STEP 2: Copy the SQL Schema**

**Open this file in your project:**
```
/workspaces/National_Prep_Deaf_Sports/auth-submission-schema.sql
```

**Copy ALL the SQL code** (it's about 400 lines)

---

## ▶️ **STEP 3: Run the SQL**

1. **Paste the entire SQL** into the Supabase SQL Editor
2. Click the **"RUN"** button (or press Ctrl+Enter / Cmd+Enter)
3. Wait for it to complete (should take 2-3 seconds)
4. You should see: **"Success. No rows returned"**

---

## ✅ **STEP 4: Verify Tables Were Created**

Click **"Table Editor"** in the left sidebar. You should see these NEW tables:

```
✓ user_profiles          - User accounts
✓ game_submissions       - Pending submissions  
✓ games                  - Approved games
✓ player_stats           - Approved player stats
```

Your existing tables (sports, schools, etc.) are unchanged!

---

## 👤 **STEP 5: Create Your Admin Account**

### A) Create Auth User First:

1. Go to **Authentication** > **Users**
2. Click **"Add User"**
3. Enter:
   - **Email:** your-email@example.com
   - **Password:** (create a strong password)
   - Leave "Auto Confirm User" **CHECKED**
4. Click **"Create User"**
5. **COPY THE USER ID** (it looks like: `123e4567-e89b-12d3-a456-426614174000`)

### B) Add Admin Profile:

1. Go back to **SQL Editor**
2. Run this query (replace with YOUR user ID and email):

```sql
INSERT INTO user_profiles (id, email, full_name, role)
VALUES (
  'paste-your-user-id-here',
  'your-email@example.com',
  'Your Full Name',
  'admin'
);
```

3. Click **RUN**
4. Should see: **"Success. 1 row(s) affected"**

---

## 🎓 **STEP 6: Create Test Athletic Director**

### A) Create Auth User:
1. Go to **Authentication** > **Users**  
2. Click **"Add User"**
3. Enter:
   - **Email:** testAD@msd.edu
   - **Password:** TestPassword123
   - Leave "Auto Confirm User" **CHECKED**
4. Click **"Create User"**
5. **COPY THE USER ID**

### B) Add AD Profile:

```sql
INSERT INTO user_profiles (id, email, full_name, role, school_id, school_name)
VALUES (
  'paste-ad-user-id-here',
  'testAD@msd.edu',
  'Test Athletic Director',
  'athletic_director',
  'msd',
  'Maryland School for the Deaf'
);
```

---

## 🧪 **STEP 7: Test The System**

### Test as Athletic Director:
1. Open: http://localhost:5000/portal/login.html
2. Login with: `testAD@msd.edu` / `TestPassword123`
3. Should redirect to dashboard!

### Test as Admin:
1. Open: http://localhost:5000/admin/admin-dashboard.html
2. Login with your admin email/password
3. Should see admin panel!

---

## ⚠️ **COMMON ISSUES**

### "Function approve_game_submission doesn't exist"
**Fix:** Make sure you ran ALL of the SQL schema (scroll to bottom of the file)

### "Row Level Security policy violation"
**Fix:** Check that user_profiles table has your user ID with correct role

### "Invalid login credentials"
**Fix:** 
- Make sure you're using the email/password you created in Authentication
- Check that Auto Confirm was enabled
- Verify user_profiles entry exists

### Tables not appearing
**Fix:** Refresh the Table Editor page, or check query for errors

---

## 🎯 **QUICK VERIFICATION CHECKLIST**

Run these queries to verify everything:

```sql
-- Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('user_profiles', 'game_submissions', 'games', 'player_stats');

-- Check your admin account
SELECT * FROM user_profiles WHERE role = 'admin';

-- Check RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('user_profiles', 'game_submissions', 'games', 'player_stats');
```

All should return results!

---

## 📞 **NEED HELP?**

If you get stuck:
1. Check Supabase logs: Dashboard > Project Settings > Logs
2. Check browser console: Press F12 > Console tab
3. Verify env.js has correct SUPABASE_URL and SUPABASE_ANON_KEY

---

## 🚀 **YOU'RE READY!**

Once you complete these steps:
✅ Database schema is set up
✅ Admin account created
✅ Test AD account created
✅ Authentication works
✅ Ready to submit first game!

