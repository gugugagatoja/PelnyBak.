# Piny – projekt `gg` (Nucleo-F401RE)

Na podstawie `gg.ioc` i kodu. „Nucleo”: Dx/Ax = złącze Arduino, CN7/CN10 = listwy boczne
(numery listew sprawdź z dokumentacją UM1724 przed lutowaniem).

## Czujniki odległości (HC-SR04)

| Pin | Nucleo | Funkcja | Uwagi |
|---|---|---|---|
| PC0 | A5 | TRIG czujnika 1 | wyjście, impuls ok. 0,5 ms |
| PB9 | D14 | ECHO czujnika 1 | TIM4 CH4 (przechwytywanie), toleruje 5 V |
| PC1 | A4 | TRIG czujnika 2 | wyjście |
| PB6 | D10 | ECHO czujnika 2 | TIM4 CH1 (przechwytywanie), toleruje 5 V |

## Wyświetlacz i dźwięk

| Pin | Nucleo | Funkcja | Uwagi |
|---|---|---|---|
| PB7 | CN7-21 | SDA – LCD 16x2 I2C | adres 0x27 lub 0x3F (wykrywany automatycznie) |
| PB8 | D15 | SCL – LCD 16x2 I2C | |
| PA10 | D2 | brzęczyk | PWM TIM1 CH3 |

## Termometry

| Pin | Nucleo | Funkcja | Uwagi |
|---|---|---|---|
| **PA9** | D8 | 1-Wire, DS18B20 × 2 | USART1 jednoprzewodowo, rezystor 4,7 kΩ do 3,3 V (**wcześniej PC6**) |

## Bluetooth – HM-10

| Pin | Nucleo | Funkcja | Uwagi |
|---|---|---|---|
| PA11 | CN10-14 | USART6 TX → **RXD** HM-10 | 9600 bodów |
| PA12 | CN10-12 | USART6 RX ← **TXD** HM-10 | |
| PB12 | CN10-16 | **STATE** HM-10 | stan wysoki = telefon połączony |
| 5V / GND | | VCC / GND HM-10 | płytka z konwerterem przyjmuje 3,6–6 V |

## Przyciski

| Pin | Nucleo | Funkcja | Uwagi |
|---|---|---|---|
| PC13 | przycisk B1 | następny ekran LCD (1→5) | na płytce |
| PC4 | CN10-34 | ekran 1 (temperatury) | pull-up, zwierać do GND |
| PB15 | CN10-26 | ekran 2 | pull-up, zwierać do GND |

## Komunikacja i diagnostyka

| Pin | Nucleo | Funkcja | Uwagi |
|---|---|---|---|
| PA2 / PA3 | D1 / D0 | UART2 TX/RX, 9600 bodów | wirtualny port COM przez USB (ST-Link) |
| PA5 | D13 | zielona dioda LD2 | miga z TIM9 |
| PA13 / PA14 / PB3 | – | SWD / SWO | programator |
| PC14 / PC15 | – | kwarc 32,768 kHz | RTC |

## Skonfigurowane, ale nieużywane

| Pin | Nucleo | Ustawienie |
|---|---|---|
| PA6 | D12 | PWM TIM3 CH1 (timer służy tylko do odmierzania czasu) |
| PA4 | A2 | wejście analogowe (ADC usunięte) |
| PB13 | CN10-30 | wyjście „INC” (potencjometr cyfrowy X9C?) |
| PB14 | CN10-28 | wyjście „U/D” |
| PC7 | D9 | wyjście, stan wysoki od startu |

## Schemat w skrócie

```
HC-SR04 #1  TRIG ── PC0 (A5)      ECHO ── PB9 (D14)
HC-SR04 #2  TRIG ── PC1 (A4)      ECHO ── PB6 (D10)
LCD I2C     SDA  ── PB7 (CN7-21)  SCL  ── PB8 (D15)
Brzęczyk         ── PA10 (D2)
DS18B20 ×2  DATA ── PA9 (D8) ──[4,7kΩ]── 3,3V
HM-10       RXD ── PA11 (CN10-14)  TXD ── PA12 (CN10-12)  STATE ── PB12 (CN10-16)  VCC ── 5V
Przycisk 1       ── PC4  → GND
Przycisk 2       ── PB15 → GND
Zasilanie HC-SR04 i LCD: 5V, wspólna masa
```
