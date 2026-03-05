'use client';

import { useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { useGLTF, OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';

function BodyMesh({ flip }: { flip?: boolean }) {
  const { scene } = useGLTF('/body.glb');

  return (
    <group rotation={[0, flip ? Math.PI : 0, 0]}>
      <primitive object={scene.clone()} scale={1.6} position={[0, -1.5, 0]} />
    </group>
  );
}

export default function BodyModel3D({ side }: { side: 'left' | 'right' }) {
  return (
    <div
      className="body-model-container"
      style={{
        position: 'fixed',
        top: '50%',
        transform: 'translateY(-50%)',
        ...(side === 'left' ? { left: 50 } : { right: 50 }),
        width: '240px',
        height: '350px',
        zIndex: 2,
        pointerEvents: 'auto',
        opacity: 0.7,
        cursor: 'grab',
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 4], fov: 40 }}
        gl={{ alpha: true, antialias: true }}
        style={{ background: 'transparent', cursor: 'grab' }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[3, 5, 3]} intensity={0.8} color="#4ade80" />
        <directionalLight position={[-3, 2, -2]} intensity={0.3} color="#22d3ee" />
        <pointLight position={[0, 2, 2]} intensity={0.5} color="#10b981" />
        <BodyMesh flip={side === 'right'} />
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          autoRotate
          autoRotateSpeed={1.5}
          rotateSpeed={0.8}
        />
        <Environment preset="night" />
      </Canvas>
    </div>
  );
}

useGLTF.preload('/body.glb');
