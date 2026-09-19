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

---

## 🛠️ Prompt 5: Detailed Task Prompt — HWA 1.2 & C66x DSP Pipeline Verification

```text
Task: Implement the algorithmic radar signal processing chain and 5-tier acceptance self-test verification engine for the AWRL6844 HWA 1.2 and C66x DSP.

Context:
Ground your implementation in the "AWRL6844 mmWave Radar DSP & Hardware Accelerator Pipeline Specification". Follow the exact 6-stage dataflow from raw ADC samples to vehicle CAN-FD frames.

Functional Requirements:
1. Stage 0: 256 KB Synthetic ADC Test Vector Generator:
   - Synthesize a deterministic frame: 4 Rx antennas, 128 chirps, 256 ADC samples (16-bit complex words).
   - Inject Target 1 (Adult at 0.8m, +0.25 m/s, -25°) and Target 2 (Infant at 1.4m, -0.15 m/s, +20°) with AWGN.
2. Stage 1: 1D Range FFT:
   - Apply 256-point Hanning window and DC offset nulling.
   - Execute fixed-point 1D FFT and pack into 256 KB Range Profile buffer.
3. Stage 2: 2D Doppler FFT:
   - Execute slow-time FFT across chirps with Doppler centering shift.
   - Accumulate into a 128 KB Log-Magnitude Range-Doppler heatmap.
4. Stage 3: 2D CFAR-CA Peak Detection:
   - Implement Cell-Averaging CFAR with configurable training/guard cells and dynamic thresholding.
   - Extract candidate peak structures: range_idx, doppler_idx, peak_power_db, noise_floor_db.
5. Stage 4 & 5: AoA, Spatial Clustering & Vehicle Telematics:
   - Calculate azimuth Angle-of-Arrival (AoA) across Rx antennas and cluster into 4 vehicle seating zones (FL, FR, BL, BR).
   - Format detected occupancy and infant presence into CAN-FD telemetry frames.
6. 5-Tier Self-Test Acceptance Engine:
   - Tier 1: Peak bin exactness (±0 bins).
   - Tier 2: SQNR ≥ 45 dB and peak magnitude error ≤ 1.0 dB against 64-bit IEEE float model.
   - Tier 3: CFAR confusion matrix (TP=2, FP=0, FN=0).
   - Tier 4: Spatial coordinates tolerance (|ΔR| ≤ 0.05m, |Δθ| ≤ 2.0°, |Δv| ≤ 0.03 m/s).
   - Tier 5: Hardware regression Golden CRC-32 checksum matching.

Write an end-to-end executable test suite demonstrating all 5 verification tiers passing.
```
