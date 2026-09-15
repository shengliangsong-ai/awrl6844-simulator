import React, { useState, useEffect, useMemo } from 'react';
import { parseRegisterXML, ModuleDef, RegisterDef, BitfieldDef } from '../lib/xmlParser';
import { Search, Info, Settings, Save, ArrowRight, Activity, Database, Zap, Download, Code, Layers } from 'lucide-react';
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
  const [moduleSearchQuery, setModuleSearchQuery] = useState('');
  const [isGlobalSearch, setIsGlobalSearch] = useState(false);
  
  // Diff / Compare Feature
  const [expectedHex, setExpectedHex] = useState('');
  const expectedValue = expectedHex.trim() !== '' && !isNaN(parseInt(expectedHex, 16)) ? parseInt(expectedHex, 16) : null;

  // Base address for the current module, so we can interact with simulator
  const [baseAddressHex, setBaseAddressHex] = useState('00000000');
  const [regValue, setRegValue] = useState<number>(0);
  const [moduleValues, setModuleValues] = useState<Record<string, number>>({});

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
      
      setSelectedRegKey('');
      setModuleValues({});
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

  const globalFilteredRegisters = useMemo(() => {
    if (!isGlobalSearch || !searchQuery || searchQuery.length < 2) return [];
    const lower = searchQuery.toLowerCase();
    const results: { module: ModuleDef, reg: RegisterDef }[] = [];
    for (const m of modules) {
      for (const r of m.registers) {
        if (r.id.toLowerCase().includes(lower) || r.acronym.toLowerCase().includes(lower)) {
          results.push({ module: m, reg: r });
          if (results.length > 100) return results; // limit results for perf
        }
      }
    }
    return results;
  }, [modules, isGlobalSearch, searchQuery]);

  const filteredModules = useMemo(() => {
    if (!moduleSearchQuery) return modules;
    const lower = moduleSearchQuery.toLowerCase();
    return modules.filter(m => m.id.toLowerCase().includes(lower));
  }, [modules, moduleSearchQuery]);

  const exportCHeader = () => {
    if (!selectedModule) return;
    let out = `/**\n * Auto-generated C Header for ${selectedModule.id}\n */\n\n`;
    out += `#ifndef _${selectedModule.id}_H_\n#define _${selectedModule.id}_H_\n\n`;
    
    // Base address macro
    if (baseAddressHex !== '00000000') {
      out += `#define ${selectedModule.id}_BASE_ADDR (0x${baseAddressHex})\n\n`;
    }

    selectedModule.registers.forEach(r => {
       if (r.description) {
         out += `/* ${r.description.replace(/\n/g, ' ')} */\n`;
       }
       const regName = (r.acronym && r.acronym.trim() !== '') ? r.acronym : r.id;
       out += `#define ${selectedModule.id}_${regName} (${r.offset})\n\n`;
    });
    
    out += `#endif /* _${selectedModule.id}_H_ */\n`;
    
    const blob = new Blob([out], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedModule.id.toLowerCase()}.h`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const readAllFromSim = () => {
    if (!sim || !selectedModule) return;
    const base = parseInt(baseAddressHex, 16);
    if (isNaN(base)) return;
    
    const newVals: Record<string, number> = {};
    let successCount = 0;
    
    selectedModule.registers.forEach(r => {
      const offset = parseInt(r.offset, 16);
      if (!isNaN(offset)) {
        try {
          const val = sim.mmu.readWord(base + offset);
          newVals[r.uniqueId] = val >>> 0;
          successCount++;
        } catch (e) {
          // ignore unmapped registers
        }
      }
    });
    
    setModuleValues(newVals);
    sim.log('UI', `Read ${successCount} registers for module ${selectedModule.id} from Simulator`, 'info');
  };

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

  // Get bitfield name for hover tooltip
  const getBitfieldName = (bitIndex: number) => {
    if (!selectedReg) return 'RSVD';
    const bf = selectedReg.bitfields.find(b => bitIndex >= b.begin && bitIndex <= b.end);
    if (!bf) return 'RSVD';
    return bf.id || 'RSVD';
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
        <div className="p-3 border-b border-slate-800 bg-slate-800/50 flex flex-col gap-3">
          <h2 className="text-sm font-bold flex items-center gap-2 text-slate-200">
            <Database className="w-4 h-4 text-indigo-400" />
            Hardware Modules
          </h2>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-2 text-slate-500" />
            <input 
              type="text" 
              placeholder="Filter modules..."
              value={moduleSearchQuery}
              onChange={e => setModuleSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded pl-9 pr-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredModules.length === 0 && (
            <div className="text-xs text-slate-500 p-2 text-center italic">No modules found</div>
          )}
          {filteredModules.map(m => (
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
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold flex items-center gap-2 text-slate-200">
              <Activity className="w-4 h-4 text-emerald-400" />
              Registers
            </h2>
            <button 
              onClick={() => { setIsGlobalSearch(!isGlobalSearch); setSearchQuery(''); }}
              className={`text-[10px] px-2 py-1 rounded font-semibold transition-colors border ${
                isGlobalSearch 
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' 
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
              }`}
            >
              Global Search
            </button>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-2 text-slate-500" />
            <input 
              type="text" 
              placeholder={isGlobalSearch ? "Search ALL modules..." : "Filter registers..."}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded pl-9 pr-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {isGlobalSearch ? (
            <>
              {searchQuery.length < 2 ? (
                <div className="text-xs text-slate-500 p-2 text-center italic">Type at least 2 chars to search all modules</div>
              ) : globalFilteredRegisters.length === 0 ? (
                <div className="text-xs text-slate-500 p-2 text-center italic">No registers match global search</div>
              ) : (
                globalFilteredRegisters.map(({module, reg}) => (
                  <button
                    key={`${module.id}-${reg.uniqueId}`}
                    onClick={() => { 
                      setSelectedModuleId(module.id); 
                      setSelectedRegKey(reg.uniqueId); 
                      setRegValue(0); 
                      setIsGlobalSearch(false);
                      setSearchQuery('');
                    }}
                    className={`w-full text-left px-3 py-2 rounded text-xs transition-colors flex flex-col gap-1 ${
                      selectedRegKey === reg.uniqueId && selectedModuleId === module.id
                        ? 'bg-emerald-600 text-white font-semibold shadow-sm' 
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex justify-between items-center w-full">
                      <span className="truncate pr-2">{reg.acronym || reg.id}</span>
                      <span className={`font-mono text-[10px] ${selectedRegKey === reg.uniqueId && selectedModuleId === module.id ? 'text-emerald-200' : 'text-slate-500'}`}>
                        {reg.offset}
                      </span>
                    </div>
                    <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded w-fit ${
                      selectedRegKey === reg.uniqueId && selectedModuleId === module.id ? 'bg-emerald-700 text-emerald-100' : 'bg-slate-950 text-indigo-400 border border-slate-800'
                    }`}>
                      {module.id}
                    </div>
                  </button>
                ))
              )}
            </>
          ) : (
            <>
              {filteredRegisters.length === 0 && (
                <div className="text-xs text-slate-500 p-2 text-center italic">No registers match filter</div>
              )}
              {filteredRegisters.length > 0 && !searchQuery && (
                <button
                  onClick={() => { setSelectedRegKey(''); setRegValue(0); }}
                  className={`w-full text-left px-3 py-2 rounded text-xs transition-colors flex items-center justify-between gap-2 mb-2 ${
                    selectedRegKey === '' ? 'bg-indigo-600 text-white font-semibold shadow-sm' : 'bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Database className="w-3.5 h-3.5" />
                    <span>Module Overview</span>
                  </div>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
              {filteredRegisters.map(r => (
                <button
                  key={r.uniqueId}
                  onClick={() => { 
                    setSelectedRegKey(r.uniqueId); 
                    setRegValue(moduleValues[r.uniqueId] !== undefined ? moduleValues[r.uniqueId] : 0);
                  }}
                  className={`w-full text-left px-3 py-2 rounded text-xs transition-colors flex flex-col gap-1 ${
                    selectedRegKey === r.uniqueId 
                      ? 'bg-emerald-600 text-white font-semibold shadow-sm' 
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  <div className="flex justify-between items-center w-full">
                    <span className="truncate pr-2">{r.acronym || r.id}</span>
                    <span className={`font-mono text-[10px] ${selectedRegKey === r.uniqueId ? 'text-emerald-200' : 'text-slate-500'}`}>
                      {r.offset}
                    </span>
                  </div>
                  {moduleValues[r.uniqueId] !== undefined && (
                    <div className="text-[10px] font-mono text-emerald-400">
                      0x{moduleValues[r.uniqueId].toString(16).toUpperCase().padStart(8, '0')}
                    </div>
                  )}
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Right: Register Detail & Bitfield Editor */}
      <div className="flex-1 bg-black flex flex-col min-w-0 overflow-y-auto relative">
        {!selectedReg ? (
          <div className="p-6 max-w-4xl mx-auto w-full flex flex-col gap-6">
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 flex flex-col gap-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h1 className="text-xl font-bold text-slate-100 flex items-center gap-3">
                    <Layers className="w-5 h-5 text-indigo-400" />
                    {selectedModule?.id} Overview
                  </h1>
                  <p className="text-sm text-slate-400 mt-1">
                    {selectedModule?.description || 'Inspect and read all registers in this module.'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={exportCHeader}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded border border-slate-700 transition-colors flex items-center gap-2"
                  >
                    <Code className="w-3.5 h-3.5" /> Export .h
                  </button>
                  <button
                    onClick={readAllFromSim}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded shadow-sm flex items-center gap-2 transition-colors"
                  >
                    <Zap className="w-3.5 h-3.5" /> Read All from Simulator
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3 bg-slate-950 p-3 rounded border border-slate-800">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Module Base Address:</span>
                <span className="text-slate-500 font-mono">0x</span>
                <input 
                  type="text"
                  value={baseAddressHex}
                  onChange={e => setBaseAddressHex(e.target.value.toUpperCase())}
                  className="bg-transparent text-sm text-emerald-400 font-mono w-24 outline-none focus:bg-slate-900 px-2 py-1 rounded"
                  placeholder="00000000"
                  maxLength={8}
                />
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden flex flex-col">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 text-xs uppercase font-semibold border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-3">Register</th>
                      <th className="px-4 py-3">Offset</th>
                      <th className="px-4 py-3">Value (Hex)</th>
                      <th className="px-4 py-3">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {selectedModule?.registers.map(r => {
                      const val = moduleValues[r.uniqueId];
                      return (
                        <tr 
                          key={r.uniqueId} 
                          onClick={() => {
                            setSelectedRegKey(r.uniqueId);
                            setRegValue(val !== undefined ? val : 0);
                          }}
                          className="hover:bg-slate-800/50 cursor-pointer transition-colors group"
                        >
                          <td className="px-4 py-2 font-semibold text-slate-200 group-hover:text-indigo-300">
                            {r.acronym || r.id}
                          </td>
                          <td className="px-4 py-2 font-mono text-xs text-slate-500">
                            {r.offset}
                          </td>
                          <td className="px-4 py-2 font-mono text-sm">
                            {val !== undefined ? (
                              <span className="text-emerald-400">0x{val.toString(16).toUpperCase().padStart(8, '0')}</span>
                            ) : (
                              <span className="text-slate-600">-</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-xs text-slate-500 truncate max-w-[200px]" title={r.description}>
                            {r.description || 'No description'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
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
                <button
                  onClick={exportCHeader}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded border border-slate-700 transition-colors flex items-center gap-2"
                  title={`Export ${selectedModule.id} registers as C Header`}
                >
                  <Code className="w-3.5 h-3.5" />
                  Export .h
                </button>
              </div>

              {/* Interactive Value Decoder */}
              <div className="bg-slate-950 rounded-md border border-slate-800 p-4 mt-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <div className="flex items-center gap-6">
                    {/* Actual Hex Value */}
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-semibold text-slate-400 uppercase">Actual Hex Value</span>
                      <div className="flex items-center bg-black border border-slate-700 rounded overflow-hidden shadow-inner">
                        <span className="px-3 py-1.5 bg-slate-800 text-slate-500 font-mono border-r border-slate-700">0x</span>
                        <input 
                          type="text" 
                          value={regValue.toString(16).toUpperCase().padStart(8, '0')}
                          onChange={e => {
                            const parsed = parseInt(e.target.value, 16);
                            if (!isNaN(parsed)) setRegValue(parsed >>> 0);
                          }}
                          maxLength={8}
                          className="bg-transparent font-mono text-lg text-emerald-400 px-3 py-1 w-28 outline-none focus:bg-slate-900 transition-colors"
                        />
                      </div>
                    </div>

                    {/* Expected Hex Value (Diff) */}
                    <div className="flex flex-col gap-1 relative group">
                      <span className="text-xs font-semibold text-slate-400 uppercase flex items-center gap-1">
                        Expected Value
                      </span>
                      <div className="flex items-center bg-black border border-slate-700 rounded overflow-hidden shadow-inner">
                        <span className="px-3 py-1.5 bg-slate-800 text-slate-500 font-mono border-r border-slate-700">0x</span>
                        <input 
                          type="text" 
                          value={expectedHex}
                          onChange={e => setExpectedHex(e.target.value.replace(/[^0-9A-Fa-f]/g, '').toUpperCase())}
                          placeholder="Optional"
                          maxLength={8}
                          className="bg-transparent font-mono text-lg text-amber-400 px-3 py-1 w-28 outline-none focus:bg-slate-900 transition-colors"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded px-2 py-1">
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Base Addr:</span>
                      <span className="text-slate-500 font-mono text-xs">0x</span>
                      <input 
                        type="text"
                        value={baseAddressHex}
                        onChange={e => setBaseAddressHex(e.target.value.toUpperCase())}
                        className="bg-transparent text-xs text-slate-300 font-mono w-20 outline-none focus:text-white"
                        placeholder="00000000"
                        maxLength={8}
                      />
                    </div>
                    {sim && (
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={readFromSim}
                          className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-indigo-300 text-xs font-semibold rounded border border-slate-700 transition-colors flex items-center gap-1"
                        >
                          <ArrowRight className="w-3 h-3 rotate-180" /> Read
                        </button>
                        <button 
                          onClick={writeToSim}
                          className="px-3 py-1 bg-indigo-900 hover:bg-indigo-800 text-indigo-100 text-xs font-semibold rounded border border-indigo-700 transition-colors flex items-center gap-1 shadow-sm shadow-indigo-900/50"
                        >
                          <Zap className="w-3 h-3" /> Write
                        </button>
                      </div>
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
                      const expVal = expectedValue !== null ? ((expectedValue >> bit) & 1) : null;
                      const isBitDiff = expVal !== null && val !== expVal;

                      let bgClass = val ? 'bg-emerald-500/20 text-emerald-400 font-bold' : 'text-slate-600 hover:bg-slate-800';
                      if (isBitDiff) {
                        bgClass = 'bg-amber-500/30 text-amber-400 font-bold shadow-[inset_0_0_5px_rgba(245,158,11,0.5)]';
                      }

                      return (
                        <div 
                          key={bit} 
                          className={`flex-1 flex flex-col items-center justify-center text-[10px] font-mono cursor-pointer transition-colors ${bgClass}`}
                          onClick={() => {
                            const mask = 1 << bit;
                            setRegValue((regValue ^ mask) >>> 0);
                          }}
                          title={`Bit ${bit} - ${getBitfieldName(bit)}${isBitDiff ? `\nExpected: ${expVal}` : ''}`}
                        >
                          <span className="leading-none">{val}</span>
                          {isBitDiff && <span className="text-[7px] text-amber-500/80 leading-none -mt-[1px]">E:{expVal}</span>}
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
                  
                  const expBfVal = expectedValue !== null ? ((expectedValue >>> bf.begin) & mask) : null;
                  const isDiff = expBfVal !== null && bfVal !== expBfVal;

                  const isRsvd = !bf.id || bf.id.toUpperCase().includes('RSVD') || bf.id.toUpperCase().includes('RESERVED');

                  return (
                    <div key={idx} className={`bg-slate-950 border ${isRsvd ? 'border-slate-800/50 opacity-60' : (isDiff ? 'border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.1)]' : 'border-slate-800')} rounded p-3 flex flex-col gap-3 transition-colors hover:border-slate-700`}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <span className={`font-mono text-[10px] px-2 py-0.5 rounded bg-slate-900 border ${isDiff ? 'border-amber-500/30 text-amber-400' : 'border-slate-800 text-slate-400'}`}>
                            [{bf.begin}{bf.width > 1 ? `:${bf.end}` : ''}]
                          </span>
                          <span className={`font-semibold text-sm ${isRsvd ? 'text-slate-500' : (isDiff ? 'text-amber-400' : 'text-slate-200')}`}>
                            {bfName}
                          </span>
                          <span className="text-[10px] font-bold text-slate-600 bg-slate-900 px-1.5 py-0.5 rounded">
                            {bf.rwaccess}
                          </span>
                        </div>
                        
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-500 uppercase font-semibold">Actual:</span>
                            <span className="text-xs text-slate-500 font-mono">0x</span>
                            <input 
                              type="text"
                              value={bfVal.toString(16).toUpperCase()}
                              onChange={e => {
                                const v = parseInt(e.target.value, 16);
                                if (!isNaN(v)) handleBitfieldChange(bf, v);
                              }}
                              disabled={bf.rwaccess === 'R' || isRsvd}
                              className={`w-16 bg-black border ${isDiff ? 'border-amber-500/50' : 'border-slate-800'} rounded px-2 py-1 text-sm font-mono outline-none transition-colors ${
                                isRsvd || bf.rwaccess === 'R' 
                                  ? 'text-slate-600 cursor-not-allowed' 
                                  : 'text-cyan-400 focus:border-cyan-500 focus:bg-slate-900'
                              }`}
                            />
                          </div>
                          {expBfVal !== null && (
                            <div className="flex items-center gap-2 pr-[2px]">
                              <span className="text-[10px] text-slate-500 uppercase font-semibold">Expected:</span>
                              <span className="text-[10px] text-slate-600 font-mono">0x</span>
                              <div className={`w-16 text-right font-mono text-xs ${isDiff ? 'text-amber-400 font-bold' : 'text-slate-500'}`}>
                                {expBfVal.toString(16).toUpperCase()}
                              </div>
                            </div>
                          )}
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
        )}
      </div>
    </div>
  );
};
