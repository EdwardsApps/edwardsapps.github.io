/* Live service status: reads the data file the scheduled checker publishes and fills in status.html. */
(function () {
  'use strict';

  var main = document.querySelector('[data-status-src]');
  if (!main || !window.fetch) return;

  var isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var source = isLocal ? '/.status-preview/status.json' : main.getAttribute('data-status-src');
  var REFRESH_MS = 5 * 60 * 1000;
  var STALE_MIN = 50;
  var cards = {};
  var data = null;
  var filters = { text: '', group: '', onlyProblems: false };

  Array.prototype.forEach.call(document.querySelectorAll('.svc'), function (card) {
    cards[card.getAttribute('data-svc')] = card;
  });

  function $(selector) { return document.querySelector(selector); }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function label(entry) {
    if (!entry) return 'Status unavailable';
    if (entry.level === 'major') return 'Major problems';
    if (entry.level === 'minor') return 'Some problems';
    if (entry.level === 'unknown') return 'Status unavailable';
    return entry.source === 'probe' ? 'Up and answering' : 'No problems reported';
  }

  var timeFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', minute: '2-digit', hour12: true });
  var dayFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short' });
  var keyFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' });

  function clock(date) { return timeFormat.format(date).replace(' ', '').toLowerCase(); }

  function when(value) {
    var date = new Date(value);
    if (isNaN(date)) return '';
    var today = keyFormat.format(new Date());
    var yesterday = keyFormat.format(new Date(Date.now() - 864e5));
    var key = keyFormat.format(date);
    if (key === today) return clock(date) + ' today';
    if (key === yesterday) return clock(date) + ' yesterday';
    return dayFormat.format(date) + ', ' + clock(date);
  }

  function duration(minutes) {
    if (minutes < 1) return 'under a minute';
    if (minutes < 60) return minutes + ' min';
    var hours = Math.floor(minutes / 60);
    var rest = minutes % 60;
    if (hours < 24) return hours + ' hr' + (rest ? ' ' + rest + ' min' : '');
    var days = Math.floor(hours / 24);
    return days + (days === 1 ? ' day' : ' days') + (hours % 24 ? ' ' + (hours % 24) + ' hr' : '');
  }

  function ago(date) {
    var minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
    if (minutes < 1) return 'just now';
    if (minutes === 1) return '1 minute ago';
    if (minutes < 60) return minutes + ' minutes ago';
    return duration(minutes) + ' ago';
  }

  function isProblem(entry) { return entry && (entry.level === 'minor' || entry.level === 'major'); }

  /* ---------- cards ---------- */

  function fillCard(id, entry) {
    var card = cards[id];
    if (!card) return;
    var level = entry ? entry.level : 'unknown';
    card.setAttribute('data-level', level);
    card.querySelector('[data-state]').textContent = label(entry);

    var live = card.querySelector('[data-live]');
    live.textContent = '';
    var hasContent = false;
    if (entry) {
      (entry.items || []).forEach(function (incident) {
        var block = el('div', 'svc-item');
        block.appendChild(el('p', 'svc-item-title', incident.title));
        if (incident.detail) block.appendChild(el('p', 'svc-item-detail', incident.detail));
        var meta = el('p', 'svc-item-meta');
        if (incident.started) meta.appendChild(document.createTextNode('Since ' + when(incident.started)));
        if (incident.url && /^https:\/\//.test(incident.url)) {
          if (incident.started) meta.appendChild(document.createTextNode(' · '));
          var link = el('a', null, 'Their notice ↗');
          link.href = incident.url;
          link.rel = 'noopener';
          meta.appendChild(link);
        }
        if (meta.childNodes.length) block.appendChild(meta);
        live.appendChild(block);
        hasContent = true;
      });
      if (entry.link && isProblem(entry)) {
        live.appendChild(el('p', 'svc-hint', 'This involves ' + entry.link + ', so the fault may be ' + entry.link + '’s rather than ' + entry.name + '’s.'));
        hasContent = true;
      }
      (entry.notes || []).forEach(function (note) {
        live.appendChild(el('p', 'svc-note', note));
        hasContent = true;
      });
      if (entry.stale) {
        live.appendChild(el('p', 'svc-note', 'We could not re-read this just now, so this is the last reading we have.'));
        hasContent = true;
      }
    }
    live.hidden = !hasContent;
    card.querySelector('[data-tip]').hidden = !isProblem(entry);
  }

  /* ---------- top of page ---------- */

  function fillSummary() {
    var box = $('[data-summary]');
    var counts = data.counts || {};
    var problems = (counts.minor || 0) + (counts.major || 0);
    var total = Object.keys(data.services || {}).length;
    var headline, detail = '';
    if (problems === 0) {
      headline = 'No problems reported';
      detail = 'All ' + total + ' services we watch look fine.';
      box.setAttribute('data-level', 'ok');
    } else {
      headline = problems + ' of ' + total + ' services ' + (problems === 1 ? 'has' : 'have') + ' problems';
      var parts = [];
      if (counts.major) parts.push(counts.major + ' major');
      if (counts.minor) parts.push(counts.minor + ' smaller');
      detail = parts.join(', ') + '. The other ' + (total - problems - (counts.unknown || 0)) + ' look fine.';
      box.setAttribute('data-level', counts.major ? 'major' : 'minor');
    }
    if (counts.unknown) detail += ' We could not check ' + counts.unknown + '.';
    $('[data-headline]').textContent = headline;
    $('[data-detail]').textContent = detail;
    tick();
  }

  function tick() {
    if (!data) return;
    var node = $('[data-checked]');
    var checked = new Date(data.checked_at);
    if (isNaN(checked)) { node.textContent = ''; return; }
    var minutes = (Date.now() - checked.getTime()) / 60000;
    if (minutes > STALE_MIN) {
      node.textContent = 'Our checker last got through at ' + when(data.checked_at) + ', so this may be out of date.';
      node.classList.add('is-stale');
    } else {
      node.textContent = 'Checked ' + ago(checked) + ' (' + clock(checked) + '). Updated about every 15 minutes.';
      node.classList.remove('is-stale');
    }
  }

  function fillNow() {
    var section = $('[data-now]');
    var list = $('[data-now-list]');
    var banners = $('[data-banners]');
    list.textContent = '';
    banners.textContent = '';
    var ids = Object.keys(data.services).filter(function (id) { return cards[id] && isProblem(data.services[id]); });
    ids.sort(function (a, b) {
      var first = data.services[a], second = data.services[b];
      if (first.level !== second.level) return first.level === 'major' ? -1 : 1;
      return first.name.localeCompare(second.name);
    });
    section.hidden = ids.length === 0;
    if (!ids.length) return;
    $('[data-now-heading]').textContent = ids.length === 1 ? 'One service has a problem' : ids.length + ' services have problems';
    (data.banners || []).forEach(function (banner) {
      banners.appendChild(el('p', 'status-banner', banner.text));
    });
    ids.forEach(function (id) {
      var entry = data.services[id];
      var row = el('li', 'status-now-item');
      row.setAttribute('data-level', entry.level);
      var link = el('a', 'status-now-name', entry.name);
      link.href = '#svc-' + id;
      row.appendChild(link);
      row.appendChild(el('span', 'status-now-state', label(entry)));
      var first = (entry.items || [])[0];
      var text = first ? first.title : '';
      if (entry.since) text += (text ? ' · ' : '') + 'since ' + when(entry.since);
      row.appendChild(el('span', 'status-now-what', text));
      list.appendChild(row);
    });
  }

  /* ---------- history ---------- */

  function fillRecent() {
    var rows = $('[data-recent-rows]');
    rows.textContent = '';
    var recent = (data.recent || []).filter(function (episode) { return data.services[episode.svc]; }).slice(0, 30);
    $('[data-recent]').hidden = recent.length === 0;
    recent.forEach(function (episode) {
      var row = el('tr');
      var name = el('th', null);
      name.scope = 'row';
      var link = el('a', null, data.services[episode.svc].name);
      link.href = '#svc-' + episode.svc;
      name.appendChild(link);
      row.appendChild(name);
      row.appendChild(el('td', null, episode.title || (episode.level === 'major' ? 'Major problems' : 'Some problems')));
      row.appendChild(el('td', null, when(episode.started)));
      var start = new Date(episode.started);
      var end = episode.ended ? new Date(episode.ended) : null;
      row.appendChild(el('td', end ? null : 'is-ongoing', end ? duration(Math.round((end - start) / 60000)) : 'Still going'));
      rows.appendChild(row);
    });
  }

  function fillLeague() {
    var since = new Date(data.tracking_since);
    var note = $('[data-league-note]');
    var table = $('[data-league]');
    if (isNaN(since)) return;
    var days = Math.floor((Date.now() - since.getTime()) / 864e5);
    var sinceText = dayFormat.format(since) + ' ' + since.getUTCFullYear();
    if (days < 30) {
      table.hidden = true;
      note.textContent = 'This page has kept a record of every problem it sees since ' + sinceText +
        '. Once there is a month of records, a reliability table will appear here.';
      return;
    }
    var stats = data.stats || {};
    var ids = Object.keys(data.services).filter(function (id) { return cards[id]; });
    var troubled = ids.filter(function (id) { return stats[id] && stats[id].n90 > 0; });
    var clean = ids.length - troubled.length;
    troubled.sort(function (a, b) { return (stats[a].m30 - stats[b].m30) || (stats[a].n90 - stats[b].n90); });
    var rows = $('[data-league-rows]');
    rows.textContent = '';
    troubled.forEach(function (id) {
      var row = el('tr');
      var name = el('th', null, data.services[id].name);
      name.scope = 'row';
      row.appendChild(name);
      row.appendChild(el('td', null, String(stats[id].n30)));
      row.appendChild(el('td', null, stats[id].n30 ? duration(stats[id].m30) : 'None'));
      row.appendChild(el('td', null, String(stats[id].n90)));
      rows.appendChild(row);
    });
    table.hidden = troubled.length === 0;
    note.textContent = 'From our own records, kept since ' + sinceText + '. ' +
      (clean ? clean + ' of the ' + ids.length + ' services had no recorded problems in the last 90 days. ' : '') +
      (troubled.length ? 'The rest are listed with the least affected first. Services we can only test ourselves are judged on outright failures alone.' : '');
  }

  /* ---------- search and filters ---------- */

  function applyFilters() {
    var words = filters.text.toLowerCase().split(/\s+/).filter(Boolean);
    var shown = 0;
    Object.keys(cards).forEach(function (id) {
      var card = cards[id];
      var haystack = card.getAttribute('data-search');
      var match = words.every(function (word) { return haystack.indexOf(word) !== -1; });
      if (filters.group && card.getAttribute('data-cat') !== filters.group) match = false;
      if (filters.onlyProblems && !/^(minor|major)$/.test(card.getAttribute('data-level'))) match = false;
      card.hidden = !match;
      if (match) shown += 1;
    });
    Array.prototype.forEach.call(document.querySelectorAll('.status-group'), function (group) {
      group.hidden = !group.querySelector('.svc:not([hidden])');
    });
    $('[data-empty]').hidden = shown !== 0;
  }

  function setUpTools() {
    var tools = $('[data-tools]');
    var holder = $('[data-filters]');
    function button(text, group) {
      var node = el('button', 'status-filter', text);
      node.type = 'button';
      node.setAttribute('aria-pressed', group === filters.group ? 'true' : 'false');
      node.addEventListener('click', function () {
        filters.group = group;
        Array.prototype.forEach.call(holder.children, function (other) { other.setAttribute('aria-pressed', 'false'); });
        node.setAttribute('aria-pressed', 'true');
        applyFilters();
      });
      holder.appendChild(node);
    }
    button('All', '');
    Array.prototype.forEach.call(document.querySelectorAll('.status-group'), function (group) {
      button(group.querySelector('.status-group-title').textContent, group.getAttribute('data-group'));
    });
    $('[data-search]').addEventListener('input', function (event) { filters.text = event.target.value; applyFilters(); });
    $('[data-only]').addEventListener('change', function (event) { filters.onlyProblems = event.target.checked; applyFilters(); });
    tools.hidden = false;
  }

  /* ---------- loading ---------- */

  function showFailure() {
    if (data) return;                     // keep the last good picture on a failed refresh
    $('[data-summary]').setAttribute('data-level', 'unknown');
    $('[data-headline]').textContent = 'Live status could not be loaded';
    $('[data-detail]').textContent = 'Please try again in a minute. The links to each official status page below still work.';
    Object.keys(cards).forEach(function (id) { fillCard(id, null); });
  }

  function load() {
    fetch(source, { cache: 'no-cache' })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (fresh) {
        if (!fresh || !fresh.services) throw new Error('Unexpected data');
        data = fresh;
        Object.keys(cards).forEach(function (id) { fillCard(id, data.services[id] || null); });
        fillSummary();
        fillNow();
        fillRecent();
        fillLeague();
        applyFilters();
      })
      .catch(showFailure);
  }

  setUpTools();
  load();
  setInterval(function () { if (!document.hidden) load(); }, REFRESH_MS);
  setInterval(tick, 30000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && data && Date.now() - new Date(data.checked_at).getTime() > REFRESH_MS) load();
  });
})();
