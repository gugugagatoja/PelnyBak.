# STM32 – czujniki odległości (projekt `gg`)

Projekt STM32CubeIDE dla **Nucleo-F401RE** (STM32F401RE):

- 2 × ultradźwiękowy czujnik odległości HC-SR04 (pomiar timerem TIM4 w trybie przechwytywania),
- brzęczyk (PWM, TIM1) – piszczy tym szybciej, im bliżej przeszkody,
- wyświetlacz LCD 16x2 po I2C – 5 ekranów przełączanych przyciskami,
- 2 × termometr DS18B20 (1-Wire przez USART6 w trybie jednoprzewodowym),
- zegar RTC.

Kod jest w wersji oryginalnej (bez poprawek). Połączenia pinów: [PINY.md](PINY.md).

## Jak otworzyć

1. STM32CubeIDE → **File → Import → Existing Projects into Workspace** → wskaż folder `gg`.
2. **Project → Clean**, potem **Build**. Projekt wcześniej był w innej ścieżce, a Clean odświeża ścieżkę do pliku `STM32F401RETX_FLASH.ld`.

Folder `Debug/` (pliki wynikowe kompilacji) nie jest trzymany w repozytorium – IDE tworzy go samo.

## Stan kompilacji

Kompiluje się bez błędów (arm-none-eabi-gcc 13.2): Flash ok. 53,6 kB / 512 kB, RAM ok. 3,7 kB / 96 kB.

## Znane błędy do poprawy

1. **Zawyżona odległość** (`Core/Src/jj.c`): czas echa liczony jako `pierwszy + drugi` zamiast `drugi − pierwszy`
   (dolicza 2 × opóźnienie startu echa, ok. 10 cm). Poprawnie: `(uint16_t)(second - first)` – obsługuje też przepełnienie licznika.
   W gałęzi z przepełnieniem jest `65540` zamiast `65536`.
2. **Nadpisywanie pamięci** (`Core/Src/main.c`, `jj_Get_Time`): `HAL_RTC_GetTime` zapisuje 20-bajtową strukturę do tablicy `godzina_main[4]`.
3. **Zawieszenie bez termometrów** (`Core/Src/OneWire.c`, `get_ROMid`): pętla `while(1)` albo `strcmp(NULL, …)` → HardFault, gdy nie ma DS18B20.
4. **UART2** (`main.c`): `(uint8_t*)x` wysyła bajty spod przypadkowego adresu; odbiór nie jest uruchomiony, więc obsługa komend nie działa.
5. Brak limitu czasu na echo; wspólny licznik TIM4 dla obu czujników zerowany w dwóch miejscach.

## Plany

- Moduł BLE **HM-10** na USART6 (PA11/PA12), termometry przeniesione na USART1 (PA9).
- Wysyłanie danych tekstem, np. `D1=50;D2=73;T1=21.5;T2=22.0\n`, i odbiór komend (`EKRAN=3`, `PROG=30`).
