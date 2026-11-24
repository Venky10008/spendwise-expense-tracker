var cp = require('child_process');
var fs = require('fs');
var os = require('os');
var path = require('path');
var http = require('http');
var serve = require('../deploy/serve');

var dir = path.resolve(process.argv[2] || 'dist');
var chromePath = process.env.CHROME_PATH || 'google-chrome';
var pagePath = process.env.PAGE_PATH || '/';

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

function iso(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function monthsAgo(n, day) {
  var d = new Date();
  return iso(new Date(d.getFullYear(), d.getMonth() - n, day));
}

async function main() {
  var results = [];
  function check(name, ok, detail) { results.push({ name: name, pass: !!ok, detail: ok ? '' : String(detail || '') }); if (process.env.PROGRESS) process.stderr.write((ok ? 'ok ' : 'FAIL ') + name + ' ' + (ok ? '' : String(detail)) + '\n'); }

  var server = serve.createServer(dir, { log: function () {} });
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var appPort = server.address().port;
  var debugPort = 9300 + Math.floor(Math.random() * 500);
  var profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-final-'));
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
    async function load(url, reload) {
      await send(reload ? 'Page.reload' : 'Page.navigate', reload ? {} : { url: url });
      await sleep(150);
      await waitFor(function () { return evaluate('document.readyState === "complete"'); }, 10000);
      await sleep(250);
    }
    async function pickFile(selector, file) {
      var doc = await send('DOM.getDocument', {});
      var node = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: selector });
      await send('DOM.setFileInputFiles', { nodeId: node.result.nodeId, files: [file] });
      await sleep(400);
    }

    await send('Runtime.enable');
    await send('Log.enable');
    await send('Page.enable');
    await send('DOM.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

    var url = 'http://127.0.0.1:' + appPort + pagePath;
    await load(url);

    var today = iso(new Date());
    var lines = ['Date,Category,Amount (INR),Note'];
    lines.push(today + ',Food,249.50,Biryani');
    lines.push(today + ',Bills,"1,200",Wifi');
    lines.push(monthsAgo(1, 5) + ',Travel,500,Metro card');
    lines.push(monthsAgo(2, 9) + ',Health,75.25,"<img src=x onerror=window.__xss=1>"');
    lines.push(today + ',Food,249.50,Biryani');
    lines.push(today + ',Pets,10,Bad category');
    lines.push('2999-01-01,Food,10,Future');
    var csvFile = path.join(profile, 'import.csv');
    fs.writeFileSync(csvFile, lines.join('\n'));

    await pickFile('#import-file', csvFile);
    var report = await evaluate('document.getElementById("import-report").innerText');
    check('import report counts good, duplicate and invalid rows', /Imported 4, skipped 1 duplicate and 2 invalid rows\./.test(report), report);
    check('import report names the bad rows by line number', /Row 7:/.test(report) && /Row 8:/.test(report), report);
    var total = await evaluate('document.getElementById("total").textContent');
    check('monthly total counts only this month rows', total.replace(/\s/g, '') === '\u20B91,449.50', total);
    check('imported rows from older months are stored', (await evaluate('JSON.parse(localStorage.getItem("spendwise.v1")).expenses.length')) === 4);
    var bars = await evaluate('Array.from(document.querySelectorAll("#trend .chart-value")).map(function(e){return e.textContent.replace(/\\s/g,"")})');
    check('trend shows six months', bars.length === 6, bars.length);
    check('trend shows the current month total', bars[5] === '\u20B91,449.50', bars.join(' '));
    check('trend shows last month total', bars[4] === '\u20B9500.00', bars.join(' '));
    check('trend shows two months ago total', bars[3] === '\u20B975.25', bars.join(' '));

    await evaluate('(function(){var m=document.getElementById("month-filter");m.value="' + monthsAgo(2, 1).slice(0, 7) + '";m.dispatchEvent(new Event("change"));})()');
    var shown = await evaluate('document.getElementById("expense-list").innerText');
    check('a script in an imported note is shown as text', shown.indexOf('<img src=x') !== -1, shown);
    check('a script in an imported note never runs', (await evaluate('typeof window.__xss')) === 'undefined');
    check('no image element was created from the note', (await evaluate('document.querySelectorAll("#expense-list img").length')) === 0);

    await pickFile('#import-file', csvFile);
    var again = await evaluate('document.getElementById("import-report").innerText');
    check('importing the same file again adds nothing', /Imported 0, skipped 5 duplicates/.test(again), again);

    var bad = path.join(profile, 'bad.csv');
    fs.writeFileSync(bad, 'Name,Price\nx,1');
    await pickFile('#import-file', bad);
    var failed = await evaluate('document.getElementById("import-report").innerText');
    check('a file with the wrong header is refused with a reason', /Import failed\. The first row must be/.test(failed), failed);
    check('a refused file changes nothing', (await evaluate('JSON.parse(localStorage.getItem("spendwise.v1")).expenses.length')) === 4);

    var heavy = ['Date,Category,Amount (INR),Note'];
    for (var i = 0; i < 2000; i++) heavy.push(monthsAgo(3 + (i % 3), (i % 28) + 1) + ',Food,' + (i + 1) + ',bulk ' + i);
    var heavyMs = await evaluate('(function(){var t=performance.now();SW.list.importText(' + JSON.stringify(heavy.join('\n')) + ');return performance.now()-t;})()');
    console.log('  import and render of 2000 rows in Chrome: ' + heavyMs.toFixed(0) + ' ms');
    check('importing 2,000 rows and redrawing takes under 1,000 ms', heavyMs < 1000, heavyMs);
    var fullMs = await evaluate('(function(){var m=document.getElementById("month-filter");var t=performance.now();m.value="";m.dispatchEvent(new Event("change"));return performance.now()-t;})()');
    var drawn = await evaluate('document.querySelectorAll("#expense-list li").length');
    console.log('  drawing all ' + drawn + ' rows in Chrome: ' + fullMs.toFixed(0) + ' ms');
    check('a view of 2,004 expenses draws only the first 100 rows', drawn === 100, drawn);
    check('drawing the first page of a large view takes under 250 ms', fullMs < 250, fullMs);
    var moreText = await evaluate('document.getElementById("show-more").textContent');
    check('the show more button says how many are not shown', moreText === 'Show 100 more (1904 not shown)', moreText);
    await evaluate('document.getElementById("show-more").click()');
    check('show more adds the next 100 rows', (await evaluate('document.querySelectorAll("#expense-list li").length')) === 200);
    await evaluate('(function(){var s=document.getElementById("search");s.value="bulk 1999";s.dispatchEvent(new Event("input"));})()');
    await sleep(500);
    check('a new search starts again from the first page and finds the row', (await evaluate('document.querySelectorAll("#expense-list li").length')) === 1);
    check('the show more button hides when everything fits', (await evaluate('document.getElementById("show-more").hidden')) === true);
    await evaluate('(function(){var s=document.getElementById("search");s.value="";s.dispatchEvent(new Event("input"));})()');
    await sleep(500);
    check('all 2,000 bulk rows are stored', (await evaluate('JSON.parse(localStorage.getItem("spendwise.v1")).expenses.length')) === 2004);

    await evaluate('localStorage.clear(); true');
    await load(url, true);

    var ready = await evaluate('Promise.race([navigator.serviceWorker.ready.then(function(r){return r.active.state}), new Promise(function(r){setTimeout(function(){r("timeout")},8000)})])');
    check('service worker becomes active', ready === 'activated', ready);
    var expectedId = /spendwise-([0-9a-f]{10})/.exec(fs.readFileSync(path.join(dir, pagePath, 'sw.js'), 'utf8'))[1];
    var cacheNames = await evaluate('caches.keys()');
    check('cache is named after the build', cacheNames.length === 1 && cacheNames[0] === 'spendwise-' + expectedId, cacheNames.join(','));
    var cached = await evaluate('caches.open("spendwise-' + expectedId + '").then(function(c){return c.keys()}).then(function(k){return k.length})');
    check('the app files are cached', cached === 8, cached);
    await load(url, true);
    check('page is controlled by the service worker after a reload', (await evaluate('!!navigator.serviceWorker.controller')) === true);

    await evaluate('(function(){var s=function(i,v){var e=document.getElementById(i);e.value=v;e.dispatchEvent(new Event("input",{bubbles:true}));};s("amount","99.99");s("category","Food");s("note","Before offline");document.getElementById("submit-btn").click();})()');

    server.closeAllConnections();
    await new Promise(function (r) { server.close(r); });
    await load(url, true);
    check('the app loads with the server stopped', (await evaluate('document.title')) === 'SpendWise | Expense Tracker');
    check('data entered earlier is still there offline', (await evaluate('document.querySelectorAll("#expense-list li").length')) === 1);
    await evaluate('(function(){var s=function(i,v){var e=document.getElementById(i);e.value=v;e.dispatchEvent(new Event("input",{bubbles:true}));};s("amount","10");s("category","Bills");s("note","Added offline");document.getElementById("submit-btn").click();})()');
    check('a new expense can be added offline', (await evaluate('document.querySelectorAll("#expense-list li").length')) === 2);
    var offTotal = await evaluate('document.getElementById("total").textContent');
    check('the total is exact offline', offTotal.replace(/\s/g, '') === '\u20B9109.99', offTotal);

    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 800, deviceScaleFactor: 2, mobile: true });
    await sleep(300);
    var overflow = await evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth');
    check('no sideways scrolling at 375 px wide', overflow <= 0, overflow);

    check('no console errors, exceptions or CSP violations', problems.length === 0, problems.join('; '));
    ws.close();
  } catch (e) {
    check('final check ran without errors', false, e.stack || e.message);
  }
  chrome.kill();
  try { server.close(); } catch (e) {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  return results;
}

main().then(function (results) {
  results.forEach(function (r) { console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.pass ? '' : ' -> ' + r.detail)); });
  var passed = results.filter(function (r) { return r.pass; }).length;
  console.log('final e2e: ' + passed + '/' + results.length + ' passed');
  process.exit(passed === results.length ? 0 : 1);
});
