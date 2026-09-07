import React, { useEffect, useState, useRef } from 'react';
import { Terminal, Cpu, Zap, MemoryStick, Send, AlertTriangle, Play, RefreshCw, Layers, PlayCircle, Upload, Download, Book, Edit3, Activity } from 'lucide-react';
import { Simulator } from './lib/simulator';
import { usePWAInstall } from './hooks/usePWAInstall';
import { DocViewer } from './components/DocViewer';
import { DSPPipelineSim } from './components/DSPPipelineSim';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 transition"
      >
        <Download className="w-3.5 h-3.5" />
        Install App Locally
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 transition"
        >
          <Download className="w-3.5 h-3.5" />
          Install App
        </button>
        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-xl bg-slate-900 p-6 shadow-xl border border-slate-800">
              <h3 className="text-lg font-semibold text-white">Install on iOS</h3>
              <p className="mt-2 text-sm text-slate-400">
                1. Tap the <strong>Share</strong> button in Safari.<br />
                2. Tap <strong>Add to Home Screen</strong>.
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-lg bg-slate-800 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </>
    );
  }
  return null;
};

export default function App() {
  const [sim] = useState(() => new Simulator());
  const [, setTick] = useState(0);
  const [inspectAddr, setInspectAddr] = useState('88000000');
  const [demoRunning, setDemoRunning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadAddr, setUploadAddr] = useState('00018000'); // TCMA
  const [writeMemAddr, setWriteMemAddr] = useState('');
  const [writeMemVal, setWriteMemVal] = useState('');
  const [showDocs, setShowDocs] = useState(false);
  const [logFilter, setLogFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all');

  useEffect(() => {
    sim.onStateChange = () => setTick(t => t + 1);
  }, [sim]);

  const handleValidEDMA = () => {
    sim.mmu.writeWord(0x00018000, 0xDEADBEEF);
    sim.mmu.writeWord(0x00018004, 0xCAFEBABE);
    sim.mmu.writeWord(0x00018008, 0x12345678);
    sim.mmu.writeWord(0x0001800C, 0x9ABCDEF0);

    const param = new Uint8Array(32);
    const view = new DataView(param.buffer);
    view.setUint32(0, 0x00018000, true);
    view.setUint16(4, 16, true);
    view.setUint16(6, 1, true);
    view.setUint32(8, 0x88000000, true);
    view.setUint16(24, 0xFFFF, true);
    sim.edma.triggerTransfer(0, 1, param);
  };

  const handleInvalidEDMA = () => {
    const param = new Uint8Array(32);
    const view = new DataView(param.buffer);
    view.setUint32(0, 0x99999999, true);
    view.setUint16(4, 128, true);
    view.setUint16(6, 4, true);
    view.setUint32(8, 0x88000000, true);
    view.setUint16(24, 0xFFFF, true);
    sim.edma.triggerTransfer(1, 0, param);
  };

  const runDemo = () => {
    if (demoRunning) return;
    setDemoRunning(true);
    sim.log('DEMO', '--- Starting Automated Demo Sequence ---', 'info');
    
    setTimeout(() => {
      sim.log('DEMO', '1. Simulating IPC Handshake...', 'info');
      sim.mmu.writeWord(0x44000000, 0x1);
    }, 1000);

    setTimeout(() => {
      sim.mmu.writeWord(0x44000008, 0x1);
    }, 2500);

    setTimeout(() => {
      sim.log('DEMO', '2. Simulating EDMA Transfer from TCMA -> L3...', 'info');
      handleValidEDMA();
    }, 4000);

    setTimeout(() => {
      sim.log('DEMO', '3. Simulating Low Power Entry (Deep Sleep)...', 'info');
      sim.mmu.writeWord(0x5A040004, 1);
      sim.mmu.writeWord(0x5A040000, 3);
    }, 6000);

    setTimeout(() => {
      sim.log('DEMO', '4. Simulating Wakeup (Memory Preserved)...', 'info');
      sim.prcm.triggerWakeup();
    }, 8000);

    setTimeout(() => {
      sim.log('DEMO', '5. Injecting Critical Hardware Fault...', 'info');
      sim.prcm.injectFault();
      sim.log('DEMO', '--- Demo Sequence Complete ---', 'info');
      setDemoRunning(false);
    }, 10000);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const addr = parseInt(uploadAddr, 16);
    if (!isNaN(addr)) {
      sim.mmu.loadBinary(addr, bytes);
      setInspectAddr(uploadAddr); // auto-inspect loaded memory
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleWriteMemory = () => {
    const addr = parseInt(writeMemAddr, 16);
    const val = parseInt(writeMemVal, 16);
    if (!isNaN(addr) && !isNaN(val)) {
      try {
        sim.mmu.writeWord(addr, val);
        sim.log('UI', `Manual write to 0x${addr.toString(16).toUpperCase()}: 0x${val.toString(16).toUpperCase()}`, 'info');
        setInspectAddr(writeMemAddr); // auto-inspect the location we just wrote to
      } catch (err: any) {
        sim.log('UI', `Manual write failed: ${err.message}`, 'error');
      }
    }
  };

  const handleDownloadRegion = (regionName: string) => {
    const region = sim.mmu.regions.find(r => r.name === regionName);
    if (!region) return;
    const blob = new Blob([region.data], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${region.name.toLowerCase()}_dump.bin`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    sim.log('UI', `Exported memory dump for ${region.name}`, 'info');
  };

  const renderMemory = () => {
    const baseAddr = parseInt(inspectAddr, 16);
    if (isNaN(baseAddr)) return <div className="text-red-400 p-2">Invalid Hex Address</div>;
    
    const rows = [];
    for (let i = 0; i < 4; i++) {
      const rowAddr = baseAddr + (i * 16);
      const region = sim.mmu.getRegion(rowAddr);
      
      if (!region || rowAddr + 16 > region.base + region.size) {
         rows.push(
           <div key={i} className="flex gap-4 text-slate-600 mb-1">
             <span>0x{rowAddr.toString(16).toUpperCase().padStart(8, '0')}</span>
             <span>-- -- -- --  -- -- -- --  -- -- -- --  -- -- -- --</span>
           </div>
         );
         continue;
      }
      
      const words = [];
      const asciiChars = [];
      for (let j = 0; j < 4; j++) {
         try {
           const val = sim.mmu.readWord(rowAddr + j * 4);
           words.push(val.toString(16).padStart(8, '0').toUpperCase());
           
           for (let b = 0; b < 4; b++) {
             const byte = (val >> (b * 8)) & 0xFF;
             asciiChars.push((byte >= 32 && byte <= 126) ? String.fromCharCode(byte) : '.');
           }
         } catch {
           words.push('????????');
           asciiChars.push('....');
         }
      }
      
      rows.push(
         <div key={i} className="flex gap-6 text-slate-300 mb-1">
             <span className="text-slate-500 font-bold">0x{rowAddr.toString(16).toUpperCase().padStart(8, '0')}</span>
             <span className="text-emerald-300 tracking-widest">{words.join('  ')}</span>
             <span className="text-slate-400 font-mono tracking-wider ml-auto bg-slate-900 px-2 rounded hidden md:block">{asciiChars.join('')}</span>
         </div>
      );
    }
    return rows;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 font-mono flex flex-col">
      {showDocs && <DocViewer onClose={() => setShowDocs(false)} />}
      <header className="border-b border-slate-800 bg-slate-900/50 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Cpu className="text-blue-500 w-6 h-6" />
          <h1 className="text-lg font-bold text-slate-100">{sim.mmu.socType} Simulator Engine</h1>
          <button 
            onClick={() => setShowDocs(true)}
            className="flex items-center gap-2 ml-4 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 transition"
          >
            <Book className="w-3.5 h-3.5" />
            Documentation
          </button>
          <PWAInstallButton />
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <select
              value={sim.mmu.socType}
              onChange={(e) => sim.mmu.configureForSoC(e.target.value as 'AWRL6844' | 'AWRL6888')}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs font-semibold outline-none focus:border-indigo-500"
            >
              <option value="AWRL6844">AWRL6844 (4T4R)</option>
              <option value="AWRL6888">AWRL6888 (8T8R)</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Zap className={`w-4 h-4 ${sim.prcm.state === 'Active' ? 'text-yellow-400' : 'text-slate-500'}`} />
            <span>Power: {sim.prcm.powerConsumption} mW</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 rounded text-xs font-bold ${
              sim.prcm.state === 'Active' ? 'bg-green-500/20 text-green-400' : 
              sim.prcm.state === 'Deep Sleep' ? 'bg-indigo-500/20 text-indigo-400' :
              sim.prcm.state === 'Safe Reset' ? 'bg-red-500/20 text-red-400' :
              'bg-yellow-500/20 text-yellow-400'
            }`}>
              {sim.prcm.state.toUpperCase()}
            </span>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        
        <aside className="w-80 border-r border-slate-800 bg-slate-900/30 p-4 overflow-y-auto flex flex-col gap-6">
          
          <section>
            <h2 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wider flex items-center gap-2">
              <Upload className="w-4 h-4" /> Load Custom Binary
            </h2>
            <div className="bg-slate-800/50 border border-slate-700 p-3 rounded flex flex-col gap-3 text-xs">
              <div className="flex flex-col gap-1">
                <label className="text-slate-400">Target Memory Address</label>
                <div className="flex bg-slate-900 border border-slate-700 rounded overflow-hidden">
                  <span className="px-2 py-1.5 bg-slate-800 text-slate-500 border-r border-slate-700">0x</span>
                  <input 
                    type="text" 
                    value={uploadAddr}
                    onChange={(e) => setUploadAddr(e.target.value)}
                    className="bg-transparent flex-1 px-2 text-slate-300 outline-none"
                    placeholder="00018000"
                  />
                </div>
              </div>
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".bin,.hex,application/octet-stream"
                className="hidden" 
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2 bg-slate-700 hover:bg-slate-600 rounded text-slate-200 transition-colors flex items-center justify-center gap-2 font-semibold"
              >
                <Upload className="w-3.5 h-3.5" />
                Select .BIN / .HEX File
              </button>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wider flex items-center gap-2">
              <Edit3 className="w-4 h-4" /> Manual Memory Write
            </h2>
            <div className="bg-slate-800/50 border border-slate-700 p-3 rounded flex flex-col gap-3 text-xs">
              <div className="flex flex-col gap-1">
                <label className="text-slate-400">Address (Hex)</label>
                <div className="flex bg-slate-900 border border-slate-700 rounded overflow-hidden">
                  <span className="px-2 py-1.5 bg-slate-800 text-slate-500 border-r border-slate-700">0x</span>
                  <input 
                    type="text" 
                    value={writeMemAddr}
                    onChange={(e) => setWriteMemAddr(e.target.value)}
                    className="bg-transparent flex-1 px-2 text-slate-300 outline-none"
                    placeholder="5A040000"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-slate-400">Value (32-bit Hex)</label>
                <div className="flex bg-slate-900 border border-slate-700 rounded overflow-hidden">
                  <span className="px-2 py-1.5 bg-slate-800 text-slate-500 border-r border-slate-700">0x</span>
                  <input 
                    type="text" 
                    value={writeMemVal}
                    onChange={(e) => setWriteMemVal(e.target.value)}
                    className="bg-transparent flex-1 px-2 text-slate-300 outline-none"
                    placeholder="00000001"
                  />
                </div>
              </div>
              <button 
                onClick={handleWriteMemory}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 rounded text-white transition-colors flex items-center justify-center gap-2 font-semibold"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Execute Write
              </button>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wider flex items-center gap-2">
              <PlayCircle className="w-4 h-4" /> Demo Scenarios
            </h2>
            <button 
              onClick={runDemo} 
              disabled={demoRunning}
              className="w-full text-left px-3 py-2 bg-indigo-900/50 hover:bg-indigo-800/50 text-indigo-300 rounded text-sm transition-colors border border-indigo-900/50 flex justify-between disabled:opacity-50"
            >
              <span>{demoRunning ? 'Running Demo...' : 'Run Automated Sequence'}</span>
              {!demoRunning && <Play className="w-4 h-4" />}
            </button>
          </section>

          {sim.mmu.socType === 'AWRL6888' && (
            <section>
              <h2 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wider flex items-center gap-2">
                <Send className="w-4 h-4" /> 8T8R Transceiver
              </h2>
              <div className="space-y-2">
                <button onClick={() => sim.mmu.writeWord(0x56060000, 0xFFFF)} className="w-full text-left px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded text-sm transition-colors">
                  Enable All (64 Virtual Antennas)
                </button>
                <button onClick={() => sim.mmu.writeWord(0x56060000, 0x0F0F)} className="w-full text-left px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded text-sm transition-colors">
                  Fallback 4T4R Mode
                </button>
                <button onClick={() => sim.mmu.writeWord(0x56060000, 0x01FF)} className="w-full text-left px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded text-sm transition-colors">
                  Enable All RX, 1 TX (No MIMO)
                </button>
              </div>
            </section>
          )}

          <section>
            <h2 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wider flex items-center gap-2">
              <Zap className="w-4 h-4" /> PRCM Controls
            </h2>
            <div className="space-y-2">
              <button onClick={() => sim.mmu.writeWord(0x5A040000, 0)} className="w-full text-left px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded text-sm transition-colors">
                Set Active Mode
              </button>
              <button onClick={() => sim.mmu.writeWord(0x5A040000, 1)} className="w-full text-left px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded text-sm transition-colors">
                Set Processing Mode
              </button>
              <button onClick={() => sim.mmu.writeWord(0x5A040000, 3)} className="w-full text-left px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded text-sm transition-colors">
                Set Deep Sleep
              </button>
              <button onClick={() => sim.prcm.triggerWakeup()} className="w-full text-left px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded text-sm transition-colors flex items-center gap-2">
                <RefreshCw className="w-4 h-4" /> Trigger Wakeup
              </button>
              <button onClick={() => sim.mmu.writeWord(0x5A040004, sim.prcm.retentionEnabled ? 0 : 1)} className="w-full text-left px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded text-sm transition-colors flex justify-between">
                <span>Memory Retention</span>
                <span className={sim.prcm.retentionEnabled ? 'text-green-400' : 'text-red-400'}>{sim.prcm.retentionEnabled ? 'ON' : 'OFF'}</span>
              </button>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wider flex items-center gap-2">
              <Send className="w-4 h-4" /> Mailbox IPC
            </h2>
            <div className="space-y-2">
              <button onClick={() => sim.mmu.writeWord(0x44000000, 0x1)} className="w-full text-left px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded text-sm transition-colors">
                Write Pulse (Req Core 0)
              </button>
              <button onClick={() => sim.mmu.writeWord(0x44000008, 0x1)} className="w-full text-left px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded text-sm transition-colors">
                Strobe Read Done (Ack)
              </button>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4" /> EDMA Simulation
            </h2>
            <div className="space-y-2">
              <button onClick={handleValidEDMA} className="w-full text-left px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded text-sm transition-colors flex justify-between">
                <span>Valid B-Sync Transfer</span>
                <Play className="w-4 h-4 text-green-400" />
              </button>
              <button onClick={handleInvalidEDMA} className="w-full text-left px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded text-sm transition-colors flex justify-between">
                <span>Invalid SRC Transfer</span>
                <AlertTriangle className="w-4 h-4 text-red-400" />
              </button>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Safety / Diagnostics
            </h2>
            <button onClick={() => sim.prcm.injectFault()} className="w-full text-left px-3 py-2 bg-red-950/50 hover:bg-red-900/50 text-red-400 rounded text-sm transition-colors border border-red-900/50">
              Inject ESM Group 2 Fault
            </button>
          </section>

        </aside>

        <main className="flex-1 flex flex-col min-w-0">
          
          <div className="flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              <div className="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
                <div className="bg-slate-800/50 p-3 border-b border-slate-800 flex items-center gap-2">
                  <MemoryStick className="w-4 h-4 text-indigo-400" />
                  <h3 className="font-semibold text-sm">Virtual Memory Map (vMMU)</h3>
                </div>
                <div className="p-4 space-y-3 h-52 overflow-y-auto">
                  {sim.mmu.regions.map(r => (
                    <div key={r.name} className="flex flex-col p-3 bg-slate-950 rounded border border-slate-800">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-slate-200 text-sm">{r.name}</span>
                        <span className="text-xs text-slate-500">{(r.size / 1024).toLocaleString()} KB</span>
                      </div>
                      <div className="text-xs text-slate-400">
                        Base: 0x{r.base.toString(16).toUpperCase().padStart(8, '0')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden h-fit">
                <div className="bg-slate-800/50 p-3 border-b border-slate-800 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-emerald-400" />
                  <h3 className="font-semibold text-sm">Active Register State Engine</h3>
                </div>
                <div className="p-4 space-y-4">
                  <div>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Mailbox IPC (0x44000000)</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="bg-slate-950 p-2 rounded border border-slate-800">
                        <div className="text-slate-500 text-xs">MBOX_WRITE_DONE</div>
                        <div className="font-mono text-emerald-400">0x{sim.ipc.writeDone.toString(16).toUpperCase()}</div>
                      </div>
                      <div className="bg-slate-950 p-2 rounded border border-slate-800">
                        <div className="text-slate-500 text-xs">MBOX_READ_REQ</div>
                        <div className="font-mono text-amber-400">0x{sim.ipc.readReq.toString(16).toUpperCase()}</div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">TOP_PRCM (0x5A040000)</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="bg-slate-950 p-2 rounded border border-slate-800">
                        <div className="text-slate-500 text-xs">POWER_STATE</div>
                        <div className="font-mono text-blue-400">{sim.prcm.state}</div>
                      </div>
                      <div className="bg-slate-950 p-2 rounded border border-slate-800">
                        <div className="text-slate-500 text-xs">L3_RETENTION</div>
                        <div className="font-mono text-purple-400">{sim.prcm.retentionEnabled ? '1 (ENABLED)' : '0 (DISABLED)'}</div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">APP_CTRL: Transceiver (0x56060000)</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="bg-slate-950 p-2 rounded border border-slate-800">
                        <div className="text-slate-500 text-xs">ACTIVE V-ANTENNAS</div>
                        <div className="font-mono text-pink-400">{sim.transceiver.virtualAntennas}</div>
                      </div>
                      <div className="bg-slate-950 p-2 rounded border border-slate-800">
                        <div className="text-slate-500 text-xs">MASKS (TX/RX)</div>
                        <div className="font-mono text-cyan-400">
                          0x{sim.transceiver.txMask.toString(16).toUpperCase().padStart(2, '0')}/0x{sim.transceiver.rxMask.toString(16).toUpperCase().padStart(2, '0')}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {(() => {
                const numChannels = sim.mmu.socType === 'AWRL6888' ? 8 : 4;
                return (
                  <div className="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden lg:col-span-2">
                    <div className="bg-slate-800/50 p-3 border-b border-slate-800 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-cyan-400" />
                      <h3 className="font-semibold text-sm">{numChannels}T{numChannels}R MIMO Virtual Antenna Array Visualization</h3>
                    </div>
                    <div className="p-4 flex flex-col sm:flex-row items-center justify-center gap-8 bg-slate-950">
                      
                      <div className="flex flex-col gap-2">
                        <div className="text-xs text-slate-500 font-semibold mb-1 text-center">RX Channels (Cols)</div>
                        <div className="flex">
                          <div className="text-xs text-slate-500 font-semibold mr-4 flex items-center" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                            TX Channels (Rows)
                          </div>
                          <div className={`grid ${numChannels === 8 ? 'grid-cols-8' : 'grid-cols-4'} gap-1.5 p-2 bg-slate-900 rounded-lg border border-slate-800 shadow-inner`}>
                              {Array.from({length: numChannels}).map((_, tx) => 
                                Array.from({length: numChannels}).map((_, rx) => {
                                    const txActive = (sim.transceiver.txMask & (1 << tx)) !== 0;
                                    const rxActive = (sim.transceiver.rxMask & (1 << rx)) !== 0;
                                    const isActive = txActive && rxActive;
                                    
                                    return (
                                      <div 
                                        key={`${tx}-${rx}`} 
                                        className={`w-6 h-6 sm:w-8 sm:h-8 rounded ${isActive ? 'bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.6)]' : 'bg-slate-800 opacity-30'} flex items-center justify-center text-[9px] sm:text-[10px] font-bold text-white/70 transition-all duration-300`}
                                        title={`TX${tx}, RX${rx}`}
                                      >
                                        {isActive ? `V${tx*numChannels + rx}` : ''}
                                      </div>
                                    );
                                })
                              )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 p-4 bg-slate-900 rounded border border-slate-800 min-w-[200px]">
                          <div className="text-sm font-semibold text-slate-400 border-b border-slate-800 pb-2 mb-1">MIMO Statistics</div>
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Active TX (Rows):</span>
                            <span className="text-slate-300 font-bold">{sim.transceiver.txMask.toString(2).split('1').length - 1} / {numChannels}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Active RX (Cols):</span>
                            <span className="text-slate-300 font-bold">{sim.transceiver.rxMask.toString(2).split('1').length - 1} / {numChannels}</span>
                          </div>
                          <div className="flex justify-between text-sm mt-2 pt-2 border-t border-slate-800">
                            <span className="text-cyan-500 font-semibold">Virtual Antennas:</span>
                            <span className="text-cyan-400 font-bold">{sim.transceiver.virtualAntennas}</span>
                          </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="lg:col-span-2">
                <DSPPipelineSim socType={sim.mmu.socType} />
              </div>

              <div className="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden lg:col-span-2 flex flex-col">
                <div className="bg-slate-800/50 p-3 border-b border-slate-800">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MemoryStick className="w-4 h-4 text-pink-400" />
                        <h3 className="font-semibold text-sm">Memory Hex Inspector</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">Address:</span>
                        <input 
                          type="text" 
                          value={inspectAddr} 
                          onChange={e => setInspectAddr(e.target.value)}
                          className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-300 w-24 outline-none focus:border-pink-500 transition-colors"
                          placeholder="0xADDR"
                        />
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800/50">
                      <span className="text-xs text-slate-500 flex items-center mr-2">Quick Jump:</span>
                      {sim.mmu.regions.map(r => (
                        <div key={r.name} className="flex overflow-hidden rounded border border-slate-700 bg-slate-800">
                          <button
                            onClick={() => setInspectAddr(r.base.toString(16).toUpperCase().padStart(8, '0'))}
                            className="px-2 py-1 text-[10px] font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition-colors border-r border-slate-700"
                          >
                            {r.name}
                          </button>
                          <button
                            onClick={() => handleDownloadRegion(r.name)}
                            title={`Download ${r.name} memory dump`}
                            className="px-1.5 py-1 text-slate-400 hover:bg-indigo-500 hover:text-white transition-colors flex items-center justify-center"
                          >
                            <Download className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      <div className="flex overflow-hidden rounded border border-slate-700 bg-slate-800 ml-auto">
                        <button
                          onClick={() => setInspectAddr('5A040000')}
                          className="px-2 py-1 text-[10px] font-semibold text-amber-300 hover:bg-slate-700 transition-colors border-r border-slate-700"
                        >
                          PRCM
                        </button>
                        <button
                          onClick={() => setInspectAddr('56060000')}
                          className="px-2 py-1 text-[10px] font-semibold text-cyan-300 hover:bg-slate-700 transition-colors border-r border-slate-700"
                        >
                          APP_CTRL
                        </button>
                        <button
                          onClick={() => setInspectAddr('44000000')}
                          className="px-2 py-1 text-[10px] font-semibold text-emerald-300 hover:bg-slate-700 transition-colors"
                        >
                          IPC
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="p-4 bg-black overflow-y-auto flex-1 min-h-[160px]">
                  {renderMemory()}
                </div>
              </div>

            </div>
          </div>

          <div className="h-72 bg-black border-t border-slate-800 flex flex-col">
            <div className="bg-slate-900 border-b border-slate-800 p-2 px-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-semibold text-slate-300">Simulator Log Trace</span>
                </div>
                
                <div className="flex bg-slate-800 rounded border border-slate-700 overflow-hidden">
                  {(['all', 'info', 'warn', 'error'] as const).map(level => (
                    <button
                      key={level}
                      onClick={() => setLogFilter(level)}
                      className={`px-3 py-1 text-[10px] font-bold uppercase transition-colors ${
                        logFilter === level 
                          ? level === 'error' ? 'bg-red-500/20 text-red-400' 
                            : level === 'warn' ? 'bg-amber-500/20 text-amber-400'
                            : level === 'info' ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-slate-700 text-white'
                          : 'text-slate-500 hover:bg-slate-700'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button 
                  onClick={() => {
                    const trace = sim.logs.map(l => `[${new Date(l.timestamp).toISOString()}] [${l.prefix}] [${l.level.toUpperCase()}] ${l.message}`).join('\n');
                    const blob = new Blob([trace], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `simulator_trace_${new Date().getTime()}.log`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                  }}
                  className="text-[10px] font-semibold text-slate-400 hover:text-white transition-colors flex items-center gap-1 bg-slate-800 px-2 py-1 rounded"
                >
                  <Download className="w-3 h-3" /> Export
                </button>
                <button 
                  onClick={() => { sim.logs = []; setTick(t => t+1); }}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed space-y-1">
              {sim.logs.filter(log => logFilter === 'all' || log.level === logFilter).map(log => (
                <div key={log.id} className={`flex gap-3 ${
                  log.level === 'error' ? 'text-red-400' :
                  log.level === 'warn' ? 'text-amber-400' :
                  'text-slate-300'
                }`}>
                  <span className="text-slate-600 shrink-0">
                    {new Date(log.timestamp).toISOString().split('T')[1].slice(0, 12)}
                  </span>
                  <span className={`shrink-0 w-16 font-bold ${
                    log.prefix === 'MMU' ? 'text-blue-400' :
                    log.prefix === 'IPC' ? 'text-emerald-400' :
                    log.prefix === 'PRCM' ? 'text-purple-400' :
                    log.prefix === 'EDMA' ? 'text-cyan-400' :
                    log.prefix === 'ESM' ? 'text-red-500' :
                    'text-slate-500'
                  }`}>
                    [{log.prefix}]
                  </span>
                  <span className="break-all">{log.message}</span>
                </div>
              ))}
              {sim.logs.length === 0 && (
                <div className="text-slate-600 italic">No logs yet. Interact with the simulator to generate traces.</div>
              )}
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}

