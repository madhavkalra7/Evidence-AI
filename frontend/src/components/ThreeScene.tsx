'use client';

import { useRef, useMemo } from 'react';
import { Canvas, useFrame, type RootState } from '@react-three/fiber';
import { Float, Stars, MeshDistortMaterial } from '@react-three/drei';
import * as THREE from 'three';

/* ============================================================
   THREE.JS 3D DETECTIVE SCENE
   ============================================================
   Creates an immersive cyber-detective background with:
   - Floating particles simulating data flow
   - Glowing orbs representing evidence nodes
   - Grid floor with neon lines
   - Animated DNA-helix-like evidence connectors
   - Holographic sphere (AI brain visualization)
   ============================================================ */

// --- Floating Particles (Data Flow) ---
function DataParticles({ count = 500 }: { count?: number }) {
  const mesh = useRef<THREE.Points>(null!);

  const particles = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 30;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 30;

      // Cyan to blue gradient
      colors[i * 3] = 0;
      colors[i * 3 + 1] = 0.6 + Math.random() * 0.4;
      colors[i * 3 + 2] = 0.8 + Math.random() * 0.2;
    }

    return { positions, colors };
  }, [count]);

  useFrame((state: RootState) => {
    if (mesh.current) {
      mesh.current.rotation.y = state.clock.elapsedTime * 0.02;
      mesh.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.01) * 0.1;
    }
  });

  return (
    <points ref={mesh}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={particles.positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={count}
          array={particles.colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial size={0.05} vertexColors transparent opacity={0.6} sizeAttenuation />
    </points>
  );
}

// --- Holographic AI Core Sphere ---
function HolographicCore() {
  const meshRef = useRef<THREE.Mesh>(null!);

  useFrame((state: RootState) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.3;
      meshRef.current.rotation.z = state.clock.elapsedTime * 0.1;
    }
  });

  return (
    <Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
      <mesh ref={meshRef} position={[0, 0, -5]}>
        <icosahedronGeometry args={[1.5, 1]} />
        <MeshDistortMaterial
          color="#00d4ff"
          emissive="#00d4ff"
          emissiveIntensity={0.3}
          transparent
          opacity={0.15}
          wireframe
          distort={0.3}
          speed={2}
        />
      </mesh>
    </Float>
  );
}

// --- Evidence Node Orbs ---
function EvidenceNode({ position, color }: { position: [number, number, number]; color: string }) {
  const meshRef = useRef<THREE.Mesh>(null!);

  useFrame((state: RootState) => {
    if (meshRef.current) {
      meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime + position[0]) * 0.3;
    }
  });

  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[0.15, 16, 16]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.8}
        transparent
        opacity={0.7}
      />
      {/* Glow ring */}
      <mesh>
        <ringGeometry args={[0.25, 0.3, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>
    </mesh>
  );
}

// --- Neon Grid Floor ---
function NeonGrid() {
  return (
    <gridHelper
      args={[40, 40, '#00d4ff', '#0a1628']}
      position={[0, -4, 0]}
      rotation={[0, 0, 0]}
    />
  );
}

// --- Connection Lines (Evidence Links) ---
function ConnectionLines() {
  const points = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 20; i++) {
      pts.push(new THREE.Vector3(
        Math.sin(i * 0.5) * 3,
        Math.cos(i * 0.3) * 2,
        -5 + Math.sin(i * 0.7) * 2
      ));
    }
    return pts;
  }, []);

  const lineGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    return geometry;
  }, [points]);

  return (
    <primitive object={new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: '#00d4ff', transparent: true, opacity: 0.2 }))} />
  );
}

// --- Main 3D Scene Component ---
function Scene() {
  return (
    <>
      {/* Ambient light for base visibility */}
      <ambientLight intensity={0.1} />

      {/* Blue point light — main neon illumination */}
      <pointLight position={[5, 5, 5]} color="#00d4ff" intensity={2} distance={20} />

      {/* Red accent light — forensic/danger feel */}
      <pointLight position={[-5, 3, -5]} color="#ff0040" intensity={1} distance={15} />

      {/* Green evidence light */}
      <pointLight position={[0, -2, 3]} color="#00ff88" intensity={0.5} distance={10} />

      {/* Starfield background */}
      <Stars radius={50} depth={50} count={2000} factor={3} saturation={0} fade speed={0.5} />

      {/* Floating data particles */}
      <DataParticles count={400} />

      {/* Central AI hologram */}
      <HolographicCore />

      {/* Evidence nodes floating around */}
      <EvidenceNode position={[-3, 1, -3]} color="#ff0040" />
      <EvidenceNode position={[3, 2, -4]} color="#00ff88" />
      <EvidenceNode position={[-2, -1, -6]} color="#ffaa00" />
      <EvidenceNode position={[4, 0, -2]} color="#00d4ff" />
      <EvidenceNode position={[-4, 2, -5]} color="#ff0040" />
      <EvidenceNode position={[1, -2, -7]} color="#00ff88" />

      {/* Neon grid floor */}
      <NeonGrid />

      {/* Connection lines */}
      <ConnectionLines />
    </>
  );
}

// --- Exported Canvas Wrapper ---
export default function ThreeScene() {
  return (
    <div className="fixed inset-0 z-0">
      <Canvas
        camera={{ position: [0, 0, 8], fov: 60 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: '#060911' }}
      >
        <Scene />
      </Canvas>
    </div>
  );
}
