#!/bin/bash
# Pide indexación en GSC de las páginas de Almadía que falten (cuota ~10/día).
cd /mnt/c/temp || exit 1
PS=/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe
LISTA="https://grupoalmadia.com/
https://grupoalmadia.com/servicios/posicionamiento-seo-para-pymes/
https://grupoalmadia.com/servicios/ficha-de-google-para-empresas/
https://grupoalmadia.com/servicios/como-contratar-con-el-estado-colombia/
https://grupoalmadia.com/proteccion-digital/
https://grupoalmadia.com/servicios-digitales/
https://grupoalmadia.com/servicios/correo-suplantado-spf-dkim-dmarc/
https://grupoalmadia.com/servicios/registro-bases-de-datos-sic-rnbd/
https://grupoalmadia.com/servicios/pagina-web-para-pymes/
https://grupoalmadia.com/servicios/copias-de-seguridad-para-empresas/
https://grupoalmadia.com/licitaciones/
https://grupoalmadia.com/licitaciones/guia-como-venderle-al-estado/
https://grupoalmadia.com/servicios/que-es-secop-ii-y-como-participar/
https://grupoalmadia.com/servicios/por-que-mi-negocio-no-aparece-en-google/
https://grupoalmadia.com/empresas/
https://grupoalmadia.com/en/packages/
https://grupoalmadia.com/pt/packages/
https://grupoalmadia.com/fr/packages/
https://grupoalmadia.com/de/packages/
https://grupoalmadia.com/it/packages/
https://grupoalmadia.com/nl/packages/
https://grupoalmadia.com/ru/packages/
https://grupoalmadia.com/zh/packages/
https://grupoalmadia.com/ja/packages/
https://grupoalmadia.com/ar/packages/
https://grupoalmadia.com/hi/packages/
https://grupoalmadia.com/tr/packages/"
HECHO=/home/caper_mata/grupoalmadia/.indexadas.txt
touch $HECHO
# Abre una pestaña GSC de la propiedad correcta (el PS1 toma la primera search-console de la lista).
TABID=$(curl -s -X PUT "http://127.0.0.1:9445/json/new?https%3A%2F%2Fsearch.google.com%2Fsearch-console%2Fperformance%2Fsearch-analytics%3Fresource_id%3Dhttps%253A%252F%252Fgrupoalmadia.com%252F" | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4)
sleep 20
for u in $LISTA; do
  grep -qx "$u" $HECHO && continue
  r=$(timeout 280 $PS -NoProfile -ExecutionPolicy Bypass -File 'C:\temp\gsc_turbo_9445_forzar.ps1' -Target "$u" 2>&1 | tr -d '\r')
  echo "$(date +%F) $u $(echo "$r" | grep -Eo 'SOLICITADA=[A-Za-z]+|CUOTA_AGOTADA' | tr '\n' ' ')" >> /home/caper_mata/grupoalmadia/indexacion.log
  echo "$r" | grep -q "SOLICITADA=True" && echo "$u" >> $HECHO
  echo "$r" | grep -q "CUOTA_AGOTADA" && break
done
[ -n "$TABID" ] && curl -s "http://127.0.0.1:9445/json/close/$TABID" >/dev/null
