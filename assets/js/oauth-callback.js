(() => {
  'use strict';

  const title = document.getElementById('callback-title');
  const status = document.getElementById('callback-status');
  const open = document.getElementById('callback-open');
  const params = new URLSearchParams(window.location.search);
  const keys = ['code', 'state', 'error', 'error_description'];
  const code = params.get('code');
  const error = params.get('error');

  // The fallback link retains the result; refreshing the page must not replay it.
  try { window.history.replaceState(null, '', window.location.pathname); } catch { /* Restricted browser history. */ }

  if (keys.some(key => params.getAll(key).length > 1) || (code && error) || (!code && !error)) {
    title.textContent = 'Не вдалося отримати результат входу';
    status.textContent = 'Повернися в RaiderHub і розпочни авторизацію через Battle.net ще раз.';
    return;
  }

  const forwarded = new URLSearchParams();
  for (const key of keys) {
    const value = params.get(key);
    if (value !== null) forwarded.set(key, value);
  }
  const deepLink = `lihvodruida://callback?${forwarded.toString()}`;
  open.href = deepLink;
  open.hidden = false;
  title.textContent = error ? 'Авторизацію не завершено' : 'Повернення в RaiderHub';
  status.textContent = 'Передаємо результат у застосунок. Якщо браузер запитає дозвіл на відкриття RaiderHub, підтвердь його.';

  const timer = window.setTimeout(() => {
    try { window.location.assign(deepLink); } catch { /* The user can still open the fallback link. */ }
  }, 120);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) window.clearTimeout(timer);
  });
})();
