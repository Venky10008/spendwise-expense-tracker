(function (root) {
  'use strict';
  var KEY = 'spendwise.v1';

function isGoodExpense(e) {
    return e && typeof e.id === 'string' &&
      Number.isInteger(e.amountPaise) && e.amountPaise > 0 &&
      root.SW.utils.CATEGORIES.indexOf(e.category) !== -1 &&
      root.SW.utils.isValidDate(e.date) &&
      typeof e.note === 'string';
  }

function load() {
    var empty = { version: 1, budgetPaise: null, expenses: [] };
    var raw;
    try {
      raw = root.localStorage.getItem(KEY);
    } catch (err) {

      return { data: empty, warning: 'Browser storage is blocked, so your data will not be saved after you close this tab.' };
    }
    if (raw === null) return { data: empty, warning: null };

    try {
      var parsed = JSON.parse(raw);
      var list = Array.isArray(parsed.expenses) ? parsed.expenses : [];
      var good = list.filter(isGoodExpense).map(function (e) {
        return { id: e.id, amountPaise: e.amountPaise, category: e.category, date: e.date, note: e.note,
                 createdAt: Number.isFinite(e.createdAt) ? e.createdAt : 0 };
      });
      var skipped = list.length - good.length;
      var budget = Number.isInteger(parsed.budgetPaise) && parsed.budgetPaise > 0 ? parsed.budgetPaise : null;
      return {
        data: { version: 1, budgetPaise: budget, expenses: good },
        warning: skipped > 0 ? skipped + ' saved item(s) were damaged and skipped.' : null
      };
    } catch (err) {

      try { root.localStorage.setItem(KEY + '.corrupt-backup', raw); } catch (e2) {  }
      return { data: empty, warning: 'Saved data could not be read, so I started fresh. A backup of the old data was kept.' };
    }
  }

function save(data) {
    try {
      root.localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (err) {
      return false;
    }
  }

  root.SW = root.SW || {};
  root.SW.storage = { load: load, save: save, KEY: KEY };
})(window);
