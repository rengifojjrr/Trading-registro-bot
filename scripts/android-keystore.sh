#!/usr/bin/env bash
#
# Genera la clave con la que se firma el APK, una sola vez en la vida.
#
# Lo que hay que entender antes de ejecutarlo: **esta clave no se puede
# perder ni cambiar**. Android identifica una aplicación por su firma, así que
# un APK firmado con otra clave no es una actualización de este -- es otra
# aplicación distinta, y para instalarla hay que desinstalar la anterior
# perdiendo lo que hubiera.
#
# Por eso el archivo que sale de aquí:
#   - NO va al repositorio (está en .gitignore).
#   - Va a los secretos de GitHub, en base64.
#   - Conviene guardar una copia donde guardes las cosas que no se pueden
#     volver a generar.
#
# Uso:
#   ./scripts/android-keystore.sh
#
# Pide una contraseña y escribe el almacén, su versión en base64 lista para
# pegar en GitHub, y la huella que hay que poner en Vercel.
set -euo pipefail

SALIDA="${1:-android-firma.keystore}"
ALIAS="${ANDROID_KEY_ALIAS:-registro}"

if [ -f "$SALIDA" ]; then
  echo "Ya existe $SALIDA. No se sobrescribe: perderías la clave con la que ya"
  echo "firmaste, y con ella la posibilidad de actualizar el APK instalado."
  exit 1
fi

echo "Se va a generar la clave de firma del APK."
echo "Guárdala: no se puede regenerar ni sustituir."
echo
read -r -s -p "Contraseña para la clave (no se ve al escribir): " CLAVE
echo
read -r -s -p "Repítela: " CLAVE2
echo

if [ "$CLAVE" != "$CLAVE2" ]; then
  echo "No coinciden."
  exit 1
fi
if [ ${#CLAVE} -lt 8 ]; then
  echo "Demasiado corta: mínimo ocho caracteres. Android rechaza menos."
  exit 1
fi

# 10.000 días son unos 27 años. Una clave que caduca es un APK que deja de
# poder actualizarse el día que caduca, y nadie se acuerda de eso a tiempo.
keytool -genkeypair \
  -alias "$ALIAS" \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000 \
  -keystore "$SALIDA" \
  -storepass "$CLAVE" \
  -keypass "$CLAVE" \
  -dname "CN=Trading Registro Bot, OU=Personal, O=Personal, L=Bogota, C=CO"

echo
echo "Listo: $SALIDA"
echo
echo "──────────────────────────────────────────────────────────────────"
echo "1. En GitHub → Settings → Secrets and variables → Actions, crea:"
echo
echo "   ANDROID_KEYSTORE_BASE64   (el bloque de abajo, entero)"
echo "   ANDROID_KEYSTORE_PASSWORD (la contraseña que acabas de poner)"
echo "   ANDROID_KEY_PASSWORD      (la misma)"
echo "   ANDROID_KEY_ALIAS         $ALIAS"
echo "──────────────────────────────────────────────────────────────────"
echo
base64 -w0 "$SALIDA"
echo
echo
echo "──────────────────────────────────────────────────────────────────"
echo "2. En Vercel, variable de entorno ANDROID_CERT_FINGERPRINTS:"
echo "──────────────────────────────────────────────────────────────────"
keytool -list -v -keystore "$SALIDA" -alias "$ALIAS" -storepass "$CLAVE" \
  | grep 'SHA256:' | head -1 | sed 's/.*SHA256: *//'
echo
echo "Sin esa variable el APK funciona, pero se abre con la barra de"
echo "direcciones del navegador encima."
