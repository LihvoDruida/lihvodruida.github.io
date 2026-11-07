// Keep the callback independent of the site layout, CMS and live synchronization.
const document = `<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <meta name="robots" content="noindex, nofollow, noarchive">
  <title>Повернення в RaiderHub</title>
  <link rel="stylesheet" href="/assets/css/oauth-callback.css">
  <script src="/assets/js/oauth-callback.js" defer></script>
</head>
<body>
  <main aria-labelledby="callback-title">
    <p class="app-name">RaiderHub · Battle.net</p>
    <h1 id="callback-title">Повернення в застосунок</h1>
    <p id="callback-status" role="status" aria-live="polite">Готуємо результат авторизації…</p>
    <a id="callback-open" class="button" hidden>Відкрити RaiderHub</a>
    <p class="hint">Якщо застосунок не відкрився автоматично, натисни кнопку. RaiderHub має бути встановлений на цьому пристрої.</p>
    <noscript><p>Увімкни JavaScript у браузері та повтори вхід із RaiderHub, щоб передати результат у застосунок.</p></noscript>
  </main>
</body>
</html>`;

export function callbackResponse(): Response {
  return new Response(document, {headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'private, no-store, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
  }});
}
