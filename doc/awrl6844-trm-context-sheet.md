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
