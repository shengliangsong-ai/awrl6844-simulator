#ifndef AWRL6844_BIST_DSP_H
#define AWRL6844_BIST_DSP_H

/**
 * =====================================================================================
 * Texas Instruments AWRL6844 / IWR6843 Automotive mmWave Radar
 * Power-On Built-In Self-Test (BIST) Header File
 * =====================================================================================
 * Standard: ISO 26262 ASIL-B Safety Self-Test Compliance
 * RAM Budget: <= 2,048 Bytes Scratchpad RAM
 * =====================================================================================
 */

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/* -----------------------------------------------------------------------------------
 * Configuration & Memory Constraints
 * ----------------------------------------------------------------------------------- */
#define BIST_ADC_SAMPLES       256U     /* 256 samples per chirp */
#define BIST_BYTES_PER_SAMPLE  4U       /* 16-bit Real + 16-bit Imaginary (Q15) */
#define BIST_PING_BUFFER_SIZE  (BIST_ADC_SAMPLES * BIST_BYTES_PER_SAMPLE) /* 1,024 Bytes */
#define BIST_PONG_BUFFER_SIZE  (BIST_ADC_SAMPLES * BIST_BYTES_PER_SAMPLE) /* 1,024 Bytes */

/* Hardware CRC-32 Polynomial (IEEE 802.3 / EDMA CRC engine): 0xEDB88320 (reversed) */
#define CRC32_POLYNOMIAL       0xEDB88320U

/* BIST Status Bitmasks */
#define BIST_PASS                  (0x00000000U)
#define BIST_ERR_PEAK1_MISMATCH    (0x00000001U)
#define BIST_ERR_PEAK2_MISMATCH    (0x00000002U)
#define BIST_ERR_SQNR_DEGRADED     (0x00000004U)
#define BIST_ERR_CRC_MISMATCH      (0x00000008U)

/* Radar In-Cabin Parameters */
#define RADAR_MAX_RANGE_M      5.0f     /* 5.0m maximum range */
#define TARGET1_RANGE_M        0.80f    /* Front passenger occupant (Adult) */
#define TARGET1_AMP            18000    /* Q15 amplitude */

#define TARGET2_RANGE_M        1.40f    /* Rear seat occupant (Infant breathing) */
#define TARGET2_AMP            8500     /* Q15 amplitude */

typedef struct {
    int16_t real;
    int16_t imag;
} Complex16;

typedef struct {
    uint32_t status_code;
    uint16_t exp_peak1_bin;
    uint16_t act_peak1_bin;
    uint16_t exp_peak2_bin;
    uint16_t act_peak2_bin;
    float    measured_sqnr_db;
    uint32_t act_crc32;
    uint32_t exp_crc32;
} BIST_Report;

/* -----------------------------------------------------------------------------------
 * API Functions
 * ----------------------------------------------------------------------------------- */

/**
 * @brief Synthesizes single-chirp ADC samples on-the-fly using phase accumulation (Zero Flash).
 * @param ping_buf Pointer to 1,024-byte input scratchpad buffer.
 */
void BIST_GenerateSingleChirpADC(Complex16 *ping_buf);

/**
 * @brief Analytically calculates expected peak bin using closed-form radar integer arithmetic.
 * @param range_meters Distance to target in meters.
 * @return Expected FFT range bin index.
 */
uint16_t BIST_CalculateExpectedPeakBin(float range_meters);

/**
 * @brief Executes 1D Range FFT (Hanning window + Radix-2 fixed-point butterfly).
 * @param in_buf Pointer to 1,024-byte ADC sample buffer.
 * @param out_buf Pointer to 1,024-byte Range FFT output buffer.
 */
void BIST_Execute1DRangeFFT(const Complex16 *in_buf, Complex16 *out_buf);

/**
 * @brief Computes IEEE 802.3 CRC-32 over memory buffer (matches hardware EDMA engine).
 */
uint32_t BIST_ComputeBufferCRC32(const uint8_t *data, size_t length);

/**
 * @brief Master 3-Tier Power-On BIST Routine.
 * @param expected_golden_crc Expected 32-bit hardware signature (pass 0 for discovery mode).
 * @return BIST_Report with test metrics and pass/fail bitfield.
 */
BIST_Report BIST_RunSelfTest(uint32_t expected_golden_crc);

#ifdef __cplusplus
}
#endif

#endif /* AWRL6844_BIST_DSP_H */
