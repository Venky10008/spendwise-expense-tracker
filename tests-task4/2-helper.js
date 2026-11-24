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
function finish(label) {
  results.forEach(function (r) {
    console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.pass ? '' : ' -> ' + r.msg));
  });
  var passed = results.filter(function (r) { return r.pass; }).length;
  console.log(label + ': ' + passed + '/' + results.length + ' passed');
  if (passed !== results.length) process.exitCode = 1;
}
function fakeStorage(opts) {
  var data = {};
  opts = opts || {};
  return {
    data: data,
    getItem: function (k) { if (opts.blockRead) throw new Error('blocked'); return k in data ? data[k] : null; },
    setItem: function (k, v) { if (opts.blockWrite) throw new Error('quota'); data[k] = String(v); },
    removeItem: function (k) { delete data[k]; }
  };
}
module.exports = { test: test, eq: eq, finish: finish, fakeStorage: fakeStorage };
