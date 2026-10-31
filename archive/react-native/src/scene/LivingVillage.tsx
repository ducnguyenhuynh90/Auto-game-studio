// The living hub scene behind the village screen (Skia, 2.5D): drifting clouds, moving waves, your boat
// bobbing at sea, a swaying palm, Bà Năm's hut, every kind of building you've built on the island,
// your workers walking between them, and Mực wagging by the hut once he has joined.
// Everything is read from the game state, so the village grows as the business does.
import { Canvas, Circle, Group, LinearGradient, Oval, Path, Rect, RoundedRect, vec } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { dogPresent } from '@core/dog';
import type { BuildingId, Role } from '@core/island';
import type { GameState } from '@core/state';
import { C } from '../theme';

const FPS = 30;

/** Seconds since the scene opened, ticking at ~30 fps (enough for waves; cheap on weak phones). */
function useClock(): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    let last = 0;
    let raf = 0;
    const loop = () => {
      const now = Date.now();
      if (now - last >= 1000 / FPS) {
        last = now;
        setT((now - t0) / 1000);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return t;
}

const LOOK: Record<BuildingId, { wall: string; roof: string; tall?: number }> = {
  dock: { wall: '#b98a5a', roof: '#3a8fd9' },
  saltfield: { wall: '#f4f1ea', roof: '#9ec9d9' },
  brewhouse: { wall: '#c98444', roof: '#8f3a24', tall: 1.2 },
  shop: { wall: '#f6e2b3', roof: '#d8473b' },
  warehouse: { wall: '#a8987e', roof: '#5f5244', tall: 1.3 },
  tradepost: { wall: '#d9b26a', roof: '#2f8f6a' },
  touroffice: { wall: '#fff0d0', roof: '#a35bd6' },
  lantern: { wall: '#7a5230', roof: '#f27a3a' },
  shrine: { wall: '#d6b46a', roof: '#b03a2e', tall: 1.1 },
};

const ROLE_COLOR: Record<Role, string> = { fisher: '#3a8fd9', salter: '#e8e2d0', brewer: '#a06a3d', seller: '#d8473b', guide: '#a35bd6' };

/** A little house: wall, pitched roof, door. (x, y) is the middle of its base. */
function House({ x, y, size, wall, roof, tall = 1 }: { x: number; y: number; size: number; wall: string; roof: string; tall?: number }) {
  const w = size;
  const h = size * 0.7 * tall;
  return (
    <Group>
      <Oval x={x - w * 0.62} y={y - 5} width={w * 1.24} height={10} color="rgba(43,33,24,0.18)" />
      <Rect x={x - w / 2} y={y - h} width={w} height={h} color={wall} />
      <Rect x={x - w / 2} y={y - h} width={w} height={h} color={C.ink} style="stroke" strokeWidth={2} />
      <Path path={`M ${x - w * 0.62} ${y - h + 1} L ${x} ${y - h - w * 0.45} L ${x + w * 0.62} ${y - h + 1} Z`} color={roof} />
      <Path path={`M ${x - w * 0.62} ${y - h + 1} L ${x} ${y - h - w * 0.45} L ${x + w * 0.62} ${y - h + 1} Z`} color={C.ink} style="stroke" strokeWidth={2} />
      <Rect x={x - w * 0.11} y={y - h * 0.5} width={w * 0.22} height={h * 0.5} color="#6e4423" />
    </Group>
  );
}

function SaltPans({ x, y, size, t }: { x: number; y: number; size: number; t: number }) {
  return (
    <Group>
      {[0, 1, 2].map((k) => (
        <RoundedRect key={k} x={x - size * 0.75 + k * size * 0.52} y={y - 12} width={size * 0.46} height={12} r={3} color={`rgba(255,255,255,${0.75 + 0.2 * Math.sin(t * 1.3 + k)})`} />
      ))}
    </Group>
  );
}

function Lanterns({ x, y, size, t }: { x: number; y: number; size: number; t: number }) {
  const left = x - size * 0.7;
  const right = x + size * 0.7;
  return (
    <Group>
      <Rect x={left - 2} y={y - 34} width={4} height={34} color="#6e4423" />
      <Rect x={right - 2} y={y - 34} width={4} height={34} color="#6e4423" />
      <Path path={`M ${left} ${y - 32} Q ${x} ${y - 20} ${right} ${y - 32}`} color={C.ink} style="stroke" strokeWidth={1.5} />
      {[0.2, 0.4, 0.6, 0.8].map((k, i) => {
        const lx = left + (right - left) * k;
        const ly = y - 32 + Math.sin(k * Math.PI) * 11 + 4 + Math.sin(t * 2 + i) * 1.5;
        return <Circle key={k} cx={lx} cy={ly} r={4.5} color={i % 2 ? '#f5c242' : '#f27a3a'} opacity={0.85 + 0.15 * Math.sin(t * 3 + i)} />;
      })}
    </Group>
  );
}

/** A worker or Mực: tiny, chunky, readable at a glance. */
function Worker({ x, y, color, step }: { x: number; y: number; color: string; step: number }) {
  const bob = Math.abs(Math.sin(step)) * 2.5;
  return (
    <Group>
      <Oval x={x - 7} y={y - 2} width={14} height={5} color="rgba(43,33,24,0.2)" />
      <RoundedRect x={x - 5} y={y - 17 - bob} width={10} height={13} r={4} color={color} />
      <Circle cx={x} cy={y - 21 - bob} r={5} color="#f2c9a0" />
      <Path path={`M ${x - 8} ${y - 23 - bob} L ${x} ${y - 30 - bob} L ${x + 8} ${y - 23 - bob} Z`} color="#e8c58a" />
    </Group>
  );
}

function Dog({ x, y, t }: { x: number; y: number; t: number }) {
  const wag = Math.sin(t * 12) * 5;
  return (
    <Group>
      <Oval x={x - 12} y={y - 3} width={24} height={6} color="rgba(43,33,24,0.2)" />
      <RoundedRect x={x - 10} y={y - 14} width={20} height={10} r={5} color="#3a3330" />
      <Rect x={x - 8} y={y - 6} width={3} height={6} color="#3a3330" />
      <Rect x={x + 5} y={y - 6} width={3} height={6} color="#3a3330" />
      <Circle cx={x + 11} cy={y - 16} r={6} color="#3a3330" />
      <Path path={`M ${x + 8} ${y - 20} L ${x + 10} ${y - 27} L ${x + 13} ${y - 21} Z`} color="#3a3330" />
      <Circle cx={x + 13} cy={y - 17} r={1.3} color="#fff" />
      <Path path={`M ${x - 10} ${y - 12} Q ${x - 16} ${y - 18 + wag} ${x - 14} ${y - 24 + wag}`} color="#3a3330" style="stroke" strokeWidth={3} strokeCap="round" />
    </Group>
  );
}

function wave(w: number, y: number, amp: number, len: number, phase: number): string {
  let d = `M 0 ${y}`;
  for (let x = 0; x <= w + 10; x += 10) d += ` L ${x} ${y + Math.sin(x / len + phase) * amp}`;
  return d;
}

export function LivingVillage({ w, h, s }: { w: number; h: number; s: GameState }) {
  const t = useClock();
  const horizon = h * 0.29;
  const beach = h * 0.52;
  // the sea, the boat and the sky
  const boatX = w * 0.5 + Math.sin(t * 0.2) * w * 0.3;
  const boatY = h * 0.345 + Math.sin(t * 1.6) * 3; // above the jars, below the buttons
  const tilt = Math.sin(t * 1.6 + 0.6) * 0.06;
  const sail = s.upgrades.boat >= 2;
  // buildings: one house for each kind you have, in two rows on the grass
  const kinds = [...new Set(s.island.buildings.map((b) => b.id))].slice(0, 8);
  const rowY = [h * 0.68, h * 0.8];
  const slot = (i: number) => ({ x: w * (0.14 + (i % 4) * 0.24), y: rowY[Math.floor(i / 4)] });
  const size = Math.min(54, w * 0.13);
  const staff = s.island.staff.slice(0, 8);
  const palmSway = Math.sin(t * 0.9) * 6;
  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <Rect x={0} y={0} width={w} height={horizon + 2}>
        <LinearGradient start={vec(0, 0)} end={vec(0, horizon)} colors={['#ffc98f', '#ffeccc']} />
      </Rect>
      <Circle cx={w * 0.78} cy={h * 0.12} r={44 + Math.sin(t * 0.8) * 3} color="rgba(255,243,196,0.35)" />
      <Circle cx={w * 0.78} cy={h * 0.12} r={32} color="#fff3c4" />
      {[0, 1, 2].map((k) => {
        const span = w + 160;
        const cx = ((k * span) / 3 + t * (6 + k * 3)) % span - 80;
        const cy = h * (0.05 + k * 0.06);
        return (
          <Group key={k} opacity={0.85}>
            <Oval x={cx - 40} y={cy - 10} width={80} height={22} color="#fff" />
            <Oval x={cx - 18} y={cy - 22} width={44} height={28} color="#fff" />
          </Group>
        );
      })}
      <Rect x={0} y={horizon} width={w} height={beach - horizon + 40}>
        <LinearGradient start={vec(0, horizon)} end={vec(0, beach)} colors={['#2aa3b9', '#1b6f8a']} />
      </Rect>
      {[0, 1, 2, 3].map((k) => (
        <Path key={k} path={wave(w, horizon + 14 + k * ((beach - horizon) / 4.5), 2 + k, 26 + k * 6, t * (0.8 + k * 0.25) + k)} color={`rgba(255,255,255,${0.22 + k * 0.05})`} style="stroke" strokeWidth={2} />
      ))}
      <Group transform={[{ translateX: boatX }, { translateY: boatY }, { rotate: tilt }, { scale: 1.3 }]}>
        {s.upgrades.boat === 0 ? (
          <Oval x={-16} y={-8} width={32} height={16} color="#8f5229" />
        ) : (
          <Path path="M -26 -6 L 26 -6 L 18 8 L -18 8 Z" color="#8f5229" />
        )}
        {sail ? <Path path="M 0 -6 L 0 -44 L 22 -12 Z" color="#fff8ec" /> : null}
        {sail ? <Rect x={-1.5} y={-46} width={3} height={40} color="#5f3a1c" /> : null}
        <Worker x={-4} y={-4} color={C.accent} step={0} />
      </Group>
      <Oval x={-w * 0.2} y={beach - 30} width={w * 1.4} height={h} color={C.sand} />
      <Path path={wave(w, beach - 22, 3, 18, t * 1.4)} color="rgba(255,255,255,0.7)" style="stroke" strokeWidth={4} strokeCap="round" />
      <Oval x={-w * 0.1} y={beach + 40} width={w * 1.2} height={h} color={C.grass} />
      {/* palm */}
      <Path path={`M ${w * 0.16} ${beach + 60} Q ${w * 0.2} ${beach - 40} ${w * 0.26 + palmSway * 0.4} ${beach - 90}`} color="#7a5230" style="stroke" strokeWidth={9} />
      {[0, 1, 2, 3, 4].map((k) => {
        const a = -Math.PI / 2 + (k - 2) * 0.55;
        const x0 = w * 0.26 + palmSway * 0.4;
        const y0 = beach - 90;
        const sw = palmSway * (0.6 + k * 0.1);
        return <Path key={k} path={`M ${x0} ${y0} Q ${x0 + Math.cos(a) * 40 + sw} ${y0 + Math.sin(a) * 40 - 10} ${x0 + Math.cos(a) * 70 + sw} ${y0 + Math.sin(a) * 70 + 18}`} color="#4f9a48" style="stroke" strokeWidth={10} strokeCap="round" />;
      })}
      {/* Bà Năm's hut */}
      <House x={w * 0.74} y={beach + 50} size={w * 0.28} wall="#e8c58a" roof="#c0392b" />
      {dogPresent(s) ? <Dog x={w * 0.58 + Math.sin(t * 0.5) * 8} y={beach + 108} t={t} /> : null}
      {kinds.map((id, i) => {
        const p = slot(i);
        const lk = LOOK[id];
        if (id === 'saltfield') return <SaltPans key={id} x={p.x} y={p.y} size={size} t={t} />;
        if (id === 'lantern') return <Lanterns key={id} x={p.x} y={p.y} size={size} t={t} />;
        return <House key={id} x={p.x} y={p.y} size={size} wall={lk.wall} roof={lk.roof} tall={lk.tall} />;
      })}
      {staff.map((st, i) => {
        // each worker strolls along the path between the two rows, at their own pace
        const speed = 0.12 + (st.uid % 5) * 0.03;
        const k = (Math.sin(t * speed + st.uid) + 1) / 2;
        const x = w * 0.08 + k * w * 0.84;
        const y = (rowY[0] + rowY[1]) / 2 + 6 + (i % 3) * 8;
        return <Worker key={st.uid} x={x} y={y} color={ROLE_COLOR[st.role]} step={t * 8 + i} />;
      })}
    </Canvas>
  );
}
