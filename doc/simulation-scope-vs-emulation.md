# Simulation Scope vs. Hardware Emulation

This document clarifies the exact boundaries of this simulator, explicitly detailing what is structurally modeled at the memory/register level versus what is implemented as a high-level behavioral mock. 

Due to the proprietary nature of Texas Instruments mmWave SoCs, a full Instruction Set Simulator (ISS) capable of running production firmware binaries instruction-by-instruction is not implemented here.

## 1. What is Structurally Simulated (Register & Memory Level)

The architecture accurately models the **State and Memory Matrix** of the AWRL6844/AWRL6888 devices:

*   **Virtual Memory Map (vMMU):** The memory regions (APP_TCMA, APP_TCMB, DSS_L2, DSS_L3, etc.) are instantiated as strictly bounded, contiguous `Uint8Array` buffers. Uploading a `.bin` file writes real bytes into these arrays at exact hardware addresses.
*   **Memory-Mapped Registers:** The simulator actively traps memory writes. When a write occurs at a peripheral base address (e.g., `0x56060000` for `APP_CTRL`), the engine parses the bitmasks exactly as the silicon would, updating internal finite state machines (FSMs).
*   **EDMA PaRAM Validation:** The EDMA module enforces byte-alignment, boundary rules, and transfer sizing on 32-byte PaRAM structures, moving actual bytes between virtual memory regions.
*   **Mailbox IPC State:** The Mailbox registers accurately reflect `WRITE_DONE`, `READ_REQ`, and `READ_DONE` bit-toggling rules across multi-core boundaries.

## 2. What is High-Level Mock Only (Behavioral)

The following computational cores and engines **do not** execute binary instructions (assembly). They are simulated behaviorally using high-level TypeScript sequences:

*   **The ARM Cortex-R5F (APPSS) Core:** 
    *   *Reality:* QEMU natively supports the 32-bit ARMv7-R architecture, making it technically feasible to emulate. 
    *   *Simulator Implementation:* Not emulated. The "Automated Demo" sequence injects pre-calculated values into memory using JavaScript callbacks to mock what the R5F *would* do during a boot sequence.
*   **The TI C66x DSP (DSS) Core:** 
    *   *Reality:* This is a major blocker for true emulation. The C66x is a highly proprietary, 8-way Very Long Instruction Word (VLIW) vector mathematics processor operating at 450 MHz. There is no open-source QEMU target or backend available for the TI C66x instruction set.
    *   *Simulator Implementation:* DSP-side interactions are triggered procedurally.
*   **The Hardware Accelerator (HWA 1.2) & DSP Processing Chain:** 
    *   *Reality:* Running actual machine binary instructions (`.out` or `.bin`) compiled for TI C66x VLIW or raw HWA parameter RAM state machines instruction-by-instruction requires proprietary hardware cycle-accurate emulators.
    *   *Simulator Implementation:* Fully implemented at the **algorithmic and signal processing level** in `DSPPipelineSim.tsx` and `src/lib/dsp.ts`. The simulator executes Radix-2 Cooley-Tukey 1D Range FFTs with Hanning windowing, 2D Doppler slow-time FFTs, Cell-Averaging CFAR (CFAR-CA) 2D peak detection, and 3D spatial occupant clustering mapped directly to a 3D in-cabin vehicle visualization.
*   **FECSS (Cortex-M3 Front-End):** 
    *   *Reality:* Executes closed-source TI firmware to perform analog RF baseband tuning and chirp PLL sequencing. Running production binaries requires proprietary ROM images.
    *   *Simulator Implementation:* High-level mathematical FMCW model; radar chirps, beat frequencies, Doppler phase progression, and antenna spatial phase shifts are synthesized directly from configurable in-cabin occupant configurations (adults/infants in FL, FR, BL, BR seats).

## 3. Summary of Use Cases

**Supported & Validated Workflows:**
*   **DSP Signal Processing Pipeline Simulation**: Interactive end-to-end execution of 1D Range FFT, 2D Doppler FFT, 2D CFAR-CA detection, 3D point cloud generation, and in-cabin seat clustering.
*   **Mathematical & Algorithmic Validation**: Verification of SQNR ($\ge 45\text{ dB}$), peak bin exactness, and CFAR confusion matrices.
*   **Virtual Memory Map (vMMU) Layouts**: Strict bounds validation, read/write trapping, and hex inspection across APP R5F TCMA/B, DSS L2, DSS L3, and external flash.
*   **EDMA PaRAM Validation**: Bounds checking and automated memory copying for 32-byte PaRAM structures.
*   **Register State Flow**: Interactive bitmask toggling and register-write side effects across TOP_PRCM, Mailbox IPC, and APP_CTRL 8T8R transceiver masks.
*   **Hardware Trace & Diagnostics**: Live register compare/diffing, memory binary hex loading/dumping, and offline PWA capability.

**Unsupported Workflows:**
*   Executing compiled `.out` or `.bin` ARM/DSP firmware machine instructions directly at the CPU op-code execution level (Instruction Set Simulation / ISS).
