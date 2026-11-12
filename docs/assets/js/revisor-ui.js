/* grupoalmadia.com — interfaz del revisor de suplantación de correo (12-nov-2026; multilingüe 13-nov).
   Los textos vienen de window.RevisorTextos (i18n_revisor/<idioma>.json, bloque «tool»), que la página incrusta.
   Todo lo que viene del DNS se trata como texto de un tercero: se escribe con textContent, nunca como HTML. */
(function () {
  'use strict';
  var R = window.RevisorCorreo, T = window.RevisorTextos, raiz = document.getElementById('rv');
  if (!R || !T || !raiz) return;
  var $ = function (id) { return document.getElementById(id); };
  var form = $('rv-form'), campo = $('rv-dominio'), boton = $('rv-boton'), aviso = $('rv-aviso'),
    selector = $('rv-selector'), progreso = $('rv-progreso'), barra = $('rv-barra'), etapa = $('rv-etapa'), caja = $('rv-resultado');
  var TEL = raiz.getAttribute('data-wa'), BASE = raiz.getAttribute('data-url'), IDIOMA = document.documentElement.lang || 'es';
  var ICONO = { ok: '✓', aviso: '!', falla: '✕', info: 'i' };
  var ERRORES = { 'dominio-invalido': T.err.invalido, 'dominio-inexistente': T.err.inexistente, 'dominio-gratuito': T.err.gratuito, 'sin-fetch': T.err.fetch };
  var enCurso = false;

  /** Sustituye {n}, {d}, {p}, {sel}… por los datos del hallazgo. */
  function tx(plantilla, datos) {
    return String(plantilla || '').replace(/\{(\w+)\}/g, function (m, k) { return datos && datos[k] !== undefined ? datos[k] : m; });
  }

  function el(etiqueta, clase, texto) {
    var n = document.createElement(etiqueta);
    if (clase) n.className = clase;
    if (texto !== undefined && texto !== null) n.textContent = texto;
    return n;
  }

  function anillo(puntos, nivel) {
    var ns = 'http://www.w3.org/2000/svg', r = 52, largo = 2 * Math.PI * r;
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 120 120'); svg.setAttribute('class', 'rv-anillo rv-' + nivel); svg.setAttribute('aria-hidden', 'true');
    [['rv-pista', largo], ['rv-arco', largo * (1 - puntos / 100)]].forEach(function (c, i) {
      var o = document.createElementNS(ns, 'circle');
      o.setAttribute('cx', 60); o.setAttribute('cy', 60); o.setAttribute('r', r); o.setAttribute('class', c[0]);
      if (i) { o.setAttribute('stroke-dasharray', largo); o.setAttribute('stroke-dashoffset', largo); o.setAttribute('transform', 'rotate(-90 60 60)');
        requestAnimationFrame(function () { requestAnimationFrame(function () { o.setAttribute('stroke-dashoffset', c[1]); }); }); }
      svg.appendChild(o);
    });
    var t = document.createElementNS(ns, 'text');
    t.setAttribute('x', 60); t.setAttribute('y', 58); t.setAttribute('class', 'rv-num'); t.textContent = puntos;
    var s = document.createElementNS(ns, 'text');
    s.setAttribute('x', 60); s.setAttribute('y', 78); s.setAttribute('class', 'rv-de'); s.textContent = T.ui.de100;
    svg.appendChild(t); svg.appendChild(s);
    return svg;
  }

  function mensajeWa(r) {
    var faltas = r.hallazgos.filter(function (h) { return h.estado === 'falla' || h.estado === 'aviso'; }).map(function (h) { return h.id === 'transporte' ? 'MTA-STS' : h.id.toUpperCase(); });
    return (r.veredicto.nivel === 'bajo' ? T.wa.msg_bajo : T.wa.msg) + '\n' + T.wa.dominio + ': ' + r.dominio + '\n' +
      T.wa.resultado + ': ' + T.ui.riesgo[r.veredicto.nivel] + ', ' + r.puntos + '/100 (' + r.nota + ')' +
      (faltas.length ? '\n' + T.wa.corregir + ': ' + faltas.join(', ') : '') + '\n[' + IDIOMA + ']';
  }

  function pintar(r) {
    caja.textContent = '';
    var v = r.veredicto, V = T.v[v.clave];
    var cab = el('div', 'rv-veredicto rv-' + v.nivel);
    var izq = el('div', 'rv-ver-texto');
    izq.appendChild(el('span', 'rv-chapa', T.ui.riesgo[v.nivel]));
    var h = el('h2', '', V.t); h.id = 'rv-titulo'; h.tabIndex = -1; izq.appendChild(h);
    var dom = el('p', 'rv-dom', r.dominio); dom.dir = 'ltr'; izq.appendChild(dom);
    izq.appendChild(el('p', '', V.x));
    var der = el('div', 'rv-ver-nota');
    der.appendChild(anillo(r.puntos, v.nivel));
    der.appendChild(el('p', 'rv-letra', tx(T.ui.calif, { n: r.nota })));
    cab.appendChild(izq); cab.appendChild(der);
    caja.appendChild(cab);

    var acc = el('div', 'rv-acciones');
    var wa = el('a', 'btn btn-p', v.nivel === 'bajo' ? T.ui.btn_wa_bajo : T.ui.btn_wa);
    wa.href = 'https://wa.me/' + TEL + '?text=' + encodeURIComponent(mensajeWa(r)); wa.rel = 'noopener';
    var imp = el('button', 'btn btn-g', T.ui.btn_imp); imp.type = 'button';
    imp.addEventListener('click', function () { window.print(); });
    var enlace = BASE + '?d=' + encodeURIComponent(r.dominio);
    var cop = el('button', 'btn btn-g', T.ui.btn_cop); cop.type = 'button';
    cop.addEventListener('click', function () {
      var listo = function () { cop.textContent = T.ui.copiado; setTimeout(function () { cop.textContent = T.ui.btn_cop; }, 2200); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(enlace).then(listo, function () { window.prompt(T.ui.copie, enlace); });
      else window.prompt(T.ui.copie, enlace);
    });
    acc.appendChild(wa); acc.appendChild(imp); acc.appendChild(cop);
    caja.appendChild(acc);

    var orden = { falla: 0, aviso: 1, ok: 2, info: 3 };
    var lista = el('div', 'rv-lista');
    r.hallazgos.slice().sort(function (a, b) { return (orden[a.estado] - orden[b.estado]) || (b.max - a.max); }).forEach(function (x) {
      var H = T.h[x.clave] || {};
      var d = el('details', 'rv-item rv-e-' + x.estado);
      if (x.estado === 'falla' || x.estado === 'aviso') d.open = true;
      var s = el('summary');
      var ic = el('span', 'rv-ic', ICONO[x.estado]); ic.setAttribute('aria-hidden', 'true');
      var cu = el('span', 'rv-sum');
      cu.appendChild(el('span', 'rv-nom', T.n[x.id]));
      cu.appendChild(el('span', 'rv-res', tx(H.r, x.datos)));
      s.appendChild(ic); s.appendChild(cu); s.appendChild(el('span', 'rv-rot', T.ui.rotulo[x.estado]));
      d.appendChild(s);
      var c = el('div', 'rv-cuerpo');
      if (H.s) { c.appendChild(el('h3', '', T.ui.significa)); c.appendChild(el('p', '', tx(H.s, x.datos))); }
      if (x.avisos.length) { var ul = el('ul', 'rv-avisos'); x.avisos.forEach(function (a) { ul.appendChild(el('li', '', tx(T.a[a[0]], a[1]))); }); c.appendChild(ul); }
      var hacer = H[x.hacer] || H.h;
      if (hacer) { c.appendChild(el('h3', '', T.ui.hacer)); c.appendChild(el('p', '', tx(hacer, x.datos))); }
      if (x.registros.length) {
        c.appendChild(el('h3', '', T.ui.publica));
        x.registros.forEach(function (g) { var k = el('code', 'rv-reg', g); k.dir = 'ltr'; c.appendChild(k); });
      }
      d.appendChild(c); lista.appendChild(d);
    });
    caja.appendChild(lista);
    var f = new Date(r.fecha), fecha;
    try { fecha = f.toLocaleString(IDIOMA, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { fecha = f.toISOString().slice(0, 16).replace('T', ' '); }
    caja.appendChild(el('p', 'rv-pie', tx(T.ui.pie, { f: fecha, n: r.consultas })));
    caja.hidden = false;
    caja.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    h.focus({ preventScroll: true });
  }

  function decir(texto, error) { aviso.textContent = texto || ''; aviso.className = 'rv-aviso' + (error ? ' rv-error' : ''); }

  function ejecutar(valor, deUrl) {
    if (enCurso) return;
    var d = R.limpiarDominio(valor);
    if (!d) { decir(T.err.invalido, true); caja.hidden = true; campo.focus(); return; }
    enCurso = true; campo.value = d; boton.disabled = true; boton.textContent = T.ui.revisando;
    decir(''); caja.hidden = true; progreso.hidden = false; barra.style.width = '6%'; etapa.textContent = T.ui.buscando;
    R.revisar(d, { selector: selector ? selector.value : '', alAvanzar: function (hecho, total) { barra.style.width = Math.round(100 * hecho / total) + '%'; etapa.textContent = hecho < total ? T.ui.pasos[hecho] + '…' : T.ui.listo; } })
      .then(function (r) {
        pintar(r);
        try { if (!deUrl) history.replaceState(null, '', '?d=' + encodeURIComponent(r.dominio)); } catch (e) { /* sin historial */ }
      }, function (e) {
        decir(ERRORES[e && e.message] || T.err.red, true);
      }).then(function () { enCurso = false; progreso.hidden = true; boton.disabled = false; boton.textContent = T.ui.revisar; });
  }

  form.addEventListener('submit', function (e) { e.preventDefault(); ejecutar(campo.value, false); });
  var inicial = null;
  try { inicial = new URLSearchParams(location.search).get('d'); } catch (e) { /* sin URLSearchParams */ }
  if (inicial) ejecutar(inicial, true);
})();
