/* Progressive reading helpers. All content and anchor navigation work without JS. */
(function () {
  'use strict';
  var article = document.querySelector('.article-body, .guide-article');
  if (!article) return;

  var progress = document.createElement('progress');
  progress.className = 'resource-reading-progress';
  progress.max = 100;
  progress.value = 0;
  progress.setAttribute('aria-label', 'Reading progress');
  document.body.appendChild(progress);

  var toc = document.querySelector('.article-toc, .guide-toc');
  var links = toc ? Array.from(toc.querySelectorAll('a[href^="#"]')) : [];
  var sections = links.map(function (link) {
    return { link: link, target: document.getElementById(link.getAttribute('href').slice(1)) };
  }).filter(function (entry) { return entry.target; });

  if (toc) {
    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'resource-toc-toggle';
    toggle.textContent = toc.classList.contains('guide-toc') ? 'Find a topic in this guide' : 'Explore the contents';
    toggle.setAttribute('aria-expanded', 'false');
    toc.classList.add('resource-toc-enhanced');
    toc.prepend(toggle);
    toggle.addEventListener('click', function () {
      var expanded = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(expanded));
      toc.classList.toggle('is-expanded', expanded);
    });
  }

  var pending = false;
  function update() {
    pending = false;
    var rect = article.getBoundingClientRect();
    var readable = Math.max(1, rect.height - window.innerHeight * .5);
    progress.value = Math.min(100, Math.max(0, (window.innerHeight * .25 - rect.top) / readable * 100));
    var percent = document.querySelector('[data-reading-percent]');
    if (percent) percent.textContent = Math.round(progress.value) + '% read';
    var current = null;
    sections.forEach(function (entry) {
      if (entry.target.getBoundingClientRect().top < window.innerHeight * .3) current = entry;
    });
    // guide.js owns the existing guide scrollspy; only add aria-current there.
    sections.forEach(function (entry) {
      if (toc.classList.contains('article-toc')) entry.link.classList.toggle('is-current', entry === current);
      if (entry === current) entry.link.setAttribute('aria-current', 'location');
      else entry.link.removeAttribute('aria-current');
    });
  }
  function schedule() {
    if (pending) return;
    pending = true;
    window.requestAnimationFrame(update);
  }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  window.addEventListener('load', schedule);
  document.querySelectorAll('details').forEach(function (item) { item.addEventListener('toggle', schedule); });
  update();
})();

/* Reading controls and a native code workbench. The original article and code
   nodes remain unchanged. Preferences live only in this page's memory.
   Visual reference: 21st.dev/ayushmxxn/code-block, demo 1361; implemented without
   React, an external highlighter, network requests or persistent storage. */
(function () {
  'use strict';
  var article = document.querySelector('.article-body, .guide-article');
  if (!article) return;

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(label, className, accessibleLabel) {
    var node = element('button', className, label);
    node.type = 'button';
    if (accessibleLabel) node.setAttribute('aria-label', accessibleLabel);
    return node;
  }

  var controls = element('div', 'reading-tools');
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'Reading preferences');
  var label = element('div', 'reading-tools-label');
  label.append(element('span', '', 'Reading room'));
  var percent = element('strong', '', '0% read');
  percent.setAttribute('data-reading-percent', '');
  label.append(percent);
  var actions = element('div', 'reading-tool-actions');
  var smaller = button('A−', '', 'Decrease reading text size');
  var larger = button('A+', '', 'Increase reading text size');
  var focus = button('Focus view', 'reading-focus', 'Toggle focused reading layout');
  focus.setAttribute('aria-pressed', 'false');
  actions.append(smaller, larger, focus);
  controls.append(label, actions);
  article.prepend(controls);

  var sizes = [1, 1.12, 1.25];
  var sizeIndex = 0;
  smaller.disabled = true;
  function keepReadingPosition(change) {
    var top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-height')) || 88;
    var readingLine = top + controls.getBoundingClientRect().height + 24;
    // A handbook chapter can contain many screens of text. Anchor the visible
    // paragraph, list item or code block rather than the entire section, whose
    // unchanged top cannot account for reflow above the reader's current text.
    var blocks = Array.from(article.querySelectorAll('p, li, pre, h2, h3, h4, blockquote, figure'))
      .filter(function (node) { return !controls.contains(node); })
      .map(function (node) { return { node: node, box: node.getBoundingClientRect() }; })
      .filter(function (entry) { return entry.box.height > 0 && entry.box.width > 0; });
    var crossing = blocks.filter(function (entry) {
      return entry.box.top <= readingLine && entry.box.bottom > readingLine;
    }).sort(function (a, b) { return a.box.height - b.box.height; });
    var following = blocks.filter(function (entry) {
      return entry.box.top >= readingLine && entry.box.top < window.innerHeight;
    }).sort(function (a, b) { return a.box.top - b.box.top; });
    var chosen = crossing[0] || following[0];
    var marker = chosen ? chosen.node : Array.from(article.children).find(function (node) {
      var box = node.getBoundingClientRect();
      return node !== controls && box.top <= readingLine && box.bottom > readingLine;
    });
    var previous = marker ? marker.getBoundingClientRect().top : 0;
    change();
    if (marker) window.scrollBy(0, marker.getBoundingClientRect().top - previous);
    window.dispatchEvent(new Event('resize'));
  }
  function resizeText(direction) {
    sizeIndex = Math.min(sizes.length - 1, Math.max(0, sizeIndex + direction));
    keepReadingPosition(function () { document.body.style.setProperty('--reader-scale', sizes[sizeIndex]); });
    smaller.disabled = sizeIndex === 0;
    larger.disabled = sizeIndex === sizes.length - 1;
  }
  smaller.addEventListener('click', function () { resizeText(-1); });
  larger.addEventListener('click', function () { resizeText(1); });
  focus.addEventListener('click', function () {
    var on = focus.getAttribute('aria-pressed') !== 'true';
    keepReadingPosition(function () { document.body.classList.toggle('is-reading-focused', on); });
    focus.setAttribute('aria-pressed', String(on));
    focus.textContent = on ? 'Full layout' : 'Focus view';
  });

  var sources = Array.from(article.querySelectorAll('.article-code pre, .builder-prompt pre')).map(function (pre, index) {
    var block = pre.closest('.article-code, .builder-prompt');
    var heading = block.querySelector('.prompt-heading strong, p');
    return {
      pre: pre,
      block: block,
      title: heading ? heading.textContent.trim() : 'Code excerpt ' + (index + 1),
      text: pre.textContent,
      prompt: block.classList.contains('builder-prompt')
    };
  });
  if (!sources.length) return;

  var toast = element('div', 'resource-reader-status');
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  document.body.append(toast);
  var toastTimer;
  var dialog;
  var dialogSource;
  var note;
  var select;
  var position;
  var readerCopy;
  var wrap;
  var active = 0;
  var opener;
  var oldOverflow;
  var canDialog = typeof HTMLDialogElement !== 'undefined' && 'showModal' in HTMLDialogElement.prototype;

  function announce(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    if (dialog && dialog.open) note.textContent = message;
    toastTimer = window.setTimeout(function () { toast.textContent = ''; }, 4500);
  }
  async function copy(source, target, trigger) {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(source.text);
      var previous = trigger.textContent;
      trigger.textContent = 'Copied ✓';
      announce(source.prompt ? 'Prompt copied.' : 'Code copied.');
      window.setTimeout(function () {
        if (trigger.textContent !== 'Copied ✓') return;
        trigger.textContent = trigger === readerCopy ? (sources[active].prompt ? 'Copy prompt' : 'Copy code') : previous;
      }, 1800);
    } catch (_) {
      target.tabIndex = 0;
      target.focus();
      var range = document.createRange();
      range.selectNodeContents(target);
      var selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      announce('Text selected. Use your device’s Copy command.');
    }
  }

  if (canDialog) {
    dialog = element('dialog', 'code-reader');
    dialog.setAttribute('aria-labelledby', 'code-reader-heading');
    dialog.setAttribute('aria-describedby', 'code-reader-description');
    var inner = element('div', 'code-reader-inner');
    var top = element('div', 'code-reader-top');
    var titles = element('div');
    titles.append(element('p', '', 'The EdwardsApps workbench'));
    var title = element('h2', '', 'Code & prompts');
    title.id = 'code-reader-heading';
    titles.append(title);
    var close = button('×', 'code-reader-close', 'Close code reader');
    close.addEventListener('click', function () { dialog.close(); });
    top.append(titles, close);
    var toolbar = element('div', 'code-reader-toolbar');
    select = element('select', 'code-reader-select');
    select.setAttribute('aria-label', 'Choose code excerpt or Builder prompt');
    sources.forEach(function (source, index) {
      var option = element('option', '', String(index + 1).padStart(2, '0') + ' / ' + source.title);
      option.value = String(index);
      select.append(option);
    });
    select.addEventListener('change', function () { showSource(Number(select.value)); });
    wrap = button('Wrap lines', '', 'Wrap long lines in the code reader');
    wrap.setAttribute('aria-pressed', 'false');
    wrap.addEventListener('click', function () {
      var wrapped = wrap.getAttribute('aria-pressed') !== 'true';
      wrap.setAttribute('aria-pressed', String(wrapped));
      dialogSource.classList.toggle('is-wrapped', wrapped);
    });
    readerCopy = button('Copy code', 'code-reader-copy');
    readerCopy.addEventListener('click', function () { copy(sources[active], dialogSource, readerCopy); });
    toolbar.append(select, wrap, readerCopy);
    dialogSource = element('pre', 'code-reader-content');
    dialogSource.tabIndex = 0;
    dialogSource.setAttribute('aria-label', 'Code excerpt');
    var footer = element('div', 'code-reader-footer');
    note = element('span', 'code-reader-note', 'Exact source from this page · Esc to close');
    note.id = 'code-reader-description';
    note.setAttribute('role', 'status');
    position = element('span', 'code-reader-position');
    footer.append(note, position);
    inner.append(top, toolbar, dialogSource, footer);
    dialog.append(inner);
    document.body.append(dialog);
    dialog.addEventListener('close', function () {
      document.body.style.overflow = oldOverflow;
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    });
    dialog.addEventListener('click', function (event) {
      if (event.target !== dialog) return;
      var rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
  }

  function showSource(index) {
    active = index;
    var source = sources[index];
    // textContent preserves every original code character and cannot execute it.
    dialogSource.textContent = source.text;
    dialogSource.setAttribute('aria-label', source.title);
    dialogSource.classList.toggle('is-prompt', source.prompt);
    dialogSource.classList.toggle('is-wrapped', source.prompt);
    wrap.setAttribute('aria-pressed', String(source.prompt));
    select.value = String(index);
    readerCopy.textContent = source.prompt ? 'Copy prompt' : 'Copy code';
    note.textContent = 'Exact source from this page · Esc to close';
    position.textContent = (index + 1) + ' of ' + sources.length;
    dialogSource.scrollTop = 0;
    dialogSource.scrollLeft = 0;
  }

  sources.forEach(function (source, index) {
    var row;
    if (source.prompt) {
      row = source.block.querySelector('.prompt-heading');
    } else {
      row = element('div', 'code-inline-actions');
      row.append(element('span', '', source.text.split('\n').length + ' lines / source excerpt'));
      var copyButton = button('Copy code', '', 'Copy code: ' + source.title);
      copyButton.addEventListener('click', function () { copy(source, source.pre, copyButton); });
      row.append(copyButton);
      source.block.append(row);
    }
    if (canDialog) {
      var expand = button('Open reader ↗', 'code-expand', 'Open code reader: ' + source.title);
      expand.addEventListener('click', function () {
        opener = expand;
        showSource(index);
        oldOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        dialog.showModal();
        select.focus();
      });
      row.append(expand);
    }
  });
})();
