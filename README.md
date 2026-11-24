# SpendWise - Expense Tracker

A small expense tracker built with plain HTML, CSS and JavaScript. No frameworks. The source runs as it is; the build step only makes the production copy.

![SpendWise on desktop](screenshots/app-final-desktop.png)

Double-click `index.html` to run it. Data is saved in localStorage, so it stays after a refresh.

What it does:

- add, edit and delete expenses (delete has a 5 second undo)
- monthly total, spending by category, and a budget bar
- search, filter and sort the list
- export to CSV and import it back (duplicates and bad rows are skipped and reported)
- last 6 months chart
- works offline after the first load (service worker)

Tests: `npm test` runs the unit, edge, integration, performance and deploy tests. `npm run build` then `npm run check:final` runs the real-browser checks (import, offline, mobile width).

The code is split into small files: `utils.js` has the helper functions, `storage.js` is the only file that talks to localStorage, `store.js` holds the data, `form.js`, `summary.js` and `list.js` are the three UI parts, and `app.js` wires them together. Money is stored as paise (integers) because floats add up wrong, and dates are stored as plain `YYYY-MM-DD` strings.

Deploying:

- `npm install` once, then `npm run build` makes the production files in `dist/` (minified, hashed file names, security headers).
- `npm run verify` checks the build. `npm run check:browser` opens it in Chrome, adds expenses and checks for errors.
- `npm run stage` puts the build on a local staging copy, `npm run promote` moves the same build to production if it passes, `npm run rollback` goes back one release.
- `.github/workflows/deploy.yml` runs the tests and publishes `dist/` to GitHub Pages when you push to `main`. In the repo settings, set Pages source to GitHub Actions.
- `npm run serve` serves `dist/` locally with a request log and a `/healthz` page.
