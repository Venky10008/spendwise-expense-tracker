var h = require('../tests-task4/helper.js');
var U = require('../js/utils.js');
var test = h.test, eq = h.eq;

function time(fn) {
  var start = process.hrtime.bigint();
  var out = fn();
  return { ms: Number(process.hrtime.bigint() - start) / 1e6, out: out };
}

var rows = [];
for (var i = 0; i < U.MAX_IMPORT_ROWS; i++) {
  var day = String((i % 24) + 1).padStart(2, '0');
  var month = String((i % 11) + 1).padStart(2, '0');
  rows.push('2026-' + month + '-' + day + ',' + U.CATEGORIES[i % 8] + ',' + (i % 900 + 1) + '.50,"note, number ' + i + '"');
}
var text = U.CSV_HEADER + '\n' + rows.join('\n');

test('parsing a 5,000 row file takes under 150 ms', function () {
  var t = time(function () { return U.parseImport(text, '2026-11-24'); });
  console.log('  parseImport 5000 rows: ' + t.ms.toFixed(1) + ' ms');
  eq(t.out.items.length, 5000);
  eq(t.ms < 150, true);
});
test('monthly totals over 20,000 expenses takes under 50 ms', function () {
  var big = [];
  for (var i = 0; i < 20000; i++) big.push({ date: '2026-' + String((i % 11) + 1).padStart(2, '0') + '-10', amountPaise: i + 1 });
  var t = time(function () { return U.monthlyTotals(big, '2026-11', 6); });
  console.log('  monthlyTotals 20000: ' + t.ms.toFixed(1) + ' ms');
  eq(t.out.length, 6);
  eq(t.ms < 50, true);
});
test('a 5,000 row file imported with 5,000 rows already stored finishes under 300 ms', function () {
  global.window = { localStorage: h.fakeStorage() };
  Object.keys(require.cache).forEach(function (k) { if (k.indexOf('/js/') > -1) delete require.cache[k]; });
  require('../js/utils.js'); require('../js/storage.js'); require('../js/store.js');
  var SW = global.window.SW;
  SW.store.init();
  var items = SW.utils.parseImport(text, '2026-11-24').items;
  SW.store.addMany(items);
  var t = time(function () { return SW.store.addMany(items); });
  console.log('  addMany 5000 duplicates against 5000 stored: ' + t.ms.toFixed(1) + ' ms');
  eq(t.out.duplicates, 5000);
  eq(t.ms < 300, true);
});
test('a malformed 1 MB file is rejected quickly', function () {
  var junk = new Array(1048577).join('"');
  var t = time(function () { return U.parseImport(junk, '2026-11-24'); });
  console.log('  parseImport 1 MB of quotes: ' + t.ms.toFixed(1) + ' ms');
  eq(t.out.ok, false);
  eq(t.ms < 300, true);
});

h.finish('performance');
