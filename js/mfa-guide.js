/* No analytics, credentials or persistent state. */
(function () {
  var status = document.querySelector('.copy-status');
  var timer;
  document.querySelectorAll('[data-copy]').forEach(function (button) {
    button.hidden = false;
    button.addEventListener('click', async function () {
      var target = document.getElementById(button.dataset.copy);
      if (!target) return;
      try {
        if (!navigator.clipboard) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(target.textContent);
        status.textContent = 'Prompt copied. Paste it into your Builder chat.';
      } catch (_) {
        var range = document.createRange(); range.selectNodeContents(target);
        var selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        target.focus();
        status.textContent = 'Prompt selected. Use your device’s Copy command.';
      }
      clearTimeout(timer); timer = setTimeout(function () { status.textContent = ''; }, 6000);
    });
  });
})();
