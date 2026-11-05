/* Browser build: CMSIS-DSP's real FFT (arm_rfft_fast_f32), same packed format and scaling.
 * Forward: out[0] = Re X0, out[1] = Re X(N/2), out[2k], out[2k+1] = Re, Im of Xk (k = 1 .. N/2-1).
 * Inverse: takes that format, returns the real signal scaled by 1/N. */
#ifndef SHIM_ARM_MATH_H
#define SHIM_ARM_MATH_H
#include <stdint.h>
typedef float float32_t;
typedef enum { ARM_MATH_SUCCESS = 0, ARM_MATH_ARGUMENT_ERROR = -1 } arm_status;
typedef struct { uint16_t fftLenRFFT; } arm_rfft_fast_instance_f32;
#ifndef PI
#define PI 3.14159265358979f
#endif
arm_status arm_rfft_fast_init_f32(arm_rfft_fast_instance_f32 *S, uint16_t fftLen);
arm_status arm_rfft_fast_init_2048_f32(arm_rfft_fast_instance_f32 *S);
void arm_rfft_fast_f32(const arm_rfft_fast_instance_f32 *S, float32_t *p, float32_t *pOut, uint8_t ifftFlag);
#endif
