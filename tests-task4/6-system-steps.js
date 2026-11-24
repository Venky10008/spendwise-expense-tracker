(function () {
  var out = [];
  function $(id) { return document.getElementById(id); }
  function check(name, cond) { out.push((cond ? 'PASS ' : 'FAIL ') + name); }
  function addExpense(amount, cat, note) {
    $('amount').value = amount;
    $('category').value = cat;
    $('date').value = new Date().toISOString().slice(0, 10);
    $('note').value = note || '';
    $('expense-form').dispatchEvent(new Event('submit', { cancelable: true }));
  }
  window.addEventListener('load', function () {
    localStorage.clear();
    var errors = [];
    window.addEventListener('error', function (e) { errors.push(e.message); });
    setTimeout(function () {
      check('page starts with the empty message showing', !$('empty').hidden);
      addExpense('abc', 'Food');
      check('letters in amount show an error', $('amount-error').textContent.length > 0);
      check('nothing saved after invalid submit', $('expense-list').children.length === 0);
      addExpense('0.1', 'Food', 'tea');
      addExpense('0.2', 'Food', 'biscuit');
      check('two expenses are listed', $('expense-list').children.length === 2);
      check('total shows exactly 0.30', $('total').textContent.indexOf('0.30') > -1);
      addExpense('50', 'Bills', '<b>bold</b>');
      check('html in note is shown as text, not rendered', $('expense-list').querySelectorAll('b').length === 0);
      $('search').value = 'tea';
      $('search').dispatchEvent(new Event('input'));
      setTimeout(function () {
        check('search for tea leaves one row', $('expense-list').children.length === 1);
        $('search').value = '';
        $('search').dispatchEvent(new Event('input'));
        setTimeout(function () {
          check('clearing search brings all 3 rows back', $('expense-list').children.length === 3);
          $('budget-input').value = '40';
          $('budget-save').click();
          check('budget below spending says over budget', $('budget-text').textContent.indexOf('Over budget') > -1);
          check('data reached localStorage', JSON.parse(localStorage.getItem('spendwise.v1')).expenses.length === 3);
          check('no script errors during the run', errors.length === 0);
          var pre = document.createElement('pre');
          pre.id = 'system-result';
          pre.textContent = out.join('\n') + '\nsystem: ' + out.filter(function (l) { return l.indexOf('PASS') === 0; }).length + '/' + out.length + ' passed';
          document.body.insertBefore(pre, document.body.firstChild);
        }, 400);
      }, 400);
    }, 100);
  });
})();
