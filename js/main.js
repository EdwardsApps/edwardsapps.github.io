// Click-to-enlarge for feature screenshots. Without JS (or <dialog> support)
// the anchors simply open the full-size image.
(function () {
  var links = document.querySelectorAll('a.shot-link');
  if (!links.length || !window.HTMLDialogElement) return;

  var dlg = document.createElement('dialog');
  dlg.className = 'shot-lightbox';
  dlg.setAttribute('aria-label', 'Enlarged screenshot');
  dlg.innerHTML = '<div class="shot-frame">' +
    '<button class="shot-close" aria-label="Close enlarged screenshot">×</button>' +
    '<img alt=""></div>';
  document.body.appendChild(dlg);
  var img = dlg.querySelector('img');
  var opener = null;
  var scrollY = 0;

  links.forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var thumb = a.querySelector('img');
      img.src = a.href;
      img.alt = thumb ? thumb.alt : '';
      opener = a;
      scrollY = window.scrollY;
      dlg.showModal();
    });
  });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  dlg.querySelector('.shot-close').addEventListener('click', function () { dlg.close(); });

  // Put the reader back exactly where they were reading.
  dlg.addEventListener('close', function () {
    if (opener) opener.focus({ preventScroll: true });
    if (window.scrollY !== scrollY) window.scrollTo(0, scrollY);
  });
})();

/* Shared navigation: native disclosure works without JS; enhancement closes
   it predictably on Escape, outside clicks, focus leaving and following a link. */
(function () {
  var details = document.querySelector('.nav-apps');
  var menu = document.getElementById('nav-links');
  var toggle = document.querySelector('.nav-toggle');
  if (!details || !menu || !toggle) return;
  function closeMenu() {
    details.open = false;
    menu.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  }
  document.addEventListener('click', function (event) {
    if (!details.contains(event.target)) details.open = false;
    if (menu.contains(event.target) && event.target.closest('a')) closeMenu();
  });
  details.addEventListener('focusout', function (event) {
    // A known outside target covers keyboard navigation without removing a
    // pointer's click target when a browser temporarily reports no focus.
    if (event.relatedTarget && !details.contains(event.relatedTarget)) details.open = false;
  });
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape' || !details.open) return;
    var returnFocus = details.contains(document.activeElement);
    details.open = false;
    if (returnFocus) details.querySelector('summary').focus();
  });
  window.matchMedia('(min-width: 961px)').addEventListener('change', closeMenu);
})();

/* Homepage app preview. No autoplay; arrow keys, Home and End follow the
   tab pattern. The first screenshot and all product links work without JS. */
(function () {
  var tabs = document.querySelector('.app-switcher');
  var panel = document.getElementById('app-preview');
  if (!tabs || !panel) return;
  var buttons = Array.from(tabs.querySelectorAll('[data-app]'));
  var counter = document.querySelector('.app-stage-top > span:last-child');
  function select(button, focus) {
    buttons.forEach(function (item) {
      var chosen = item === button;
      item.setAttribute('aria-selected', String(chosen));
      item.tabIndex = chosen ? 0 : -1;
    });
    var data = button.dataset;
    var image = panel.querySelector('img');
    image.src = data.image;
    image.alt = data.alt;
    image.width = Number(data.width);
    image.height = Number(data.height);
    image.classList.toggle('is-phone', data.app === 'ourspace');
    panel.querySelector('strong').textContent = data.title;
    panel.querySelector('.app-preview-caption span').textContent = data.caption;
    var link = panel.querySelector('.app-explore');
    link.href = data.app + '.html';
    link.setAttribute('aria-label', 'Explore ' + data.title);
    panel.querySelector('.app-preview-image').href = data.image;
    panel.querySelector('.app-preview-image').setAttribute('aria-label', 'Enlarge ' + data.title + ' screenshot');
    panel.closest('.app-stage').dataset.activeApp = data.app;
    var features = {
      crewbook: ['Schedule the week', 'Allocate the crew', 'See the job costs'],
      crewqci: ['Send the quote', 'Agree the work', 'Chase the payment'],
      studiobooks: ['Win the proposal', 'Run the billing', 'Keep clients informed'],
      almoner: ['Track donations', 'Manage Gift Aid', 'Support the trustees'],
      ourspace: ['Share the calendar', 'Plan the meals', 'Remember the little things']
    };
    panel.querySelectorAll('.preview-workflow span').forEach(function (item, index) {
      item.textContent = features[data.app][index];
    });
    panel.setAttribute('aria-labelledby', button.id);
    counter.textContent = '0' + (buttons.indexOf(button) + 1) + ' / 05';
    if (focus) button.focus();
  }
  buttons.forEach(function (button, index) {
    button.addEventListener('click', function () { select(button, false); });
    button.addEventListener('keydown', function (event) {
      var next;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % buttons.length;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + buttons.length - 1) % buttons.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = buttons.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      select(buttons[next], true);
    });
  });
  tabs.setAttribute('role', 'tablist');
  var tabLayout = window.matchMedia('(min-width: 701px)');
  function setOrientation() { tabs.setAttribute('aria-orientation', tabLayout.matches ? 'vertical' : 'horizontal'); }
  setOrientation();
  tabLayout.addEventListener('change', setOrientation);
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', buttons[0].id);
  tabs.classList.add('is-ready');
})();

/* A small, local-only app finder. Filtering never changes source content. */
(function () {
  var filters = document.querySelector('.product-filter');
  if (!filters) return;
  var buttons = filters.querySelectorAll('[data-filter]');
  var cards = document.querySelectorAll('.product-collection [data-category]');
  buttons.forEach(function (button) {
    button.addEventListener('click', function () {
      var filter = button.dataset.filter;
      var count = 0;
      buttons.forEach(function (item) { item.setAttribute('aria-pressed', String(item === button)); });
      cards.forEach(function (card) {
        card.hidden = filter !== 'all' && card.dataset.category !== filter;
        if (!card.hidden) count += 1;
      });
      filters.querySelector('[role="status"]').textContent = count + (count === 1 ? ' app' : ' apps') + ' to explore';
    });
  });
  filters.classList.add('is-ready');
})();

/* MIT Hirael Feature 08 / Mohammad Shehadeh, via 21st.dev. Native pointer
   adaptation avoids a framework dependency and respects reduced motion. */
(function () {
  var motion = window.matchMedia('(prefers-reduced-motion: no-preference)');
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  document.querySelectorAll('[data-spotlight]').forEach(function (card) {
    card.addEventListener('pointermove', function (event) {
      if (!motion.matches || !finePointer.matches) return;
      var rect = card.getBoundingClientRect();
      card.style.setProperty('--mx', (event.clientX - rect.left) + 'px');
      card.style.setProperty('--my', (event.clientY - rect.top) + 'px');
    }, { passive: true });
  });
})();

// Mobile nav toggle.
(function () {
  var toggle = document.querySelector('.nav-toggle');
  var links = document.getElementById('nav-links');
  if (!toggle || !links) return;

  toggle.addEventListener('click', function () {
    var open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    links.classList.toggle('is-open', !open);
  });

  // Close the menu on Escape. Only pull focus back to the toggle when focus
  // was inside the menu system — checked before hiding, because display:none
  // would move focus to <body> and defeat the check.
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && links.classList.contains('is-open')) {
      var inMenu = links.contains(document.activeElement) || document.activeElement === toggle;
      links.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      if (inMenu) toggle.focus();
    }
  });
})();

/* Outbound app clicks — the hub's one conversion.
   Fires a GA4 event naming which app the visitor left for; consent.js
   defines window.gtag, and consent mode drops the event if analytics
   consent was refused. Beacon transport survives the navigation. */
(function () {
  'use strict';

  var APP_HOSTS = {
    'almoner.app': 'Almoner',
    'crewbook.me': 'CrewBook',
    'crew-qci.com': 'CrewQCI',
    'www.crew-qci.com': 'CrewQCI',
    'studiobooks.app': 'Studiobooks',
    'www.studiobooks.app': 'Studiobooks',
    'our-space.me': 'OurSpace'
  };

  /* The app stores carry more than one of our apps, so the hostname alone
     won't say which. Match on the listing instead. */
  var STORE_LISTINGS = [
    { match: 'id6807538781', app: 'Studiobooks' },
    { match: 'id6775036547', app: 'OurSpace' },
    { match: 'com.base6a0d9576def7780fc56eeb7e.app', app: 'OurSpace' }
  ];

  function appForLink(href) {
    var url = new URL(href);
    if (APP_HOSTS[url.hostname]) return APP_HOSTS[url.hostname];
    if (url.hostname !== 'apps.apple.com' && url.hostname !== 'play.google.com') return null;
    for (var i = 0; i < STORE_LISTINGS.length; i++) {
      if (href.indexOf(STORE_LISTINGS[i].match) !== -1) return STORE_LISTINGS[i].app;
    }
    return null;
  }

  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('a[href^="https://"]');
    if (!link || typeof window.gtag !== 'function') return;
    var app = appForLink(link.href);
    if (!app) return;
    window.gtag('event', 'app_click', {
      app_name: app,
      link_url: link.href,
      page_path: location.pathname,
      transport_type: 'beacon'
    });
  });
})();
