(function (root) {
  'use strict';

  var CATEGORIES = ['Food', 'Travel', 'Shopping', 'Bills', 'Entertainment', 'Health', 'Education', 'Other'];
  var MAX_PAISE = 1000000000;
  var MAX_NOTE = 60;

function parseAmount(text) {
    var s = String(text == null ? '' : text).trim().replace(/,/g, '');
    if (s === '') return { ok: false, error: 'Enter an amount.' };
    if (!/^\d*\.?\d+$|^\d+\.$/.test(s)) return { ok: false, error: 'Use numbers only, like 249.50.' };
    var parts = s.split('.');
    if (parts[1] && parts[1].length > 2) return { ok: false, error: 'Use at most 2 decimal places.' };
    var rupees = parseInt(parts[0] || '0', 10);
    var paise = parseInt(((parts[1] || '') + '00').slice(0, 2), 10);
    var total = rupees * 100 + paise;
    if (total <= 0) return { ok: false, error: 'Amount must be more than 0.' };
    if (total > MAX_PAISE) return { ok: false, error: 'That amount looks too large (max 1,00,00,000).' };
    return { ok: true, value: total };
  }

function formatMoney(paise) {
    var rupees = (paise || 0) / 100;
    return '\u20B9' + rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

function toISODate(d) {
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }
  function todayISO() { return toISODate(new Date()); }

function isValidDate(str) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str || '')) return false;
    var p = str.split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2]);
    return d.getFullYear() === p[0] && d.getMonth() === p[1] - 1 && d.getDate() === p[2];
  }

function validateExpense(input, today) {
    var errors = {};
    var clean = {};
    var amt = parseAmount(input.amount);
    if (amt.ok) clean.amountPaise = amt.value; else errors.amount = amt.error;

    if (CATEGORIES.indexOf(input.category) === -1) errors.category = 'Pick a category.';
    else clean.category = input.category;

    if (!isValidDate(input.date)) errors.date = 'Pick a valid date.';
    else if (input.date > (today || todayISO())) errors.date = 'Date cannot be in the future.';
    else clean.date = input.date;

    var note = String(input.note || '').trim();
    if (note.length > MAX_NOTE) errors.note = 'Note is too long (max ' + MAX_NOTE + ').';
    else clean.note = note;

    return { ok: Object.keys(errors).length === 0, errors: errors, clean: clean };
  }

  function makeId() {
    return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

function filterAndSort(expenses, opts) {
    var q = (opts.search || '').trim().toLowerCase();
    var out = expenses.filter(function (e) {
      if (opts.month && e.date.slice(0, 7) !== opts.month) return false;
      if (opts.category && opts.category !== 'All' && e.category !== opts.category) return false;
      if (q && (e.note || '').toLowerCase().indexOf(q) === -1 && e.category.toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    var sorters = {
      'date-desc': function (a, b) { return b.date.localeCompare(a.date) || b.createdAt - a.createdAt; },
      'date-asc': function (a, b) { return a.date.localeCompare(b.date) || a.createdAt - b.createdAt; },
      'amount-desc': function (a, b) { return b.amountPaise - a.amountPaise; },
      'amount-asc': function (a, b) { return a.amountPaise - b.amountPaise; }
    };
    return out.sort(sorters[opts.sort] || sorters['date-desc']);
  }

  function sumPaise(expenses) {
    return expenses.reduce(function (t, e) { return t + e.amountPaise; }, 0);
  }

function totalsByCategory(expenses) {
    var totals = {};
    expenses.forEach(function (e) { totals[e.category] = (totals[e.category] || 0) + e.amountPaise; });
    var grand = sumPaise(expenses);
    return Object.keys(totals).map(function (c) {
      return { category: c, total: totals[c], percent: grand ? Math.round(totals[c] / grand * 100) : 0 };
    }).sort(function (a, b) { return b.total - a.total; });
  }

function csvCell(v) {
    var s = String(v == null ? '' : v);
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCSV(expenses) {
    var rows = ['Date,Category,Amount (INR),Note'];
    expenses.forEach(function (e) {
      rows.push([e.date, e.category, (e.amountPaise / 100).toFixed(2), e.note].map(csvCell).join(','));
    });
    return rows.join('\n');
  }

  var HEADER = 'Date,Category,Amount (INR),Note';
  var MAX_IMPORT_ROWS = 5000;

  function parseCSV(text) {
    var rows = [];
    var row = [];
    var cell = '';
    var quoted = false;
    var s = String(text == null ? '' : text).replace(/^\uFEFF/, '');
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (quoted) {
        if (c === '"') {
          if (s[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
        } else cell += c;
      } else if (c === '"' && cell === '') {
        quoted = true;
      } else if (c === ',') {
        row.push(cell); cell = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && s[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        rows.push(row); row = [];
      } else cell += c;
    }
    if (quoted) return { ok: false, error: 'The file has a quote that never closes.' };
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return { ok: true, rows: rows.filter(function (r) { return !(r.length === 1 && r[0].trim() === ''); }) };
  }

  function expenseKey(e) {
    return [e.date, e.category, e.amountPaise, e.note].join('|');
  }

  function parseImport(text, today) {
    var parsed = parseCSV(text);
    if (!parsed.ok) return { ok: false, error: parsed.error, items: [], errors: [] };
    var rows = parsed.rows;
    if (rows.length === 0) return { ok: false, error: 'The file is empty.', items: [], errors: [] };
    var head = rows[0].map(function (h) { return h.trim().toLowerCase(); }).join(',');
    if (head !== HEADER.toLowerCase()) {
      return { ok: false, error: 'The first row must be: ' + HEADER, items: [], errors: [] };
    }
    if (rows.length - 1 > MAX_IMPORT_ROWS) {
      return { ok: false, error: 'Too many rows (limit ' + MAX_IMPORT_ROWS + ').', items: [], errors: [] };
    }
    var items = [];
    var errors = [];
    rows.slice(1).forEach(function (r, i) {
      var line = i + 2;
      if (r.length !== 4) { errors.push({ line: line, message: 'expected 4 columns, found ' + r.length }); return; }
      var category = CATEGORIES.filter(function (c) { return c.toLowerCase() === r[1].trim().toLowerCase(); })[0] || r[1];
      var note = r[3].replace(/^'(?=[=+\-@])/, '');
      var result = validateExpense({ amount: r[2], category: category, date: r[0].trim(), note: note }, today);
      if (!result.ok) {
        errors.push({ line: line, message: Object.keys(result.errors).map(function (k) { return result.errors[k]; }).join(' ') });
        return;
      }
      items.push(result.clean);
    });
    return { ok: true, items: items, errors: errors };
  }

  function monthlyTotals(expenses, endMonth, count) {
    var p = endMonth.split('-').map(Number);
    var months = [];
    for (var i = count - 1; i >= 0; i--) {
      var d = new Date(p[0], p[1] - 1 - i, 1);
      months.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
    }
    var totals = {};
    expenses.forEach(function (e) { var m = e.date.slice(0, 7); totals[m] = (totals[m] || 0) + e.amountPaise; });
    return months.map(function (m) { return { month: m, total: totals[m] || 0 }; });
  }

  var api = {
    CATEGORIES: CATEGORIES, MAX_NOTE: MAX_NOTE,
    parseAmount: parseAmount, formatMoney: formatMoney, toISODate: toISODate, todayISO: todayISO,
    isValidDate: isValidDate, validateExpense: validateExpense, makeId: makeId,
    filterAndSort: filterAndSort, sumPaise: sumPaise, totalsByCategory: totalsByCategory, toCSV: toCSV,
    parseCSV: parseCSV, parseImport: parseImport, expenseKey: expenseKey, monthlyTotals: monthlyTotals,
    CSV_HEADER: HEADER, MAX_IMPORT_ROWS: MAX_IMPORT_ROWS
  };
  root.SW = root.SW || {};
  root.SW.utils = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
