(function () {
  'use strict';

  var root = document.querySelector('.guild-page-container[data-guild-api-url]');
  if (!root) return;

  var apiUrl = String(root.dataset.guildApiUrl || '').trim();
  if (!apiUrl) return;

  var stateNode = document.getElementById('guild-live-state');
  var sourceBadge = document.getElementById('guild-live-source-badge');
  var raidsNode = document.getElementById('guild-live-raids-list');
  var progressNode = document.getElementById('guild-live-raid-progress');
  var membersNode = document.getElementById('guild-members-json');
  var fallbackRaidsNode = document.getElementById('guild-scheduled-raids-json');
  var rosterBody = document.getElementById('roster-body');
  var rosterCount = document.getElementById('guild-live-roster-count');
  var staticRaidSeasons = document.getElementById('raid-seasons');
  var statsRefreshed = false;

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function setState(state, text) {
    if (stateNode) {
      stateNode.dataset.state = state;
      var label = stateNode.querySelector('span');
      if (label) label.textContent = text;
    }
    if (sourceBadge) {
      sourceBadge.dataset.state = state;
      var badgeLabel = sourceBadge.querySelector('span');
      if (badgeLabel) {
        badgeLabel.textContent = state === 'online' ? 'SERVER LIVE'
          : (state === 'loading' ? 'SERVER CONNECTING' : 'SERVER FALLBACK');
      }
    }
  }

  function formatDateTime(date, time) {
    if (!date) return time || 'Час уточнюється';
    var raw = date + 'T' + (time || '00:00') + ':00';
    var value = new Date(raw);
    if (Number.isNaN(value.getTime())) return [date, time].filter(Boolean).join(' · ');
    return new Intl.DateTimeFormat('uk-UA', {
      timeZone: 'Europe/Kyiv', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    }).format(value);
  }

  function roleLabel(role) {
    var normalized = String(role || '').toUpperCase();
    if (normalized === 'TANK') return ['Танк', 'tank'];
    if (normalized === 'HEALING') return ['Хіл', 'healer'];
    if (normalized === 'DPS') return ['DPS', 'dps'];
    return ['—', 'none'];
  }

  function classSlug(value) {
    return String(value || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function memberScore(entry) {
    var character = entry && entry.character ? entry.character : {};
    return Number(character.mythic_plus_scores && character.mythic_plus_scores.all && character.mythic_plus_scores.all.score || 0) || 0;
  }

  function renderRoster(members) {
    if (!rosterBody || !Array.isArray(members)) return;
    var sorted = members.slice().sort(function (a, b) { return memberScore(b) - memberScore(a); });
    rosterBody.innerHTML = sorted.map(function (entry, index) {
      var c = entry.character || {};
      var cls = c.playable_class && c.playable_class.name || 'Unknown';
      var spec = c.active_spec && c.active_spec.name || '—';
      var role = roleLabel(c.active_spec && c.active_spec.role);
      var realm = c.realm && (c.realm.slug || c.realm.name) || '—';
      var region = String(c.region || 'eu').toUpperCase();
      var ilvl = Number(c.item_level_equipped || 0) || 0;
      var score = memberScore(entry);
      var scoreColor = c.mythic_plus_scores && c.mythic_plus_scores.all && c.mythic_plus_scores.all.color || '#8b93a1';
      var rank = Number(entry.rank);
      var rankLabel = rank === 0 ? 'Гільд-майстер' : rank === 1 ? 'Офіцер' : rank === 2 ? 'Ветеран' : '';
      var officer = rank === 0 || rank === 1 || rank === 2;
      var slug = classSlug(cls);
      var avatar = c.avatar
        ? '<img class="rr-avatar" src="' + escapeHtml(c.avatar) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">'
        : '<span class="rr-avatar rr-avatar-empty" aria-hidden="true">' + escapeHtml(String(c.name || '?').slice(0, 1)) + '</span>';
      var profile = c.profile_url || '#';
      var search = [c.name, realm, cls, spec, role[0], rankLabel].join(' ');
      return '<tr class="roster-row" data-rio="' + score + '" data-search="' + escapeHtml(search) + '">' +
        '<td class="rr-pos"><span class="rr-pos-value">' + (index + 1) + '</span></td>' +
        '<td class="rr-char"><span class="rr-cell-inner">' + avatar + '<span class="rr-char-text"><span class="rr-name-row">' +
        '<a class="rr-name class-' + slug + '" href="' + escapeHtml(profile) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(c.name || '—') + '</a>' +
        (officer ? '<span class="rr-officer" title="' + escapeHtml(rankLabel) + '" aria-label="' + escapeHtml(rankLabel) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.2l5.9-.9z"/></svg></span>' : '') +
        '</span><span class="rr-realm"' + (ilvl ? ' data-ilvl="' + ilvl + '"' : '') + '>' + escapeHtml(region + '-' + realm) + '</span></span></span></td>' +
        '<td class="rr-spec"><span class="rr-cell-inner"><span class="rr-class-mark class-' + slug + '" aria-hidden="true">' + escapeHtml(String(cls).slice(0, 1)) + '</span><span class="rr-spec-text"><span class="rr-class class-' + slug + '">' + escapeHtml(cls) + '</span><span class="rr-spec-name">' + escapeHtml(spec) + '</span></span></span></td>' +
        '<td class="rr-role"><span class="rr-role-chip is-' + role[1] + '">' + escapeHtml(role[0]) + '</span></td>' +
        '<td class="rr-ilvl">' + (ilvl ? ilvl : '<span class="rr-dash">—</span>') + '</td>' +
        '<td class="rr-rio">' + (score ? '<span class="rr-rio-value" style="color:' + escapeHtml(scoreColor) + '">' + Math.round(score) + '</span>' : '<span class="rr-dash">—</span>') + '</td></tr>';
    }).join('');

    if (rosterCount) rosterCount.textContent = String(sorted.length);
    if (membersNode) membersNode.textContent = JSON.stringify(sorted);
    document.dispatchEvent(new CustomEvent('guild:live-updated', { detail: { members: sorted } }));

    if (!statsRefreshed && window.MistblossomGuildStats && typeof window.MistblossomGuildStats.refresh === 'function') {
      statsRefreshed = true;
      window.MistblossomGuildStats.refresh();
    }
  }

  function percent(value, total) {
    var n = Number(value || 0);
    var t = Number(total || 0);
    if (!t) return 0;
    return Math.max(0, Math.min(100, Math.round((n / t) * 100)));
  }

  function bestRank(rank) {
    rank = rank || {};
    var order = ['mythic', 'heroic', 'normal'];
    for (var i = 0; i < order.length; i += 1) {
      var row = rank[order[i]] || {};
      if (Number(row.world || 0) || Number(row.region || 0) || Number(row.realm || 0)) {
        return { difficulty: order[i], world: Number(row.world || 0), region: Number(row.region || 0), realm: Number(row.realm || 0) };
      }
    }
    return null;
  }

  function renderRaids(raids) {
    if (!raidsNode) return;
    if (!Array.isArray(raids) || !raids.length) {
      raidsNode.innerHTML = '<article class="guild-live-placeholder">Найближчих опублікованих рейдів поки немає.</article>';
      return;
    }
    raidsNode.innerHTML = raids.map(function (raid, index) {
      var filled = Number(raid.roster || raid.going || 0);
      var capacity = Number(raid.capacity || 0);
      var fillPct = capacity ? Math.min(100, Math.round((filled / capacity) * 100)) : 0;
      var roles = [
        '<span class="is-tank"><b>' + Number(raid.tanks || 0) + '</b><small>танки</small></span>',
        '<span class="is-healer"><b>' + Number(raid.healers || 0) + '</b><small>хіли</small></span>',
        '<span class="is-dps"><b>' + Number(raid.dps || 0) + '</b><small>DPS</small></span>'
      ].join('');
      return '<article class="guild-live-raid-card' + (index === 0 ? ' is-next' : '') + '">' +
        '<div class="guild-live-raid-card__top"><div><div class="guild-live-raid-card__chips">' +
        (index === 0 ? '<span class="guild-live-raid-card__next">Найближчий</span>' : '') +
        '<span class="guild-live-raid-card__eyebrow">' + escapeHtml(raid.difficulty || 'Raid') + '</span></div>' +
        '<h3>' + escapeHtml(raid.title || 'Рейд гільдії') + '</h3></div>' +
        '<span class="guild-live-raid-card__capacity"><b>' + filled + '</b>/' + capacity + '</span></div>' +
        '<div class="guild-live-raid-card__time">' + escapeHtml(formatDateTime(raid.date, raid.time)) + '</div>' +
        '<div class="guild-live-raid-card__progress"><i style="width:' + fillPct + '%"></i></div>' +
        '<div class="guild-live-raid-card__bottom"><div class="guild-live-raid-card__roles">' + roles + '</div>' +
        (raid.raid_leader ? '<div class="guild-live-raid-card__leader"><small>RL</small><b>' + escapeHtml(raid.raid_leader) + '</b></div>' : '') +
        '</div></article>';
    }).join('');
  }

  function normalizeSeasonMeta(meta) {
    if (!meta || typeof meta !== 'object' || !Array.isArray(meta.seasons)) return null;
    return meta;
  }

  function seasonRaidEntries(season, progression, rankings, catalog) {
    var slugs = Array.isArray(season.raids) ? season.raids.slice() : [];
    return slugs.map(function (slug) {
      var p = progression && progression[slug] || {};
      var c = catalog && catalog[slug] || {};
      var total = Number(p.total_bosses || c.bosses || 0);
      return {
        slug: slug,
        p: {
          name: p.name || c.name || slug,
          summary: p.summary || '',
          total_bosses: total,
          normal_bosses_killed: Number(p.normal_bosses_killed || 0),
          heroic_bosses_killed: Number(p.heroic_bosses_killed || 0),
          mythic_bosses_killed: Number(p.mythic_bosses_killed || 0)
        },
        catalog: c,
        rank: rankings && rankings[slug] || {}
      };
    }).filter(function (entry) {
      var p = entry.p;
      var kills = Number(p.normal_bosses_killed || 0) + Number(p.heroic_bosses_killed || 0) + Number(p.mythic_bosses_killed || 0);
      return p.total_bosses > 0 && kills > 0;
    });
  }

  function seasonHasProgress(entries) {
    return entries.some(function (entry) {
      var p = entry.p;
      return Number(p.normal_bosses_killed || 0) + Number(p.heroic_bosses_killed || 0) + Number(p.mythic_bosses_killed || 0) > 0;
    });
  }

  function seasonTotals(entries) {
    return entries.reduce(function (acc, entry) {
      var p = entry.p;
      acc.total += Number(p.total_bosses || 0);
      acc.normal += Number(p.normal_bosses_killed || 0);
      acc.heroic += Number(p.heroic_bosses_killed || 0);
      acc.mythic += Number(p.mythic_bosses_killed || 0);
      return acc;
    }, { total: 0, normal: 0, heroic: 0, mythic: 0 });
  }

  function rankMarkup(rank) {
    var best = bestRank(rank);
    if (!best) return '';
    return '<div class="guild-live-progress-card__ranks">' +
      '<span><small>Світ</small><b>' + (best.world ? '#' + best.world : '—') + '</b></span>' +
      '<span><small>EU</small><b>' + (best.region ? '#' + best.region : '—') + '</b></span>' +
      '<span><small>Сервер</small><b>' + (best.realm ? '#' + best.realm : '—') + '</b></span>' +
      '</div>';
  }

  function difficultyMarkup(kind, label, killed, total) {
    return '<div class="guild-live-diff is-' + kind + '">' +
      '<span class="guild-live-diff__badge">' + label + '</span>' +
      '<div class="guild-live-diff__body"><div><b>' + killed + '/' + total + '</b><small>' +
      (kind === 'mythic' ? 'Mythic' : kind === 'heroic' ? 'Heroic' : 'Normal') +
      '</small></div><div class="guild-live-diff__track"><i style="width:' + percent(killed, total) + '%"></i></div></div></div>';
  }

  function liveRaidProgressCard(entry, current) {
    var p = entry.p;
    var c = entry.catalog || {};
    var total = Number(p.total_bosses || c.bosses || 0);
    var timing = '';
    if (c.starts_at) {
      var start = new Date(c.starts_at);
      if (!Number.isNaN(start.getTime())) timing = new Intl.DateTimeFormat('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: 'short', year: 'numeric' }).format(start);
    }
    return '<article class="guild-live-progress-card' + (current && c.current_season ? ' is-current' : '') + '">' +
      '<div class="guild-live-progress-card__head"><div><div class="guild-live-progress-card__chips">' +
      (current && c.current_season ? '<span class="guild-live-progress-card__current">Актуальний рейд</span>' : '') +
      (c.active_now ? '<span class="guild-live-progress-card__active">LIVE TIER</span>' : '') +
      '</div><h3>' + escapeHtml(p.name || entry.slug) + '</h3><span>' + escapeHtml((c.expansion || '') + (timing ? ' · з ' + timing : '')) + '</span></div>' +
      '<strong class="guild-live-progress-card__score">' + escapeHtml(p.summary || (p.mythic_bosses_killed + '/' + total + ' M')) + '</strong></div>' +
      rankMarkup(entry.rank) +
      '<div class="guild-live-progress-card__difficulties">' +
      difficultyMarkup('mythic', 'M', Number(p.mythic_bosses_killed || 0), total) +
      difficultyMarkup('heroic', 'H', Number(p.heroic_bosses_killed || 0), total) +
      difficultyMarkup('normal', 'N', Number(p.normal_bosses_killed || 0), total) +
      '</div></article>';
  }

  function renderProgress(progression, rankings, seasonMeta) {
    if (!progressNode || !progression || typeof progression !== 'object') return;
    var meta = normalizeSeasonMeta(seasonMeta);
    if (!meta) {
      var flat = Object.keys(progression).map(function (slug) {
        return { slug: slug, p: progression[slug] || {}, catalog: {}, rank: rankings && rankings[slug] || {} };
      }).filter(function (entry) {
        var p = entry.p || {};
        return Number(p.total_bosses || 0) > 0 && (Number(p.normal_bosses_killed || 0) + Number(p.heroic_bosses_killed || 0) + Number(p.mythic_bosses_killed || 0) > 0);
      });
      if (!flat.length) return;
      progressNode.hidden = false;
      progressNode.innerHTML = '<div class="guild-live-progress-grid">' + flat.map(function (entry) { return liveRaidProgressCard(entry, false); }).join('') + '</div>';
      if (window.MistblossomRaidCarousel && typeof window.MistblossomRaidCarousel.initAll === 'function') {
        window.MistblossomRaidCarousel.initAll(progressNode);
      }
      if (staticRaidSeasons) staticRaidSeasons.hidden = true;
      return;
    }

    var catalog = meta.catalog || {};
    var prepared = meta.seasons.map(function (season) {
      return { season: season, entries: seasonRaidEntries(season, progression, rankings, catalog) };
    }).filter(function (item) {
      return seasonHasProgress(item.entries);
    });
    if (!prepared.length) return;

    var currentIndex = prepared.findIndex(function (item) { return item.season.current; });
    if (currentIndex < 0) currentIndex = 0;
    var current = prepared[currentIndex];
    var currentTotals = seasonTotals(current.entries);
    var sourceLabel = meta.source === 'battlenet+raiderio' ? 'Battle.net + Raider.IO' : 'Raider.IO';

    var tabs = prepared.map(function (item, index) {
      return '<button type="button" class="guild-live-season-tab' + (index === currentIndex ? ' is-active' : '') + '" data-live-season="' + index + '"><span>' + escapeHtml(item.season.label || item.season.name || item.season.id) + '</span>' + (item.season.current ? '<b>Актуальний</b>' : '') + '</button>';
    }).join('');

    var panels = prepared.map(function (item, index) {
      var totals = seasonTotals(item.entries);
      return '<section class="guild-live-season-panel' + (index === currentIndex ? ' is-active' : '') + '" data-live-season-panel="' + index + '"' + (index === currentIndex ? '' : ' hidden') + '>' +
        '<div class="guild-live-season-summary"><div><span class="guild-live-season-summary__eyebrow">' + escapeHtml(item.season.expansion || meta.current_expansion || 'World of Warcraft') + '</span><h3>' + escapeHtml(item.season.name || item.season.label || 'Рейдовий сезон') + '</h3>' +
        '<p>' + (item.season.current ? 'Поточний сезон визначено автоматично за активним часовим вікном API.' : 'Збережений прогрес завершеного сезону.') + '</p></div>' +
        '<div class="guild-live-season-summary__stats"><span class="is-mythic"><b>' + totals.mythic + '/' + totals.total + '</b>M</span><span class="is-heroic"><b>' + totals.heroic + '/' + totals.total + '</b>H</span><span class="is-normal"><b>' + totals.normal + '/' + totals.total + '</b>N</span></div></div>' +
        '<div class="guild-live-progress-grid">' + item.entries.map(function (entry) { return liveRaidProgressCard(entry, Boolean(item.season.current)); }).join('') + '</div></section>';
    }).join('');

    progressNode.hidden = false;
    progressNode.innerHTML = '<div class="guild-live-season-shell"><div class="guild-live-season-detection"><div><span>Автовизначення сезону</span><strong>' + escapeHtml(meta.current_expansion || current.season.expansion || 'World of Warcraft') + '</strong><small>' + escapeHtml(sourceLabel) + ' · ' + escapeHtml(meta.region ? String(meta.region).toUpperCase() : 'EU') + '</small></div><div class="guild-live-season-detection__totals"><span><b>' + currentTotals.mythic + '/' + currentTotals.total + '</b>M</span><span><b>' + currentTotals.heroic + '/' + currentTotals.total + '</b>H</span><span><b>' + currentTotals.normal + '/' + currentTotals.total + '</b>N</span></div></div>' +
      (prepared.length > 1 ? '<div class="guild-live-season-tabs" role="tablist">' + tabs + '</div>' : '') + panels + '</div>';

    if (window.MistblossomRaidCarousel && typeof window.MistblossomRaidCarousel.initAll === 'function') {
      window.MistblossomRaidCarousel.initAll(progressNode);
    }

    progressNode.querySelectorAll('[data-live-season]').forEach(function (button) {
      button.addEventListener('click', function () {
        var id = button.getAttribute('data-live-season');
        progressNode.querySelectorAll('[data-live-season]').forEach(function (tab) { tab.classList.toggle('is-active', tab === button); });
        progressNode.querySelectorAll('[data-live-season-panel]').forEach(function (panel) {
          var active = panel.getAttribute('data-live-season-panel') === id;
          panel.classList.toggle('is-active', active);
          panel.hidden = !active;
        });
      });
    });
    if (staticRaidSeasons) staticRaidSeasons.hidden = true;
  }

  function updateHeader(payload) {
    var guild = payload.guild || {};
    var metadata = payload.metadata || {};
    var name = document.getElementById('guild-live-name');
    var region = document.getElementById('guild-live-region');
    var realm = document.getElementById('guild-live-realm');
    var faction = document.getElementById('guild-live-faction');
    var count = document.getElementById('guild-live-member-count');
    var updated = document.getElementById('guild-data-updated');
    if (name && guild.name) name.textContent = guild.name;
    if (region) region.textContent = String(metadata.region || 'eu').toUpperCase();
    if (realm) realm.textContent = guild.realm && guild.realm.name || '—';
    if (faction) faction.textContent = guild.faction && guild.faction.name || '—';
    if (count) count.textContent = Number(guild.member_count || (payload.members || []).length) + ' учасників';
    if (updated) updated.textContent = 'Оновлено: ' + (metadata.updated_at || payload.generated_at || 'щойно');
  }

  async function load() {
    if (document.visibilityState === 'hidden') return;
    setState('loading', 'VPS: синхронізація…');
    try {
      var response = await fetch(apiUrl, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      var payload = await response.json().catch(function () { return {}; });
      if (!response.ok || payload.schema !== 'mistblossom.public-guild.v1') throw new Error(payload.error || 'Некоректна відповідь VPS');
      updateHeader(payload);
      renderRaids(payload.scheduled_raids || []);
      renderProgress(payload.raid_progression || {}, payload.raid_rankings || {}, payload.raid_seasons || null);
      renderRoster(payload.members || []);
      setState('online', 'VPS: live');
    } catch (error) {
      setState('offline', 'VPS: fallback');
      if (raidsNode && !raidsNode.querySelector('.guild-live-raid-card')) {
        raidsNode.innerHTML = '<article class="guild-live-placeholder">Live API тимчасово недоступний. Показуємо останні збережені дані сайту.</article>';
      }
    }
  }

  try {
    var fallbackRaids = JSON.parse(fallbackRaidsNode && fallbackRaidsNode.textContent || '[]');
    if (Array.isArray(fallbackRaids) && fallbackRaids.length) renderRaids(fallbackRaids);
  } catch (_) {}

  load();
  window.setInterval(load, 120000);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') load();
  });
})();
