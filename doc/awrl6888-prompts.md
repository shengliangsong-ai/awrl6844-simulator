# Google AI Studio Prompts: AWRL6888 Functional Mock Simulator

Copy and paste these optimized, context-grounded prompts into **Google AI Studio** alongside the companion file `awrl6888-trm-context-sheet.md` to programmatically build the simulator classes.

---

### 🛠️ Prompt 1: Top-Level Architecture Prompt (AWRL6888 Target)
```text
Role: High-Performance Embedded Software Architect

Task: Implement a modular, functional register-level and memory-mapped mock simulator for the Texas Instruments AWRL6888 mmWave Radar SoC in Python (3.10+).

Context:
Use the provided "AWRL6888 Technical Reference Manual (TRM) Grounding Context Sheet" as the absolute source of truth. All base addresses, memory sizes, register offsets, and bits must match the hardware specifications exactly. Note that the AWRL6888 uses a scaled Gen2+ Low-Power Architecture with an 8T8R transceiver array.

Functional Requirements:
1. Virtual Memory Management Unit (vMMU):
   - Implement an address trapping and translation class. 
   - Define contiguous byte arrays for: APP R5F TCMA (512 KB at 0x00018000), TCMB (256 KB at 0x08000000), DSS L2 (384 KB at 0x80800000), DSS L3 Native RAM (1.4 MB at 0x88000000 to support 8T8R Radar Cube size), and External Flash (32 MB at 0x70000000).
   - Implement read_word(addr) and write_word(addr, val) with range validation and bus-hang emulation on invalid addresses.

2. 8x8 MIMO Transceiver State Engine:
   - Model the 8 receive and 8 transmit channels.
   - Implement handlers to parse the 8-bit channel configurations from CLI or registers (e.g., matching the 'channelCfg 255 255 0' instruction).
   - Calculate and allocate the active virtual channels (up to 64 virtual antennas) when the transceiver is enabled.

3. Extensible Module Architecture:
   - Package code into cleanly decoupled classes: VirtualMMU, Transceiver8x8, MailboxIPC, and EDMAValidator.
   - Provide a clean, text-based interactive shell (CLI) that displays active registers, memory layouts, virtual antenna grids, and logs.

Begin by setting up the VirtualMMU class with full address translation and bounds checks.
```

---

### 🛠️ Prompt 2: Detailed Task Prompt — 8-Bit Transceiver Channel Masking
```text
Task: Implement the register-level behavioral simulation of the 8-bit TX/RX channel masking registers for the AWRL6888.

System Requirements:
- Base Address: 0x56060000 (APP_CTRL)
- The register must support up to an 8-bit channel mask.
- Relevant command logic: channelCfg <RX_mask> <TX_mask> <Cascading_mode>

Behavioral Logic:
1. Write Trap: Intercept register writes containing the RX and TX masks.
2. Bit Verification:
   - Validate that RX_mask and TX_mask fall within 0 to 255 (0xFF).
   - Read individual bits of the masks. For example, if RX_mask is 255 (binary 11111111), enable virtual receive chains RX1, RX2, RX3, RX4, RX5, RX6, RX7, and RX8.
3. MIMO Configuration mapping:
   - Calculate the active virtual channel count: Count_Active(TX) * Count_Active(RX).
   - Log a warning if the antenna configuration has less than 2 transmitters enabled during MIMO modes.
4. Physical Pin Validation:
   - Read virtual package ball states. Validate that pins mapped to the active transmitters are configured for Mode 0 (RF Analog Transmit) in the pin multiplexing block (IOMUX).

Write a complete, testable Python implementation of this 8-bit channel configuration simulation.
```

---

### 🛠️ Prompt 3: Detailed Task Prompt — Scaled ADC & 64-Channel Radar Cube Memory Emulation
```text
Task: Implement a memory-mapped simulation of the AWRL6888 high-capacity ADC Buffers and the resulting 64-channel virtual Radar Cube memory layout.

System Requirements:
- DSS_ADCBUF_READ Base Address: 0x83000000
- DSS_ADCBUF_WRITE Base Address: 0x83100000
- DSS_L3 Base Address: 0x88000000 (1.4 MBytes total)

Behavioral Logic:
1. Virtual Stream Aggregator:
   - Implement write_adc_samples(channel_index, sample_array) where channel_index spans 0 to 7 (for RX1-RX8).
   - Dynamically double the buffer offset strides when switching from 4-channel to 8-channel mode to prevent data overlap.
2. Radar Cube Assembler:
   - Upon receiving a virtual chirp trigger, assemble the samples from the 8 active Rx buffers into a 3D Radar Cube array in L3 memory.
   - The dimensions must be: Chirp loops x Virtual Antennas (up to 64) x Range Bins.
   - Implement an address calculation API: get_radar_cube_address(chirp_idx, virtual_antenna_idx, range_bin_idx) which returns the exact physical address within the 0x88000000 range.
3. Memory Boundary Checks:
   - Assert immediate Bus Fault exceptions if any calculation attempts to access memory outside the designated 1.4 MB L3 boundary.

Provide a complete, testable python implementation of this memory manager, with test scripts verifying address calculations for a full 8T8R (64-channel) setup.
```
