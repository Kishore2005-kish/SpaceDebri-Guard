'use client';
import { useEffect, useRef, useState } from 'react';
import { TrajectoryPoint } from '@/lib/stk/types';

interface Props {
  primaryTrajectory: TrajectoryPoint[];
  secondaryTrajectory: TrajectoryPoint[];
  primaryName: string;
  secondaryName: string;
  tca: string;
  minimumRangeKm: number;
}

/**
 * Large 3D-style simulation visualization.
 *
 * Renders Earth + primary satellite + secondary object + their orbit tracks
 * + closest-approach vector, animated along the propagated trajectory.
 *
 * Per the user's instructions:
 *   "The animation must be generated from actual propagated state vectors.
 *    Do NOT animate two arbitrary dots moving toward each other."
 *
 * The trajectory data comes from /api/simulation/[id]/trajectory, which
 * returns SGP4 (or STK) propagated state vectors. Every point in the
 * animation corresponds to a real propagated state at that time.
 */
export function SimulationViz({
  primaryTrajectory,
  secondaryTrajectory,
  primaryName,
  secondaryName,
  tca,
  minimumRangeKm,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [timeIndex, setTimeIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [zoom, setZoom] = useState(1);
  const animRef = useRef<number | undefined>(undefined);

  const totalSteps = Math.min(primaryTrajectory.length, secondaryTrajectory.length);
  const tcaIdx = totalSteps > 0 ? Math.floor(totalSteps / 2) : 0; // TCA is at the middle of the ±1h window

  // Play / pause animation
  useEffect(() => {
    if (!playing || totalSteps === 0) return;
    let last = performance.now();
    const tick = (now: number) => {
      if (now - last > 80) {
        last = now;
        setTimeIndex(i => (i + 1) % totalSteps);
      }
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [playing, totalSteps]);

  // Draw
  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      if (cssW === 0 || cssH === 0) { setTimeout(draw, 100); return; }
      canvas.width = cssW * 2;
      canvas.height = cssH * 2;
      ctx.setTransform(2, 0, 0, 2, 0, 0);
      const cw = cssW;
      const ch = cssH;

      // Background: deep space
      ctx.fillStyle = '#050a14';
      ctx.fillRect(0, 0, cw, ch);

      // Stars (decorative, deterministic)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      for (let i = 0; i < 80; i++) {
        const sx = (i * 137.5) % cw;
        const sy = (i * 73.3) % ch;
        ctx.fillRect(sx, sy, 1, 1);
      }

      if (totalSteps === 0) {
        ctx.fillStyle = '#888';
        ctx.font = '12px monospace';
        ctx.fillText('No trajectory data', cw / 2 - 60, ch / 2);
        return;
      }

      // Compute view bounds based on trajectory extents
      const allPoints = [...primaryTrajectory, ...secondaryTrajectory];
      let minR = Infinity, maxR = -Infinity;
      for (const p of allPoints) {
        const r = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
      }
      // Center on the TCA position (mid-point of the trajectories)
      const tcaP = primaryTrajectory[tcaIdx];
      const tcaS = secondaryTrajectory[tcaIdx];
      const cx = (tcaP.x + tcaS.x) / 2;
      const cy = (tcaP.y + tcaS.y) / 2;
      // Auto-scale: fit a ~50 km window around TCA (zoomed in for close approach viz)
      const viewSpanKm = 50 / zoom;
      const scale = Math.min(cw, ch) / (viewSpanKm * 2);  // km → px
      const ox = cw / 2;
      const oy = ch / 2;
      const kmToPx = (xKm: number, yKm: number) => ({
        x: ox + (xKm - cx) * scale,
        y: oy + (yKm - cy) * scale,
      });

      // Earth (zoomed out, won't be visible at zoomed-in scale, but draw it anyway)
      const earthPos = kmToPx(0, 0);
      const earthR = 6378.137 * scale;
      if (earthR > 2 && earthR < Math.max(cw, ch)) {
        ctx.fillStyle = '#0f1c2e';
        ctx.strokeStyle = '#1e3a5f';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(earthPos.x, earthPos.y, earthR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Draw orbit tracks (faint lines)
      const drawTrack = (traj: TrajectoryPoint[], color: string) => {
        if (traj.length === 0) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        traj.forEach((p, i) => {
          const screen = kmToPx(p.x, p.y);
          if (i === 0) ctx.moveTo(screen.x, screen.y);
          else ctx.lineTo(screen.x, screen.y);
        });
        ctx.stroke();
      };
      drawTrack(primaryTrajectory, 'rgba(94, 230, 149, 0.4)');
      drawTrack(secondaryTrajectory, 'rgba(255, 180, 80, 0.4)');

      // Current positions
      const pIdx = Math.min(timeIndex, primaryTrajectory.length - 1);
      const sIdx = Math.min(timeIndex, secondaryTrajectory.length - 1);
      const p = primaryTrajectory[pIdx];
      const s = secondaryTrajectory[sIdx];
      const pScreen = kmToPx(p.x, p.y);
      const sScreen = kmToPx(s.x, s.y);

      // Closest-approach line (always visible)
      ctx.strokeStyle = timeIndex === tcaIdx ? '#ff5050' : 'rgba(255, 80, 80, 0.5)';
      ctx.lineWidth = timeIndex === tcaIdx ? 2 : 1;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(pScreen.x, pScreen.y);
      ctx.lineTo(sScreen.x, sScreen.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Distance label on the closest-approach line
      const midX = (pScreen.x + sScreen.x) / 2;
      const midY = (pScreen.y + sScreen.y) / 2;
      const dist = Math.sqrt((s.x - p.x) ** 2 + (s.y - p.y) ** 2 + (s.z - p.z) ** 2);
      ctx.fillStyle = timeIndex === tcaIdx ? '#ff5050' : 'rgba(255, 80, 80, 0.8)';
      ctx.font = 'bold 11px monospace';
      const distLabel = dist < 1 ? `${(dist * 1000).toFixed(0)} m` : `${dist.toFixed(3)} km`;
      // Background pill for readability
      const labelW = ctx.measureText(distLabel).width + 8;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(midX + 6, midY - 18, labelW, 16);
      ctx.fillStyle = timeIndex === tcaIdx ? '#ff5050' : 'rgba(255, 180, 180, 0.9)';
      ctx.fillText(distLabel, midX + 10, midY - 6);
      if (timeIndex === tcaIdx) {
        ctx.fillStyle = '#ff5050';
        ctx.fillText('● MINIMUM SEPARATION', midX + 10, midY + 10);
      }

      // Primary marker (larger, with glow)
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#5ee695';
      ctx.fillStyle = '#5ee695';
      ctx.beginPath();
      ctx.arc(pScreen.x, pScreen.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#5ee695';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(pScreen.x, pScreen.y, 10, 0, Math.PI * 2);
      ctx.stroke();
      // Label
      ctx.fillStyle = '#5ee695';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(`● ${primaryName}`, pScreen.x + 14, pScreen.y - 8);
      ctx.fillStyle = 'rgba(94, 230, 149, 0.6)';
      ctx.font = '10px monospace';
      ctx.fillText(`NORAD ID: ${primaryTrajectory[0] ? '' : ''}`, pScreen.x + 14, pScreen.y + 6);

      // Secondary marker
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#ffb450';
      ctx.fillStyle = '#ffb450';
      ctx.beginPath();
      ctx.arc(sScreen.x, sScreen.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#ffb450';
      ctx.beginPath();
      ctx.arc(sScreen.x, sScreen.y, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffb450';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(`● ${secondaryName}`, sScreen.x + 14, sScreen.y + 16);

      // Time display (top-left)
      const currentTime = new Date(p.t);
      const tcaTime = new Date(tca);
      const timeStr = currentTime.toISOString().slice(11, 19) + 'Z';
      const tcaStr = tcaTime.toISOString().slice(11, 19) + 'Z';
      const tcaDiff = (tcaTime.getTime() - currentTime.getTime()) / 1000;
      const tcaDiffStr = tcaDiff > 0
        ? `T-${Math.abs(tcaDiff / 3600).toFixed(0)}h ${Math.abs((tcaDiff % 3600) / 60).toFixed(0)}m`
        : `T+${Math.abs(tcaDiff / 3600).toFixed(0)}h ${Math.abs((tcaDiff % 3600) / 60).toFixed(0)}m`;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(10, 10, 280, 70);
      ctx.fillStyle = '#5ee695';
      ctx.font = '11px monospace';
      ctx.fillText(`SIM TIME: ${timeStr}`, 18, 28);
      ctx.fillStyle = '#ff5050';
      ctx.fillText(`TCA:      ${tcaStr}`, 18, 44);
      ctx.fillStyle = tcaDiff > 0 ? '#5ee695' : '#ff5050';
      ctx.fillText(`COUNTDOWN: ${tcaDiffStr}`, 18, 60);

      // "TCA marker" indicator at the center of the trajectory when at TCA
      if (timeIndex === tcaIdx) {
        ctx.strokeStyle = '#ff5050';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc((pScreen.x + sScreen.x) / 2, (pScreen.y + sScreen.y) / 2, 30, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    };

    const raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [primaryTrajectory, secondaryTrajectory, timeIndex, tcaIdx, zoom, tca, primaryName, secondaryName]);

  // Re-draw on window resize
  useEffect(() => {
    const handler = () => setZoom(z => Math.max(0.01, z + 0.0001));
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const currentTime = totalSteps > 0 ? new Date(primaryTrajectory[Math.min(timeIndex, totalSteps - 1)].t) : null;
  const tcaTime = new Date(tca);
  const tcaDiffSec = totalSteps > 0 ? (tcaTime.getTime() - (currentTime?.getTime() ?? 0)) / 1000 : 0;
  const tcaDiffStr = tcaDiffSec > 0
    ? `T-${Math.abs(tcaDiffSec / 3600).toFixed(0)}h ${Math.abs((tcaDiffSec % 3600) / 60).toFixed(0)}m`
    : `T+${Math.abs(tcaDiffSec / 3600).toFixed(0)}h ${Math.abs((tcaDiffSec % 3600) / 60).toFixed(0)}m`;

  return (
    <div className="bg-[#050a14] flex flex-col">
      <canvas ref={canvasRef} className="w-full h-[500px] block" />
      <div className="border-t border-border px-3 py-3 flex items-center gap-2 flex-wrap text-[10px] font-mono bg-card/40">
        <button onClick={() => setPlaying(!playing)} className="px-3 py-1.5 rounded border border-border hover:bg-muted text-[11px] font-mono">
          {playing ? '⏸ PAUSE' : '▶ PLAY'}
        </button>
        <button onClick={() => setTimeIndex(0)} className="px-2 py-1.5 rounded border border-border hover:bg-muted text-[11px]">⏮ -60m</button>
        <button onClick={() => setTimeIndex(Math.max(0, tcaIdx - 10))} className="px-2 py-1.5 rounded border border-border hover:bg-muted text-[11px]">-10m</button>
        <button onClick={() => setTimeIndex(tcaIdx)} className="px-3 py-1.5 rounded border border-red-500/40 bg-red-500/10 text-red-500 text-[11px] font-bold">● JUMP TO TCA</button>
        <button onClick={() => setTimeIndex(Math.min(totalSteps - 1, tcaIdx + 10))} className="px-2 py-1.5 rounded border border-border hover:bg-muted text-[11px]">+10m</button>
        <button onClick={() => setTimeIndex(totalSteps - 1)} className="px-2 py-1.5 rounded border border-border hover:bg-muted text-[11px]">+60m ⏭</button>
        <div className="flex-1 min-w-[120px] px-2">
          <input
            type="range"
            min={0}
            max={totalSteps - 1}
            value={timeIndex}
            onChange={(e) => { setPlaying(false); setTimeIndex(parseInt(e.target.value, 10)); }}
            className="w-full"
          />
        </div>
        <div className="text-primary tnum">{currentTime ? currentTime.toISOString().slice(11, 19) + 'Z' : '—'}</div>
        <div className={tcaDiffSec > 0 ? 'text-emerald-500' : 'text-red-500'}>
          {tcaDiffStr}
        </div>
        <div className="ml-2 flex items-center gap-1">
          <span className="text-muted-foreground">ZOOM</span>
          <input type="range" min={20} max={500} step={10} value={zoom * 100} onChange={(e) => setZoom(parseInt(e.target.value, 10) / 100)} className="w-20" />
          <span className="tnum w-10 text-right">{zoom.toFixed(1)}×</span>
        </div>
      </div>
    </div>
  );
}
