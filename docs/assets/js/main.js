/* grupoalmadia.com — 1,2 KB de JS. Menú, sombra de cabecera y revelado al hacer scroll. */
(function () {
  'use strict';

  var hdr = document.querySelector('.hdr');
  var nav = document.getElementById('nav');
  var burger = document.getElementById('burger');

  if (burger && nav) {
    burger.addEventListener('click', function () {
      var abierto = nav.classList.toggle('abierto');
      burger.setAttribute('aria-expanded', abierto ? 'true' : 'false');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        nav.classList.remove('abierto');
        burger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // La cabecera solo dibuja su línea cuando ya se bajó: menos ruido arriba del todo.
  if (hdr) {
    var marcar = function () { hdr.classList.toggle('fija', window.scrollY > 8); };
    marcar();
    addEventListener('scroll', marcar, { passive: true });
  }

  // Revelado progresivo. Si el navegador no trae IntersectionObserver, todo queda visible.
  var objetivos = document.querySelectorAll('.rev');
  if (!('IntersectionObserver' in window)) {
    for (var i = 0; i < objetivos.length; i++) objetivos[i].classList.add('visto');
    return;
  }
  var obs = new IntersectionObserver(function (entradas) {
    entradas.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('visto'); obs.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  objetivos.forEach(function (el) { obs.observe(el); });
})();
