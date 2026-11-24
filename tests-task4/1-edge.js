var h = require('./helper.js');
var U = require('../js/utils.js');
var test = h.test, eq = h.eq;

function exp(id, amount, cat, date, note, created) {
  return { id: id, amountPaise: amount, category: cat, date: date, note: note || '', createdAt: created || 0 };
}

test('parseAmount: null and undefined give an error not a crash', function () {
  eq(U.parseAmount(null).ok, false);
  eq(U.parseAmount(undefined).ok, false);
});
test('parseAmount: number input 99.5 works', function () { eq(U.parseAmount(99.5).value, 9950); });
test('parseAmount: spaces around number are trimmed', function () { eq(U.parseAmount('  75  ').value, 7500); });
test('parseAmount: lone dot rejected', function () { eq(U.parseAmount('.').ok, false); });
test('parseAmount: plus sign rejected', function () { eq(U.parseAmount('+20').ok, false); });
test('parseAmount: currency symbol rejected', function () { eq(U.parseAmount('\u20B9100').ok, false); });
test('parseAmount: smallest amount 0.01 is 1 paisa', function () { eq(U.parseAmount('0.01').value, 1); });
test('parseAmount: exact max 1 crore accepted', function () { eq(U.parseAmount('10000000').value, 1000000000); });
test('parseAmount: one paisa over max rejected', function () { eq(U.parseAmount('10000000.01').ok, false); });
test('parseAmount: leading zeros 007 is 700 paise', function () { eq(U.parseAmount('007').value, 700); });
test('parseAmount: 19.99 does not drift (floating point check)', function () { eq(U.parseAmount('19.99').value, 1999); });
test('parseAmount: 1.15 stays 115', function () { eq(U.parseAmount('1.15').value, 115); });

test('formatMoney: zero', function () { eq(U.formatMoney(0), '\u20B90.00'); });
test('formatMoney: one crore', function () { eq(U.formatMoney(1000000000), '\u20B91,00,00,000.00'); });
test('formatMoney: 99999 paise', function () { eq(U.formatMoney(99999), '\u20B9999.99'); });

test('isValidDate: month 13 rejected', function () { eq(U.isValidDate('2026-13-01'), false); });
test('isValidDate: day 00 rejected', function () { eq(U.isValidDate('2026-05-00'), false); });
test('isValidDate: 30 April ok, 31 April rejected', function () {
  eq(U.isValidDate('2026-04-30'), true);
  eq(U.isValidDate('2026-04-31'), false);
});
test('isValidDate: 1900 is not a leap year', function () { eq(U.isValidDate('1900-02-29'), false); });
test('isValidDate: 2000 is a leap year', function () { eq(U.isValidDate('2000-02-29'), true); });
test('isValidDate: undefined and null are false', function () {
  eq(U.isValidDate(undefined), false);
  eq(U.isValidDate(null), false);
});

test('validateExpense: all fields bad gives 3 errors', function () {
  var r = U.validateExpense({ amount: 'x', category: 'Nope', date: 'bad', note: '' }, '2026-11-24');
  eq(Object.keys(r.errors).sort(), ['amount', 'category', 'date']);
});
test('validateExpense: today is allowed', function () {
  eq(U.validateExpense({ amount: '5', category: 'Food', date: '2026-11-24', note: '' }, '2026-11-24').ok, true);
});
test('validateExpense: tomorrow rejected', function () {
  eq(U.validateExpense({ amount: '5', category: 'Food', date: '2026-11-25', note: '' }, '2026-11-24').errors.date, 'Date cannot be in the future.');
});
test('validateExpense: note of exactly 60 chars ok, 61 rejected', function () {
  var base = { amount: '5', category: 'Food', date: '2026-11-20' };
  eq(U.validateExpense({ amount: base.amount, category: base.category, date: base.date, note: new Array(61).join('a') }, '2026-11-24').ok, true);
  eq(U.validateExpense({ amount: base.amount, category: base.category, date: base.date, note: new Array(62).join('a') }, '2026-11-24').ok, false);
});
test('validateExpense: missing note field becomes empty string', function () {
  eq(U.validateExpense({ amount: '5', category: 'Food', date: '2026-11-20' }, '2026-11-24').clean.note, '');
});
test('validateExpense: script tag in note is kept as plain text', function () {
  var r = U.validateExpense({ amount: '5', category: 'Food', date: '2026-11-20', note: '<img src=x onerror=alert(1)>' }, '2026-11-24');
  eq(r.clean.note, '<img src=x onerror=alert(1)>');
});

test('filterAndSort: empty list gives empty list', function () { eq(U.filterAndSort([], { sort: 'date-desc' }), []); });
test('filterAndSort: unknown sort falls back to newest first', function () {
  var list = [exp('a', 1, 'Food', '2026-11-01'), exp('b', 1, 'Food', '2026-11-09')];
  eq(U.filterAndSort(list, { sort: 'weird' }).map(function (e) { return e.id; }), ['b', 'a']);
});
test('filterAndSort: same date ordered by createdAt', function () {
  var list = [exp('a', 1, 'Food', '2026-11-01', '', 1), exp('b', 1, 'Food', '2026-11-01', '', 2)];
  eq(U.filterAndSort(list, { sort: 'date-desc' }).map(function (e) { return e.id; }), ['b', 'a']);
  eq(U.filterAndSort(list, { sort: 'date-asc' }).map(function (e) { return e.id; }), ['a', 'b']);
});
test('filterAndSort: search is case insensitive and checks category', function () {
  var list = [exp('a', 1, 'Travel', '2026-11-01', 'Metro card'), exp('b', 1, 'Food', '2026-11-02', 'TRAVEL snacks')];
  eq(U.filterAndSort(list, { search: 'travel' }).length, 2);
  eq(U.filterAndSort(list, { search: 'METRO' }).length, 1);
});
test('filterAndSort: month filter excludes other months', function () {
  var list = [exp('a', 1, 'Food', '2026-10-31'), exp('b', 1, 'Food', '2026-11-01')];
  eq(U.filterAndSort(list, { month: '2026-11' }).length, 1);
});
test('filterAndSort: category All keeps everything', function () {
  var list = [exp('a', 1, 'Food', '2026-11-01'), exp('b', 1, 'Bills', '2026-11-01')];
  eq(U.filterAndSort(list, { category: 'All' }).length, 2);
});
test('filterAndSort: does not change the original array', function () {
  var list = [exp('a', 5, 'Food', '2026-11-01'), exp('b', 1, 'Food', '2026-11-02')];
  U.filterAndSort(list, { sort: 'amount-asc' });
  eq(list.map(function (e) { return e.id; }), ['a', 'b']);
});
test('filterAndSort: note missing does not crash search', function () {
  var list = [{ id: 'a', amountPaise: 1, category: 'Food', date: '2026-11-01', createdAt: 0 }];
  eq(U.filterAndSort(list, { search: 'zzz' }).length, 0);
});

test('sumPaise: empty is 0', function () { eq(U.sumPaise([]), 0); });
test('sumPaise: ten times 0.10 is exactly 100 paise', function () {
  var list = [];
  for (var i = 0; i < 10; i++) list.push(exp('x' + i, 10, 'Food', '2026-11-01'));
  eq(U.sumPaise(list), 100);
});
test('totalsByCategory: empty gives empty list', function () { eq(U.totalsByCategory([]), []); });
test('totalsByCategory: sorted biggest first with percent', function () {
  var list = [exp('a', 2500, 'Food', '2026-11-01'), exp('b', 7500, 'Bills', '2026-11-01')];
  eq(U.totalsByCategory(list), [{ category: 'Bills', total: 7500, percent: 75 }, { category: 'Food', total: 2500, percent: 25 }]);
});

test('toCSV: no expenses gives header only', function () { eq(U.toCSV([]), 'Date,Category,Amount (INR),Note'); });
test('toCSV: amount written with 2 decimals', function () {
  eq(U.toCSV([exp('a', 5, 'Food', '2026-11-01', 'x')]).split('\n')[1], '2026-11-01,Food,0.05,x');
});
test('toCSV: newline in note is wrapped in quotes', function () {
  eq(U.toCSV([exp('a', 100, 'Food', '2026-11-01', 'a\nb')]).indexOf('"a\nb"') > -1, true);
});
test('toCSV: plus and at-sign notes get a leading quote', function () {
  eq(U.toCSV([exp('a', 100, 'Food', '2026-11-01', '+91')]).split('\n')[1].split(',')[3], "'+91");
  eq(U.toCSV([exp('a', 100, 'Food', '2026-11-01', '@sum')]).split('\n')[1].split(',')[3], "'@sum");
});

test('makeId: 1000 ids are all different', function () {
  var seen = {};
  for (var i = 0; i < 1000; i++) seen[U.makeId()] = true;
  eq(Object.keys(seen).length, 1000);
});

h.finish('edge');
