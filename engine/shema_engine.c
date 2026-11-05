/*
 * shema_engine.c
 *
 * The Shema firmware's own algorithms, built for the browser (WebAssembly) so the Sandbox can run them on
 * the street it simulates. The page hands over one 32 ms buffer of the four mics at a time (48 kHz, int32,
 * interleaved CH1..CH4, the same layout as the SAI DMA buffer) and reads back what the stages made of it:
 *
 *   a_weighting.c      AWeight_MeasureLevel  - LAeq / LAS / LAF / LAI of the buffer, from CH1
 *   doa_srp.c          DoaSrp_*              - SRP-PHAT over the mic pairs, a track point every 0.5 s
 *   classifier_mel.c   ClassifierMel_*       - decimate CH1 to 16 kHz, one mel column per buffer
 *   mel_cnn_int8_*.c   mel_cnn8_*            - the int8 CNN on every 2 s window (63 columns)
 *
 * The glue mirrors doa.c and classifier.c: DOA weights each buffer by how far it is over the quietest buffer
 * of the detection (DOA_WEIGHT_MARGIN_dB), a detection starts with a 1 s pre-roll, and windows do not overlap.
 * What the page still decides itself: when a detection opens and closes, and the ambient.
 *
 * None of the firmware files are changed: shim/ stands in for the HAL, CMSIS-DSP's FFT and the ARM DSP
 * instructions. See build.sh.
 */

#include <stdint.h>
#include <stdbool.h>
#include <string.h>
#include <math.h>

#include "main.h"
#include "a_weighting.h"
#include "doa_srp.h"
#include "classifier_mel.h"
#include "classifier_net.h"
#include "settings.h"
#include "timestamp.h"

#define EXPORT(name) __attribute__((export_name(name)))

#define ENGINE_CAL_dB			(120.0f) // calibration offset: 0 dBFS = 120 dB(A) (the page scales its signals to match)
#define ENGINE_PREROLL_BUFFERS	(31u) // THRESHOLD_DETECTOR_PREROLL_MS (1 s) in 32 ms buffers
#define ENGINE_DOA_MARGIN_dB	(6.0f) // DOA_WEIGHT_MARGIN_dB (doa.h)

/* ---- the settings and the clock the modules read ---- */
static MicGeometry_t mics = { .count = 4u, .mount_height_mm = 2500u, .x_mm = { -75.0f, -25.0f, 25.0f, 75.0f } }; // the default: 4 in a line, 50 mm apart
float Settings_GetCalOffsetdB(void) { return ENGINE_CAL_dB; }
uint32_t Settings_GetDayStartHour(void) { return NOISE_DAY_START_HOUR; }
uint32_t Settings_GetNightStartHour(void) { return NOISE_NIGHT_START_HOUR; }
NoiseArea_t Settings_GetArea(void) { return NOISE_AREA_SUBURBAN; }
float Settings_GetLimitLAeq(NoiseArea_t area, NoiseTimePeriod_t period) { (void)area; (void)period; return 0.0f; }
const MicGeometry_t *Settings_GetMicGeometry(void) { return &mics; }
bool Timestamp_IsValid(void) { return false; }
void Timestamp_ToDateTime(uint64_t unix_ms, int32_t offset_minutes, Timestamp_DateTime_t *dt) { (void)unix_ms; (void)offset_minutes; memset(dt, 0, sizeof(*dt)); }

/* ---- the page's buffer ---- */
static int32_t buffer[MIC_BUFF_SIZE];
static int32_t preroll[ENGINE_PREROLL_BUFFERS][MIC_BUFF_SIZE];
static float preroll_level[ENGINE_PREROLL_BUFFERS];
static uint32_t preroll_head, preroll_count;
static uint32_t buffer_count;

/* ---- results the page reads ---- */
static AWeightResult_t level;
static int32_t net_status = -1;
static bool window_ready;
static float probability[CLASSIFIER_NET_CLASSES];
static bool doa_open;
static uint32_t doa_position, doa_points;
static float noise_floor_dBA;
static bool noise_set;
static DoaSrpTrackPoint_t doa_point;
static bool doa_point_new;
static float doa_result[8];

/* ---- classifier: columns as in classifier.c ---- */
static float frame_audio[2u * CLASSIFIER_MEL_HOP];
static float block[CLASSIFIER_MEL_HOP];
static float columns[CLASSIFIER_MEL_FRAMES * CLASSIFIER_MEL_BANDS];
static uint32_t column_head, frames;
static bool warm_up = true;

EXPORT("engine_init") int32_t engine_init(void)
{
	AWeight_Init();
	DoaSrp_Init();
	bool mel = ClassifierMel_Init();
	bool net = ClassifierNet_Init(); // runs the firmware's self-test: 2 windows, every layer against the Python reference
	ClassifierMel_DecimatorReset();
	net_status = (mel && net) ? 0 : (mel ? ClassifierNet_Status() : -2);
	memset(columns, 0, sizeof(columns));
	column_head = frames = 0u;
	warm_up = true;
	preroll_head = preroll_count = buffer_count = 0u;
	doa_open = false;
	return net_status;
}

EXPORT("engine_buffer") int32_t *engine_buffer(void) { return buffer; }

static void classify_window(void)
{
	float scale;
	int32_t zero_point;
	ClassifierNet_GetInputQuantisation(&scale, &zero_point);
	ClassifierMel_QuantiseRing(columns, column_head, scale, zero_point, ClassifierNet_Input(), NULL);
	if (!ClassifierNet_Run()) return;
	const int8_t *out = ClassifierNet_Output();
	for (uint32_t i = 0u; i < CLASSIFIER_NET_CLASSES; i++) probability[i] = ClassifierNet_OutputToProbability(out[i]);
	window_ready = true;
}

static void classifier_add(void)
{
	(void)ClassifierMel_Decimate(buffer, MIC_BUFF_SAMPLES_PER_CHANNEL, MIC_BUFF_CHANNELS, 0u, block);
	if (warm_up) { memcpy(&frame_audio[CLASSIFIER_MEL_HOP], block, sizeof(block)); warm_up = false; return; }
	memmove(frame_audio, &frame_audio[CLASSIFIER_MEL_HOP], CLASSIFIER_MEL_HOP * sizeof(float));
	memcpy(&frame_audio[CLASSIFIER_MEL_HOP], block, sizeof(block));
	ClassifierMel_Column(frame_audio, &columns[column_head * CLASSIFIER_MEL_BANDS]);
	column_head = (column_head + 1u) % CLASSIFIER_MEL_FRAMES;
	if (++frames % CLASSIFIER_MEL_FRAMES == 0u) classify_window(); // a full window, no overlap
}

/* doa.c: weight = how far the buffer is over the quietest one of the detection, minus 6 dB */
static float doa_weight(float level_dBA)
{
	if (!noise_set || level_dBA < noise_floor_dBA) { noise_floor_dBA = level_dBA; noise_set = true; }
	float snr = level_dBA - noise_floor_dBA - ENGINE_DOA_MARGIN_dB;
	return snr <= 0.0f ? 0.0f : 1.0f - powf(10.0f, -snr / 10.0f);
}

static void doa_add(const int32_t *buf, float level_dBA)
{
	DoaSrp_AddBuffer(buf, MIC_BUFF_CHANNELS, doa_weight(level_dBA), doa_position++);
	while (DoaSrp_TrackStep()) { }
	DoaSrpTrackPoint_t point;
	uint32_t made = DoaSrp_LastPoint(&point);
	if (made != doa_points) { doa_points = made; doa_point = point; doa_point_new = true; }
}

/* detection: 1 = open (the page's detector says loud), 0 = closed. Returns 1 when a new 2 s window was classified. */
EXPORT("engine_process") int32_t engine_process(int32_t detection)
{
	window_ready = false;
	doa_point_new = false;
	buffer_count++;

	AWeight_MeasureLevel(buffer, MIC_BUFF_CHANNELS, MIC_BUFF_SAMPLES_PER_CHANNEL, 0u, &level);
	if (net_status == 0) classifier_add();

	if (detection && !doa_open) // a detection opens: start DOA with the pre-roll, as the firmware does
	{
		DoaSrpGeometry_t g = { .count = mics.count };
		for (uint32_t m = 0u; m < mics.count; m++) { g.x_m[m] = mics.x_mm[m] / 1000.0f; g.y_m[m] = mics.y_mm[m] / 1000.0f; }
		doa_open = DoaSrp_Begin(&g);
		doa_position = doa_points = 0u;
		noise_set = false;
		memset(doa_result, 0, sizeof(doa_result));
		uint32_t first = (preroll_head + ENGINE_PREROLL_BUFFERS - preroll_count) % ENGINE_PREROLL_BUFFERS;
		for (uint32_t i = 0u; doa_open && i < preroll_count; i++)
		{
			uint32_t slot = (first + i) % ENGINE_PREROLL_BUFFERS;
			doa_add(preroll[slot], preroll_level[slot]);
		}
	}
	if (doa_open && detection) doa_add(buffer, level.level_dBA);
	if (doa_open && !detection) // closed: the whole detection's direction
	{
		while (!DoaSrp_FinishStep()) { }
		const DoaSrpResult_t *r = DoaSrp_GetResult();
		doa_result[0] = r->valid ? 1.0f : 0.0f; doa_result[1] = r->bearing_deg; doa_result[2] = r->confidence;
		doa_result[3] = r->uncertainty_deg; doa_result[4] = r->moving ? 1.0f : 0.0f; doa_result[5] = r->span_deg;
		doa_result[6] = r->fallback ? 1.0f : 0.0f; doa_result[7] = (float)r->track_count;
		doa_open = false;
	}

	// keep the last second for the next detection's pre-roll
	memcpy(preroll[preroll_head], buffer, sizeof(buffer));
	preroll_level[preroll_head] = level.level_dBA;
	preroll_head = (preroll_head + 1u) % ENGINE_PREROLL_BUFFERS;
	if (preroll_count < ENGINE_PREROLL_BUFFERS) preroll_count++;

	return window_ready ? 1 : 0;
}

/* levels of the last buffer: [LAeq, LAS, LAF, LAI, LAIeq, LAFmax, peak dBFS] */
static float levels_out[7];
EXPORT("engine_levels") float *engine_levels(void)
{
	levels_out[0] = level.level_dBA; levels_out[1] = level.slow_dBA; levels_out[2] = level.fast_dBA;
	levels_out[3] = level.impulse_dBA; levels_out[4] = level.LAIeq_dBA; levels_out[5] = level.LAFmax_dBA; levels_out[6] = level.peak_dBFS;
	return levels_out;
}
EXPORT("engine_probabilities") float *engine_probabilities(void) { return probability; }
EXPORT("engine_class_name") const char *engine_class_name(int32_t i) { return ClassifierNet_ClassName((uint32_t)i); }
EXPORT("engine_classes") int32_t engine_classes(void) { return CLASSIFIER_NET_CLASSES; }
/* the newest track point: [new (0/1), bearing, confidence, weight, time s] */
static float point_out[5];
EXPORT("engine_point") float *engine_point(void)
{
	point_out[0] = doa_point_new ? 1.0f : 0.0f; point_out[1] = doa_point.bearing_deg; point_out[2] = doa_point.confidence;
	point_out[3] = doa_point.weight; point_out[4] = doa_point.time_s;
	return point_out;
}
/* the last finished detection: [valid, bearing, confidence, uncertainty, moving, span, fallback, track points] */
EXPORT("engine_doa_result") float *engine_doa_result(void) { return doa_result; }
EXPORT("engine_mic_x_mm") float *engine_mic_x_mm(void) { return mics.x_mm; }
EXPORT("engine_cal_db") float engine_cal_db(void) { return ENGINE_CAL_dB; }

/* A-weighted level in dBFS of a float signal in [-1, 1] at 48 kHz, through the firmware's own A filter.
 * The page uses it once per recording to set its level. Only counts 32 ms blocks within 20 dB of the loudest,
 * so the quiet gaps of a call do not pull it down. */
static float scratch[MIC_BUFF_SAMPLES_PER_CHANNEL];
static int32_t scratch_in[MIC_BUFF_SAMPLES_PER_CHANNEL];
static float block_energy[4096];
EXPORT("engine_scratch") float *engine_scratch(void) { return scratch; }
static AWeightState_t measure_state;
static uint32_t measure_blocks;
EXPORT("engine_measure_begin") void engine_measure_begin(void) { AWeight_ResetState(&measure_state); measure_blocks = 0u; }
/* call with up to 1536 samples in engine_scratch() */
EXPORT("engine_measure_add") void engine_measure_add(int32_t n)
{
	for (int32_t i = 0; i < n; i++) scratch_in[i] = (int32_t)(scratch[i] * 1073741824.0f); // -6 dBFS headroom
	AWeight_FilterBlock(&measure_state, scratch_in, 1u, (uint32_t)n, scratch);
	double e = 0.0;
	for (int32_t i = 0; i < n; i++) e += (double)scratch[i] * scratch[i];
	if (measure_blocks < 4096u) block_energy[measure_blocks++] = (float)(e / (double)(n > 0 ? n : 1));
}
EXPORT("engine_measure_end") float engine_measure_end(void)
{
	float peak = 0.0f; double sum = 0.0; uint32_t count = 0u;
	for (uint32_t i = 3u; i < measure_blocks; i++) peak = fmaxf(peak, block_energy[i]); // skip the filter's settling
	for (uint32_t i = 3u; i < measure_blocks; i++) if (block_energy[i] >= peak * 0.01f) { sum += block_energy[i]; count++; }
	if (!count || sum <= 0.0) return -150.0f;
	return 10.0f * log10f((float)(sum / count) / (2147483648.0f * 2147483648.0f)) + 6.0206f; // back to full scale = 1.0
}
