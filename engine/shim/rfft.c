/* Browser build: arm_rfft_fast_f32 (see arm_math.h) as a plain complex FFT of the full length. */
#include "arm_math.h"
#include <math.h>
#include <string.h>

#define RFFT_MAX 2048u
static float re[RFFT_MAX], im[RFFT_MAX];
static float tw_cos[RFFT_MAX / 2u], tw_sin[RFFT_MAX / 2u]; // e^(-2 pi i k / RFFT_MAX), shared by every length
static int tw_ready;

arm_status arm_rfft_fast_init_f32(arm_rfft_fast_instance_f32 *S, uint16_t fftLen)
{
	if (fftLen < 32u || fftLen > RFFT_MAX || (fftLen & (fftLen - 1u))) return ARM_MATH_ARGUMENT_ERROR;
	S->fftLenRFFT = fftLen;
	if (!tw_ready) {
		for (uint32_t k = 0u; k < RFFT_MAX / 2u; k++) { double a = -2.0 * 3.14159265358979323846 * (double)k / (double)RFFT_MAX; tw_cos[k] = (float)cos(a); tw_sin[k] = (float)sin(a); }
		tw_ready = 1;
	}
	return ARM_MATH_SUCCESS;
}
arm_status arm_rfft_fast_init_2048_f32(arm_rfft_fast_instance_f32 *S) { return arm_rfft_fast_init_f32(S, 2048u); }

static void fft(uint32_t n, int inverse)
{
	for (uint32_t i = 1u, j = 0u; i < n; i++) {
		uint32_t bit = n >> 1;
		for (; j & bit; bit >>= 1) j ^= bit;
		j ^= bit;
		if (i < j) { float t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
	}
	for (uint32_t len = 2u; len <= n; len <<= 1) {
		uint32_t stride = RFFT_MAX / len;
		for (uint32_t k = 0u; k < len / 2u; k++) {
			float wr = tw_cos[k * stride], wi = inverse ? -tw_sin[k * stride] : tw_sin[k * stride];
			for (uint32_t i = k; i < n; i += len) {
				uint32_t j = i + len / 2u;
				float xr = re[j] * wr - im[j] * wi, xi = re[j] * wi + im[j] * wr;
				re[j] = re[i] - xr; im[j] = im[i] - xi;
				re[i] += xr; im[i] += xi;
			}
		}
	}
}

void arm_rfft_fast_f32(const arm_rfft_fast_instance_f32 *S, float32_t *p, float32_t *pOut, uint8_t ifftFlag)
{
	uint32_t n = S->fftLenRFFT, h = n / 2u;
	if (!ifftFlag) {
		for (uint32_t i = 0u; i < n; i++) { re[i] = p[i]; im[i] = 0.0f; }
		fft(n, 0);
		pOut[0] = re[0]; pOut[1] = re[h];
		for (uint32_t k = 1u; k < h; k++) { pOut[2u * k] = re[k]; pOut[2u * k + 1u] = im[k]; }
	} else {
		re[0] = p[0]; im[0] = 0.0f; re[h] = p[1]; im[h] = 0.0f;
		for (uint32_t k = 1u; k < h; k++) {
			re[k] = p[2u * k]; im[k] = p[2u * k + 1u];
			re[n - k] = p[2u * k]; im[n - k] = -p[2u * k + 1u]; // conjugate symmetry
		}
		fft(n, 1);
		float s = 1.0f / (float)n;
		for (uint32_t i = 0u; i < n; i++) pOut[i] = re[i] * s;
	}
}
