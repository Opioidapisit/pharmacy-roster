# Pharmacy Roster Web V1
Firebase Authentication + Firestore profile test for GitHub Pages.

Upload the CONTENTS of this package to the repository root:
- index.html
- css/app.css
- js/firebase.js
- js/app.js

Before login testing, add `opioidapisit.github.io` under:
Firebase Console > Authentication > Settings > Authorized domains

Login UI accepts Username only. Internally:
`admin` -> `admin@pharmacy-roster.local`

Expected test:
1. Open GitHub Pages.
2. Login with username `admin` and the password used when creating the Firebase Auth account.
3. Dashboard should show Admin / admin / admin.
4. Logout should return to Login.
