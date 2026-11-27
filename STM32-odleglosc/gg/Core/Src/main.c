/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file           : main.c
  * @brief          : Main program body
  ******************************************************************************
  * @attention
  *
  * Copyright (c) 2022 STMicroelectronics.
  * All rights reserved.
  *
  * This software is licensed under terms that can be found in the LICENSE file
  * in the root directory of this software component.
  * If no LICENSE file comes with this software, it is provided AS-IS.
  *
  ******************************************************************************
  */
/* USER CODE END Header */
/* Includes ------------------------------------------------------------------*/
#include "main.h"
#include "i2c.h"
#include "rtc.h"
#include "tim.h"
#include "usart.h"
#include "gpio.h"

/* Private includes ----------------------------------------------------------*/
/* USER CODE BEGIN Includes */
//***************************************************************************************
#include <stdio.h>
#include <lcd16x2_i2c.h>
#include <jj.h>
#include <lcd_display.h>
#include <jj_Time.h>

#include <OneWire.h>
/* USER CODE END Includes */

/* Private typedef -----------------------------------------------------------*/
/* USER CODE BEGIN PTD */
#define jj_const_czas_piku 150
/* USER CODE END PTD */

/* Private define ------------------------------------------------------------*/
/* USER CODE BEGIN PD */


/* USER CODE END PD */

/* Private macro -------------------------------------------------------------*/
/* USER CODE BEGIN PM */
void jj_Get_Time(void)
{


	HAL_RTC_GetTime(&hrtc, &godzina_main, RTC_FORMAT_BIN);
	HAL_RTC_GetDate(&hrtc, &data_main   , RTC_FORMAT_BIN);
}
/* USER CODE END PM */

/* Private variables ---------------------------------------------------------*/

/* USER CODE BEGIN PV */

volatile uint16_t 	jj_val_Tim3_20_ms;
volatile uint16_t   jj_val_Tim3_1000ms;

uint32_t 	jj_Val_Pulse_ms;
uint32_t 	jj_Val_Pulse_ms_New;

uint16_t 	jj_Val_PSC ;
//uint16_t	jj_Val_PSC_new;

uint16_t 	jj_Val_ARR;

uint32_t  	jj_Val_F;


float liczba_float;

//----------------------------------zmienna decydująca co yświetlacz na LCD
uint8_t jj_Lcd_Screen;
//----------------------------------Pomiar odleglosci----------------------------------------------------------------------------------------
uint8_t jj_measure_lewy_prawy;
//uint8_t jj_wykasowac;
						// 1- czujnik 1 ; 2- czujnik 2 ; 0- pomiar wyłaczony;
//-------------------------------------------------------------------------------------------------------------------------------------
uint8_t napis_wersja_softu[]="\n              pierwszy program v.01 \n";
uint8_t napis1[]="\cyfra=ssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssss33";
uint8_t array_petla[]="ooo rety";
uint8_t buffor[]="ZASTAPIC \n";
uint8_t znak;
volatile uint8_t x,y,z ,f,koniec_konwersji,dioda;
uint8_t jest_buffor;
//--------------------------------------------

uint16_t j;
volatile uint64_t Licznik_TIMM10,Licznik_TIM11,VALUE;

volatile uint16_t ADC_JOYSTICK[40];
volatile uint64_t PWM,OC,timer10_val;

uint16_t ADC_Result2[3];

uint8_t UartMessage[32];
//---------------------------------------------------------------------------------------


//---------------------------------------------------------
uint8_t godzina_main[4];
uint8_t data_main[4];
jj_T_Time j_czas;
jj_T_Date jj_data;
uint32_t jj_Psc_htim3;

  /* USER CODE END 2 */

//------------------------------------------------------------------------------------------------

//---------------------------------------------------------------
/* USER CODE END PV */

/* Private function prototypes -----------------------------------------------*/
void SystemClock_Config(void);
/* USER CODE BEGIN PFP */
void jj_UART2_Print(uint8_t* Message);
/* USER CODE END PFP */

/* Private user code ---------------------------------------------------------*/
/* USER CODE BEGIN 0 */
extern float Temp[MAXDEVICES_ON_THE_BUS];
uint32_t jj_value[2];
uint32_t aa;
uint32_t bb;

/* USER CODE END 0 */

/**
  * @brief  The application entry point.
  * @retval int
  */
int main(void)
{
  /* USER CODE BEGIN 1 */
	jj_Lcd_Screen =1;
	jj_Psc_htim3 =65000;
//------------------------------------------------------------


  /* USER CODE END 1 */

  /* MCU Configuration--------------------------------------------------------*/

  /* Reset of all peripherals, Initializes the Flash interface and the Systick. */
  HAL_Init();

  /* USER CODE BEGIN Init */

  /* USER CODE END Init */

  /* Configure the system clock */
  SystemClock_Config();

  /* USER CODE BEGIN SysInit */

  /* USER CODE END SysInit */

  /* Initialize all configured peripherals */
  MX_GPIO_Init();
  MX_USART2_UART_Init();
  MX_USART1_UART_Init();
  MX_TIM4_Init();
  MX_TIM9_Init();
  MX_TIM1_Init();
  MX_RTC_Init();
  MX_I2C1_Init();
  MX_USART6_UART_Init();
  MX_TIM3_Init();
  /* USER CODE BEGIN 2 */
  lcd16x2_i2c_init(&hi2c1);
  lcd16x2_i2c_printf("14");
  jj_measure_lewy_prawy =1;
//--------------------------------- KONFIGURACJA TIMERÓW
	HAL_TIM_Base_Start_IT ( &htim9 );
	HAL_TIM_IC_Start_IT ( &htim4 , TIM_CHANNEL_1 );	//Timer 4 pomiar odległości
	HAL_TIM_IC_Start_IT ( &htim4 , TIM_CHANNEL_4 );  //Timer 4 pomiar odległości
	HAL_TIM_PWM_Start_IT ( &htim1 , TIM_CHANNEL_3 );
	HAL_TIM_PWM_Start_IT ( &htim3 , TIM_CHANNEL_1 );

	//HAL_ADC_Start_DMA ( &hadc1 , jj_value , 2 );
//------------------------------inicjalizacja pomiaru temperatury onewire ---------------------------
 get_ROMid();
//------------------------------------------------------------------------
	jj_Val_PSC = TIM1->PSC;
	jj_Val_ARR = TIM1->ARR;
	jj_Val_F = ((72000000000) /            //* 1000 wiec wynik w mHz
			((TIM1->PSC + 1) * (TIM1->ARR + 1)));

	jj_Val_Pulse_ms = 1000000 / jj_Val_F;   // calkowity czas pulsu
	//-- wyznaczenie liczby dla pulsu 150 ms

	TIM1->CCR3 = (uint32_t) ((TIM1->ARR * jj_const_czas_piku)
			/ (jj_Val_Pulse_ms));






//------------------------------------------------------------------------
  /* USER CODE END 2 */

  /* Infinite loop */
  /* USER CODE BEGIN WHILE */
  while (1)
  {
	  get_Temperature();
	  jj_Get_Time();

      aa = jj_value[0];
      bb = jj_value[1];

	  sprintf ( (char*) UartMessage , "X: %d\n\r" , (int) ADC_Result2 );

//---------------------------------------------- realizacja pikania buczkiem w zaleznosci od osleglosci
	  if ((jj_Get_Result_Sensor_2 ( ) >= 26)
				&& (jj_Get_Result_Sensor_2 ( ) <= 400)) {

			if (jj_Get_Result_Sensor_2 ( ) <= 30) {
				TIM1->PSC = 170;
			} else

			{
				TIM1->PSC = 11 * jj_Get_Result_Sensor_2 ( );
				TIM1->PSC = TIM1->PSC - 91;
			}

		}




	  jj_Val_PSC = TIM1->PSC ;
	  jj_Val_ARR = TIM1->ARR ;
	  jj_Val_F = ((72000000000) /            //* 1000 wiec wynik w mHz
	   			    (  (TIM1->PSC+1)	*	(TIM1->ARR+1)));

	  jj_Val_Pulse_ms  = 1000000 /jj_Val_F ;   // calkowity czas pulsu w ms

	  TIM1->CCR3 = (uint32_t)((TIM1->ARR * jj_const_czas_piku)/(	jj_Val_Pulse_ms	)  );










	  switch (jj_measure_lewy_prawy) {
			case 1:
				HAL_GPIO_WritePin ( GPIOC , GPIO_PIN_0 , GPIO_PIN_SET );

				__HAL_TIM_SET_COUNTER( &htim9 , 0 );
				while (__HAL_TIM_GET_COUNTER(&htim9) < 70)
					; // wait for the counter to reach the us input in the parameter

				HAL_GPIO_WritePin ( GPIOC , GPIO_PIN_0 , GPIO_PIN_RESET );
				jj_measure_lewy_prawy = 2;
				__HAL_TIM_SetCounter(&htim4,0);
				break;

			case 2:
				HAL_GPIO_WritePin ( GPIOC , GPIO_PIN_1 , GPIO_PIN_SET );

				__HAL_TIM_SET_COUNTER( &htim9 , 0 );
				while (__HAL_TIM_GET_COUNTER(&htim9) < 70)
					; // wait for the counter to reach the us input in the parameter

				HAL_GPIO_WritePin ( GPIOC , GPIO_PIN_1 , GPIO_PIN_RESET );
				jj_measure_lewy_prawy = 1;
				__HAL_TIM_SetCounter(&htim4,0);
				break;

			default:

				break;
		} //-------------------  koniec switcha

	  	  	  	jj_Lcd_Menu(jj_Lcd_Screen);
HAL_Delay(100);

if (jj_val_Tim3_1000ms == 20)
{

jj_val_Tim3_1000ms = 0;
}



//----------------------------------------------



//------------------------------------------------------------


//-------------------------------------------------------------------------------------

    if ( jest_buffor==1)
    {

 	if( (buffor[0]=='z')  && buffor[3]== 'z')
    	{
    		x = (buffor[1]-48)*10;
    		x = x + buffor[2]-48;

    		HAL_UART_Transmit_IT(&huart2, napis1, sizeof(napis1));
    		HAL_Delay(20);

    	    sprintf(buffor, "%d", x);


   	    	HAL_UART_Transmit_IT(&huart2, (uint8_t*)x, sizeof(x));

    		buffor[3]=5;
    	}
    	jest_buffor=0;

    }
//------------------------------------------------------------------------------------------
    /* USER CODE END WHILE */

    /* USER CODE BEGIN 3 */
  }
  /* USER CODE END 3 */
}

/**
  * @brief System Clock Configuration
  * @retval None
  */
void SystemClock_Config(void)
{
  RCC_OscInitTypeDef RCC_OscInitStruct = {0};
  RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};

  /** Configure the main internal regulator output voltage
  */
  __HAL_RCC_PWR_CLK_ENABLE();
  __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE2);

  /** Initializes the RCC Oscillators according to the specified parameters
  * in the RCC_OscInitTypeDef structure.
  */
  RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSI|RCC_OSCILLATORTYPE_LSI;
  RCC_OscInitStruct.HSIState = RCC_HSI_ON;
  RCC_OscInitStruct.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;
  RCC_OscInitStruct.LSIState = RCC_LSI_ON;
  RCC_OscInitStruct.PLL.PLLState = RCC_PLL_ON;
  RCC_OscInitStruct.PLL.PLLSource = RCC_PLLSOURCE_HSI;
  RCC_OscInitStruct.PLL.PLLM = 8;
  RCC_OscInitStruct.PLL.PLLN = 72;
  RCC_OscInitStruct.PLL.PLLP = RCC_PLLP_DIV2;
  RCC_OscInitStruct.PLL.PLLQ = 7;
  if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK)
  {
    Error_Handler();
  }

  /** Initializes the CPU, AHB and APB buses clocks
  */
  RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_HCLK|RCC_CLOCKTYPE_SYSCLK
                              |RCC_CLOCKTYPE_PCLK1|RCC_CLOCKTYPE_PCLK2;
  RCC_ClkInitStruct.SYSCLKSource = RCC_SYSCLKSOURCE_PLLCLK;
  RCC_ClkInitStruct.AHBCLKDivider = RCC_SYSCLK_DIV1;
  RCC_ClkInitStruct.APB1CLKDivider = RCC_HCLK_DIV2;
  RCC_ClkInitStruct.APB2CLKDivider = RCC_HCLK_DIV1;

  if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_2) != HAL_OK)
  {
    Error_Handler();
  }
}

/* USER CODE BEGIN 4 */
void jj_UART2_Print(uint8_t *Message) {

	HAL_UART_Transmit_IT( &huart2 , Message , strlen ( (char*) Message ) );
}





//---------------------------------------PRZERWANIA
void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin) {
	uint16_t x;
	x = GPIO_Pin;
	if (GPIO_Pin == GPIO_PIN_13) {
		jj_Lcd_Screen++;
		if (jj_Lcd_Screen > 5)
			jj_Lcd_Screen = 1;

	}

	if (GPIO_Pin == GPIO_PIN_4) {
		jj_Lcd_Screen = 1;
	}

	if (GPIO_Pin == GPIO_PIN_15) {
		jj_Lcd_Screen = 2;
	}

}
//---------------------------------------------------------------


//----------------------------------------------------------------------------------------------------------------------------------------------
void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart)
{


	HAL_UART_Receive_IT(&huart2	, &znak	, 1	);

}




//----------------------------------------------------------------------------------------------------------
void HAL_TIM_IC_CaptureCallback(TIM_HandleTypeDef *htim)
{
	if ( htim->Channel 		==	HAL_TIM_ACTIVE_CHANNEL_4)
		{
			jj_Measure_Sensor_1();
		}

	if ( htim->Channel 		==	HAL_TIM_ACTIVE_CHANNEL_1)
		{
			jj_Measure_Sensor_2();
		}

}
//-----------------------------------------------------------------------------------------------------------
void HAL_TIM_PWM_PulseFinishedHalfCpltCallback(TIM_HandleTypeDef *htim)
{


}




void HAL_TIM_PWM_PulseFinishedCallback(TIM_HandleTypeDef *htim)
{

	if	(htim->Instance ==TIM1)
	{
			x=11;

	}




	if	(htim->Instance ==TIM3)
	{
		jj_val_Tim3_20_ms ++;

		if ( jj_val_Tim3_20_ms == 500 )
		{

			jj_val_Tim3_1000ms ++;
			jj_val_Tim3_20_ms = 0;
		}


	}



	if (htim->Instance	==	TIM5)
	{
		dioda++;
	}

	if (htim->Instance	==	TIM4)
	{
		dioda++;
	}


	dioda++;
	if ( dioda>= 30)
	 {
		 dioda= 0 ;
	 }

	if ( dioda == 25)
	{
//	 HAL_GPIO_TogglePin(Led2_GPIO_Port, Led2_Pin);

	}


}



//--------------------------------------------------------------------------------------
void HAL_TIM_OC_DelayElapsedCallback(TIM_HandleTypeDef *htim)
{


}
//------------------------------------------------------


//----------------------------------------------------------------------------------------------------

void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim)
{
//------------------------------------------------------------------------------------------------ TIMER 4
	if	(htim->Instance ==TIM3)
	{
		x=20;

	}



	if	(htim->Instance ==TIM4)
	{


	}

//------------------------------------------------------------------------------------------------ TIMER 10
	if (htim->Instance == TIM1) {

		x=20;

	}
//---------------------------------------------------------------------
	if (htim->Instance == TIM9) {



		HAL_GPIO_TogglePin(Led2_GPIO_Port, Led2_Pin);

	}
//-----------------------------------------------------------------------------------------

	if (htim->Instance == TIM10) {

		Licznik_TIMM10 ++;

	}


//-------------------------------------------------------------------------------------------------	TIMER 11
	if( htim->Instance == TIM11)
	{

 	//	HAL_GPIO_TogglePin(Led2_GPIO_Port, Led2_Pin);

        Licznik_TIM11 ++;







	}
//---------------------------------------------------------------------------------------------------
};

/* USER CODE END 4 */

/**
  * @brief  This function is executed in case of error occurrence.
  * @retval None
  */
void Error_Handler(void)
{
  /* USER CODE BEGIN Error_Handler_Debug */
  /* User can add his own implementation to report the HAL error return state */
  __disable_irq();
  while (1)
  {
  }
  /* USER CODE END Error_Handler_Debug */
}

#ifdef  USE_FULL_ASSERT
/**
  * @brief  Reports the name of the source file and the source line number
  *         where the assert_param error has occurred.
  * @param  file: pointer to the source file name
  * @param  line: assert_param error line source number
  * @retval None
  */
void assert_failed(uint8_t *file, uint32_t line)
{
  /* USER CODE BEGIN 6 */
  /* User can add his own implementation to report the file name and line number,
     ex: printf("Wrong parameters value: file %s on line %d\r\n", file, line) */
  /* USER CODE END 6 */
}
#endif /* USE_FULL_ASSERT */
