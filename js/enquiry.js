/* EdwardsApps — enquiry form (enquiry.html).
   Sends the enquiry as JSON to the EdwardsApps Connect app so it lands in
   Peter's pipeline. Built to fail soft: on ANY problem — network down,
   endpoint moved, non-2xx response, slow reply — the visitor's email app
   opens instead with the same details prefilled, so nothing is ever lost.
   Without JS (or fetch) the form's own mailto action does the same job. */
(function () {
  'use strict';

  // Where enquiries land: the websiteEnquiry function in the EdwardsApps
  // Connect app (Base44). If Connect ever moves, update this one line —
  // the mailto fallback below keeps the form working in the meantime.
  const ENDPOINT = 'https://edwardsapps-connect.base44.app/functions/websiteEnquiry';

  var form = document.getElementById('enquiry-form');
  if (!form || typeof window.fetch !== 'function') return;

  var success = document.getElementById('enquiry-success');
  var successHead = document.getElementById('enquiry-success-head');
  var successCopy = document.getElementById('enquiry-success-copy');
  var submit = form.querySelector('button[type="submit"]');

  function value(name) {
    var field = form.elements[name];
    return field && field.value ? field.value.trim() : '';
  }

  // The exact payload the Connect backend expects.
  function payload() {
    return {
      name: value('name'),
      email: value('email'),
      company: value('company'),
      phone: value('phone'),
      message: value('message'),
      app_interest: value('app_interest'),
      page: 'enquiry.html',
      website: value('website') // honeypot — people leave it empty
    };
  }

  function mailtoHref(data) {
    var body = 'Name: ' + data.name + '\r\nEmail: ' + data.email;
    if (data.company) body += '\r\nCompany: ' + data.company;
    if (data.phone) body += '\r\nPhone: ' + data.phone;
    if (data.app_interest) body += '\r\nAbout: ' + data.app_interest;
    body += '\r\n\r\n' + data.message;
    return 'mailto:peter@edwardsapps.co.uk' +
      '?subject=' + encodeURIComponent('I need an app') +
      '&body=' + encodeURIComponent(body);
  }

  function showSuccess(viaEmail) {
    if (viaEmail) {
      successHead.textContent = 'Thanks — one more step.';
      successCopy.textContent = 'We couldn’t reach our enquiry service just now, so your email app has opened with the details ready to send. Press send there and it lands in front of Peter as usual.';
    }
    form.hidden = true;
    success.hidden = false;
    success.focus();
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    var data = payload();
    if (submit) { submit.disabled = true; submit.textContent = 'Sending…'; }

    // Give a struggling connection a fair chance, then fall back to email
    // rather than leaving the visitor watching a stuck button.
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 12000) : null;

    var done = false;
    function settle(delivered) {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      if (delivered) {
        showSuccess(false);
      } else {
        window.location.href = mailtoHref(data);
        showSuccess(true);
      }
    }

    try {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: controller ? controller.signal : undefined
      }).then(
        function (res) { settle(res.ok); },
        function () { settle(false); }
      );
    } catch (err) {
      settle(false);
    }
  });
})();
