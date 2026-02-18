# Test Account Credentials

## Admin Account
- **Email:** danielrfava@gmail.com
- **Password:** [Your password from Supabase Auth]
- **Role:** admin
- **Access:** Admin Dashboard + Athletic Director Portal

## Athletic Director Account
- **Email:** dummy.hoy@nsd.edu
- **Password:** Baseball1888
- **Role:** athletic_director  
- **School:** Nation School for the Deaf (NSD)
- **Access:** Athletic Director Portal (submit games)

## Login URLs
- **Athletic Director/Admin Login:** http://localhost:5000/src/portal/login.html
- **Admin Dashboard:** http://localhost:5000/src/admin/admin-dashboard.html
- **AD Dashboard:** http://localhost:5000/src/portal/dashboard.html

## Setup Status
✅ Database schema installed
✅ Admin account created
⏳ Athletic Director account - **verify profile exists in database**

## Troubleshooting
If "Cannot coerce the result to a single JSON object" error appears:
1. Check if profile exists: `SELECT * FROM user_profiles WHERE email = 'dummy.hoy@nsd.edu';`
2. If missing, run the INSERT statement again
3. Make sure auth user exists in Supabase Authentication panel
