/*
 * jj.h
 *
 *  Created on: Jun 17, 2022
 *      Author: Jaroslaw.Jankowski
 */
#include "main.h"
#include <stdio.h>
#ifndef INC_JJ_H_
//#define INC_JJ_H_
//#define maxCaunterValue 64445

//--------------------------------------------------------------------------------------
typedef struct Measure {
	volatile uint16_t 				    	val_Firts_Capture;
	volatile uint16_t						val_Second_Capture;
	uint8_t									Is_First_Value;
	float 									val_Wynik;
	float									val_Liczba_Float;

}T_measure;

float  jj_Get_Result_Sensor_1 (void);
float  jj_Get_Result_Sensor_2 (void);

void jj_Measure_Sensor_1(void);
void jj_Measure_Sensor_2(void);

#endif /* INC_JJ_H_ */
