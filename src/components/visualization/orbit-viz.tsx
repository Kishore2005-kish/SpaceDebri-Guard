'use client';
import { useEffect, useRef, useState } from 'react';
import { ConjunctionDTO } from '@/lib/services';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Play, Pause, SkipForward, SkipBack, Globe, Satellite as SatIcon, Crosshair } from 'lucide-react';
import { R_EARTH_KM } from '@/lib/orbital/elements';

// Top-down projection of ECI onto the X-Y plane (equatorial view).

interface Props {
  conjunction: ConjunctionDTO;
}

export function OrbitVisualization({ conjunction }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [timeIndex, setTimeIndex] = useState(60); // 0..120 (±1 hour around TCA in 1-min steps)
  const [playing, setPlaying] = useState(false);
  const [followPrimary, setFollowPrimary] = useState(true);
  const [followSecondary, setFollowSecondary] = useState(false);
  const [zoom, setZoom] = useState(1);
  const animRef = useRef<number | undefined>(undefined);

  const tca = new Date(conjunction.tca);
  const startTime = new Date(tca.getTime() - 60 * 60 * 1000);
  const endTime = new Date(tca.getTime() + 60 * 60 * 1000);

  const [primaryTrack, setPrimaryTrack] = useState<{ x: number; y: number; z: number; t: string }[]>([]);
  const [secondaryTrack, setSecondaryTrack] = useState<{ x: number; y: number; z: number; t: string }[]>([]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/orbits/${conjunction.primarySatId}?start=${startTime.toISOString()}&end=${endTime.toISOString()}&step=60`).then(r => r.json()),
      fetch(`/api/orbits/${conjunction.secondarySatId}?start=${startTime.toISOString()}&end=${endTime.toISOString()}&step=60`).then(r => r.json()),
    ]).then(([p, s]) => {
      setPrimaryTrack(p.states);
      setSecondaryTrack(s.states);
    });
  }, [conjunction.id]);

  // Play / pause animation
  useEffect(() => {
    if (!playing) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }
    let last = performance.now();
    const tick = (now: number) => {
      if (now - last > 80) {
        last = now;
        setTimeIndex(i => (i + 1) % 121);
      }
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [playing]);

  // Draw function (defined as a stable callback)
  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (cssW === 0 || cssH === 0) {
      // Layout not ready — retry in 100ms
      setTimeout(draw, 100);
      return;
    }
    canvas.width = cssW * 2;
    canvas.height = cssH * 2;
    ctx.setTransform(2, 0, 0, 2, 0, 0); // scale for high-DPI

    const cw = cssW;
    const ch = cssH;

    // View bounds. Center on the followed object.
    const px = conjunction.primaryState.x;
    const py = conjunction.primaryState.y;
    const sx = conjunction.secondaryState.x;
    const sy = conjunction.secondaryState.y;
    const cx = followSecondary ? sx : px;
    const cy = followSecondary ? sy : py;
    const baseScale = 0.05; // km -> px base
    const scale = baseScale * zoom;

    // Clear with dark background
    ctx.fillStyle = '#0a0e16';
    ctx.fillRect(0, 0, cw, ch);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 0.5;
    const gridSize = 40;
    for (let gx = ((-cx * scale) % gridSize + gridSize) % gridSize; gx < cw; gx += gridSize) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, ch); ctx.stroke();
    }
    for (let gy = ((-cy * scale) % gridSize + gridSize) % gridSize; gy < ch; gy += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(cw, gy); ctx.stroke();
    }

    // Centered view origin: (cw/2, ch/2) corresponds to (cx, cy) in km
    const ox = cw / 2;
    const oy = ch / 2;
    const kmToPx = (xKm: number, yKm: number) => ({
      x: ox + (xKm - cx) * scale,
      y: oy + (yKm - cy) * scale,
    });

    // Earth (centered at origin 0,0 in km, so at view position ox - cx*scale, oy - cy*scale)
    const earthPos = kmToPx(0, 0);
    const earthR = R_EARTH_KM * scale;
    if (earthR > 1) {
      ctx.fillStyle = '#0f1c2e';
      ctx.strokeStyle = '#1e3a5f';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(earthPos.x, earthPos.y, earthR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Latitude lines (decorative)
      ctx.strokeStyle = 'rgba(80,140,200,0.15)';
      for (let lat = -60; lat <= 60; lat += 30) {
        const r = earthR * Math.cos(lat * Math.PI / 180);
        const yOff = -earthR * Math.sin(lat * Math.PI / 180);
        ctx.beginPath();
        ctx.ellipse(earthPos.x, earthPos.y + yOff, r, r * 0.15, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Orbit tracks
    const drawTrack = (track: { x: number; y: number }[], color: string) => {
      if (track.length === 0) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      track.forEach((p, i) => {
        const screen = kmToPx(p.x, p.y);
        if (i === 0) ctx.moveTo(screen.x, screen.y);
        else ctx.lineTo(screen.x, screen.y);
      });
      ctx.stroke();
    };
    drawTrack(primaryTrack.map(p => ({ x: p.x, y: p.y })), 'rgba(120, 220, 150, 0.5)');
    drawTrack(secondaryTrack.map(p => ({ x: p.x, y: p.y })), 'rgba(255, 180, 80, 0.5)');

    // Current positions at timeIndex
    const pIdx = Math.min(primaryTrack.length - 1, timeIndex);
    const sIdx = Math.min(secondaryTrack.length - 1, timeIndex);
    if (pIdx >= 0 && primaryTrack[pIdx]) {
      const p = primaryTrack[pIdx];
      const screen = kmToPx(p.x, p.y);
      // Satellite marker
      ctx.fillStyle = '#5ee695';
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#5ee695';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(screen.x, screen.y, 8, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#5ee695';
      ctx.font = '10px monospace';
      ctx.fillText(conjunction.primaryName, screen.x + 10, screen.y - 6);
    }
    if (sIdx >= 0 && secondaryTrack[sIdx]) {
      const p = secondaryTrack[sIdx];
      const screen = kmToPx(p.x, p.y);
      ctx.fillStyle = '#ffb450';
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffb450';
      ctx.beginPath(); ctx.arc(screen.x, screen.y, 7, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffb450';
      ctx.font = '10px monospace';
      ctx.fillText(conjunction.secondaryName, screen.x + 10, screen.y + 12);
    }

    // Closest-approach line at TCA (index 60 = center)
    const tcaIdx = 60;
    if (primaryTrack[tcaIdx] && secondaryTrack[tcaIdx]) {
      const p = primaryTrack[tcaIdx];
      const s = secondaryTrack[tcaIdx];
      const pScreen = kmToPx(p.x, p.y);
      const sScreen = kmToPx(s.x, s.y);
      ctx.strokeStyle = timeIndex === tcaIdx ? '#ff5050' : 'rgba(255,80,80,0.4)';
      ctx.lineWidth = timeIndex === tcaIdx ? 1.5 : 0.8;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(pScreen.x, pScreen.y);
      ctx.lineTo(sScreen.x, sScreen.y);
      ctx.stroke();
      ctx.setLineDash([]);
      if (timeIndex === tcaIdx) {
        const midX = (pScreen.x + sScreen.x) / 2;
        const midY = (pScreen.y + sScreen.y) / 2;
        ctx.fillStyle = '#ff5050';
        ctx.font = 'bold 11px monospace';
        const distLabel = conjunction.minRange < 1
          ? `${(conjunction.minRange * 1000).toFixed(0)} m`
          : `${conjunction.minRange.toFixed(3)} km`;
        ctx.fillText(distLabel, midX + 8, midY - 6);
      }
    }
  };

  // Trigger draw on every render that affects the canvas
  useEffect(() => {
    const raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  });

  // Re-draw on window resize
  useEffect(() => {
    const handler = () => setZoom(z => Math.max(0.01, z + 0.0001));
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const tcaTimeStr = (() => {
    const t = new Date(startTime.getTime() + timeIndex * 60 * 1000);
    return t.toISOString().slice(11, 19) + 'Z';
  })();

  return (
    <div className="bg-[#0a0e16]">
      <canvas ref={canvasRef} className="w-full h-[300px] block" />
      <div className="border-t border-border px-3 py-2 flex items-center gap-2 flex-wrap text-[10px] font-mono">
        <Button size="sm" variant="ghost" onClick={() => setTimeIndex(0)} className="h-7 w-7 p-0"><SkipBack className="h-3 w-3" /></Button>
        <Button size="sm" variant="ghost" onClick={() => setPlaying(!playing)} className="h-7 w-7 p-0">{playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}</Button>
        <Button size="sm" variant="ghost" onClick={() => setTimeIndex(120)} className="h-7 w-7 p-0"><SkipForward className="h-3 w-3" /></Button>
        <Button size="sm" variant="ghost" onClick={() => setTimeIndex(60)} className="font-mono text-[10px] gap-1 h-7">
          <Crosshair className="h-3 w-3" /> TCA
        </Button>
        <div className="flex-1 min-w-[120px] px-2">
          <Slider value={[timeIndex]} onValueChange={(v) => setTimeIndex(v[0])} min={0} max={120} step={1} />
        </div>
        <div className="text-primary tnum">{tcaTimeStr}</div>
        <div className="flex items-center gap-1 ml-2">
          <Button size="sm" variant={followPrimary ? 'default' : 'outline'} onClick={() => { setFollowPrimary(true); setFollowSecondary(false); }} className="font-mono text-[10px] h-7 gap-1">
            <SatIcon className="h-3 w-3" /> PRIMARY
          </Button>
          <Button size="sm" variant={followSecondary ? 'default' : 'outline'} onClick={() => { setFollowSecondary(true); setFollowPrimary(false); }} className="font-mono text-[10px] h-7 gap-1">
            <Globe className="h-3 w-3" /> DEBRIS
          </Button>
        </div>
        <div className="flex items-center gap-1 ml-2">
          <span className="text-muted-foreground">ZOOM</span>
          <Slider value={[zoom * 100]} onValueChange={(v) => setZoom(v[0] / 100)} min={20} max={500} step={10} className="w-20" />
          <span className="tnum w-8 text-right">{zoom.toFixed(1)}×</span>
        </div>
      </div>
    </div>
  );
}
