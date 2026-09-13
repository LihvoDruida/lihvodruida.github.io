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

  function renderRaids(raids) {
    if (!raidsNode) return;
    if (!Array.isArray(raids) || !raids.length) {
      raidsNode.innerHTML = '<article class="guild-live-placeholder">Найближчих опублікованих рейдів поки немає.</article>';
      return;
    }
    raidsNode.innerHTML = raids.map(function (raid) {
      var roles = [
        '<span><b>' + Number(raid.tanks || 0) + '</b> танки</span>',
        '<span><b>' + Number(raid.healers || 0) + '</b> хіли</span>',
        '<span><b>' + Number(raid.dps || 0) + '</b> DPS</span>'
      ].join('');
      return '<article class="guild-live-raid-card">' +
        '<div class="guild-live-raid-card__top"><div><span class="guild-live-raid-card__eyebrow">' + escapeHtml(raid.difficulty || 'Raid') + '</span><h3>' + escapeHtml(raid.title || 'Рейд гільдії') + '</h3></div><span class="guild-live-raid-card__capacity">' + Number(raid.roster || raid.going || 0) + '/' + Number(raid.capacity || 0) + '</span></div>' +
        '<div class="guild-live-raid-card__time">' + escapeHtml(formatDateTime(raid.date, raid.time)) + '</div>' +
        '<div class="guild-live-raid-card__roles">' + roles + '</div>' +
        (raid.raid_leader ? '<div class="guild-live-raid-card__leader">RL: ' + escapeHtml(raid.raid_leader) + '</div>' : '') +
        '</article>';
    }).join('');
  }

  function renderProgress(progression, rankings) {
    if (!progressNode || !progression || typeof progression !== 'object') return;
    var raids = Object.keys(progression).map(function (slug) {
      var p = progression[slug] || {};
      var rank = rankings && rankings[slug] || {};
      return { slug: slug, p: p, rank: rank };
    }).filter(function (entry) { return entry.p && (entry.p.name || entry.p.total_bosses); });

    if (!raids.length) return;
    progressNode.hidden = false;
    progressNode.innerHTML = raids.map(function (entry) {
      var p = entry.p;
      return '<article class="guild-live-progress-card"><div class="guild-live-progress-card__head"><h3>' + escapeHtml(p.name || entry.slug) + '</h3><span>' + escapeHtml(p.summary || '') + '</span></div>' +
        '<div class="guild-live-progress-card__kills"><span>N <b>' + Number(p.normal_bosses_killed || 0) + '/' + Number(p.total_bosses || 0) + '</b></span><span>HC <b>' + Number(p.heroic_bosses_killed || 0) + '/' + Number(p.total_bosses || 0) + '</b></span><span>M <b>' + Number(p.mythic_bosses_killed || 0) + '/' + Number(p.total_bosses || 0) + '</b></span></div></article>';
    }).join('');
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
      renderProgress(payload.raid_progression || {}, payload.raid_rankings || {});
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
