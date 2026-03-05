'use client';

import { useRef, useMemo, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Float, Stars } from '@react-three/drei';
import * as THREE from 'three';

/* ================================================================
   ForensicChatScene — Immersive 3D forensic investigation backdrop
   DNA helixes, evidence particles, scanning grid, holographic orbs
   ================================================================ */

// --- Forensic Particle Field (floating evidence dust) ---
function ForensicParticles({ count = 200 }: { count?: number }) {
  const mesh = useRef<THREE.Points>(null);

  const [positions, sizes, colors] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const sz = new Float32Array(count);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 30;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 20;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 20;
      sz[i] = Math.random() * 3 + 0.5;
      // Mix of cyan, purple, and warm amber for forensic feel
      const t = Math.random();
      if (t < 0.4) {
        col[i * 3] = 0.1; col[i * 3 + 1] = 0.7; col[i * 3 + 2] = 1.0; // cyan
      } else if (t < 0.7) {
        col[i * 3] = 0.55; col[i * 3 + 1] = 0.3; col[i * 3 + 2] = 1.0; // purple
      } else {
        col[i * 3] = 1.0; col[i * 3 + 1] = 0.6; col[i * 3 + 2] = 0.2; // amber
      }
    }
    return [pos, sz, col];
  }, [count]);

  useFrame((state) => {
    if (!mesh.current) return;
    const t = state.clock.elapsedTime * 0.15;
    mesh.current.rotation.y = t * 0.3;
    mesh.current.rotation.x = Math.sin(t * 0.5) * 0.05;
    // Gently float particles
    const posArray = mesh.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < count; i++) {
      posArray[i * 3 + 1] += Math.sin(t * 2 + i * 0.1) * 0.002;
    }
    mesh.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={mesh}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={count} array={colors} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        size={0.06}
        vertexColors
        transparent
        opacity={0.6}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

// --- DNA Helix ---
function DNAHelix({ position = [0, 0, 0] as [number, number, number], scale = 1 }) {
  const groupRef = useRef<THREE.Group>(null);
  const strandCount = 60;

  const [strand1, strand2, connectors] = useMemo(() => {
    const s1: [number, number, number][] = [];
    const s2: [number, number, number][] = [];
    const conn: { from: [number, number, number]; to: [number, number, number] }[] = [];
    for (let i = 0; i < strandCount; i++) {
      const y = (i - strandCount / 2) * 0.12;
      const angle = i * 0.25;
      const r = 0.5;
      const x1 = Math.cos(angle) * r;
      const z1 = Math.sin(angle) * r;
      const x2 = Math.cos(angle + Math.PI) * r;
      const z2 = Math.sin(angle + Math.PI) * r;
      s1.push([x1, y, z1]);
      s2.push([x2, y, z2]);
      if (i % 4 === 0) {
        conn.push({ from: [x1, y, z1], to: [x2, y, z2] });
      }
    }
    return [s1, s2, conn];
  }, [strandCount]);

  useFrame((state) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = state.clock.elapsedTime * 0.3;
  });

  return (
    <group ref={groupRef} position={position} scale={scale}>
      {/* Strand 1 */}
      {strand1.map((pos, i) => (
        <mesh key={`s1-${i}`} position={pos}>
          <sphereGeometry args={[0.04, 8, 8]} />
          <meshBasicMaterial color="#00d4ff" transparent opacity={0.7} />
        </mesh>
      ))}
      {/* Strand 2 */}
      {strand2.map((pos, i) => (
        <mesh key={`s2-${i}`} position={pos}>
          <sphereGeometry args={[0.04, 8, 8]} />
          <meshBasicMaterial color="#a855f7" transparent opacity={0.7} />
        </mesh>
      ))}
      {/* Connectors */}
      {connectors.map((c, i) => {
        const mid: [number, number, number] = [
          (c.from[0] + c.to[0]) / 2,
          (c.from[1] + c.to[1]) / 2,
          (c.from[2] + c.to[2]) / 2,
        ];
        const length = Math.sqrt(
          (c.to[0] - c.from[0]) ** 2 + (c.to[1] - c.from[1]) ** 2 + (c.to[2] - c.from[2]) ** 2
        );
        return (
          <mesh key={`conn-${i}`} position={mid}>
            <cylinderGeometry args={[0.01, 0.01, length, 4]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.15} />
          </mesh>
        );
      })}
    </group>
  );
}

// --- Holographic Scanning Ring ---
function ScanRing({ radius = 3, y = 0 }: { radius?: number; y?: number }) {
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!ringRef.current) return;
    const t = state.clock.elapsedTime;
    ringRef.current.rotation.x = Math.PI / 2;
    ringRef.current.rotation.z = t * 0.5;
    ringRef.current.position.y = y + Math.sin(t * 0.8) * 0.5;
    const mat = ringRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.08 + Math.sin(t * 2) * 0.04;
  });

  return (
    <mesh ref={ringRef}>
      <torusGeometry args={[radius, 0.015, 16, 100]} />
      <meshBasicMaterial color="#00d4ff" transparent opacity={0.1} side={THREE.DoubleSide} />
    </mesh>
  );
}

// --- Evidence Orbs (floating glowing spheres) ---
function EvidenceOrb({ position, color, pulseSpeed = 1 }: { position: [number, number, number]; color: string; pulseSpeed?: number }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.elapsedTime * pulseSpeed;
    const s = 1 + Math.sin(t) * 0.15;
    meshRef.current.scale.set(s, s, s);
    const mat = meshRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.2 + Math.sin(t * 1.5) * 0.1;
  });

  return (
    <Float speed={1.5} rotationIntensity={0.3} floatIntensity={0.8}>
      <mesh ref={meshRef} position={position}>
        <sphereGeometry args={[0.25, 32, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.25} />
      </mesh>
    </Float>
  );
}

// --- Fingerprint Ring Pattern ---
function FingerprintRings({ position = [0, 0, 0] as [number, number, number] }) {
  const groupRef = useRef<THREE.Group>(null);
  const ringCount = 8;

  useFrame((state) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.z = state.clock.elapsedTime * 0.2;
    groupRef.current.children.forEach((child, i) => {
      const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      mat.opacity = 0.04 + Math.sin(state.clock.elapsedTime * 0.8 + i * 0.5) * 0.03;
    });
  });

  return (
    <group ref={groupRef} position={position} rotation={[Math.PI / 2, 0, 0]}>
      {Array.from({ length: ringCount }).map((_, i) => (
        <mesh key={i}>
          <torusGeometry args={[0.3 + i * 0.15, 0.008, 16, 64]} />
          <meshBasicMaterial color="#a855f7" transparent opacity={0.06} />
        </mesh>
      ))}
    </group>
  );
}

// --- Grid Floor ---
function ForensicGrid() {
  const gridRef = useRef<THREE.GridHelper>(null);

  useFrame((state) => {
    if (!gridRef.current) return;
    const mat = gridRef.current.material as THREE.Material;
    mat.opacity = 0.04 + Math.sin(state.clock.elapsedTime * 0.5) * 0.02;
  });

  return (
    <gridHelper
      ref={gridRef}
      args={[40, 40, '#00d4ff', '#1a1a2e']}
      position={[0, -5, 0]}
      material-transparent
      material-opacity={0.05}
    />
  );
}

// --- Gentle Camera Movement ---
function CameraRig() {
  const { camera } = useThree();
  
  useFrame((state) => {
    const t = state.clock.elapsedTime * 0.1;
    camera.position.x = Math.sin(t) * 0.5;
    camera.position.y = Math.cos(t * 0.7) * 0.3;
    camera.lookAt(0, 0, 0);
  });

  return null;
}

// --- Main Scene ---
function Scene() {
  return (
    <>
      <color attach="background" args={['#050510']} />
      <fog attach="fog" args={['#050510', 8, 25]} />
      
      <CameraRig />
      
      {/* Ambient lighting */}
      <ambientLight intensity={0.15} />
      <pointLight position={[5, 5, 5]} intensity={0.3} color="#00d4ff" />
      <pointLight position={[-5, -3, 3]} intensity={0.2} color="#a855f7" />
      
      {/* Star field backdrop */}
      <Stars radius={50} depth={50} count={1500} factor={2} saturation={0.2} fade speed={0.5} />
      
      {/* DNA Helixes */}
      <DNAHelix position={[-5, 0, -3]} scale={1.2} />
      <DNAHelix position={[5.5, -1, -4]} scale={0.8} />
      
      {/* Scanning Rings */}
      <ScanRing radius={3} y={0} />
      <ScanRing radius={4.5} y={-1} />
      <ScanRing radius={2} y={1.5} />
      
      {/* Evidence Orbs */}
      <EvidenceOrb position={[-3, 2, -2]} color="#00d4ff" pulseSpeed={0.8} />
      <EvidenceOrb position={[3.5, -1.5, -1]} color="#a855f7" pulseSpeed={1.2} />
      <EvidenceOrb position={[0, 3, -3]} color="#f59e0b" pulseSpeed={0.6} />
      <EvidenceOrb position={[-2, -2, -4]} color="#ef4444" pulseSpeed={1.0} />
      <EvidenceOrb position={[4, 1, -5]} color="#10b981" pulseSpeed={0.9} />
      
      {/* Fingerprint Pattern */}
      <FingerprintRings position={[0, 0, -6]} />
      <FingerprintRings position={[-4, -3, -5]} />
      
      {/* Forensic Particles */}
      <ForensicParticles count={300} />
      
      {/* Grid Floor */}
      <ForensicGrid />
    </>
  );
}

export default function ForensicChatScene() {
  return (
    <div className="fixed inset-0 z-0" style={{ pointerEvents: 'none' }}>
      <Canvas
        camera={{ position: [0, 0, 8], fov: 60, near: 0.1, far: 100 }}
        dpr={[1, 1.5]}
        gl={{ 
          antialias: true, 
          alpha: true,
          powerPreference: 'high-performance',
        }}
        style={{ background: 'transparent' }}
      >
        <Scene />
      </Canvas>
    </div>
  );
}
