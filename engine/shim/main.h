/* Browser build: the parts of main.h the algorithm modules use (no HAL). */
#ifndef __MAIN_H
#define __MAIN_H
#include <stdint.h>
#include <stdbool.h>
typedef struct __I2C_HandleTypeDef I2C_HandleTypeDef; /* only passed as a pointer */
#define MIC_SAMPLE_RATE_HZ				(48000U)
#define MIC_BUFF_CHANNELS				(4U)
#define MIC_BUFF_SAMPLES_PER_CHANNEL	(1536U)
#define MIC_BUFF_SIZE					(MIC_BUFF_SAMPLES_PER_CHANNEL * MIC_BUFF_CHANNELS)
#define MIC_BUFF_SIZE_MS				((MIC_BUFF_SAMPLES_PER_CHANNEL * 1000U) / MIC_SAMPLE_RATE_HZ)
#endif
