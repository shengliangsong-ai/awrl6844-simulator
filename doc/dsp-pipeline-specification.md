# AWRL6844 mmWave Radar DSP & Hardware Accelerator Pipeline Specification

This document provides a comprehensive register-level and dataflow specification of the **Hardware Accelerator (HWA 1.2)** and **C66x Fixed/Floating-Point DSP** processing chain for the Texas Instruments **AWRL6844** (and **AWRL6888**) Single-Chip mmWave Radar SoC.

---

## 1. Executive Processing Chain Architecture

The AWRL6844 signal processing pipeline converts continuous-wave Frequency-Modulated (FMCW) radar reflections into classified 3D occupant point clouds, micro-Doppler vital sign metrics, and ASIL-B vehicle telematics:

```mermaid
flowchart LR
    subgraph HW0["RF & Digitization"]
        S0["<b>Stage 0: Analog IF Rx</b><br/>ADC Sampling at 25 Msps<br/><i>Base: ACCEL_MEM (0x05100000)</i>"]
    end

    subgraph HW1["HWA 1.2 Accelerator Engine"]
        S1["<b>Stage 1: 1D Range FFT</b><br/>Hanning Window & DC Null<br/><i>Memory: HWA M0-M3 RAM</i>"]
        S2["<b>Stage 2: 2D Doppler FFT</b><br/>Radar Cube Slow-Time FFT<br/><i>Memory: DSS L3 (0x88000000)</i>"]
        S3["<b>Stage 3: CFAR Detection</b><br/>Log-Mag & Peak Extract<br/><i>Memory: DSS L2 (0x80800000)</i>"]
    end

    subgraph HW2["DSP & ARM Subsystems"]
        S4["<b>Stage 4: DSP Clustering & AoA</b><br/>C66x DSP + R5F Tracking<br/><i>Memory: DSS L2 / APP TCMA</i>"]
        S5["<b>Stage 5: Vehicle Gateway</b><br/>CAN-FD & PMIC Telemetry<br/><i>Memory: APP_CANCFG (0x52000000)</i>"]
    end

    S0 -->|Raw ADC Samples<br/>256 KB| S1
    S1 -->|1D Range Profile<br/>256 KB| S2
    S2 -->|3D Radar Cube<br/>128/256 KB| S3
    S3 -->|Candidate Peaks<br/>1 KB| S4
    S4 -->|Occupant Tracks<br/>~500 B| S5

    style HW0 fill:#0f172a,stroke:#38bdf8,stroke-width:1.5px,color:#f8fafc
    style HW1 fill:#0f172a,stroke:#818cf8,stroke-width:1.5px,color:#f8fafc
    style HW2 fill:#0f172a,stroke:#34d399,stroke-width:1.5px,color:#f8fafc
    style S0 fill:#1e293b,stroke:#0284c7,stroke-width:1px,color:#e0f2fe
    style S1 fill:#1e293b,stroke:#6366f1,stroke-width:1px,color:#e0e7ff
    style S2 fill:#1e293b,stroke:#6366f1,stroke-width:1px,color:#e0e7ff
    style S3 fill:#1e293b,stroke:#6366f1,stroke-width:1px,color:#e0e7ff
    style S4 fill:#1e293b,stroke:#059669,stroke-width:1px,color:#d1fae5
    style S5 fill:#1e293b,stroke:#059669,stroke-width:1px,color:#d1fae5
```

---

## 2. Master DSP Pipeline Stage Input / Output Reference Table

The table below details the input signals, hardware units, test vector byte sizes, data word-lengths, dimensions, memory topologies, mathematical transformations, expected output byte sizes, and comparison validation criteria for a standalone DSP self-test:

| Stage # | Stage Name | Hardware Execution Unit | Input Signal & Format | Input Data Size (Bytes) | Output Artifact & Format | Expected Output Size (Bytes) | Target Memory Subsystem & Address | Mathematical Transform / Kernel | Self-Test Comparison & Acceptance Criteria | In-Cabin Application Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Stage 0** | **ADC Buffer & FMCW Rx** | Analog RF Frontend + 12-bit Pipeline ADC + CBUFF | Reflected 57–64 GHz FMCW echo downconverted to IF; 12-bit signed ADC samples packed in 16-bit complex words ($I + jQ$); $[N_{rx}=4] \times [N_{chirp}=128] \times [N_{adc}=256]$ | **256 KB** (262,144 B) *(4 B/sample)* | Digitized Raw ADC Samples in ACCEL_MEM ping-pong buffers | **256 KB** (262,144 B) | `HWA ACCEL_MEM` (`0x05100000`) via CBUFF / EDMA | $f_{IF} = \frac{2 S R}{c} + \frac{2 v}{\lambda}$ | **Bit-exact DMA transfer**: Verify CBUFF write pointer, EDMA PaRAM completion, and CRC-32 golden hash match. | Captures electromagnetic reflections from cabin structures, seats, and passengers. |
| **Stage 1** | **1D Range FFT (Range Profile)** | Hardware Accelerator (HWA 1.2) FFT Engine | 16-bit signed complex I/Q ADC samples from `ACCEL_MEM`; 256 samples per chirp | **256 KB** (262,144 B) | 1D Range Profile: 24-bit fixed-point Complex I/Q (packed as 32-bit words per bin); $[4\text{ Rx}] \times [128\text{ chirps}] \times [128\text{ valid range bins}]$ | **256 KB** (packed) or **512 KB** (unpacked 32-bit complex) | HWA Internal Ping-Pong RAM banks (`M0`, `M1`, `M2`, `M3`) | $X[k] = \sum_{n=0}^{N-1} (x[n] \cdot w[n]) e^{-j\frac{2\pi}{N}nk}$ with Hanning window & DC offset nulling | **Peak Bin exactness**: Peak index matches $\pm 0$ bins; **SQNR $\ge 45\text{ dB}$** relative to IEEE double-precision reference float; Peak magnitude error $\le 1.0\text{ dB}$. | Resolves radial distance ($R = \frac{c \cdot f_{IF}}{2 S}$). Separates front seats (0.8m) from rear seats (1.4m). |
| **Stage 2** | **2D Doppler FFT (Radar Cube)** | HWA 1.2 Accelerator + EDMA 3D Transpose Engine | 1D Range FFT results transposed across chirps: $[4\text{ Rx}] \times [128\text{ range}] \times [128\text{ chirps}]$ | **256 KB** | 3D Range-Doppler Radar Cube: 24-bit Complex I/Q or 16-bit log-magnitude ($0.0625\text{ dB/LSB}$); $[4\text{ Rx}] \times [128\text{ Range Bins}] \times [64\text{ Doppler Bins}]$ | **128 KB** (16-bit Log-Mag) or **256 KB** (Complex I/Q) | `DSS_L3` Shared RAM (`0x88000000`) - 512 KB Native + Dynamic L3 | $Y[m, k] = \sum_{p=0}^{M-1} X_{trans}[p, k] \cdot w_D[p] e^{-j\frac{2\pi}{M}pm}$ with Doppler centering shift | **Velocity Bin exactness**: Peak Doppler bin matches $\pm 0$ bins; Zero-Doppler static peak at center bin 32; **PSNR $\ge 42\text{ dB}$** against double-precision model. | Resolves relative velocity ($v = \frac{\lambda \cdot f_D}{2}$). Isolates static clutter ($0\text{ m/s}$) from breathing micro-Doppler ($0.1\text{--}0.4\text{ m/s}$). |
| **Stage 3** | **CFAR-CA Detection & Log-Mag** | HWA 1.2 CFAR Unit (Cell-Averaging Engine) | 2D Range-Doppler Heatmap slices from `DSS_L3`; 16-bit Log-Magnitude power | **16 KB** per virtual channel (16,384 B) | Sparse Candidate Peak List: Array of `CfarPeak` structs: `uint16 rangeIdx`, `uint16 dopplerIdx`, `uint16 peakPowerDb`, `uint16 noiseFloorDb` (8 B/peak, 1–32 peaks) | **8 to 256 Bytes** (Bounded test buffer: **1 KB**) | `DSS_L2` SRAM (`0x80800000`) via EDMA | $P_{CUT} > \frac{1}{N_{tr}} \sum_{i \in \text{Train}} P_i + T_{dB}$ with Guard Cell isolation | **Zero False Negatives**: 100% detection of injected target peaks; False Positive Rate $= 0$; Detected SNR matches reference within $\le 0.5\text{ dB}$. | Suppresses thermal noise, multipath ground bounce, and carpet reflections while flagging genuine biological targets. |
| **Stage 4** | **Clustering, AoA & Tracking** | TMS320C66x DSP Core (600 MHz) + ARM Cortex-R5F | Candidate CFAR peaks (32 peaks) + 4-channel complex antenna vectors $[N_{peaks}] \times [N_{virtual}=12]$ | **512 Bytes** | Tracked Occupant Objects & 3D Point Cloud: $[X, Y, Z, V_r, \text{SNR}]$ (20 B) + Object Tracks (ID, Bounding Box, Class, Confidence, 48 B) | **100 to 500 Bytes** | `DSS_L2` Scratchpad & `APPSS_TCMA` (`0x00018000`) | DBSCAN clustering + Capon MVDR / 3D FFT Angle of Arrival: $P(\theta, \phi) = \frac{1}{\mathbf{a}^H \mathbf{R}_{xx}^{-1} \mathbf{a}}$ + EKF tracking | **Position Tolerance**: Range $R \le \pm 0.05\text{ m}$, Angle $\theta \le \pm 2.0^\circ$, Radial velocity $v \le \pm 0.03\text{ m/s}$; Correct occupant classification (`Adult` / `Infant`). | Distinguishes adult vs. child safety seat, measures micro-respiration rates, and eliminates false positives. |
| **Stage 5** | **Vehicle Gateway & PMIC Safety** | MCAN Controller (CAN-FD), SCI/UART, ESM | Validated occupant classification and hardware health telemetry | **~64 Bytes** | Serialized CAN-FD 64-byte Frames (ISO 11898-1 at 5 Mbps) & hardware `nERROR_OUT` pin signaling | **64 to 128 Bytes** | `APP_CANCFG` (`0x52000000`), `APP_SCI` (`0x56010000`), PMIC interface | Serialization & CRC-16 / CRC-32 cyclic redundancy check | **Frame Check**: Exact payload byte match, valid CRC-16/32, transmission within $\le 100\ \mu\text{s}$, `nERROR_OUT` pin remains de-asserted high ($3.3\text{ V}$). | Triggers Child Presence Detection (CPD) alarm, Seat Belt Reminder (SBR), and smart airbag deployment. |

---

## 3. Standalone Self-Test (BIST) Specification & Implementation Guide

This section outlines how to configure, generate, and execute a deterministic standalone Built-In Self-Test (BIST) for the AWRL6844 DSP pipeline without requiring an RF anechoic chamber or live antenna hardware.

### 3.1 Test Vector Generation Recipe (Deterministic In-Cabin Target Scene)

Rather than injecting pseudorandom white noise, generate a **deterministic mathematical target scene** containing two synthetic targets:

- **Target 1 (Driver / Adult Front Seat)**:
  - Radial Range $R_1 = 0.8\text{ m}$
  - Radial Velocity $v_1 = +0.25\text{ m/s}$ (simulated chest-wall micro-motion)
  - Azimuth Angle $\theta_1 = -25^\circ$
  - Base Amplitude $A_1 = 1500\text{ ADC LSBs}$
- **Target 2 (Rear Seat Infant in Child Restraint System)**:
  - Radial Range $R_2 = 1.4\text{ m}$
  - Radial Velocity $v_2 = -0.15\text{ m/s}$
  - Azimuth Angle $\theta_2 = +20^\circ$
  - Base Amplitude $A_2 = 700\text{ ADC LSBs}$

#### Mathematical Signal Model for Stage 0 Test Vector Injection:
For receiver antenna $rx \in [0, N_{rx}-1]$, chirp index $c \in [0, N_{chirp}-1]$, and fast-time sample index $n \in [0, N_{adc}-1]$:

$$t_{\text{fast}} = \frac{n}{F_s} \quad \left(F_s = 25\text{ MHz}\right), \quad t_{\text{slow}} = c \cdot T_{\text{chirp}} \quad \left(T_{\text{chirp}} = 60\ \mu\text{s}\right)$$

$$f_{\text{beat}, i} = \frac{2 \cdot S \cdot R_i}{c_0}, \quad \phi_{\text{doppler}, i} = \frac{4\pi \cdot v_i \cdot t_{\text{slow}}}{\lambda}, \quad \phi_{\text{spatial}, i} = \frac{2\pi \cdot d \cdot rx \cdot \sin(\theta_i)}{\lambda}$$

$$\text{ADC}[rx, c, n] = \text{round}\left( \sum_{i=1}^{2} A_i \cdot \cos\left(2\pi f_{\text{beat}, i} t_{\text{fast}} + \phi_{\text{doppler}, i} + \phi_{\text{spatial}, i}\right) + j \sum_{i=1}^{2} A_i \cdot \sin\left(\dots\right) + \mathcal{N}_{\text{complex}}(0, \sigma) \right)$$

Pack the output as 16-bit signed integers ($Q15$ format) into a contiguous **256 KB** binary array.

---

### 3.2 Comparison & Verification Methodology

Due to fixed-point truncation and integer butterfly scaling in the HWA 1.2, floating-point equality (`==`) cannot be used. Apply the following multi-tier verification methods:

```mermaid
flowchart TD
    VEC["<b>Synthetic ADC Test Vector</b><br/>2 Targets (Adult & Infant) + Complex Noise (256 KB)"]

    subgraph DUAL["Dual Execution Paths"]
        DUT["<b>HWA 1.2 / DSP Pipeline (DUT)</b><br/>Fixed-point execution on silicon"]
        REF["<b>Double-Precision Sim Model (REF)</b><br/>64-bit IEEE float mathematical reference"]
    end

    VEC -->|Direct DMA Injection| DUT
    VEC -->|Simulation Input| REF

    OUT_DUT["<b>DUT Output Buffers</b><br/>1D FFT, Radar Cube, Peaks"]
    OUT_REF["<b>REF Output Buffers</b><br/>Golden Floating-Point Arrays"]

    DUT --> OUT_DUT
    REF --> OUT_REF

    subgraph CHECKS["Multi-Tier Verification Engine"]
        T1["<b>Tier 1: Peak Bin Exactness</b><br/>Range & Doppler Peak Error: ±0 bins"]
        T2["<b>Tier 2: Quantization Quality</b><br/>SQNR ≥ 45 dB & Peak Error ≤ 1.0 dB"]
        T3["<b>Tier 3: CFAR Confusion Matrix</b><br/>100% Detection (0 FP, 0 FN)"]
        T4["<b>Tier 4: Coordinate Tolerance</b><br/>ΔR ≤ 0.05m, Δθ ≤ 2.0°, Δv ≤ 0.03 m/s"]
        T5["<b>Tier 5: Golden CRC-32</b><br/>Exact 32-bit hardware hash match"]
    end

    OUT_DUT --> CHECKS
    OUT_REF --> CHECKS

    RESULT{"All Tiers Pass?"}
    CHECKS --> RESULT
    RESULT -->|Yes| PASS["<b>PASS</b><br/>Production / CI BIST Validated"]
    RESULT -->|No| FAIL["<b>FAIL</b><br/>Log SQNR delta & Pinpoint Stage Fault"]

    style VEC fill:#1e293b,stroke:#38bdf8,stroke-width:1.5px,color:#f8fafc
    style DUT fill:#1e293b,stroke:#818cf8,stroke-width:1.5px,color:#f8fafc
    style REF fill:#1e293b,stroke:#a78bfa,stroke-width:1.5px,color:#f8fafc
    style CHECKS fill:#0f172a,stroke:#64748b,stroke-width:1.5px,color:#f8fafc
    style T1 fill:#1e293b,stroke:#3b82f6,color:#e0f2fe
    style T2 fill:#1e293b,stroke:#3b82f6,color:#e0f2fe
    style T3 fill:#1e293b,stroke:#3b82f6,color:#e0f2fe
    style T4 fill:#1e293b,stroke:#3b82f6,color:#e0f2fe
    style T5 fill:#1e293b,stroke:#3b82f6,color:#e0f2fe
    style PASS fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#d1fae5
    style FAIL fill:#7f1d1d,stroke:#ef4444,stroke-width:2px,color:#fee2e2
```

1. **Peak Bin Index Exactness (Tier 1)**:
   - Calculate theoretical target bins:
     $$k_{\text{range}, i} = \text{round}\left( \frac{2 \cdot S \cdot R_i \cdot N_{adc}}{c_0 \cdot F_s} \right)$$
     $$m_{\text{doppler}, i} = \text{round}\left( \frac{2 \cdot v_i \cdot T_{\text{chirp}} \cdot N_{doppler}}{\lambda} \right) + \frac{N_{doppler}}{2}$$
   - Pass condition: Output peak indices must match theoretical bins with **$\pm 0$ bin tolerance**.

2. **Signal-to-Quantization-Noise Ratio (SQNR) (Tier 2)**:
   $$\text{SQNR} = 10 \log_{10}\left( \frac{\sum_{k} |X_{\text{ref}}[k]|^2}{\sum_{k} |X_{\text{ref}}[k] - X_{\text{dut}}[k]|^2} \right) \ge 45\text{ dB}$$
   $$\text{Peak Magnitude Error} = \big| 20\log_{10}|X_{\text{dut}}[k_{\text{peak}}]| - 20\log_{10}|X_{\text{ref}}[k_{\text{peak}}]| \big| \le 1.0\text{ dB}$$

3. **CFAR Detection Confusion Matrix (Tier 3)**:
   - **True Positives ($TP$)**: Target 1 and Target 2 must both be detected ($TP = 2$).
   - **False Negatives ($FN$)**: $FN = 0$.
   - **False Positives ($FP$)**: In an interference-free synthetic test frame, $FP = 0$.

4. **Object Coordinate Bounds (Tier 4)**:
   - $|R_{\text{detected}} - R_{\text{true}}| \le 0.05\text{ m}$
   - $|\theta_{\text{detected}} - \theta_{\text{true}}| \le 2.0^\circ$
   - $|v_{\text{detected}} - v_{\text{true}}| \le 0.03\text{ m/s}$

5. **Automated Firmware Regression (Golden CRC-32)**:
   - When running regression tests in automated production test benches, hash the output buffers using CRC-32:
     - `CRC32(Range_Profile_Buffer) == 0x7E3A91B4`
     - `CRC32(Radar_Cube_Buffer) == 0xD419F02C`
   - Complete self-test execution time: **$< 2.5\text{ ms}$** per frame on C66x DSP + HWA.

---

## 4. In-Depth Technical Breakdown by Stage

### Stage 0: ADC Buffer & RF Downconversion
- **Analog Hardware Operation**:
  - The fractional-N PLL sweeps a continuous FMCW chirp between 57 GHz and 64 GHz at an 80 MHz/µs slope.
  - Reflections from in-cabin targets are down-converted by 4 receiver mixers to produce intermediate frequency (IF) signals.
  - The high-speed pipeline ADC samples each channel at up to 25 Msps with 12-bit effective number of bits (ENOB).
- **Memory Addressing**:
  - The Common Buffer Interface (CBUFF) writes raw samples into `HWA ACCEL_MEM` located at `0x05100000`.
  - Format: Packed 16-bit words where `D[15:4]` represents the 12-bit signed ADC value and `D[3:0]` is zero-padded or contains channel tags.

### Stage 1: 1D Range Fast Fourier Transform (FFT)
- **Execution & Dataflow**:
  - The HWA 1.2 paramset triggers upon receiving a chirp interrupt from the Frontend Controller (FECSS).
  - An programmable symmetric window (Hanning or Blackman-Harris) is applied to mitigate spectral leakage from strong nearby cabin targets (steering wheel, windshield).
  - A Radix-2 Cooley-Tukey 256-point complex FFT executes in 128 clock cycles per chirp.
- **Bit-Growth & Dynamic Range**:
  - Internal accumulator width is 24 bits.
  - Fixed-point scaling is selectable (divide-by-2 at each FFT butterfly stage) to prevent overflow while preserving small signals from infant breathing.

### Stage 2: 2D Doppler FFT & Radar Data Cube Transposition
- **Transpose Logic**:
  - Radar range profiles from consecutive chirps within a coherent processing interval (CPI) are transposed across time.
  - EDMA PaRAM channels automatically shuffle memory words so that all 64 chirp samples for Range Bin $k$ are contiguous in memory.
- **Doppler Centering**:
  - The 64-point Doppler FFT computes slow-time phase velocity.
  - An FFT-shift operation moves the zero-velocity line to bin index 32, placing negative velocities (moving toward sensor) on the left and positive velocities on the right.
- **Memory Destination**:
  - Stored in `DSS_L3` Shared Memory (`0x88000000`). For the AWRL6844, this comprises 512 KB native L3 plus up to 896 KB dynamically repartitioned shared SRAM.

### Stage 3: Constant False Alarm Rate (CFAR) Detection
- **Algorithm Implementations in HWA**:
  1. **CFAR-CA (Cell Averaging)**: Averages all $N_{train}$ reference cells in front of and behind the Cell Under Test (CUT), excluding guard cells.
  2. **CFAR-CASO (Smallest-Of)**: Selects the smaller noise estimate between leading and trailing windows; ideal for resolving closely spaced targets in vehicle cabins.
  3. **CFAR-CAGO (Greatest-Of)**: Selects the larger noise estimate to prevent false alarms near seat boundary edges.
- **Threshold Equation**:
  $$\text{Threshold}_{dB} = 10 \log_{10}\left(\frac{1}{N_{train}}\sum_{i \in \text{Train}} 10^{\frac{P_i}{10}}\right) + \alpha_{CFAR}$$
- **Output Record Format**:
  Each detected peak is packed into an 8-byte structure in DSS L2 RAM:
  - Byte 0-1: `range_index` (uint16)
  - Byte 2-3: `doppler_index` (uint16)
  - Byte 4-5: `peak_power_db` (Q8.8 fixed-point)
  - Byte 6-7: `noise_floor_db` (Q8.8 fixed-point)

### Stage 4: DSP Clustering, Angle-of-Arrival (AoA) & Occupant Classification
- **C66x DSP Core Tasks**:
  1. **Static Clutter Filtering**: Any detection with $|v| \le 0.05\text{ m/s}$ is labeled as structural cabin reflection (seats, dashboard, roof) and excluded from occupant clustering.
  2. **Angle-of-Arrival (AoA)**: Processes the complex phase difference across the 4 physical receiver antennas (yielding 12 virtual antenna channels in MIMO mode). Resolves azimuth angle $\theta \in [-60^\circ, +60^\circ]$ and elevation angle $\phi \in [-30^\circ, +30^\circ]$.
  3. **Point Cloud Formation**: Computes 3D Cartesian coordinates:
     $$X = R \sin\theta \cos\phi, \quad Y = R \cos\theta \cos\phi, \quad Z = R \sin\phi$$
  4. **DBSCAN Clustering**: Clusters dense spatial points into bounding volumes for each of the 4 vehicle seats (`FL`, `FR`, `BL`, `BR`).
  5. **Vital Sign Respiration Analysis**: Computes phase trajectory over time to extract chest displacement:
     $$\Delta R(t) = \frac{\lambda}{4\pi} \Delta \psi(t)$$
     - Adult respiration: 12–20 breaths/min (0.2–0.33 Hz), amplitude ~1–2 mm.
     - Infant respiration: 30–50 breaths/min (0.5–0.83 Hz), amplitude ~0.2–0.5 mm.

### Stage 5: Vehicle Gateway Communication & ASIL-B Safety
- **Interface & Messaging**:
  - The ARM Cortex-R5F packages classification results into CAN-FD frames transmitted via `APP_CANCFG` (`0x52000000`).
  - Messages include: `Seat_Occupancy_Status`, `Child_Presence_Alert`, `Vital_Sign_Heartbeat`, `Sensor_Fault_Vector`.
  - The Error Signaling Module (ESM) continuously monitors lockstep CPU status, SRAM ECC parity, and PLL clock drift.

---

## 5. Memory Footprint and Throughput Summary

| Subsystem Memory Block | Size | Base Address | Typical DSP Pipeline Allocation |
| :--- | :--- | :--- | :--- |
| **`HWA ACCEL_MEM`** | 128 KB | `0x05100000` | Raw ADC ping-pong buffers (4 Rx channels) |
| **`HWA M0-M3 RAM`** | 64 KB | Internal | 1D FFT intermediate butterfly buffers & window tables |
| **`DSS L3 Native RAM`** | 512 KB | `0x88000000` | 2D Radar Cube storage for slow-time chirps |
| **`DSS L3 Shared RAM`** | 896 KB | `0x88080000` | Extended Radar Cube & Doppler heatmap accumulation |
| **`DSS L2 RAM`** | 384 KB | `0x80800000` | CFAR detection lists, AoA covariance matrices, C66x code |
| **`APP R5F TCMA`** | 512 KB | `0x00018000` | AUTOSAR OS, tracking algorithms, CAN-FD stack |
| **`APP R5F TCMB`** | 256 KB | `0x08000000` | Real-time interrupt vectors, stack, ESM diagnostics |
