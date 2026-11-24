var http = require('http');
var fs = require('fs');
var path = require('path');

var TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8'
};

function parseHeaders(dir) {
  var file = path.join(dir, '_headers');
  var rules = [];
  if (!fs.existsSync(file)) return rules;
  var current = null;
  fs.readFileSync(file, 'utf8').split('\n').forEach(function (line) {
    if (!line.trim()) return;
    if (line[0] !== ' ') {
      current = { pattern: line.trim(), headers: {} };
      rules.push(current);
    } else {
      var i = line.indexOf(':');
      current.headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  });
  return rules;
}

function matches(pattern, url) {
  if (pattern === '/*') return true;
  if (pattern.slice(-2) === '/*') return url.indexOf(pattern.slice(0, -1)) === 0;
  return pattern === url || (pattern === '/index.html' && url === '/');
}

function createServer(dir, options) {
  options = options || {};
  var log = options.log || function (line) { process.stdout.write(JSON.stringify(line) + '\n'); };
  var rules = parseHeaders(dir);
  var version = null;
  try { version = JSON.parse(fs.readFileSync(path.join(dir, 'version.json'), 'utf8')).id; } catch (e) { version = 'unknown'; }

  return http.createServer(function (req, res) {
    var started = process.hrtime.bigint();
    var url = decodeURIComponent(req.url.split('?')[0]);
    var status = 200;
    var body;
    var type = 'text/plain; charset=utf-8';
    var headers = {};

    if (url === '/healthz') {
      body = JSON.stringify({ status: 'ok', version: version });
      type = TYPES['.json'];
    } else {
      var rel = url === '/' ? 'index.html' : url.replace(/^\/+/, '');
      var file = path.resolve(dir, rel);
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      var inside = file === path.resolve(dir) || file.indexOf(path.resolve(dir) + path.sep) === 0;
      if (inside && fs.existsSync(file) && fs.statSync(file).isFile()) {
        body = fs.readFileSync(file);
        type = TYPES[path.extname(file)] || 'application/octet-stream';
      } else {
        status = 404;
        var nf = path.join(dir, '404.html');
        body = fs.existsSync(nf) ? fs.readFileSync(nf) : 'Not found';
        type = TYPES['.html'];
      }
    }

    rules.forEach(function (r) {
      if (matches(r.pattern, url)) Object.assign(headers, r.headers);
    });
    headers['Content-Type'] = type;
    res.writeHead(status, headers);
    res.end(req.method === 'HEAD' ? undefined : body);

    log({
      time: new Date().toISOString(),
      method: req.method,
      path: url,
      status: status,
      ms: Number(process.hrtime.bigint() - started) / 1e6
    });
  });
}

module.exports = { createServer: createServer };

if (require.main === module) {
  var dir = path.resolve(process.argv[2] || 'dist');
  var port = Number(process.argv[3] || 8080);
  createServer(dir).listen(port, function () {
    process.stdout.write(JSON.stringify({ event: 'listening', dir: dir, port: port }) + '\n');
  });
}
