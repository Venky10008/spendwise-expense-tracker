var h = require('./helper.js');
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
function fields(amount, cat, date, note) {
  return { amountPaise: amount, category: cat, date: date, note: note || '' };
}

test('fresh start: no saved data gives empty store and no warning', function () {
  var SW = boot(h.fakeStorage());
  eq(SW.store.init(), null);
  eq(SW.store.state().expenses, []);
  eq(SW.store.state().budgetPaise, null);
});

test('add saves to localStorage and survives a reload', function () {
  var ls = h.fakeStorage();
  var SW = boot(ls);
  SW.store.init();
  SW.store.add(fields(24950, 'Food', '2026-11-20', 'Dinner'));
  SW.store.setBudget(500000);
  var SW2 = boot(ls);
  SW2.store.init();
  eq(SW2.store.state().expenses.length, 1);
  eq(SW2.store.state().expenses[0].amountPaise, 24950);
  eq(SW2.store.state().budgetPaise, 500000);
});

test('update changes only the chosen expense', function () {
  var SW = boot(h.fakeStorage());
  SW.store.init();
  var a = SW.store.add(fields(100, 'Food', '2026-11-01', 'a'));
  var b = SW.store.add(fields(200, 'Bills', '2026-11-02', 'b'));
  eq(SW.store.update(a.id, { amountPaise: 150 }), true);
  eq(SW.store.get(a.id).amountPaise, 150);
  eq(SW.store.get(b.id).amountPaise, 200);
});

test('update with unknown id returns false and keeps data', function () {
  var SW = boot(h.fakeStorage());
  SW.store.init();
  SW.store.add(fields(100, 'Food', '2026-11-01'));
  eq(SW.store.update('nope', { amountPaise: 1 }), false);
  eq(SW.store.state().expenses.length, 1);
});

test('delete then restore (undo) brings the same expense back', function () {
  var ls = h.fakeStorage();
  var SW = boot(ls);
  SW.store.init();
  var a = SW.store.add(fields(100, 'Food', '2026-11-01', 'keep me'));
  var removed = SW.store.remove(a.id);
  eq(SW.store.state().expenses.length, 0);
  SW.store.restore(removed);
  eq(SW.store.get(a.id).note, 'keep me');
  eq(JSON.parse(ls.data['spendwise.v1']).expenses.length, 1);
});

test('remove with unknown id returns null', function () {
  var SW = boot(h.fakeStorage());
  SW.store.init();
  eq(SW.store.remove('nope'), null);
});

test('subscribers are called once for each change', function () {
  var SW = boot(h.fakeStorage());
  SW.store.init();
  var calls = 0;
  SW.store.subscribe(function () { calls++; });
  var a = SW.store.add(fields(100, 'Food', '2026-11-01'));
  SW.store.update(a.id, { note: 'x' });
  SW.store.setBudget(1000);
  SW.store.remove(a.id);
  eq(calls, 4);
});

test('subscriber is not called when update misses', function () {
  var SW = boot(h.fakeStorage());
  SW.store.init();
  var calls = 0;
  SW.store.subscribe(function () { calls++; });
  SW.store.update('nope', {});
  eq(calls, 0);
});

test('validate then store then total: form to summary flow', function () {
  var SW = boot(h.fakeStorage());
  SW.store.init();
  ['0.1', '0.2', '19.99'].forEach(function (amt) {
    var v = SW.utils.validateExpense({ amount: amt, category: 'Food', date: '2026-11-20', note: '' }, '2026-11-24');
    eq(v.ok, true);
    SW.store.add(v.clean);
  });
  eq(SW.utils.sumPaise(SW.store.state().expenses), 2029);
  eq(SW.utils.formatMoney(2029), '\u20B920.29');
});

test('invalid form input never reaches the store', function () {
  var SW = boot(h.fakeStorage());
  SW.store.init();
  var v = SW.utils.validateExpense({ amount: '-5', category: 'Food', date: '2026-11-20', note: '' }, '2026-11-24');
  if (v.ok) SW.store.add(v.clean);
  eq(SW.store.state().expenses.length, 0);
});

test('export of stored data has one row per expense plus header', function () {
  var SW = boot(h.fakeStorage());
  SW.store.init();
  SW.store.add(fields(100, 'Food', '2026-11-01', 'a,b'));
  SW.store.add(fields(250, 'Bills', '2026-11-02', ''));
  eq(SW.utils.toCSV(SW.store.state().expenses).split('\n').length, 3);
});

test('corrupted JSON: starts fresh, warns, keeps a backup', function () {
  var ls = h.fakeStorage();
  ls.setItem('spendwise.v1', '{not json');
  var SW = boot(ls);
  var warning = SW.store.init();
  eq(typeof warning, 'string');
  eq(SW.store.state().expenses, []);
  eq(ls.data['spendwise.v1.corrupt-backup'], '{not json');
});

test('damaged items are skipped and counted, good ones loaded', function () {
  var ls = h.fakeStorage();
  ls.setItem('spendwise.v1', JSON.stringify({ version: 1, budgetPaise: 1000, expenses: [
    { id: 'a', amountPaise: 100, category: 'Food', date: '2026-11-01', note: '' },
    { id: 'b', amountPaise: -5, category: 'Food', date: '2026-11-01', note: '' },
    { id: 'c', amountPaise: 100, category: 'Fake', date: '2026-11-01', note: '' },
    { id: 'd', amountPaise: 100, category: 'Food', date: '2026-02-31', note: '' },
    { id: 'e', amountPaise: 1.5, category: 'Food', date: '2026-11-01', note: '' },
    null
  ] }));
  var SW = boot(ls);
  var warning = SW.store.init();
  eq(warning, '5 saved item(s) were damaged and skipped.');
  eq(SW.store.state().expenses.length, 1);
});

test('expenses field is not an array: loads empty without crashing', function () {
  var ls = h.fakeStorage();
  ls.setItem('spendwise.v1', JSON.stringify({ expenses: 'hello' }));
  var SW = boot(ls);
  SW.store.init();
  eq(SW.store.state().expenses, []);
});

test('bad budget value is ignored', function () {
  var ls = h.fakeStorage();
  ls.setItem('spendwise.v1', JSON.stringify({ budgetPaise: 'lots', expenses: [] }));
  var SW = boot(ls);
  SW.store.init();
  eq(SW.store.state().budgetPaise, null);
});

test('storage blocked for reading: warning shown, app still works', function () {
  var SW = boot(h.fakeStorage({ blockRead: true }));
  eq(typeof SW.store.init(), 'string');
  SW.store.add(fields(100, 'Food', '2026-11-01'));
  eq(SW.store.state().expenses.length, 1);
});

test('storage full: saveFailed flag is set, data stays in memory', function () {
  var SW = boot(h.fakeStorage({ blockWrite: true }));
  SW.store.init();
  SW.store.add(fields(100, 'Food', '2026-11-01'));
  eq(SW.store.state().saveFailed, true);
  eq(SW.store.state().expenses.length, 1);
});

test('missing createdAt on old data defaults to 0', function () {
  var ls = h.fakeStorage();
  ls.setItem('spendwise.v1', JSON.stringify({ expenses: [{ id: 'a', amountPaise: 100, category: 'Food', date: '2026-11-01', note: '' }] }));
  var SW = boot(ls);
  SW.store.init();
  eq(SW.store.state().expenses[0].createdAt, 0);
});

h.finish('integration');
