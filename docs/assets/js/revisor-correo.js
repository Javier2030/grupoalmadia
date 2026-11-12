/* grupoalmadia.com — revisor de suplantación de correo (12-nov-2026; multilingüe desde el 13-nov).
   Todo corre en el navegador del visitante: las consultas van directo a los resolutores DNS públicos
   de Google y de Cloudflare (DNS sobre HTTPS). Almadía no recibe ni guarda el dominio consultado.
   Solo se leen registros DNS públicos; no se toca ningún sistema del dominio revisado.
   El motor NO contiene textos: devuelve claves («spf.ausente») y datos; la interfaz las traduce con
   i18n_revisor/<idioma>.json. El mismo archivo se prueba en Node con pruebas_revisor.mjs. */
(function (raiz) {
  'use strict';

  var TIPO = { A: 1, NS: 2, CNAME: 5, MX: 15, TXT: 16, AAAA: 28, DS: 43, CAA: 257 };
  var RESOLUTORES = [
    function (n, t) { return { url: 'https://dns.google/resolve?name=' + encodeURIComponent(n) + '&type=' + t + '&do=1', cab: {} }; },
    function (n, t) { return { url: 'https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(n) + '&type=' + t + '&do=1', cab: { accept: 'application/dns-json' } }; }
  ];
  // Sufijos de dos niveles frecuentes: para hallar el dominio principal de un subdominio.
  var SUFIJOS2 = ('com.co net.co org.co edu.co gov.co mil.co nom.co com.ve co.ve net.ve org.ve com.mx org.mx gob.mx com.ar com.pe com.ec ' +
    'com.br com.es com.uy com.py com.bo com.gt com.sv com.hn com.ni com.pa com.do com.pr co.cr co.uk org.uk ac.uk gov.uk com.au net.au org.au co.nz co.za ' +
    'com.tr co.jp ne.jp or.jp co.in net.in org.in com.cn net.cn org.cn com.hk com.sg com.my co.id co.kr co.th com.tw com.ph com.vn co.il com.sa com.eg ' +
    'com.ng co.ke com.ua com.pl com.pt com.gr com.ru').split(' ');
  // Selectores DKIM habituales por proveedor. No existe forma de listar los selectores de un dominio.
  var SELECTORES = ('google selector1 selector2 default dkim mail k1 k2 k3 s1 s2 smtp key1 key2 zoho zmail mandrill mte1 resend brevo sib ' +
    'brevo1 brevo2 sig1 dkim1 ml ctct1 ctct2 zendesk1 zendesk2 mailchimp mesmtp everlytickey1 hostinger1 ' +
    'mailjet sendgrid amazonses mxvault cm pm krs dk fm1 fm2 fm3 protonmail protonmail2 protonmail3 titan1 hs1 hs2 mailo x 2024 2025 2026').split(' ');
  var PROVEEDORES = [
    [/google(mail)?\.com\.?$/i, 'Google Workspace'], [/outlook\.com\.?$|protection\.outlook/i, 'Microsoft 365'],
    [/zoho\./i, 'Zoho Mail'], [/porkbun\.com/i, 'Porkbun'], [/secureserver\.net/i, 'GoDaddy'],
    [/titan\.email/i, 'Titan'], [/hostinger/i, 'Hostinger'], [/protonmail|proton\.me/i, 'Proton Mail'],
    [/yandex/i, 'Yandex'], [/amazonaws\.com/i, 'Amazon SES'], [/mimecast/i, 'Mimecast'], [/pphosted|proofpoint/i, 'Proofpoint'],
    [/barracuda/i, 'Barracuda'], [/icloud\.com/i, 'iCloud'], [/improvmx/i, 'ImprovMX'], [/cloudflare\.net/i, 'Cloudflare Email Routing'],
    [/mailgun/i, 'Mailgun'], [/ovh\./i, 'OVH'], [/ionos|1and1|kundenserver/i, 'IONOS'], [/dreamhost/i, 'DreamHost'],
    [/bluehost/i, 'Bluehost'], [/hostgator|websitewelcome/i, 'HostGator'], [/namecheap|privateemail/i, 'Namecheap'], [/migadu/i, 'Migadu'],
    [/fastmail|messagingengine/i, 'Fastmail'], [/qq\.com/i, 'Tencent'], [/aliyun|alibaba|mxhichina/i, 'Alibaba Cloud'], [/trendmicro/i, 'Trend Micro'],
    [/mail\.ru/i, 'Mail.ru'], [/gandi\.net/i, 'Gandi'], [/strato/i, 'Strato'], [/aruba\.it/i, 'Aruba']
  ];

  function limpiarDominio(texto) {
    var d = String(texto || '').trim().toLowerCase();
    if (d.indexOf('@') > -1) d = d.slice(d.lastIndexOf('@') + 1);
    d = d.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/[\/?#].*$/, '').replace(/:\d+$/, '').replace(/\.$/, '');
    if (d.indexOf('www.') === 0 && d.split('.').length > 2) d = d.slice(4);
    try { d = new URL('http://' + d).hostname; } catch (e) { return null; }
    if (d.length > 253 || !/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/.test(d)) return null;
    if (/^\d+(\.\d+){3}$/.test(d)) return null;
    return d;
  }

  // Dominios de correo gratuito: los administra el proveedor; el usuario no puede cambiar nada en ellos.
  var GRATUITOS = ('gmail.com googlemail.com hotmail.com outlook.com live.com msn.com yahoo.com yahoo.es yahoo.com.mx yahoo.com.br yahoo.co.uk yahoo.fr yahoo.de ' +
    'ymail.com icloud.com me.com mac.com aol.com proton.me protonmail.com gmx.com gmx.de gmx.net web.de mail.com mail.ru yandex.ru yandex.com qq.com 163.com 126.com ' +
    'hotmail.es hotmail.fr hotmail.it hotmail.co.uk hotmail.de outlook.es outlook.fr outlook.de outlook.it live.com.mx live.fr live.it live.nl libero.it orange.fr ' +
    'free.fr laposte.net t-online.de uol.com.br bol.com.br terra.com.br naver.com zoho.com tutanota.com tuta.io rediffmail.com').split(' ');

  function dominioPrincipal(d) {
    var p = d.split('.');
    if (p.length <= 2) return d;
    var n = SUFIJOS2.indexOf(p.slice(-2).join('.')) > -1 ? 3 : 2;
    return p.slice(-n).join('.');
  }

  /** Un TXT puede venir entre comillas y partido en trozos de 255 caracteres: se unen. */
  function texto(dato) {
    var s = String(dato || '');
    if (s.indexOf('"') === -1) return s;
    var partes = s.match(/"((?:[^"\\]|\\.)*)"/g);
    return partes ? partes.map(function (x) { return x.slice(1, -1).replace(/\\(.)/g, '$1'); }).join('') : s;
  }

  function Consultor(traer) {
    var memoria = {}, total = 0;
    function una(i, nombre, tipo) {
      var r = RESOLUTORES[i](nombre, tipo);
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var reloj = ctrl ? setTimeout(function () { ctrl.abort(); }, 7000) : null;
      return traer(r.url, { headers: r.cab, signal: ctrl ? ctrl.signal : undefined }).then(function (x) {
        if (!x.ok) throw new Error('http ' + x.status);
        return x.json();
      }).then(function (j) {
        if (reloj) clearTimeout(reloj);
        if (typeof j.Status !== 'number') throw new Error('respuesta rara');
        if (j.Status === 2) throw new Error('servfail');
        return j;
      }, function (e) { if (reloj) clearTimeout(reloj); throw e; });
    }
    function dns(nombre, tipo) {
      var clave = nombre + '|' + tipo;
      if (memoria[clave]) return memoria[clave];
      total++;
      var t = TIPO[tipo];
      memoria[clave] = una(0, nombre, tipo).catch(function () { return una(1, nombre, tipo); }).then(function (j) {
        var resp = (j.Answer || []).filter(function (a) { return a.type === t; }).map(function (a) { return tipo === 'TXT' ? texto(a.data) : String(a.data); });
        return { existe: j.Status !== 3, autenticado: j.AD === true, datos: resp };
      });
      return memoria[clave];
    }
    dns.total = function () { return total; };
    return dns;
  }

  /** Hallazgo: la interfaz busca los textos en T.h[clave] (r = resumen, s = significa, h/h2 = qué hacer). */
  function hallazgo(id, max) { return { id: id, max: max, puntos: 0, estado: 'info', clave: '', datos: {}, hacer: 'h', avisos: [], registros: [] }; }
  function fijar(h, estado, puntos, clave, datos) { h.estado = estado; h.puntos = puntos; h.clave = clave; if (datos) h.datos = datos; return h; }

  /* ---------- SPF ---------- */
  function partirSpf(reg) {
    return reg.trim().split(/\s+/).slice(1).filter(Boolean).map(function (t) {
      var m = /^([+\-~?])?([a-z0-9]+)(?:[:=](.*))?$/i.exec(t.replace(/\/\d+(\/\/\d+)?$/, ''));
      return m ? { cal: m[1] || '+', mec: m[2].toLowerCase(), val: m[3] || '', crudo: t } : { cal: '+', mec: '?', val: '', crudo: t };
    });
  }

  function contarSpf(dns, dominio, vistos, cuenta) {
    if (vistos[dominio] || cuenta.n > 14) return Promise.resolve();
    vistos[dominio] = true;
    return dns(dominio, 'TXT').then(function (r) {
      var regs = r.datos.filter(function (x) { return /^v=spf1(\s|$)/i.test(x); });
      if (regs.length !== 1) { if (cuenta.n > 0) cuenta.rotos.push(dominio); return; }
      var cadena = Promise.resolve();
      partirSpf(regs[0]).forEach(function (t) {
        if (['include', 'a', 'mx', 'exists', 'redirect', 'ptr'].indexOf(t.mec) > -1) cuenta.n++;
        if ((t.mec === 'include' || t.mec === 'redirect') && t.val && t.val.indexOf('%') === -1)
          cadena = cadena.then(function () { return contarSpf(dns, t.val.toLowerCase().replace(/\.$/, ''), vistos, cuenta); });
      });
      return cadena;
    }).catch(function () { cuenta.dudas++; });
  }

  function revisarSpf(dns, d) {
    return dns(d, 'TXT').then(function (r) {
      var regs = r.datos.filter(function (x) { return /^v=spf1(\s|$)/i.test(x); });
      var h = hallazgo('spf', 25); h.registros = regs;
      if (!regs.length) return fijar(h, 'falla', 0, 'spf.ausente');
      if (regs.length > 1) return fijar(h, 'falla', 4, 'spf.multiple', { n: regs.length });
      var t = partirSpf(regs[0]);
      var all = t.filter(function (x) { return x.mec === 'all'; })[0];
      var redir = t.filter(function (x) { return x.mec === 'redirect'; })[0];
      var cuenta = { n: 0, rotos: [], dudas: 0 };
      return contarSpf(dns, d, {}, cuenta).then(function () {
        h.consultas = cuenta.n;
        if (cuenta.n > 10) return fijar(h, 'falla', 5, 'spf.exceso', { n: cuenta.n });
        if (all && all.cal === '+') { h.abierto = true; return fijar(h, 'falla', 0, 'spf.abierto'); }
        if (cuenta.rotos.length) return fijar(h, 'falla', 5, 'spf.roto', { d: cuenta.rotos[0] });
        if (t.some(function (x) { return x.mec === 'ptr'; })) h.avisos.push(['spf.a_ptr']);
        if (t.some(function (x) { return x.mec === '?'; })) h.avisos.push(['spf.a_desconocido']);
        if (cuenta.n >= 9) h.avisos.push(['spf.a_limite', { n: cuenta.n }]);
        if (!all && !redir) return fijar(h, 'aviso', 10, 'spf.sin_cierre');
        if (all && all.cal === '?') return fijar(h, 'aviso', 10, 'spf.neutro');
        if (h.avisos.length) h.hacer = 'h2';
        return fijar(h, h.avisos.length ? 'aviso' : 'ok', h.avisos.length ? 19 : 25, all && all.cal === '-' ? 'spf.ok_duro' : all ? 'spf.ok_suave' : 'spf.ok_redirect');
      });
    });
  }

  /* ---------- DMARC ---------- */
  function etiquetas(reg) {
    var o = {};
    reg.split(';').forEach(function (p) { var i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim().toLowerCase()] = p.slice(i + 1).trim(); });
    return o;
  }

  function revisarDmarc(dns, d) {
    var principal = dominioPrincipal(d);
    var es = function (x) { return /^v=dmarc1(\s*;|\s*$)/i.test(x); };
    return dns('_dmarc.' + d, 'TXT').then(function (r) {
      var regs = r.datos.filter(es);
      if (regs.length || principal === d) return { regs: regs, heredado: false };
      return dns('_dmarc.' + principal, 'TXT').then(function (r2) { return { regs: r2.datos.filter(es), heredado: true }; });
    }).then(function (x) {
      var h = hallazgo('dmarc', 45); h.registros = x.regs; h.pct = 100;
      if (!x.regs.length) { h.politica = 'ausente'; return fijar(h, 'falla', 0, 'dmarc.ausente', { d: d }); }
      if (x.regs.length > 1) { h.politica = 'invalida'; return fijar(h, 'falla', 0, 'dmarc.multiple', { n: x.regs.length }); }
      var e = etiquetas(x.regs[0]);
      var p = (e.p || '').toLowerCase();
      var efectiva = x.heredado ? (e.sp || e.p || '').toLowerCase() : p;
      var pct = e.pct === undefined ? 100 : parseInt(e.pct, 10);
      if (isNaN(pct)) pct = 100;
      h.heredado = x.heredado; h.pct = pct; h.informes = !!e.rua;
      if (['none', 'quarantine', 'reject'].indexOf(efectiva) === -1) { h.politica = 'invalida'; return fijar(h, 'falla', 0, 'dmarc.invalida'); }
      h.politica = efectiva;
      if (x.heredado) h.avisos.push(['dmarc.a_heredado', { d: principal }]);
      if (!e.rua) h.avisos.push(['dmarc.a_sin_rua']);
      if (!x.heredado && e.sp && e.sp.toLowerCase() === 'none' && p !== 'none') { h.subdominios = true; h.avisos.push(['dmarc.a_sp', { d: d }]); }
      if (efectiva !== 'none' && pct < 100) h.avisos.push(['dmarc.a_pct', { n: pct }]);
      if (efectiva !== 'none' && (e.t || '').toLowerCase() === 'y') { h.prueba = true; h.avisos.push(['dmarc.a_prueba']); }
      var serios = h.avisos.filter(function (a) { return a[0] !== 'dmarc.a_heredado'; }).length;
      if (efectiva === 'none') { if (!e.rua) h.hacer = 'h2'; return fijar(h, 'falla', 10, 'dmarc.none', { d: d }); }
      if (efectiva === 'quarantine') return fijar(h, 'aviso', pct < 100 || h.prueba ? 26 : 34, 'dmarc.quarantine');
      if (serios) h.hacer = 'h2';
      return fijar(h, serios ? 'aviso' : 'ok', pct < 100 || h.prueba ? 36 : (serios ? 41 : 45), 'dmarc.reject');
    });
  }

  /* ---------- DKIM ---------- */
  function revisarDkim(dns, d, propio) {
    var h = hallazgo('dkim', 15);
    var lista = propio && SELECTORES.indexOf(propio) === -1 ? [propio].concat(SELECTORES) : SELECTORES;
    return Promise.all([
      dns('_domainkey.' + d, 'TXT').then(function (r) { return r.existe; }, function () { return null; }),
      Promise.all(lista.map(function (s) {
        return dns(s + '._domainkey.' + d, 'TXT').then(function (r) {
          var k = r.datos.filter(function (x) { return /(^|;)\s*p=/i.test(x) || /^v=dkim1/i.test(x); })[0];
          return k ? { selector: s, registro: k } : null;
        }, function () { return null; });
      }))
    ]).then(function (res) {
      var rama = res[0], halladas = res[1].filter(Boolean);
      if (halladas.length) {
        var cortas = 0, anuladas = 0;
        halladas.forEach(function (k) {
          var m = /(^|;)\s*p=([^;]*)/i.exec(k.registro);
          var llave = m ? m[2].replace(/\s+/g, '') : '';
          if (!llave) anuladas++;
          else if (!/k=ed25519/i.test(k.registro) && llave.length < 300) cortas++;
          h.registros.push(k.selector + '._domainkey → ' + (k.registro.length > 90 ? k.registro.slice(0, 90) + '…' : k.registro));
        });
        h.selectores = halladas.map(function (k) { return k.selector; });
        var vivas = halladas.length - anuladas;
        if (!vivas) return fijar(h, 'aviso', 5, 'dkim.anuladas');
        if (cortas) { h.hacer = 'h2'; h.avisos.push(cortas === 1 ? ['dkim.a_corta1'] : ['dkim.a_cortas', { n: cortas }]); }
        return fijar(h, cortas ? 'aviso' : 'ok', cortas ? 12 : 15, vivas === 1 ? 'dkim.ok1' : 'dkim.ok', { n: vivas, sel: h.selectores.join(', ') });
      }
      if (rama === true) return fijar(h, 'info', 11, 'dkim.oculto', { n: SELECTORES.length });
      return fijar(h, 'aviso', rama === false ? 0 : 5, rama === false ? 'dkim.ninguna' : 'dkim.no_hallada');
    });
  }

  /* ---------- MX y capas adicionales ---------- */
  function revisarMx(dns, d) {
    return dns(d, 'MX').then(function (r) {
      var mx = r.datos.map(function (x) { return x.replace(/^\d+\s+/, '').replace(/\.$/, ''); }).filter(Boolean);
      var h = hallazgo('mx', 0); h.registros = r.datos;
      var nulo = r.datos.length === 1 && /^0\s+\.?$/.test(r.datos[0].trim());
      if (!mx.length || nulo) { h.recibe = false; return fijar(h, 'info', 0, nulo ? 'mx.nulo' : 'mx.sin'); }
      var prov = null;
      PROVEEDORES.some(function (p) { if (mx.some(function (m) { return p[0].test(m); })) { prov = p[1]; return true; } return false; });
      h.recibe = true; h.proveedor = prov;
      return fijar(h, 'info', 0, prov ? 'mx.prov' : (mx.length === 1 ? 'mx.uno' : 'mx.varios'), { p: prov || '', n: mx.length, d: mx[0] });
    });
  }

  function revisarExtras(dns, d) {
    var txt = function (n, patron) { return dns(n, 'TXT').then(function (r) { return r.datos.filter(function (x) { return patron.test(x); }); }, function () { return []; }); };
    return Promise.all([
      dns(d, 'A').then(function (r) { return r; }, function () { return { autenticado: false, datos: [] }; }),
      txt('_mta-sts.' + d, /^v=STSv1/i), txt('_smtp._tls.' + d, /^v=TLSRPTv1/i),
      dns(d, 'CAA').then(function (r) { return r.datos; }, function () { return []; }),
      txt('default._bimi.' + d, /^v=BIMI1/i)
    ]).then(function (x) {
      var a = hallazgo('dnssec', 5); fijar(a, x[0].autenticado ? 'ok' : 'info', x[0].autenticado ? 5 : 0, x[0].autenticado ? 'dnssec.si' : 'dnssec.no');
      var b = hallazgo('transporte', 7); b.registros = x[1].concat(x[2]);
      fijar(b, x[1].length ? 'ok' : 'info', (x[1].length ? 5 : 0) + (x[2].length ? 2 : 0), x[1].length ? (x[2].length ? 'transporte.si_rpt' : 'transporte.si') : 'transporte.no');
      var c = hallazgo('caa', 3); c.registros = x[3]; fijar(c, x[3].length ? 'ok' : 'info', x[3].length ? 3 : 0, x[3].length ? 'caa.si' : 'caa.no');
      var e = hallazgo('bimi', 0); e.registros = x[4]; fijar(e, x[4].length ? 'ok' : 'info', 0, x[4].length ? 'bimi.si' : 'bimi.no');
      return [a, b, c, e];
    });
  }

  /* ---------- Veredicto ---------- */
  function veredicto(dmarc, spf) {
    var pol = dmarc.politica;
    if (pol === 'ausente' || pol === 'invalida') return { nivel: 'alto', clave: 'alto_sin' };
    if (pol === 'none') return { nivel: 'alto', clave: 'alto_none' };
    if (pol === 'quarantine' || dmarc.pct < 100 || dmarc.prueba === true || spf.abierto === true || dmarc.subdominios === true) return { nivel: 'medio', clave: 'medio' };
    return { nivel: 'bajo', clave: 'bajo' };
  }

  function nota(p) { return p >= 90 ? 'A' : p >= 75 ? 'B' : p >= 55 ? 'C' : p >= 35 ? 'D' : 'E'; }

  /**
   * Revisa un dominio. `alAvanzar(hecho, total)` es opcional.
   * Devuelve { dominio, fecha, veredicto:{nivel,clave}, puntos, nota, hallazgos[], consultas }.
   */
  function revisar(entrada, opciones) {
    opciones = opciones || {};
    var d = limpiarDominio(entrada);
    if (!d) return Promise.reject(new Error('dominio-invalido'));
    if (GRATUITOS.indexOf(d) > -1) return Promise.reject(new Error('dominio-gratuito'));
    var sel = String(opciones.selector || '').trim().toLowerCase().replace(/\._domainkey.*$/, '');
    if (!/^[a-z0-9]([a-z0-9._-]{0,61}[a-z0-9])?$/.test(sel)) sel = '';
    var traer = opciones.fetch || (typeof fetch !== 'undefined' ? fetch.bind(raiz) : null);
    if (!traer) return Promise.reject(new Error('sin-fetch'));
    var dns = Consultor(traer);
    var hecho = 0;
    var paso = function (p) { return p.then(function (x) { hecho++; if (opciones.alAvanzar) opciones.alAvanzar(hecho, 5); return x; }); };
    return dns(d, 'NS').then(function (ns) {
      return ns.existe ? ns : dns(d, 'A');
    }).then(function (base) {
      if (!base.existe) throw new Error('dominio-inexistente');
      return Promise.all([paso(revisarMx(dns, d)), paso(revisarSpf(dns, d)), paso(revisarDmarc(dns, d)), paso(revisarDkim(dns, d, sel)), paso(revisarExtras(dns, d))]);
    }).then(function (r) {
      var hallazgos = [r[2], r[1], r[3]].concat(r[4], [r[0]]);
      var puntos = 0, max = 0;
      hallazgos.forEach(function (x) { puntos += x.puntos; max += x.max; });
      var total = Math.round(100 * puntos / max);
      return { dominio: d, principal: dominioPrincipal(d), fecha: new Date().toISOString(), veredicto: veredicto(r[2], r[1]), puntos: total, nota: nota(total),
        hallazgos: hallazgos, consultas: dns.total() };
    });
  }

  var api = { revisar: revisar, limpiarDominio: limpiarDominio, dominioPrincipal: dominioPrincipal, texto: texto, partirSpf: partirSpf, etiquetas: etiquetas, nota: nota, SELECTORES: SELECTORES, GRATUITOS: GRATUITOS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.RevisorCorreo = api;
})(typeof window !== 'undefined' ? window : globalThis);
