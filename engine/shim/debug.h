/* Browser build: no cycle counter. */
#ifndef INC_DEBUG_DEBUG_H_
#define INC_DEBUG_DEBUG_H_
#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
static inline uint32_t Debug_CPUCycles(void) { return 0u; }
#endif
