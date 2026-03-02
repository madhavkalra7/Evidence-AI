'use client';

import { useRef, useMemo, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, ContactShadows, Float } from '@react-three/drei';
import * as THREE from 'three';

/* ============================================================
   3D WEAPON MODEL — Forensic Evidence Viewer
   ============================================================
   Minimal but cinematic weapon display with:
   - Procedural knife geometry (blade + guard + handle + pommel)
   - Metallic PBR materials + emissive edge glow
   - Auto slow rotation
   - Mouse drag interaction (orbit)
   - Spotlight + rim lighting
   - Floating animation
   ============================================================ */

// ── Knife Blade (tapered, double-edged) ──
function KnifeBlade() {
  const meshRef = useRef<THREE.Mesh>(null!);

  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    // Blade profile — pointed, slightly curved
    shape.moveTo(0, 0);          // base center
    shape.lineTo(0.08, 0.02);    // right base
    shape.quadraticCurveTo(0.09, 0.8, 0.04, 1.6);  // right edge curve
    shape.lineTo(0, 1.75);       // tip
    shape.lineTo(-0.04, 1.6);    // left tip
    shape.quadraticCurveTo(-0.09, 0.8, -0.08, 0.02); // left edge curve
    shape.lineTo(0, 0);          // back to base

    const extrudeSettings = {
      depth: 0.018,
      bevelEnabled: true,
      bevelThickness: 0.004,
      bevelSize: 0.003,
      bevelOffset: 0,
      bevelSegments: 3,
    };

    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geo.center();
    return geo;
  }, []);

  return (
    <mesh ref={meshRef} geometry={geometry} castShadow>
      <meshPhysicalMaterial
        color="#b8c4d0"
        metalness={0.95}
        roughness={0.08}
        clearcoat={0.6}
        clearcoatRoughness={0.1}
        reflectivity={1}
        envMapIntensity={1.5}
      />
    </mesh>
  );
}

// ── Blade Edge Glow (thin emissive strip along edges) ──
function BladeEdgeGlow() {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.87);
    shape.quadraticCurveTo(0.095, 0, 0.045, 0.73);
    shape.lineTo(0.038, 0.73);
    shape.quadraticCurveTo(0.085, 0, 0, -0.85);
    shape.closePath();

    const geo = new THREE.ShapeGeometry(shape);
    return geo;
  }, []);

  return (
    <group>
      {/* Right edge */}
      <mesh geometry={geometry} position={[0, 0, 0.014]}>
        <meshBasicMaterial
          color="#88ccff"
          transparent
          opacity={0.15}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Left edge (mirrored) */}
      <mesh geometry={geometry} position={[0, 0, 0.014]} scale={[-1, 1, 1]}>
        <meshBasicMaterial
          color="#88ccff"
          transparent
          opacity={0.15}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

// ── Cross Guard ──
function CrossGuard() {
  return (
    <group position={[0, -0.88, 0.009]}>
      {/* Main guard bar */}
      <mesh castShadow>
        <boxGeometry args={[0.32, 0.06, 0.04]} />
        <meshPhysicalMaterial
          color="#8b7355"
          metalness={0.85}
          roughness={0.2}
          clearcoat={0.3}
        />
      </mesh>
      {/* Guard details — end caps */}
      <mesh position={[-0.16, 0, 0]}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshPhysicalMaterial color="#705a3a" metalness={0.9} roughness={0.15} />
      </mesh>
      <mesh position={[0.16, 0, 0]}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshPhysicalMaterial color="#705a3a" metalness={0.9} roughness={0.15} />
      </mesh>
    </group>
  );
}

// ── Handle (wrapped grip) ──
function Handle() {
  const segments = 12;
  return (
    <group position={[0, -1.28, 0.009]}>
      {/* Core handle */}
      <mesh castShadow>
        <cylinderGeometry args={[0.04, 0.045, 0.7, 16]} />
        <meshPhysicalMaterial
          color="#2a1810"
          metalness={0.1}
          roughness={0.75}
        />
      </mesh>
      {/* Wrap rings */}
      {Array.from({ length: segments }).map((_, i) => (
        <mesh key={i} position={[0, -0.3 + i * 0.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.048, 0.005, 6, 16]} />
          <meshPhysicalMaterial
            color={i % 2 === 0 ? '#3a2215' : '#4a3020'}
            metalness={0.15}
            roughness={0.7}
          />
        </mesh>
      ))}
    </group>
  );
}

// ── Pommel (bottom end cap) ──
function Pommel() {
  return (
    <group position={[0, -1.68, 0.009]}>
      <mesh castShadow>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshPhysicalMaterial
          color="#8b7355"
          metalness={0.9}
          roughness={0.15}
          clearcoat={0.4}
        />
      </mesh>
      {/* Pommel ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.065, 0.01, 8, 16]} />
        <meshPhysicalMaterial color="#705a3a" metalness={0.85} roughness={0.2} />
      </mesh>
    </group>
  );
}

// ── Blood Splatter Hints (forensic detail) ──
function ForensicMarkers() {
  const points = useMemo(() => {
    const pts: [number, number, number][] = [
      [0.03, 0.3, 0.02],
      [-0.02, 0.55, 0.02],
      [0.05, 0.1, 0.02],
      [-0.04, 0.65, 0.02],
    ];
    return pts;
  }, []);

  return (
    <group>
      {points.map((pos, i) => (
        <mesh key={i} position={pos}>
          <circleGeometry args={[0.008 + Math.random() * 0.006, 8]} />
          <meshBasicMaterial color="#cc2233" transparent opacity={0.4 + Math.random() * 0.3} />
        </mesh>
      ))}
    </group>
  );
}

// ── Full Knife Assembly with auto-rotation ──
function KnifeModel({ autoRotate }: { autoRotate: boolean }) {
  const groupRef = useRef<THREE.Group>(null!);

  useFrame((state) => {
    if (groupRef.current && autoRotate) {
      groupRef.current.rotation.y += 0.003;
      // Gentle breathing tilt
      groupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.5) * 0.05;
      groupRef.current.rotation.z = Math.cos(state.clock.elapsedTime * 0.3) * 0.02;
    }
  });

  return (
    <Float speed={1.2} rotationIntensity={0.03} floatIntensity={0.15}>
      <group ref={groupRef} rotation={[0.3, 0, 0.1]}>
        <KnifeBlade />
        <BladeEdgeGlow />
        <CrossGuard />
        <Handle />
        <Pommel />
        <ForensicMarkers />
      </group>
    </Float>
  );
}

// ── Orbit Controls (manual mouse drag) ──
function DragControls({
  onDragStart,
  onDragEnd,
}: {
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const prevMouse = useRef({ x: 0, y: 0 });
  const rotation = useRef({ x: 0.3, y: 0 });
  const groupRef = useRef<THREE.Group>(null!);

  // We handle mouse events at the canvas level via the parent
  // This is a no-op placeholder — drag is handled by the scene wrapper
  return null;
}

// ── Scene Lighting ──
function SceneLighting() {
  return (
    <>
      {/* Key spotlight — dramatic top-down */}
      <spotLight
        position={[2, 5, 3]}
        angle={0.35}
        penumbra={0.8}
        intensity={3}
        color="#ffffff"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0001}
      />
      {/* Red forensic accent */}
      <spotLight
        position={[-3, 2, -2]}
        angle={0.5}
        penumbra={1}
        intensity={1.5}
        color="#ff2244"
        castShadow={false}
      />
      {/* Cool blue rim */}
      <pointLight position={[0, -3, 2]} color="#4488ff" intensity={0.8} distance={8} />
      {/* Ambient fill */}
      <ambientLight intensity={0.15} />
    </>
  );
}

// ── Main Exported Component ──
interface WeaponModel3DProps {
  theme: 'light' | 'dark';
  className?: string;
}

export default function WeaponModel3D({ theme, className }: WeaponModel3DProps) {
  const [autoRotate, setAutoRotate] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef({ x: 0, y: 0 });
  const cameraAngle = useRef({ theta: 0, phi: 0.3 });

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    setAutoRotate(false);
    dragStart.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    // Resume auto-rotation after 3 seconds of no interaction
    setTimeout(() => setAutoRotate(true), 3000);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    cameraAngle.current.theta += dx * 0.005;
    cameraAngle.current.phi += dy * 0.005;
    dragStart.current = { x: e.clientX, y: e.clientY };
  };

  return (
    <div
      ref={containerRef}
      className={`weapon-model-container ${className || ''}`}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerUp}
      style={{
        width: '100%',
        height: '320px',
        borderRadius: '16px',
        overflow: 'hidden',
        position: 'relative',
        cursor: isDragging ? 'grabbing' : 'grab',
        background: theme === 'dark'
          ? 'radial-gradient(ellipse at center, #1a0a0e 0%, #0a0a0f 70%, #050508 100%)'
          : 'radial-gradient(ellipse at center, #f0e8ea 0%, #e0d8dd 70%, #d0c8cd 100%)',
      }}
    >
      {/* Label overlay */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          left: '16px',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: '#ff2244',
            boxShadow: '0 0 8px #ff2244',
            animation: 'pulse 2s ease-in-out infinite',
          }}
        />
        <span
          style={{
            fontSize: '10px',
            fontWeight: 600,
            letterSpacing: '2px',
            textTransform: 'uppercase',
            color: theme === 'dark' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)',
            fontFamily: 'monospace',
          }}
        >
          Evidence — Weapon
        </span>
      </div>

      {/* Forensic tag */}
      <div
        style={{
          position: 'absolute',
          bottom: '12px',
          right: '16px',
          zIndex: 10,
          padding: '4px 10px',
          borderRadius: '4px',
          background: 'rgba(255,34,68,0.12)',
          border: '1px solid rgba(255,34,68,0.2)',
          pointerEvents: 'none',
        }}
      >
        <span
          style={{
            fontSize: '9px',
            fontWeight: 600,
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
            color: '#ff4466',
            fontFamily: 'monospace',
          }}
        >
          EV-001 • Drag to rotate
        </span>
      </div>

      {/* Scanline effect */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 5,
          pointerEvents: 'none',
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,34,68,0.015) 2px, rgba(255,34,68,0.015) 4px)',
        }}
      />

      <Canvas
        camera={{ position: [0, 0, 3.5], fov: 40 }}
        gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2 }}
        shadows
        style={{ background: 'transparent' }}
      >
        <SceneLighting />
        <KnifeModel autoRotate={autoRotate} />
        <ContactShadows
          position={[0, -2, 0]}
          opacity={0.4}
          scale={5}
          blur={2.5}
          far={4}
          color="#ff2244"
        />
        <Environment preset="city" />
      </Canvas>
    </div>
  );
}
