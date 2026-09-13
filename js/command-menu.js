/* Native route finder inspired by Rafa Porto's 21st.dev Command Palette.
   No search service, tracking, cookies or saved search history. */
(function () {
  'use strict';
  var nav = document.querySelector('.nav');
  if (!nav || !window.HTMLDialogElement) return;
  var magnifier = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>';
  var trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'nav-search';
  trigger.setAttribute('aria-label', 'Search the site');
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-keyshortcuts', 'Control+k Meta+k');
  trigger.innerHTML = magnifier + '<span class="search-label">Search</span><kbd aria-hidden="true">⌘ K</kbd>';
  if (!/Mac|iPhone|iPad/.test(navigator.platform)) trigger.querySelector('kbd').textContent = 'Ctrl K';
  nav.appendChild(trigger);
  var dialog = document.createElement('dialog');
  dialog.className = 'command-dialog';
  dialog.setAttribute('aria-label', 'Find an app, guide or page');
  dialog.innerHTML = '<div class="command-shell"><div class="command-top"><p>Explore EdwardsApps</p><button type="button" class="command-close" aria-label="Close site search">×</button></div>' +
    '<label class="command-field">' + magnifier + '<input type="search" aria-label="Search apps, guides and pages" placeholder="What would make work easier?" autocomplete="off" spellcheck="false" aria-describedby="command-count"></label>' +
    '<div class="command-results" aria-label="Search results"></div><div class="command-footer"><p id="command-count" role="status"></p><p class="command-shortcuts"><kbd>↑</kbd> <kbd>↓</kbd> to explore &nbsp; <kbd>Enter</kbd> to open &nbsp; <kbd>Esc</kbd> to close</p></div></div>';
  document.body.appendChild(dialog);
  var rows = [
    ['Apps', 'CrewBook', 'Scheduling, crews, job costs and invoicing', '/crewbook.html', 'crewbook', 'contractor construction groundworks surfacing team cis sage jobs payroll'],
    ['Apps', 'CrewQCI', 'Quotes, contracts, invoices and credit control', '/crewqci.html', 'crewqci', 'construction trades lead retention debt payment commercial applications'],
    ['Apps', 'Studiobooks', 'Proposals, monthly billing and a client portal', '/studiobooks.html', 'studiobooks', 'software studio app agency contract invoices free apple'],
    ['Apps', 'Almoner', 'Donations, Gift Aid and charity governance', '/almoner.html', 'almoner', 'charity charities trustees restricted funds pots collection compliance'],
    ['Apps', 'OurSpace', 'A shared calendar, tasks, lists and meal plans', '/ourspace.html', 'ourspace', 'home household family kids budget mcp ai iphone android meals'],
    ['The studio', 'Custom builds', 'Shape your idea with the interactive brief builder', '/services.html#build-planner', '+', 'bespoke custom app software build developer spreadsheet automate automation process price cost'],
    ['The studio', 'About Peter', 'The people and work behind the software', '/about.html', '↗', 'story timeline founder operator contractor charity pub'],
    ['The studio', 'Start a conversation', 'Tell Peter what is getting in the way', '/enquiry.html', '↗', 'contact email help demo enquiry request support'],
    ['Read & learn', 'Articles & build notes', 'Practical ideas from the studio workbench', '/articles.html', '≡', 'blog news resources writing'],
    ['Read & learn', 'Building Keystone SG', 'The security app and the work that became Studiobooks', '/building-keystone-sg.html', '{}', 'keystone security encryption build case study studiobooks patrol site memory plan b'],
    ['Read & learn', 'Admin MFA on Base44', 'The architecture, code and lessons from building it', '/base44-mfa.html', '{}', 'security authentication two factor otp totp password mfa code admin'],
    ['Read & learn', 'Base44 MFA Builder guide', 'A step-by-step implementation with copyable prompts', '/base44-mfa-guide.html', '{}', 'security tutorial builder entity schema prompt how install implement'],
    ['Read & learn', 'User guides', 'The manuals for day-to-day work', '/guides.html', '≡', 'help handbook manual documentation pdf download'],
    ['Read & learn', 'CrewBook user guide', 'From the dashboard to payroll and Sage exports', '/crewbook-guide.html', '≡', 'guide crewbook instructions manual handbook help scheduling cis'],
    ['Read & learn', 'CrewQCI user guide', 'From the first enquiry to paid invoices', '/crewqci-guide.html', '≡', 'guide crewqci instructions manual handbook help quotes contracts credit control'],
    ['Information', 'Privacy', 'How information is handled', '/privacy.html', 'i', 'data personal policy privacy gdpr'],
    ['Information', 'Cookies', 'Browser storage and your analytics choice', '/cookies.html', 'i', 'consent tracking analytics settings cookies']
  ];
  var input = dialog.querySelector('input');
  var results = dialog.querySelector('.command-results');
  var count = dialog.querySelector('#command-count');
  var links = [];
  var active = -1;
  var opener;
  function setActive(index, focus) {
    active = index;
    links.forEach(function (link, i) { link.classList.toggle('is-active', i === index); });
    if (index >= 0 && links[index]) {
      links[index].scrollIntoView({ block: 'nearest' });
      if (focus) links[index].focus({ preventScroll: true });
    }
  }
  function render() {
    var query = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    var matches = rows.filter(function (row) {
      var text = [row[0], row[1], row[2], row[5]].join(' ').toLowerCase();
      return query.every(function (word) { return text.indexOf(word) !== -1; });
    });
    results.replaceChildren();
    var group = '';
    matches.forEach(function (row) {
      if (group !== row[0]) {
        group = row[0];
        var title = document.createElement('p');
        title.className = 'command-group';
        title.textContent = group;
        results.appendChild(title);
      }
      var link = document.createElement('a');
      link.className = 'command-result';
      link.href = row[3];
      var icon;
      if (row[0] === 'Apps') {
        icon = document.createElement('img');
        icon.src = '/img/product-' + row[4] + '.png';
        icon.alt = '';
        icon.width = 42;
        icon.height = 42;
      } else {
        icon = document.createElement('span');
        icon.className = 'command-symbol';
        icon.textContent = row[4];
        icon.setAttribute('aria-hidden', 'true');
      }
      var copy = document.createElement('span');
      var label = document.createElement('strong');
      label.textContent = row[1];
      var detail = document.createElement('small');
      detail.textContent = row[2];
      copy.append(label, detail);
      var arrow = document.createElement('b');
      arrow.textContent = '↗';
      arrow.setAttribute('aria-hidden', 'true');
      link.append(icon, copy, arrow);
      link.addEventListener('click', function () { dialog.close(); });
      results.appendChild(link);
    });
    if (!matches.length) {
      var empty = document.createElement('p');
      empty.className = 'command-empty';
      empty.textContent = 'No pages found. Try a task such as “invoices”, an app name, or “custom builds”.';
      results.appendChild(empty);
    }
    links = Array.from(results.querySelectorAll('a'));
    active = -1;
    count.textContent = matches.length + (matches.length === 1 ? ' place' : ' places') + ' to explore';
    results.scrollTop = 0;
  }
  function open() {
    if (dialog.open || document.querySelector('dialog[open]')) return;
    opener = document.activeElement;
    var apps = document.querySelector('.nav-apps');
    if (apps) apps.open = false;
    var mobile = document.querySelector('.nav-links');
    if (mobile) mobile.classList.remove('is-open');
    var toggle = document.querySelector('.nav-toggle');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    input.value = '';
    render();
    dialog.showModal();
    input.focus();
  }
  trigger.addEventListener('click', open);
  input.addEventListener('input', render);
  dialog.querySelector('.command-close').addEventListener('click', function () { dialog.close(); });
  dialog.addEventListener('click', function (event) { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', function () {
    var target = opener && opener.isConnected && opener.getClientRects().length ? opener : trigger;
    target.focus({ preventScroll: true });
  });
  dialog.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!links.length) return;
      event.preventDefault();
      var next = event.key === 'ArrowDown' ? (active + 1) % links.length : (active <= 0 ? links.length - 1 : active - 1);
      setActive(next, true);
    }
    if (event.key === 'Enter' && document.activeElement === input && links.length) {
      event.preventDefault();
      links[active < 0 ? 0 : active].click();
    }
  });
  results.addEventListener('focusin', function (event) {
    var link = event.target.closest('a');
    if (link) setActive(links.indexOf(link), false);
  });
  document.addEventListener('keydown', function (event) {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (dialog.open) dialog.close(); else open();
    }
  });
})();
