(() => {
  'use strict';

  const DEFAULT_CONFIG = {
    workerUrl: '',
    donateUrl: 'https://donatello.to/lihvo_druida',
    limit: 12,
    refreshMs: 180000
  };

  function cfg() {
    return { ...DEFAULT_CONFIG, ...(window.LD_DONATELLO_CONFIG || {}) };
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function stripHtml(value) {
    const tmp = document.createElement('div');
    tmp.innerHTML = String(value ?? '');
    return tmp.textContent || tmp.innerText || '';
  }

  function normalizeAmount(value) {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return 0;
    const normalized = value.replace(/[^0-9.,-]/g, '').replace(',', '.');
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatAmount(value, currency = 'UAH') {
    const amount = normalizeAmount(value);
    if (!amount) return '';
    const formatted = new Intl.NumberFormat('uk-UA', {
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2
    }).format(amount);
    return `${formatted} ${escapeHtml(currency || 'UAH')}`;
  }

  function normalizePayload(data) {
    const donations = Array.isArray(data)
      ? data
      : data?.list?.content || data?.content || data?.donations || data?.items || [];

    const stats = data?.stats || data?.summary || null;
    return {
      donations: Array.isArray(donations) ? donations : [],
      stats
    };
  }

  function setStatus(text, tone = 'muted') {
    const status = document.getElementById('donatello-status');
    if (!status) return;
    status.textContent = text;
    status.dataset.tone = tone;
  }

  function renderEmpty(grid, message) {
    grid.innerHTML = `
      <div class="donatello-empty">
        <strong>${escapeHtml(message)}</strong>
        <span>Кнопка підтримки працює незалежно від історії донатів.</span>
      </div>
    `;
  }

  function renderDonations(grid, donations, limit) {
    if (!donations.length) {
      renderEmpty(grid, 'Поки що немає публічних донатів для показу.');
      return;
    }

    const cards = donations.slice(0, limit).map((item) => {
      const name = escapeHtml(stripHtml(item.clientName || item.name || item.username || item.nickname || 'Анонім'));
      const currency = item.currency || item.currencyCode || 'UAH';
      const amount = formatAmount(item.amount || item.sum || item.total, currency);
      const rawMessage = stripHtml(item.message || item.comment || item.text || '');
      const message = escapeHtml(rawMessage.length > 160 ? `${rawMessage.slice(0, 160)}…` : rawMessage);
      const date = escapeHtml(item.createdAt || item.created_at || item.date || '');

      return `
        <article class="patron-card">
          <div class="patron-header">
            <span class="patron-name">${name}</span>
            ${amount ? `<span class="patron-amount">${amount}</span>` : ''}
          </div>
          ${message ? `<p class="patron-message">“${message}”</p>` : ''}
          ${date ? `<time class="patron-date">${date}</time>` : ''}
        </article>
      `;
    }).join('');

    grid.innerHTML = cards;
  }

  function updateStats(stats, donations) {
    const totalAmountEl = document.getElementById('total-amount');
    const totalCountEl = document.getElementById('total-count');

    const computedTotal = donations.reduce((sum, item) => sum + normalizeAmount(item.amount || item.sum || item.total), 0);
    const totalAmount = stats?.totalAmount ?? stats?.amount ?? stats?.total ?? computedTotal;
    const totalCount = stats?.totalCount ?? stats?.count ?? stats?.donationsCount ?? donations.length;

    if (totalAmountEl) totalAmountEl.textContent = totalAmount ? formatAmount(totalAmount, stats?.currency || 'UAH') : '—';
    if (totalCountEl) totalCountEl.textContent = totalCount ? String(totalCount) : '—';
  }

  async function fetchDonatello() {
    const { workerUrl, limit } = cfg();
    const grid = document.getElementById('patrons-grid');
    if (!grid) return;

    if (!workerUrl) {
      setStatus('Історію не підключено', 'warn');
      updateStats(null, []);
      renderEmpty(grid, 'Потрібно вказати Donatello Worker URL у _config.yml.');
      return;
    }

    setStatus('Оновлення…', 'loading');

    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 9000);
      const separator = workerUrl.includes('?') ? '&' : '?';
      const response = await fetch(`${workerUrl}${separator}t=${Date.now()}`, {
        signal: controller.signal,
        headers: { accept: 'application/json' }
      });
      window.clearTimeout(timeout);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const { donations, stats } = normalizePayload(data);
      updateStats(stats, donations);
      renderDonations(grid, donations, limit);
      setStatus('Оновлено', 'ok');
    } catch (error) {
      console.error('Donatello load failed:', error);
      setStatus('Не вдалося завантажити', 'error');
      renderEmpty(grid, 'Не вдалося завантажити історію Donatello.');
    }
  }

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  ready(() => {
    const grid = document.getElementById('patrons-grid');
    if (!grid) return;

    fetchDonatello();
    const { refreshMs } = cfg();
    if (refreshMs && refreshMs >= 60000) {
      window.setInterval(fetchDonatello, refreshMs);
    }
  });
})();
