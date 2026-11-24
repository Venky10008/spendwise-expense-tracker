(function (root) {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var toastTimer;

  function toast(message, undoFn) {
    var el = $('toast');
    el.innerHTML = '';
    var span = document.createElement('span'); span.textContent = message; el.appendChild(span);
    if (undoFn) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'btn small'; b.textContent = 'Undo';
      b.addEventListener('click', function () { undoFn(); el.hidden = true; clearTimeout(toastTimer); });
      el.appendChild(b);
    }
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 5000);
  }

  function showNotice(text) {
    $('notice').textContent = text || '';
    $('notice').hidden = !text;
  }

  function renderAll() {
    var state = root.SW.store.state();
    root.SW.summary.render(state);
    root.SW.list.render(state);
    if (state.saveFailed) showNotice('Could not save your last change (storage may be full or blocked).');
  }

  function start() {
    var warning = root.SW.store.init();
    if (warning) showNotice(warning);
    root.SW.store.subscribe(renderAll);
    root.SW.form.init(toast);
    root.SW.summary.init(renderAll, toast);
    root.SW.list.init(renderAll, root.SW.form.startEdit, toast);
    renderAll();
  }

  document.addEventListener('DOMContentLoaded', start);
})(window);
