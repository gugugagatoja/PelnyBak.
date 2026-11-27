/*
 * jj_Time.h
 *
 *  Created on: 1 wrz 2022
 *      Author: Jaroslaw.Jankowski
 */
#include "main.h"
#include "rtc.h"
#include <stdio.h>

#ifndef INC_JJ_TIME_H_
#define INC_JJ_TIME_H_



typedef struct RTC_Time
{
  uint8_t Hours;            /*!< Specifies the RTC Time Hour.
                                 This parameter must be a number between Min_Data = 0 and Max_Data = 23 */

  uint8_t Minutes;          /*!< Specifies the RTC Time Minutes.
                                 This parameter must be a number between Min_Data = 0 and Max_Data = 59 */

  uint8_t Seconds;          /*!< Specifies the RTC Time Seconds.
                                 This parameter must be a number between Min_Data = 0 and Max_Data = 59 */

} jj_T_RTC_TimeTypeDef;

typedef struct RTC_Day_Year
{
  uint8_t WeekDay;  /*!< Specifies the RTC Date WeekDay (not necessary for HAL_RTC_SetDate).
                         This parameter can be a value of @ref RTC_WeekDay_Definitions */

  uint8_t Month;    /*!< Specifies the RTC Date Month (in BCD format).
                         This parameter can be a value of @ref RTC_Month_Date_Definitions */

  uint8_t Date;     /*!< Specifies the RTC Date.
                         This parameter must be a number between Min_Data = 1 and Max_Data = 31 */

  uint8_t Year;     /*!< Specifies the RTC Date Year.
                         This parameter must be a number between Min_Data = 0 and Max_Data = 99 */

} jj_T_RTC_Date_TypeDef;


//extern void jj_Get_Time(void);
uint8_t jj_time_hours(void);
uint8_t jj_time_minutes(void);



#endif /* INC_JJ_TIME_H_ */
