var h = require('./helper.js');
var U = require('../js/utils.js');
var test = h.test, eq = h.eq;

var cats = U.CATEGORIES;
function build(n) {
  var list = [];
  for (var i = 0; i < n; i++) {
    var day = String((i % 28) + 1).padStart(2, '0');
    var month = String((i % 12) + 1).padStart(2, '0');
    list.push({ id: 'e' + i, amountPaise: (i * 37) % 100000 + 1, category: cats[i % cats.length],
                date: '2026-' + month + '-' + day, note: 'item number ' + i, createdAt: i });
  }
  return list;
}
function time(fn) {
  var start = process.hrtime.bigint();
  var out = fn();
  var ms = Number(process.hrtime.bigint() - start) / 1e6;
  return { ms: ms, out: out };
}

var big = build(10000);

test('filter and sort 10,000 expenses takes under 200 ms', function () {
  var t = time(function () { return U.filterAndSort(big, { search: 'item', sort: 'amount-desc' }); });
  console.log('  filterAndSort 10000: ' + t.ms.toFixed(1) + ' ms');
  eq(t.out.length, 10000);
  eq(t.ms < 200, true);
});
test('category totals for 10,000 expenses takes under 100 ms', function () {
  var t = time(function () { return U.totalsByCategory(big); });
  console.log('  totalsByCategory 10000: ' + t.ms.toFixed(1) + ' ms');
  eq(t.out.length, 8);
  eq(t.ms < 100, true);
});
test('csv export of 10,000 expenses takes under 300 ms', function () {
  var t = time(function () { return U.toCSV(big); });
  console.log('  toCSV 10000: ' + t.ms.toFixed(1) + ' ms');
  eq(t.out.split('\n').length, 10001);
  eq(t.ms < 300, true);
});
test('sum of 10,000 expenses is exact integer', function () {
  var expected = 0;
  big.forEach(function (e) { expected += e.amountPaise; });
  eq(U.sumPaise(big), expected);
  eq(Number.isInteger(U.sumPaise(big)), true);
});

h.finish('performance');
