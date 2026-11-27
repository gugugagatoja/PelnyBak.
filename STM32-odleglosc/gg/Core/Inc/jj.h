/*
 * jj.h
 *
 *  Created on: Jun 17, 2022
 *      Author: Jaroslaw.Jankowski
 */
#ifndef INC_JJ_H_
#define INC_JJ_H_

#include "main.h"
#include <stdio.h>

/* Wartosc zwracana, gdy czujnik nie dal poprawnego echa */
#define JJ_BRAK_POMIARU   (-1.0f)

typedef struct Measure {
	volatile uint16_t val_Firts_Capture;   /* stan licznika na zboczu rosnacym ECHO   */
	volatile uint16_t val_Second_Capture;  /* stan licznika na zboczu opadajacym ECHO */
	volatile uint8_t  Is_First_Value;      /* 1 = czekamy na zbocze opadajace         */
	volatile uint8_t  Gotowy;              /* 1 = pomiar zakonczony od ostatniego startu */
	volatile float    val_Wynik;           /* odleglosc w cm albo JJ_BRAK_POMIARU      */
} T_measure;

float jj_Get_Result_Sensor_1(void);
float jj_Get_Result_Sensor_2(void);

/* Wywolac tuz przed impulsem TRIG danego czujnika (nr = 1 lub 2) */
void jj_Sensor_Start(uint8_t nr);

/* Wywolywane z HAL_TIM_IC_CaptureCallback */
void jj_Measure_Sensor_1(void);
void jj_Measure_Sensor_2(void);

#endif /* INC_JJ_H_ */
