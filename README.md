# SpendWise - Expense Tracker

My Task 3 project: a small expense tracker built with plain HTML, CSS and JavaScript. No frameworks, no build step.

![SpendWise on desktop](screenshots/app-desktop.png)

Double-click `index.html` to run it. Data is saved in localStorage, so it stays after a refresh.

What it does:

- add, edit and delete expenses (delete has a 5 second undo)
- monthly total, spending by category, and a budget bar
- search, filter and sort the list
- export to CSV

Tests: open `tests/index.html` in a browser, or run `node tests/tests.js` (39 tests).

The code is split into small files: `utils.js` has the helper functions, `storage.js` is the only file that talks to localStorage, `store.js` holds the data, `form.js`, `summary.js` and `list.js` are the three UI parts, and `app.js` wires them together. Money is stored as paise (integers) because floats add up wrong, and dates are stored as plain `YYYY-MM-DD` strings.
