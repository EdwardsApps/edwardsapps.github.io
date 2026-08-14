/* EdwardsApps — Google Consent Mode v2 + Google Tag Manager + cookie banner.
   Replace GTM_ID below with your container ID from tagmanager.google.com. */
(function () {
  'use strict';

  var GTM_ID = 'GTM-XXXXXXX'; // <-- your Google Tag Manager container ID
  var STORAGE_KEY = 'ea-consent';

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;

  // Default: everything denied until the visitor chooses (UK GDPR / PECR).
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    wait_for_update: 500
  });

  function loadGTM() {
    if (GTM_ID.indexOf('XXXXXXX') !== -1) return; // placeholder not replaced yet
    window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtm.js?id=' + GTM_ID;
    document.head.appendChild(s);
  }

  function applyChoice(granted) {
    gtag('consent', 'update', {
      ad_storage: granted ? 'granted' : 'denied',
      ad_user_data: granted ? 'granted' : 'denied',
      ad_personalization: granted ? 'granted' : 'denied',
      analytics_storage: granted ? 'granted' : 'denied'
    });
  }

  var saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}

  if (saved === 'granted' || saved === 'denied') {
    applyChoice(saved === 'granted');
  }
  loadGTM();

  function saveChoice(granted) {
    try { localStorage.setItem(STORAGE_KEY, granted ? 'granted' : 'denied'); } catch (e) {}
    applyChoice(granted);
  }

  function showBanner() {
    var banner = document.createElement('div');
    banner.className = 'consent-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie consent');
    banner.innerHTML =
      '<p>We use cookies to understand how the site is used and to improve it. ' +
      'You can accept or decline — the site works either way.</p>' +
      '<div class="consent-actions">' +
      '<button type="button" class="consent-btn consent-accept">Accept</button>' +
      '<button type="button" class="consent-btn consent-decline">Decline</button>' +
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
  }

  // Let visitors change their mind later, e.g. a "Cookie settings" link:
  // <a href="#" onclick="EAConsent.open(); return false;">Cookie settings</a>
  window.EAConsent = { open: showBanner };

  if (saved !== 'granted' && saved !== 'denied') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', showBanner);
    } else {
      showBanner();
    }
  }
})();
