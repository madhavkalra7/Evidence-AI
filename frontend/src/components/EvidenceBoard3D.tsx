'use client';

import { useRef, useMemo, useState, useCallback, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Float, Html, Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';

/* ============================================================
   3D EVIDENCE BOARD — "Holographic Detective Wall"
   ============================================================
   A premium, cinematic evidence board with:
   - Holographic glassmorphism evidence cards
   - Neon-pulsing connection threads
   - Deep space/nebula backdrop with animated fog
   - Multi-layered floating particles (dust + sparks + embers)
   - Dynamic colored spotlights with volumetric glow
   - Hover → neon bloom + metadata popup
   - Click → ripple + detail panel
   - Mouse parallax camera rig
   ============================================================ */

// Types
export interface EvidenceItem {
  id: string;
  name: string;
  type: 'pdf' | 'scene_image' | 'evidence_image';
  chunks: number;
  caption?: string;
  pages?: number;
  thumbnail?: string;
}

interface EvidenceBoard3DProps {
  evidence: EvidenceItem[];
  onSelectEvidence: (item: EvidenceItem) => void;
  theme: 'light' | 'dark';
}

// ── Camera Rig — follows mouse for parallax tilt ──
function CameraRig() {
  const { camera } = useThree();
  const mouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.current.y = -(e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useFrame(() => {
    camera.position.x += (mouse.current.x * 1.0 - camera.position.x) * 0.025;
    camera.position.y += (mouse.current.y * 0.6 + 0.5 - camera.position.y) * 0.025;
    camera.lookAt(0, 0, 0);
  });

  return null;
}

// ── Animated Neon Connection Line between evidence items ──
function ConnectionLine({
  start,
  end,
  delay = 0,
  color = '#ff2244',
}: {
  start: [number, number, number];
  end: [number, number, number];
  delay?: number;
  color?: string;
}) {
  const lineRef = useRef<THREE.Line>(null!);
  const glowRef = useRef<THREE.Line>(null!);

  const { geometry, glowGeometry } = useMemo(() => {
    const mid: [number, number, number] = [
      (start[0] + end[0]) / 2 + (Math.random() - 0.5) * 0.4,
      (start[1] + end[1]) / 2 + (Math.random() - 0.5) * 0.4,
      (start[2] + end[2]) / 2 - 0.2,
    ];

    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(...start),
      new THREE.Vector3(...mid),
      new THREE.Vector3(...end)
    );

    const points = curve.getPoints(50);
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const glowGeo = new THREE.BufferGeometry().setFromPoints(points);
    return { geometry: geo, glowGeometry: glowGeo };
  }, [start, end]);

  const material = useMemo(
    () => new THREE.LineDashedMaterial({
      color,
      dashSize: 0.12,
      gapSize: 0.08,
      transparent: true,
      opacity: 0.7,
      linewidth: 1,
    }),
    [color]
  );

  const glowMaterial = useMemo(
    () => new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.15,
      linewidth: 3,
    }),
    [color]
  );

  useFrame((state) => {
    if (lineRef.current) {
      const mat = lineRef.current.material as THREE.LineDashedMaterial;
      mat.dashSize = 0.12 + Math.sin(state.clock.elapsedTime * 2.5 + delay) * 0.04;
      mat.opacity = 0.5 + Math.sin(state.clock.elapsedTime * 1.5 + delay) * 0.2;
      lineRef.current.computeLineDistances();
    }
    if (glowRef.current) {
      const mat = glowRef.current.material as THREE.LineBasicMaterial;
      mat.opacity = 0.08 + Math.sin(state.clock.elapsedTime * 1.5 + delay) * 0.08;
      glowRef.current.computeLineDistances();
    }
  });

  return (
    <group>
      <primitive ref={glowRef} object={new THREE.Line(glowGeometry, glowMaterial)} />
      <primitive ref={lineRef} object={new THREE.Line(geometry, material)} />
    </group>
  );
}

// ── Push Pin with animated glow ──
function PushPin({ position, color = '#ff2244' }: { position: [number, number, number]; color?: string }) {
  const headRef = useRef<THREE.Mesh>(null!);

  useFrame((state) => {
    if (headRef.current) {
      const mat = headRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.4 + Math.sin(state.clock.elapsedTime * 2) * 0.2;
    }
  });

  return (
    <group position={position}>
      {/* Pin glow halo */}
      <mesh position={[0, 0.12, 0.06]}>
        <circleGeometry args={[0.1, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.12} side={THREE.DoubleSide} />
      </mesh>
      {/* Pin head */}
      <mesh ref={headRef} position={[0, 0.12, 0.05]}>
        <sphereGeometry args={[0.055, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.5}
          metalness={0.8}
          roughness={0.2}
        />
      </mesh>
      {/* Pin needle */}
      <mesh position={[0, 0.04, 0.02]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.006, 0.006, 0.1, 6]} />
        <meshStandardMaterial color="#aaa" metalness={0.95} roughness={0.1} />
      </mesh>
    </group>
  );
}

// ── Single Evidence Card ── holographic glass card with neon edge ──
function EvidenceCard({
  item,
  position,
  rotation,
  onSelect,
  index,
}: {
  item: EvidenceItem;
  position: [number, number, number];
  rotation: [number, number, number];
  onSelect: (item: EvidenceItem) => void;
  index: number;
}) {
  const groupRef = useRef<THREE.Group>(null!);
  const meshRef = useRef<THREE.Mesh>(null!);
  const glowRef = useRef<THREE.Mesh>(null!);
  const edgeGlowRef = useRef<THREE.Mesh>(null!);
  const [hovered, setHovered] = useState(false);
  const [clicked, setClicked] = useState(false);

  useFrame((state) => {
    if (glowRef.current) {
      const targetOpacity = hovered ? 0.4 : 0;
      const mat = glowRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity += (targetOpacity - mat.opacity) * 0.12;
      if (hovered) {
        mat.opacity += Math.sin(state.clock.elapsedTime * 3) * 0.06;
      }
    }

    // Subtle edge neon breathing
    if (edgeGlowRef.current) {
      const mat = edgeGlowRef.current.material as THREE.MeshBasicMaterial;
      const baseOpacity = hovered ? 0.45 : 0.12;
      mat.opacity = baseOpacity + Math.sin(state.clock.elapsedTime * 2 + index * 0.7) * 0.06;
    }

    // Float bobbing
    if (groupRef.current) {
      groupRef.current.position.y =
        position[1] + Math.sin(state.clock.elapsedTime * 0.6 + index * 1.3) * 0.05;
    }
  });

  const handlePointerOver = useCallback(() => {
    setHovered(true);
    document.body.style.cursor = 'pointer';
    if (meshRef.current) {
      gsap.to(meshRef.current.scale, { x: 1.1, y: 1.1, z: 1.1, duration: 0.35, ease: 'power2.out' });
    }
  }, []);

  const handlePointerOut = useCallback(() => {
    setHovered(false);
    document.body.style.cursor = 'default';
    if (meshRef.current) {
      gsap.to(meshRef.current.scale, { x: 1, y: 1, z: 1, duration: 0.35, ease: 'power2.out' });
    }
  }, []);

  const handleClick = useCallback(() => {
    setClicked(true);
    onSelect(item);
    if (meshRef.current) {
      gsap.fromTo(
        meshRef.current.scale,
        { x: 0.92, y: 0.92, z: 0.92 },
        { x: 1, y: 1, z: 1, duration: 0.5, ease: 'elastic.out(1, 0.35)' }
      );
    }
    setTimeout(() => setClicked(false), 300);
  }, [onSelect, item]);

  // Colors by evidence type
  const cardColor = item.type === 'pdf' ? '#0a1628' : item.type === 'scene_image' ? '#1a0a0e' : '#0a1a10';
  const accentColor = item.type === 'pdf' ? '#4488ff' : item.type === 'scene_image' ? '#ff4466' : '#44ff88';
  const pinColor = item.type === 'pdf' ? '#4488ff' : '#ff2244';
  const iconText = item.type === 'pdf' ? '📄' : item.type === 'scene_image' ? '🔍' : '🧬';

  return (
    <Float speed={1.2} rotationIntensity={0.04} floatIntensity={0.06}>
      <group
        ref={groupRef}
        position={position}
        rotation={rotation}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      >
        {/* Push pin */}
        <PushPin position={[0, 0.55, 0]} color={pinColor} />

        {/* Outer neon bloom glow */}
        <mesh ref={glowRef} position={[0, 0, -0.03]}>
          <planeGeometry args={[1.5, 1.15]} />
          <meshBasicMaterial color={accentColor} transparent opacity={0} side={THREE.DoubleSide} />
        </mesh>

        {/* Main card — dark frosted glass */}
        <mesh ref={meshRef} castShadow receiveShadow>
          <planeGeometry args={[1.2, 0.9]} />
          <meshPhysicalMaterial
            color={cardColor}
            transparent
            opacity={0.88}
            side={THREE.DoubleSide}
            roughness={0.35}
            metalness={0.15}
            clearcoat={0.8}
            clearcoatRoughness={0.15}
          />
        </mesh>

        {/* Neon border edge */}
        <mesh ref={edgeGlowRef} position={[0, 0, 0.002]}>
          <planeGeometry args={[1.24, 0.94]} />
          <meshBasicMaterial
            color={accentColor}
            transparent
            opacity={0.12}
            wireframe
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* Accent strip at top */}
        <mesh position={[0, 0.42, 0.005]}>
          <planeGeometry args={[1.2, 0.03]} />
          <meshBasicMaterial color={accentColor} transparent opacity={hovered ? 0.7 : 0.4} />
        </mesh>

        {/* Accent strip at bottom */}
        <mesh position={[0, -0.42, 0.005]}>
          <planeGeometry args={[1.2, 0.03]} />
          <meshBasicMaterial color={accentColor} transparent opacity={hovered ? 0.5 : 0.2} />
        </mesh>

        {/* Corner accent dots */}
        {[[-0.56, 0.41], [0.56, 0.41], [-0.56, -0.41], [0.56, -0.41]].map(([x, y], i) => (
          <mesh key={i} position={[x, y, 0.006]}>
            <circleGeometry args={[0.02, 8]} />
            <meshBasicMaterial color={accentColor} transparent opacity={hovered ? 0.8 : 0.3} />
          </mesh>
        ))}

        {/* Icon via HTML */}
        <Html position={[0, 0.18, 0.02]} center style={{ pointerEvents: 'none' }}>
          <div style={{
            fontSize: '30px',
            lineHeight: 1,
            textAlign: 'center',
            filter: `drop-shadow(0 0 8px ${accentColor}80)`,
          }}>
            {iconText}
          </div>
        </Html>

        {/* File name */}
        <Billboard position={[0, -0.07, 0.02]}>
          <Text
            fontSize={0.068}
            color={hovered ? '#ffffff' : '#b0b8d0'}
            anchorX="center"
            anchorY="middle"
            maxWidth={1}
            font={undefined}
          >
            {item.name.length > 20 ? item.name.slice(0, 20) + '…' : item.name}
          </Text>
        </Billboard>

        {/* Chunk count badge */}
        <Billboard position={[0, -0.22, 0.02]}>
          <Text fontSize={0.045} color="#667799" anchorX="center" anchorY="middle">
            {item.chunks} chunks indexed
          </Text>
        </Billboard>

        {/* Type badge */}
        <Billboard position={[0, -0.33, 0.02]}>
          <Text fontSize={0.038} color={accentColor} anchorX="center" anchorY="middle">
            {item.type === 'pdf' ? '[ DOCUMENT ]' : item.type === 'scene_image' ? '[ SCENE ]' : '[ EVIDENCE ]'}
          </Text>
        </Billboard>

        {/* Hover tooltip */}
        {hovered && (
          <Html position={[0.78, 0.5, 0.1]} style={{ pointerEvents: 'none', width: '210px' }}>
            <div className="evidence-tooltip">
              <p className="evidence-tooltip-title">{item.name}</p>
              <div className="evidence-tooltip-divider" />
              <p className="evidence-tooltip-meta">
                <span className="evidence-tooltip-label">Type:</span>{' '}
                {item.type === 'pdf' ? 'PDF Document' : item.type === 'scene_image' ? 'Crime Scene Photo' : 'Evidence Photo'}
              </p>
              <p className="evidence-tooltip-meta">
                <span className="evidence-tooltip-label">Chunks:</span> {item.chunks}
              </p>
              {item.pages && (
                <p className="evidence-tooltip-meta">
                  <span className="evidence-tooltip-label">Pages:</span> {item.pages}
                </p>
              )}
              {item.caption && (
                <p className="evidence-tooltip-caption">
                  &ldquo;{item.caption.slice(0, 80)}...&rdquo;
                </p>
              )}
            </div>
          </Html>
        )}
      </group>
    </Float>
  );
}

// ── Multi-layer Atmospheric Particles ──
function ForensicParticles({ count = 300 }: { count?: number }) {
  const dustRef = useRef<THREE.Points>(null!);
  const sparkRef = useRef<THREE.Points>(null!);

  const dustParticles = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 14;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 10;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 8 - 2;

      // Warm amber/red forensic tones
      const t = Math.random();
      colors[i * 3] = 0.7 + t * 0.3;
      colors[i * 3 + 1] = 0.15 + t * 0.2;
      colors[i * 3 + 2] = 0.08 + t * 0.12;
      sizes[i] = 0.01 + Math.random() * 0.025;
    }
    return { positions, colors, sizes };
  }, [count]);

  const sparkCount = Math.floor(count / 4);
  const sparkParticles = useMemo(() => {
    const positions = new Float32Array(sparkCount * 3);
    const colors = new Float32Array(sparkCount * 3);

    for (let i = 0; i < sparkCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 10;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 7;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 5 - 1;

      // Blue-white spark tones
      const t = Math.random();
      colors[i * 3] = 0.3 + t * 0.5;
      colors[i * 3 + 1] = 0.4 + t * 0.4;
      colors[i * 3 + 2] = 0.8 + t * 0.2;
    }
    return { positions, colors };
  }, [sparkCount]);

  useFrame((state) => {
    if (dustRef.current) {
      dustRef.current.rotation.y = state.clock.elapsedTime * 0.008;
      dustRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.004) * 0.04;
    }
    if (sparkRef.current) {
      sparkRef.current.rotation.y = -state.clock.elapsedTime * 0.012;
      sparkRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.006) * 0.03;
    }
  });

  return (
    <group>
      {/* Dust layer — warm, slow */}
      <points ref={dustRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={count} array={dustParticles.positions} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={count} array={dustParticles.colors} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={0.02} vertexColors transparent opacity={0.25} sizeAttenuation depthWrite={false} />
      </points>

      {/* Sparks layer — cool, faster */}
      <points ref={sparkRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={sparkCount} array={sparkParticles.positions} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={sparkCount} array={sparkParticles.colors} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={0.015} vertexColors transparent opacity={0.15} sizeAttenuation depthWrite={false} />
      </points>
    </group>
  );
}

// ── Neon Thread connecting pins ──
function EvidenceThread({
  from,
  to,
  color = '#ff3355',
}: {
  from: [number, number, number];
  to: [number, number, number];
  color?: string;
}) {
  const glowRef = useRef<THREE.Line>(null!);

  const geometry = useMemo(() => {
    const points = [new THREE.Vector3(...from), new THREE.Vector3(...to)];
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [from, to]);

  useFrame((state) => {
    if (glowRef.current) {
      const mat = glowRef.current.material as THREE.LineBasicMaterial;
      mat.opacity = 0.2 + Math.sin(state.clock.elapsedTime * 1.5) * 0.1;
    }
  });

  return (
    <group>
      <primitive
        ref={glowRef}
        object={new THREE.Line(
          geometry,
          new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.25 })
        )}
      />
    </group>
  );
}

// ── Deep space / nebula background ──
function BoardBackground() {
  const bgRef = useRef<THREE.Mesh>(null!);
  const gridRef = useRef<THREE.GridHelper>(null!);

  useFrame((state) => {
    if (gridRef.current) {
      (gridRef.current.material as THREE.Material).opacity =
        0.06 + Math.sin(state.clock.elapsedTime * 0.3) * 0.02;
    }
  });

  return (
    <group>
      {/* Deep dark backdrop */}
      <mesh ref={bgRef} position={[0, 0, -3]}>
        <planeGeometry args={[20, 14]} />
        <meshBasicMaterial color="#040610" transparent opacity={0.7} />
      </mesh>

      {/* Ambient nebula glow - left (red) */}
      <mesh position={[-4, 1.5, -2.5]}>
        <circleGeometry args={[3, 32]} />
        <meshBasicMaterial color="#ff2244" transparent opacity={0.025} side={THREE.DoubleSide} />
      </mesh>

      {/* Ambient nebula glow - right (blue) */}
      <mesh position={[4, -1, -2.5]}>
        <circleGeometry args={[3.5, 32]} />
        <meshBasicMaterial color="#2244ff" transparent opacity={0.02} side={THREE.DoubleSide} />
      </mesh>

      {/* Ambient nebula glow - center (purple) */}
      <mesh position={[0, 0, -2.8]}>
        <circleGeometry args={[5, 32]} />
        <meshBasicMaterial color="#6622aa" transparent opacity={0.015} side={THREE.DoubleSide} />
      </mesh>

      {/* Holographic grid floor */}
      <gridHelper
        ref={gridRef}
        args={[14, 28, '#1a2255', '#0d1133']}
        position={[0, -4, -1]}
        rotation={[Math.PI / 2.2, 0, 0]}
        material-transparent
        material-opacity={0.07}
      />
    </group>
  );
}

// ── Title ──
function BoardTitle({ theme }: { theme: 'light' | 'dark' }) {
  const titleRef = useRef<any>(null);

  return (
    <group position={[0, 3.5, -0.5]}>
      {/* Title glow backdrop */}
      <mesh position={[0, 0, -0.1]}>
        <planeGeometry args={[4, 0.6]} />
        <meshBasicMaterial color="#ff3355" transparent opacity={0.03} />
      </mesh>

      <Billboard>
        <Text
          ref={titleRef}
          fontSize={0.2}
          color={theme === 'dark' ? '#ff3355' : '#cc2244'}
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.18}
          font={undefined}
        >
          {'◆ EVIDENCE BOARD ◆'}
        </Text>
      </Billboard>

      {/* Decorative horizontal line under title */}
      <mesh position={[0, -0.18, 0]}>
        <planeGeometry args={[3, 0.003]} />
        <meshBasicMaterial color="#ff3355" transparent opacity={0.3} />
      </mesh>
    </group>
  );
}

// ── Calculate evidence card positions ──
function getCardPositions(count: number): { position: [number, number, number]; rotation: [number, number, number] }[] {
  const positions: { position: [number, number, number]; rotation: [number, number, number] }[] = [];
  if (count === 0) return positions;

  const layouts: [number, number, number, number, number, number][] = [
    [0, 0.5, 0, -0.02, 0.015, 0],
    [-2.3, 0.9, -0.1, 0.015, -0.04, 0.02],
    [2.1, 0.4, -0.15, -0.015, 0.035, -0.015],
    [-1.0, -1.1, -0.12, 0.03, 0.01, -0.02],
    [1.6, -0.7, -0.05, -0.008, -0.025, 0.015],
    [-2.9, -0.4, -0.25, 0.02, 0.05, -0.008],
    [3.1, 1.3, -0.2, -0.03, -0.015, 0.03],
    [0, -1.9, -0.08, 0.008, 0.02, -0.008],
    [-1.6, 1.9, -0.18, -0.015, 0.035, 0.02],
    [2.6, -1.6, -0.12, 0.025, -0.04, -0.015],
  ];

  for (let i = 0; i < count && i < layouts.length; i++) {
    const l = layouts[i];
    positions.push({
      position: [l[0], l[1], l[2]],
      rotation: [l[3], l[4], l[5]],
    });
  }
  return positions;
}

// ── Connection pairs ──
function getConnectionPairs(count: number): [number, number][] {
  if (count < 2) return [];
  const pairs: [number, number][] = [];
  for (let i = 0; i < count - 1 && i < 5; i++) pairs.push([i, i + 1]);
  if (count >= 3) pairs.push([0, 2]);
  if (count >= 4) pairs.push([1, 3]);
  if (count >= 5) pairs.push([0, 4]);
  return pairs;
}

// ── Main Scene ──
function BoardScene({
  evidence,
  onSelectEvidence,
  theme,
}: {
  evidence: EvidenceItem[];
  onSelectEvidence: (item: EvidenceItem) => void;
  theme: 'light' | 'dark';
}) {
  const cardPositions = useMemo(() => getCardPositions(evidence.length), [evidence.length]);
  const connectionPairs = useMemo(() => getConnectionPairs(evidence.length), [evidence.length]);

  return (
    <>
      {/* Multi-point colored lighting */}
      <ambientLight intensity={0.2} />
      <pointLight position={[0, 5, 5]} color="#ff3355" intensity={1.5} distance={18} decay={2} />
      <pointLight position={[-5, 2, 4]} color="#4488ff" intensity={0.8} distance={14} decay={2} />
      <pointLight position={[5, -2, 4]} color="#ff8844" intensity={0.5} distance={12} decay={2} />
      <pointLight position={[0, -3, 3]} color="#8844ff" intensity={0.3} distance={10} decay={2} />
      <spotLight
        position={[0, 6, 6]}
        angle={0.5}
        penumbra={0.8}
        intensity={0.6}
        color="#ffffff"
        castShadow
      />

      {/* Fog for depth */}
      <fog attach="fog" args={['#050810', 6, 18]} />

      <CameraRig />
      <BoardBackground />
      <BoardTitle theme={theme} />

      {/* Evidence Cards */}
      {evidence.map((item, i) => {
        const layout = cardPositions[i];
        if (!layout) return null;
        return (
          <EvidenceCard
            key={item.id}
            item={item}
            position={layout.position}
            rotation={layout.rotation}
            onSelect={onSelectEvidence}
            index={i}
          />
        );
      })}

      {/* Neon Connection Lines */}
      {connectionPairs.map(([a, b], i) => {
        const colorPool = ['#ff3355', '#4488ff', '#ff8844', '#44ff88', '#8844ff'];
        return (
          <ConnectionLine
            key={`conn-${a}-${b}`}
            start={cardPositions[a].position}
            end={cardPositions[b].position}
            delay={i * 0.4}
            color={colorPool[i % colorPool.length]}
          />
        );
      })}

      {/* Neon Threads from pins */}
      {connectionPairs.map(([a, b], i) => (
        <EvidenceThread
          key={`thread-${a}-${b}`}
          from={[
            cardPositions[a].position[0],
            cardPositions[a].position[1] + 0.55,
            cardPositions[a].position[2],
          ]}
          to={[
            cardPositions[b].position[0],
            cardPositions[b].position[1] + 0.55,
            cardPositions[b].position[2],
          ]}
          color={['#ff3355', '#4488ff', '#ff8844'][i % 3]}
        />
      ))}

      {/* Multi-layer atmospheric particles */}
      <ForensicParticles count={250} />
    </>
  );
}

// ── Empty State ──
function EmptyBoard({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <>
      <ambientLight intensity={0.15} />
      <pointLight position={[0, 3, 5]} color="#ff3355" intensity={0.8} distance={15} decay={2} />
      <pointLight position={[-3, 0, 3]} color="#4488ff" intensity={0.4} distance={12} decay={2} />
      <fog attach="fog" args={['#050810', 6, 18]} />
      <CameraRig />
      <BoardBackground />
      <BoardTitle theme={theme} />

      {/* Pulsing center ring */}
      <mesh position={[0, 0.2, 0]} rotation={[0, 0, 0]}>
        <ringGeometry args={[0.6, 0.65, 32]} />
        <meshBasicMaterial color="#ff3355" transparent opacity={0.15} side={THREE.DoubleSide} />
      </mesh>

      <Billboard position={[0, 0.2, 0.1]}>
        <Text fontSize={0.13} color="#667799" anchorX="center" anchorY="middle">
          Upload evidence to populate the board
        </Text>
      </Billboard>
      <Billboard position={[0, -0.15, 0.1]}>
        <Text fontSize={0.08} color="#445577" anchorX="center" anchorY="middle">
          PDF reports • Crime scene photos • Evidence images
        </Text>
      </Billboard>

      <ForensicParticles count={120} />
    </>
  );
}

// ── Exported Component ──
export default function EvidenceBoard3D({ evidence, onSelectEvidence, theme }: EvidenceBoard3DProps) {
  return (
    <div className="evidence-board-container">
      {/* Label overlay */}
      <div className="evidence-board-label">
        <div className="evidence-board-label-dot" />
        <span>EVIDENCE BOARD</span>
        <span className="evidence-board-label-count">{evidence.length} items</span>
      </div>

      <Canvas
        camera={{ position: [0, 0.5, 5.5], fov: 50 }}
        gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2 }}
        style={{ background: 'transparent' }}
        shadows
      >
        {evidence.length > 0 ? (
          <BoardScene evidence={evidence} onSelectEvidence={onSelectEvidence} theme={theme} />
        ) : (
          <EmptyBoard theme={theme} />
        )}
      </Canvas>

      {/* Scanline + vignette overlays */}
      <div className="evidence-board-scanline" />
      <div className="evidence-board-vignette" />
    </div>
  );
}
