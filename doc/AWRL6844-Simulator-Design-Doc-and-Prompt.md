# AWRL6844 Technical Reference Manual (TRM) Grounding Context Sheet

This document compiles the absolute hardware-register specifications and memory maps of the Texas Instruments AWRL6844 Single-Chip mmWave Radar. It serves as the baseline context for generating the register-level mock simulator.

## 1. Physical Memory Topographies
The AWRL6844 on-chip RAM has a maximum size of 2.5 MBytes, partitioned as follows:
- APPSS Cortex-R5F TCMA RAM: 512 KBytes (Base: 0x00018000, Range: 0x00018000 - 0x00097FFF)
- APPSS Cortex-R5F TCMB RAM: 256 KBytes (Base: 0x08000000, Range: 0x08000000 - 0x0803FFFF)
- DSS C66x DSP L2 RAM: 384 KBytes (Base Address in APPSS: 0x80800000, Base in DSS: 0x00800000)
- DSP L1P RAM: 32 KBytes (Base: 0x00E00000)
- DSP L1D RAM: 32 KBytes (Base: 0x00F00000)
- DSS L3 Native RAM: 512 KBytes (Available only on AWRL6844 variants. Base Address: 0x88000000)
- DSS L3 Shared RAM: 896 KBytes (Can be dynamically mapped to DSS L3 space or APPSS TCM space)
- External QSPI Flash Memory: 32 MBytes (Base: 0x70000000)

## 2. Shared Memory Allocation Control Configurations
The memory organization is dynamically altered based on the Shared RAM Allocation Control register:
- Mode 0: APPSS TCMA (512 KB), APPSS TCMB (256 KB), DSS L3 Native (1408 KB total DSS L3)
- Mode 1: APPSS TCMA (768 KB), APPSS TCMB (256 KB), DSS L3 (1152 KB total)
- Mode 3: APPSS TCMA (1024 KB), APPSS TCMB (256 KB), DSS L3 (896 KB total)
- Mode 5: APPSS TCMA (768 KB), APPSS TCMB (512 KB), DSS L3 (896 KB total)
- Mode 7: APPSS TCMA (1024 KB), APPSS TCMB (512 KB), DSS L3 (640 KB total)

## 3. Peripheral Map Base Addresses
- HSM_MBOX / APPSS_MBOX Base Address: 0x44000000
- TOP_PRCM Base Address: 0x5A040000
- TOP_IOMUX Base Address: 0x5A000000
- TOP_GIO Base Address: 0x5AF7FC00
- APP_RCM Base Address: 0x56040000
- APP_CTRL Base Address: 0x56060000
- APP_QSPI_CFG Base Address: 0x78000000
- DSS_CTRL Base Address: 0x55020000
- DSS_ESM Base Address: 0x55F7FC00

## 4. Power Domain and Low-Power Configurations
Switchable Power Domains:
- SWITCH_APPSS: Power gate enclosing Cortex-R5F application core.
- SWITCH_DSS: Power gate enclosing C66x DSP processing engine.
- SWITCH_FECSS: Power gate enclosing Front-End Cortex-M3 controller.
- SWITCH_ANALOG: Power gate enclosing analog RF transmitters and receivers.

Device Power States & Estimates:
- Active Mode (Transmitting & Chirping): ~1145 mW
- Processing Mode (Post-FFT, RF off): ~335 mW
- Idle Mode (Inter-frame waiting): ~28 mW
- Deep Sleep Mode (Clock-gated, memories retained): ~3.91 mW

Retention Mechanics:
During Deep Sleep, Memory Retention registers in TOP_PRCM preserve Shared L3 RAM contents. When wakeup occurs, the device reads retained registers. If valid, the ROM Bootloader skips the full 80 MHz external QSPI recovery sequence and boots directly from RAM.

## 5. Mailbox Handshaking Register Offset Profiles
- Write Pulse Registers: MBOX_WRITE_DONE offsets let CPU0 write-pulse bits notify the targeted hardware consumer.
- Interrupt Flags: MBOX_READ_REQ asserts read requests on targeted processors, routing execution to interrupt handlers.
- Read Clear Strobe: MBOX_READ_DONE clears pending flags on target read Completion.

## 6. ASIL-B Safety Diagnostic ESM Groups
Diagnostic and monitoring faults aggregate in the central Error Signaling Module (ESM):
- Group 1 (Low Severity): Maskable, non-critical peripheral warnings.
- Group 2 (High Severity): Non-maskable software/hardware errors. Triggers a hardware interrupt and immediately drives the external physical nERROR_OUT pin low to alert the system PMIC.
- Group 3 (Critical Failures): Unmaskable Lockstep CPU core mismatch. Asserts a device-level hard reset.
# Google AI Studio Prompts for AWRL6844 Simulator Implementation

This document contains a series of structured, high-context prompts designed to be copied and pasted directly into **Google AI Studio** to generate the modular, register-level Python mock simulator.

---

## 🛠️ Prompt 1: Top-Level Architecture Prompt

```text
Role: High-Performance Embedded Software Architect

Task: Implement a modular, functional register-level and memory-mapped mock simulator for the Texas Instruments AWRL6844 mmWave Radar SoC in Python (3.10+).

Context:
Use the provided "AWRL6844 Technical Reference Manual (TRM) Grounding Context Sheet" as the absolute source of truth. All base addresses, memory sizes, register offsets, and bits must match the hardware specifications exactly.

Functional Requirements:
1. Virtual Memory Management Unit (vMMU):
   - Implement an address trapping and translation class. 
   - Define contiguous byte arrays for: APP R5F TCMA (512 KB at 0x00018000), TCMB (256 KB at 0x08000000), DSS L2 (384 KB at 0x80800000), DSS Native L3 (512 KB at 0x88000000), and External Flash (32 MB at 0x70000000).
   - Implement read_word(addr) and write_word(addr, val) with range validation and bus-hang emulation on invalid addresses.

2. Central Register State Engine:
   - Model registers as mutable state maps using their precise base addresses (e.g., TOP_PRCM at 0x5A040000, Mailbox IPC at 0x44000000).
   - Implement custom register-write callbacks so that writing to control registers automatically updates associated simulator states (e.g., writing resets, toggling clocks, or modifying power domains).

3. Extensible Module Architecture:
   - Package code into cleanly decoupled classes: VirtualMMU, MailboxIPC, EDMAValidator, and PRCMController.
   - Provide a clean, text-based interactive shell (CLI) or a lightweight local dashboard that displays active registers, memory layouts, current power state, and logs.

Begin by setting up the VirtualMMU class with full address translation and bounds checks.
```

---

## 🛠️ Prompt 2: Detailed Task Prompt — Mailbox IPC

```text
Task: Implement the register-level behavioral simulation of the AWRL6844 Mailbox Interprocessor Communication (IPC) subsystem in the VirtualMMU and MailboxIPC classes.

System Requirements:
- Base Address: 0x44000000 (HSM_MBOX / APPSS_MBOX)
- Key Registers and Offsets:
  * APPSS_CR5A_MBOX_WRITE_DONE (Write pulse bits signaling payload readiness)
  * APPSS_CR5A_MBOX_READ_REQ (Read request interrupts sent to receiving core)
  * APPSS_CR5A_MBOX_READ_DONE (Clearing strobe written by reader when execution finishes)

State Machine Logic:
1. Write Trap: Intercept writes to APPSS_CR5A_MBOX_WRITE_DONE. If firmware writes to this register, change the associated receiver's APPSS_CR5A_MBOX_READ_REQ state to high.
2. Read-Request Interrupt: When a READ_REQ bit goes high, trigger a registered interrupt callback in the target core's runtime task loop.
3. Read Done Strobe: Trap writes to APPSS_CR5A_MBOX_READ_DONE. When written, automatically clear the pending bit in APPSS_CR5A_MBOX_READ_REQ to release the IPC buffer.
4. Multicore Logging: Print real-time debug transactions detailing the origin core (e.g., R5F, DSP, or Cortex-M3), the destination core, the message buffer address in FEC_SHARED_RAM (0x21100000), and state.

Write a complete, testable python implementation of this IPC mailbox simulation.
```

---

## 🛠️ Prompt 3: Detailed Task Prompt — EDMA and PaRAM Set Validation

```text
Task: Build a parameter verification and virtual execution module for the Enhanced Direct Memory Access (EDMA) block of the AWRL6844.

System Requirements:
- Implement a class EDMAValidator that manages virtual Parameter RAM (PaRAM) sets.
- Each PaRAM set is represented as a structured 32-byte block in memory (SRC_ADDR, A_CNT, B_CNT, DST_ADDR, SRC_B_IDX, DST_B_IDX, LINK_ADDR, C_CNT).

Behavioral Logic:
1. Parameter Verification: Implement validate_param_set(param_set_index, raw_bytes):
   - Ensure SRC_ADDR and DST_ADDR fall strictly within valid memory space blocks.
   - Warn if LINK_ADDR is out of bounds or points to an unaligned offset.
2. Transfer Modes Simulation:
   - Implement trigger_transfer(param_set_index, sync_mode) where sync_mode is 0 (A-Synchronized) or 1 (B-Synchronized).
   - In A-Sync: A single trigger transfers A_CNT bytes. Decrement B_CNT.
   - In B-Sync: A single trigger transfers an entire frame of size (A_CNT * B_CNT) bytes.
   - Link reload: If B_CNT or C_CNT reaches zero, automatically reload the PaRAM set parameters from the address defined in LINK_ADDR.
3. Chaining & Interrupt Emulation:
   - Mock a secondary transfer trigger if the channel configuration has chaining bits enabled.

Provide clean unit tests passing valid and invalid PaRAM hex strings to prove it catches configuration bugs on the fly.
```

---

## 🛠️ Prompt 4: Detailed Task Prompt — PRCM Power Domain FSM

```text
Task: Implement the low-power power management state machine (PRCM) for the AWRL6844 mock simulator.

System Requirements:
- TOP_PRCM Base Address: 0x5A040000
- Tracks Switchable Power Domains: Application Subsystem (APPSS), Front-End Subsystem (FECSS), DSP Subsystem (DSS), and ANALOG.
- Tracks Device Power States: Active (1145 mW), Processing (335 mW), Idle (28 mW), Deep Sleep (3.91 mW).

Behavioral Logic:
1. Transition FSM: Define state transition steps from Active -> Processing -> Idle -> Deep Sleep.
2. Memory Retention Verification:
   - When a deep sleep request is triggered, check the simulated retention registers.
   - If memory retention bits are cleared, wipe the contents of the dynamic Shared L3 RAM array (0x88000000).
   - If retention bits are set, preserve the memory array contents.
3. Wakeup Sequence emulation:
   - Simulate a wakeup trigger (from TOP_GIO or internal timer).
   - Check if the memory array was preserved. If yes, execute a rapid warmup wakeup (simulating direct wakeup from TCM). If no, execute a cold boot sequence (simulating a full 80 MHz QSPI boot recovery reading from flash).
4. Safety Trip: Simulate an Error Signaling Module (ESM) Group 2 fault. Trigger an asynchronous callback that overrides the power state, bringing the device to an immediate Safe Reset state and toggling a virtual nERROR_OUT pin.

Deliver a fully realized Python implementation of this power control FSM.
```
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
