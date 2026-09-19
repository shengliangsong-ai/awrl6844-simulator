# AWRL6844 SoC Simulator Architectural Design

This document details the software architecture, memory maps, and functional state machines for a host-side functional mock and register-level simulator of the Texas Instruments AWRL6844 Single-Chip mmWave Radar SoC.

---

## 1. Unified Virtual Memory Map & Translation Layer
The simulator core maintains a flat virtual memory matrix representing the `xWRL6844` native and shared address spaces (grounded in the SWRU621A Technical Reference Manual):

### A. Application Subsystem (APPSS) Address Space
*   `APP_CPU_ROM_A`: `0x00000000` (Size: 96 KB)
*   `APP_CPU_TCMA_A`: `0x00018000` (Size: 512 KB) — Primary ARM R5F program/data execution
*   `APP_CPU_TCMB_A`: `0x08000000` (Size: 256 KB) — Single-cycle real-time stack space
*   `EXT_FLASH_MEM`: `0x70000000` (Size: 32 MB) — Mock QSPI Flash image storage space
*   `APP_QSPI_CFG`: `0x78000000` (Size: 116 Bytes)

### B. DSP Subsystem (DSS) Address Space
*   `DSP_L2` (C66x Local Map): `0x00800000` (Size: 288 KB)
*   `DSS_L2` (System Bus Map): `0x80800000` (Size: 384 KB)
*   `DSS_L1P`: `0x80E00000` (Size: 32 KB) / `DSS_L1D`: `0x80F00000` (Size: 32 KB)
*   `DSS_L3` (Total Memory): `0x88000000` (Size: 1 MB, containing 512 KB native L3 and 896 KB shared L3 banks)

### C. Shared Memory Allocation Controller
The translation layer traps writes to shared memory configurations to dynamically resize visible regions of:
*   `APP_CPU_TCMA_B` (`0x00098000`)
*   `APP_CPU_TCMB_B` (`0x08040000`)
*   `DSS_L3` (`0x88000000`)

---

## 2. Core Mock State Machine Implementations

```
                  ┌────────────────────────────────────────────────────────┐
                  │                 SIMULATOR CORE ENGINE                  │
                  └─────────┬────────────────────────────────────┬─────────┘
                            │                                    │
    ┌───────────────────────▼──────────────────────┐    ┌────────▼─────────────────────────┐
    │          VIRTUAL MMU & MEMORY MAP            │    │       REGISTER STATE ENGINE      │
    ├──────────────────────────────────────────────┤    ├──────────────────────────────────┤
    │  • APP R5F TCM-A: 0x00018000 (512 KB)        │    │  • TOP_PRCM Control (0x5A040000) │
    │  • APP R5F TCM-B: 0x08000000 (256 KB)        │    │  • Mailbox IPC (0x44000000)      │
    │  • DSS C66x L2:   0x80800000 (384 KB)        │    │  • APP_CTRL Boot Info Registers  │
    │  • DSS L3 Native: 0x88000000 (512 KB)        │    │  • APP_RCM Registers             │
    │  • DSS L3 Shared: Dynamic App/DSP Layout     │    │  • ESM Severity Diagnostics      │
    └──────────────────────────────────────────────┘    └──────────────────────────────────┘
```

### A. Hardware Mailbox IPC (Base Address: `0x44000000`)
The simulator mimics register handshaking to eliminate processor polling loops:
1.  **Buffer Write Trigger**: Firmware writes to `MBOX_WRITE_DONE` to signal message payload packaging in `FEC_SHARED_RAM` (`0x21100000`).
2.  **Request Assertion**: The simulation automatically raises `MBOX_READ_REQ` on the target subsystem's virtual interrupt line, causing the host execution loop to route control to the target's interrupt handler.
3.  **Read Acknowledge**: Once the simulated consumer reads the payload, it writes to `MBOX_READ_DONE`, which clears the corresponding `MBOX_READ_REQ` bit, returning a status of idle.

### B. EDMA Parameter RAM (PaRAM) Block Validation
Instead of programming DMA transfer pipelines, this module acts as a validation engine:
1.  **Block Structuring**: Models the 32-byte PaRAM configuration block:
    -   `SRC_ADDR`: Source memory location
    -   `A_CNT`: 1D array byte-width
    -   `B_CNT`: Number of 1D arrays
    -   `DST_ADDR`: Destination memory location
    -   `SRC_B_IDX` / `DST_B_IDX`: Index increments
    -   `LINK_ADDR`: Link re-load address
    -   `C_CNT`: Number of 2D frames
2.  **Sync Triggering**: Validates bounds checking on A-Synchronized vs. B-Synchronized mode transitions. If B-Sync is asserted, the simulator confirms that a single trigger transfers the block defined by `A_CNT * B_CNT`.
3.  **Error Injection**: Asserts virtual bus faults if any address boundary is configured outside native memory allocations.

### C. Power, Reset, & Clock Management (PRCM) Logic
Simulates dynamic power gating transitions to verify low-power safety paths:
1.  **Operational Modes**: Tracks virtual current draw across operational states: **Active** (~1145 mW), **Processing** (~335 mW), **Idle** (~28 mW), and **Deep Sleep** (~3.91 mW).
2.  **Retention Checking**: When a transition to Deep Sleep is triggered via the `TOP_PRCM` control registers, the simulator evaluates memory state retention registers. If the retention bits are set, it preserves the `DSS_L3` virtual RAM array. Upon virtual wakeup, the bootloader sequence bypasses the external QSPI flash boot recovery cycle, directly resuming core execution.
3.  **Fault Handling**: Allows injection of unmaskable diagnostics errors, forcing the central **Error Signaling Module (ESM)** register stack to drive the external virtual `nERROR_OUT` pin low, triggering host fail-safe routines.

---

## 3. Hardware Accelerator (HWA 1.2) & DSP Pipeline Stage Input/Output Table

The following table summarizes the dataflow, word lengths, input/output data sizes, and memory targets across the stages modeled in the simulator:

| Stage | Name | Hardware Unit | Input Signal / Data | Input Size (Bytes) | Output Artifact & Format | Output Size (Bytes) | Memory Subsystem | Self-Test Comparison Criteria |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **0** | **ADC Buffer** | RF Frontend + Pipeline ADC | Analog IF continuous-wave beat frequency; 12-bit signed in 16-bit complex | **256 KB** (262,144 B) | Digitized Raw ADC Samples ($I/Q$); $[4\text{ Rx}] \times [128\text{ chirps}] \times [256\text{ samples}]$ | **256 KB** | `HWA ACCEL_MEM` (`0x05100000`) | Bit-exact DMA transfer & CRC-32 golden match |
| **1** | **1D Range FFT** | HWA 1.2 FFT Accelerator | Raw ADC samples from `ACCEL_MEM` (16-bit complex) | **256 KB** | 1D Range Profile: 24-bit fixed Complex I/Q; $[4\text{ Rx}] \times [128\text{ chirps}] \times [128\text{ bins}]$ | **256 KB** (or 512 KB unpacked) | HWA Internal Ping-Pong RAM (`M0`–`M3`) | Peak bin $\pm 0$ error; SQNR $\ge 45\text{ dB}$; Peak error $\le 1.0\text{ dB}$ |
| **2** | **2D Doppler FFT** | HWA 1.2 + EDMA Transpose | 1D Range FFT results transposed across chirps | **256 KB** | 3D Range-Doppler Radar Cube: 24-bit Complex I/Q (or 16-bit log-mag); $[4\text{ Rx}] \times [128\text{ Range}] \times [64\text{ Doppler}]$ | **128 KB** (Log-Mag) or **256 KB** (Complex) | `DSS_L3` Shared RAM (`0x88000000`) | Doppler peak $\pm 0$ bin match; PSNR $\ge 42\text{ dB}$ vs double-precision model |
| **3** | **CFAR Detection** | HWA 1.2 CFAR Unit | 2D Range-Doppler power heatmap slices (16-bit log-mag) | **16 KB** | Sparse Detected Peaks List: `CfarPeak` structs (8 B/peak; 1-32 peaks) | **8 to 256 B** (1 KB buffer) | `DSS_L2` SRAM (`0x80800000`) | 100% Target Detection ($FN=0$, $FP=0$); Measured SNR error $\le 0.5\text{ dB}$ |
| **4** | **DSP Clustering & AoA** | TMS320C66x DSP Core | CFAR peaks + 4-channel Rx antenna phase vectors | **512 B** | Validated Occupants & 3D Point Cloud: $[X, Y, Z, V_r, \text{SNR}]$ + Tracks | **100 to 500 B** | `DSS_L2` & `APPSS_TCMA` (`0x00018000`) | Coordinate bounds: $\Delta R \le 0.05\text{ m}$, $\Delta\theta \le 2.0^\circ$, $\Delta v \le 0.03\text{ m/s}$ |
| **5** | **Vehicle Gateway** | MCAN (CAN-FD) + ESM | Validated occupant classifications and diagnostics | **~64 B** | CAN-FD Frames (64-byte payload) & hardware `nERROR_OUT` pin | **64 to 128 B** | `APP_CANCFG` (`0x52000000`), `APP_SCI` | ISO 11898-1 bit compliance, valid CRC-16/32, `nERROR_OUT` inactive high |

*For complete synthetic test vector formulas, memory topologies, and register offsets, refer to `dsp-pipeline-specification.md`.*
