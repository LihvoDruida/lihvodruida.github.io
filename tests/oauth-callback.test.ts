import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {GET as callback} from '../src/app/callback/route';
import {GET as legacyCallback} from '../src/app/callback.html/route';
import config from '../next.config';

const script = readFileSync('assets/js/oauth-callback.js', 'utf8');

function runCallback(search: string, options: {historyFails?: boolean; navigationFails?: boolean} = {}) {
  const elements = Object.fromEntries(['callback-title', 'callback-status', 'callback-open'].map(id =>
    [id, {textContent: '', href: '', hidden: true}]));
  const navigations: string[] = [], history: string[] = [], timers: (() => void)[] = [], cancelled: number[] = [];
  const listeners: Record<string, () => void> = {};
  const document = {
    hidden: false,
    getElementById: (id: string) => elements[id],
    addEventListener: (name: string, listener: () => void) => { listeners[name] = listener; },
  };
  const window = {
    location: {search, pathname: '/callback', assign: (url: string) => {
      if (options.navigationFails) throw Error('Browser blocked navigation');
      navigations.push(url);
    }},
    history: {replaceState: (_state: unknown, _title: string, path: string) => {
      if (options.historyFails) throw Error('Browser blocked history');
      history.push(path);
    }},
    setTimeout: (fn: () => void, delay: number) => { assert.equal(delay, 120); timers.push(fn); return timers.length; },
    clearTimeout: (id: number) => { cancelled.push(id); },
  };
  runInNewContext(script, {window, document, URLSearchParams});
  return {elements, navigations, history, timers, cancelled, listeners, document};
}

test('both callback addresses return a standalone no-store document without reflecting OAuth values', async () => {
  const first = callback(), second = legacyCallback();
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(first.headers.get('location'), null);
  for (const response of [first, second]) {
    assert.match(response.headers.get('content-type')!, /text\/html; charset=utf-8/);
    assert.match(response.headers.get('cache-control')!, /no-store/);
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.match(response.headers.get('x-robots-tag')!, /noindex/);
    assert.match(response.headers.get('content-security-policy')!, /script-src 'self'/);
  }
  const html = await first.text();
  assert.equal(html, await second.text());
  assert.ok(html.includes('id="callback-open"'));
  assert.ok(html.includes('src="/assets/js/oauth-callback.js" defer'));
  assert.ok(html.includes('<noscript>'));
  assert.equal(html.includes('_next/'), false);
  assert.equal(html.includes('guild/apply'), false);
});

test('callback.html is not intercepted by a site redirect', async () => {
  const redirects = await config.redirects!();
  assert.equal(redirects.some(rule => ['/callback', '/callback.html'].includes(rule.source)), false);
  assert.ok(redirects.some(rule => rule.source === '/guild-apply.html'));
});

test('success round-trips code and state including plus signs, Unicode and query delimiters', () => {
  const code = 'a+b&c=?/#"<tag> Ю', state = 'state+% &Ліс';
  const run = runCallback('?' + new URLSearchParams({code, state, redirect_uri: 'https://evil.example', token: 'ignored'}));
  const link = new URL(run.elements['callback-open'].href);
  assert.equal(link.protocol, 'lihvodruida:');
  assert.equal(link.hostname, 'callback');
  assert.equal(link.searchParams.get('code'), code);
  assert.equal(link.searchParams.get('state'), state);
  assert.deepEqual([...link.searchParams.keys()], ['code', 'state']);
  assert.equal(run.elements['callback-open'].hidden, false);
  assert.deepEqual(run.history, ['/callback']);
  assert.equal(run.navigations.length, 0);
  assert.equal(run.timers.length, 1);
  run.timers[0]();
  assert.deepEqual(run.navigations, [link.href]);
});

test('Battle.net denial and its state return to the app without rendering untrusted descriptions', () => {
  const description = '</p><script>alert(1)</script>&"';
  const run = runCallback('?' + new URLSearchParams({error: 'access_denied', error_description: description, state: 'pending-state'}));
  const link = new URL(run.elements['callback-open'].href);
  assert.equal(link.searchParams.get('error'), 'access_denied');
  assert.equal(link.searchParams.get('error_description'), description);
  assert.equal(link.searchParams.get('state'), 'pending-state');
  assert.equal(run.elements['callback-status'].textContent.includes(description), false);
  run.timers[0]();
  assert.equal(run.navigations.length, 1);
});

test('missing or ambiguous payload never opens an empty or conflicting authorization result', () => {
  for (const query of ['', '?state=only', '?code=', '?code=one&code=two', '?code=one&state=a&state=b', '?code=one&error=denied']) {
    const run = runCallback(query);
    assert.equal(run.timers.length, 0, query);
    assert.equal(run.navigations.length, 0, query);
    assert.equal(run.elements['callback-open'].hidden, true, query);
    assert.equal(run.elements['callback-open'].href, '', query);
    assert.ok(run.elements['callback-status'].textContent.includes('ще раз'), query);
  }
});

test('browser restrictions preserve a usable manual fallback', () => {
  const run = runCallback('?code=valid&state=state', {historyFails: true, navigationFails: true});
  assert.doesNotThrow(() => run.timers[0]());
  assert.equal(run.elements['callback-open'].hidden, false);
  assert.equal(new URL(run.elements['callback-open'].href).searchParams.get('state'), 'state');
});

test('leaving the callback cancels its pending automatic app-open attempt', () => {
  const run = runCallback('?error=access_denied&state=state');
  run.document.hidden = true;
  run.listeners.visibilitychange();
  assert.deepEqual(run.cancelled, [1]);
});
