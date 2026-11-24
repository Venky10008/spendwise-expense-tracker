(function (root) {
  'use strict';
  var U = root.SW.utils;
  var $ = function (id) { return document.getElementById(id); };
  var fields = ['amount', 'category', 'date', 'note'];
  var onToast = function () {};

  function showErrors(errors) {
    fields.forEach(function (f) {
      $(f + '-error').textContent = errors[f] || '';
      $(f).classList.toggle('invalid', !!errors[f]);
      if (errors[f]) $(f).setAttribute('aria-invalid', 'true'); else $(f).removeAttribute('aria-invalid');
    });
  }

  function reset() {
    $('expense-form').reset();
    $('edit-id').value = '';
    $('date').value = U.todayISO();
    $('date').max = U.todayISO();
    $('note-count').textContent = '0';
    $('form-title').textContent = 'Add expense';
    $('submit-btn').textContent = 'Add expense';
    $('cancel-edit').hidden = true;
    showErrors({});
  }

function startEdit(expense) {
    $('edit-id').value = expense.id;
    $('amount').value = (expense.amountPaise / 100).toFixed(2);
    $('category').value = expense.category;
    $('date').value = expense.date;
    $('note').value = expense.note;
    $('note-count').textContent = String(expense.note.length);
    $('form-title').textContent = 'Edit expense';
    $('submit-btn').textContent = 'Save changes';
    $('cancel-edit').hidden = false;
    showErrors({});
    $('amount').focus();
    $('expense-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function handleSubmit(ev) {
    ev.preventDefault();
    var result = U.validateExpense({
      amount: $('amount').value, category: $('category').value,
      date: $('date').value, note: $('note').value
    });
    showErrors(result.errors);
    if (!result.ok) {

      var first = fields.filter(function (f) { return result.errors[f]; })[0];
      $(first).focus();
      return;
    }
    var id = $('edit-id').value;
    var sm = root.SW.summary;
    if (sm.getMonth() && sm.getMonth() !== result.clean.date.slice(0, 7)) sm.setMonth(result.clean.date.slice(0, 7));
    if (id) {
      if (!root.SW.store.update(id, result.clean)) onToast('That expense no longer exists.');
      else onToast('Expense updated.');
    } else {
      root.SW.store.add(result.clean);
      onToast('Expense added.');
    }
    reset();
    $('amount').focus();
  }

  function init(toastFn) {
    onToast = toastFn;
    var select = $('category');
    select.innerHTML = '<option value="">Choose...</option>';
    U.CATEGORIES.forEach(function (c) {
      var o = document.createElement('option'); o.value = c; o.textContent = c; select.appendChild(o);
    });
    $('expense-form').addEventListener('submit', handleSubmit);
    $('cancel-edit').addEventListener('click', reset);
    $('note').addEventListener('input', function () { $('note-count').textContent = String($('note').value.length); });

    fields.forEach(function (f) {
      $(f).addEventListener('input', function () {
        $(f + '-error').textContent = ''; $(f).classList.remove('invalid');
      });
    });
    reset();
  }

  root.SW = root.SW || {};
  root.SW.form = { init: init, startEdit: startEdit };
})(window);
