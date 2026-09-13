/* EdwardsApps product explorer. Original static adaptation of the tab-rail /
   preview concept in ruixen.ui's Preview Switch Hero, 21st.dev demo 13448.
   No scroll pinning or runtime dependencies. The source anchors and screenshot
   remain useful before enhancement; all detailed features stay on the page. */
(function () {
  'use strict';
  document.querySelectorAll('[data-product-explorer]').forEach(function (explorer) {
    var rail = explorer.querySelector('.product-tour-tabs');
    var tabs = Array.from(rail.querySelectorAll('[data-tour-target]'));
    var panel = explorer.querySelector('.product-tour-panel');
    var imageLink = panel.querySelector('.product-tour-image');
    var image = imageLink.querySelector('img');
    var deviceControls = explorer.querySelector('.product-tour-devices');
    var wide = window.matchMedia('(min-width: 901px)');
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    var active = 0;
    var device = 'desktop';
    var product = explorer.querySelector('.product-tour-rail-note strong').textContent.replace(', up close.', '');
    var sources = tabs.map(function (tab) {
      var source = document.getElementById(tab.dataset.tourTarget);
      return { element: source, image: source && source.querySelector('img'), mobile: document.getElementById(tab.dataset.mobileTarget || '') };
    });
    if (!tabs.length || sources.some(function (source) { return !source.element || !source.image; })) return;

    function select(index, focus) {
      active = index;
      var source = sources[index];
      var shot = device === 'phone' && source.mobile ? source.mobile.querySelector('img') : source.image;
      tabs.forEach(function (tab, i) {
        tab.setAttribute('aria-selected', String(i === index));
        tab.tabIndex = i === index ? 0 : -1;
        tab.classList.toggle('is-active', i === index);
      });
      image.src = shot.src;
      image.alt = shot.alt;
      image.width = Number(shot.getAttribute('width')) || shot.naturalWidth;
      image.height = Number(shot.getAttribute('height')) || shot.naturalHeight;
      imageLink.href = shot.closest('a').href;
      panel.classList.toggle('is-phone-preview', device === 'phone' && !!source.mobile);
      panel.querySelector('h3').textContent = source.element.dataset.tourTitle;
      panel.querySelector('.product-tour-description').textContent = source.element.dataset.tourSummary;
      panel.querySelector('.product-tour-feature-label').textContent = product + ' / ' + tabs[index].querySelector('strong').textContent;
      panel.querySelector('.product-tour-detail').href = '#' + source.element.id;
      panel.querySelector('.product-tour-counter').textContent = String(index + 1).padStart(2, '0') + ' / ' + String(tabs.length).padStart(2, '0');
      panel.setAttribute('aria-labelledby', tabs[index].id);
      if (deviceControls) deviceControls.querySelectorAll('button').forEach(function (button) {
        button.setAttribute('aria-pressed', String(button.dataset.tourDevice === device));
      });
      if (focus) tabs[index].focus({ preventScroll: true });
      if (!reduceMotion.matches && typeof image.animate === 'function') {
        image.getAnimations().forEach(function (animation) { animation.cancel(); });
        image.animate([{ opacity: .65, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 240, easing: 'ease-out' });
      }
    }

    rail.setAttribute('role', 'tablist');
    function orientation() { rail.setAttribute('aria-orientation', wide.matches ? 'vertical' : 'horizontal'); }
    orientation();
    wide.addEventListener('change', orientation);
    panel.setAttribute('role', 'tabpanel');
    tabs.forEach(function (tab, index) {
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', panel.id);
      tab.addEventListener('click', function (event) { event.preventDefault(); select(index, false); });
      tab.addEventListener('keydown', function (event) {
        var next;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % tabs.length;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + tabs.length - 1) % tabs.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = tabs.length - 1;
        if (event.key === ' ') next = index;
        if (next === undefined) return;
        event.preventDefault();
        select(next, true);
      });
    });
    if (deviceControls) {
      deviceControls.hidden = false;
      deviceControls.querySelectorAll('button').forEach(function (button) {
        button.addEventListener('click', function () { device = button.dataset.tourDevice; select(active, false); });
      });
    }
    explorer.querySelector('.product-tour-key-hint').hidden = false;
    explorer.classList.add('is-enhanced');
    select(0, false);
  });
})();
