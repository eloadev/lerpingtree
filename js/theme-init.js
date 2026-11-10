// Se carga ANTES que la página para que no "parpadee" el tema equivocado.
(function () {
  try {
    var t = localStorage.getItem('lerpo_theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* sin localStorage: se usa el tema del sistema */ }
})();
