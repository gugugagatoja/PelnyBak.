/*
 * lcd_display.c
 *
 *  Created on: Aug 23, 2022
 *      Author: Jaroslaw.Jankowski
 */
#include <lcd_display.h>
#include <lcd16x2_i2c.h>
#include <jj.h>
#include <stdio.h>
#include <string.h>
#include <stdarg.h>
#include "tim.h"
#include "gpio.h"
#include "main.h"
#include "rtc.h"
#include <jj_Time.h>
#include <OneWire.h>




extern float Temp[2];

static void jj_Lcd_Display_Temp(void)
{
	lcd16x2_i2c_clear();
	lcd16x2_i2c_1stLine();
	lcd16x2_i2c_printf("T1=%.1f ", Temp[0] );

	lcd16x2_i2c_2ndLine();
	lcd16x2_i2c_printf("T2=%.1f ", Temp[1] );

}

static void jj_Lcd_Display_Tim1 (void)
{
	lcd16x2_i2c_clear();
	lcd16x2_i2c_1stLine();
	lcd16x2_i2c_printf("ARR  TIM 1  PSC");
	lcd16x2_i2c_2ndLine();
	lcd16x2_i2c_printf("%d     %d",  TIM1->ARR,TIM1->PSC );
}
static void jj_Lcd_Display_Tim1_1 (void)
{
	uint32_t f_and_pulse_ms;

	f_and_pulse_ms =( (72000000000) /            //* 1000 wiec wynik w mHz
			    (  (TIM1->PSC+1)	*	(TIM1->ARR+1) )  );

	lcd16x2_i2c_clear();
	lcd16x2_i2c_1stLine();

	lcd16x2_i2c_printf("F=%d mHz    ",  f_and_pulse_ms);
	lcd16x2_i2c_2ndLine();

	lcd16x2_i2c_printf("T=%d ms", (1000000/f_and_pulse_ms))	;

}

static void jj_Lcd_Display_Measure(void)
{
	float d1 = jj_Get_Result_Sensor_1();
	float d2 = jj_Get_Result_Sensor_2();
	/* PB12 = STATE z HM-10: stan wysoki gdy telefon polaczony */
	const char *bt = (HAL_GPIO_ReadPin(GPIOB, GPIO_PIN_12) == GPIO_PIN_SET) ? "BT" : "  ";

	lcd16x2_i2c_clear();
	lcd16x2_i2c_1stLine();
	if (d1 < 0) lcd16x2_i2c_printf("1: ---cm     %s", bt);
	else        lcd16x2_i2c_printf("1:%4dcm     %s", (int) d1, bt);

	lcd16x2_i2c_2ndLine();
	if (d2 < 0) lcd16x2_i2c_printf("2: ---cm %02d:%02d", godzina_main[0], godzina_main[1]);
	else        lcd16x2_i2c_printf("2:%4dcm %02d:%02d", (int) d2, godzina_main[0], godzina_main[1]);
}
static void jj_Lcd_Display_hello(void)
{
		static uint8_t i =0;
		i++;
		lcd16x2_i2c_clear();
		lcd16x2_i2c_1stLine();
		lcd16x2_i2c_printf("T1=%.1f i=%d ", Temp[0],  i );

		lcd16x2_i2c_2ndLine();
		lcd16x2_i2c_printf("T2=%.1f ", Temp[1]);

}
void jj_Lcd_Menu(uint8_t menu_show)
	{
			switch (menu_show) {
				case 5:
					jj_Lcd_Display_Tim1_1();
					break;
				case 4:
					jj_Lcd_Display_Tim1();
					 break;
				case 3:
					jj_Lcd_Display_Measure();
					break;
				case 2:
					jj_Lcd_Display_hello();
					break;
				case 1:
					jj_Lcd_Display_Temp();
				break;
				default:
				break;
	}
}

