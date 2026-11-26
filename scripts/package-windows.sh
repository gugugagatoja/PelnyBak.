#!/usr/bin/env bash
# Builds the portable Windows program in two versions (one folder "Szukaj w filmie" inside each):
#   desktop/dist/Szukaj-w-filmie-Windows-pelny.zip  - all AI models from models.js
#   desktop/dist/Szukaj-w-filmie-Windows-lekki.zip  - only the fast model (+ the translator)
# Run after scripts/prepare-offline.sh (with all models). Works on Linux.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/desktop"
rm -rf dist
npx electron-builder --win dir --x64 --publish never
cd dist
mv win-unpacked "Szukaj w filmie"
cat > "Szukaj w filmie/CZYTAJ MNIE.txt" <<'TXT'
SZUKAJ W FILMIE - program offline

1. Uruchom "Szukaj w filmie.exe" (dwuklik). Nie trzeba niczego instalować.
   Folder możesz trzymać na pendrivie i uruchamiać na dowolnym komputerze z Windows 10/11 (64-bit).
2. Jeśli Windows pokaże "System Windows ochronił ten komputer":
   kliknij "Więcej informacji", a potem "Uruchom mimo to".
3. Wybierz film (MP4 lub WebM), kliknij "Przeanalizuj film", opisz czego szukasz i kliknij "Szukaj".

Program działa bez internetu i blokuje wszelkie połączenia z siecią.
Model AI jest w folderze programu. Twoje filmy nigdzie nie są wysyłane.
Po zamknięciu programu jego pliki tymczasowe są kasowane. Wyniki analizy nie są zapisywane na dysku.
TXT
sed -i 's/$/\r/' "Szukaj w filmie/CZYTAJ MNIE.txt"   # Windows line endings for Notepad
zip -qr -9 Szukaj-w-filmie-Windows-pelny.zip "Szukaj w filmie"
# lite version: drop every model except the fast one
KEEP="$(node --input-type=module -e "const { MODELS, TRANSLATOR } = await import('$ROOT/models.js'); console.log(MODELS.fast.id + ' ' + TRANSLATOR.id)")"
MODELS_DIR="Szukaj w filmie/resources/app/app/models"
find "$MODELS_DIR" -mindepth 2 -maxdepth 2 -type d | while read -r d; do
  case " $KEEP " in *" ${d#$MODELS_DIR/} "*) ;; *) rm -rf "$d" ;; esac
done
find "$MODELS_DIR" -mindepth 1 -type d -empty -delete
zip -qr -9 Szukaj-w-filmie-Windows-lekki.zip "Szukaj w filmie"
ls -la Szukaj-w-filmie-Windows-*.zip
