import React, { useState, useEffect, useMemo } from 'react';
import { parseRegisterXML, ModuleDef, RegisterDef, BitfieldDef } from '../lib/xmlParser';
import { Search, Info, Settings, Save, ArrowRight, Activity, Database, Zap } from 'lucide-react';
import { Simulator } from '../lib/simulator';

const xmlModules = import.meta.glob('/src/data/*.xml', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;

interface InteractiveRegisterMapProps {
  sim?: Simulator;
}

export const InteractiveRegisterMap: React.FC<InteractiveRegisterMapProps> = ({ sim }) => {
  const [modules, setModules] = useState<ModuleDef[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState<string>('');
  const [selectedRegKey, setSelectedRegKey] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Base address for the current module, so we can interact with simulator
  const [baseAddressHex, setBaseAddressHex] = useState('00000000');
  const [regValue, setRegValue] = useState<number>(0);

  useEffect(() => {
    const loadModules = async () => {
      const loaded: ModuleDef[] = [];
      for (const path in xmlModules) {
        try {
          const content = await xmlModules[path]();
          const parsed = parseRegisterXML(content);
          if (parsed) {
            loaded.push(parsed);
          }
        } catch (e) {
          console.error(`Failed to load ${path}`, e);
        }
      }
      loaded.sort((a, b) => a.id.localeCompare(b.id));
      setModules(loaded);
      if (loaded.length > 0) {
        setSelectedModuleId(loaded[0].id);
      }
    };
    loadModules();
  }, []);

  const selectedModule = useMemo(() => modules.find(m => m.id === selectedModuleId), [modules, selectedModuleId]);
  
  // Set default base address for known modules
  useEffect(() => {
    if (selectedModule) {
      if (selectedModule.id === 'APP_CTRL') setBaseAddressHex('56060000');
      else if (selectedModule.id === 'TOP_PRCM' || selectedModule.id.includes('PRCM')) setBaseAddressHex('5A040000');
      else setBaseAddressHex('00000000');
      
      if (selectedModule.registers.length > 0) {
        setSelectedRegKey(selectedModule.registers[0].uniqueId);
      } else {
        setSelectedRegKey('');
      }
    }
  }, [selectedModule]);

  const selectedReg = useMemo(() => selectedModule?.registers.find(r => r.uniqueId === selectedRegKey), [selectedModule, selectedRegKey]);

  const filteredRegisters = useMemo(() => {
    if (!selectedModule) return [];
    if (!searchQuery) return selectedModule.registers;
    const lower = searchQuery.toLowerCase();
    return selectedModule.registers.filter(r => 
      r.id.toLowerCase().includes(lower) || 
      r.acronym.toLowerCase().includes(lower) ||
      r.description.toLowerCase().includes(lower)
    );
  }, [selectedModule, searchQuery]);

  // Update a specific bitfield
  const handleBitfieldChange = (bf: BitfieldDef, newValue: number) => {
    // Create mask for the bitfield
    const mask = ((1 << bf.width) - 1) << bf.begin;
    // Clear the bits
    let nextVal = regValue & ~mask;
    // Set the new bits
    nextVal |= (newValue << bf.begin) & mask;
    // ensure unsigned 32-bit
    setRegValue(nextVal >>> 0);
  };

  const readFromSim = () => {
    if (!sim || !selectedReg) return;
    const base = parseInt(baseAddressHex, 16);
    const offset = parseInt(selectedReg.offset, 16);
    if (isNaN(base) || isNaN(offset)) return;
    
    try {
      const val = sim.mmu.readWord(base + offset);
      setRegValue(val >>> 0);
      sim.log('UI', `Read 0x${val.toString(16).toUpperCase()} from ${selectedReg.id} (0x${(base+offset).toString(16).toUpperCase()})`, 'info');
    } catch (e: any) {
      sim.log('UI', `Failed to read ${selectedReg.id}: ${e.message}`, 'error');
    }
  };

  const writeToSim = () => {
    if (!sim || !selectedReg) return;
    const base = parseInt(baseAddressHex, 16);
    const offset = parseInt(selectedReg.offset, 16);
    if (isNaN(base) || isNaN(offset)) return;
    
    try {
      sim.mmu.writeWord(base + offset, regValue);
      sim.log('UI', `Wrote 0x${regValue.toString(16).toUpperCase()} to ${selectedReg.id} (0x${(base+offset).toString(16).toUpperCase()})`, 'info');
    } catch (e: any) {
      sim.log('UI', `Failed to write ${selectedReg.id}: ${e.message}`, 'error');
    }
  };

  if (modules.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-500">
        Loading Register Definitions...
      </div>
    );
  }

  return (
    <div className="flex h-full bg-slate-950 text-slate-300 font-mono overflow-hidden border border-slate-800 rounded-lg">
      
      {/* Sidebar: Module Selection */}
      <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
        <div className="p-3 border-b border-slate-800 bg-slate-800/50">
          <h2 className="text-sm font-bold flex items-center gap-2 text-slate-200">
            <Database className="w-4 h-4 text-indigo-400" />
            Hardware Modules
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {modules.map(m => (
            <button
              key={m.id}
              onClick={() => setSelectedModuleId(m.id)}
              className={`w-full text-left px-3 py-2 rounded text-xs truncate transition-colors ${
                selectedModuleId === m.id 
                  ? 'bg-indigo-600 text-white font-semibold shadow-sm' 
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
              title={m.description || m.id}
            >
              {m.id}
            </button>
          ))}
        </div>
      </div>

      {/* Middle: Register List */}
      <div className="w-80 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
        <div className="p-3 border-b border-slate-800 bg-slate-800/50 flex flex-col gap-3">
          <h2 className="text-sm font-bold flex items-center gap-2 text-slate-200">
            <Activity className="w-4 h-4 text-emerald-400" />
            Registers
          </h2>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-2 text-slate-500" />
            <input 
              type="text" 
              placeholder="Filter registers..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded pl-9 pr-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredRegisters.length === 0 && (
            <div className="text-xs text-slate-500 p-2 text-center italic">No registers match filter</div>
          )}
          {filteredRegisters.map(r => (
            <button
              key={r.uniqueId}
              onClick={() => { setSelectedRegKey(r.uniqueId); setRegValue(0); }}
              className={`w-full text-left px-3 py-2 rounded text-xs transition-colors flex justify-between items-center ${
                selectedRegKey === r.uniqueId 
                  ? 'bg-emerald-600 text-white font-semibold shadow-sm' 
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <span className="truncate pr-2">{r.acronym || r.id}</span>
              <span className={`font-mono text-[10px] ${selectedRegKey === r.uniqueId ? 'text-emerald-200' : 'text-slate-500'}`}>
                {r.offset}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Right: Register Detail & Bitfield Editor */}
      <div className="flex-1 bg-black flex flex-col min-w-0 overflow-y-auto relative">
        {selectedReg ? (
          <div className="p-6 max-w-4xl mx-auto w-full flex flex-col gap-6">
            
            {/* Header / Info */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 flex flex-col gap-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-xl font-bold text-slate-100 flex items-center gap-3">
                    {selectedReg.acronym || selectedReg.id}
                    <span className="bg-slate-800 text-slate-400 text-xs px-2 py-0.5 rounded font-mono border border-slate-700">
                      Offset: {selectedReg.offset}
                    </span>
                  </h1>
                  <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                    {selectedReg.description || 'No description available for this register.'}
                  </p>
                </div>
              </div>

              {/* Interactive Value Decoder */}
              <div className="bg-slate-950 rounded-md border border-slate-800 p-4 mt-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-slate-400">Current Hex Value:</span>
                    <div className="flex items-center bg-black border border-slate-700 rounded overflow-hidden shadow-inner">
                      <span className="px-3 py-2 bg-slate-800 text-slate-500 font-mono border-r border-slate-700">0x</span>
                      <input 
                        type="text" 
                        value={regValue.toString(16).toUpperCase().padStart(8, '0')}
                        onChange={e => {
                          const parsed = parseInt(e.target.value, 16);
                          if (!isNaN(parsed)) setRegValue(parsed >>> 0);
                        }}
                        maxLength={8}
                        className="bg-transparent font-mono text-lg text-emerald-400 px-3 py-1.5 w-32 outline-none focus:bg-slate-900 transition-colors"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded px-2 py-1 mr-4">
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Base Addr:</span>
                      <span className="text-slate-500 font-mono text-xs">0x</span>
                      <input 
                        type="text"
                        value={baseAddressHex}
                        onChange={e => setBaseAddressHex(e.target.value)}
                        className="bg-transparent text-xs text-slate-300 font-mono w-20 outline-none focus:text-white"
                        placeholder="00000000"
                      />
                    </div>
                    {sim && (
                      <>
                        <button 
                          onClick={readFromSim}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 text-xs font-semibold rounded border border-slate-700 transition-colors flex items-center gap-1"
                        >
                          <ArrowRight className="w-3 h-3 rotate-180" /> Read
                        </button>
                        <button 
                          onClick={writeToSim}
                          className="px-3 py-1.5 bg-indigo-900 hover:bg-indigo-800 text-indigo-100 text-xs font-semibold rounded border border-indigo-700 transition-colors flex items-center gap-1 shadow-sm shadow-indigo-900/50"
                        >
                          <Zap className="w-3 h-3" /> Write
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Binary View */}
                <div className="flex flex-col gap-1 mt-2">
                  <div className="flex w-full text-[10px] text-slate-600 font-semibold mb-1">
                    <div className="flex-1 text-left">31</div>
                    <div className="flex-1 text-center">24</div>
                    <div className="flex-1 text-center">16</div>
                    <div className="flex-1 text-center">8</div>
                    <div className="flex-1 text-right">0</div>
                  </div>
                  <div className="flex w-full h-8 bg-slate-900 rounded border border-slate-800 overflow-hidden divide-x divide-slate-800">
                    {Array.from({length: 32}).map((_, i) => {
                      const bit = 31 - i;
                      const val = (regValue >> bit) & 1;
                      return (
                        <div 
                          key={bit} 
                          className={`flex-1 flex items-center justify-center text-[10px] font-mono cursor-pointer transition-colors ${
                            val ? 'bg-emerald-500/20 text-emerald-400 font-bold' : 'text-slate-600 hover:bg-slate-800'
                          }`}
                          onClick={() => {
                            const mask = 1 << bit;
                            setRegValue((regValue ^ mask) >>> 0);
                          }}
                          title={`Bit ${bit}`}
                        >
                          {val}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Bitfields Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow-sm flex flex-col h-[400px]">
              <div className="bg-slate-800/50 px-4 py-3 border-b border-slate-800 flex items-center gap-2 shrink-0">
                <Settings className="w-4 h-4 text-slate-400" />
                <h3 className="font-semibold text-sm text-slate-200">Bitfields</h3>
              </div>
              
              <div className="overflow-y-auto p-4 space-y-3">
                {selectedReg.bitfields.map((bf, idx) => {
                  const bfName = bf.id || `RSVD_${bf.begin}_${bf.end}`;
                  const mask = ((1 << bf.width) - 1);
                  const bfVal = (regValue >>> bf.begin) & mask;
                  const isRsvd = !bf.id || bf.id.toUpperCase().includes('RSVD') || bf.id.toUpperCase().includes('RESERVED');

                  return (
                    <div key={idx} className={`bg-slate-950 border ${isRsvd ? 'border-slate-800/50 opacity-60' : 'border-slate-800'} rounded p-3 flex flex-col gap-3 transition-colors hover:border-slate-700`}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <span className={`font-mono text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800 ${isRsvd ? 'text-slate-600' : 'text-indigo-400'}`}>
                            [{bf.begin}{bf.width > 1 ? `:${bf.end}` : ''}]
                          </span>
                          <span className={`font-semibold text-sm ${isRsvd ? 'text-slate-500' : 'text-slate-200'}`}>
                            {bfName}
                          </span>
                          <span className="text-[10px] font-bold text-slate-600 bg-slate-900 px-1.5 py-0.5 rounded">
                            {bf.rwaccess}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 font-mono">0x</span>
                          <input 
                            type="text"
                            value={bfVal.toString(16).toUpperCase()}
                            onChange={e => {
                              const v = parseInt(e.target.value, 16);
                              if (!isNaN(v)) handleBitfieldChange(bf, v);
                            }}
                            disabled={bf.rwaccess === 'R' || isRsvd}
                            className={`w-20 bg-black border border-slate-800 rounded px-2 py-1 text-sm font-mono outline-none transition-colors ${
                              isRsvd || bf.rwaccess === 'R' 
                                ? 'text-slate-600 cursor-not-allowed' 
                                : 'text-cyan-400 focus:border-cyan-500 focus:bg-slate-900'
                            }`}
                          />
                        </div>
                      </div>
                      {bf.description && (
                        <p className="text-xs text-slate-400 pl-1 leading-relaxed border-l-2 border-slate-800">
                          {bf.description.split('#br#').map((line, i) => (
                            <React.Fragment key={i}>
                              {line}<br/>
                            </React.Fragment>
                          ))}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500 flex-col gap-4">
            <Activity className="w-12 h-12 text-slate-800" />
            <p>Select a register from the sidebar to view details</p>
          </div>
        )}
      </div>
    </div>
  );
};
