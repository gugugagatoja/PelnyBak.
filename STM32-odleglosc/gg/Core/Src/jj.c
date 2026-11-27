/*
 * jj.c
 *
 *  Created on: Aug 10, 2022
 *      Author: Jaroslaw.Jankowski
 */

#include <jj.h>
#include "lcd16x2_i2c.h"
#include <stdio.h>
#include <string.h>
#include <stdarg.h>
#include "tim.h"
#include "gpio.h"
#include "main.h"


 static T_measure	 czujnik1_struktura;
 static T_measure 	 czujnik2_struktura;

void jj_Init (void )
{
    czujnik1_struktura.val_Wynik = 	1;
    czujnik2_struktura.val_Wynik =	1;

}

float  jj_Get_Result_Sensor_1 (void)
{
	return czujnik1_struktura.val_Wynik;
}
float  jj_Get_Result_Sensor_2 (void)
{
	return czujnik2_struktura.val_Wynik;
}
//----------------------------------------------------------------------------------------------
void jj_Measure_Sensor_1(void)
{



				 if ( czujnik1_struktura.Is_First_Value==0)
							{
								czujnik1_struktura.val_Firts_Capture	= 	HAL_TIM_ReadCapturedValue( &htim4, TIM_CHANNEL_4);

								__HAL_TIM_SET_CAPTUREPOLARITY(&htim4, TIM_CHANNEL_4, TIM_INPUTCHANNELPOLARITY_FALLING);
								czujnik1_struktura.Is_First_Value		=		1;
						}

										 else
													{
											 	 	 	 czujnik1_struktura.val_Second_Capture= HAL_TIM_ReadCapturedValue( &htim4, TIM_CHANNEL_4);

														__HAL_TIM_SET_CAPTUREPOLARITY(&htim4, TIM_CHANNEL_4, TIM_INPUTCHANNELPOLARITY_RISING);

														czujnik1_struktura.Is_First_Value		=		0	;
															__HAL_TIM_SetCounter(&htim4,0);
													}



							if	(czujnik1_struktura.val_Firts_Capture	 > czujnik1_struktura.val_Second_Capture	)
								{
									czujnik1_struktura.val_Wynik  = 65540 - czujnik1_struktura.val_Firts_Capture +  czujnik1_struktura.val_Second_Capture;
								}
									else{
										czujnik1_struktura.val_Wynik 		=		czujnik1_struktura.val_Firts_Capture	+czujnik1_struktura.val_Second_Capture;
									        }

							czujnik1_struktura.val_Liczba_Float = (czujnik1_struktura.val_Wynik	*	100)/ 	65540;

							czujnik1_struktura.val_Wynik=1.53*czujnik1_struktura.val_Wynik /58;

}
//------------------------------------------------------------------------------------------------------------------------------------------
void jj_Measure_Sensor_2(void)
{



				 if ( czujnik2_struktura.Is_First_Value==0)
							{
								czujnik2_struktura.val_Firts_Capture	= 	HAL_TIM_ReadCapturedValue( &htim4, TIM_CHANNEL_1);

								__HAL_TIM_SET_CAPTUREPOLARITY(&htim4, TIM_CHANNEL_1, TIM_INPUTCHANNELPOLARITY_FALLING);
								czujnik2_struktura.Is_First_Value		=		1;
						}

										 else
													{
											 	 	 	 czujnik2_struktura.val_Second_Capture= HAL_TIM_ReadCapturedValue( &htim4, TIM_CHANNEL_1);

														__HAL_TIM_SET_CAPTUREPOLARITY(&htim4, TIM_CHANNEL_1, TIM_INPUTCHANNELPOLARITY_RISING);

														czujnik2_struktura.Is_First_Value		=		0	;
															__HAL_TIM_SetCounter(&htim4,0);
													}



							if	(czujnik2_struktura.val_Firts_Capture	 > czujnik2_struktura.val_Second_Capture	)
								{
									czujnik2_struktura.val_Wynik  = 65540 - czujnik2_struktura.val_Firts_Capture +  czujnik2_struktura.val_Second_Capture;
								}
									else{
										czujnik2_struktura.val_Wynik 		=		czujnik2_struktura.val_Firts_Capture	+czujnik2_struktura.val_Second_Capture;
									        }

							czujnik2_struktura.val_Liczba_Float = (czujnik2_struktura.val_Wynik	*	100)/ 	65540;

							czujnik2_struktura.val_Wynik=1.53*czujnik2_struktura.val_Wynik /58;


}
//-------------------------------------------------------------------------------------------------------------------------------------------------
