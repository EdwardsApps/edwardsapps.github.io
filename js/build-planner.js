/* EdwardsApps: a browser-only brief builder and progressive enquiry helpers.
   The editorial progress rail adapts the 21st.dev Timeline pattern by
   manuarora700 (demo 857), using the existing document instead of React/Motion.
   No planner request is sent to a server. Submission remains in enquiry.js. */
(function () {
  'use strict';

  var DRAFT_KEY = 'ea-project-brief';
  var DRAFT_MAX_AGE = 30 * 60 * 1000;
  var planner = document.querySelector('[data-brief-planner]');

  if (planner) {
    var form = document.getElementById('brief-planner-form');
    var panels = Array.from(planner.querySelectorAll('[data-planner-panel]'));
    var steps = Array.from(planner.querySelectorAll('[data-planner-step]'));
    var next = planner.querySelector('[data-planner-next]');
    var back = planner.querySelector('[data-planner-back]');
    var count = planner.querySelector('[data-planner-count]');
    var feedback = document.getElementById('planner-feedback');
    var result = planner.querySelector('[data-planner-result]');
    var brief = document.getElementById('planner-brief');
    var enquiry = planner.querySelector('[data-planner-enquiry]');
    var copyStatus = planner.querySelector('[data-planner-copy-status]');
    var current = 0;
    var furthest = 0;
    var manualTransfer = false;

    function selectedFriction() {
      return Array.from(form.querySelectorAll('input[name="friction"]:checked'));
    }

    function updateNotes() {
      var friction = selectedFriction();
      var people = form.querySelector('input[name="people"]:checked');
      var outcome = document.getElementById('planner-outcome').value.trim();
      var frictionNote = planner.querySelector('[data-planner-note="friction"]');
      var peopleNote = planner.querySelector('[data-planner-note="people"]');
      var outcomeNote = planner.querySelector('[data-planner-note="outcome"]');
      frictionNote.textContent = friction.length ? friction.map(function (input) {
        return input.closest('label').querySelector('strong').textContent;
      }).join(' · ') : 'Find the friction.';
      peopleNote.textContent = people ? people.nextElementSibling.textContent : 'Bring the right people.';
      outcomeNote.textContent = outcome ? 'A better day, in your own words.' : 'Picture a better day.';
      frictionNote.classList.toggle('is-written', friction.length > 0);
      peopleNote.classList.toggle('is-written', !!people);
      outcomeNote.classList.toggle('is-written', !!outcome);
    }

    function showStep(index, focus) {
      current = index;
      form.hidden = false;
      result.hidden = true;
      panels.forEach(function (panel, i) { panel.hidden = i !== index; });
      steps.forEach(function (button, i) {
        button.disabled = i > furthest;
        button.classList.toggle('is-complete', i < index);
        if (i === index) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
      });
      back.hidden = index === 0;
      count.textContent = 'Step ' + (index + 1) + ' of 3';
      next.textContent = ['Next: the people', 'Next: a better day', 'Create my brief'][index];
      feedback.textContent = '';
      panels.forEach(function (panel) { panel.removeAttribute('aria-describedby'); });
      if (focus) panels[index].querySelector('legend').focus();
    }

    function buildBrief() {
      var friction = selectedFriction();
      var people = form.querySelector('input[name="people"]:checked');
      var tools = document.getElementById('planner-tools').value.trim();
      var outcome = document.getElementById('planner-outcome').value.trim();
      var lines = ['Hi Peter,', '', 'I\'d like to talk about software for ' + people.value + '.', '', 'What slows us down:'];
      friction.forEach(function (input) { lines.push('• ' + input.value); });
      if (tools) lines.push('', 'The work currently lives in:', tools);
      if (outcome) lines.push('', 'A good day would look like:', outcome);
      lines.push('', 'I\'d like to discuss what would fit, and agree the scope and price before any work begins.');
      return lines.join('\n');
    }

    function validateThrough(index) {
      var missing = selectedFriction().length === 0 ? 0 :
        index >= 1 && !form.querySelector('input[name="people"]:checked') ? 1 : -1;
      if (missing === -1) return true;
      showStep(missing, false);
      feedback.textContent = missing === 0 ? 'Choose at least one thing that slows you down.' :
        'Choose who the tool would help. The closest fit is fine.';
      panels[missing].setAttribute('aria-describedby', 'planner-feedback');
      panels[missing].querySelector('input').focus();
      return false;
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!validateThrough(current)) return;
      if (current < 2) {
        furthest = Math.max(furthest, current + 1);
        showStep(current + 1, true);
        return;
      }
      brief.value = buildBrief();
      form.hidden = true;
      result.hidden = false;
      manualTransfer = false;
      enquiry.href = 'enquiry.html?from=planner#enquiry-form';
      enquiry.textContent = 'Take this to Peter';
      copyStatus.textContent = '';
      steps.forEach(function (button) {
        button.removeAttribute('aria-current');
        button.classList.add('is-complete');
      });
      result.querySelector('h3').focus();
    });

    back.addEventListener('click', function () { showStep(Math.max(0, current - 1), true); });
    steps.forEach(function (button) {
      button.addEventListener('click', function () {
        var index = Number(button.dataset.plannerStep);
        if (index > furthest) return;
        if (index > current && !validateThrough(index - 1)) return;
        showStep(index, true);
      });
    });
    form.addEventListener('input', updateNotes);
    form.addEventListener('change', function () { feedback.textContent = ''; updateNotes(); });

    function saveForEnquiry(event) {
      if (event.type === 'auxclick' && event.button !== 1) return;
      if (manualTransfer) return;
      if (!brief.value.trim()) {
        event.preventDefault();
        copyStatus.textContent = 'Add a few words to your brief before taking it across.';
        brief.focus();
        return;
      }
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ message: brief.value.slice(0, 3500), created: Date.now() }));
      } catch (error) {
        event.preventDefault();
        manualTransfer = true;
        enquiry.href = 'enquiry.html';
        enquiry.textContent = 'Open the enquiry form';
        copyStatus.textContent = 'Your browser could not carry the draft. Copy it below, then open the enquiry form and paste it into the message.';
        brief.focus();
        brief.select();
      }
    }
    enquiry.addEventListener('click', saveForEnquiry);
    enquiry.addEventListener('auxclick', saveForEnquiry);

    planner.querySelector('[data-planner-copy]').addEventListener('click', function () {
      function selectToCopy() {
        brief.focus();
        brief.select();
        copyStatus.textContent = 'The brief is selected. Use your device\'s Copy command to copy it.';
      }
      if (!navigator.clipboard || !navigator.clipboard.writeText) { selectToCopy(); return; }
      navigator.clipboard.writeText(brief.value).then(function () {
        copyStatus.textContent = 'Brief copied. It is ready to paste wherever you need it.';
      }, selectToCopy);
    });

    planner.querySelector('[data-planner-reset]').addEventListener('click', function () {
      form.reset();
      brief.value = '';
      furthest = 0;
      try { sessionStorage.removeItem(DRAFT_KEY); } catch (error) { /* Storage is optional. */ }
      updateNotes();
      showStep(0, true);
    });
    showStep(0, false);
    planner.hidden = false;
  }

  var enquiryForm = document.getElementById('enquiry-form');
  if (enquiryForm) {
    var message = document.getElementById('enq-message');
    var app = document.getElementById('enq-app');
    var draftNote = document.querySelector('[data-enquiry-draft-note]');
    if (new URLSearchParams(window.location.search).get('from') === 'planner') {
      var draft = null;
      try {
        var storedDraft = sessionStorage.getItem(DRAFT_KEY);
        sessionStorage.removeItem(DRAFT_KEY);
        draft = JSON.parse(storedDraft);
      } catch (error) { /* A copy-and-paste enquiry still works. */ }
      if (draft && typeof draft.message === 'string' && typeof draft.created === 'number' &&
          Date.now() - draft.created >= 0 && Date.now() - draft.created < DRAFT_MAX_AGE && draft.message.trim()) {
        if (!message.value.trim()) {
          message.value = draft.message.slice(0, 3500);
          if (!app.value) app.value = 'A custom build';
          draftNote.hidden = false;
        }
      }
    }

    var readiness = document.querySelector('[data-enquiry-readiness]');
    var cues = document.querySelector('[data-enquiry-writing-cues]');
    var nameField = document.getElementById('enq-name');
    var emailField = document.getElementById('enq-email');
    function updateReadiness() {
      var supplied = Number(!!nameField.value.trim()) + Number(!!emailField.value.trim() && emailField.validity.valid) + Number(!!message.value.trim());
      readiness.querySelector('progress').value = supplied;
      readiness.querySelector('[data-enquiry-count]').textContent = supplied + ' of 3';
      readiness.classList.toggle('is-ready', supplied === 3);
    }
    if (readiness) {
      readiness.hidden = false;
      enquiryForm.addEventListener('input', updateReadiness);
      updateReadiness();
    }
    if (cues) {
      cues.hidden = false;
      cues.querySelectorAll('[data-writing-cue]').forEach(function (button) {
        button.addEventListener('click', function () {
          var cue = button.dataset.writingCue;
          if (message.value.indexOf(cue) === -1) message.value += (message.value.trim() ? '\n\n' : '') + cue;
          message.focus();
          message.setSelectionRange(message.value.length, message.value.length);
          message.dispatchEvent(new Event('input', { bubbles: true }));
        });
      });
    }
  }

  var journey = document.querySelector('.editorial-journey');
  if (journey) {
    var items = Array.from(journey.querySelectorAll('[data-journey-item]'));
    var jumps = journey.querySelector('[data-journey-jumps]');
    var year = journey.querySelector('[data-journey-year]');
    var title = journey.querySelector('[data-journey-title]');
    var mark = journey.querySelector('[data-journey-image]');
    var chapterCount = journey.querySelector('[data-journey-count]');
    var links = items.map(function (item, i) {
      var link = document.createElement('a');
      link.href = '#' + item.id;
      link.setAttribute('aria-label', item.querySelector('.tl-year').textContent + ': ' + item.dataset.title);
      link.textContent = String(i + 1).padStart(2, '0');
      jumps.appendChild(link);
      return link;
    });
    var active = -1;
    var queued = false;
    function updateJourney() {
      queued = false;
      var viewportAnchor = window.innerHeight * 0.42;
      var selected = 0;
      items.forEach(function (item, i) { if (item.getBoundingClientRect().top <= viewportAnchor) selected = i; });
      if (active !== selected) {
        active = selected;
        items.forEach(function (item, i) { item.classList.toggle('is-current', i === selected); });
        links.forEach(function (link, i) {
          if (i === selected) link.setAttribute('aria-current', 'step');
          else link.removeAttribute('aria-current');
        });
        year.textContent = items[selected].querySelector('.tl-year').textContent;
        year.classList.toggle('is-wordy', year.textContent.length > 7);
        title.textContent = items[selected].dataset.title;
        mark.src = items[selected].dataset.image;
        mark.classList.toggle('is-wordmark', items[selected].dataset.image === 'img/logo.png');
        chapterCount.textContent = String(selected + 1).padStart(2, '0') + ' / ' + String(items.length).padStart(2, '0');
      }
      var timeline = journey.querySelector('.journey-timeline');
      var rect = timeline.getBoundingClientRect();
      var progress = Math.min(1, Math.max(0, (viewportAnchor - rect.top) / rect.height));
      timeline.style.setProperty('--journey-progress', (progress * 100).toFixed(2) + '%');
    }
    function queueJourney() {
      if (!queued) { queued = true; window.requestAnimationFrame(updateJourney); }
    }
    window.addEventListener('scroll', queueJourney, { passive: true });
    window.addEventListener('resize', queueJourney, { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(queueJourney);
    journey.classList.add('is-enhanced');
    jumps.hidden = false;
    updateJourney();
  }
})();
