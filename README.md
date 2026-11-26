# Szukaj w filmie

Aplikacja na telefon: wgrywasz filmik, opisujesz słowami, czego szukasz (np. *„osoba w czerwonej czapce, która odchodzi”*), a aplikacja pokazuje momenty filmu, które najlepiej pasują do opisu.

**Wszystko działa na telefonie, offline.** Film nigdzie nie jest wysyłany. Za pierwszym razem aplikacja pobiera model AI (ok. 90 MB), potem działa bez internetu.

## Jak to działa

1. Aplikacja co 0,5–5 s wyciąga z filmu klatkę (szerokie kadry dzieli na kwadratowe fragmenty, żeby nic nie umknęło).
2. Model AI [CLIP](https://openai.com/research/clip) zamienia każdą klatkę na „odcisk” opisujący, co na niej widać. Ten krok trwa najdłużej i robi się go raz na film.
3. Twój opis jest tłumaczony na angielski (wbudowany słownik, offline; tłumaczenie możesz poprawić ręcznie) i zamieniany na taki sam „odcisk”.
4. Aplikacja porównuje opis z każdą klatką i pokazuje najlepsze momenty oraz wykres dopasowania. Kliknięcie wyniku przewija film.

Po jednej analizie filmu możesz szukać dowolnie wiele razy, a każde wyszukiwanie trwa chwilę.

## Długie nagrania z kamery (np. 4 godziny)

- Zostaw zaznaczone **„Pomijaj fragmenty bez ruchu”**. Program porównuje kolejne klatki i uruchamia AI tylko tam, gdzie coś się zmieniło. Przy kamerze, która stoi w miejscu, to zwykle mała część nagrania, więc analiza jest wielokrotnie szybsza.
- Co minutę AI i tak sprawdza obraz (na wypadek zmiany światła).
- Podczas analizy ekran się nie wygasza. Analizę można **zatrzymać** w dowolnym momencie i szukać w już sprawdzonej części.
- Czas wyników jest w formacie godz:min:sek, np. `2:03:15`.

## Ograniczenia

- Model ocenia **pojedyncze klatki**, więc dobrze rozpoznaje wygląd (kolory, ubrania, przedmioty, miejsca), a ruch („odchodzi”, „biegnie”) słabiej. Słowo „odchodzi” jest tłumaczone na „widziany od tyłu”, co zwykle pomaga.
- Polski słownik jest prosty. Jeśli tłumaczenie wyjdzie dziwne, popraw pole „Zapytanie dla AI”: angielski działa najlepiej.
- Analiza długich filmów na telefonie trwa: zwykle 0,3–1 s na klatkę. Dla długich nagrań wybierz rzadsze klatki (2–5 s).

## Instalacja na telefonie (Android) i w przeglądarce

1. Otwórz w Chrome: **https://gugugagatoja.github.io/PelnyBak./**
2. Menu ⋮ → **Zainstaluj aplikację** (na komputerze: ikonka instalacji w pasku adresu).
3. Za pierwszym razem, przy Wi-Fi, przeanalizuj dowolny film, żeby pobrał się model AI. Potem aplikacja działa offline.

Strona jest publikowana z tej gałęzi (Settings → Pages → Deploy from a branch).

## Program dla Windows (offline, z pendrive'a)

Program z wbudowanym modelem AI. Nie trzeba go instalować ani łączyć z internetem.

1. Pobierz **Szukaj-w-filmie-Windows.zip** z zakładki **Releases** (wydanie „program-windows”).
2. Rozpakuj go w dowolnym miejscu, np. na pendrive. Powstanie folder **Szukaj w filmie**.
3. Uruchom **Szukaj w filmie.exe**. Jeśli Windows pokaże „System Windows ochronił ten komputer”, kliknij **Więcej informacji → Uruchom mimo to**.

Program blokuje wszelkie połączenia z internetem, więc nic nie może zostać wysłane. Plik ZIP buduje automatycznie workflow **Program dla Windows**, który przed budową testuje aplikację z prawdziwym modelem AI.

## Pliki

| Plik | Co robi |
|---|---|
| `index.html`, `styles.css` | Wygląd aplikacji |
| `app.js` | Wyciąganie klatek, wyszukiwanie, wyniki |
| `worker.js` | Model AI (CLIP przez Transformers.js) w osobnym wątku |
| `translate.js` | Słownik polsko-angielski do opisów |
| `sw.js`, `manifest.webmanifest` | Instalacja i praca offline (PWA) |
| `desktop/` | Program dla Windows (Electron) |
| `scripts/prepare-offline.sh` | Przygotowuje aplikację z modelem do wersji offline |
| `scripts/package-windows.sh` | Pakuje program dla Windows do pliku ZIP |
| `tests/e2e.mjs` | Test w przeglądarce (Playwright) |
| `tests/electron-smoke.mjs` | Test programu dla Windows |

## Test

```bash
# film testowy: 4 s czerwieni, 4 s niebieskiego, 4 s zieleni
ffmpeg -f lavfi -i color=red:s=640x360:d=4 -f lavfi -i color=blue:s=640x360:d=4 -f lavfi -i color=green:s=640x360:d=4 \
  -filter_complex "[0][1][2]concat=n=3:v=1[v]" -map "[v]" test.webm
node tests/e2e.mjs test.webm
# opcjonalnie nagranie „z kamery”: CCTV_VIDEO=cctv.webm node tests/e2e.mjs test.webm
```
