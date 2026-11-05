#ifndef INC_DEBUG_STAGE_TIMING_H_
#define INC_DEBUG_STAGE_TIMING_H_
#include <stdint.h>
#include "debug.h"
#define STAGE_TIMING_AWEIGHT 0
#define STAGE_TIMING_RUN(stage, call) do { call; } while (0)
static inline void StageTiming_Add(int stage, uint32_t cycles) { (void)stage; (void)cycles; }
#endif
