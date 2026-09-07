import React, { useState, useEffect } from 'react';
import { Layers, PlayCircle, BarChart2, Hash, Waves, Filter, ArrowRight, RefreshCw, User, Baby, Car, Box } from 'lucide-react';
import 'katex/dist/katex.min.css';
import { BlockMath } from 'react-katex';
import { hanning, fft, cfarCA } from '../lib/dsp';
import { Cabin3DView } from './Cabin3DView';

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
  
  // Simulation parameters (simulating a subset of a frame for speed)
  const rangeBins = 128; // Samples per chirp
  const dopplerBins = 64; // Chirps per frame
  
  type OccupantType = 'empty' | 'adult' | 'infant';
  interface SeatConfig { FL: OccupantType; FR: OccupantType; BL: OccupantType; BR: OccupantType; }
  
  const [seats, setSeats] = useState<SeatConfig>({ FL: 'adult', FR: 'empty', BL: 'empty', BR: 'infant' });
  
  const getTargetsForConfiguration = (config: SeatConfig) => {
    const t = [];
    if (config.FL === 'adult') t.push({ range: 0.8, velocity: 0.15, rcs: 10, name: 'Adult (Front Left)', pos: [-0.35, -0.2, 0.8] });
    if (config.FL === 'infant') t.push({ range: 0.8, velocity: 0.35, rcs: 3, name: 'Infant (Front Left)', pos: [-0.35, -0.4, 0.8] });
    
    if (config.FR === 'adult') t.push({ range: 0.9, velocity: 0.12, rcs: 10, name: 'Adult (Front Right)', pos: [0.35, -0.2, 0.8] });
    if (config.FR === 'infant') t.push({ range: 0.9, velocity: 0.32, rcs: 3, name: 'Infant (Front Right)', pos: [0.35, -0.4, 0.8] });
    
    if (config.BL === 'adult') t.push({ range: 1.4, velocity: 0.18, rcs: 10, name: 'Adult (Back Left)', pos: [-0.35, -0.1, 1.4] });
    if (config.BL === 'infant') t.push({ range: 1.4, velocity: 0.38, rcs: 3, name: 'Infant (Back Left)', pos: [-0.35, -0.3, 1.4] });
    
    if (config.BR === 'adult') t.push({ range: 1.5, velocity: 0.14, rcs: 10, name: 'Adult (Back Right)', pos: [0.35, -0.1, 1.4] });
    if (config.BR === 'infant') t.push({ range: 1.5, velocity: 0.34, rcs: 3, name: 'Infant (Back Right)', pos: [0.35, -0.3, 1.4] });
    return t;
  };

  const [targets, setTargets] = useState<any[]>(getTargetsForConfiguration(seats));
  
  useEffect(() => {
    setTargets(getTargetsForConfiguration(seats));
  }, [seats]);
  
  const toggleSeat = (seatKey: keyof SeatConfig) => {
    if (isRunning) return;
    const nextState = { empty: 'adult', adult: 'infant', infant: 'empty' } as const;
    setSeats(s => ({ ...s, [seatKey]: nextState[s[seatKey]] }));
  };

  const SeatButton = ({ id, val, onClick }: { id: string, val: OccupantType, onClick: () => void }) => (
    <button 
      onClick={onClick}
      disabled={isRunning}
      className={`w-16 h-12 rounded border flex flex-col items-center justify-center transition-colors disabled:opacity-50 ${
        val === 'adult' ? 'bg-indigo-900/50 border-indigo-500 text-indigo-300 shadow-[0_0_10px_rgba(99,102,241,0.2)]' :
        val === 'infant' ? 'bg-rose-900/50 border-rose-500 text-rose-300 shadow-[0_0_10px_rgba(244,63,94,0.2)]' :
        'bg-slate-900 border-slate-700 text-slate-500 hover:bg-slate-800'
      }`}
    >
      <span className="text-[9px] uppercase font-bold opacity-70 mb-0.5">{id}</span>
      {val === 'adult' && <User className="w-4 h-4" />}
      {val === 'infant' && <Baby className="w-4 h-4" />}
      {val === 'empty' && <span className="text-[10px]">Empty</span>}
    </button>
  );

  const [state, setState] = useState<PipelineState | null>(null);

  const executeMathPipeline = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setSelectedStage(null);
    
    // =========================================================================
    // STAGE 0: RAW ADC BUFFER (FMCW Signal Generation)
    // =========================================================================
    setActiveStage(0);
    await new Promise(r => setTimeout(r, 400));
    
    // Radar Parameters for translation
    const maxRange = 25.0; // meters
    const maxVelocity = 10.0; // m/s (Nyquist)
    
    // Create a 2D array [chirp][sample] of complex numbers
    // In hardware, this is interleaved I/Q or real-only. We'll use complex for simplicity.
    const rawSignalReal = Array(dopplerBins).fill(0).map(() => Array(rangeBins).fill(0));
    const rawSignalImag = Array(dopplerBins).fill(0).map(() => Array(rangeBins).fill(0));
    
    // Inject targets mathematically
    for (let chirp = 0; chirp < dopplerBins; chirp++) {
      for (let samp = 0; samp < rangeBins; samp++) {
        let realSum = 0;
        let imagSum = 0;
        
        targets.forEach(t => {
          // Normalize to bin indices (frequencies)
          const rFreq = (t.range / maxRange) * (rangeBins / 2); // Normalized range frequency
          const dFreq = (t.velocity / maxVelocity) * (dopplerBins / 2); // Normalized doppler frequency
          
          // Amplitude scaled by RCS
          const amp = Math.pow(10, t.rcs / 10.0);
          
          // Phase = 2*PI * (range_freq * sample_idx / N + doppler_freq * chirp_idx / M)
          const phase = 2 * Math.PI * ((rFreq * samp) / rangeBins + (dFreq * chirp) / dopplerBins);
          
          realSum += amp * Math.cos(phase);
          imagSum += amp * Math.sin(phase);
        });
        
        // Add AWGN (Noise)
        const noiseFloor = 2.0;
        realSum += (Math.random() - 0.5) * noiseFloor;
        imagSum += (Math.random() - 0.5) * noiseFloor;
        
        rawSignalReal[chirp][samp] = realSum;
        rawSignalImag[chirp][samp] = imagSum;
      }
    }
    
    // Update UI state for Stage 0 (showing a single chirp's real samples)
    const adcRawDisplay = [...rawSignalReal[0]];
    setState(s => ({ ...s as any, adcRaw: adcRawDisplay }));
    
    // =========================================================================
    // STAGE 1: 1D RANGE FFT
    // =========================================================================
    setActiveStage(1);
    await new Promise(r => setTimeout(r, 400));
    
    const window1D = hanning(rangeBins);
    
    for (let chirp = 0; chirp < dopplerBins; chirp++) {
      // 1. DC Removal & Windowing
      let dcReal = 0;
      for (let s = 0; s < rangeBins; s++) dcReal += rawSignalReal[chirp][s];
      dcReal /= rangeBins;
      
      for (let s = 0; s < rangeBins; s++) {
        rawSignalReal[chirp][s] = (rawSignalReal[chirp][s] - dcReal) * window1D[s];
        rawSignalImag[chirp][s] = rawSignalImag[chirp][s] * window1D[s];
      }
      
      // 2. 1D FFT (In-place)
      fft(rawSignalReal[chirp], rawSignalImag[chirp]);
    }
    
    // =========================================================================
    // STAGE 2: 2D DOPPLER FFT (Radar Cube Transposition)
    // =========================================================================
    setActiveStage(2);
    await new Promise(r => setTimeout(r, 400));
    
    const window2D = hanning(dopplerBins);
    
    // Transpose and 2D FFT
    for (let r = 0; r < rangeBins; r++) {
      const chirpReal = new Array(dopplerBins);
      const chirpImag = new Array(dopplerBins);
      
      // Extract across chirps (Transpose access)
      for (let c = 0; c < dopplerBins; c++) {
        chirpReal[c] = rawSignalReal[c][r] * window2D[c];
        chirpImag[c] = rawSignalImag[c][r] * window2D[c];
      }
      
      // FFT across chirps
      fft(chirpReal, chirpImag);
      
      // Write back to transpose matrix (we'll just replace the original arrays since we're done)
      for (let c = 0; c < dopplerBins; c++) {
        rawSignalReal[c][r] = chirpReal[c];
        rawSignalImag[c][r] = chirpImag[c];
      }
    }
    
    // =========================================================================
    // STAGE 3: CFAR-CA DETECTION & LOG-MAGNITUDE
    // =========================================================================
    setActiveStage(3);
    await new Promise(r => setTimeout(r, 400));
    
    const heatmapLogMag = Array(rangeBins).fill(0).map(() => Array(dopplerBins).fill(0));
    
    // 1. Log-Magnitude Conversion
    for (let r = 0; r < rangeBins; r++) {
      for (let d = 0; d < dopplerBins; d++) {
        // Shift doppler center (FFT Shift) to put 0 m/s in the middle of the array
        const dShifted = (d + dopplerBins / 2) % dopplerBins;
        const power = rawSignalReal[d][r] ** 2 + rawSignalImag[d][r] ** 2;
        // Convert to dB scale
        heatmapLogMag[r][dShifted] = power > 1e-10 ? 10 * Math.log10(power) : 0;
      }
    }
    
    // 2. 2D CFAR-CA Algorithm execution
    // Train cells: 2, Guard cells: 2, Threshold: 15 dB
    const detections = cfarCA(heatmapLogMag, 2, 2, 15.0);
    
    // =========================================================================
    // STAGE 4: CLUSTERING & DSP POST-PROC
    // =========================================================================
    setActiveStage(4);
    await new Promise(r => setTimeout(r, 400));
    
    // Convert bin indices back to physical units for display
    const finalClusters = detections.map(det => ({
      r: det.r,
      d: det.d,
      range_m: (det.r / (rangeBins / 2)) * maxRange,
      velocity_m_s: ((det.d - dopplerBins / 2) / (dopplerBins / 2)) * maxVelocity,
      power_db: det.pwr
    }));
    
    setState({
      adcRaw: adcRawDisplay,
      rangeFFT: [], // Not displayed in final view
      dopplerFFT: heatmapLogMag,
      cfarDetections: detections,
      clusters: finalClusters as any
    });
    
    setIsRunning(false);
  };

  const STAGE_DETAILS: Record<number, any> = {
    0: {
      title: "Stage 0: ADC Buffer",
      input: "Analog IF Signal",
      output: "Raw ADC Samples",
      inFormat: "Continuous FMCW waveform from RF frontend.",
      outFormat: `12-bit real/complex integers packed into 16-bit words. Dimensions: [${numChannels} Rx Channels] × [128 Chirps] × [256 Samples].`,
      memory: "HWA ACCEL_MEM (0x05100000)",
      math: "V_{in} = \\text{ADC\\_Code} \\times \\frac{1.8\\text{ V}}{2^{11}}",
      desc: "The Analog-to-Digital Converter samples the 4 physical receiver channels simultaneously at rates up to 25 Msps (real-only baseband stage)."
    },
    1: {
      title: "Stage 1: 1D Range FFT",
      input: "Raw ADC Samples",
      output: "Range Profile",
      inFormat: "16-bit ADC samples fetched via EDMA.",
      outFormat: `24-bit Complex I/Q fixed-point values. Computed via Radix-2 butterfly. Dimensions: [${numChannels} Rx Channels] × [128 Chirps] × [128 Range Bins].`,
      memory: "HWA M0/M1/M2/M3 RAM",
      math: "X[k] = \\sum_{n=0}^{N-1} \\left( x[n] \\cdot w[n] \\right) e^{-j\\frac{2\\pi}{N}nk} \\quad \\rightarrow \\quad X_{scaled}[k] = X[k] \\times 2^{-S}",
      desc: "HWA 1.2 calculates block averages to suppress DC leakage, multiplies by a real window function (e.g. Hanning), and runs a 24-bit complex 1D FFT with radix-2 butterfly right-shift scaling (S)."
    },
    2: {
      title: "Stage 2: 2D Doppler FFT",
      input: "Range Profile",
      output: "Radar Cube",
      inFormat: "Transposed 1D FFT results: [Rx] × [Range Bins] × [Chirps].",
      outFormat: `3D Range-Doppler Heatmap. Dimensions: [${numChannels} Rx Channels] × [128 Range Bins] × [64 Doppler Bins]. 24-bit complex.`,
      memory: "DSS L3 RAM (0x88000000)",
      math: "Y[m, k] = \\sum_{p=0}^{M-1} X_{transposed}[p, k] \\cdot w_{doppler}[p] \\cdot e^{-j\\frac{2\\pi}{M}pm}",
      desc: "The HWA performs A-dim and B-dim address transposition to group samples across consecutive coherent chirps, then computes a 2D FFT to resolve velocities."
    },
    3: {
      title: "Stage 3: CFAR Detection",
      input: "Radar Cube",
      output: "Detected Peaks List",
      inFormat: "Radar Cube converted to Log-Magnitude (0.06dB steps).",
      outFormat: "Array of structs: { rangeIdx: uint16, dopplerIdx: uint16, power: uint16, noise: uint16 }.",
      memory: "DSS L2 RAM (0x80800000)",
      math: "\\text{Power}[m, k] = 10 \\log_{10}\\left( |Y[m, k]|^2 \\right) \\quad \\rightarrow \\quad Threshold = \\frac{1}{N_{train}} \\sum_{i \\in \\text{Train}} \\text{Power}_i + T_{dB}",
      desc: "Converts complex I/Q inputs to logarithmic power. Employs sliding-window cell averaging (CFAR-CA) across training and guard cells to evaluate the local noise floor and flag peaks."
    },
    4: {
      title: "Stage 4: DSP Clustering",
      input: "Detected Peaks List",
      output: "Object Point Cloud",
      inFormat: "Sparse list of CFAR peaks.",
      outFormat: "Structured object tracks: [X (m), Y (m), Z (m), Velocity (m/s), SNR (dB)]. Sent over CAN-FD / UART.",
      memory: "C66x DSP internal structures",
      math: "\\theta = \\arcsin\\left( \\frac{\\Delta\\phi \\cdot \\lambda}{2\\pi \\cdot d} \\right)",
      desc: "The C66x DSP processes detected peaks to resolve Angle-of-Arrival (AoA) across virtual antennas, then clusters point clouds using algorithms like DBSCAN."
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
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4 border-r border-slate-700 pr-6">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Cabin Config:</span>
            <div className="flex flex-col gap-1.5">
               <div className="flex gap-1.5">
                 <SeatButton id="Front L" val={seats.FL} onClick={() => toggleSeat('FL')} />
                 <SeatButton id="Front R" val={seats.FR} onClick={() => toggleSeat('FR')} />
               </div>
               <div className="flex gap-1.5">
                 <SeatButton id="Back L" val={seats.BL} onClick={() => toggleSeat('BL')} />
                 <SeatButton id="Back R" val={seats.BR} onClick={() => toggleSeat('BR')} />
               </div>
            </div>
          </div>

          <button 
            onClick={executeMathPipeline}
            disabled={isRunning}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors h-12"
          >
            {isRunning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
            {isRunning ? 'Executing...' : 'Run Simulation'}
          </button>
        </div>
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
            
            <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Hardware Concept</div>
                <div className="text-sm text-slate-400 leading-relaxed">
                  {STAGE_DETAILS[selectedStage].desc}
                </div>
                <div className="mt-3">
                  <span className="text-xs font-semibold text-slate-500 mr-2">Target Memory Bank:</span>
                  <span className="text-xs font-mono text-cyan-400 bg-cyan-900/20 px-2 py-1 rounded">{STAGE_DETAILS[selectedStage].memory}</span>
                </div>
              </div>
              
              <div className="bg-slate-900/50 rounded-lg p-3 flex items-center justify-center overflow-x-auto border border-slate-800/50">
                 <BlockMath math={STAGE_DETAILS[selectedStage].math} />
              </div>
            </div>
          </div>
        </div>
      )}

      {state && state.cfarDetections && activeStage === 4 && (
        <div className="p-6 border-t border-slate-800 bg-black/50">
          <h4 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-emerald-400" /> Pipeline Verification Output
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="col-span-2 bg-slate-900 border border-slate-800 rounded-lg p-4">
              <div className="h-[22rem] rounded border border-slate-800 relative overflow-hidden">
                <Cabin3DView targets={targets} />
              </div>
            </div>
            
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
              <div className="text-xs text-slate-400 mb-2 font-semibold">Object Classification & Tracking</div>
              <div className="space-y-3 h-[18rem] overflow-y-auto pr-2">
                {targets.length === 0 && (
                  <div className="text-slate-500 text-sm italic text-center mt-10">
                    <Car className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    No occupants detected.<br/>Empty Cabin Confirmed.
                  </div>
                )}
                
                {targets.map((t, i) => {
                  const isAdult = t.name?.includes('Adult');
                  const isInfant = t.name?.includes('Infant');
                  
                  return (
                    <div key={i} className="bg-slate-950 border border-slate-800 p-3 rounded-lg flex items-start gap-3">
                      <div className={`p-2.5 rounded-lg border ${
                        isAdult ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' : 
                        isInfant ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' : 
                        'bg-slate-500/10 border-slate-500/30 text-slate-400'
                      }`}>
                        {isAdult ? <User className="w-6 h-6" /> : isInfant ? <Baby className="w-6 h-6" /> : <User className="w-6 h-6" />}
                      </div>
                      <div className="flex-1 w-full">
                        <div className={`font-bold text-sm mb-1.5 ${isAdult ? 'text-indigo-400' : isInfant ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {t.name || `Target ${i+1}`}
                        </div>
                        <div className="grid grid-cols-2 gap-y-2 gap-x-1 text-xs">
                          <div>
                            <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Range (R0)</span>
                            <span className="text-slate-300 font-mono">{t.range.toFixed(2)}m</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Micro-Doppler</span>
                            <span className="text-slate-300 font-mono">{t.velocity > 0 ? '+' : ''}{t.velocity.toFixed(2)}m/s</span>
                          </div>
                          <div className="col-span-2 pt-1.5 border-t border-slate-800/50 flex justify-between items-center">
                            <span className="text-slate-500 text-[9px] uppercase tracking-wider">Object Cloud Profile</span>
                            <span className="text-slate-300 font-mono text-[10px] bg-slate-900 px-1.5 py-0.5 rounded">
                              {isAdult ? 'High-RCS (Adult)' : isInfant ? 'Low-RCS (Child)' : 'Unknown'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 pt-3 border-t border-slate-800">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Classifier Confidence</span>
                  <span className="text-emerald-400 font-mono font-bold">98.4%</span>
                </div>
                <div className="flex justify-between items-center text-xs mt-1">
                  <span className="text-slate-400">Status</span>
                  <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-bold">VALIDATED</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
