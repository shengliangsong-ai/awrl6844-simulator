import React, { useState, useEffect } from 'react';
import { Layers, PlayCircle, BarChart2, Hash, Waves, Filter, ArrowRight, RefreshCw, User, Baby, Car, Box, Table as TableIcon, BookOpen, ExternalLink, Cpu } from 'lucide-react';
import 'katex/dist/katex.min.css';
import { BlockMath } from 'react-katex';
import { hanning, fft, cfarCA } from '../lib/dsp';
import { Cabin3DView } from './Cabin3DView';
import { StagePlot } from './StagePlots';

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

export const DSPPipelineSim: React.FC<{ socType: string; onOpenDocs?: (docName?: string) => void }> = ({ socType, onOpenDocs }) => {
  const numChannels = socType === 'AWRL6888' ? 8 : 4;
  
  const [isRunning, setIsRunning] = useState(false);
  const [activeStage, setActiveStage] = useState<number>(0);
  const [selectedStage, setSelectedStage] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'pipeline' | 'table'>('pipeline');
  
  // Simulation parameters (simulating a subset of a frame for speed)
  const rangeBins = 128; // Samples per chirp
  const dopplerBins = 64; // Chirps per frame
  
  type OccupantType = 'empty' | 'adult' | 'infant';
  interface SeatConfig { FL: OccupantType; FR: OccupantType; BL: OccupantType; BR: OccupantType; }
  
  const [seats, setSeats] = useState<SeatConfig>({ FL: 'adult', FR: 'empty', BL: 'empty', BR: 'infant' });
  
  const getTargetsForConfiguration = (config: SeatConfig) => {
    const t = [];
    if (config.FL === 'adult') t.push({ range: 0.8, velocity: 0.15, rcs: 1.0, name: 'Adult (Front Left)', pos: [-0.35, -0.2, 0.8] });
    if (config.FL === 'infant') t.push({ range: 0.95, velocity: 0.35, rcs: 0.5, name: 'Infant (Front Left)', pos: [-0.35, -0.4, 0.95] });
    
    if (config.FR === 'adult') t.push({ range: 0.85, velocity: 0.12, rcs: 1.0, name: 'Adult (Front Right)', pos: [0.35, -0.2, 0.85] });
    if (config.FR === 'infant') t.push({ range: 1.0, velocity: 0.32, rcs: 0.5, name: 'Infant (Front Right)', pos: [0.35, -0.4, 1.0] });
    
    if (config.BL === 'adult') t.push({ range: 1.4, velocity: 0.18, rcs: 1.0, name: 'Adult (Back Left)', pos: [-0.35, -0.1, 1.4] });
    if (config.BL === 'infant') t.push({ range: 1.55, velocity: 0.38, rcs: 0.5, name: 'Infant (Back Left)', pos: [-0.35, -0.3, 1.55] });
    
    if (config.BR === 'adult') t.push({ range: 1.45, velocity: 0.14, rcs: 1.0, name: 'Adult (Back Right)', pos: [0.35, -0.1, 1.45] });
    if (config.BR === 'infant') t.push({ range: 1.6, velocity: 0.34, rcs: 0.5, name: 'Infant (Back Right)', pos: [0.35, -0.3, 1.6] });
    return t;
  };

  const [targets, setTargets] = useState<any[]>(getTargetsForConfiguration(seats));
  
  useEffect(() => {
    setTargets(getTargetsForConfiguration(seats));
    // Clear the previously simulated data when the configuration changes
    // so the user knows they need to re-run the simulation
    setState(null);
    setActiveStage(0);
    setSelectedStage(null);
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
    // The AWRL6844 outputs a 57-64 GHz continuous FMCW sweep via its analog TX/RX chains.
    // We are simulating the digitized IF (intermediate frequency) beat signal here, 
    // exactly as it arrives at the ADC buffer after analog downconversion.
    const maxRange = 5.0; // meters (reduced to increase resolution inside cabin)
    const maxVelocity = 2.0; // m/s (Nyquist for micro-doppler)
    
    // Define static cabin clutter that is ALWAYS present in a car (seats, dashboard)
    // Values derived from TI mmWave Demo Visualizer User's Guide (Car = 10, Motorcycle = 3.2, etc.)
    const staticClutter = [
      { range: 0.4, velocity: 0, rcs: 10.0, name: 'Dashboard' },
      { range: 0.85, velocity: 0, rcs: 3.0, name: 'Front Seats' },
      { range: 1.45, velocity: 0, rcs: 3.0, name: 'Rear Seats' },
    ];
    const allTargets = [...targets, ...staticClutter];
    
    // Create a 2D array [chirp][sample] of complex numbers
    // In hardware, this is interleaved I/Q or real-only. We'll use complex for simplicity.
    const rawSignalReal = Array(dopplerBins).fill(0).map(() => Array(rangeBins).fill(0));
    const rawSignalImag = Array(dopplerBins).fill(0).map(() => Array(rangeBins).fill(0));
    
    // Inject targets mathematically
    for (let chirp = 0; chirp < dopplerBins; chirp++) {
      for (let samp = 0; samp < rangeBins; samp++) {
        let realSum = 0;
        let imagSum = 0;
        
        allTargets.forEach(t => {
          // Normalize to bin indices (frequencies)
          const rFreq = (t.range / maxRange) * (rangeBins / 2); // Normalized range frequency
          const dFreq = (t.velocity / maxVelocity) * (dopplerBins / 2); // Normalized doppler frequency
          
          // Amplitude scaled by RCS (Using linear scale * an arbitrary factor to rise above noise)
          const amp = t.rcs * 250.0;
          
          // Phase = 2*PI * (range_freq * sample_idx / N + doppler_freq * chirp_idx / M)
          const phase = 2 * Math.PI * ((rFreq * samp) / rangeBins + (dFreq * chirp) / dopplerBins);
          
          realSum += amp * Math.cos(phase);
          imagSum += amp * Math.sin(phase);
        });
        
        // Add AWGN (Noise) - significantly increased to show realistic entropy
        const noiseFloor = 150; 
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
    
    const validRangeBins = rangeBins / 2;
    const rangeFFTMag = new Array(validRangeBins);
    for (let s = 0; s < validRangeBins; s++) {
      const mag = Math.sqrt(rawSignalReal[0][s]**2 + rawSignalImag[0][s]**2);
      // TI mmWave Demo Visualizer defaults to plotting the Range Profile in Log Scale (dB)
      rangeFFTMag[s] = mag > 1e-10 ? 20 * Math.log10(mag) : 0;
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
    
    // Only map the positive beat frequencies (valid ranges)
    const heatmapLogMag = Array(validRangeBins).fill(0).map(() => Array(dopplerBins).fill(0));
    
    // 1. Log-Magnitude Conversion
    for (let r = 0; r < validRangeBins; r++) {
      for (let d = 0; d < dopplerBins; d++) {
        // Shift doppler center (FFT Shift) to put 0 m/s in the middle of the array
        const dShifted = (d + dopplerBins / 2) % dopplerBins;
        const power = rawSignalReal[d][r] ** 2 + rawSignalImag[d][r] ** 2;
        // Convert to dB scale
        heatmapLogMag[r][dShifted] = power > 1e-10 ? 10 * Math.log10(power) : 0;
      }
    }
    
    // 2. 2D CFAR-CA Algorithm execution
    // Train cells: 2, Guard cells: 2, Threshold: 10 dB
    const detections = cfarCA(heatmapLogMag, 2, 2, 10.0);
    
    // =========================================================================
    // STAGE 4: CLUSTERING & DSP POST-PROC
    // =========================================================================
    setActiveStage(4);
    await new Promise(r => setTimeout(r, 400));
    
    // Convert bin indices back to physical units for display
    // DSP Step: Filter out static clutter (0 m/s micro-doppler) to isolate living occupants
    const finalClusters = detections
      .map(det => ({
        r: det.r,
        d: det.d,
        range_m: (det.r / (rangeBins / 2)) * maxRange,
        velocity_m_s: ((det.d - dopplerBins / 2) / (dopplerBins / 2)) * maxVelocity,
        power_db: det.pwr
      }))
      .filter(cluster => Math.abs(cluster.velocity_m_s) > 0.05); // Filter out zero-velocity targets
    
    setState({
      adcRaw: adcRawDisplay,
      rangeFFT: rangeFFTMag,
      dopplerFFT: heatmapLogMag,
      cfarDetections: detections,
      clusters: finalClusters as any
    });
    
    setIsRunning(false);
  };

  const STAGE_DETAILS: Record<number, any> = {
    0: {
      title: "Stage 0: ADC Buffer",
      unit: "RF Frontend + 12-bit ADC + CBUFF",
      input: "Analog IF Beat Signal",
      output: "Raw ADC Samples",
      inFormat: "Continuous differential IF beat waveform (-1.8V to +1.8V differential) from 57-64 GHz RF downconversion.",
      outFormat: `12-bit signed integers packed into 16-bit words. Dimensions: [${numChannels} Rx Channels] × [128 Chirps] × [256 Samples] at 25 Msps.`,
      memory: "HWA ACCEL_MEM (0x05100000)",
      math: "f_{IF} = \\frac{2 S R}{c} + \\frac{2 v}{\\lambda}",
      desc: "The hardware fractional-N PLL generates a ~60GHz chirp via the analog TX chain. The reflected analog signal is mixed with the transmitted chirp to create an IF beat frequency, which the ADC samples at 25 Msps into ACCEL_MEM.",
      purpose: "Captures raw electromagnetic reflections from cabin interior (seats, dashboard, occupants, chest-wall micro-motion)."
    },
    1: {
      title: "Stage 1: 1D Range FFT (Range Profile)",
      unit: "HWA 1.2 FFT Engine",
      input: "Raw ADC Samples",
      output: "Range Profile",
      inFormat: "16-bit ADC samples fetched from ACCEL_MEM via EDMA.",
      outFormat: `24-bit Complex I/Q fixed-point values. Computed via Radix-2 butterfly. Dimensions: [${numChannels} Rx Channels] × [128 Chirps] × [128 Range Bins].`,
      memory: "HWA M0/M1/M2/M3 RAM",
      math: "X[k] = \\sum_{n=0}^{N-1} \\left( x[n] \\cdot w[n] \\right) e^{-j\\frac{2\\pi}{N}nk} \\quad \\rightarrow \\quad X_{dB}[k] = 20 \\log_{10}(|X[k]|)",
      desc: "HWA 1.2 calculates block averages to suppress DC leakage, multiplies by a real window function (e.g. Hanning), and runs a 1D FFT. The resulting 'Range Profile' shows the relative power of targets at different distances.",
      purpose: "Resolves radial distance (R = c * f_IF / 2S). Separates front seats (0.8m) from rear seats (1.4m) and cabin clutter."
    },
    2: {
      title: "Stage 2: 2D Doppler FFT (Radar Cube)",
      unit: "HWA 1.2 + EDMA Transpose",
      input: "1D Range Profile (Transposed)",
      output: "3D Radar Cube",
      inFormat: `Transposed 1D FFT results: [${numChannels} Rx] × [128 Range Bins] × [64 Chirps]. 24-bit complex.`,
      outFormat: `3D Range-Doppler Heatmap. Dimensions: [${numChannels} Rx Channels] × [128 Range Bins] × [64 Doppler Bins]. 24-bit complex or 16-bit log-mag.`,
      memory: "DSS L3 Shared RAM (0x88000000)",
      math: "Y[m, k] = \\sum_{p=0}^{M-1} X_{transposed}[p, k] \\cdot w_{doppler}[p] \\cdot e^{-j\\frac{2\\pi}{M}pm}",
      desc: "The HWA performs address transposition to group samples across consecutive coherent chirps, then computes a 2D FFT to resolve velocities, followed by an FFT shift centering 0 m/s.",
      purpose: "Resolves relative velocity (v = λ * f_D / 2). Separates static car interior (0 m/s) from occupant breathing (0.1–0.4 m/s)."
    },
    3: {
      title: "Stage 3: CFAR Detection",
      unit: "HWA 1.2 CFAR Unit (Cell-Averaging)",
      input: "2D Range-Doppler Heatmap",
      output: "Detected Peaks List",
      inFormat: "Radar Cube converted to Log-Magnitude (0.0625 dB/LSB steps) from DSS L3.",
      outFormat: "Array of structs: { rangeIdx: uint16, dopplerIdx: uint16, power: uint16, noise: uint16 }.",
      memory: "DSS L2 RAM (0x80800000)",
      math: "\\text{Power}[m, k] = 10 \\log_{10}\\left( |Y[m, k]|^2 \\right) \\quad \\rightarrow \\quad Threshold = \\frac{1}{N_{train}} \\sum_{i \\in \\text{Train}} \\text{Power}_i + T_{dB}",
      desc: "Converts complex I/Q inputs to logarithmic power. Employs sliding-window cell averaging (CFAR-CA) across training and guard cells to evaluate the local noise floor and flag peaks.",
      purpose: "Suppresses thermal noise, multipath ground bounce, and carpet reflections while flagging genuine biological targets."
    },
    4: {
      title: "Stage 4: DSP Clustering & AoA",
      unit: "TMS320C66x DSP + ARM Cortex-R5F",
      input: "Detected Peaks List + Antenna Phase Vectors",
      output: "Object Point Cloud & Tracks",
      inFormat: "Sparse list of CFAR peaks with virtual antenna array complex phase responses.",
      outFormat: "Structured object tracks: [X (m), Y (m), Z (m), Velocity (m/s), SNR (dB)]. Sent over CAN-FD / UART.",
      memory: "C66x DSP internal structures / DSS L2 & APP TCMA",
      math: "P(\\theta, \\phi) = \\frac{1}{\\mathbf{a}^H \\mathbf{R}_{xx}^{-1} \\mathbf{a}} \\quad \\text{and} \\quad \\text{Discard if } |v| \\le 0.05\\text{ m/s}",
      desc: "The C66x DSP processes peaks: discards static targets (0 m/s) like empty seats, resolves Angle-of-Arrival (AoA), clusters points using DBSCAN, and tracks living occupants over successive frames.",
      purpose: "Classifies occupant type (Adult vs. Infant in child safety seat), measures respiration BPM, and eliminates false alarms."
    },
    5: {
      title: "Stage 5: Vehicle Gateway & PMIC Safety",
      unit: "MCAN (CAN-FD) + ESM Diagnostics",
      input: "Validated Occupant State & Safety Telemetry",
      output: "CAN-FD Frames & PMIC Alarm Signals",
      inFormat: "Tracked object states, child presence alert flags, and ASIL-B ESM safety status vectors.",
      outFormat: "ISO 11898-1 CAN-FD 64-byte payload messages (5 Mbps) & hardware nERROR_OUT signal pin.",
      memory: "APP_CANCFG (0x52000000), APP_SCI, PMIC line",
      math: "\\text{CRC-16/32 Checksum} + \\text{nERROR\\_OUT Strobe}",
      desc: "Cortex-R5F serializes classification results into CAN-FD frames transmitted to the body domain controller and PMIC for safety handshakes.",
      purpose: "Triggers Child Presence Detection (CPD) alarm, Seat Belt Reminder (SBR), and smart airbag suppression."
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
      <div className="bg-slate-800/50 p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-400" />
            <h3 className="font-semibold text-sm">HWA 1.2 & C66x DSP Pipeline Verification</h3>
          </div>

          <div className="flex bg-slate-950 rounded-lg p-0.5 border border-slate-700 ml-2">
            <button
              id="dsp-view-pipeline-btn"
              onClick={() => setViewMode('pipeline')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded transition-colors ${viewMode === 'pipeline' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <Layers className="w-3.5 h-3.5" /> Pipeline Flow
            </button>
            <button
              id="dsp-view-table-btn"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded transition-colors ${viewMode === 'table' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <TableIcon className="w-3.5 h-3.5" /> Stage I/O Table
            </button>
          </div>

          {onOpenDocs && (
            <button
              id="dsp-open-spec-btn"
              onClick={() => onOpenDocs('dsp-pipeline-specification.md')}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
              title="Open full DSP Pipeline Specification in Docs"
            >
              <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
              <span>Full Spec Doc</span>
            </button>
          )}
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
            id="dsp-run-sim-btn"
            onClick={executeMathPipeline}
            disabled={isRunning}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors h-12"
          >
            {isRunning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
            {isRunning ? 'Executing...' : 'Run Simulation'}
          </button>
        </div>
      </div>

      {viewMode === 'table' ? (
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div>
              <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <TableIcon className="w-4 h-4 text-indigo-400" />
                TI AWRL6844 / AWRL6888 DSP Pipeline Stage Input/Output Matrix
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Hardware accelerator (HWA 1.2) and DSP execution chain, data dimensions, memory allocation, and transfer functions.
              </p>
            </div>
            {onOpenDocs && (
              <button
                onClick={() => onOpenDocs('dsp-pipeline-specification.md')}
                className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-semibold transition-colors"
              >
                <span>Read Detailed Specification</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 shadow-inner">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4 w-44">Stage & Hardware Unit</th>
                  <th className="py-3 px-4 min-w-[200px]">Input Signal & Format</th>
                  <th className="py-3 px-4 min-w-[220px]">Output Artifact & Format</th>
                  <th className="py-3 px-4 min-w-[160px]">Memory Subsystem</th>
                  <th className="py-3 px-4 min-w-[180px]">Mathematical Kernel</th>
                  <th className="py-3 px-4 min-w-[200px]">In-Cabin Purpose</th>
                  <th className="py-3 px-3 w-24 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {Object.entries(STAGE_DETAILS).map(([key, stage]: [string, any]) => {
                  const stageNum = parseInt(key, 10);
                  const isSelected = selectedStage === stageNum;
                  return (
                    <tr 
                      key={key} 
                      className={`hover:bg-slate-900/70 transition-colors ${isSelected ? 'bg-indigo-950/20' : ''}`}
                    >
                      <td className="py-3.5 px-4 align-top">
                        <div className="flex flex-col gap-1">
                          <span className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                            <span className="w-5 h-5 rounded-full bg-indigo-900/60 text-indigo-300 flex items-center justify-center text-[10px] font-mono font-bold border border-indigo-700/50">
                              {stageNum}
                            </span>
                            {stage.title.split(': ')[1] || stage.title}
                          </span>
                          <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/40 px-1.5 py-0.5 rounded border border-cyan-900/40 w-fit">
                            {stage.unit}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 align-top">
                        <div className="space-y-1">
                          <div className="font-semibold text-amber-300 text-[11px] flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span>
                            {stage.input}
                          </div>
                          <div className="font-mono text-[11px] text-slate-300 leading-relaxed bg-slate-900/60 p-1.5 rounded border border-slate-800">
                            {stage.inFormat}
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 align-top">
                        <div className="space-y-1">
                          <div className="font-semibold text-emerald-300 text-[11px] flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
                            {stage.output}
                          </div>
                          <div className="font-mono text-[11px] text-emerald-200/90 leading-relaxed bg-slate-900/60 p-1.5 rounded border border-slate-800">
                            {stage.outFormat}
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 align-top">
                        <span className="font-mono text-[11px] text-purple-300 bg-purple-950/30 px-2 py-1 rounded border border-purple-900/40 block leading-tight">
                          {stage.memory}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 align-top font-mono">
                        <div className="bg-slate-900 p-2 rounded border border-slate-800 text-[11px] text-slate-300 overflow-x-auto">
                          <BlockMath math={stage.math} />
                        </div>
                      </td>

                      <td className="py-3.5 px-4 align-top">
                        <p className="text-[11px] text-slate-300 leading-relaxed">
                          {stage.purpose}
                        </p>
                      </td>

                      <td className="py-3.5 px-3 align-top text-center">
                        {stageNum <= 4 ? (
                          <button
                            onClick={() => {
                              setSelectedStage(stageNum);
                              setViewMode('pipeline');
                            }}
                            className="text-[11px] px-2.5 py-1 bg-indigo-600/80 hover:bg-indigo-600 text-white rounded font-medium transition-colors whitespace-nowrap"
                          >
                            Inspect
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-500 italic">Downstream</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <>
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

            {/* Dynamic Stage Plot Visualization */}
            <StagePlot stage={selectedStage} state={state} />
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
        </>
      )}
    </div>
  );
};
