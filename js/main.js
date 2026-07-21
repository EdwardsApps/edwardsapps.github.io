// Mobile nav toggle. The only JS on the site.
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
