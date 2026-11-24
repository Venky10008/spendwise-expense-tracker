var h = require('../tests-task4/helper.js');
var test = h.test, eq = h.eq;

function boot(storage) {
  global.window = { localStorage: storage };
  Object.keys(require.cache).forEach(function (k) {
    if (k.indexOf('/js/') > -1) delete require.cache[k];
  });
  require('../js/utils.js');
  require('../js/storage.js');
  require('../js/store.js');
  return global.window.SW;
}
var HEAD = 'Date,Category,Amount (INR),Note\n';
var TODAY = '2026-11-24';

test('addMany adds every new row and saves once', function () {
  var ls = h.fakeStorage();
  var writes = 0;
  var original = ls.setItem;
  ls.setItem = function (k, v) { writes++; original(k, v); };
  var SW = boot(ls);
  SW.store.init();
  var parsed = SW.utils.parseImport(HEAD + '2026-11-01,Food,100,a\n2026-11-02,Bills,200,b\n2026-11-03,Travel,300,c', TODAY);
  var r = SW.store.addMany(parsed.items);
  eq(r, { added: 3, duplicates: 0 });
  eq(SW.store.state().expenses.length, 3);
  eq(writes, 1);
});

test('addMany skips rows that already exist', function () {
  var SW = boot(h.fakeStorage());
  SW.store.init();
  SW.store.add({ amountPaise: 10000, category: 'Food', date: '2026-11-01', note: 'a' });
  var parsed = SW.utils.parseImport(HEAD + '2026-11-01,Food,100,a\n2026-11-02,Food,100,a', TODAY);
  eq(SW.store.addMany(parsed.items), { added: 1, duplicates: 1 });
  eq(SW.store.state().expenses.length, 2);
});

test('addMany skips a duplicate inside the same file', function () {
  var SW = boot(h.fakeStorage());
  SW.store.init();
  var parsed = SW.utils.parseImport(HEAD + '2026-11-01,Food,100,a\n2026-11-01,Food,100,a', TODAY);
  eq(SW.store.addMany(parsed.items), { added: 1, duplicates: 1 });
});

test('importing the same file twice adds nothing the second time', function () {
  var SW = boot(h.fakeStorage());
  SW.store.init();
  var text = HEAD + '2026-11-01,Food,100,a\n2026-11-02,Bills,200,b';
  SW.store.addMany(SW.utils.parseImport(text, TODAY).items);
  eq(SW.store.addMany(SW.utils.parseImport(text, TODAY).items), { added: 0, duplicates: 2 });
  eq(SW.store.state().expenses.length, 2);
});

test('addMany with an empty list does not write or notify', function () {
  var SW = boot(h.fakeStorage());
  SW.store.init();
  var calls = 0;
  SW.store.subscribe(function () { calls++; });
  eq(SW.store.addMany([]), { added: 0, duplicates: 0 });
  eq(calls, 0);
});

test('imported expenses get unique ids and survive a reload', function () {
  var ls = h.fakeStorage();
  var SW = boot(ls);
  SW.store.init();
  var rows = [];
  for (var i = 1; i <= 500; i++) rows.push('2026-11-' + String((i % 24) + 1).padStart(2, '0') + ',Food,' + i + ',item ' + i);
  SW.store.addMany(SW.utils.parseImport(HEAD + rows.join('\n'), TODAY).items);
  var ids = {};
  SW.store.state().expenses.forEach(function (e) { ids[e.id] = true; });
  eq(Object.keys(ids).length, 500);
  var SW2 = boot(ls);
  SW2.store.init();
  eq(SW2.store.state().expenses.length, 500);
});

test('imported expenses can be edited and deleted like any other', function () {
  var SW = boot(h.fakeStorage());
  SW.store.init();
  SW.store.addMany(SW.utils.parseImport(HEAD + '2026-11-01,Food,100,a', TODAY).items);
  var id = SW.store.state().expenses[0].id;
  eq(SW.store.update(id, { amountPaise: 5, category: 'Food', date: '2026-11-01', note: 'a' }), true);
  eq(SW.store.get(id).amountPaise, 5);
  eq(SW.store.remove(id).id, id);
  eq(SW.store.state().expenses.length, 0);
});

test('a failed save after import raises the saveFailed flag but keeps the data in memory', function () {
  var SW = boot(h.fakeStorage({ blockWrite: true }));
  SW.store.init();
  SW.store.addMany(SW.utils.parseImport(HEAD + '2026-11-01,Food,100,a', TODAY).items);
  eq(SW.store.state().saveFailed, true);
  eq(SW.store.state().expenses.length, 1);
});

test('export from the store then import into a fresh store keeps the total', function () {
  var SW = boot(h.fakeStorage());
  SW.store.init();
  SW.store.add({ amountPaise: 24950, category: 'Food', date: '2026-11-20', note: 'Biryani' });
  SW.store.add({ amountPaise: 120000, category: 'Bills', date: '2026-11-01', note: 'Wifi, fibre' });
  var csv = SW.utils.toCSV(SW.store.state().expenses);
  var before = SW.utils.sumPaise(SW.store.state().expenses);
  var SW2 = boot(h.fakeStorage());
  SW2.store.init();
  SW2.store.addMany(SW2.utils.parseImport(csv, TODAY).items);
  eq(SW2.utils.sumPaise(SW2.store.state().expenses), before);
});

test('monthly totals agree with the sum of the whole list', function () {
  var SW = boot(h.fakeStorage());
  SW.store.init();
  SW.store.addMany(SW.utils.parseImport(HEAD + '2026-11-01,Food,100,a\n2026-10-02,Food,50.25,b\n2026-09-03,Bills,7,c', TODAY).items);
  var rows = SW.utils.monthlyTotals(SW.store.state().expenses, '2026-11', 6);
  eq(rows.reduce(function (t, r) { return t + r.total; }, 0), SW.utils.sumPaise(SW.store.state().expenses));
});

h.finish('integration');
