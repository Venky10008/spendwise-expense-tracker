(function (root) {
  'use strict';
  var U = root.SW.utils;
  var $ = function (id) { return document.getElementById(id); };
  var month = '';

  function getMonth() { return month; }

function setMonth(m) { month = m; $('month-filter').value = m; }

  function render(state) {
    var inMonth = state.expenses.filter(function (e) { return !month || e.date.slice(0, 7) === month; });
    var total = U.sumPaise(inMonth);
    $('total').textContent = U.formatMoney(total);
    $('total-caption').textContent = inMonth.length + (inMonth.length === 1 ? ' expense' : ' expenses') +
      (month ? ' in ' + monthLabel(month) : ' in total');

var fill = $('budget-fill');
    if (state.budgetPaise) {
      var pct = total / state.budgetPaise * 100;
      fill.style.width = Math.min(pct, 100) + '%';
      fill.classList.toggle('over', pct > 100);
      fill.classList.toggle('warn', pct > 80 && pct <= 100);
      var left = state.budgetPaise - total;
      $('budget-text').textContent = left >= 0
        ? U.formatMoney(left) + ' left of ' + U.formatMoney(state.budgetPaise) + ' (' + Math.round(pct) + '% used)'
        : 'Over budget by ' + U.formatMoney(-left) + ' (budget ' + U.formatMoney(state.budgetPaise) + ')';
      $('budget-input').placeholder = (state.budgetPaise / 100) + '';
    } else {
      fill.style.width = '0%'; fill.classList.remove('over', 'warn');
      $('budget-text').textContent = 'No budget set.';
    }

var chart = $('chart');
    chart.innerHTML = '';
    var rows = U.totalsByCategory(inMonth);
    if (rows.length === 0) {
      var li = document.createElement('li'); li.className = 'muted'; li.textContent = 'Nothing to show yet.'; chart.appendChild(li);
      return;
    }
    rows.forEach(function (r) {
      var item = document.createElement('li');
      item.className = 'chart-row';
      var label = document.createElement('span'); label.className = 'chart-label'; label.textContent = r.category;
      var track = document.createElement('span'); track.className = 'chart-track';
      var bar = document.createElement('span'); bar.className = 'chart-bar';
      bar.style.width = Math.max(r.percent, 2) + '%';
      track.appendChild(bar);
      var value = document.createElement('span'); value.className = 'chart-value';
      value.textContent = U.formatMoney(r.total) + ' (' + r.percent + '%)';
      item.appendChild(label); item.appendChild(track); item.appendChild(value);
      chart.appendChild(item);
    });
  }

  function monthLabel(m) {
    var p = m.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  }

  function init(onChange, onToast) {
    month = U.todayISO().slice(0, 7);
    $('month-filter').value = month;
    $('month-filter').addEventListener('change', function () {
      month = $('month-filter').value;
      onChange();
    });
    $('budget-save').addEventListener('click', function () {
      var text = $('budget-input').value.trim();
      if (text === '') { root.SW.store.setBudget(null); $('budget-error').textContent = ''; onToast('Budget removed.'); return; }
      var r = U.parseAmount(text);
      $('budget-error').textContent = r.ok ? '' : r.error;
      if (r.ok) { root.SW.store.setBudget(r.value); $('budget-input').value = ''; onToast('Budget saved.'); }
    });
  }

  root.SW = root.SW || {};
  root.SW.summary = { init: init, render: render, getMonth: getMonth, setMonth: setMonth };
})(window);
