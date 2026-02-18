@echo off
setlocal

if "%NETLIFY_BUILD_HOOK_URL%"=="" (
  echo NETLIFY_BUILD_HOOK_URL environment variable is not set.
  echo.
  echo Set it in your terminal, then run this file again:
  echo   set NETLIFY_BUILD_HOOK_URL=https://api.netlify.com/build_hooks/your_hook_id
  exit /b 1
)

echo Triggering Netlify deploy...
curl -X POST -d "{}" "%NETLIFY_BUILD_HOOK_URL%"

if errorlevel 1 (
  echo.
  echo Failed to trigger Netlify deploy.
  exit /b 1
)

echo.
echo Netlify deploy hook triggered successfully.
exit /b 0