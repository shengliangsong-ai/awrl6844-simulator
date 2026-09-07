import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Box, Sphere, Environment } from '@react-three/drei';
import * as THREE from 'three';

interface Target {
  name: string;
  pos: [number, number, number];
  rcs: number;
}

const PointCloud = ({ position, isAdult }: { position: [number, number, number], isAdult: boolean }) => {
  const pointsRef = useRef<THREE.Points>(null);
  const numPoints = isAdult ? 300 : 80;
  const spread = isAdult ? 0.3 : 0.15;
  
  const [positions, colors] = useMemo(() => {
    const pos = new Float32Array(numPoints * 3);
    const col = new Float32Array(numPoints * 3);
    
    const color = new THREE.Color(isAdult ? '#6366f1' : '#f43f5e');
    
    for (let i = 0; i < numPoints; i++) {
      // Gaussian-ish distribution around 0
      const x = (Math.random() - 0.5) * spread + (Math.random() - 0.5) * spread;
      const y = (Math.random() - 0.5) * spread + (Math.random() - 0.5) * spread;
      const z = (Math.random() - 0.5) * spread + (Math.random() - 0.5) * spread;
      
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      
      // Slight color variation
      const variant = color.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.2);
      col[i * 3] = variant.r;
      col[i * 3 + 1] = variant.g;
      col[i * 3 + 2] = variant.b;
    }
    
    return [pos, col];
  }, [isAdult, numPoints, spread]);

  useFrame((state) => {
    if (pointsRef.current) {
      // Gentle breathing animation
      const scale = 1 + Math.sin(state.clock.elapsedTime * (isAdult ? 1.5 : 3.5)) * 0.05;
      pointsRef.current.scale.set(scale, scale, scale);
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
      <pointsMaterial size={0.03} vertexColors transparent opacity={0.8} sizeAttenuation />
    </points>
  );
};

const Seat = ({ position }: { position: [number, number, number] }) => (
  <group position={position}>
    {/* Seat Base */}
    <Box args={[0.45, 0.1, 0.45]} position={[0, -0.2, 0]}>
      <meshStandardMaterial color="#1e293b" wireframe opacity={0.3} transparent />
    </Box>
    {/* Seat Back */}
    <Box args={[0.45, 0.6, 0.1]} position={[0, 0.15, 0.2]}>
      <meshStandardMaterial color="#1e293b" wireframe opacity={0.3} transparent />
    </Box>
  </group>
);

export const Cabin3DView = ({ targets }: { targets: Target[] }) => {
  return (
    <div className="w-full h-full bg-slate-950 rounded-lg overflow-hidden relative">
      <div className="absolute top-2 left-3 z-10">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Live 3D Radar Point Cloud</span>
      </div>
      <Canvas camera={{ position: [1.5, 1.5, -1], fov: 45 }}>
        <color attach="background" args={['#020617']} />
        
        {/* Lights */}
        <ambientLight intensity={0.5} />
        <pointLight position={[0, 2, 0]} intensity={1} color="#e2e8f0" />
        
        {/* Radar Sensor (Origin) */}
        <Box args={[0.1, 0.05, 0.05]} position={[0, 0.5, 0]}>
          <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.5} />
        </Box>
        
        {/* Grid helper for floor */}
        <gridHelper args={[4, 10, '#334155', '#0f172a']} position={[0, -0.5, 1]} />
        
        {/* Seats */}
        <Seat position={[-0.35, -0.3, 0.8]} />
        <Seat position={[0.35, -0.3, 0.8]} />
        <Seat position={[-0.35, -0.3, 1.4]} />
        <Seat position={[0.35, -0.3, 1.4]} />

        {/* Target Point Clouds */}
        {targets.map((t, idx) => (
          <PointCloud 
            key={idx} 
            position={t.pos} 
            isAdult={t.name.includes('Adult')} 
          />
        ))}

        {/* Controls */}
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
