'use client';

import { useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';

function BodyMesh({ flip }: { flip?: boolean }) {
  const group = useRef<THREE.Group>(null!);
  const { scene } = useGLTF('/body.glb');

  useFrame((state) => {
    if (group.current) {
      group.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.3) * 0.3 + (flip ? Math.PI : 0);
    }
  });

  return (
    <group ref={group} scale={flip ? [-1, 1, 1] : [1, 1, 1]}>
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
        zIndex: 1,
        pointerEvents: 'auto',
        opacity: 0.7,
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 4], fov: 40 }}
        gl={{ alpha: true, antialias: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[3, 5, 3]} intensity={0.8} color="#4ade80" />
        <directionalLight position={[-3, 2, -2]} intensity={0.3} color="#22d3ee" />
        <pointLight position={[0, 2, 2]} intensity={0.5} color="#10b981" />
        <BodyMesh flip={side === 'right'} />
        <OrbitControls enableZoom={false} enablePan={false} rotateSpeed={0.5} />
        <Environment preset="night" />
      </Canvas>
    </div>
  );
}

useGLTF.preload('/body.glb');
