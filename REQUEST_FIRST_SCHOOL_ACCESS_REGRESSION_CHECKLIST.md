# Request-First School Access Regression Checklist

Use this after the next live deploy to verify the full request-first flow in one pass.

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
