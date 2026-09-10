import React, { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Box, Cone, Line, Html } from '@react-three/drei';
import * as THREE from 'three';
import { ArrowUp } from 'lucide-react';

interface Target {
  name: string;
  pos: [number, number, number];
  rcs: number;
}

const PointCloud = ({ position, isAdult }: { position: [number, number, number], isAdult: boolean }) => {
  const pointsRef = useRef<THREE.Points>(null);
  
  // High-RCS Adult has more points and distinct body segments.
  // Low-RCS Infant has fewer points and is more compact (fetal/seated position).
  const numPoints = isAdult ? 600 : 200;
  
  const [positions, colors] = useMemo(() => {
    const pos = new Float32Array(numPoints * 3);
    const col = new Float32Array(numPoints * 3);
    
    const color = new THREE.Color(isAdult ? '#6366f1' : '#f43f5e'); // Indigo for adult, Rose for infant
    
    for (let i = 0; i < numPoints; i++) {
      let x = 0, y = 0, z = 0;
      
      const rand = Math.random();
      
      if (isAdult) {
        // Adult Seated Humanoid Distribution
        if (rand < 0.15) {
          // Head (Spherical, top, slightly forward)
          x = (Math.random() - 0.5) * 0.15;
          y = 0.45 + (Math.random() - 0.5) * 0.15;
          z = -0.05 + (Math.random() - 0.5) * 0.15;
        } else if (rand < 0.55) {
          // Torso (Wide boxy, leaning slightly back against seat)
          x = (Math.random() - 0.5) * 0.4;
          y = 0.1 + (Math.random() - 0.5) * 0.4;
          z = 0.05 + (Math.random() - 0.5) * 0.15 + (y * 0.1); // slight recline
        } else if (rand < 0.75) {
          // Thighs/Lap (Extending horizontally forward from hips)
          const isLeft = Math.random() > 0.5;
          x = (isLeft ? -0.12 : 0.12) + (Math.random() - 0.5) * 0.12;
          y = -0.15 + (Math.random() - 0.5) * 0.05;
          z = -0.25 + (Math.random() - 0.5) * 0.25; 
        } else if (rand < 0.9) {
          // Calves (Extending down from knees)
          const isLeft = Math.random() > 0.5;
          x = (isLeft ? -0.12 : 0.12) + (Math.random() - 0.5) * 0.12;
          y = -0.3 + (Math.random() - 0.5) * 0.2;
          z = -0.45 + (Math.random() - 0.5) * 0.1;
        } else {
          // Arms/Hands (Resting forward on lap or steering wheel)
          const isLeft = Math.random() > 0.5;
          x = (isLeft ? -0.2 : 0.2) + (Math.random() - 0.5) * 0.1;
          y = 0.0 + (Math.random() - 0.5) * 0.2;
          z = -0.15 + (Math.random() - 0.5) * 0.2;
        }
      } else {
        // Infant Distribution (Rear-facing car seat posture, tilted up ~45 deg)
        if (rand < 0.25) {
          // Head (relatively large, resting back)
          x = (Math.random() - 0.5) * 0.15;
          y = 0.15 + (Math.random() - 0.5) * 0.12;
          z = 0.1 + (Math.random() - 0.5) * 0.12;
        } else if (rand < 0.8) {
          // Tilted Torso (rearing up towards the front)
          x = (Math.random() - 0.5) * 0.2;
          y = -0.05 + (Math.random() - 0.5) * 0.2;
          z = -0.05 - (y * 0.5) + (Math.random() - 0.5) * 0.15; // diagonal recline
        } else {
          // Little legs/arms curled upwards
          x = (Math.random() - 0.5) * 0.2;
          y = -0.15 + (Math.random() - 0.5) * 0.1;
          z = -0.15 + (Math.random() - 0.5) * 0.15;
        }
      }
      
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      
      // Slight color variation based on depth/height for 3D effect
      const brightnessOffset = (y + 0.5) * 0.2; 
      const variant = color.clone().offsetHSL(0, 0, brightnessOffset - 0.1 + (Math.random() - 0.5) * 0.1);
      col[i * 3] = variant.r;
      col[i * 3 + 1] = variant.g;
      col[i * 3 + 2] = variant.b;
    }
    
    return [pos, col];
  }, [isAdult, numPoints]);

  // Extract just the torso/chest points for breathing animation
  useFrame((state) => {
    if (pointsRef.current) {
      // We don't scale the whole body, we just simulate the chest rising/falling
      // In a real radar point cloud, micro-doppler is strongest at the torso
      const breathingPhase = state.clock.elapsedTime * (isAdult ? 1.5 : 3.5);
      const chestExpansion = Math.sin(breathingPhase) * 0.05;
      
      const positions = pointsRef.current.geometry.attributes.position.array as Float32Array;
      
      for (let i = 0; i < numPoints; i++) {
        const y = positions[i * 3 + 1];
        const isTorso = isAdult ? (y > -0.1 && y < 0.3) : (y > -0.15 && y < 0.1);
        
        if (isTorso) {
           // Move Z-axis (forward/backward) slightly to simulate chest wall displacement
           positions[i * 3 + 2] += Math.sin(breathingPhase) * 0.001; 
        }
      }
      pointsRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  return (
    <points position={position} ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={numPoints}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={numPoints}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial size={0.025} vertexColors transparent opacity={0.85} sizeAttenuation />
    </points>
  );
};

const Seat = ({ position, hasInfant }: { position: [number, number, number], hasInfant?: boolean }) => (
  <group position={position}>
    {/* Base Vehicle Seat */}
    <Box args={[0.45, 0.1, 0.45]} position={[0, -0.2, 0]}>
      <meshStandardMaterial color="#1e293b" wireframe opacity={0.3} transparent />
    </Box>
    <Box args={[0.45, 0.6, 0.1]} position={[0, 0.15, 0.2]}>
      <meshStandardMaterial color="#1e293b" wireframe opacity={0.3} transparent />
    </Box>

    {/* Optional: Add a rear-facing infant car seat shell */}
    {hasInfant && (
      <group rotation={[0, Math.PI, 0]} position={[0, 0.1, -0.05]}>
        {/* Car Seat Shell (tilted) */}
        <group rotation={[-Math.PI / 4, 0, 0]}>
          <Box args={[0.35, 0.5, 0.1]} position={[0, 0.1, 0]}>
             <meshStandardMaterial color="#334155" wireframe opacity={0.6} transparent />
          </Box>
          <Box args={[0.35, 0.1, 0.25]} position={[0, -0.2, 0.07]}>
             <meshStandardMaterial color="#334155" wireframe opacity={0.6} transparent />
          </Box>
        </group>
      </group>
    )}
  </group>
);

const CarChassis = () => (
  <group position={[0, 0, 1.1]}>
    {/* Base Chassis Outline (Model Y proportions) */}
    <Box args={[1.8, 1.2, 3.2]} position={[0, 0, 0]}>
      <meshBasicMaterial color="#334155" wireframe opacity={0.15} transparent />
    </Box>
    
    {/* Dashboard Plane */}
    <Box args={[1.7, 0.3, 0.4]} position={[0, -0.15, -1.2]}>
      <meshBasicMaterial color="#1e293b" wireframe opacity={0.2} transparent />
    </Box>

    {/* Steering Wheel (Ring) */}
    <group position={[-0.4, 0.1, -1.0]} rotation={[-Math.PI / 6, 0, 0]}>
      <mesh>
        <torusGeometry args={[0.15, 0.02, 8, 24]} />
        <meshBasicMaterial color="#475569" wireframe opacity={0.5} transparent />
      </mesh>
    </group>

    {/* Glass Roofline Arc */}
    <mesh position={[0, 0.6, 0]}>
      <cylinderGeometry args={[0.9, 0.9, 3.2, 16, 1, true, 0, Math.PI]} />
      <meshBasicMaterial color="#334155" wireframe opacity={0.1} transparent />
    </mesh>
    
    {/* Directional Arrow (Front) */}
    <group position={[0, -0.4, -1.8]} rotation={[-Math.PI / 2, 0, 0]}>
      <Cone args={[0.2, 0.4, 4]} position={[0, 0.2, 0]}>
        <meshBasicMaterial color="#39ff14" opacity={0.6} transparent wireframe />
      </Cone>
      <Box args={[0.1, 0.5, 0.1]} position={[0, -0.2, 0]}>
        <meshBasicMaterial color="#39ff14" opacity={0.6} transparent wireframe />
      </Box>
    </group>
  </group>
);

const BoundingBox = ({ position, isAdult, name }: { position: [number, number, number], isAdult: boolean, name: string }) => {
  // Adult bounding box is larger, Child is smaller
  const size = isAdult ? [0.6, 0.8, 0.6] : [0.4, 0.5, 0.4];
  const color = isAdult ? "#3b82f6" : "#ec4899"; // Blue for Adult, Pink for Child
  const bpm = isAdult ? 15 : 42;
  const conf = isAdult ? "98%" : "94%";

  return (
    <group position={position}>
      <Box args={size as [number, number, number]}>
        <meshBasicMaterial color={color} wireframe opacity={0.3} transparent />
      </Box>
      <Html position={[0, size[1] / 2 + 0.1, 0]} center>
        <div className={`whitespace-nowrap px-2 py-1 rounded bg-black/80 backdrop-blur border text-[10px] font-mono font-bold tracking-wider uppercase text-white shadow-lg ${isAdult ? 'border-blue-500' : 'border-pink-500'}`}>
          <div className="flex justify-between gap-3 mb-0.5">
            <span>{name}</span>
            <span className="opacity-70">CONF {conf}</span>
          </div>
          <div className="flex items-center gap-1 text-[9px] opacity-80">
            <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${isAdult ? 'bg-blue-400' : 'bg-pink-400'}`}></span>
            {bpm} BPM Resp
          </div>
        </div>
      </Html>
    </group>
  );
};

export const Cabin3DView = ({ targets }: { targets: Target[] }) => {
  const [sensorPos, setSensorPos] = useState<'roof' | 'windshield' | 'bpillar'>('roof');
  
  // Spec coordinates map to ThreeJS coordinates: (x, z, -y) or similar.
  // We'll keep our current coordinate space but just define the sensor points:
  let sensorCoords: [number, number, number] = [0, 0.6, 0.5]; // Default Roof
  if (sensorPos === 'windshield') sensorCoords = [0, 0.4, -0.2];
  if (sensorPos === 'bpillar') sensorCoords = [-0.75, 0.4, 0.5];

  return (
    <div className="w-full h-full bg-slate-950 rounded-lg overflow-hidden relative">
      <div className="absolute top-2 left-3 z-10 flex flex-col gap-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Live 3D Radar Point Cloud</span>
        <div className="flex gap-2">
          <button 
            onClick={() => setSensorPos('roof')}
            className={`text-[9px] px-2 py-1 rounded border uppercase font-bold tracking-wider transition-colors ${sensorPos === 'roof' ? 'bg-cyan-900/50 border-cyan-500 text-cyan-300' : 'bg-slate-900 border-slate-700 text-slate-500'}`}
          >
            Roof-Center
          </button>
          <button 
            onClick={() => setSensorPos('windshield')}
            className={`text-[9px] px-2 py-1 rounded border uppercase font-bold tracking-wider transition-colors ${sensorPos === 'windshield' ? 'bg-cyan-900/50 border-cyan-500 text-cyan-300' : 'bg-slate-900 border-slate-700 text-slate-500'}`}
          >
            Windshield
          </button>
          <button 
            onClick={() => setSensorPos('bpillar')}
            className={`text-[9px] px-2 py-1 rounded border uppercase font-bold tracking-wider transition-colors ${sensorPos === 'bpillar' ? 'bg-cyan-900/50 border-cyan-500 text-cyan-300' : 'bg-slate-900 border-slate-700 text-slate-500'}`}
          >
            B-Pillar
          </button>
        </div>
      </div>
      <Canvas camera={{ position: [1.5, 1.5, -1], fov: 45 }}>
        <color attach="background" args={['#020617']} />
        
        <ambientLight intensity={0.5} />
        <pointLight position={[0, 2, 0]} intensity={1} color="#e2e8f0" />
        
        {/* Radar Sensor Origin */}
        <mesh position={sensorCoords}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshStandardMaterial color="#ef4444" emissive="#dc2626" emissiveIntensity={0.5} />
        </mesh>
        
        <gridHelper args={[4, 10, '#334155', '#0f172a']} position={[0, -0.5, 1]} />
        
        <CarChassis />
        
        {/* Seats */}
        <Seat position={[-0.35, -0.3, 0.8]} hasInfant={targets.some(t => t.name.includes('Infant') && t.name.includes('Front Left'))} />
        <Seat position={[0.35, -0.3, 0.8]} hasInfant={targets.some(t => t.name.includes('Infant') && t.name.includes('Front Right'))} />
        <Seat position={[-0.35, -0.3, 1.4]} hasInfant={targets.some(t => t.name.includes('Infant') && t.name.includes('Back Left'))} />
        <Seat position={[0.35, -0.3, 1.4]} hasInfant={targets.some(t => t.name.includes('Infant') && t.name.includes('Back Right'))} />

        {/* Target Point Clouds & Bounding Boxes */}
        {targets.map((t, idx) => {
           const isAdult = t.name.includes('Adult');
           // Center bounding box slightly above seat
           const bboxY = isAdult ? t.pos[1] + 0.3 : t.pos[1] + 0.1;
           return (
             <group key={idx}>
               <PointCloud position={t.pos} isAdult={isAdult} />
               <BoundingBox position={[t.pos[0], bboxY, t.pos[2]]} isAdult={isAdult} name={t.name} />
             </group>
           );
        })}

        <OrbitControls 
          makeDefault 
          target={[0, 0, 1.1]}
          minPolarAngle={0} 
          maxPolarAngle={Math.PI / 2 + 0.1}
        />
      </Canvas>
    </div>
  );
};
