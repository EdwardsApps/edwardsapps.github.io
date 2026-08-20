/* Guide-page behaviour: topic search over the contents rail, a scrollspy,
   deep links that open closed accordions, and expand/collapse-all for the
   troubleshooting lists. Everything is an enhancement — without JS the page
   is a plain document with a working table of contents. */

// Topic search. Each contents link is matched against its own text plus the
// full text of the section it points to, so "reverse charge" finds Invoicing
// even though the link only says "Raising an invoice".
(function () {
  var toc = document.querySelector('.guide-toc');
  var input = document.getElementById('guide-search');
  if (!toc || !input) return;

  var links = Array.prototype.slice.call(toc.querySelectorAll('a[href^="#"]'));
  var index = links.map(function (a) {
    var target = document.getElementById(a.getAttribute('href').slice(1));
    var scope = target && target.closest ? (target.closest('section, details') || target) : target;
    return {
      link: a,
      item: a.closest('li'),
      group: a.closest('.toc-group'),
      text: (a.textContent + ' ' + (scope ? scope.textContent : '')).toLowerCase()
    };
  });
  var empty = toc.querySelector('.toc-empty');

  input.addEventListener('input', function () {
    var terms = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    toc.classList.toggle('is-filtering', terms.length > 0);
    var anyShown = false;

    index.forEach(function (entry) {
      var match = terms.every(function (t) { return entry.text.indexOf(t) !== -1; });
      entry.item.classList.toggle('is-hidden', terms.length > 0 && !match);
      if (terms.length === 0 || match) anyShown = true;
    });

    // A group with every entry hidden hides its own label too.
    Array.prototype.forEach.call(toc.querySelectorAll('.toc-group'), function (group) {
      var visible = group.querySelector('li:not(.is-hidden)');
      group.classList.toggle('is-hidden', terms.length > 0 && !visible);
    });

    if (empty) empty.classList.toggle('is-shown', !anyShown);
  });
})();

// Scrollspy: highlight the contents entry for the section in view.
(function () {
  var toc = document.querySelector('.guide-toc');
  if (!toc || !('IntersectionObserver' in window)) return;

  var linksById = {};
  Array.prototype.forEach.call(toc.querySelectorAll('a[href^="#"]'), function (a) {
    linksById[a.getAttribute('href').slice(1)] = a;
  });

  var sections = Array.prototype.filter.call(
    document.querySelectorAll('.guide-article section[id]'),
    function (s) { return linksById[s.id]; }
  );
  if (!sections.length) return;

  var current = null;
  function setCurrent(id) {
    if (current === id) return;
    current = id;
    Object.keys(linksById).forEach(function (key) {
      linksById[key].classList.toggle('is-current', key === id);
    });
  }

  var visible = {};
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) { visible[entry.target.id] = entry.isIntersecting; });
    for (var i = 0; i < sections.length; i++) {
      if (visible[sections[i].id]) { setCurrent(sections[i].id); return; }
    }
  }, { rootMargin: '-10% 0px -70% 0px' });
  sections.forEach(function (s) { observer.observe(s); });
})();

// Deep links: a URL fragment (or contents click) pointing at — or into — a
// closed <details> opens it first, so the browser can actually scroll there.
(function () {
  function openFor(id) {
    if (!id) return;
    var target = document.getElementById(id);
    if (!target) return;
    var node = target;
    while (node && node !== document.body) {
      if (node.tagName === 'DETAILS') node.open = true;
      node = node.parentElement;
    }
  }
  openFor(location.hash.slice(1));
  window.addEventListener('hashchange', function () { openFor(location.hash.slice(1)); });
})();

// Expand / collapse all, per troubleshooting or FAQ block.
(function () {
  Array.prototype.forEach.call(document.querySelectorAll('.ts-toggle'), function (btn) {
    btn.addEventListener('click', function () {
      var scope = document.getElementById(btn.getAttribute('data-scope'));
      if (!scope) return;
      var open = btn.getAttribute('data-action') === 'expand';
      Array.prototype.forEach.call(scope.querySelectorAll('details'), function (d) { d.open = open; });
    });
  });
})();

// Print with every accordion open; put closed ones back afterwards.
(function () {
  var touched = [];
  window.addEventListener('beforeprint', function () {
    touched = Array.prototype.filter.call(document.querySelectorAll('details:not([open])'), function (d) {
      d.open = true;
      return true;
    });
  });
  window.addEventListener('afterprint', function () {
    touched.forEach(function (d) { d.open = false; });
    touched = [];
  });
})();

// Back to top, once the reader is a couple of screens in.
(function () {
  var btn = document.querySelector('.back-to-top');
  if (!btn) return;
  var shown = false;
  window.addEventListener('scroll', function () {
    var show = window.scrollY > window.innerHeight * 2;
    if (show !== shown) {
      shown = show;
      btn.classList.toggle('is-shown', show);
    }
  }, { passive: true });
  btn.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    var skip = document.querySelector('.skip-link');
    var search = document.getElementById('guide-search');
    (search || skip || document.body).focus();
  });
})();
