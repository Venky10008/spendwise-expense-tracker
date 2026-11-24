(function (root) {
  'use strict';
  var listeners = [];
  var state = { expenses: [], budgetPaise: null, saveFailed: false };

  function emit() { listeners.forEach(function (fn) { fn(state); }); }

  function persist() {
    var ok = root.SW.storage.save({ version: 1, budgetPaise: state.budgetPaise, expenses: state.expenses });
    state.saveFailed = !ok;
  }

  function init() {
    var result = root.SW.storage.load();
    state.expenses = result.data.expenses;
    state.budgetPaise = result.data.budgetPaise;
    return result.warning;
  }

  function add(fields) {
    var item = { id: root.SW.utils.makeId(), amountPaise: fields.amountPaise, category: fields.category,
                 date: fields.date, note: fields.note, createdAt: Date.now() };
    state.expenses = state.expenses.concat(item);
    persist(); emit();
    return item;
  }

  function update(id, fields) {
    var found = false;
    state.expenses = state.expenses.map(function (e) {
      if (e.id !== id) return e;
      found = true;
      return Object.assign({}, e, fields);
    });
    if (found) { persist(); emit(); }
    return found;
  }

function remove(id) {
    var removed = state.expenses.filter(function (e) { return e.id === id; })[0] || null;
    if (removed) {
      state.expenses = state.expenses.filter(function (e) { return e.id !== id; });
      persist(); emit();
    }
    return removed;
  }

  function restore(item) {
    state.expenses = state.expenses.concat(item);
    persist(); emit();
  }

  function addMany(list) {
    var seen = {};
    state.expenses.forEach(function (e) { seen[root.SW.utils.expenseKey(e)] = true; });
    var added = 0;
    var duplicates = 0;
    var now = Date.now();
    var fresh = [];
    list.forEach(function (f) {
      var key = root.SW.utils.expenseKey(f);
      if (seen[key]) { duplicates++; return; }
      seen[key] = true;
      fresh.push({ id: root.SW.utils.makeId() + added, amountPaise: f.amountPaise, category: f.category,
                   date: f.date, note: f.note, createdAt: now + added });
      added++;
    });
    if (added > 0) { state.expenses = state.expenses.concat(fresh); persist(); emit(); }
    return { added: added, duplicates: duplicates };
  }

  function setBudget(paise) { state.budgetPaise = paise; persist(); emit(); }
  function get(id) { return state.expenses.filter(function (e) { return e.id === id; })[0] || null; }
  function subscribe(fn) { listeners.push(fn); }

  root.SW = root.SW || {};
  root.SW.store = { init: init, add: add, update: update, remove: remove, restore: restore, addMany: addMany,
                    setBudget: setBudget, get: get, subscribe: subscribe, state: function () { return state; } };
})(window);
