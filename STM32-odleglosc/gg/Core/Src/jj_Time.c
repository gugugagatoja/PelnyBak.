/*
 * jj_Time.c
 *
 *  Created on: 1 wrz 2022
 *      Author: Jaroslaw.Jankowski
 */

#include "jj_Time.h"
#include "main.h"
//#include "adc.h"
#include "i2c.h"
#include "rtc.h"
#include "tim.h"
#include "usart.h"
#include "gpio.h"
#include <stdio.h>



jj_T_RTC_TimeTypeDef jj_time;
jj_T_RTC_Date_TypeDef jj_date;



uint8_t jj_time_hours(void)
{
	return jj_time.Hours;
}
uint8_t jj_time_minutes(void)
{
	return jj_time.Minutes;
}
void jj_Get_Time(void);
