import React, { useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ScatterChart, Scatter, ZAxis } from 'recharts';

const RadarHeatmap = ({ data }: { data: number[][] }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !data || data.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rows = data.length;
    const cols = data[0].length;
    
    // Auto-scale colors based on min/max in the dataset
    let min = Infinity, max = -Infinity;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const val = data[r][c];
        if (val < min) min = val;
        if (val > max) max = val;
      }
    }
    
    // Clamp to ensure noise doesn't wash out the peaks
    const noiseFloor = min + (max - min) * 0.1;
    const dynamicRange = max - noiseFloor;

    const width = canvas.width;
    const height = canvas.height;
    const cellW = width / cols;
    const cellH = height / rows;

    ctx.clearRect(0, 0, width, height);

    // Jet colormap approximation function
    const getColor = (value: number) => {
      let v = Math.max(0, Math.min(1, (value - noiseFloor) / dynamicRange));
      const r = Math.max(0, Math.min(255, Math.round(255 * (1.5 - Math.abs(1 - 4 * (v - 0.5))))));
      const g = Math.max(0, Math.min(255, Math.round(255 * (1.5 - Math.abs(1 - 4 * (v - 0.25))))));
      const b = Math.max(0, Math.min(255, Math.round(255 * (1.5 - Math.abs(1 - 4 * v)))));
      return `rgb(${r},${g},${b})`;
    };

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = getColor(data[r][c]);
        // Y is range bin. Range bin 0 is at the top.
        ctx.fillRect(Math.floor(c * cellW), Math.floor(r * cellH), Math.ceil(cellW), Math.ceil(cellH));
      }
    }
  }, [data]);

  return (
    <div className="flex flex-col w-full h-auto bg-slate-900 border border-slate-700 rounded-lg overflow-hidden p-2">
      <div className="flex flex-col items-center w-full relative h-[250px]">
        <div className="absolute left-1 top-1/2 -translate-y-1/2 -rotate-90 text-[10px] text-slate-500 font-bold tracking-wider">
          Distance / Range Bin (0 → 64)
        </div>
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[10px] text-slate-500 font-bold tracking-wider">
          Velocity / Micro-motion (Doppler)
        </div>
        <div className="w-[calc(100%-40px)] h-[calc(100%-20px)] ml-6 mb-4 relative rounded overflow-hidden border border-slate-800">
          <canvas 
            ref={canvasRef} 
            width={640} 
            height={640} 
            className="w-full h-full object-fill rendering-pixelated"
          />
        </div>
      </div>
      
      {/* Legend & Explanation */}
      <div className="mt-1 px-4 pb-2 text-[10px] text-slate-400">
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-2">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-slate-300">Power:</span>
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 bg-[rgb(0,0,128)] rounded-[2px]"></div>
              <span>Noise</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 bg-[rgb(0,255,0)] rounded-[2px]"></div>
              <span>Weak</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 bg-[rgb(255,0,0)] rounded-[2px]"></div>
              <span>Strong</span>
            </div>
          </div>
          <div className="text-[9px] text-slate-500 italic max-w-[200px] text-right">
            Red hotspots indicate physical occupants reflecting radar energy.
          </div>
        </div>
      </div>
    </div>
  );
};

export const StagePlot = ({ stage, state }: { stage: number, state: any }) => {
  if (!state) {
    return (
      <div className="h-64 flex items-center justify-center bg-slate-900 border border-slate-800 rounded-lg text-slate-500 text-sm">
        Run the simulation to generate plot data.
      </div>
    );
  }

  const renderPlot = () => {
    switch (stage) {
      case 0: {
        // Stage 0: ADC Raw
        const data = state.adcRaw.map((val: number, idx: number) => ({ sample: idx, amplitude: val }));
        return (
          <div className="w-full overflow-x-auto h-[250px]">
            <LineChart width={600} height={250} data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="sample" stroke="#64748b" tick={{fontSize: 10}} label={{ value: 'Sample Index', position: 'insideBottom', offset: -5, fill: '#64748b', fontSize: 10 }} />
              <YAxis stroke="#64748b" tick={{fontSize: 10}} label={{ value: 'Amplitude', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }} />
              <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '12px' }} />
              <Line type="monotone" dataKey="amplitude" stroke="#6366f1" dot={false} strokeWidth={2} />
            </LineChart>
          </div>
        );
      }
      case 1: {
        // Stage 1: Range FFT
        if (!state.rangeFFT || state.rangeFFT.length === 0) return <div>No Range FFT data</div>;
        const data = state.rangeFFT.map((val: number, idx: number) => ({ bin: idx, power: val }));
        return (
          <div className="w-full overflow-x-auto h-[250px]">
            <LineChart width={600} height={250} data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="bin" stroke="#64748b" tick={{fontSize: 10}} label={{ value: 'Range Bin', position: 'insideBottom', offset: -5, fill: '#64748b', fontSize: 10 }} />
              <YAxis stroke="#64748b" tick={{fontSize: 10}} label={{ value: 'Magnitude', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }} />
              <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '12px' }} />
              <Line type="monotone" dataKey="power" stroke="#10b981" dot={false} strokeWidth={2} />
            </LineChart>
          </div>
        );
      }
      case 2: {
        // Stage 2: Doppler FFT (True HTML5 Canvas Heatmap)
        if (!state.dopplerFFT) return <div>No Doppler data</div>;
        return <RadarHeatmap data={state.dopplerFFT} />;
      }
      case 3: {
        // Stage 3: CFAR Detections
        if (!state.cfarDetections || state.cfarDetections.length === 0) return <div>No CFAR data or detections</div>;
        
        return (
          <div className="w-full overflow-x-auto h-[250px]">
            <ScatterChart width={600} height={250} margin={{ top: 10, right: 10, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis type="number" dataKey="d" name="Doppler Bin" stroke="#64748b" tick={{fontSize: 10}} label={{ value: 'Doppler Bin', position: 'insideBottom', offset: -10, fill: '#64748b', fontSize: 10 }} domain={[0, 64]} />
              <YAxis type="number" dataKey="r" name="Range Bin" stroke="#64748b" tick={{fontSize: 10}} label={{ value: 'Range Bin', angle: -90, position: 'insideLeft', offset: -10, fill: '#64748b', fontSize: 10 }} reversed domain={[0, 64]} />
              <ZAxis type="number" dataKey="pwr" range={[30, 300]} name="Power (dB)" />
              <Tooltip cursor={{strokeDasharray: '3 3'}} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '12px' }} />
              <Scatter name="CFAR Hits" data={state.cfarDetections} fill="#ef4444" opacity={0.9} shape="circle" />
            </ScatterChart>
          </div>
        );
      }
      case 4: {
        return (
          <div className="h-64 flex flex-col items-center justify-center bg-slate-900 border border-slate-800 rounded-lg text-slate-400 text-sm">
            <span className="mb-2">3D Cloud Representation Generated.</span>
            <span className="text-xs text-slate-500">See the Live 3D Radar Point Cloud viewer below.</span>
          </div>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 mt-4">
      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">
        {stage === 0 ? "1D Time Domain (ADC Waveform)" :
         stage === 1 ? "1D Range Profile (FFT Magnitude)" :
         stage === 2 ? "2D Range-Doppler Power Map" :
         stage === 3 ? "2D CFAR Detections Map" : 
         "3D DSP Output"}
      </h4>
      {renderPlot()}
    </div>
  );
};
