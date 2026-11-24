(function (root) {
  'use strict';
  var U = root.SW.utils;
  var $ = function (id) { return document.getElementById(id); };
  var onEdit = function () {};
  var onToast = function () {};
  var PAGE = 100;
  var limit = PAGE;
  var lastView = '';

  function currentView(state) {
    return U.filterAndSort(state.expenses, {
      month: root.SW.summary.getMonth(),
      category: $('category-filter').value,
      search: $('search').value,
      sort: $('sort').value
    });
  }

  function render(state) {
    var list = $('expense-list');
    var all = currentView(state);
    var viewKey = [root.SW.summary.getMonth(), $('category-filter').value, $('search').value, $('sort').value].join('|');
    if (viewKey !== lastView) { limit = PAGE; lastView = viewKey; }
    var items = all.slice(0, limit);
    list.innerHTML = '';
    var more = $('show-more');
    more.hidden = all.length <= limit;
    more.textContent = 'Show ' + Math.min(PAGE, all.length - limit) + ' more (' + (all.length - limit) + ' not shown)';

    var empty = $('empty');
    if (all.length === 0) {
      empty.hidden = false;
      empty.textContent = state.expenses.length === 0
        ? 'No expenses yet. Add your first one using the form.'
        : 'No expenses match these filters.';
    } else {
      empty.hidden = true;
    }

    var frag = document.createDocumentFragment();
    items.forEach(function (e) {
      var li = document.createElement('li');
      li.className = 'expense';

      var main = document.createElement('div'); main.className = 'expense-main';
      var title = document.createElement('strong'); title.textContent = e.note || e.category;
      var meta = document.createElement('span'); meta.className = 'muted';
      meta.textContent = e.category + ' \u00B7 ' + formatDate(e.date);
      main.appendChild(title); main.appendChild(meta);

      var amt = document.createElement('span'); amt.className = 'expense-amount'; amt.textContent = U.formatMoney(e.amountPaise);

      var actions = document.createElement('div'); actions.className = 'expense-actions';
      var edit = document.createElement('button'); edit.className = 'btn small'; edit.type = 'button'; edit.textContent = 'Edit';
      edit.setAttribute('aria-label', 'Edit ' + (e.note || e.category));
      edit.addEventListener('click', function () { onEdit(e); });
      var del = document.createElement('button'); del.className = 'btn small danger'; del.type = 'button'; del.textContent = 'Delete';
      del.setAttribute('aria-label', 'Delete ' + (e.note || e.category));
      del.addEventListener('click', function () {
        var removed = root.SW.store.remove(e.id);
        if (removed) onToast('Expense deleted.', function () { root.SW.store.restore(removed); });
      });
      actions.appendChild(edit); actions.appendChild(del);

      li.appendChild(main); li.appendChild(amt); li.appendChild(actions);
      frag.appendChild(li);
    });
    list.appendChild(frag);
  }

function formatDate(iso) {
    var p = iso.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function exportCSV(state) {
    var items = currentView(state);
    if (items.length === 0) { onToast('Nothing to export for this view.'); return; }
    var blob = new Blob([U.toCSV(items)], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'spendwise-' + (root.SW.summary.getMonth() || 'all') + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function showReport(lines) {
    var box = $('import-report');
    box.innerHTML = '';
    if (!lines || lines.length === 0) { box.hidden = true; return; }
    var head = document.createElement('strong'); head.textContent = lines[0]; box.appendChild(head);
    if (lines.length > 1) {
      var ul = document.createElement('ul');
      lines.slice(1).forEach(function (l) { var li = document.createElement('li'); li.textContent = l; ul.appendChild(li); });
      box.appendChild(ul);
    }
    box.hidden = false;
  }

  function importText(text) {
    var U2 = root.SW.utils;
    var parsed = U2.parseImport(text);
    if (!parsed.ok) { showReport(['Import failed. ' + parsed.error]); onToast('Import failed.'); return null; }
    var result = root.SW.store.addMany(parsed.items);
    var head = 'Imported ' + result.added + ', skipped ' + result.duplicates + ' duplicate' + (result.duplicates === 1 ? '' : 's') +
      ' and ' + parsed.errors.length + ' invalid row' + (parsed.errors.length === 1 ? '' : 's') + '.';
    var lines = [head];
    parsed.errors.slice(0, 5).forEach(function (e) { lines.push('Row ' + e.line + ': ' + e.message); });
    if (parsed.errors.length > 5) lines.push('and ' + (parsed.errors.length - 5) + ' more.');
    showReport(lines);
    onToast(result.added + ' imported.');
    return result;
  }

  function importFile(file) {
    if (!file) return;
    if (file.size > 1048576) { showReport(['Import failed. The file is larger than 1 MB.']); onToast('Import failed.'); return; }
    var reader = new FileReader();
    reader.onload = function () { importText(String(reader.result)); };
    reader.onerror = function () { showReport(['Import failed. The file could not be read.']); onToast('Import failed.'); };
    reader.readAsText(file);
  }

  function init(rerender, editFn, toastFn) {
    onEdit = editFn; onToast = toastFn;
    var cf = $('category-filter');
    ['All'].concat(U.CATEGORIES).forEach(function (c) {
      var o = document.createElement('option'); o.value = c; o.textContent = c === 'All' ? 'All categories' : c; cf.appendChild(o);
    });
    $('category-filter').addEventListener('change', rerender);
    $('sort').addEventListener('change', rerender);

    var timer;
    $('search').addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(rerender, 200); });
    $('export-btn').addEventListener('click', function () { exportCSV(root.SW.store.state()); });
    $('show-more').addEventListener('click', function () { limit += PAGE; rerender(); });
    $('import-btn').addEventListener('click', function () { $('import-file').click(); });
    $('import-file').addEventListener('change', function () {
      importFile($('import-file').files[0]);
      $('import-file').value = '';
    });
  }

  root.SW = root.SW || {};
  root.SW.list = { init: init, render: render, importText: importText };
})(window);
