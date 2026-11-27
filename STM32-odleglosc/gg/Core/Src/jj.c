/*
 * jj.c
 *
 *  Created on: Aug 10, 2022
 *      Author: Jaroslaw.Jankowski
 *
 *  Pomiar odleglosci z dwoch czujnikow HC-SR04 przez TIM4 (input capture).
 *  Czujnik 1: ECHO na PB9 (TIM4 CH4), czujnik 2: ECHO na PB6 (TIM4 CH1).
 */

#include <jj.h>
#include "tim.h"
#include "main.h"

/* TIM4 taktowany 72 MHz / (109 + 1) = 654,5 kHz -> jeden takt = 1,528 us */
#define JJ_US_NA_TAKT   (110.0f / 72.0f)
/* HC-SR04: odleglosc [cm] = czas impulsu ECHO [us] / 58 */
#define JJ_US_NA_CM     58.0f

static T_measure czujnik1_struktura = { .val_Wynik = JJ_BRAK_POMIARU };
static T_measure czujnik2_struktura = { .val_Wynik = JJ_BRAK_POMIARU };

float jj_Get_Result_Sensor_1(void)
{
	return czujnik1_struktura.val_Wynik;
}

float jj_Get_Result_Sensor_2(void)
{
	return czujnik2_struktura.val_Wynik;
}

/* Wspolna obsluga zbocza ECHO dla obu czujnikow */
static void jj_Capture(T_measure *s, uint32_t channel)
{
	uint16_t licznik = (uint16_t) HAL_TIM_ReadCapturedValue(&htim4, channel);

	if (s->Is_First_Value == 0)
	{
		/* zbocze rosnace: poczatek impulsu ECHO */
		s->val_Firts_Capture = licznik;
		__HAL_TIM_SET_CAPTUREPOLARITY(&htim4, channel, TIM_INPUTCHANNELPOLARITY_FALLING);
		s->Is_First_Value = 1;
	}
	else
	{
		/* zbocze opadajace: koniec impulsu ECHO */
		s->val_Second_Capture = licznik;
		__HAL_TIM_SET_CAPTUREPOLARITY(&htim4, channel, TIM_INPUTCHANNELPOLARITY_RISING);
		s->Is_First_Value = 0;

		/* Szerokosc impulsu = drugi - pierwszy. Odejmowanie na uint16_t
		   samo obsluguje przepelnienie licznika (wynik modulo 65536). */
		uint16_t czas = (uint16_t)(s->val_Second_Capture - s->val_Firts_Capture);

		s->val_Wynik = (czas * JJ_US_NA_TAKT) / JJ_US_NA_CM;
		s->Gotowy = 1;
	}
}

void jj_Measure_Sensor_1(void)
{
	jj_Capture(&czujnik1_struktura, TIM_CHANNEL_4);
}

void jj_Measure_Sensor_2(void)
{
	jj_Capture(&czujnik2_struktura, TIM_CHANNEL_1);
}

/* Przygotowanie przed kolejnym impulsem TRIG.
   Jesli poprzedni pomiar sie nie zakonczyl (brak echa, czujnik odlaczony),
   wynik jest oznaczany jako JJ_BRAK_POMIARU, a polaryzacja wraca na zbocze rosnace. */
void jj_Sensor_Start(uint8_t nr)
{
	T_measure *s    = (nr == 1) ? &czujnik1_struktura : &czujnik2_struktura;
	uint32_t channel = (nr == 1) ? TIM_CHANNEL_4 : TIM_CHANNEL_1;

	__disable_irq();
	if (s->Gotowy == 0)
	{
		s->val_Wynik = JJ_BRAK_POMIARU;
	}
	if (s->Is_First_Value != 0)
	{
		s->Is_First_Value = 0;
		__HAL_TIM_SET_CAPTUREPOLARITY(&htim4, channel, TIM_INPUTCHANNELPOLARITY_RISING);
	}
	s->Gotowy = 0;
	__enable_irq();
}
