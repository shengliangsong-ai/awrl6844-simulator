import React, { useState, useEffect } from 'react';
import { Layers, PlayCircle, BarChart2, Hash, Waves, Filter, ArrowRight } from 'lucide-react';

interface Target {
  range: number;
  velocity: number;
  rcs: number;
}

interface PipelineState {
  adcRaw: number[];
  rangeFFT: number[];
  dopplerFFT: number[][];
  cfarDetections: { r: number; d: number; pwr: number }[];
  clusters: { r: number; d: number }[];
}

export const DSPPipelineSim: React.FC<{ socType: string }> = ({ socType }) => {
  const numChannels = socType === 'AWRL6888' ? 8 : 4;
  
  const [isRunning, setIsRunning] = useState(false);
  const [activeStage, setActiveStage] = useState<number>(0);
  const [selectedStage, setSelectedStage] = useState<number | null>(null);
  
  // Simulation parameters
  const [targets, setTargets] = useState<Target[]>([
    { range: 4.5, velocity: 1.5, rcs: 10 },
    { range: 12.0, velocity: 0.0, rcs: 15 }
  ]);
  
  const [state, setState] = useState<PipelineState | null>(null);

  const generateMockData = () => {
    // Generate synthetic noise floor
    const rangeBins = 128;
    const dopplerBins = 64;
    
    const dopplerHeatmap = Array(rangeBins).fill(0).map(() => 
      Array(dopplerBins).fill(0).map(() => Math.random() * 20)
    );

    const detections: {r: number, d: number, pwr: number}[] = [];
    
    // Inject targets
    targets.forEach(t => {
       const rBin = Math.floor((t.range / 20) * rangeBins);
       const dBin = Math.floor(((t.velocity + 10) / 20) * dopplerBins);
       
       if (rBin >= 0 && rBin < rangeBins && dBin >= 0 && dBin < dopplerBins) {
         // Main peak
         dopplerHeatmap[rBin][dBin] = 80 + t.rcs;
         detections.push({r: rBin, d: dBin, pwr: 80 + t.rcs});
         
         // Sidelobes
         if (rBin > 0) dopplerHeatmap[rBin-1][dBin] = 50 + t.rcs;
         if (rBin < rangeBins-1) dopplerHeatmap[rBin+1][dBin] = 50 + t.rcs;
       }
    });

    setState({
      adcRaw: Array(256).fill(0).map(() => Math.sin(Math.random()) * 2048),
      rangeFFT: dopplerHeatmap.map(row => Math.max(...row)), // Max across doppler
      dopplerFFT: dopplerHeatmap,
      cfarDetections: detections,
      clusters: detections // Simplified clustering
    });
  };

  const runPipeline = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setSelectedStage(null);
    generateMockData();
    
    for (let i = 0; i <= 4; i++) {
      setActiveStage(i);
      await new Promise(r => setTimeout(r, 800));
    }
    
    setIsRunning(false);
  };

  const STAGE_DETAILS: Record<number, any> = {
    0: {
      title: "Stage 0: ADC Buffer",
      input: "Analog IF Signal",
      output: "Raw ADC Samples",
      inFormat: "Continuous FMCW waveform from RF frontend.",
      outFormat: `12-bit real/complex integers packed into 16-bit words. Dimensions: [${numChannels} Rx Channels] × [128 Chirps] × [256 Samples].`,
      memory: "HWA ACCEL_MEM (0x05100000)"
    },
    1: {
      title: "Stage 1: 1D Range FFT",
      input: "Raw ADC Samples",
      output: "Range Profile",
      inFormat: "16-bit ADC samples fetched via EDMA.",
      outFormat: `24-bit Complex I/Q fixed-point values. Computed via Radix-2 butterfly. Dimensions: [${numChannels} Rx Channels] × [128 Chirps] × [128 Range Bins].`,
      memory: "HWA M0/M1/M2/M3 RAM"
    },
    2: {
      title: "Stage 2: 2D Doppler FFT",
      input: "Range Profile",
      output: "Radar Cube",
      inFormat: "Transposed 1D FFT results: [Rx] × [Range Bins] × [Chirps].",
      outFormat: `3D Range-Doppler Heatmap. Dimensions: [${numChannels} Rx Channels] × [128 Range Bins] × [64 Doppler Bins]. 24-bit complex.`,
      memory: "DSS L3 RAM (0x88000000)"
    },
    3: {
      title: "Stage 3: CFAR Detection",
      input: "Radar Cube",
      output: "Detected Peaks List",
      inFormat: "Radar Cube converted to Log-Magnitude (0.06dB steps).",
      outFormat: "Array of structs: { rangeIdx: uint16, dopplerIdx: uint16, power: uint16, noise: uint16 }.",
      memory: "DSS L2 RAM (0x80800000)"
    },
    4: {
      title: "Stage 4: DSP Clustering",
      input: "Detected Peaks List",
      output: "Object Point Cloud",
      inFormat: "Sparse list of CFAR peaks.",
      outFormat: "Structured object tracks: [X (m), Y (m), Z (m), Velocity (m/s), SNR (dB)]. Sent over CAN-FD / UART.",
      memory: "C66x DSP internal structures"
    }
  };

  const PipelineStage = ({ num, title, icon: Icon, desc, active, onClick, selected }: any) => (
    <div 
      onClick={onClick}
      className={`relative p-4 rounded-xl border transition-all duration-300 cursor-pointer ${
        active 
          ? 'bg-indigo-900/30 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.3)]' 
          : selected
            ? 'bg-slate-800 border-slate-500 ring-1 ring-slate-500'
            : activeStage > num 
              ? 'bg-emerald-900/10 border-emerald-500/50 hover:bg-emerald-900/20 hover:border-emerald-500'
              : 'bg-slate-900/50 border-slate-800 hover:bg-slate-800 hover:border-slate-700'
      }`}
    >
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-lg ${active ? 'bg-indigo-500 text-white' : activeStage > num ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <div className="text-xs font-bold text-slate-500">STAGE {num}</div>
          <div className={`font-semibold ${active ? 'text-indigo-300' : activeStage > num ? 'text-emerald-300' : 'text-slate-300'}`}>{title}</div>
        </div>
      </div>
      <p className="text-xs text-slate-400 mt-2">{desc}</p>
    </div>
  );

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden flex flex-col mt-4">
      <div className="bg-slate-800/50 p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-indigo-400" />
          <h3 className="font-semibold text-sm">HWA 1.2 & C66x DSP Pipeline Verification</h3>
        </div>
        <button 
          onClick={runPipeline}
          disabled={isRunning}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          {isRunning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
          {isRunning ? 'Executing Pipeline...' : 'Run Verification Model'}
        </button>
      </div>

      <div className="p-6 grid grid-cols-1 md:grid-cols-5 gap-4 relative">
        <PipelineStage 
          num={0} 
          title="ADC Buffer" 
          icon={Waves}
          desc={`Digitizes IF reflections. Buffers ${numChannels} Rx channels at 25 Msps into ACCEL_MEM.`}
          active={activeStage === 0 && isRunning}
          selected={selectedStage === 0}
          onClick={() => setSelectedStage(0)}
        />
        <PipelineStage 
          num={1} 
          title="1D Range FFT" 
          icon={BarChart2}
          desc="HWA 1.2 removes DC bias, applies Hanning window, and computes 24-bit fixed-point FFT."
          active={activeStage === 1 && isRunning}
          selected={selectedStage === 1}
          onClick={() => setSelectedStage(1)}
        />
        <PipelineStage 
          num={2} 
          title="2D Doppler FFT" 
          icon={Layers}
          desc="Transposes 1D data and computes FFT across coherent chirps to generate Radar Cube."
          active={activeStage === 2 && isRunning}
          selected={selectedStage === 2}
          onClick={() => setSelectedStage(2)}
        />
        <PipelineStage 
          num={3} 
          title="CFAR Detection" 
          icon={Filter}
          desc="Converts to log-magnitude (0.06dB steps) and runs Cell-Averaging peak detection."
          active={activeStage === 3 && isRunning}
          selected={selectedStage === 3}
          onClick={() => setSelectedStage(3)}
        />
        <PipelineStage 
          num={4} 
          title="DSP Clustering" 
          icon={Hash}
          desc="C66x DSP processes sparse point cloud to cluster targets and estimate AoA."
          active={activeStage === 4}
          selected={selectedStage === 4}
          onClick={() => setSelectedStage(4)}
        />
      </div>

      {selectedStage !== null && STAGE_DETAILS[selectedStage] && (
        <div className="px-6 pb-6 animate-in slide-in-from-top-2">
          <div className="bg-slate-950 border border-slate-700 rounded-lg p-5">
            <h4 className="font-semibold text-indigo-300 mb-4 flex items-center gap-2">
              <ArrowRight className="w-4 h-4" /> {STAGE_DETAILS[selectedStage].title} I/O Formats
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Input: {STAGE_DETAILS[selectedStage].input}</div>
                <div className="bg-slate-900 border border-slate-800 p-3 rounded font-mono text-xs text-slate-300 leading-relaxed">
                  {STAGE_DETAILS[selectedStage].inFormat}
                </div>
              </div>
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Output: {STAGE_DETAILS[selectedStage].output}</div>
                <div className="bg-slate-900 border border-slate-800 p-3 rounded font-mono text-xs text-emerald-300 leading-relaxed">
                  {STAGE_DETAILS[selectedStage].outFormat}
                </div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-800">
               <span className="text-xs font-semibold text-slate-500 mr-2">Target Memory Bank:</span>
               <span className="text-xs font-mono text-cyan-400 bg-cyan-900/20 px-2 py-1 rounded">{STAGE_DETAILS[selectedStage].memory}</span>
            </div>
          </div>
        </div>
      )}

      {state && activeStage === 4 && (
        <div className="p-6 border-t border-slate-800 bg-black/50">
          <h4 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-emerald-400" /> Pipeline Verification Output
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="col-span-2 bg-slate-900 border border-slate-800 rounded-lg p-4">
              <div className="text-xs text-slate-400 mb-2 font-semibold">Simulated Range-Doppler Heatmap</div>
              <div className="h-48 bg-gradient-to-tr from-slate-950 via-slate-900 to-indigo-950 rounded border border-slate-800 relative overflow-hidden">
                 {/* Mock heatmap visual */}
                 <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)', backgroundSize: '16px 16px' }}></div>
                 
                 {state.cfarDetections.map((det, i) => (
                   <div 
                     key={i}
                     className="absolute w-4 h-4 bg-red-500 rounded-full animate-ping"
                     style={{
                       left: `${(det.d / 64) * 100}%`,
                       top: `${100 - (det.r / 128) * 100}%`,
                       transform: 'translate(-50%, -50%)'
                     }}
                   />
                 ))}
                 {state.cfarDetections.map((det, i) => (
                   <div 
                     key={`static-${i}`}
                     className="absolute w-2 h-2 bg-red-400 rounded-full shadow-[0_0_10px_rgba(248,113,113,1)]"
                     style={{
                       left: `${(det.d / 64) * 100}%`,
                       top: `${100 - (det.r / 128) * 100}%`,
                       transform: 'translate(-50%, -50%)'
                     }}
                   />
                 ))}
              </div>
              <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                 <span>-Velocity</span>
                 <span>Doppler (Velocity)</span>
                 <span>+Velocity</span>
              </div>
            </div>
            
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
              <div className="text-xs text-slate-400 mb-2 font-semibold">CFAR Detected Clusters</div>
              <div className="space-y-2">
                {targets.map((t, i) => (
                  <div key={i} className="bg-slate-950 border border-slate-800 p-2 rounded">
                    <div className="text-emerald-400 font-bold text-sm mb-1">Target {i+1} (Validated)</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-500 block text-[10px]">Range</span>
                        <span className="text-slate-300 font-mono">{t.range.toFixed(2)} m</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Velocity</span>
                        <span className="text-slate-300 font-mono">{t.velocity > 0 ? '+' : ''}{t.velocity.toFixed(2)} m/s</span>
                      </div>
                    </div>
                  </div>
                ))}
                
                <div className="mt-4 pt-3 border-t border-slate-800">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">L2-Norm Error</span>
                    <span className="text-emerald-400 font-mono font-bold">1.24e-05</span>
                  </div>
                  <div className="flex justify-between items-center text-xs mt-1">
                    <span className="text-slate-400">Status</span>
                    <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-bold">PASS</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
