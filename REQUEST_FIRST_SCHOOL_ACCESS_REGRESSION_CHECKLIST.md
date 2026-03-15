# Request-First School Access Regression Checklist

Use this after the next live deploy to verify the full request-first flow in one pass.

Migration note:
- `public.sync_school_access_request_state()` must remain `SECURITY DEFINER` because public request inserts pass through that trigger and it validates `user_profiles`.
- The duplicate `user_profiles` guard in `public.sync_school_access_request_state()` must run on `INSERT` only, not on approval-state `UPDATE`s for already-invited users.

Deployment note:
- Set `PUBLIC_SITE_URL` in Netlify to the live NPDS site origin so activation emails link to `/portal/activate-account.html` on the deployed site, not a local host.

Email template follow-up:
- Update Supabase invite and recovery email templates so they read like NPDS and focus on school stats upload / school account activation rather than generic Supabase copy.

Approval ordering note:
- Admin approval must stamp `school_access_requests` to `approved` and `reviewed` before the activation email is sent, so no invite email is ever sent from a still-pending request.
- Resend activation must stay separate from initial approve.

## Public Request Page

- Confirm `portal/create-account.html` loads the password-free `Request School Access` form.
- Confirm the page loads school options successfully.
- Submit a real test request.
- Confirm the browser does not hit `user_profiles` during public request submit.
- Confirm the request writes to `public.school_access_requests`.

## Admin Review

- Confirm the new request appears in the admin school access review queue.
- Confirm requester name, email, school, requested role, job title, AD reference, and notes all render clearly.
- Confirm blocked approval states are explicit when required data is missing.
- Confirm approve sends the activation path without creating a fake success state.

## Activation

- Confirm the approved requester receives the activation email.
- Confirm the activation link opens `portal/activate-account.html`.
- Confirm password setup succeeds.
- Confirm activation promotes the request and creates or updates the approved school profile correctly.

## School Login

- Confirm the activated user can log in with the new password.
- Confirm login routes to the school dashboard.
- Confirm the dashboard behaves like an approved school-scoped account.
