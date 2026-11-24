var fs = require('fs');
var path = require('path');
var verify = require('./verify');

function logFile(env) { return path.join(env, 'deploy.log'); }

function log(env, entry) {
  fs.mkdirSync(env, { recursive: true });
  entry.time = new Date().toISOString();
  fs.appendFileSync(logFile(env), JSON.stringify(entry) + '\n');
  if (!process.env.QUIET) console.log(JSON.stringify(entry));
}

function history(env) {
  if (!fs.existsSync(logFile(env))) return [];
  return fs.readFileSync(logFile(env), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
}

function current(env) {
  var link = path.join(env, 'current');
  try { return path.basename(fs.readlinkSync(link)); } catch (e) { return null; }
}

function point(env, release) {
  var link = path.join(env, 'current');
  var tmp = link + '.tmp';
  try { fs.unlinkSync(tmp); } catch (e) {}
  fs.symlinkSync(path.join('releases', release), tmp);
  fs.renameSync(tmp, link);
}

async function deploy(env, source) {
  env = path.resolve(env);
  source = path.resolve(source);
  var info = JSON.parse(fs.readFileSync(path.join(source, 'version.json'), 'utf8'));
  var stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 17);
  var release = stamp + '-' + info.id;
  var target = path.join(env, 'releases', release);
  var n = 1;
  while (fs.existsSync(target)) {
    release = stamp + '-' + info.id + '-' + n++;
    target = path.join(env, 'releases', release);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
  var results = await verify.run(target);
  var failed = results.filter(function (r) { return !r.pass; });
  if (failed.length) {
    log(env, { event: 'deploy-rejected', release: release, build: info.id, failed: failed.map(function (f) { return f.name; }), kept: current(env) });
    fs.rmSync(target, { recursive: true, force: true });
    return false;
  }
  var previous = current(env);
  point(env, release);
  log(env, { event: 'deploy', release: release, build: info.id, previous: previous, checks: results.length });
  return true;
}

function rollback(env) {
  env = path.resolve(env);
  var now = current(env);
  var live = history(env).filter(function (e) { return e.event === 'deploy' || e.event === 'rollback'; });
  var order = [];
  live.forEach(function (e) {
    if (e.event === 'deploy') order.push(e.release);
  });
  var idx = order.lastIndexOf(now);
  var candidates = order.slice(0, idx).filter(function (r) { return fs.existsSync(path.join(env, 'releases', r)); });
  if (!now || !candidates.length) {
    log(env, { event: 'rollback-failed', reason: 'no earlier release', current: now });
    return false;
  }
  var back = candidates[candidates.length - 1];
  point(env, back);
  log(env, { event: 'rollback', from: now, to: back });
  return true;
}

function status(env) {
  env = path.resolve(env);
  var now = current(env);
  console.log('current: ' + (now || 'none'));
  history(env).slice(-5).forEach(function (e) { console.log(JSON.stringify(e)); });
  return !!now;
}

async function main() {
  var cmd = process.argv[2];
  var ok;
  if (cmd === 'deploy') ok = await deploy(process.argv[3], process.argv[4] || 'dist');
  else if (cmd === 'promote') {
    var from = path.resolve(process.argv[3]);
    var rel = current(from);
    if (!rel) { console.log('nothing to promote'); ok = false; }
    else ok = await deploy(process.argv[4], path.join(from, 'releases', rel));
  }
  else if (cmd === 'rollback') ok = rollback(process.argv[3]);
  else if (cmd === 'status') ok = status(process.argv[3]);
  else { console.log('usage: release.js deploy|promote|rollback|status'); ok = false; }
  process.exitCode = ok ? 0 : 1;
}

module.exports = { deploy: deploy, rollback: rollback, current: current, history: history };

if (require.main === module) main();
