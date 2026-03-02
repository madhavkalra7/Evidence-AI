'use client';

import { useRef, useState, useCallback, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Float, Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';

/* ============================================================
   3D CRIME SCENE MINI VIEWER
   ============================================================
   Shows uploaded images as hanging 3D photos with:
   - Subtle 3D tilt on mouse move
   - Parallax depth effect
   - Depth zoom on hover
   - Floating tooltips
   - Images hang and tilt while hovering
   - Polaroid-style frame with metadata
   ============================================================ */

interface CrimeSceneViewerProps {
  imageUrl?: string;
  fileName: string;
  imageType: 'scene_image' | 'evidence_image';
  caption?: string;
  chunks: number;
  theme: 'light' | 'dark';
  onClick?: () => void;
}

// ── Hanging Wire ──
function HangingWire({ width = 1.4 }: { width?: number }) {
  const points = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const segments = 20;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const x = (t - 0.5) * width;
      // Catenary-like curve
      const y = 0.65 + Math.cosh((t - 0.5) * 3) * 0.04 - 0.06;
      pts.push(new THREE.Vector3(x, y, 0.01));
    }
    return pts;
  }, [width]);

  const geometry = useMemo(() => new THREE.BufferGeometry().setFromPoints(points), [points]);

  return (
    <primitive
      object={
        new THREE.Line(
          geometry,
          new THREE.LineBasicMaterial({
            color: '#666688',
            transparent: true,
            opacity: 0.5,
          })
        )
      }
    />
  );
}

// ── Paper Clip ──
function PaperClip({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[0.04, 0.15, 0.01]} />
        <meshStandardMaterial color="#aabbcc" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[0.015, 0.075, 0]}>
        <boxGeometry args={[0.07, 0.02, 0.01]} />
        <meshStandardMaterial color="#aabbcc" metalness={0.8} roughness={0.2} />
      </mesh>
    </group>
  );
}

// ── Detected Object Highlight Markers ──
function ObjectHighlights({ hovered }: { hovered: boolean }) {
  const groupRef = useRef<THREE.Group>(null!);

  // Simulated detected regions (normalized 0-1 positions on the image plane)
  const markers = useMemo(
    () => [
      { x: -0.25, y: 0.15, label: 'Object A', color: '#ff4466' },
      { x: 0.2, y: -0.1, label: 'Object B', color: '#44ff88' },
      { x: -0.1, y: -0.25, label: 'Region C', color: '#ffaa44' },
    ],
    []
  );

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.visible = hovered;
      // Pulse effect
      const scale = 1 + Math.sin(state.clock.elapsedTime * 4) * 0.1;
      groupRef.current.children.forEach((child) => {
        child.scale.setScalar(scale);
      });
    }
  });

  return (
    <group ref={groupRef}>
      {markers.map((marker, i) => (
        <group key={i} position={[marker.x, marker.y, 0.03]}>
          {/* Corner brackets for detection box */}
          <mesh>
            <ringGeometry args={[0.06, 0.07, 4]} />
            <meshBasicMaterial
              color={marker.color}
              transparent
              opacity={0.7}
              side={THREE.DoubleSide}
            />
          </mesh>
          {/* Label */}
          <Billboard position={[0.12, 0.08, 0]}>
            <Text fontSize={0.035} color={marker.color} anchorX="left" anchorY="middle">
              {marker.label}
            </Text>
          </Billboard>
        </group>
      ))}
    </group>
  );
}

// ── Main Image Card with 3D tilt ──
function ImageCard({
  imageType,
  fileName,
  caption,
  chunks,
  hovered,
  setHovered,
}: {
  imageType: 'scene_image' | 'evidence_image';
  fileName: string;
  caption?: string;
  chunks: number;
  hovered: boolean;
  setHovered: (v: boolean) => void;
}) {
  const groupRef = useRef<THREE.Group>(null!);
  const cardRef = useRef<THREE.Mesh>(null!);
  const mouse = useRef({ x: 0, y: 0 });

  const { viewport } = useThree();

  // Track mouse for parallax tilt
  const handlePointerMove = useCallback(
    (e: any) => {
      if (e.uv) {
        mouse.current.x = (e.uv.x - 0.5) * 2;
        mouse.current.y = (e.uv.y - 0.5) * 2;
      }
    },
    []
  );

  useFrame((state) => {
    if (groupRef.current) {
      // 3D tilt based on mouse position (parallax)
      const targetRotY = hovered ? mouse.current.x * 0.15 : Math.sin(state.clock.elapsedTime * 0.5) * 0.02;
      const targetRotX = hovered ? -mouse.current.y * 0.1 : Math.cos(state.clock.elapsedTime * 0.3) * 0.015;
      const targetScale = hovered ? 1.06 : 1;

      groupRef.current.rotation.y += (targetRotY - groupRef.current.rotation.y) * 0.08;
      groupRef.current.rotation.x += (targetRotX - groupRef.current.rotation.x) * 0.08;

      // Depth zoom on hover
      const targetZ = hovered ? 0.3 : 0;
      groupRef.current.position.z += (targetZ - groupRef.current.position.z) * 0.06;

      // Scale
      groupRef.current.scale.x += (targetScale - groupRef.current.scale.x) * 0.08;
      groupRef.current.scale.y += (targetScale - groupRef.current.scale.y) * 0.08;

      // Hanging swing when not hovered
      if (!hovered) {
        groupRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.4) * 0.015;
      } else {
        groupRef.current.rotation.z *= 0.95;
      }
    }
  });

  const accentColor = imageType === 'scene_image' ? '#ff4466' : '#44ff88';
  const bgColor = imageType === 'scene_image' ? '#1a0a0e' : '#0a1a0e';
  const icon = imageType === 'scene_image' ? '🔍' : '🔬';

  return (
    <group
      ref={groupRef}
      onPointerOver={() => {
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = 'default';
      }}
      onPointerMove={handlePointerMove}
    >
      {/* Hanging wire */}
      <HangingWire />

      {/* Paper clip */}
      <PaperClip position={[0, 0.62, 0.02]} />

      {/* Shadow beneath card */}
      <mesh position={[0.03, -0.03, -0.05]} visible={hovered}>
        <planeGeometry args={[1.3, 1.0]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.2} />
      </mesh>

      {/* Main card background (Polaroid style) */}
      <mesh ref={cardRef}>
        <planeGeometry args={[1.2, 1.0]} />
        <meshStandardMaterial
          color={bgColor}
          transparent
          opacity={0.95}
          roughness={0.7}
          metalness={0.05}
        />
      </mesh>

      {/* Card border glow */}
      <mesh position={[0, 0, -0.005]}>
        <planeGeometry args={[1.24, 1.04]} />
        <meshBasicMaterial
          color={accentColor}
          transparent
          opacity={hovered ? 0.4 : 0.1}
          wireframe={!hovered}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Image area placeholder */}
      <mesh position={[0, 0.08, 0.005]}>
        <planeGeometry args={[1.0, 0.65]} />
        <meshStandardMaterial
          color={imageType === 'scene_image' ? '#1a1520' : '#101a15'}
          roughness={0.3}
        />
      </mesh>

      {/* Type icon over image area */}
      <Billboard position={[0, 0.12, 0.02]}>
        <Text fontSize={0.22} color="white" anchorX="center" anchorY="middle">
          {icon}
        </Text>
      </Billboard>

      {/* Image type indicator */}
      <Billboard position={[0, -0.15, 0.02]}>
        <Text fontSize={0.06} color={accentColor} anchorX="center" anchorY="middle">
          {imageType === 'scene_image' ? '● CRIME SCENE' : '● EVIDENCE'}
        </Text>
      </Billboard>

      {/* Filename */}
      <Billboard position={[0, -0.28, 0.02]}>
        <Text fontSize={0.05} color="#8899bb" anchorX="center" anchorY="middle" maxWidth={1}>
          {fileName.length > 22 ? fileName.slice(0, 22) + '...' : fileName}
        </Text>
      </Billboard>

      {/* Chunks badge */}
      <Billboard position={[0, -0.38, 0.02]}>
        <Text fontSize={0.04} color="#556677" anchorX="center" anchorY="middle">
          {chunks} chunks • AI analyzed
        </Text>
      </Billboard>

      {/* Object highlights (shown on hover) */}
      <group position={[0, 0.08, 0.01]}>
        <ObjectHighlights hovered={hovered} />
      </group>

      {/* Floating tooltip on hover */}
      {hovered && caption && (
        <Html
          position={[0.75, 0.4, 0.1]}
          style={{ pointerEvents: 'none', width: '180px' }}
        >
          <div className="scene-viewer-tooltip">
            <p className="scene-viewer-tooltip-label">AI Analysis</p>
            <p className="scene-viewer-tooltip-text">
              "{caption.slice(0, 100)}{caption.length > 100 ? '...' : ''}"
            </p>
          </div>
        </Html>
      )}
    </group>
  );
}

// ── Depth Particles (behind the image for parallax depth) ──
function DepthParticles({ count = 50 }: { count?: number }) {
  const mesh = useRef<THREE.Points>(null!);

  const particles = useMemo(() => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 3;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 2.5;
      positions[i * 3 + 2] = -0.5 - Math.random() * 2;
    }
    return positions;
  }, [count]);

  useFrame((state) => {
    if (mesh.current) {
      mesh.current.rotation.z = state.clock.elapsedTime * 0.02;
    }
  });

  return (
    <points ref={mesh}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={particles}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial size={0.015} color="#ff3355" transparent opacity={0.2} sizeAttenuation />
    </points>
  );
}

// ── Exported Component ──
export default function CrimeSceneViewer3D({
  imageUrl,
  fileName,
  imageType,
  caption,
  chunks,
  theme,
  onClick,
}: CrimeSceneViewerProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={`crime-scene-viewer-container ${hovered ? 'crime-scene-viewer-hovered' : ''}`}
      onClick={onClick}
    >
      {/* Type badge */}
      <div className="crime-scene-viewer-badge" data-type={imageType}>
        <span className="crime-scene-viewer-badge-dot" />
        {imageType === 'scene_image' ? 'SCENE' : 'EVIDENCE'}
      </div>

      <Canvas
        camera={{ position: [0, 0, 2.2], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.3} />
        <pointLight
          position={[2, 2, 3]}
          color={imageType === 'scene_image' ? '#ff4466' : '#44ff88'}
          intensity={0.8}
          distance={8}
        />
        <pointLight position={[-2, -1, 2]} color="#4466ff" intensity={0.3} distance={6} />

        <ImageCard
          imageType={imageType}
          fileName={fileName}
          caption={caption}
          chunks={chunks}
          hovered={hovered}
          setHovered={setHovered}
        />

        <DepthParticles count={40} />
      </Canvas>

      {/* Bottom info strip */}
      <div className="crime-scene-viewer-info">
        <span className="crime-scene-viewer-info-name">{fileName}</span>
        <span className="crime-scene-viewer-info-chunks">{chunks} chunks</span>
      </div>
    </div>
  );
}
