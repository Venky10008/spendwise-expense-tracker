/*
 * tests.js - small hand-written test runner (no libraries).
 * Run in the browser: open tests/index.html
 * Run in Node:        node tests/tests.js
 */
if (typeof require !== 'undefined' && typeof window === 'undefined') require('../js/utils.js');
(function (root) {
  'use strict';
  var U = root.SW.utils;
  var results = [];
  function test(name, fn) {
    try { fn(); results.push({ name: name, pass: true }); }
    catch (e) { results.push({ name: name, pass: false, msg: e.message }); }
  }
  function eq(actual, expected) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error('expected ' + JSON.stringify(expected) + ' but got ' + JSON.stringify(actual));
    }
  }

  // ---- parseAmount ----
  test('parses 249.50 to 24950 paise', function () { eq(U.parseAmount('249.50'), { ok: true, value: 24950 }); });
  test('parses whole number 500', function () { eq(U.parseAmount('500').value, 50000); });
  test('accepts commas: 1,25,000', function () { eq(U.parseAmount('1,25,000').value, 12500000); });
  test('accepts .5 and 5.', function () { eq(U.parseAmount('.5').value, 50); eq(U.parseAmount('5.').value, 500); });
  test('0.1 + 0.2 style sums stay exact', function () { eq(U.parseAmount('0.1').value + U.parseAmount('0.2').value, 30); });
  test('rejects empty', function () { eq(U.parseAmount('   ').ok, false); });
  test('rejects zero', function () { eq(U.parseAmount('0').ok, false); eq(U.parseAmount('0.00').ok, false); });
  test('rejects negative', function () { eq(U.parseAmount('-50').ok, false); });
  test('rejects letters and 1e5', function () { eq(U.parseAmount('abc').ok, false); eq(U.parseAmount('1e5').ok, false); });
  test('rejects 3 decimal places', function () { eq(U.parseAmount('10.999').ok, false); });
  test('rejects absurdly large amount', function () { eq(U.parseAmount('99999999999').ok, false); });
  test('rejects two dots', function () { eq(U.parseAmount('1.2.3').ok, false); });

  // ---- formatMoney ----
  test('formats with Indian grouping', function () { eq(U.formatMoney(12500000), '\u20B91,25,000.00'); });
  test('formats small value', function () { eq(U.formatMoney(5), '\u20B90.05'); });
  test('formats undefined as zero', function () { eq(U.formatMoney(undefined), '\u20B90.00'); });

  // ---- dates ----
  test('valid date passes', function () { eq(U.isValidDate('2026-11-24'), true); });
  test('rejects 31 Feb', function () { eq(U.isValidDate('2026-02-31'), false); });
  test('accepts 29 Feb on a leap year only', function () { eq(U.isValidDate('2028-02-29'), true); eq(U.isValidDate('2027-02-29'), false); });
  test('rejects empty and wrong format', function () { eq(U.isValidDate(''), false); eq(U.isValidDate('24/11/2026'), false); });
  test('toISODate uses local date, pads month and day', function () { eq(U.toISODate(new Date(2026, 0, 5)), '2026-01-05'); });

  // ---- validateExpense ----
  var good = { amount: '120', category: 'Food', date: '2026-11-20', note: ' Lunch ' };
  test('valid expense is cleaned (note trimmed)', function () {
    var r = U.validateExpense(good, '2026-11-24');
    eq(r.ok, true); eq(r.clean, { amountPaise: 12000, category: 'Food', date: '2026-11-20', note: 'Lunch' });
  });
  test('future date rejected', function () { eq(U.validateExpense({ amount: '1', category: 'Food', date: '2026-12-01', note: '' }, '2026-11-24').errors.date, 'Date cannot be in the future.'); });
  test('today is allowed', function () { eq(U.validateExpense({ amount: '1', category: 'Food', date: '2026-11-24', note: '' }, '2026-11-24').ok, true); });
  test('missing category rejected', function () { eq(U.validateExpense({ amount: '1', category: '', date: '2026-11-20', note: '' }, '2026-11-24').ok, false); });
  test('note over 60 chars rejected', function () { eq(U.validateExpense({ amount: '1', category: 'Food', date: '2026-11-20', note: new Array(62).join('a') }, '2026-11-24').ok, false); });
  test('all errors reported together', function () { eq(Object.keys(U.validateExpense({ amount: '', category: '', date: '', note: '' }, '2026-11-24').errors).length, 3); });

  // ---- filter / sort / totals ----
  var data = [
    { id: 'a', amountPaise: 10000, category: 'Food', date: '2026-11-02', note: 'Biryani', createdAt: 1 },
    { id: 'b', amountPaise: 250000, category: 'Bills', date: '2026-11-10', note: 'Wifi', createdAt: 2 },
    { id: 'c', amountPaise: 5000, category: 'Food', date: '2026-10-30', note: 'Tea', createdAt: 3 },
    { id: 'd', amountPaise: 5000, category: 'Food', date: '2026-11-10', note: 'Tea again', createdAt: 4 }
  ];
  test('month filter keeps only that month', function () { eq(U.filterAndSort(data, { month: '2026-11', sort: 'date-asc' }).map(function (e) { return e.id; }), ['a', 'b', 'd']); });
  test('empty month means all time', function () { eq(U.filterAndSort(data, { month: '', sort: 'date-asc' }).length, 4); });
  test('category filter', function () { eq(U.filterAndSort(data, { category: 'Bills' }).length, 1); });
  test('search is case-insensitive', function () { eq(U.filterAndSort(data, { search: 'TEA' }).length, 2); });
  test('sort by amount desc', function () { eq(U.filterAndSort(data, { sort: 'amount-desc' })[0].id, 'b'); });
  test('same-date items fall back to newest created first', function () { eq(U.filterAndSort(data, { month: '2026-11', sort: 'date-desc' }).map(function (e) { return e.id; }), ['d', 'b', 'a']); });
  test('filtering does not change original array', function () { var copy = data.slice(); U.filterAndSort(data, { sort: 'amount-asc' }); eq(data, copy); });
  test('sumPaise of empty list is 0', function () { eq(U.sumPaise([]), 0); });
  test('totalsByCategory, biggest first', function () { var t = U.totalsByCategory(data); eq(t[0].category, 'Bills'); eq(t[0].total, 250000); });
  test('totalsByCategory of empty list is empty', function () { eq(U.totalsByCategory([]), []); });

  // ---- CSV ----
  test('csv wraps cells with commas and doubles quotes', function () {
    var csv = U.toCSV([{ date: '2026-11-02', category: 'Food', amountPaise: 12050, note: 'Dosa, "special"' }]);
    eq(csv.split('\n')[1], '2026-11-02,Food,120.50,"Dosa, ""special"""');
  });
  test('csv neutralises formula-looking notes', function () {
    var csv = U.toCSV([{ date: '2026-11-02', category: 'Food', amountPaise: 100, note: '=SUM(A1)' }]);
    eq(csv.split('\n')[1].indexOf("'=SUM") > -1, true);
  });
  test('makeId gives different ids', function () { eq(U.makeId() !== U.makeId(), true); });

  // ---- report ----
  var failed = results.filter(function (r) { return !r.pass; });
  if (typeof document !== 'undefined') {
    var out = document.getElementById('results');
    out.innerHTML = '<h2>' + (results.length - failed.length) + ' / ' + results.length + ' passed</h2>';
    results.forEach(function (r) {
      var li = document.createElement('li');
      li.textContent = (r.pass ? 'PASS  ' : 'FAIL  ') + r.name + (r.msg ? '  -> ' + r.msg : '');
      li.style.color = r.pass ? '#2b9348' : '#c92a2a';
      out.appendChild(li);
    });
  } else {
    results.forEach(function (r) { console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.msg ? ' -> ' + r.msg : '')); });
    console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
    if (failed.length) process.exit(1);
  }
})(typeof window !== 'undefined' ? window : globalThis);
