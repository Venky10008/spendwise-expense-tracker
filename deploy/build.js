var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var cp = require('child_process');
var esbuild = require('esbuild');

var root = path.join(__dirname, '..');
var out = path.resolve(process.argv[2] || path.join(root, 'dist'));
var base = process.env.BASE_PATH || '/';
if (base.slice(-1) !== '/') base += '/';

var CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'";

function hash(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function commit() {
  try {
    return cp.execSync('git rev-parse --short HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch (e) {
    return 'unknown';
  }
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

var html = read('index.html');
var scripts = [];
var scriptRe = /<script src="([^"]+)"><\/script>/g;
var m;
while ((m = scriptRe.exec(html))) scripts.push(m[1]);
var cssMatch = /<link rel="stylesheet" href="([^"]+)">/.exec(html);
if (!scripts.length || !cssMatch) throw new Error('index.html must reference scripts and a stylesheet');

var js = scripts.map(function (s) {
  return esbuild.transformSync(read(s), { minify: true, target: 'es2017', legalComments: 'none' }).code.trim();
}).join(';\n');
var css = esbuild.transformSync(read(cssMatch[1]), { loader: 'css', minify: true, legalComments: 'none' }).code;

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'assets'), { recursive: true });

var jsName = 'assets/app.' + hash(js).slice(0, 10) + '.js';
var cssName = 'assets/style.' + hash(css).slice(0, 10) + '.css';
fs.writeFileSync(path.join(out, jsName), js);
fs.writeFileSync(path.join(out, cssName), css);

var page = html
  .replace(scriptRe, '')
  .replace('<link rel="manifest" href="manifest.webmanifest">', '<link rel="manifest" href="manifest.webmanifest" data-built>')
  .replace(cssMatch[0], '<meta http-equiv="Content-Security-Policy" content="' + CSP + '"><link rel="stylesheet" href="' + cssName + '">')
  .replace('</body>', '<script src="' + jsName + '"></script></body>')
  .replace(/\s*\n\s*/g, '');
fs.writeFileSync(path.join(out, 'index.html'), page);

var notFound = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">' +
  '<meta http-equiv="Content-Security-Policy" content="' + CSP + '"><meta name="robots" content="noindex">' +
  '<title>Page not found | SpendWise</title><link rel="stylesheet" href="' + base + cssName + '"></head>' +
  '<body><main class="layout"><section class="card wide"><h1>Page not found</h1><p>That page does not exist.</p>' +
  '<p><a href="' + base + '">Back to SpendWise</a></p></section></main></body></html>';
fs.writeFileSync(path.join(out, '404.html'), notFound);

var headers = [
  '/*',
  '  Content-Security-Policy: ' + CSP + "; frame-ancestors 'none'",
  '  X-Content-Type-Options: nosniff',
  '  X-Frame-Options: DENY',
  '  Referrer-Policy: no-referrer',
  '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
  '/assets/*',
  '  Cache-Control: public, max-age=31536000, immutable',
  '/index.html',
  '  Cache-Control: no-cache',
  '/sw.js',
  '  Cache-Control: no-cache',
  ''
].join('\n');
fs.writeFileSync(path.join(out, '_headers'), headers);
fs.writeFileSync(path.join(out, '.nojekyll'), '');
fs.copyFileSync(path.join(root, 'favicon.svg'), path.join(out, 'favicon.svg'));
fs.copyFileSync(path.join(root, 'manifest.webmanifest'), path.join(out, 'manifest.webmanifest'));
fs.copyFileSync(path.join(root, 'robots.txt'), path.join(out, 'robots.txt'));
fs.mkdirSync(path.join(out, 'icons'));
fs.readdirSync(path.join(root, 'icons')).forEach(function (f) {
  fs.copyFileSync(path.join(root, 'icons', f), path.join(out, 'icons', f));
});

var precache = ['./'].concat(fs.readdirSync(out, { recursive: true }).filter(function (f) {
  return fs.statSync(path.join(out, f)).isFile() && ['404.html', '_headers', '.nojekyll', 'robots.txt'].indexOf(f) === -1;
}).map(function (f) { return f.split(path.sep).join('/'); }).sort());
var workerId = hash(precache.map(function (f) { return f === './' ? '' : hash(fs.readFileSync(path.join(out, f))); }).join('')).slice(0, 10);
fs.writeFileSync(path.join(out, 'sw.js'), esbuild.transformSync(
  read('sw.template.js').replace('__ID__', workerId).replace('__FILES__', JSON.stringify(precache)),
  { minify: true, target: 'es2017', legalComments: 'none' }).code);

var files = fs.readdirSync(out, { recursive: true }).filter(function (f) {
  return fs.statSync(path.join(out, f)).isFile() && f !== 'version.json';
}).sort();
var manifest = {};
files.forEach(function (f) { manifest[f] = hash(fs.readFileSync(path.join(out, f))).slice(0, 16); });
var version = {
  id: hash(JSON.stringify(manifest)).slice(0, 10),
  commit: commit(),
  builtAt: new Date().toISOString(),
  base: base,
  files: manifest
};
fs.writeFileSync(path.join(out, 'version.json'), JSON.stringify(version, null, 2));

var srcBytes = ['index.html', cssMatch[1]].concat(scripts).reduce(function (n, f) { return n + fs.statSync(path.join(root, f)).size; }, 0);
var outBytes = [jsName, cssName, 'index.html'].reduce(function (n, f) { return n + fs.statSync(path.join(out, f)).size; }, 0);
console.log('build ' + version.id + ' commit ' + version.commit + ' base ' + base);
console.log('source ' + srcBytes + ' bytes, built ' + outBytes + ' bytes, files ' + (files.length + 1));
