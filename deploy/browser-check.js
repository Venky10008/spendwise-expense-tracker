var cp = require('child_process');
var fs = require('fs');
var os = require('os');
var path = require('path');
var http = require('http');
var serve = require('./serve');

var dir = path.resolve(process.argv[2] || 'dist');
var chromePath = process.env.CHROME_PATH || 'google-chrome';
var shotPath = process.env.SHOT || '';

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function getJSON(port, p) {
  return new Promise(function (resolve, reject) {
    http.get({ host: '127.0.0.1', port: port, path: p }, function (res) {
      var s = '';
      res.on('data', function (c) { s += c; });
      res.on('end', function () { try { resolve(JSON.parse(s)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function waitFor(fn, ms) {
  var end = Date.now() + ms;
  while (Date.now() < end) {
    try { var v = await fn(); if (v) return v; } catch (e) {}
    await sleep(100);
  }
  throw new Error('timed out');
}

async function main() {
  var results = [];
  function check(name, ok, detail) { results.push({ name: name, pass: !!ok, detail: ok ? '' : String(detail || '') }); }

  var server = serve.createServer(dir, { log: function () {} });
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var appPort = server.address().port;
  var debugPort = 9300 + Math.floor(Math.random() * 500);
  var profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-chrome-'));
  var chrome = cp.spawn(chromePath, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--user-data-dir=' + profile,
    '--remote-debugging-port=' + debugPort, '--window-size=1280,900', 'about:blank'
  ], { stdio: 'ignore' });

  try {
    var target = await waitFor(async function () {
      var list = await getJSON(debugPort, '/json/list');
      return list.filter(function (t) { return t.type === 'page'; })[0];
    }, 15000);
    var ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(function (r, j) { ws.onopen = r; ws.onerror = j; });
    var id = 0;
    var pending = {};
    var problems = [];
    ws.onmessage = function (ev) {
      var msg = JSON.parse(ev.data);
      if (msg.id && pending[msg.id]) { pending[msg.id](msg); delete pending[msg.id]; return; }
      if (msg.method === 'Runtime.exceptionThrown') problems.push('exception: ' + msg.params.exceptionDetails.text);
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') problems.push('console error');
      if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') problems.push('log error: ' + msg.params.entry.text);
    };
    function send(method, params) {
      return new Promise(function (resolve) {
        var n = ++id;
        pending[n] = resolve;
        ws.send(JSON.stringify({ id: n, method: method, params: params || {} }));
      });
    }
    async function evaluate(expr) {
      var r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
      return r.result.result.value;
    }
    async function load(url) {
      await send('Page.navigate', { url: url });
      await waitFor(function () { return evaluate('document.readyState === "complete"'); }, 10000);
      await sleep(200);
    }

    await send('Runtime.enable');
    await send('Log.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

    var url = 'http://127.0.0.1:' + appPort + '/';
    await load(url);
    check('page title is set', (await evaluate('document.title')) === 'SpendWise | Expense Tracker');
    check('category list is filled', (await evaluate('document.getElementById("category").options.length')) === 9);

    var add = function (amount, category, note) {
      return evaluate('(function(){var s=function(i,v){var e=document.getElementById(i);e.value=v;e.dispatchEvent(new Event("input",{bubbles:true}));};' +
        's("amount",' + JSON.stringify(amount) + ');s("category",' + JSON.stringify(category) + ');s("note",' + JSON.stringify(note) + ');' +
        'document.getElementById("submit-btn").click();return document.querySelectorAll("#expense-list li").length;})()');
    };
    check('first expense is added to the list', (await add('249.50', 'Food', 'Biryani')) === 1);
    check('second expense is added to the list', (await add('1,200', 'Bills', 'Wifi')) === 2);
    var total = await evaluate('document.getElementById("total").textContent');
    check('monthly total is exact', total.replace(/\s/g, '') === '\u20B91,449.50', total);

    await evaluate('(function(){var e=document.getElementById("amount");e.value="abc";document.getElementById("submit-btn").click();})()');
    var err = await evaluate('document.getElementById("amount-error").textContent');
    check('bad amount shows a message instead of saving', /numbers only/i.test(err), err);

    await load(url);
    check('data survives a reload', (await evaluate('document.querySelectorAll("#expense-list li").length')) === 2);

    if (shotPath) {
      var shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(shotPath, Buffer.from(shot.result.data, 'base64'));
    }
    await evaluate('document.getElementById("export-btn").click()');
    await sleep(300);

    await evaluate('localStorage.setItem("spendwise.v1", "{broken"); true');
    await load(url);
    check('damaged saved data does not break the page', (await evaluate('document.getElementById("expense-list") !== null')) === true);

    check('no console errors, exceptions or CSP violations', problems.length === 0, problems.join('; '));

    ws.close();
  } catch (e) {
    check('browser check ran without errors', false, e.message);
  }
  chrome.kill();
  server.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  return results;
}

main().then(function (results) {
  results.forEach(function (r) { console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.pass ? '' : ' -> ' + r.detail)); });
  var passed = results.filter(function (r) { return r.pass; }).length;
  console.log('browser: ' + passed + '/' + results.length + ' passed');
  process.exit(passed === results.length ? 0 : 1);
});
