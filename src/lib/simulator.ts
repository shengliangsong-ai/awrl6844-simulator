export interface MemoryRegion {
  name: string;
  base: number;
  size: number;
  data: Uint8Array;
}

export type PowerState = 'Active' | 'Processing' | 'Idle' | 'Deep Sleep' | 'Safe Reset';

export type LogEntry = {
  id: number;
  timestamp: number;
  prefix: string;
  message: string;
  level: 'info' | 'warn' | 'error';
};

export class VirtualMMU {
  regions: MemoryRegion[] = [];
  socType: 'AWRL6844' | 'AWRL6888' = 'AWRL6844';

  constructor(private sim: Simulator) {
    this.configureForSoC('AWRL6844');
  }

  configureForSoC(type: 'AWRL6844' | 'AWRL6888') {
    this.socType = type;
    if (type === 'AWRL6888') {
      this.regions = [
        { name: 'APP_R5F_TCMA', base: 0x00018000, size: 512 * 1024, data: new Uint8Array(512 * 1024) },
        { name: 'APP_R5F_TCMB', base: 0x08000000, size: 256 * 1024, data: new Uint8Array(256 * 1024) },
        { name: 'DSS_L2', base: 0x80800000, size: 384 * 1024, data: new Uint8Array(384 * 1024) },
        { name: 'DSS_L3_NATIVE', base: 0x88000000, size: 1.4 * 1024 * 1024, data: new Uint8Array(1.4 * 1024 * 1024) },
        { name: 'EXT_FLASH', base: 0x70000000, size: 32 * 1024 * 1024, data: new Uint8Array(32 * 1024 * 1024) },
        // 8x8 Transceiver Control Registers for AWRL6888
        { name: 'APP_CTRL', base: 0x56060000, size: 4096, data: new Uint8Array(4096) }
      ];
      this.sim.log('MMU', 'Reconfigured memory regions for AWRL6888 (8T8R, 1.4MB L3 RAM)', 'info');
    } else {
      this.regions = [
        { name: 'APP_R5F_TCMA', base: 0x00018000, size: 512 * 1024, data: new Uint8Array(512 * 1024) },
        { name: 'APP_R5F_TCMB', base: 0x08000000, size: 256 * 1024, data: new Uint8Array(256 * 1024) },
        { name: 'DSS_L2', base: 0x80800000, size: 384 * 1024, data: new Uint8Array(384 * 1024) },
        { name: 'DSS_L3_NATIVE', base: 0x88000000, size: 512 * 1024, data: new Uint8Array(512 * 1024) },
        { name: 'EXT_FLASH', base: 0x70000000, size: 32 * 1024 * 1024, data: new Uint8Array(32 * 1024 * 1024) },
      ];
      this.sim.log('MMU', 'Reconfigured memory regions for AWRL6844 (4T4R)', 'info');
    }
  }

  getRegion(addr: number) {
    return this.regions.find(r => addr >= r.base && addr < r.base + r.size);
  }

  readWord(addr: number): number {
    const region = this.getRegion(addr);
    if (!region) {
      this.sim.log('MMU', `Bus Hang: Invalid read address 0x${addr.toString(16).toUpperCase()}`, 'error');
      throw new Error('Bus Hang');
    }
    const offset = addr - region.base;
    const view = new DataView(region.data.buffer);
    return view.getUint32(offset, true); // Little endian
  }

  writeWord(addr: number, val: number) {
    // Trap IPC Registers
    if (addr >= 0x44000000 && addr <= 0x4400000C) {
      this.sim.ipc.handleWrite(addr, val);
      return;
    }
    
    // Trap PRCM Registers
    if (addr >= 0x5A040000 && addr <= 0x5A040010) {
      this.sim.prcm.handleWrite(addr, val);
      return;
    }

    // Trap APP_CTRL Registers for Transceiver Configuration (AWRL6888)
    if (this.socType === 'AWRL6888' && addr >= 0x56060000 && addr <= 0x56060FFF) {
      this.sim.transceiver.handleWrite(addr, val);
      // Fallthrough to actually write to the memory region
    }

    const region = this.getRegion(addr);
    if (!region) {
      this.sim.log('MMU', `Bus Hang: Invalid write address 0x${addr.toString(16).toUpperCase()}`, 'error');
      return;
    }
    
    const offset = addr - region.base;
    const view = new DataView(region.data.buffer);
    view.setUint32(offset, val, true);
    
    this.sim.log('MMU', `Wrote 0x${val.toString(16).toUpperCase()} to 0x${addr.toString(16).toUpperCase()} (${region.name})`);
  }

  loadBinary(baseAddr: number, data: Uint8Array) {
    const region = this.getRegion(baseAddr);
    if (!region) {
      this.sim.log('MMU', `Cannot load binary: Invalid base address 0x${baseAddr.toString(16).toUpperCase()}`, 'error');
      return;
    }
    if (baseAddr + data.length > region.base + region.size) {
      this.sim.log('MMU', `Cannot load binary: Exceeds region size ${region.name}`, 'error');
      return;
    }
    
    const offset = baseAddr - region.base;
    region.data.set(data, offset);
    this.sim.log('MMU', `Successfully loaded ${data.length} bytes into ${region.name} at 0x${baseAddr.toString(16).toUpperCase()}`, 'info');
    this.sim.notify();
  }
}

export class MailboxIPC {
  writeDone = 0;
  readReq = 0;

  constructor(private sim: Simulator) {}

  handleWrite(addr: number, val: number) {
    if (addr === 0x44000000) { // WRITE_DONE
      this.writeDone = val;
      this.readReq = val; // Automatically assert read request
      this.sim.log('IPC', `WRITE_DONE triggered. Asserting READ_REQ for mask 0x${val.toString(16).toUpperCase()}`);
      this.triggerInterrupt();
    } else if (addr === 0x44000008) { // READ_DONE
      this.sim.log('IPC', `READ_DONE strobe received for mask 0x${val.toString(16).toUpperCase()}. Clearing READ_REQ.`);
      this.readReq &= ~val;
    }
    this.sim.notify();
  }

  triggerInterrupt() {
    this.sim.log('INTERRUPT', `Target core interrupted for IPC payload at FEC_SHARED_RAM 0x21100000`);
  }
}

export class EDMAValidator {
  constructor(private sim: Simulator) {}

  validateParamSet(index: number, paramBytes: Uint8Array) {
    if (paramBytes.length !== 32) throw new Error("Invalid PaRAM size");
    const view = new DataView(paramBytes.buffer);
    const src = view.getUint32(0, true);
    const acnt = view.getUint16(4, true);
    const bcnt = view.getUint16(6, true);
    const dst = view.getUint32(8, true);
    const link = view.getUint16(24, true);

    const srcReg = this.sim.mmu.getRegion(src);
    const dstReg = this.sim.mmu.getRegion(dst);

    if (!srcReg || !dstReg) {
      this.sim.log('EDMA', `[FAULT] PaRAM ${index} Invalid SRC (0x${src.toString(16).toUpperCase()}) or DST (0x${dst.toString(16).toUpperCase()})`, 'error');
      return false;
    }

    if (link !== 0xFFFF && (link % 32 !== 0)) {
      this.sim.log('EDMA', `[WARN] PaRAM ${index} LINK_ADDR (0x${link.toString(16).toUpperCase()}) is unaligned!`, 'warn');
    }

    this.sim.log('EDMA', `PaRAM ${index} Validated: SRC=0x${src.toString(16).toUpperCase()} DST=0x${dst.toString(16).toUpperCase()} A_CNT=${acnt} B_CNT=${bcnt}`);
    return true;
  }

  triggerTransfer(index: number, syncMode: 0 | 1, paramBytes: Uint8Array) {
    if (!this.validateParamSet(index, paramBytes)) return;
    const view = new DataView(paramBytes.buffer);
    const src = view.getUint32(0, true);
    const acnt = view.getUint16(4, true);
    const bcnt = view.getUint16(6, true);
    const dst = view.getUint32(8, true);
    const transferSize = syncMode === 0 ? acnt : (acnt * bcnt);

    // Simulate real memory copy via vMMU
    const srcReg = this.sim.mmu.getRegion(src);
    const dstReg = this.sim.mmu.getRegion(dst);
    if (srcReg && dstReg) {
      const srcSlice = srcReg.data.slice(src - srcReg.base, src - srcReg.base + transferSize);
      dstReg.data.set(srcSlice, dst - dstReg.base);
    }

    this.sim.log('EDMA', `Triggered ${syncMode === 0 ? 'A-Sync' : 'B-Sync'} transfer on PaRAM ${index}. Transferred ${transferSize} bytes from 0x${src.toString(16).toUpperCase()} to 0x${dst.toString(16).toUpperCase()}.`);
    this.sim.notify();
  }
}

export class PRCMController {
  state: PowerState = 'Active';
  powerConsumption = 1145; // mW
  retentionEnabled = true;

  constructor(private sim: Simulator) {}

  handleWrite(addr: number, val: number) {
    if (addr === 0x5A040000) { // State transition
      switch(val) {
        case 0: this.setState('Active', 1145); break;
        case 1: this.setState('Processing', 335); break;
        case 2: this.setState('Idle', 28); break;
        case 3:
          this.setState('Deep Sleep', 3.91);
          this.evaluateRetention();
          break;
      }
    } else if (addr === 0x5A040004) { // Retention config
      this.retentionEnabled = (val === 1);
      this.sim.log('PRCM', `Memory retention configured to: ${this.retentionEnabled ? 'ENABLED' : 'DISABLED'}`);
    }
    this.sim.notify();
  }

  setState(newState: PowerState, power: number) {
    if (this.state === 'Safe Reset' && newState !== 'Active') return;
    this.state = newState;
    this.powerConsumption = power;
    this.sim.log('PRCM', `Transitioned to ${newState} mode (${power} mW)`);
    this.sim.notify();
  }

  evaluateRetention() {
    if (!this.retentionEnabled) {
      this.sim.log('PRCM', 'Retention is DISABLED. Wiping DSS_L3_NATIVE RAM...', 'warn');
      const l3 = this.sim.mmu.regions.find(r => r.name === 'DSS_L3_NATIVE');
      if (l3) {
        // Re-allocate array to simulate clearing memory instantly
        l3.data = new Uint8Array(l3.size);
      }
      this.sim.log('PRCM', 'DSS_L3_NATIVE RAM wiped.');
    } else {
      this.sim.log('PRCM', 'Retention is ENABLED. DSS_L3_NATIVE memory preserved.');
    }
  }

  triggerWakeup() {
    if (this.state !== 'Deep Sleep') {
      this.sim.log('PRCM', 'Ignored wakeup trigger: Not in Deep Sleep.', 'warn');
      return;
    }
    if (this.retentionEnabled) {
      this.sim.log('PRCM', 'Wakeup Triggered: Direct TCM warm boot executed (Memory Retained).');
    } else {
      this.sim.log('PRCM', 'Wakeup Triggered: Cold boot recovery via 80MHz QSPI executed.');
    }
    this.setState('Active', 1145);
  }

  injectFault() {
    this.sim.log('ESM', 'Group 2 Fault Injected! nERROR_OUT pulled LOW.', 'error');
    this.setState('Safe Reset', 0);
  }
}

export class Transceiver8x8 {
  rxMask = 0;
  txMask = 0;
  virtualAntennas = 0;
  active = false;

  constructor(private sim: Simulator) {}

  handleWrite(addr: number, val: number) {
    if (addr === 0x56060000) { // channelCfg 
      // Simulate bit parsing: lower 8 bits RX, next 8 bits TX
      this.rxMask = val & 0xFF;
      this.txMask = (val >> 8) & 0xFF;
      
      const rxCount = this.countBits(this.rxMask);
      const txCount = this.countBits(this.txMask);
      
      this.virtualAntennas = rxCount * txCount;
      
      this.sim.log('TRANSCEIVER', `Channel Mask Configured: RX=0x${this.rxMask.toString(16).toUpperCase()} (${rxCount} Active), TX=0x${this.txMask.toString(16).toUpperCase()} (${txCount} Active).`);
      
      if (this.virtualAntennas > 0 && txCount < 2) {
         this.sim.log('TRANSCEIVER', 'MIMO Warning: Less than 2 Transmitters active.', 'warn');
      }
      
      this.sim.log('TRANSCEIVER', `Virtual Antennas Calculated: ${this.virtualAntennas}`);
      this.sim.notify();
    }
  }

  private countBits(n: number) {
    let count = 0;
    while (n) {
      count += n & 1;
      n >>= 1;
    }
    return count;
  }
}

export class Simulator {
  logs: LogEntry[] = [];
  onStateChange?: () => void;
  private logIdCounter = 0;

  mmu: VirtualMMU;
  ipc: MailboxIPC;
  edma: EDMAValidator;
  prcm: PRCMController;
  transceiver: Transceiver8x8;

  constructor() {
    // Initialize properties that depend on Simulator passing `this` to them
    this.mmu = new VirtualMMU(this);
    this.ipc = new MailboxIPC(this);
    this.edma = new EDMAValidator(this);
    this.prcm = new PRCMController(this);
    this.transceiver = new Transceiver8x8(this);

    this.log('SYSTEM', 'Simulator Engine Booted');
  }

  log(prefix: string, message: string, level: 'info' | 'warn' | 'error' = 'info') {
    const entry: LogEntry = {
      id: this.logIdCounter++,
      timestamp: Date.now(),
      prefix,
      message,
      level,
    };
    this.logs.unshift(entry); // newest first
    if (this.logs.length > 200) {
      this.logs.pop();
    }
    this.notify();
  }

  notify() {
    this.onStateChange?.();
  }
}
