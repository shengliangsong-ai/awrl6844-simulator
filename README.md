# AWRL6844 mmWave Radar SoC & DSP Pipeline Simulator

An interactive, register-accurate architectural simulator and DSP signal processing test suite for the **Texas Instruments AWRL6844** automotive mmWave radar SoC.

---

## 📖 Table of Contents
1. [What is this Repository?](#what-is-this-repository)
2. [Key Capabilities & Subsystems Modeled](#key-capabilities--subsystems-modeled)
3. [How to Install and Run Offline](#how-to-install-and-run-offline)
   - [Method A: Progressive Web App (PWA) Desktop Install](#method-a-progressive-web-app-pwa-desktop-install-one-click)
   - [Method B: Local Development / Air-Gapped Workstation](#method-b-local-development--air-gapped-workstation)
   - [Method C: Standalone C BIST Simulation via Makefile](#method-c-standalone-c-bist-simulation-via-makefile)
4. [How to Use the AWRL6844 App](#how-to-use-the-awrl6844-app)
   - [1. SoC Architecture & Register Emulation Mode](#1-soc-architecture--register-emulation-mode)
   - [2. DSP Pipeline & Radar Heatmap Simulator](#2-dsp-pipeline--radar-heatmap-simulator)
   - [3. Power-On BIST Verification (ASIL-B)](#3-power-on-bist-verification-asil-b)
   - [4. Live Hardware Debug & Serial / CAN-FD Monitor](#4-live-hardware-debug--serial--can-fd-monitor)
   - [5. Interactive Register Map & Documentation Viewer](#5-interactive-register-map--documentation-viewer)
5. [Automotive Safety (ISO 26262 ASIL-B) & Test Metrics](#automotive-safety-iso-26262-asil-b--test-metrics)
6. [Repository Structure](#repository-structure)

---

## 1. What is this Repository?

The **TI AWRL6844** is a single-chip 60-to-64 GHz automotive radar sensor integrating:
- **RF Analog Front-End (FECSS)**: 4 Rx and 4 Tx channels.
- **Hardware Accelerator (HWA 1.2)**: Dedicated engines for 1D Range FFT, 2D Doppler FFT, and CFAR detection.
- **DSP Subsystem (DSS)**: TI C66x DSP Core running Angle-of-Arrival (AoA), DBSCAN spatial clustering, and occupant classification.
- **Application Processing Subsystem (APPSS)**: ARM Cortex-R5F microcontroller managing AUTOSAR OS, ESM fault management, and vehicle CAN-FD communication.

This repository provides:
1. **Interactive Full-Stack Web Application**: A zero-dependency web interface that visually simulates the 6-stage radar DSP dataflow, hardware memory banks, register interactions, power modes, and live diagnostics.
2. **Deterministic BIST Verification Suite**: Algorithmic C simulation code (`awrl6844_bist_dsp_test.c`) that models Power-On Built-In Self-Tests under strict boot memory limits ($\le 2,048\text{ Bytes}$ RAM), verifiable both on a host PC and on real evaluation silicon (EVM boards).
3. **Automotive Engineering Documentation**: Comprehensive technical reference sheets, memory maps, mathematical equations, and LLM implementation prompts.

---

## 2. Key Capabilities & Subsystems Modeled

- **Real-Time 6-Stage DSP Pipeline**:
  - **Stage 0**: Raw ADC sampling with 4-Rx virtual channels and injected in-cabin occupants.
  - **Stage 1**: 1D Range FFT with Hanning windowing and DC offset nulling.
  - **Stage 2**: 2D Doppler FFT with slow-time matrix transpose and Doppler centroid shifting.
  - **Stage 3**: 2D CFAR-CA, CFAR-CASO, and CFAR-CAGO adaptive thresholding.
  - **Stage 4**: C66x DSP Angle-of-Arrival (AoA) phase estimation and DBSCAN seat occupancy clustering.
  - **Stage 5**: Vehicle CAN-FD packaging (`APP_CANCFG`) and Error Signaling Module (ESM) fault handling.
- **Register-Accurate SoC Emulation**:
  - Hardware Mailbox IPC (`0x44000000`) with handshake registers (`MBOX_WRITE_DONE`, `MBOX_READ_REQ`, `MBOX_READ_DONE`).
  - EDMA Channel Controller with 32-byte PaRAM block validation, bounds checking, and A/B synchronization.
  - PRCM Power Modes (Active, Processing, Idle, Deep Sleep) with memory retention logic.
- **Embedded C Self-Test Suite**:
  - Power-On BIST executing in $\le 2.0\text{ KB}$ RAM without reading from pre-stored Flash arrays.
  - 3-tier pass/fail acceptance engine (Peak bin match $\pm 0$, $\text{SQNR} \ge 45\text{ dB}$, IEEE 802.3 CRC-32 checksum).

---

## 3. How to Install and Run Offline

This application is built with an **Offline-First Progressive Web App (PWA)** architecture and can be executed completely air-gapped without an active internet connection.

### Method A: Progressive Web App (PWA) Desktop Install (One-Click)

1. Open the application in Google Chrome, Microsoft Edge, or any Chromium-compatible browser.
2. Click the **"Install Desktop App"** button located in the top-right navigation bar (or click the install icon in the browser address bar).
3. Confirm **"Install"**.
4. The application installs as a standalone desktop executable on Windows, macOS, or Linux.
5. **Offline Operation**: Once installed, service workers cache all JavaScript, WebAssembly, styles, and documentation locally. You can launch and use the app with Wi-Fi disabled.

### Method B: Local Development / Air-Gapped Workstation

To run the full interactive simulator on your local machine:

#### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm** or **bun**

#### Step-by-Step Installation:
```bash
# 1. Clone the repository
git clone https://github.com/your-org/awrl6844-simulator.git
cd awrl6844-simulator

# 2. Install dependencies
npm install
# Or with Bun:
# bun install

# 3. Start the local server
npm run dev
```

Open your browser and navigate to:
```text
http://localhost:3000
```

#### Production Build (Self-Contained Static Bundle):
```bash
npm run build
npm run preview
```
The compiled files in `dist/` can be served by any static file server (e.g., Nginx, Apache, or Python's `python3 -m http.server 3000`).

---

### Method C: Standalone C BIST Simulation via Makefile

You can run the embedded C BIST verification simulator natively on your host machine (Linux/macOS/WSL) without needing Node.js or a browser.

#### Prerequisites
- `gcc` or `clang`
- `make`

#### Build and Run:
```bash
# Compile the BIST simulation binary
make

# Execute the full self-test verification suite (Stages 0..4)
make run

# Run with full input/output debug trace logs per stage
make run-trace

# Run test across incremental stage configurations
make run-stages

# Inspect memory sections (.text, .data, .bss)
make info

# Clean build artifacts
make clean
```

#### Granular Stage Testing & Debug Trace Options:
You can test individual stages or combinations of the 5-stage DSP pipeline directly from the command line:

```bash
# Run specific stages using comma-separated list:
./bist_sim stage=0,1                # Run Stage 0 (ADC Gen) and Stage 1 (1D FFT)
./bist_sim stage=0,1,2,3,4          # Run all 5 stages

# Run specific stages using hexadecimal bitmask:
./bist_sim stage_mask=0x3           # Stages 0, 1 (Bit 0 + Bit 1)
./bist_sim stage_mask=0x7           # Stages 0, 1, 2 (ADC + FFT + Doppler)
./bist_sim stage_mask=0xF           # Stages 0, 1, 2, 3 (Up to CFAR)
./bist_sim stage_mask=0x1F          # Stages 0, 1, 2, 3, 4 (Full pipeline)

# Enable verbose input/output debug trace logging for any stage run:
./bist_sim stage=0,1 --trace
./bist_sim stage_mask=0x1F --trace
```

#### Expected Terminal Output:
```text
======================================================================
 TI AWRL6844 Power-On BIST DSP & HWA Verification Simulator
 Standard: ISO 26262 ASIL-B Safety Compliance
 Active Stage Mask: 0x1F (Stages Tested: 0 1 2 3 4 )
======================================================================

[STAGE 0] Raw ADC Sampling & In-Cabin Synthesis...
  - Buffer Allocation: 1024 Bytes (Ping)
  - CRC-32 Signature:  0x9AD30C85 (Expected: 0x9AD30C85) -> [PASS]

[STAGE 1] 1D Range FFT (HWA 1.2 Fixed-Point Emulation)...
  - Peak 1 (Adult 0.8m):   Bin 20 (Expected 20) -> [PASS]
  - Peak 2 (Infant 1.4m):  Bin 36 (Expected 36) -> [PASS]
  - Pipeline SQNR:         54.64 dB (Limit >= 45.0 dB) -> [PASS]
  - CRC-32 Signature:      0x91332940 (Expected: 0x91332940) -> [PASS]

[STAGE 2] 2D Doppler FFT & Velocity Slicing...
  - Target 1 Doppler Bin:  9 (v = +0.25 m/s) -> [PASS]
  - Target 2 Doppler Bin:  6 (v = -0.15 m/s) -> [PASS]

[STAGE 3] CFAR-CA Peak Detection & Thresholding...
  - Total Validated Peaks: 2 (Expected: 2) -> [PASS]

[STAGE 4] AoA & DBSCAN Occupant Clustering...
  - Assigned Vehicle Seats: [FL, BR] (Expected: [FL, BR]) -> [PASS]

----------------------------------------------------------------------
>>> BIST TEST SUITE RESULT: ALL ACTIVE STAGES PASSED (0x1F) <<<

[TRACE LOG SUMMARY] Generated per-stage trace files in current directory:
  - stage0_adc_trace.log        (256 I/Q ADC samples & parameters)
  - stage1_fft_trace.log        (128 FFT range bin spectrum & peaks)
  - stage2_doppler_trace.log    (16-bin Doppler spectrum & velocity)
  - stage3_cfar_trace.log       (CFAR noise floor, SNR & detections)
  - stage4_clustering_trace.log (3D cabin coordinates & seat assignments)
```

#### Per-Stage Trace Log File Locations:
When running `./bist_sim` with `--trace` (or `make run-trace`), detailed formatted log files are generated directly in the current working directory for offline analysis and hardware correlation:

| File Name | Stage | Content Dumped |
|---|---|---|
| `stage0_adc_trace.log` | Stage 0 (ADC Synthesis) | Radar parameters, LFSR seed, all 256 complex I/Q samples with powers, CRC-32 |
| `stage1_fft_trace.log` | Stage 1 (1D Range FFT) | HWA config, all 128 positive range bin powers, dB levels, and target peak markers |
| `stage2_doppler_trace.log` | Stage 2 (2D Doppler FFT) | Velocity resolution, detected peak Doppler bins, and 16-bin Doppler spectrum slice |
| `stage3_cfar_trace.log` | Stage 3 (CFAR-CA) | Guard/training cell configs, threshold factor, validated target point cloud table |
| `stage4_clustering_trace.log` | Stage 4 (AoA & Clustering) | Cabin geometry model, Cartesian 3D $(x,y,z)$ coordinates, speed, and assigned vehicle seats |

---

## 4. How to Use the AWRL6844 App

The web interface is divided into functional operational views accessible via the navigation header:

### 1. SoC Architecture & Register Emulation Mode (`Architecture & Core Emulation`)
- **System Memory Map**: Inspect addresses across `HWA ACCEL_MEM` (`0x05100000`), `DSS_L3` (`0x88000000`), `DSS_L2` (`0x80800000`), and `APP_TCMA` (`0x00018000`).
- **Memory Inspector & Hex Editor**: Read and write 32-bit words at arbitrary physical memory addresses.
- **Hardware Mailbox IPC Trigger**: Send messages between the ARM Cortex-R5F (APPSS) and C66x DSP (DSS) via `MBOX_WRITE_DONE` and observe interrupt flag handshakes.
- **EDMA Parameter RAM (PaRAM) Validation**: Test valid and invalid DMA block transfers to verify bounds-checking exceptions.
- **PRCM Power Control**: Step the chip through Active, Processing, Idle, and Deep Sleep power states to observe power dissipation (mW) and memory retention wiping.

### 2. DSP Pipeline & Radar Heatmap Simulator (`DSP Pipeline Simulator`)
- **Interactive Target Injection**: Configure distance, velocity, and azimuth for passenger cabin targets (e.g., Adult in front seat, sleeping infant in rear car seat).
- **Stage Progression Buttons**: Step through the pipeline sequentially or click **"Run Full DSP Pipeline"**:
  - Inspect the **Raw ADC Time-Domain Waveforms**.
  - View the **1D Range Profile** with highlighted target peaks.
  - Analyze the **2D Range-Doppler Heatmap**.
  - Toggle CFAR algorithms (**CFAR-CA**, **CFAR-CASO**, **CFAR-CAGO**) and adjust guard/training cell counts.
  - Examine the **3D In-Cabin Point Cloud** and seat bounding boxes (`FL`, `FR`, `BL`, `BR`).
  - View the emitted **64-byte CAN-FD frame payload** (`0x52000000`).

### 3. Power-On BIST Verification (ASIL-B)
- Navigate to the **BIST Test Suite** section within the DSP Simulator.
- Run the streamed single-chirp test:
  - Verifies that input data is synthesized on-the-fly using 32-bit phase accumulators and Galois LFSR with **zero flash footprint**.
  - Verifies that RAM allocation stays strictly within **2,048 Bytes**.
  - Validates **Tier 1 (Peak Bins $\pm 0$)**, **Tier 2 ($\text{SQNR} \ge 45\text{ dB}$)**, and **Tier 3 (Hardware CRC-32 signature)**.

### 4. Live Hardware Debug & Serial / CAN-FD Monitor (`Live Hardware Debug`)
- Connect to physical AWRL6844 EVM boards via WebSerial or simulated UART.
- Stream live CAN-FD telemetry frames.
- Inject ESM Group 1 and Group 2 safety faults to verify that the hardware `nERROR_OUT` pin drops low and places the sensor in a safe fail-silent state.

### 5. Interactive Register Map & Documentation Viewer (`Interactive TRM`)
- Search by peripheral or base address (PRCM, EDMA, HWA, MCAN, ESM).
- Read the bundled technical specifications, memory constraint analyses, and prompt guides directly inside the app.

---

## 5. Automotive Safety (ISO 26262 ASIL-B) & Test Metrics

For automotive safety compliance (Child Presence Detection - CPD, Seat Belt Reminder - SBR), the simulator implements strict safety metrics:

| Metric | Target Limit | Pass Criteria | Verification Method |
| :--- | :--- | :--- | :--- |
| **Peak Bin Detection Error** | $\pm 0\text{ bins}$ | Primary and secondary targets align with analytical bins | Hardware Peak Finder Register |
| **Signal-to-Quantization-Noise** | $\ge 45.0\text{ dB}$ | High numerical precision across 24-bit fixed-point FFT | Running scalar energy accumulation |
| **Peak Magnitude Tolerance** | $\le 1.0\text{ dB}$ | Hanning window scale factor preservation | Log-magnitude ratio test |
| **Hardware CRC-32 Signature** | Bit-exact | Final stream hash matches `0x7E3A91B4` | IEEE 802.3 Polynomial engine |
| **BIST Execution Time** | $< 5.0\text{ ms}$ | Cold boot self-test finishes before RTOS scheduler | Hardware cycle counter (`TSCL`) |
| **BIST RAM Allocation** | $\le 2,560\text{ B}$ | Fits into internal $16\text{ KB}$ HWA M0 memory | Static buffer linker analysis |

---

## 6. Repository Structure

```text
.
├── doc/
│   ├── awrl6844_bist_dsp_test.c       # Standalone C BIST simulation program
│   ├── awrl6844_bist_dsp.h            # C header with BIST APIs and structs
│   ├── awrl6844-bist-c-code.md        # Documentation and board porting guide
│   ├── dsp-pipeline-specification.md  # Detailed 6-stage mathematical specification
│   ├── awrl6844-architectural-design.md# SoC hardware architecture and register manual
│   ├── awrl6844-prompts.md            # LLM prompts for generating modules & BIST
│   └── awrl6844-trm-context-sheet.md  # Quick technical reference sheet
├── src/
│   ├── components/
│   │   ├── DSPPipelineSim.tsx         # Interactive 6-stage DSP radar simulator
│   │   ├── DocViewer.tsx              # In-app Markdown documentation viewer
│   │   ├── InteractiveRegisterMap.tsx # Hardware register search & inspection
│   │   ├── LiveHardwareDebug.tsx      # UART/CAN-FD live telemetry monitor
│   │   └── DesktopInstallButton.tsx   # PWA desktop installation trigger
│   ├── lib/
│   │   ├── dsp.ts                     # Core radar DSP algorithms in TypeScript
│   │   ├── mmu.ts                     # Memory Management Unit & bus emulation
│   │   ├── edma.ts                    # EDMA PaRAM block validation engine
│   │   └── simulator.ts               # Master SoC simulation coordinator
│   ├── App.tsx                        # Main application UI container
│   └── main.tsx                       # React application entry point
├── Makefile                           # Native C compilation and execution automation
├── package.json                       # Web application dependencies and build scripts
└── README.md                          # Repository documentation
```

---

## 📄 License
This simulation and reference framework is provided under the **MIT License**.
All Texas Instruments register names, peripheral acronyms, and memory addresses are modeled after publicly available TI Technical Reference Manuals (TRM) for the AWRL6844 / IWR6843 / AWR2944 mmWave radar family.
