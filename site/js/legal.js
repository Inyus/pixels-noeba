// Pixels Noeba - shared script for legal & about pages: language switch + footer labels.
(function () {
  var SUPPORTED = ['ca', 'en', 'es'];
  var FOOTER = {
    ca: { about: 'Com es juga', legal: 'Avís legal', privacy: 'Privacitat', cookies: 'Galetes' },
    en: { about: 'How to play', legal: 'Legal notice', privacy: 'Privacy', cookies: 'Cookies' },
    es: { about: 'Cómo jugar', legal: 'Aviso legal', privacy: 'Privacidad', cookies: 'Cookies' }
  };
  function current() {
    var q = new URLSearchParams(location.search).get('lang');
    if (q && SUPPORTED.indexOf(q) >= 0) return q;
    try { var s = localStorage.getItem('pixels:lang'); if (s && SUPPORTED.indexOf(s) >= 0) return s; } catch (e) {}
    return 'ca';
  }
  function apply(l) {
    document.documentElement.lang = l;
    document.querySelectorAll('[data-lang-section]').forEach(function (s) { s.hidden = s.dataset.langSection !== l; });
    document.querySelectorAll('.langs button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.lang === l)); });
    var t = document.querySelector('section[data-lang-section="' + l + '"] [data-doc-title]');
    if (t) document.title = t.textContent + ' - pixels.noeba';
    document.querySelectorAll('[data-footer]').forEach(function (a) { a.textContent = FOOTER[l][a.dataset.footer] || a.textContent; });
  }
  document.querySelectorAll('.langs button').forEach(function (b) {
    b.addEventListener('click', function () {
      try { localStorage.setItem('pixels:lang', b.dataset.lang); } catch (e) {}
      apply(b.dataset.lang);
    });
  });
  apply(current());
})();
