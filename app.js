(() => {
  const STORAGE_KEY = 'jeongsankkeut-state-v1';
  const MAX_PEOPLE = 10;
  const MAX_AMOUNT = 10_000_000;
  const $ = (selector) => document.querySelector(selector);
  const money = (amount) => `${Math.max(0, Math.round(amount)).toLocaleString('ko-KR')}원`;
  const safeText = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const freshState = () => ({ people: [], expenses: [] });
  let state = loadState();
  let toastTimer;

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (parsed && Array.isArray(parsed.people) && Array.isArray(parsed.expenses)) {
        return {
          people: parsed.people.filter((person) => typeof person === 'string').slice(0, MAX_PEOPLE),
          expenses: parsed.expenses.filter((expense) => expense && Number.isInteger(expense.amount) && Array.isArray(expense.shares) && typeof expense.payer === 'string')
        };
      }
    } catch (_) { /* Ignore invalid local data and start fresh. */ }
    return freshState();
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (_) { showToast('저장 공간을 확인해 주세요.'); }
  }

  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2300);
  }

  function renderPeople() {
    $('#people-count').textContent = `${state.people.length}명`;
    const list = $('#people-list');
    if (!state.people.length) {
      list.innerHTML = '<div class="empty-people"><span class="empty-icon">👋</span><span>함께한 사람을 추가해 주세요</span></div>';
    } else {
      list.innerHTML = state.people.map((person) => `
        <div class="person-chip"><span>${safeText(person)}</span><button type="button" data-remove-person="${safeText(person)}" aria-label="${safeText(person)} 삭제">×</button></div>`).join('');
    }
    const enabled = state.people.length >= 2;
    $('#expense-fields').disabled = !enabled;
    $('#people-hint').hidden = enabled;
    const payer = $('#expense-payer');
    const currentPayer = payer.value;
    payer.innerHTML = state.people.length
      ? `<option value="">결제한 사람을 선택해 주세요</option>${state.people.map((person) => `<option value="${safeText(person)}">${safeText(person)}</option>`).join('')}`
      : '<option value="">참여자를 먼저 추가해 주세요</option>';
    if (state.people.includes(currentPayer)) payer.value = currentPayer;
    const selected = new Set([...document.querySelectorAll('#split-people input:checked')].map((input) => input.value));
    $('#split-people').innerHTML = state.people.map((person) => `
      <label class="select-chip"><input type="checkbox" name="split-person" value="${safeText(person)}" ${selected.has(person) || selected.size === 0 ? 'checked' : ''} /><span>${safeText(person)}</span></label>`).join('');
  }

  function renderExpenses() {
    const total = state.expenses.reduce((sum, expense) => sum + expense.amount, 0);
    $('#total-spend').textContent = money(total);
    const list = $('#expense-list');
    if (!state.expenses.length) {
      list.innerHTML = '<div class="empty-expenses"><span class="receipt-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" /></svg></span><strong>아직 지출이 없어요</strong><span>지출을 추가하면 여기에 쌓여요.</span></div>';
      return;
    }
    list.innerHTML = state.expenses.map((expense, index) => `
      <article class="expense-item"><span class="expense-icon" aria-hidden="true">₩</span><div class="expense-copy"><strong>${safeText(expense.title || `지출 ${index + 1}`)}</strong><span>${safeText(expense.payer)} 결제 · ${expense.shares.length}명 N빵</span></div><span class="expense-amount">${money(expense.amount)}</span><button type="button" class="delete-expense" data-remove-expense="${index}" aria-label="${safeText(expense.title || `지출 ${index + 1}`)} 삭제">×</button></article>`).join('');
  }

  function calculate() {
    const balances = new Map(state.people.map((person) => [person, { paid: 0, owed: 0 }]));
    for (const expense of state.expenses) {
      if (!balances.has(expense.payer)) continue;
      balances.get(expense.payer).paid += expense.amount;
      const recipients = expense.shares.filter((person) => balances.has(person));
      if (!recipients.length) continue;
      const each = Math.floor(expense.amount / recipients.length);
      const remainder = expense.amount % recipients.length;
      recipients.forEach((person, index) => { balances.get(person).owed += each + (index < remainder ? 1 : 0); });
    }
    const entries = state.people.map((person) => {
      const { paid, owed } = balances.get(person);
      return { person, paid, owed, net: paid - owed };
    });
    const payers = entries.filter((entry) => entry.net < 0).map((entry) => ({ person: entry.person, amount: -entry.net })).sort((a, b) => b.amount - a.amount);
    const receivers = entries.filter((entry) => entry.net > 0).map((entry) => ({ person: entry.person, amount: entry.net })).sort((a, b) => b.amount - a.amount);
    const transfers = [];
    let i = 0; let j = 0;
    while (i < payers.length && j < receivers.length) {
      const amount = Math.min(payers[i].amount, receivers[j].amount);
      if (amount > 0) transfers.push({ from: payers[i].person, to: receivers[j].person, amount });
      payers[i].amount -= amount;
      receivers[j].amount -= amount;
      if (payers[i].amount === 0) i++;
      if (receivers[j].amount === 0) j++;
    }
    return { entries, transfers, total: state.expenses.reduce((sum, expense) => sum + expense.amount, 0) };
  }

  function renderResult() {
    const { entries, transfers, total } = calculate();
    $('#result-total').textContent = money(total);
    $('#transfer-count').textContent = `${transfers.length}건`;
    $('#copy-result').disabled = state.expenses.length === 0;
    const balanceList = $('#balance-list');
    if (!state.people.length || !state.expenses.length) {
      balanceList.innerHTML = '<div class="result-empty"><span class="result-empty-mark">₩</span><strong>정산 결과가 여기에 보여요</strong><span>지출을 추가하면 자동으로 계산해요.</span></div>';
    } else {
      balanceList.innerHTML = entries.map((entry) => {
        const netClass = entry.net > 0 ? 'receive' : entry.net < 0 ? 'send' : 'clear';
        const netLabel = entry.net > 0 ? `받을 ${money(entry.net)}` : entry.net < 0 ? `보낼 ${money(-entry.net)}` : '정산 완료';
        return `<div class="balance-row"><div class="balance-person"><span class="avatar">${safeText(entry.person.slice(0, 1))}</span>${safeText(entry.person)}</div><span class="balance-meta">낸 ${money(entry.paid)} · 몫 ${money(entry.owed)}</span><span class="balance-value ${netClass}">${netLabel}</span></div>`;
      }).join('');
    }
    const transferList = $('#transfer-list');
    if (!state.expenses.length) {
      transferList.innerHTML = '<div class="transfer-empty">지출을 입력하면 송금할 금액을 알려드려요.</div>';
    } else if (!transfers.length) {
      transferList.innerHTML = '<div class="no-transfer">보낼 돈이 없어요. 깔끔! ✨</div>';
    } else {
      transferList.innerHTML = transfers.map((transfer) => `<div class="transfer-row"><div class="transfer-route"><span class="from">${safeText(transfer.from)}</span><span class="route-arrow">→</span><span class="to">${safeText(transfer.to)}</span></div><span class="transfer-amount">${money(transfer.amount)}</span></div>`).join('');
    }
  }

  function render() { renderPeople(); renderExpenses(); renderResult(); }

  $('#person-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = $('#person-name');
    const name = input.value.trim();
    const error = $('#person-error');
    error.textContent = '';
    if (!name) { error.textContent = '이름을 입력해 주세요'; input.focus(); return; }
    if ([...name].length > 10) { error.textContent = '이름은 10자까지 입력할 수 있어요'; input.focus(); return; }
    if (state.people.includes(name)) { error.textContent = '이미 있는 이름이에요'; input.focus(); return; }
    if (state.people.length >= MAX_PEOPLE) { error.textContent = '최대 10명까지 추가할 수 있어요'; input.focus(); return; }
    state.people.push(name);
    input.value = '';
    saveState(); render(); input.focus();
  });

  $('#people-list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-person]');
    if (!button) return;
    const person = button.dataset.removePerson;
    if (state.expenses.some((expense) => expense.payer === person || expense.shares.includes(person))) {
      $('#person-error').textContent = '지출에 포함된 사람은 지울 수 없어요. 해당 지출을 먼저 삭제해 주세요.';
      return;
    }
    $('#person-error').textContent = '';
    state.people = state.people.filter((name) => name !== person);
    saveState(); render();
  });

  $('#select-all').addEventListener('click', () => {
    const inputs = [...document.querySelectorAll('#split-people input')];
    const shouldCheck = inputs.some((input) => !input.checked);
    inputs.forEach((input) => { input.checked = shouldCheck; });
    $('#select-all').textContent = shouldCheck ? '전체 해제' : '전체 선택';
  });

  $('#expense-amount').addEventListener('input', (event) => {
    const digits = event.target.value.replace(/\D/g, '').slice(0, 8);
    event.target.value = digits ? Number(digits).toLocaleString('ko-KR') : '';
  });

  $('#expense-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const error = $('#expense-error');
    error.textContent = '';
    if (state.people.length < 2) { error.textContent = '참여자를 2명 이상 먼저 추가해 주세요'; return; }
    const amount = Number($('#expense-amount').value.replace(/,/g, ''));
    if (!Number.isInteger(amount) || amount <= 0) { error.textContent = '금액을 1원 이상 입력해 주세요'; $('#expense-amount').focus(); return; }
    if (amount > MAX_AMOUNT) { error.textContent = '금액은 1,000만 원까지 입력할 수 있어요'; $('#expense-amount').focus(); return; }
    const payer = $('#expense-payer').value;
    if (!payer) { error.textContent = '결제한 사람을 선택해 주세요'; $('#expense-payer').focus(); return; }
    const shares = [...document.querySelectorAll('#split-people input:checked')].map((input) => input.value);
    if (!shares.length) { error.textContent = '나눌 사람을 1명 이상 골라 주세요'; return; }
    state.expenses.push({ title: $('#expense-title').value.trim().slice(0, 20), amount, payer, shares });
    $('#expense-title').value = '';
    $('#expense-amount').value = '';
    document.querySelectorAll('#split-people input').forEach((input) => { input.checked = true; });
    $('#select-all').textContent = '전체 해제';
    saveState(); render();
    showToast('지출을 추가했어요.');
  });

  $('#expense-list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-expense]');
    if (!button) return;
    state.expenses.splice(Number(button.dataset.removeExpense), 1);
    saveState(); render();
    showToast('지출을 삭제했어요.');
  });

  function makeShareText() {
    const { entries, transfers, total } = calculate();
    const lines = ['🧾 모임 정산 결과', '', `총 지출 ${money(total)}`, '', '사람별 정산'];
    entries.forEach((entry) => {
      const result = entry.net > 0 ? `받을 돈 ${money(entry.net)}` : entry.net < 0 ? `보낼 돈 ${money(-entry.net)}` : '정산 완료';
      lines.push(`· ${entry.person}: ${result}`);
    });
    lines.push('', '송금 목록');
    if (transfers.length) transfers.forEach((transfer) => lines.push(`· ${transfer.from} → ${transfer.to} ${money(transfer.amount)}`));
    else lines.push('· 보낼 돈이 없어요. 깔끔!');
    lines.push('', '정산끝에서 계산했어요.');
    return lines.join('\n');
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const helper = document.createElement('textarea');
    helper.value = text;
    helper.setAttribute('readonly', '');
    helper.style.position = 'fixed'; helper.style.opacity = '0';
    document.body.append(helper); helper.select();
    const copied = document.execCommand('copy');
    helper.remove();
    if (!copied) throw new Error('copy unavailable');
  }

  $('#copy-result').addEventListener('click', async () => {
    const text = makeShareText();
    try {
      await copyText(text);
      showToast('단톡방 문구가 복사되었어요!');
    } catch (_) {
      showToast('복사가 안 돼요. 아래 문구를 길게 눌러 복사해 주세요.');
      const fallback = document.createElement('textarea');
      fallback.value = text; fallback.setAttribute('readonly', '');
      fallback.style.cssText = 'position:fixed;left:16px;right:16px;bottom:72px;width:calc(100% - 32px);height:180px;z-index:20;border:2px solid #3182f6;border-radius:12px;padding:12px;background:white;color:#191f28;font:13px/1.5 sans-serif;';
      fallback.setAttribute('aria-label', '복사용 정산 문구');
      document.body.append(fallback); fallback.focus(); fallback.select();
      fallback.addEventListener('blur', () => setTimeout(() => fallback.remove(), 4000), { once: true });
    }
  });

  $('#reset-all').addEventListener('click', () => {
    state = freshState();
    saveState();
    $('#person-error').textContent = '';
    $('#expense-error').textContent = '';
    $('#expense-title').value = '';
    $('#expense-amount').value = '';
    $('#person-name').value = '';
    render();
    showToast('처음부터 새로 시작해요.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  render();
  $('#select-all').textContent = '전체 해제';
})();
