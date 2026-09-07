import React, { useEffect, useState, useRef } from 'react';
import { Terminal, Cpu, Zap, MemoryStick, Send, AlertTriangle, Play, RefreshCw, Layers } from 'lucide-react';
import { Simulator } from './lib/simulator';

export default function App() {
  const [sim] = useState(() => new Simulator());
  const [, setTick] = useState(0); // Used to force React renders on sim updates

  useEffect(() => {
    sim.onStateChange = () => setTick(t => t + 1);
  }, [sim]);

  const handleValidEDMA = () => {
    const param = new Uint8Array(32);
    const view = new DataView(param.buffer);
    view.setUint32(0, 0x00018000, true); // SRC: TCMA
    view.setUint16(4, 128, true); // A_CNT
    view.setUint16(6, 4, true); // B_CNT
    view.setUint32(8, 0x88000000, true); // DST: DSS_L3
    view.setUint16(24, 0xFFFF, true); // LINK: NULL
    sim.edma.triggerTransfer(0, 1, param);
  };

  const handleInvalidEDMA = () => {
    const param = new Uint8Array(32);
    const view = new DataView(param.buffer);
    view.setUint32(0, 0x99999999, true); // SRC: INVALID
    view.setUint16(4, 128, true); // A_CNT
    view.setUint16(6, 4, true); // B_CNT
    view.setUint32(8, 0x88000000, true); // DST: DSS_L3
    view.setUint16(24, 0xFFFF, true); // LINK: NULL
    sim.edma.triggerTransfer(1, 0, param);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 font-mono flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Cpu className="text-blue-500 w-6 h-6" />
          <h1 className="text-lg font-bold text-slate-100">AWRL6844 Simulator Engine</h1>
        </div>
        <div className="flex items-center gap-4 text-sm">
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

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Controls Sidebar */}
        <aside className="w-80 border-r border-slate-800 bg-slate-900/30 p-4 overflow-y-auto flex flex-col gap-6">
          
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

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-w-0">
          
          <div className="flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Virtual Memory Map */}
              <div className="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
                <div className="bg-slate-800/50 p-3 border-b border-slate-800 flex items-center gap-2">
                  <MemoryStick className="w-4 h-4 text-indigo-400" />
                  <h3 className="font-semibold text-sm">Virtual Memory Map (vMMU)</h3>
                </div>
                <div className="p-4 space-y-3">
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

              {/* Register States */}
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
                </div>
              </div>
            </div>
          </div>

          {/* Terminal */}
          <div className="h-72 bg-black border-t border-slate-800 flex flex-col">
            <div className="bg-slate-900 border-b border-slate-800 p-2 px-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-semibold text-slate-300">Simulator Log Trace</span>
              </div>
              <button 
                onClick={() => { sim.logs = []; setTick(t => t+1); }}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                Clear
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed space-y-1">
              {sim.logs.map(log => (
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

