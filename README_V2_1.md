# Pharmacy Roster V2.1.1 — Cache-safe hotfix

This hotfix fixes the error:
`Cannot set properties of null (setting 'textContent')`

Why it happened:
GitHub Pages/browser can briefly serve an older `index.html` together with a newer `app.js`
while a deployment or browser cache is still updating. V2 app.js expected V2 DOM elements
such as `topUser`, `dashName`, and `loadingText`; if old HTML was still cached, login could
succeed in Firebase but rendering would fail.

Changes:
- Cache-busting versions on app.css, app.js, and firebase.js
- Safe DOM text setters
- Safe loading/toast/event handling
- Build marker `Build V2.1.1` on login screen

Upload/overwrite these four files at repo root:
- index.html
- app.css
- app.js
- firebase.js

After GitHub Pages deployment is green:
- Open the site with Ctrl+F5
- Confirm `Build V2.1.1` is visible
- Login as admin
