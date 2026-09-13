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
