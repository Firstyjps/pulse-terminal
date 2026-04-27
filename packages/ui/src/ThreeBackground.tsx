"use client";

import * as React from "react";
import * as THREE from "three";

export interface ThreeBackgroundProps {
  /** Particle count. Default 1200 (matches Pulse Command). */
  particles?: number;
  /** Camera z-distance. Default 20. */
  cameraZ?: number;
  /** If true, mount the canvas with z-index 0 instead of -1 (useful inside scoped containers). */
  inline?: boolean;
  style?: React.CSSProperties;
}

interface OrbDef {
  r: number;
  color: number;
  x: number;
  y: number;
  z: number;
  name: string;
}

const ORB_DEFS: OrbDef[] = [
  { r: 1.6, color: 0xf7931a, x: -7, y: 2, z: -5, name: "BTC" },
  { r: 1.0, color: 0x627eea, x: 6, y: 3, z: -8, name: "ETH" },
  { r: 0.45, color: 0x9945ff, x: -3, y: -3, z: -3, name: "SOL" },
  { r: 0.32, color: 0x22d3ee, x: 9, y: -2, z: -10, name: "USDC" },
  { r: 0.3, color: 0xfbbf24, x: -9, y: -1, z: -9, name: "USDT" },
  { r: 0.25, color: 0x10b981, x: 4, y: 5, z: -6, name: "TRX" },
  { r: 0.22, color: 0x0052ff, x: -5, y: 6, z: -12, name: "BASE" },
];

export function ThreeBackground({
  particles = 1200,
  cameraZ = 20,
  inline = false,
  style,
}: ThreeBackgroundProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = cameraZ;

    // Particle field
    const N = particles;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 60;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 40;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 40;
      const m = Math.random();
      if (m < 0.5) {
        col[i * 3] = 0.49;
        col[i * 3 + 1] = 0.36;
        col[i * 3 + 2] = 1.0;
      } else if (m < 0.8) {
        col[i * 3] = 0.13;
        col[i * 3 + 1] = 0.83;
        col[i * 3 + 2] = 0.93;
      } else {
        col[i * 3] = 0.97;
        col[i * 3 + 1] = 0.58;
        col[i * 3 + 2] = 0.1;
      }
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.06,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);

    // Crypto orbs
    interface Orb {
      s: THREE.Mesh;
      gs: THREE.Mesh;
      base: number;
      off: number;
      speed: number;
    }
    const orbs: Orb[] = [];
    const orbGeometries: THREE.BufferGeometry[] = [];
    const orbMaterials: THREE.Material[] = [];

    for (const o of ORB_DEFS) {
      const g = new THREE.SphereGeometry(o.r, 32, 32);
      const m = new THREE.MeshBasicMaterial({ color: o.color, transparent: true, opacity: 0.55 });
      const s = new THREE.Mesh(g, m);
      s.position.set(o.x, o.y, o.z);
      scene.add(s);

      const gg = new THREE.SphereGeometry(o.r * 1.6, 32, 32);
      const gm = new THREE.MeshBasicMaterial({
        color: o.color,
        transparent: true,
        opacity: 0.1,
        blending: THREE.AdditiveBlending,
      });
      const gs = new THREE.Mesh(gg, gm);
      gs.position.copy(s.position);
      scene.add(gs);

      orbGeometries.push(g, gg);
      orbMaterials.push(m, gm);

      orbs.push({
        s,
        gs,
        base: s.position.y,
        off: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 0.3,
      });
    }

    let mx = 0;
    let my = 0;
    const onMouseMove = (e: MouseEvent) => {
      mx = (e.clientX / window.innerWidth - 0.5) * 0.4;
      my = (e.clientY / window.innerHeight - 0.5) * 0.3;
    };
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("resize", onResize);

    let rafId = 0;
    let disposed = false;
    const animate = (t: number) => {
      if (disposed) return;
      const ts = t * 0.001;
      points.rotation.y = ts * 0.05 + mx * 0.5;
      points.rotation.x = my * 0.3;
      for (const o of orbs) {
        o.s.position.y = o.base + Math.sin(ts * o.speed + o.off) * 0.5;
        o.gs.position.copy(o.s.position);
      }
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
      geo.dispose();
      mat.dispose();
      for (const g of orbGeometries) g.dispose();
      for (const m of orbMaterials) m.dispose();
      renderer.dispose();
    };
  }, [particles, cameraZ]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: inline ? 0 : -1,
        pointerEvents: "none",
        ...style,
      }}
    />
  );
}
