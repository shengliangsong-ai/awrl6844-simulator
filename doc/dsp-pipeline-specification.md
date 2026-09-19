# AWRL6844 mmWave Radar DSP & Hardware Accelerator Pipeline Specification

This document provides a comprehensive register-level and dataflow specification of the **Hardware Accelerator (HWA 1.2)** and **C66x Fixed/Floating-Point DSP** processing chain for the Texas Instruments **AWRL6844** (and **AWRL6888**) Single-Chip mmWave Radar SoC.

---

## 1. Executive Processing Chain Architecture

The AWRL6844 signal processing pipeline converts continuous-wave Frequency-Modulated (FMCW) radar reflections into classified 3D occupant point clouds, micro-Doppler vital sign metrics, and ASIL-B vehicle telematics:

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│     STAGE 0     │       │     STAGE 1     │       │     STAGE 2     │
│  Analog IF Rx   │ ────► │  1D Range FFT   │ ────► │  2D Doppler FFT │
│  & ADC Sampling │       │  (Range Profile)│       │  (Radar Cube)   │
└─────────────────┘       └─────────────────┘       └─────────────────┘
         │                         │                         │
         ▼                         ▼                         ▼
   RF Frontend /             HWA 1.2 Engine           HWA 1.2 + EDMA
   ACCEL_MEM (0x05100000)    M0-M3 RAM                DSS L3 RAM (0x88000000)

                                   │
                                   ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│     STAGE 5     │       │     STAGE 4     │       │     STAGE 3     │
│ Vehicle CAN-FD  │ ◄──── │ DSP Clustering  │ ◄──── │ CFAR Detection  │
│ & PMIC Telemetry│       │ & AoA Tracking  │       │ & Peak Extract  │
└─────────────────┘       └─────────────────┘       └─────────────────┘
         ▲                         ▲                         ▲
         │                         │                         │
    MCAN / UART               C66x DSP + R5F           HWA CFAR Engine
    APP_CANCFG                DSS L2 / APP TCM         DSS L2 (0x80800000)
```

---

## 2. Master DSP Pipeline Stage Input / Output Reference Table

The table below details the input signals, mathematical transformations, data word-lengths, dimensions, memory topologies, and output artifacts for every stage in the processing chain:

| Stage # | Stage Name | Hardware Execution Unit | Input Signal / Data | Input Format, Word Length & Dimensions | Output Artifact | Output Format, Word Length & Dimensions | Target Memory Subsystem & Address | Mathematical Transform / Kernel | In-Cabin Application Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Stage 0** | **ADC Buffer & FMCW Rx** | Analog RF Frontend + 12-bit Pipeline ADC + CBUFF | Reflected 57–64 GHz FMCW echo mixed with TX chirp | Continuous differential IF beat signal $V_{IF}(t)$, $\pm 1.8\text{ V}$ full-scale | Digitized Raw ADC Samples | 12-bit signed integers sign-extended to 16-bit complex ($I + jQ$); $[N_{rx}=4] \times [N_{chirp}=128] \times [N_{adc}=256]$ | `HWA ACCEL_MEM` (`0x05100000`) via CBUFF / EDMA | $f_{IF} = \frac{2 S R}{c} + \frac{2 v}{\lambda}$ | Captures electromagnetic reflections from cabin structures, seats, and passengers. |
| **Stage 1** | **1D Range FFT (Range Profile)** | Hardware Accelerator (HWA 1.2) FFT Engine | Raw ADC samples from `ACCEL_MEM` | 16-bit signed complex I/Q; 256 samples per chirp | 1D Range Profile | 24-bit fixed-point Complex I/Q; $[4\text{ Rx}] \times [128\text{ chirps}] \times [128\text{ valid range bins}]$ | HWA Internal Ping-Pong RAM banks (`M0`, `M1`, `M2`, `M3`) | $X[k] = \sum_{n=0}^{N-1} (x[n] \cdot w[n]) e^{-j\frac{2\pi}{N}nk}$ with Hanning window & DC offset nulling | Resolves radial distance ($R = \frac{c \cdot f_{IF}}{2 S}$). Separates front seats (0.8m) from rear seats (1.4m). |
| **Stage 2** | **2D Doppler FFT (Radar Cube)** | HWA 1.2 Accelerator + EDMA 3D Transpose Engine | 1D Range FFT results transposed across chirps | 24-bit complex samples grouped across slow-time chirps: $[4\text{ Rx}] \times [128\text{ range}] \times [128\text{ chirps}]$ | 3D Range-Doppler Radar Cube | 24-bit Complex I/Q (or 16-bit log-magnitude); $[4\text{ Rx}] \times [128\text{ Range Bins}] \times [64\text{ Doppler Bins}]$ | `DSS_L3` Shared RAM (`0x88000000`) - 512 KB Native + Dynamic L3 | $Y[m, k] = \sum_{p=0}^{M-1} X_{trans}[p, k] \cdot w_D[p] e^{-j\frac{2\pi}{M}pm}$ with Doppler centering shift | Resolves relative velocity ($v = \frac{\lambda \cdot f_D}{2}$). Isolates static clutter ($0\text{ m/s}$) from breathing micro-Doppler ($0.1\text{--}0.4\text{ m/s}$). |
| **Stage 3** | **CFAR-CA Detection & Log-Mag** | HWA 1.2 CFAR Unit (Cell-Averaging Engine) | 2D Range-Doppler Heatmap slices from `DSS_L3` | 16-bit Log-Magnitude power ($0.0625\text{ dB/LSB}$); $[128\text{ Range}] \times [64\text{ Doppler}]$ | Sparse Candidate Peak List | Array of `CfarPeak` structs: `uint16 rangeIdx`, `uint16 dopplerIdx`, `uint16 peakPowerDb`, `uint16 noiseFloorDb` | `DSS_L2` SRAM (`0x80800000`) via EDMA | $P_{CUT} > \frac{1}{N_{tr}} \sum_{i \in \text{Train}} P_i + T_{dB}$ with Guard Cell isolation | Suppresses thermal noise, multipath ground bounce, and carpet reflections while flagging genuine biological targets. |
| **Stage 4** | **Clustering, AoA & Tracking** | TMS320C66x DSP Core (600 MHz) + ARM Cortex-R5F | Candidate CFAR peaks + 4-channel complex antenna vectors | Peak records + virtual antenna array phase vectors: $[N_{peaks}] \times [N_{virtual}=12]$ | Tracked Occupant Objects & 3D Point Cloud | Point Cloud: $[X, Y, Z, V_r, \text{SNR}, \text{RCS}]$ in meters & m/s; Object Tracks: ID, Bounding Box, Class (`Adult`, `Infant`, `Empty`), Confidence (%) | `DSS_L2` Scratchpad & `APPSS_TCMA` (`0x00018000`) | DBSCAN clustering + Capon MVDR / 3D FFT Angle of Arrival: $P(\theta, \phi) = \frac{1}{\mathbf{a}^H \mathbf{R}_{xx}^{-1} \mathbf{a}}$ + EKF tracking | Distinguishes adult vs. child safety seat, measures micro-respiration rates, and eliminates false positives. |
| **Stage 5** | **Vehicle Gateway & PMIC Safety** | MCAN Controller (CAN-FD), SCI/UART, ESM | Validated occupant classification and hardware health telemetry | Processed frame structures and ASIL-B diagnostic codes | CAN-FD 64-byte Frames & Safety Heartbeats | ISO 11898-1 CAN-FD messages at 5 Mbps; External hardware `nERROR_OUT` pin signaling | `APP_CANCFG` (`0x52000000`), `APP_SCI` (`0x56010000`), PMIC interface | Serialization & CRC-16 / CRC-32 cyclic redundancy check | Triggers Child Presence Detection (CPD) alarm, Seat Belt Reminder (SBR), and smart airbag deployment. |

---

## 3. In-Depth Technical Breakdown by Stage

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

## 4. Memory Footprint and Throughput Summary

| Subsystem Memory Block | Size | Base Address | Typical DSP Pipeline Allocation |
| :--- | :--- | :--- | :--- |
| **`HWA ACCEL_MEM`** | 128 KB | `0x05100000` | Raw ADC ping-pong buffers (4 Rx channels) |
| **`HWA M0-M3 RAM`** | 64 KB | Internal | 1D FFT intermediate butterfly buffers & window tables |
| **`DSS L3 Native RAM`** | 512 KB | `0x88000000` | 2D Radar Cube storage for slow-time chirps |
| **`DSS L3 Shared RAM`** | 896 KB | `0x88080000` | Extended Radar Cube & Doppler heatmap accumulation |
| **`DSS L2 RAM`** | 384 KB | `0x80800000` | CFAR detection lists, AoA covariance matrices, C66x code |
| **`APP R5F TCMA`** | 512 KB | `0x00018000` | AUTOSAR OS, tracking algorithms, CAN-FD stack |
| **`APP R5F TCMB`** | 256 KB | `0x08000000` | Real-time interrupt vectors, stack, ESM diagnostics |
