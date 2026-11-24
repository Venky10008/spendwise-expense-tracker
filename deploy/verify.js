var fs = require('fs');
var path = require('path');
var http = require('http');
var zlib = require('zlib');
var crypto = require('crypto');
var serve = require('./serve');

function get(port, p) {
  return new Promise(function (resolve, reject) {
    http.get({ host: '127.0.0.1', port: port, path: p }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () { resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }); });
    }).on('error', reject);
  });
}

function run(dir) {
  dir = path.resolve(dir);
  var results = [];
  function check(name, ok, detail) {
    results.push({ name: name, pass: !!ok, detail: ok ? '' : (detail || '') });
  }
  var server = serve.createServer(dir, { log: function () {} });
  return new Promise(function (resolve) {
    server.listen(0, '127.0.0.1', function () {
      var port = server.address().port;
      (async function () {
        try {
          var home = await get(port, '/');
          var html = home.body.toString();
          check('home page returns 200', home.status === 200, home.status);
          var refs = [];
          var re = /(?:src|href)="(assets\/[^"]+)"/g;
          var m;
          while ((m = re.exec(html))) refs.push(m[1]);
          check('home page links one script and one stylesheet', refs.length === 2, refs.length);

          for (var i = 0; i < refs.length; i++) {
            var asset = await get(port, '/' + refs[i]);
            var short = crypto.createHash('sha256').update(asset.body).digest('hex').slice(0, 10);
            check('asset ' + refs[i] + ' returns 200', asset.status === 200, asset.status);
            check('asset ' + refs[i] + ' hash matches its file name', refs[i].indexOf('.' + short + '.') !== -1, short);
            check('asset ' + refs[i] + ' is cached for one year', /max-age=31536000/.test(asset.headers['cache-control'] || ''), asset.headers['cache-control']);
          }

          check('home page is not cached without revalidation', home.headers['cache-control'] === 'no-cache', home.headers['cache-control']);
          check('CSP header blocks inline script', /script-src 'self'/.test(home.headers['content-security-policy'] || ''), home.headers['content-security-policy']);
          check('CSP header blocks framing', /frame-ancestors 'none'/.test(home.headers['content-security-policy'] || ''));
          check('nosniff header is set', home.headers['x-content-type-options'] === 'nosniff');
          check('referrer policy is no-referrer', home.headers['referrer-policy'] === 'no-referrer');
          check('page has no inline script', !/<script(?![^>]*src=)/.test(html));

          var missing = await get(port, '/does-not-exist');
          check('unknown path returns 404', missing.status === 404, missing.status);
          check('unknown path shows the 404 page', /Page not found/.test(missing.body.toString()));

          var traversal = await get(port, '/..%2F..%2Fetc%2Fpasswd');
          check('path traversal is refused', traversal.status === 404, traversal.status);

          var health = await get(port, '/healthz');
          var info = JSON.parse(fs.readFileSync(path.join(dir, 'version.json'), 'utf8'));
          check('health endpoint reports the build id', health.status === 200 && JSON.parse(health.body).version === info.id);

          var tampered = Object.keys(info.files).filter(function (f) {
            return crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, f))).digest('hex').slice(0, 16) !== info.files[f];
          });
          check('every file matches version.json', tampered.length === 0, tampered.join(', '));

          var js = refs.filter(function (r) { return /\.js$/.test(r); })[0];
          var css = refs.filter(function (r) { return /\.css$/.test(r); })[0];
          var gz = zlib.gzipSync(fs.readFileSync(path.join(dir, js))).length + zlib.gzipSync(fs.readFileSync(path.join(dir, css))).length + zlib.gzipSync(home.body).length;
          check('gzipped page weight is under 20 KB', gz < 20480, gz);
          results.gzip = gz;
        } catch (e) {
          check('verification ran without errors', false, e.message);
        }
        server.close(function () { resolve(results); });
      })();
    });
  });
}

module.exports = { run: run };

if (require.main === module) {
  run(process.argv[2] || 'dist').then(function (results) {
    results.forEach(function (r) {
      console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.pass ? '' : ' -> ' + r.detail));
    });
    var passed = results.filter(function (r) { return r.pass; }).length;
    console.log('verify: ' + passed + '/' + results.length + ' passed' + (results.gzip ? ', gzipped ' + results.gzip + ' bytes' : ''));
    process.exitCode = passed === results.length ? 0 : 1;
  });
}
