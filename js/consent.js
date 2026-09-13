/* EdwardsApps — consent-first Google Analytics 4, Meta Pixel and cookie controls. */
(function () {
  'use strict';

  var GA_ID = 'G-Y93B250536';
  var STORAGE_KEY = 'ea-consent';
  var gaLoaded = false;
  var pixelLoaded = false;
  var MARKETING_KEY = 'ea-marketing-consent';
  var marketingSaved = null;
  try { marketingSaved = localStorage.getItem(MARKETING_KEY); } catch (e) {}

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

  function loadPixel() {
    if (pixelLoaded) return;
    pixelLoaded = true;
    !function(f,b,e,v,n,t,s) {
      if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;
      s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s);
    }(window, document,'script','https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('consent', 'grant');
    window.fbq('init', '3441716076000928');
    window.fbq('track', 'PageView');
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

  if (marketingSaved === 'granted') loadPixel();

  function saveChoice(granted, marketing) {
    try { localStorage.setItem(STORAGE_KEY, granted ? 'granted' : 'denied'); } catch (e) {}
    try { localStorage.setItem(MARKETING_KEY, marketing ? 'granted' : 'denied'); } catch (e) {}
    marketingSaved = marketing ? 'granted' : 'denied';
    saved = granted ? 'granted' : 'denied';
    if (!marketing && pixelLoaded) window.fbq('consent', 'revoke');
    if (marketing) loadPixel();
    applyChoice(granted);
    // If analytics was already running, reload into the consent-first state so
    // declining also removes the Google script from the current page.
    if ((!granted && gaLoaded) || (!marketing && pixelLoaded)) window.location.reload();
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
      '<div><p id="ea-consent-title"><strong>Optional cookies</strong><br>' +
      'Choose Google Analytics to help improve the site, and Meta Pixel to measure Facebook and Instagram advertising. ' +
      'Both are optional. <a href="/cookies.html">Read the cookie notice</a>.</p>' +
      '<p><label><input type="checkbox" id="ea-analytics-choice"> Analytics (Google)</label> ' +
      '<label><input type="checkbox" id="ea-marketing-choice"> Marketing (Meta)</label></p></div>' +
      '<div class="consent-actions">' +
      '<button type="button" class="consent-btn consent-accept">Accept all</button>' +
      '<button type="button" class="consent-btn consent-save">Save choices</button>' +
      '<button type="button" class="consent-btn consent-decline">Reject all</button>' +
      '</div>';
    document.body.appendChild(banner);

    banner.querySelector('#ea-analytics-choice').checked = saved === 'granted';
    banner.querySelector('#ea-marketing-choice').checked = marketingSaved === 'granted';
    banner.querySelector('.consent-save').addEventListener('click', function () {
      saveChoice(banner.querySelector('#ea-analytics-choice').checked, banner.querySelector('#ea-marketing-choice').checked);
      banner.remove();
    });

    banner.querySelector('.consent-accept').addEventListener('click', function () {
      saveChoice(true, true);
      banner.remove();
    });
    banner.querySelector('.consent-decline').addEventListener('click', function () {
      saveChoice(false, false);
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

  if ((saved !== 'granted' && saved !== 'denied') || (marketingSaved !== 'granted' && marketingSaved !== 'denied')) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { showBanner(false); });
    } else {
      showBanner(false);
    }
  }
})();
