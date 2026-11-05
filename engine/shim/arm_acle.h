/* Browser build: the ARM DSP instructions the int8 kernels use, in plain C with the same results. */
#ifndef SHIM_ARM_ACLE_H
#define SHIM_ARM_ACLE_H
#include <stdint.h>
static inline int32_t __ssat(int32_t x, uint32_t bits)
{
	int32_t hi = (int32_t)((1u << (bits - 1u)) - 1u), lo = -hi - 1;
	return x > hi ? hi : (x < lo ? lo : x);
}
static inline int32_t __smlad(uint32_t a, uint32_t b, int32_t c)
{
	return (int32_t)((uint32_t)c + (uint32_t)((int32_t)(int16_t)a * (int16_t)b) + (uint32_t)((int32_t)(int16_t)(a >> 16) * (int16_t)(b >> 16)));
}
static inline int32_t __smlabb(uint32_t a, uint32_t b, int32_t c) { return (int32_t)((uint32_t)c + (uint32_t)((int32_t)(int16_t)a * (int16_t)b)); }
static inline int32_t __smlatt(uint32_t a, uint32_t b, int32_t c) { return (int32_t)((uint32_t)c + (uint32_t)((int32_t)(int16_t)(a >> 16) * (int16_t)(b >> 16))); }
#endif
