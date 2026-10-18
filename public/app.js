// Search box filtering for lists: <input data-filter="#list"> filters <li data-search>.
const listFilters = new Map();
function applyFilter(list) {
  const state = listFilters.get(list) || {};
  const q = (state.q || '').trim().toLowerCase();
  let shown = 0;
  for (const li of list.querySelectorAll('li[data-search]')) {
    const tags = (li.dataset.tags || '').split(' ');
    const match = (!q || li.dataset.search.includes(q)) && (!state.tag || tags.includes(state.tag));
    li.classList.toggle('hidden', !match);
    if (match) shown++;
  }
  const empty = list.parentElement.querySelector('[data-empty]');
  if (empty) empty.classList.toggle('hidden', shown > 0);
}

document.querySelectorAll('[data-filter]').forEach((input) => {
  const list = document.querySelector(input.dataset.filter);
  if (!list) return;
  input.addEventListener('input', () => {
    listFilters.set(list, { ...listFilters.get(list), q: input.value });
    applyFilter(list);
  });
});

document.querySelectorAll('[data-chip-filter]').forEach((group) => {
  const list = document.querySelector(group.dataset.chipFilter);
  if (!list) return;
  group.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    group.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === chip));
    listFilters.set(list, { ...listFilters.get(list), tag: chip.dataset.value });
    applyFilter(list);
  });
});

// Confirmation prompts for destructive forms.
document.querySelectorAll('form[data-confirm]').forEach((form) => {
  form.addEventListener('submit', (e) => {
    if (!confirm(form.dataset.confirm)) e.preventDefault();
  });
});

// Prevent double submission of payments.
document.querySelectorAll('form[data-once]').forEach((form) => {
  form.addEventListener('submit', () => {
    form.querySelectorAll('button:not([type=button])').forEach((b) => { b.disabled = true; b.textContent = 'Saving…'; });
  });
});

// Quick amount buttons on the collect form.
document.querySelectorAll('[data-amount]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const input = document.getElementById('amount');
    input.value = btn.dataset.amount;
    input.focus();
  });
});

document.querySelectorAll('[data-autosubmit]').forEach((input) => {
  input.addEventListener('change', () => input.form.submit());
});

// Live present/absent counter on the attendance sheet.
const attForm = document.querySelector('form[data-attendance]');
if (attForm) {
  const update = () => {
    const boxes = attForm.querySelectorAll('input[name=absent]');
    const absent = [...boxes].filter((b) => b.checked).length;
    attForm.querySelector('[data-present]').textContent = boxes.length - absent;
    attForm.querySelector('[data-absent]').textContent = absent;
  };
  attForm.addEventListener('change', update);
  update();
}
