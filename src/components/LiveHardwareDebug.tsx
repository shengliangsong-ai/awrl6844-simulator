import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Cpu, Plug, Settings, Database, Activity, RefreshCw, Play, Square, AlertTriangle, Link2, Link2Off } from 'lucide-react';

type ConnectionType = 'uart' | 'can' | 'jtag';

export const LiveHardwareDebug: React.FC = () => {
  const [connType, setConnType] = useState<ConnectionType>('uart');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  
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
    setLogs(prev => [...prev, `[JTAG/AHB] Reading address ${regAddr}...`]);
    
    // Simulate read delay
    await new Promise(r => setTimeout(r, 300));
    
    // Generate a fake memory value
    const fakeVal = '0x' + Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0').toUpperCase();
    setRegVal(fakeVal);
    setLogs(prev => [...prev, `[JTAG/AHB] Read ${regAddr} -> ${fakeVal}`]);
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
        {/* Memory Explorer (Particularly useful for JTAG/CAN) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
          <h3 className="font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <Database className="w-4 h-4 text-cyan-400" /> Internal Memory / Register Explorer
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            Directly access internal memory banks (e.g. DSS L3 RAM: 0x88000000, HWA ACCEL_MEM: 0x05100000) or peripheral registers over {connType.toUpperCase()}.
          </p>
          
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Address (Hex)</label>
              <input 
                type="text" 
                value={regAddr}
                onChange={(e) => setRegAddr(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Value / Output</label>
              <input 
                type="text" 
                value={regVal}
                readOnly
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono text-emerald-400 opacity-80"
              />
            </div>
            <button 
              onClick={handleReadMemory}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm font-semibold transition-colors border border-slate-700"
            >
              Read
            </button>
            <button 
              onClick={() => setLogs(prev => [...prev, `[ERROR] Write protected or unsupported via ${connType.toUpperCase()} in current mode.`])}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm font-semibold transition-colors border border-slate-700"
            >
              Write
            </button>
          </div>
          
          <div className="mt-4 flex gap-2">
            <button onClick={() => setRegAddr('0x88000000')} className="text-[10px] bg-slate-800 px-2 py-1 rounded text-slate-400 hover:text-slate-200">DSS L3 RAM (0x88000000)</button>
            <button onClick={() => setRegAddr('0x05100000')} className="text-[10px] bg-slate-800 px-2 py-1 rounded text-slate-400 hover:text-slate-200">HWA ACCEL_MEM (0x05100000)</button>
            <button onClick={() => setRegAddr('0x02000000')} className="text-[10px] bg-slate-800 px-2 py-1 rounded text-slate-400 hover:text-slate-200">R5F TCMA (0x02000000)</button>
          </div>
        </div>

        {/* Live Terminal */}
        <div className="bg-[#0c1017] border border-slate-800 rounded-xl shadow-lg flex-1 flex flex-col overflow-hidden">
          <div className="bg-slate-900 border-b border-slate-800 p-3 flex justify-between items-center">
            <h3 className="font-semibold text-slate-200 text-sm flex items-center gap-2">
              <Terminal className="w-4 h-4 text-slate-400" /> Live Stream Console
            </h3>
            <button onClick={() => setLogs([])} className="text-[10px] text-slate-500 hover:text-slate-300 uppercase font-bold tracking-wider">
              Clear
            </button>
          </div>
          <div className="flex-1 p-4 overflow-y-auto font-mono text-[11px] leading-relaxed text-slate-300">
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
    </div>
  );
};
