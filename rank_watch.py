#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
rank_watch.py — Vigilante de posiciones Google (gl=co) para grupoalmadia.com.
Usa el Edge REAL de Windows vía CDP (cdp_driver.ps1, puerto 9445): Google no
bloquea un navegador real con sesión. Si Edge CDP no está corriendo, lo lanza.
Guarda histórico en rank_history_almadia.json y reporta por Telegram con deltas.
Cron: lunes 13:00 UTC (08:00 COT).
"""
import json, os, re, subprocess, time, urllib.request
from datetime import datetime, timezone

DOMAIN = "grupoalmadia.com"
HIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rank_history_almadia.json")
ENV_TG = "/home/caper_mata/arkea_quantum/mt5_bridge/.env"
PS = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"
DRIVER = r"C:\temp\cdp_driver.ps1"
SERP_JS_WIN = r"C:\temp\serp_query.js"
SERP_JS_WSL = "/mnt/c/temp/serp_query.js"
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

KEYWORDS = [
    "posicionamiento seo para pymes bogota",
    "agencia seo bogota pymes",
    "posicionamiento web pymes colombia",
    "como contratar con el estado colombia",
    "asesoria licitaciones estatales colombia",
    "asesoria secop ii",
    "que es secop ii y como participar",
    "como venderle al estado colombia",
    "ficha de google para empresas",
    "por que mi negocio no aparece en google",
    "pagina web para pymes bogota",
    "registro bases de datos sic rnbd",
    "correo suplantado spf dkim dmarc",
    "copias de seguridad para empresas bogota",
    "grupo empresarial almadia",
]

SERP_JS = """(() => {
  // 20-sep-2026 FIX: contar SOLO resultados organicos reales (enlace con <h3>).
  // Antes se contaban todos los <a> del bloque -> sitelinks y enlaces internos inflaban
  // la posicion (grupoalmadia salia #11 cuando en pantalla era el 3er resultado).
  const out=[]; const seen=new Set();
  document.querySelectorAll("div#search a[href^='http']").forEach(a=>{
    if(!a.querySelector('h3')) return;
    const m=a.href.match(/^https?:\\/\\/([^\\/]+)/); if(!m) return;
    let h=m[1].replace('www.','');
    if(h.includes('google.')) return;
    if(seen.has(h)) return;
    seen.add(h); out.push(h);
  });
  const pack=document.body.innerText.match(/Grupo Empresarial Almad/i);
  return JSON.stringify({hosts:out.slice(0,30), pack:!!pack, sorry:location.href.includes('/sorry/')});
})()"""


def ps(args, timeout=90):
    r = subprocess.run([PS, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", DRIVER] + args,
                       capture_output=True, text=True, timeout=timeout)
    return (r.stdout or "") + (r.stderr or "")


def cdp_alive():
    try:
        return urllib.request.urlopen("http://127.0.0.1:9445/json/version", timeout=5).status == 200
    except Exception:
        return False


def launch_edge():
    # MIGRACIÓN 29-ago-2026: el navegador es Chrome:9445 (lo mantiene vivo el guardián del bufete).
    # NO se relanza Edge: eran las dos pestañas que el dueño cerraba y volvían a abrirse.
    print("[migración] 9445 caído: no se relanza Edge"); return False


def tg(text):
    tok = chat = None
    try:
        for ln in open(ENV_TG):
            if ln.startswith("TG_TOKEN="): tok = ln.split("=", 1)[1].strip()
            if ln.startswith("TG_CHAT="): chat = ln.split("=", 1)[1].strip()
    except Exception:
        pass
    if not tok or not chat:
        print("(sin TG)\n" + text); return
    try:
        d = json.dumps({"chat_id": chat, "text": text, "parse_mode": "HTML",
                        "disable_web_page_preview": True}).encode()
        urllib.request.urlopen(urllib.request.Request(
            f"https://api.telegram.org/bot{tok}/sendMessage", data=d,
            headers={"Content-Type": "application/json"}), timeout=10)
    except Exception as e:
        print("TG fail:", e)


def query_all(kws):
    """16-sep-2026: reescrito. El driver PowerShell apuntaba al Edge 9333 retirado y buscaba con gl=co
    (Colombia) → desde el 31-ago todo salía «sin posición». Ahora Playwright sobre Chrome 9445, gl=co."""
    import asyncio
    from playwright.async_api import async_playwright
    async def run():
        out = {}
        async with async_playwright() as p:
            b = await p.chromium.connect_over_cdp("http://127.0.0.1:9445")
            pg = await b.contexts[0].new_page()
            try:
                for kw in kws:
                    url = f"https://www.google.com/search?q={urllib.request.quote(kw)}&gl=co&hl=es&num=30&pws=0"
                    try:
                        await pg.goto(url, wait_until="domcontentloaded", timeout=30000)
                        await pg.wait_for_timeout(3500)
                        out[kw] = json.loads(await pg.evaluate(SERP_JS))
                    except Exception as e:
                        print("err", kw, e); out[kw] = None
                    await pg.wait_for_timeout(5000)  # pausa humana entre búsquedas
            finally:
                await pg.close()
        return out
    return asyncio.run(run())


def main():
    if not cdp_alive():
        launch_edge()
        if not cdp_alive():
            tg("🎺 rank_watch mariachiportuguesa: Chrome CDP 9445 caído. Revisar.")
            return

    results = {}
    serps = query_all(KEYWORDS)
    for kw in KEYWORDS:
        d = serps.get(kw)
        if not d or d.get("sorry"):
            results[kw] = {"pos": None, "pack": False, "blocked": True}
        else:
            pos = None
            for j, h in enumerate(d.get("hosts", []), 1):
                if DOMAIN in h:
                    pos = j; break
            results[kw] = {"pos": pos, "pack": bool(d.get("pack")), "blocked": False}
        print(kw, results[kw])

    hist = {}
    if os.path.exists(HIST):
        try: hist = json.load(open(HIST))
        except Exception: hist = {}
    today = datetime.now(timezone.utc).date().isoformat()
    prev_key = max([k for k in hist if k < today], default=None)
    prev = hist.get(prev_key, {}) if prev_key else {}
    hist[today] = results
    json.dump(hist, open(HIST, "w"), indent=1)

    lines = [f"🏢 <b>Ranking {DOMAIN}</b> — {today} (semanal)"]
    blocked_n = 0
    for kw, r in results.items():
        if r["blocked"]:
            blocked_n += 1
            lines.append(f"⚠️ {kw}: sin datos"); continue
        p0 = (prev.get(kw) or {}).get("pos")
        cur = r["pos"]
        arrow = ""
        if p0 and cur: arrow = " 📈" if cur < p0 else (" 📉" if cur > p0 else " =")
        elif cur and not p0: arrow = " 🆕"
        pos_s = f"#{cur}" if cur else "–"
        pack_s = " | 🗺️" if r["pack"] else ""
        icon = "🟢" if (cur and cur <= 10) else ("🟡" if cur else "⚪")
        lines.append(f"{icon} {kw}: <b>{pos_s}</b>{arrow}{pack_s}")
    if blocked_n >= len(KEYWORDS) // 2:
        lines.append("\n⚠️ Mayoría de consultas sin datos — revisar Chrome CDP 9445.")
    lines.append("\n⚪=fuera del top30 · 🗺️=marca en mapa/resultados")
    tg("\n".join(lines))


if __name__ == "__main__":
    main()
