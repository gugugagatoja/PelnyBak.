#!/usr/bin/env bash
# Builds the portable Windows program into desktop/dist/Szukaj-w-filmie-Windows.zip
# (one folder "Szukaj w filmie" inside). Run after scripts/prepare-offline.sh. Works on Linux.
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
TXT
sed -i 's/$/\r/' "Szukaj w filmie/CZYTAJ MNIE.txt"   # Windows line endings for Notepad
zip -qr -9 Szukaj-w-filmie-Windows.zip "Szukaj w filmie"
ls -la Szukaj-w-filmie-Windows.zip
