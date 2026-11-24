(function (root) {
  'use strict';
  var U = root.SW.utils;
  var $ = function (id) { return document.getElementById(id); };
  var onEdit = function () {};
  var onToast = function () {};

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
    var items = currentView(state);
    list.innerHTML = '';

    var empty = $('empty');
    if (items.length === 0) {
      empty.hidden = false;
      empty.textContent = state.expenses.length === 0
        ? 'No expenses yet. Add your first one using the form.'
        : 'No expenses match these filters.';
    } else {
      empty.hidden = true;
    }

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
      list.appendChild(li);
    });
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
  }

  root.SW = root.SW || {};
  root.SW.list = { init: init, render: render };
})(window);
