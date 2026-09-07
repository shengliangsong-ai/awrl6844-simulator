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
*   **The Hardware Accelerator (HWA 1.2):** 
    *   *Reality:* Running actual binary code that interacts with the HWA would require writing a custom emulator block to model the 32 parameter sets and state transitions of the 200 MHz accelerator engine.
    *   *Simulator Implementation:* We mock the *memory layout* of the 64-channel radar cube inside L3 RAM, but we do not execute the FFT or CFAR-OS mathematical processing of the ADC samples.
*   **FECSS (Cortex-M3 Front-End):** 
    *   *Reality:* Executes closed-source TI firmware to perform analog baseband control. Running production binaries means emulating the CM3 core and having access to TI's proprietary ROM images.
    *   *Simulator Implementation:* High-level abstraction; radar chirps and ADC buffer fills are mocked procedurally.

## 3. Summary of Use Cases

**Recommended Workflows:**
*   Validating memory map layouts and boundary constraints.
*   Testing EDMA configuration parameters (PaRAM sets).
*   Checking register-level control flows (e.g., Power/Deep Sleep sequencing, Transceiver MIMO configurations).
*   Mocking user interfaces and dashboards that consume SoC data.

**Unsupported Workflows:**
*   Executing compiled `.out` or `.bin` ARM/DSP firmware files instruction-by-instruction.
*   Testing mathematically accurate radar signal processing (FFT/CFAR algorithms).
