# STM32 – czujniki odległości (projekt `gg`)

Projekt STM32CubeIDE dla **Nucleo-F401RE** (STM32F401RE):

- 2 × ultradźwiękowy czujnik odległości HC-SR04 (pomiar timerem TIM4 w trybie przechwytywania),
- brzęczyk (PWM, TIM1) – piszczy tym szybciej, im bliżej przeszkody,
- wyświetlacz LCD 16x2 po I2C – 5 ekranów przełączanych przyciskami,
- 2 × termometr DS18B20 (1-Wire przez USART1 w trybie jednoprzewodowym, PA9),
- moduł Bluetooth LE **HM-10** (USART6, PA11/PA12) – wysyła odległości i temperatury do telefonu, przyjmuje komendy,
- zegar RTC.

Połączenia pinów: [PINY.md](PINY.md).

## Bluetooth (HM-10) i port USB

Co 200 ms program wysyła jedną linię tekstu – do HM-10 (gdy telefon jest połączony) i na port COM przez USB (9600 bodów):

```
D1=50;D2=73;T1=21.5;T2=22.0
```

`D1`, `D2` – odległość w cm (`-1` = brak echa), `T1`, `T2` – temperatury (tylko znalezione czujniki).

Komendy (zakończone Enterem / `\n`):

| Komenda | Działanie |
|---|---|
| `EKRAN=1` … `EKRAN=5` | zmiana ekranu LCD |
| `PROG=10` … `PROG=100` | odległość w cm, poniżej której brzęczyk piszczy ciągle (domyślnie 30) |

Test z telefonu: aplikacja **Serial Bluetooth Terminal** → Devices → Bluetooth LE → moduł HM-10.
Test z komputera: PuTTY / terminal, port COM ST-Linka, 9600 bodów.

## Jak otworzyć

1. STM32CubeIDE → **File → Import → Existing Projects into Workspace** → wskaż folder `gg`.
2. **Project → Clean**, potem **Build**. Projekt wcześniej był w innej ścieżce, a Clean odświeża ścieżkę do pliku `STM32F401RETX_FLASH.ld`.

Folder `Debug/` (pliki wynikowe kompilacji) nie jest trzymany w repozytorium – IDE tworzy go samo.

## Stan kompilacji

Kompiluje się bez błędów (arm-none-eabi-gcc 13.2, ustawienia jak w CubeIDE): Flash ok. 59 kB / 512 kB, RAM ok. 3,9 kB / 96 kB.

## Poprawione błędy (w stosunku do wersji oryginalnej)

1. **Zawyżona odległość** (`Core/Src/jj.c`): czas echa liczony był jako `pierwszy + drugi`; teraz `(uint16_t)(drugi − pierwszy)`,
   co obsługuje też przepełnienie licznika. Wynik liczony tylko po zboczu opadającym.
2. **Nadpisywanie pamięci przy odczycie RTC** (`main.c`, `jj_Get_Time`): odczyt do właściwych struktur HAL.
3. **Zawieszenie bez termometrów** (`OneWire.c`, `get_ROMid`): program działa dalej bez temperatury.
4. **UART2** (`main.c`): usunięty blok wysyłający bajty spod przypadkowego adresu; odbiór komend działa (`ReceiveToIdle`).
5. **Brak echa**: przed każdym pomiarem czujnik jest „resetowany”; gdy echa nie było, wynik = brak (`---` na LCD, `-1` w danych).
   TIM4 nie jest już zerowany (niepotrzebne przy odejmowaniu).
6. `jj.h`: naprawiona ochrona przed podwójnym dołączeniem nagłówka.

Brzęczyk reaguje teraz na **bliższy** z dwóch czujników (wcześniej tylko na czujnik 2).
Ekran 3 na LCD pokazuje obie odległości, godzinę i znacznik `BT`, gdy telefon jest połączony.

## Uwaga do CubeMX

Zmiany pinów (PA11/PA12 dla USART6, 1-Wire na PA9) są wpisane w `gg.ioc`. Po otwarciu `.ioc` w CubeMX sprawdź,
czy USART6 jest w trybie **Asynchronous** na PA11/PA12 (9600) i USART1 w **Single Wire (Half-Duplex)** na PA9.
Kod użytkownika jest w sekcjach `USER CODE`, więc regenerowanie go nie skasuje.

## Do zrobienia

- LCD jest czyszczony co ok. 100 ms – może migać (lepiej nadpisywać tekst bez `clear`).
- Brzęczyk przy braku pomiaru piszczy dalej w ostatnim tempie.
- Sporo nieużywanych zmiennych z wcześniejszych prób (`array_petla`, `ADC_JOYSTICK`, `Licznik_TIMM10`…).
