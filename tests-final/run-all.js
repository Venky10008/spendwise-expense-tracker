var cp = require('child_process');
var path = require('path');
var files = ['unit.js', 'integration.js', 'performance.js'];
var failed = false;
files.forEach(function (f) {
  var r = cp.spawnSync('node', [path.join(__dirname, f)], { encoding: 'utf8' });
  var lines = r.stdout.trim().split('\n');
  console.log(f + ' -> ' + lines[lines.length - 1]);
  if (r.status !== 0) { failed = true; console.log(r.stdout); console.log(r.stderr); }
});
process.exitCode = failed ? 1 : 0;
