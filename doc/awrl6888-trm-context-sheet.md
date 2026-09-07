# AWRL6888 Technical Reference Manual (TRM) Grounding Context Sheet

This document compiles the hardware-register specifications, scaled address maps, and transceiver configurations for the **Texas Instruments AWRL6888 (XWRL688x Platform)** mmWave Radar. It serves as the baseline context sheet to be provided to Google AI Studio alongside your simulation programming prompts.

---

### 1. Physical Memory Topographies (AWRL6888 Scaled Map)
To accommodate the larger data payloads of an 8x8 transceiver grid, the on-chip L3 RAM is expanded to hold the 64-channel virtual radar cube:
- **APPSS Cortex-R5F TCMA RAM**: 512 KBytes (Base: `0x00018000`, Range: `0x00018000 - 0x00097FFF`)
- **APPSS Cortex-R5F TCMB RAM**: 256 KBytes (Base: `0x08000000`, Range: `0x08000000 - 0x0803FFFF`)
- **DSS C66x DSP L2 RAM**: 384 KBytes (Base Address in APPSS: `0x80800000`, Base in DSS: `0x00800000`)
- **DSS L3 Native RAM**: 1.4 MBytes (Base Address: `0x88000000`, Range: `0x88000000 - 0x8815FFFF`)
- **External QSPI Flash Memory**: 32 MBytes (Base: `0x70000000`)

---

### 2. Peripheral Base Address Registries
- **HSM_MBOX / APPSS_MBOX**: `0x44000000`
- **TOP_PRCM (Power & Reset Control)**: `0x5A040000`
- **TOP_IOMUX (Pin Multiplexing)**: `0x5A000000`
- **APP_CTRL (SoC Control Registers)**: `0x56060000`
- **DSS_ADCBUF_READ**: `0x83000000`
- **DSS_ADCBUF_WRITE**: `0x83100000`

---

### 3. 8x8 Transceiver & 64-Channel MIMO Specifications
The primary upgrade of the AWRL6888 is its advanced transceiver and antenna configuration:
- **Receiver Array**: 8 independent Rx channels (RX1 to RX8) utilizing 10 MHz real-only baseband filters.
- **Transmitter Array**: 8 independent Tx channels (TX1 to TX8) with per-chirp binary phase modulation (BPM).
- **MIMO Processing**: Supports up to **64 virtual antennas** ($8\text{ TX} \times 8\text{ RX}$). This generates 4 times the spatial resolution of the AWRL6844, allowing occupant vital sign tracking and seating footwell localization.

---

### 4. 8-Bit Channel Mask Control Protocols
API configuration parameters are expanded to use an **8-bit mask** to configure the 8 available physical channels:
- **Command Syntax**: `channelCfg <RX_mask> <TX_mask> <Cascading>`
- **Value Definitions**:
    - `RX_mask = 255 (0xFF / 11111111)`: Enables all 8 receive channels.
    - `TX_mask = 255 (0xFF / 11111111)`: Enables all 8 transmit channels.
    - `TX_mask = 15 (0x0F / 00001111)`: Fallback 4TX mode (emulating AWRL6844 backward compatibility).

---

### 5. Multi-Core Mailbox Handshaking Offsets
Core-to-core message transfers follow the standard register-pulsing handshake rules to prevent polling loops:
- `MBOX_WRITE_DONE`: Pulsed by the sending core once the message payload is formatted in `FEC_SHARED_RAM` (`0x21100000`).
- `MBOX_READ_REQ`: Automatically asserted by the hardware to trigger a core-level interrupt in the target core.
- `MBOX_READ_DONE`: Written by the receiving core upon successful payload readout to clear the read request and unlock the channel.
