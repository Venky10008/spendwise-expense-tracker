var h = require('../tests-task4/helper.js');
var U = require('../js/utils.js');
var test = h.test, eq = h.eq;

var TODAY = '2026-11-24';
var HEAD = 'Date,Category,Amount (INR),Note\n';

test('parseCSV reads plain rows', function () {
  eq(U.parseCSV('a,b\n1,2').rows, [['a', 'b'], ['1', '2']]);
});
test('parseCSV handles CRLF line endings', function () {
  eq(U.parseCSV('a,b\r\n1,2\r\n').rows, [['a', 'b'], ['1', '2']]);
});
test('parseCSV handles a quoted comma', function () {
  eq(U.parseCSV('a,"b,c"').rows, [['a', 'b,c']]);
});
test('parseCSV handles a doubled quote inside a quoted cell', function () {
  eq(U.parseCSV('"say ""hi"""').rows, [['say "hi"']]);
});
test('parseCSV handles a newline inside a quoted cell', function () {
  eq(U.parseCSV('"a\nb",c').rows, [['a\nb', 'c']]);
});
test('parseCSV drops a byte order mark', function () {
  eq(U.parseCSV('\uFEFFa,b').rows, [['a', 'b']]);
});
test('parseCSV skips blank lines', function () {
  eq(U.parseCSV('a,b\n\n1,2\n\n').rows.length, 2);
});
test('parseCSV keeps empty cells', function () {
  eq(U.parseCSV('a,,c').rows, [['a', '', 'c']]);
});
test('parseCSV rejects an unclosed quote', function () {
  eq(U.parseCSV('a,"b').ok, false);
});
test('parseCSV on empty text gives no rows', function () {
  eq(U.parseCSV('').rows, []);
});

test('parseImport accepts one good row', function () {
  var r = U.parseImport(HEAD + '2026-11-20,Food,249.50,Biryani', TODAY);
  eq(r.ok, true);
  eq(r.items, [{ amountPaise: 24950, category: 'Food', date: '2026-11-20', note: 'Biryani' }]);
  eq(r.errors, []);
});
test('parseImport matches the category without caring about case', function () {
  eq(U.parseImport(HEAD + '2026-11-20,food,10,x', TODAY).items[0].category, 'Food');
});
test('parseImport rejects a file with the wrong header', function () {
  var r = U.parseImport('Date,Amount\n2026-11-20,5', TODAY);
  eq(r.ok, false);
  eq(/first row/i.test(r.error), true);
});
test('parseImport rejects an empty file', function () {
  eq(U.parseImport('', TODAY).ok, false);
});
test('parseImport reports the line number of each bad row', function () {
  var r = U.parseImport(HEAD + '2026-11-20,Food,10,ok\n2026-11-21,Pets,10,bad\n2026-13-01,Food,10,bad', TODAY);
  eq(r.items.length, 1);
  eq(r.errors.map(function (e) { return e.line; }), [3, 4]);
});
test('parseImport rejects a future date', function () {
  eq(U.parseImport(HEAD + '2026-12-25,Food,10,x', TODAY).errors.length, 1);
});
test('parseImport rejects a row with the wrong column count', function () {
  var r = U.parseImport(HEAD + '2026-11-20,Food,10', TODAY);
  eq(r.errors[0].message, 'expected 4 columns, found 3');
});
test('parseImport rejects a zero amount and a negative amount', function () {
  eq(U.parseImport(HEAD + '2026-11-20,Food,0,x\n2026-11-20,Food,-5,x', TODAY).errors.length, 2);
});
test('parseImport rejects a note longer than 60 characters', function () {
  eq(U.parseImport(HEAD + '2026-11-20,Food,10,' + new Array(62).join('a'), TODAY).errors.length, 1);
});
test('parseImport removes the formula guard that export adds', function () {
  eq(U.parseImport(HEAD + "2026-11-20,Food,10,'=SUM(A1)", TODAY).items[0].note, '=SUM(A1)');
});
test('parseImport keeps a normal leading apostrophe', function () {
  eq(U.parseImport(HEAD + "2026-11-20,Food,10,'tis", TODAY).items[0].note, "'tis");
});
test('parseImport refuses more rows than the limit', function () {
  var rows = [];
  for (var i = 0; i <= U.MAX_IMPORT_ROWS; i++) rows.push('2026-11-20,Food,10,x');
  eq(U.parseImport(HEAD + rows.join('\n'), TODAY).ok, false);
});
test('parseImport accepts exactly the row limit', function () {
  var rows = [];
  for (var i = 0; i < U.MAX_IMPORT_ROWS; i++) rows.push('2026-11-20,Food,10,x');
  var r = U.parseImport(HEAD + rows.join('\n'), TODAY);
  eq(r.ok, true);
  eq(r.items.length, U.MAX_IMPORT_ROWS);
});
test('export then import gives back the same expenses', function () {
  var list = [
    { id: 'a', amountPaise: 24950, category: 'Food', date: '2026-11-20', note: 'Biryani, large', createdAt: 1 },
    { id: 'b', amountPaise: 120000, category: 'Bills', date: '2026-11-01', note: '=cmd', createdAt: 2 },
    { id: 'c', amountPaise: 5, category: 'Other', date: '2026-10-31', note: 'say "hi"\nthere', createdAt: 3 }
  ];
  var back = U.parseImport(U.toCSV(list), TODAY);
  eq(back.errors, []);
  eq(back.items.map(U.expenseKey), list.map(U.expenseKey));
});

test('expenseKey is the same for the same expense and differs when the note differs', function () {
  var a = { date: '2026-11-20', category: 'Food', amountPaise: 100, note: 'x' };
  eq(U.expenseKey(a), U.expenseKey(Object.assign({}, a)));
  eq(U.expenseKey(a) === U.expenseKey(Object.assign({}, a, { note: 'y' })), false);
});

test('monthlyTotals returns six months ending at the chosen month', function () {
  var r = U.monthlyTotals([], '2026-11', 6);
  eq(r.map(function (m) { return m.month; }), ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
});
test('monthlyTotals crosses a year boundary', function () {
  var r = U.monthlyTotals([], '2026-02', 4);
  eq(r.map(function (m) { return m.month; }), ['2025-11', '2025-12', '2026-01', '2026-02']);
});
test('monthlyTotals adds up each month and gives zero for empty months', function () {
  var list = [
    { date: '2026-11-02', amountPaise: 100 }, { date: '2026-11-30', amountPaise: 250 },
    { date: '2026-09-15', amountPaise: 999 }, { date: '2025-01-01', amountPaise: 7 }
  ];
  var r = U.monthlyTotals(list, '2026-11', 3);
  eq(r.map(function (m) { return m.total; }), [999, 0, 350]);
});

h.finish('unit');
