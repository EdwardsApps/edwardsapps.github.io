// Click-to-enlarge for feature screenshots. Without JS (or <dialog> support)
// the anchors simply open the full-size image.
(function () {
  var links = document.querySelectorAll('a.shot-link');
  if (!links.length || !window.HTMLDialogElement) return;

  var dlg = document.createElement('dialog');
  dlg.className = 'shot-lightbox';
  dlg.innerHTML = '<button class="shot-close" aria-label="Close enlarged screenshot">×</button><img alt="">';
  document.body.appendChild(dlg);
  var img = dlg.querySelector('img');

  links.forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var thumb = a.querySelector('img');
      img.src = a.href;
      img.alt = thumb ? thumb.alt : '';
      dlg.showModal();
    });
  });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  dlg.querySelector('.shot-close').addEventListener('click', function () { dlg.close(); });
})();

// Mobile nav toggle.
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
