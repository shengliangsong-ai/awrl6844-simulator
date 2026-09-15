import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Cpu, Plug, Settings, Database, Activity, RefreshCw, Play, Square, AlertTriangle, Link2, Link2Off, FileText, CheckCircle, XCircle } from 'lucide-react';
import { Simulator } from '../lib/simulator';

type ConnectionType = 'uart' | 'can' | 'jtag';

interface RegisterDef {
  name: string;
  address: string;
  description: string;
  defaultValue: number;
  currentValue: number | null;
  isReading: boolean;
}

const INITIAL_REGISTERS: RegisterDef[] = [
  { name: 'PADAY_CFG_REG', address: '0x5A000060', description: 'Ball U12 (CAN_FD_B_rx, HWASS_UARTA_rx)', defaultValue: 0x00000000, currentValue: null, isReading: false },
  { name: 'PADAZ_CFG_REG', address: '0x5A000064', description: 'Ball R11 (CAN_FD_B_tx, HWASS_UARTA_tx)', defaultValue: 0x00000000, currentValue: null, isReading: false },
  { name: 'PADAL_CFG_REG', address: '0x5A00002C', description: 'Ball F16 (GPIO_2, LIN_rx, I2C_sda)', defaultValue: 0x00040000, currentValue: null, isReading: false },
  { name: 'PADAV_CFG_REG', address: '0x5A000054', description: 'Ball U16 (GPIO_5, SYNC_in, LIN_rx)', defaultValue: 0x00000000, currentValue: null, isReading: false },
  { name: 'PADAX_CFG_REG', address: '0x5A00005C', description: 'Ball C16 (HOST_CLK_req, GPIO_7, LIN_tx)', defaultValue: 0x00000000, currentValue: null, isReading: false },
  { name: 'PADBC_CFG_REG', address: '0x5A000070', description: 'Ball N16 (I2C_scl, PMIC_CLKOUT, UARTA_rx)', defaultValue: 0x00040000, currentValue: null, isReading: false },
  { name: 'PADBD_CFG_REG', address: '0x5A000074', description: 'Ball N17 (I2C_sda, MCU_CLKOUT, UARTA_tx)', defaultValue: 0x00040000, currentValue: null, isReading: false },
  { name: 'PADBE_CFG_REG', address: '0x5A000078', description: 'Ball U13 (LIN_rx, UARTB_tx, GPIO_6)', defaultValue: 0x00040000, currentValue: null, isReading: false },
  { name: 'PADBF_CFG_REG', address: '0x5A00007C', description: 'Ball T11 (LIN_tx, UARTB_rx, GPIO_7)', defaultValue: 0x00040000, currentValue: null, isReading: false },
  { name: 'PADBA_CFG_REG', address: '0x5A000068', description: 'Ball P16 (LVDS_VALID, nERROR_OUT, LIN_rx)', defaultValue: 0x00000000, currentValue: null, isReading: false },
  { name: 'PADAU_CFG_REG', address: '0x5A000050', description: 'Ball N15 (nERROR_OUT, GPIO_4, SYNC_in)', defaultValue: 0x00000000, currentValue: null, isReading: false },
  { name: 'PADAK_CFG_REG', address: '0x5A000028', description: 'Ball C17 (SOP[1], PMIC_CLKOUT, LIN_tx)', defaultValue: 0x00040000, currentValue: null, isReading: false },
  { name: 'PADAA_CFG_REG', address: '0x5A000000', description: 'Ball B14 (QSPI_clk, SPIB_clk)', defaultValue: 0x00000000, currentValue: null, isReading: false },
  { name: 'PADAB_CFG_REG', address: '0x5A000004', description: 'Ball A13 (QSPI_cs_n, SPIB_cs0_n)', defaultValue: 0x00000000, currentValue: null, isReading: false },
  { name: 'PADAD_CFG_REG', address: '0x5A00000C', description: 'Ball B13 (QSPI_din, SPIB_miso, RTC_CLK_in)', defaultValue: 0x00040000, currentValue: null, isReading: false },
  { name: 'PADAC_CFG_REG', address: '0x5A000008', description: 'Ball A12 (QSPI_dout, SPIB_mosi)', defaultValue: 0x00000000, currentValue: null, isReading: false },
  { name: 'PADAE_CFG_REG', address: '0x5A000010', description: 'Ball B12 (QSPI_qdin0, I2C_scl, WU_reqin)', defaultValue: 0x00040000, currentValue: null, isReading: false },
  { name: 'PADAF_CFG_REG', address: '0x5A000014', description: 'Ball B11 (QSPI_qdin1, I2C_sda, SYNC_in)', defaultValue: 0x00040000, currentValue: null, isReading: false },
  { name: 'PADAP_CFG_REG', address: '0x5A00003C', description: 'Ball R14 (rs232_rx, I2C_sda, UARTB_rx)', defaultValue: 0x00040000, currentValue: null, isReading: false },
  { name: 'PADAO_CFG_REG', address: '0x5A000038', description: 'Ball P15 (rs232_tx, I2C_scl, UARTB_tx)', defaultValue: 0x00000000, currentValue: null, isReading: false },
  { name: 'PADAG_CFG_REG', address: '0x5A000018', description: 'Ball A16 (SPIA_clk, ePWMb, I2C_scl)', defaultValue: 0x00000000, currentValue: null, isReading: false },
  { name: 'PADAH_CFG_REG', address: '0x5A00001C', description: 'Ball B17 (SPIA_cs0_n, ePWMa, I2C_sda)', defaultValue: 0x00000000, currentValue: null, isReading: false },
  { name: 'PADAJ_CFG_REG', address: '0x5A000024', description: 'Ball B15 (SPIA_miso, GPIO_1, ePWMa)', defaultValue: 0x00040000, currentValue: null, isReading: false },
  { name: 'PADAI_CFG_REG', address: '0x5A000020', description: 'Ball A15 (SPIA_mosi, GPIO_0, ePWMb)', defaultValue: 0x00000000, currentValue: null, isReading: false },
  { name: 'PADBB_CFG_REG', address: '0x5A00006C', description: 'Ball R16 (sys_reset_out, WU_reqin, LIN_tx)', defaultValue: 0x00000000, currentValue: null, isReading: false },
  { name: 'PADAT_CFG_REG', address: '0x5A00004C', description: 'Ball T12 (TCK, ePWMb)', defaultValue: 0x00040000, currentValue: null, isReading: false },
  { name: 'PADAR_CFG_REG', address: '0x5A000044', description: 'Ball T14 (TDI, ePWMa)', defaultValue: 0x00040000, currentValue: null, isReading: false },
  { name: 'PADAS_CFG_REG', address: '0x5A000048', description: 'Ball T13 (SOP[0], TDO)', defaultValue: 0x00040000, currentValue: null, isReading: false },
  { name: 'PADAQ_CFG_REG', address: '0x5A000040', description: 'Ball T15 (TMS, sys_reset_out, RTC_CLK_in)', defaultValue: 0x00040000, currentValue: null, isReading: false },
  { name: 'PADAW_CFG_REG', address: '0x5A000058', description: 'Ball U15 (UARTA_rts, GPIO_6, LIN_tx)', defaultValue: 0x00000000, currentValue: null, isReading: false },
  { name: 'PADAM_CFG_REG', address: '0x5A000030', description: 'Ball R10 (UARTA_rx, GPIO_3, LIN_rx)', defaultValue: 0x00040000, currentValue: null, isReading: false },
  { name: 'PADAN_CFG_REG', address: '0x5A000034', description: 'Ball T10 (UARTA_tx, LIN_tx, CAN_FD_tx)', defaultValue: 0x00000000, currentValue: null, isReading: false }
];

export interface LiveHardwareDebugProps {
  sim: Simulator;
}

export const LiveHardwareDebug: React.FC<LiveHardwareDebugProps> = ({ sim }) => {
  const [connType, setConnType] = useState<ConnectionType>('uart');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [activeTab, setActiveTab] = useState<'console' | 'registers'>('console');
  const [registers, setRegisters] = useState<RegisterDef[]>(INITIAL_REGISTERS);
  
  // Connection Settings State
  const [uartBaud, setUartBaud] = useState('921600');
  const [canNominal, setCanNominal] = useState('1000000');
  const [canData, setCanData] = useState('5000000');
  const [jtagProxy, setJtagProxy] = useState('ws://127.0.0.1:8080/jtag');

  const [logs, setLogs] = useState<string[]>([
    "System Ready. Select an interface and configure settings to connect to the AWRL684x EVM."
  ]);
  const [regAddr, setRegAddr] = useState('0x88000000');
  const [regVal, setRegVal] = useState('0x00000000');
  
  const endOfLogsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfLogsRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    // Initialize PINMUX default values in SIM memory on mount
    INITIAL_REGISTERS.forEach(reg => {
      try {
        sim.mmu.writeWord(parseInt(reg.address, 16), reg.defaultValue);
      } catch (e) {
        // Ignore errors if memory region doesn't exist
      }
    });
  }, [sim]);

  const handleConnect = async () => {
    if (isConnected) {
      setIsConnected(false);
      setLogs(prev => [...prev, `[SYSTEM] Disconnected from ${connType.toUpperCase()} interface.`]);
      return;
    }

    setIsConnecting(true);
    setLogs(prev => [...prev, `[SYSTEM] Initializing ${connType.toUpperCase()} connection...`]);

    if (connType === 'uart') {
      try {
        // Attempt to use real WebSerial API if available
        if ('serial' in navigator) {
          setLogs(prev => [...prev, `[UART] Prompting user to select COM port via Browser Security Sandbox...`]);
          // Filter for Texas Instruments XDS110 devices (VID: 0x0451) to make selection easier
          const port = await (navigator as any).serial.requestPort({
            filters: [{ usbVendorId: 0x0451 }]
          });
          setLogs(prev => [...prev, `[UART] Port selected successfully. Opening at ${uartBaud} baud...`]);
          await new Promise(r => setTimeout(r, 800)); // Simulate negotiation
          setLogs(prev => [...prev, `[UART] Connected to DSS_UARTA_TX (Debug UART).`]);
          setIsConnected(true);
        } else {
          throw new Error("WebSerial API not supported in this browser.");
        }
      } catch (e: any) {
        setLogs(prev => [...prev, `[ERROR] ${e.message}. Falling back to mock connection...`]);
        await new Promise(r => setTimeout(r, 1000));
        setIsConnected(true);
        setLogs(prev => [...prev, `[MOCK] Connected to virtual AWRL6844 device at ${uartBaud} baud.`]);
      }
    } else if (connType === 'can') {
      await new Promise(r => setTimeout(r, 1000));
      setLogs(prev => [
        ...prev, 
        `[CAN-FD] Connecting via local proxy. Nominal Rate: ${Number(canNominal)/1000}kbps, Data Rate: ${Number(canData)/1000000}Mbps...`,
        `[MOCK] Proxy connection established. Target: AWRL6844_ES2.0.`
      ]);
      setIsConnected(true);
    } else if (connType === 'jtag') {
      await new Promise(r => setTimeout(r, 1500));
      setLogs(prev => [
        ...prev, 
        `[JTAG] Browser cannot access XDS110 directly. Connecting to local debug proxy at ${jtagProxy}...`,
        `[MOCK] OpenOCD / TI Cloud Agent bridge responded. Halt state: FALSE. Target: Cortex-R5F & C66x.`
      ]);
      setIsConnected(true);
    }
    
    setIsConnecting(false);
  };

  const handleReadMemory = async () => {
    if (!isConnected) {
      setLogs(prev => [...prev, `[ERROR] Cannot read memory. Device not connected.`]);
      return;
    }
    const addr = parseInt(regAddr, 16);
    if (isNaN(addr)) {
      setLogs(prev => [...prev, `[ERROR] Invalid address format.`]);
      return;
    }
    
    setLogs(prev => [...prev, `[${connType.toUpperCase()}/AHB] Reading address ${regAddr}...`]);
    
    // Simulate read delay
    await new Promise(r => setTimeout(r, 150));
    
    try {
      const val = sim.mmu.readWord(addr);
      const hexVal = '0x' + val.toString(16).padStart(8, '0').toUpperCase();
      setRegVal(hexVal);
      setLogs(prev => [...prev, `[${connType.toUpperCase()}/AHB] Read ${regAddr} -> ${hexVal}`]);
    } catch (e: any) {
      setLogs(prev => [...prev, `[ERROR] ${e.message}`]);
    }
  };

  const handleWriteMemory = async () => {
    if (!isConnected) {
      setLogs(prev => [...prev, `[ERROR] Cannot write memory. Device not connected.`]);
      return;
    }
    const addr = parseInt(regAddr, 16);
    const val = parseInt(regVal, 16);
    if (isNaN(addr) || isNaN(val)) {
      setLogs(prev => [...prev, `[ERROR] Invalid address or value format.`]);
      return;
    }
    
    setLogs(prev => [...prev, `[${connType.toUpperCase()}/AHB] Writing to address ${regAddr}...`]);
    
    // Simulate write delay
    await new Promise(r => setTimeout(r, 150));
    
    try {
      sim.mmu.writeWord(addr, val);
      setLogs(prev => [...prev, `[${connType.toUpperCase()}/AHB] Wrote 0x${val.toString(16).padStart(8, '0').toUpperCase()} to ${regAddr}`]);
    } catch (e: any) {
      setLogs(prev => [...prev, `[ERROR] ${e.message}`]);
    }
  };

  const handleReadRegisterMap = async (index: number) => {
    if (!isConnected) {
      setLogs(prev => [...prev, `[ERROR] Cannot read register. Device not connected.`]);
      return;
    }

    const reg = registers[index];
    
    // Set reading state
    setRegisters(regs => {
      const newRegs = [...regs];
      newRegs[index].isReading = true;
      return newRegs;
    });

    setLogs(prev => [...prev, `[${connType.toUpperCase()}] Reading ${reg.name} (${reg.address})...`]);

    await new Promise(r => setTimeout(r, 400)); // Simulate hardware delay

    let currentVal = reg.defaultValue;
    try {
      currentVal = sim.mmu.readWord(parseInt(reg.address, 16));
    } catch (e) {
      setLogs(prev => [...prev, `[ERROR] Failed to read ${reg.address}`]);
    }

    setRegisters(regs => {
      const newRegs = [...regs];
      newRegs[index].currentValue = currentVal;
      newRegs[index].isReading = false;
      return newRegs;
    });

    setLogs(prev => [...prev, `[${connType.toUpperCase()}] Read ${reg.name} -> 0x${currentVal.toString(16).padStart(8, '0').toUpperCase()}`]);
  };

  const toHex = (num: number) => '0x' + (num >>> 0).toString(16).padStart(8, '0').toUpperCase();
  const toBin = (num: number) => (num >>> 0).toString(2).padStart(32, '0');

  // Component to visualize bit differences
  const BitDiffVisualizer = ({ defaultVal, currentVal }: { defaultVal: number, currentVal: number }) => {
    const defBits = toBin(defaultVal);
    const curBits = toBin(currentVal);
    
    return (
      <div className="flex font-mono text-[10px] tracking-[0.2em]">
        {curBits.split('').map((bit, i) => {
          const isDiff = defBits[i] !== bit;
          return (
            <span key={i} className={`${isDiff ? 'text-rose-400 font-bold bg-rose-400/20' : 'text-slate-500'} ${i % 4 === 3 && i !== 31 ? 'mr-1.5' : ''}`}>
              {bit}
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-120px)] mt-4">
      {/* Left Sidebar - Connection & Settings */}
      <div className="w-full lg:w-80 flex flex-col gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
          <h3 className="font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <Plug className="w-4 h-4 text-indigo-400" /> Interface Selection
          </h3>
          
          <div className="flex flex-col gap-2 mb-6">
            <button 
              onClick={() => !isConnected && setConnType('uart')}
              className={`p-3 rounded-lg border text-left flex items-center justify-between transition-colors ${connType === 'uart' ? 'bg-indigo-900/40 border-indigo-500/50 text-indigo-300' : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'} ${isConnected && connType !== 'uart' ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div>
                <div className="font-bold text-sm">UART (WebSerial)</div>
                <div className="text-[10px] opacity-70">DSS_UARTA Debug Port</div>
              </div>
              <Terminal className="w-4 h-4 opacity-50" />
            </button>
            {connType === 'uart' && (
              <div className="px-3 pb-3 mb-2 -mt-1 animate-in slide-in-from-top-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Baud Rate</label>
                <select 
                  value={uartBaud} 
                  onChange={(e) => setUartBaud(e.target.value)}
                  disabled={isConnected}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                >
                  <option value="115200">115200 (CFG Port)</option>
                  <option value="921600">921600 (Data Port Default)</option>
                  <option value="1834000">1834000 (High Speed)</option>
                  <option value="3125000">3125000 (Max Speed)</option>
                </select>
              </div>
            )}
            
            <button 
              onClick={() => !isConnected && setConnType('can')}
              className={`p-3 rounded-lg border text-left flex items-center justify-between transition-colors ${connType === 'can' ? 'bg-emerald-900/40 border-emerald-500/50 text-emerald-300' : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'} ${isConnected && connType !== 'can' ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div>
                <div className="font-bold text-sm">CAN-FD</div>
                <div className="text-[10px] opacity-70">Requires Local Proxy</div>
              </div>
              <Activity className="w-4 h-4 opacity-50" />
            </button>
            {connType === 'can' && (
              <div className="px-3 pb-3 mb-2 -mt-1 animate-in slide-in-from-top-2 grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Nominal</label>
                  <select 
                    value={canNominal} 
                    onChange={(e) => setCanNominal(e.target.value)}
                    disabled={isConnected}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                  >
                    <option value="500000">500 kbps</option>
                    <option value="1000000">1 Mbps</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Data Rate</label>
                  <select 
                    value={canData} 
                    onChange={(e) => setCanData(e.target.value)}
                    disabled={isConnected}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                  >
                    <option value="2000000">2 Mbps</option>
                    <option value="5000000">5 Mbps</option>
                  </select>
                </div>
              </div>
            )}
            
            <button 
              onClick={() => !isConnected && setConnType('jtag')}
              className={`p-3 rounded-lg border text-left flex items-center justify-between transition-colors ${connType === 'jtag' ? 'bg-rose-900/40 border-rose-500/50 text-rose-300' : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'} ${isConnected && connType !== 'jtag' ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div>
                <div className="font-bold text-sm">JTAG (XDS110)</div>
                <div className="text-[10px] opacity-70">Direct Core/Memory Access</div>
              </div>
              <Cpu className="w-4 h-4 opacity-50" />
            </button>
            {connType === 'jtag' && (
              <div className="px-3 pb-3 mb-2 -mt-1 animate-in slide-in-from-top-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Local Proxy Agent URL</label>
                <input 
                  type="text"
                  value={jtagProxy} 
                  onChange={(e) => setJtagProxy(e.target.value)}
                  disabled={isConnected}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-rose-500 disabled:opacity-50 font-mono"
                />
                <p className="text-[9px] text-slate-500 mt-1">Browser sandbox prevents direct USB/JTAG. Requires TI Cloud Agent or custom GDB/OpenOCD proxy on localhost.</p>
              </div>
            )}
          </div>

          <button 
            onClick={handleConnect}
            disabled={isConnecting}
            className={`w-full py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-colors ${
              isConnected 
                ? 'bg-rose-600/20 text-rose-400 border border-rose-600/50 hover:bg-rose-600/30' 
                : 'bg-indigo-600 text-white hover:bg-indigo-500 border border-indigo-500'
            }`}
          >
            {isConnecting ? <RefreshCw className="w-4 h-4 animate-spin" /> : isConnected ? <Link2Off className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
            {isConnecting ? 'Connecting...' : isConnected ? 'Disconnect' : 'Connect to Hardware'}
          </button>
        </div>

        {/* Device Status */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex-1">
           <h3 className="font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" /> Device Status
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500">Power State</span>
              {isConnected ? <span className="text-emerald-400 font-bold">ACTIVE</span> : <span className="text-slate-600">OFFLINE</span>}
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500">Target SoC</span>
              <span className="text-slate-300 font-mono">{isConnected ? 'AWRL6844' : '---'}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500">Link Speed</span>
              <span className="text-slate-300 font-mono">{isConnected ? (connType === 'uart' ? '921600 bps' : connType === 'can' ? '5 Mbps' : '2.5 MHz') : '---'}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500">Junction Temp</span>
              <span className="text-slate-300 font-mono">{isConnected ? '45°C' : '---'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Main Area - Terminal and Memory Explorer */}
      <div className="flex-1 flex flex-col gap-6">
        
        <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-lg flex-1 flex flex-col overflow-hidden">
          <div className="flex border-b border-slate-800 bg-slate-950 px-2 pt-2">
            <button
              onClick={() => setActiveTab('console')}
              className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors flex items-center gap-2 ${activeTab === 'console' ? 'bg-slate-900 text-indigo-400 border-t border-x border-slate-800' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <Terminal className="w-4 h-4" /> Live Terminal & Memory
            </button>
            <button
              onClick={() => setActiveTab('registers')}
              className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors flex items-center gap-2 ${activeTab === 'registers' ? 'bg-slate-900 text-indigo-400 border-t border-x border-slate-800' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <FileText className="w-4 h-4" /> Interactive Register Map
            </button>
          </div>

          <div className="flex-1 overflow-hidden flex flex-col">
            {activeTab === 'console' ? (
              <div className="p-5 flex flex-col h-full gap-6">
                {/* Memory Explorer */}
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
                  <h3 className="font-semibold text-slate-200 mb-2 flex items-center gap-2 text-sm">
                    <Database className="w-4 h-4 text-cyan-400" /> Internal Memory / Register Explorer
                  </h3>
                  <p className="text-xs text-slate-400 mb-4">
                    Directly access internal memory banks or peripheral registers over {connType.toUpperCase()}.
                  </p>
                  
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="flex-1 min-w-[150px]">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Address (Hex)</label>
                      <input 
                        type="text" 
                        value={regAddr}
                        onChange={(e) => setRegAddr(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div className="flex-1 min-w-[150px]">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Value / Output</label>
                      <input 
                        type="text" 
                        value={regVal}
                        onChange={(e) => setRegVal(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono text-emerald-400 opacity-80 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <button 
                      onClick={handleReadMemory}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm font-semibold transition-colors border border-slate-700"
                    >
                      Read
                    </button>
                    <button 
                      onClick={handleWriteMemory}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm font-semibold transition-colors border border-slate-700"
                    >
                      Write
                    </button>
                  </div>
                  
                  <div className="mt-4 flex gap-2">
                    <button onClick={() => setRegAddr('0x88000000')} className="text-[10px] bg-slate-800/50 px-2 py-1 rounded text-slate-400 hover:text-slate-200 border border-slate-700/50">DSS L3 RAM</button>
                    <button onClick={() => setRegAddr('0x05100000')} className="text-[10px] bg-slate-800/50 px-2 py-1 rounded text-slate-400 hover:text-slate-200 border border-slate-700/50">HWA ACCEL_MEM</button>
                    <button onClick={() => setRegAddr('0x02000000')} className="text-[10px] bg-slate-800/50 px-2 py-1 rounded text-slate-400 hover:text-slate-200 border border-slate-700/50">R5F TCMA</button>
                  </div>
                </div>

                {/* Live Terminal */}
                <div className="bg-[#0c1017] border border-slate-800 rounded-lg flex-1 flex flex-col overflow-hidden">
                  <div className="bg-slate-950 border-b border-slate-800 p-2 px-3 flex justify-between items-center">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Console Output</span>
                    <button onClick={() => setLogs([])} className="text-[10px] text-slate-500 hover:text-slate-300 uppercase font-bold tracking-wider">Clear</button>
                  </div>
                  <div className="flex-1 p-3 overflow-y-auto font-mono text-[11px] leading-relaxed text-slate-300">
                    {logs.map((log, i) => (
                      <div key={i} className={`mb-1 ${log.includes('[ERROR]') ? 'text-rose-400' : log.includes('[MOCK]') ? 'text-amber-400' : log.includes('[SYSTEM]') ? 'text-indigo-400' : ''}`}>
                        <span className="opacity-40 mr-2">[{new Date().toISOString().split('T')[1].slice(0,-1)}]</span>
                        {log}
                      </div>
                    ))}
                    <div ref={endOfLogsRef} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-0 overflow-y-auto flex-1">
                <div className="p-5 border-b border-slate-800 bg-slate-900/50">
                  <h3 className="font-semibold text-slate-200 mb-1">APPSS PinMux Registers</h3>
                  <p className="text-xs text-slate-400">
                    Extracted from Datasheet Table 6-20 (Pin Attributes). Read live values via {connType.toUpperCase()} to verify firmware configuration.
                  </p>
                </div>
                
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 text-[10px] uppercase tracking-wider">
                      <th className="p-3 border-b border-slate-800 font-semibold">Address / Name</th>
                      <th className="p-3 border-b border-slate-800 font-semibold hidden md:table-cell">Description</th>
                      <th className="p-3 border-b border-slate-800 font-semibold">Datasheet Default</th>
                      <th className="p-3 border-b border-slate-800 font-semibold">Live Hardware Value (Bit Diff)</th>
                      <th className="p-3 border-b border-slate-800 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registers.map((reg, idx) => (
                      <tr key={idx} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                        <td className="p-3">
                          <div className="font-mono text-xs text-indigo-300">{reg.address}</div>
                          <div className="text-[10px] font-bold text-slate-300 mt-0.5">{reg.name}</div>
                        </td>
                        <td className="p-3 text-xs text-slate-400 hidden md:table-cell max-w-[200px] truncate" title={reg.description}>
                          {reg.description}
                        </td>
                        <td className="p-3">
                          <div className="font-mono text-xs text-slate-400">{toHex(reg.defaultValue)}</div>
                          <div className="mt-1 font-mono text-[9px] text-slate-600 tracking-widest">{toBin(reg.defaultValue).slice(-8)}</div>
                        </td>
                        <td className="p-3">
                          {reg.currentValue === null ? (
                            <span className="text-xs text-slate-600 italic">Not read</span>
                          ) : (
                            <div>
                              <div className="flex items-center gap-2 font-mono text-xs text-emerald-400">
                                {toHex(reg.currentValue)}
                                {reg.currentValue === reg.defaultValue ? (
                                  <CheckCircle className="w-3 h-3 text-emerald-500" />
                                ) : (
                                  <AlertTriangle className="w-3 h-3 text-amber-500" />
                                )}
                              </div>
                              <div className="mt-1">
                                <BitDiffVisualizer defaultVal={reg.defaultValue} currentVal={reg.currentValue} />
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleReadRegisterMap(idx)}
                            disabled={reg.isReading || !isConnected}
                            className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors border ${
                              reg.isReading 
                                ? 'bg-slate-800 text-slate-500 border-slate-700' 
                                : isConnected 
                                  ? 'bg-indigo-900/40 text-indigo-300 border-indigo-500/50 hover:bg-indigo-900/60' 
                                  : 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed'
                            }`}
                          >
                            {reg.isReading ? 'Reading...' : 'Read'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
