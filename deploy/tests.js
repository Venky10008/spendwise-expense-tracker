process.env.QUIET = '1';
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');
var helper = require('../tests-task4/helper');
var release = require('./release');
var verify = require('./verify');

var test = helper.test;
var eq = helper.eq;
var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-deploy-'));
var origLog = console.log;

function quiet(fn) {
  console.log = function () {};
  return fn().then(function (v) { console.log = origLog; return v; }, function (e) { console.log = origLog; throw e; });
}

function build(out, base) {
  var env = Object.assign({}, process.env);
  if (base) env.BASE_PATH = base;
  cp.execFileSync('node', [path.join(__dirname, 'build.js'), out], { env: env, stdio: 'ignore' });
}

var dirA = path.join(tmp, 'a');
build(dirA);
var info = JSON.parse(fs.readFileSync(path.join(dirA, 'version.json'), 'utf8'));
var assets = fs.readdirSync(path.join(dirA, 'assets'));
var page = fs.readFileSync(path.join(dirA, 'index.html'), 'utf8');

test('build writes one hashed script and one hashed stylesheet', function () {
  eq(assets.filter(function (f) { return /^app\.[0-9a-f]{10}\.js$/.test(f); }).length, 1);
  eq(assets.filter(function (f) { return /^style\.[0-9a-f]{10}\.css$/.test(f); }).length, 1);
});
test('built page points at the hashed files only', function () {
  eq(/src="js\//.test(page) || /href="css\//.test(page), false);
});
test('built script has no comments or console calls', function () {
  var js = fs.readFileSync(path.join(dirA, 'assets', assets.filter(function (f) { return /\.js$/.test(f); })[0]), 'utf8');
  eq(/\/\*|\/\/ |console\./.test(js), false);
});
test('building twice from the same source gives the same build id', function () {
  var dirB = path.join(tmp, 'b');
  build(dirB);
  eq(JSON.parse(fs.readFileSync(path.join(dirB, 'version.json'), 'utf8')).id, info.id);
});
test('BASE_PATH is used by the 404 page', function () {
  var dirC = path.join(tmp, 'c');
  build(dirC, '/spendwise-expense-tracker');
  eq(/href="\/spendwise-expense-tracker\/assets\/style\./.test(fs.readFileSync(path.join(dirC, '404.html'), 'utf8')), true);
});
test('version.json lists every file except itself', function () {
  var listed = Object.keys(info.files);
  eq(listed.indexOf('version.json'), -1);
  eq(listed.indexOf('index.html') !== -1 && listed.indexOf('_headers') !== -1, true);
});

var worker = fs.readFileSync(path.join(dirA, 'sw.js'), 'utf8');
var precached = JSON.parse(/FILES=(\[[^\]]*\])/.exec(worker)[1]);
test('service worker precaches the shell, the hashed assets, the manifest and the icons', function () {
  eq(precached.indexOf('./') !== -1 && precached.indexOf('index.html') !== -1 && precached.indexOf('manifest.webmanifest') !== -1, true);
  eq(precached.filter(function (f) { return /^assets\//.test(f); }).length, 2);
  eq(precached.filter(function (f) { return /^icons\//.test(f); }).length, 2);
});
test('service worker never precaches the 404 page, headers or robots.txt', function () {
  eq(precached.some(function (f) { return ['404.html', '_headers', 'robots.txt', '.nojekyll'].indexOf(f) !== -1; }), false);
});
test('every precached file exists in the build', function () {
  eq(precached.filter(function (f) { return f !== './' && !fs.existsSync(path.join(dirA, f)); }), []);
});
test('service worker cache name is the same for the same source', function () {
  var dirD = path.join(tmp, 'd');
  build(dirD);
  eq(/spendwise-[0-9a-f]{10}/.exec(fs.readFileSync(path.join(dirD, 'sw.js'), 'utf8'))[0], /spendwise-[0-9a-f]{10}/.exec(worker)[0]);
});
test('service worker cache name changes when the app code changes', function () {
  var copy = path.join(tmp, 'src');
  fs.cpSync(path.join(__dirname, '..'), copy, { recursive: true, filter: function (f) { return !/node_modules|\.git$|\.git\//.test(f) && !/dist/.test(path.relative(path.join(__dirname, '..'), f)); } });
  fs.appendFileSync(path.join(copy, 'js', 'app.js'), '\nwindow.__probe = 1;\n');
  fs.symlinkSync(path.join(__dirname, '..', 'node_modules'), path.join(copy, 'node_modules'));
  var out = path.join(tmp, 'e');
  cp.execFileSync('node', [path.join(copy, 'deploy', 'build.js'), out], { stdio: 'ignore' });
  eq(/spendwise-[0-9a-f]{10}/.exec(fs.readFileSync(path.join(out, 'sw.js'), 'utf8'))[0] !== /spendwise-[0-9a-f]{10}/.exec(worker)[0], true);
});
test('source files of the final features contain no comments', function () {
  var sources = ['js/utils.js', 'js/list.js', 'js/summary.js', 'js/store.js', 'js/app.js', 'sw.template.js', 'tests-final/unit.js', 'tests-final/e2e.js'];
  var found = sources.filter(function (f) {
    var text = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    return /^\s*\/\/|\/\*\s/m.test(text);
  });
  eq(found, []);
});

var chain = Promise.resolve();
var env = path.join(tmp, 'env');
var first, second;

chain = chain.then(function () {
  return quiet(function () { return release.deploy(env, dirA); });
}).then(function (ok) {
  test('first release passes verification and goes live', function () { eq(ok, true); eq(release.current(env) !== null, true); });
  first = release.current(env);
  var dirD = path.join(tmp, 'd');
  fs.cpSync(dirA, dirD, { recursive: true });
  fs.appendFileSync(path.join(dirD, 'assets', assets.filter(function (f) { return /\.js$/.test(f); })[0]), 'x');
  return quiet(function () { return release.deploy(env, dirD); });
}).then(function (ok) {
  test('a tampered build is rejected and the live release stays', function () { eq(ok, false); eq(release.current(env), first); });
  test('a rejected build leaves no half-copied release behind', function () { eq(fs.readdirSync(path.join(env, 'releases')).length, 1); });
  var dirE = path.join(tmp, 'e');
  fs.cpSync(dirA, dirE, { recursive: true });
  var v = JSON.parse(fs.readFileSync(path.join(dirE, 'version.json'), 'utf8'));
  v.id = 'second0001';
  fs.writeFileSync(path.join(dirE, 'version.json'), JSON.stringify(v, null, 2));
  return quiet(function () { return release.deploy(env, dirE); });
}).then(function (ok) {
  test('a second good release replaces the first', function () { eq(ok, true); });
  second = release.current(env);
  test('the second release has a different name', function () { eq(second !== first, true); });
  var okBack = release.rollback(env);
  test('rollback switches live back to the first release', function () { eq(okBack, true); eq(release.current(env), first); });
  return verify.run(path.join(env, 'current'));
}).then(function (results) {
  test('the rolled-back release still passes every check', function () { eq(results.every(function (r) { return r.pass; }), true); });
  var again = release.rollback(env);
  test('rolling back past the first release is refused', function () { eq(again, false); eq(release.current(env), first); });
  test('the deploy log records deploys, a rejection and a rollback', function () {
    var events = release.history(env).map(function (e) { return e.event; });
    eq(events.slice(0, 5), ['deploy', 'deploy-rejected', 'deploy', 'rollback', 'rollback-failed']);
  });
}).then(function () {
  fs.rmSync(tmp, { recursive: true, force: true });
  helper.finish('deploy');
});
