/* EdwardsApps — consent-first Google Analytics 4 and cookie controls. */
(function () {
  'use strict';

  var GA_ID = 'G-Y93B250536';
  var STORAGE_KEY = 'ea-consent';
  var gaLoaded = false;

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;

  // Default: everything denied until the visitor chooses (UK GDPR / PECR).
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied'
  });

  function loadGA() {
    if (gaLoaded) return;
    gaLoaded = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
    gtag('js', new Date());
    gtag('config', GA_ID);
  }

  function applyChoice(granted) {
    gtag('consent', 'update', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: granted ? 'granted' : 'denied'
    });
    if (granted) loadGA();
  }

  var saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}

  if (saved === 'granted' || saved === 'denied') {
    applyChoice(saved === 'granted');
  }

  function saveChoice(granted) {
    try { localStorage.setItem(STORAGE_KEY, granted ? 'granted' : 'denied'); } catch (e) {}
    applyChoice(granted);
    // If analytics was already running, reload into the consent-first state so
    // declining also removes the Google script from the current page.
    if (!granted && gaLoaded) window.location.reload();
  }

  function showBanner(focusChoice) {
    var existing = document.getElementById('ea-consent-banner');
    if (existing) {
      if (focusChoice) existing.querySelector('.consent-accept').focus();
      return;
    }

    var banner = document.createElement('div');
    banner.id = 'ea-consent-banner';
    banner.className = 'consent-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-modal', 'false');
    banner.setAttribute('aria-labelledby', 'ea-consent-title');
    banner.innerHTML =
      '<p id="ea-consent-title"><strong>Optional analytics</strong><br>' +
      'With your permission, we use Google Analytics to understand how the site is used. ' +
      'You can accept or decline — the site works either way. ' +
      '<a href="/cookies.html">Read the cookie notice</a>.</p>' +
      '<div class="consent-actions">' +
      '<button type="button" class="consent-btn consent-accept">Accept analytics</button>' +
      '<button type="button" class="consent-btn consent-decline">Decline analytics</button>' +
      '</div>';
    document.body.appendChild(banner);

    banner.querySelector('.consent-accept').addEventListener('click', function () {
      saveChoice(true);
      banner.remove();
    });
    banner.querySelector('.consent-decline').addEventListener('click', function () {
      saveChoice(false);
      banner.remove();
    });

    if (focusChoice) banner.querySelector('.consent-accept').focus();
  }

  window.EAConsent = { open: function () { showBanner(true); } };

  document.addEventListener('click', function (event) {
    var link = event.target.closest('[data-consent-settings]');
    if (!link) return;
    event.preventDefault();
    showBanner(true);
  });

  if (saved !== 'granted' && saved !== 'denied') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { showBanner(false); });
    } else {
      showBanner(false);
    }
  }
})();
