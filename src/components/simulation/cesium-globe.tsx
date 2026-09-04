'use client';
import { useEffect, useRef, useState } from 'react';
import type * as CesiumType from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

// Use `import type` so TypeScript erases this at compile time.
// At runtime we dynamic-import the actual library inside the effect,
// which (a) avoids bundling every Cesium submodule eagerly, and (b)
// sidesteps the Turbopack ChunkLoadError on Cesium3DTileset etc.
type Cesium = typeof CesiumType;

interface TrajectoryPoint {
  t: string; x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
}

interface Props {
  primaryTrajectory: TrajectoryPoint[];
  secondaryTrajectory: TrajectoryPoint[];
  primaryName: string;
  secondaryName: string;
  tca: string;
  minimumRangeKm: number;
}

// Singleton promise so we only ever load Cesium once, even if the
// component mounts/unmounts repeatedly.
let cesiumPromise: Promise<Cesium> | null = null;
function loadCesium(): Promise<Cesium> {
  if (!cesiumPromise) {
    cesiumPromise = import('cesium').then(m => (m as unknown) as Cesium);
  }
  return cesiumPromise;
}

export function CesiumGlobe({
  primaryTrajectory,
  secondaryTrajectory,
  primaryName,
  secondaryName,
  tca,
  minimumRangeKm,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<CesiumType.Viewer | null>(null);
  const cesiumRef = useRef<Cesium | null>(null);
  const tickListenerRef = useRef<((clock: CesiumType.Clock) => void) | null>(null);
  const primaryPositionRef = useRef<CesiumType.SampledPositionProperty | null>(null);
  const secondaryPositionRef = useRef<CesiumType.SampledPositionProperty | null>(null);

  // Live state mirrors — used inside the tick callback so it always sees
  // the latest value without re-creating the listener.
  const playingRef = useRef(false);
  const speedRef = useRef(1);
  const cameraModeRef = useRef<'ORBIT' | 'ENCOUNTER' | 'FOLLOW_PRIMARY' | 'FOLLOW_SECONDARY'>('ORBIT');

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [cameraMode, setCameraMode] = useState<'ORBIT' | 'ENCOUNTER' | 'FOLLOW_PRIMARY' | 'FOLLOW_SECONDARY'>('ORBIT');
  const [currentTime, setCurrentTime] = useState('--:--:--');
  const [tcaCountdown, setTcaCountdown] = useState('--');
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Mirror state → refs whenever it changes
  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { cameraModeRef.current = cameraMode; }, [cameraMode]);

  // --- Initialization (client-only, dynamically loads Cesium) ---
  useEffect(() => {
    let cancelled = false;
    let initTimer: ReturnType<typeof setTimeout> | null = null;

    if (!containerRef.current) return;
    const container = containerRef.current;

    initTimer = setTimeout(() => {
      loadCesium().then(Cesium => {
        if (cancelled || !containerRef.current) return;
        try {
          (window as any).CESIUM_BASE_URL = '/cesium';
          const viewer = new Cesium.Viewer(container, {
            animation: false,
            timeline: false,
            baseLayerPicker: false,
            fullscreenButton: false,
            geocoder: false,
            homeButton: false,
            sceneModePicker: false,
            navigationHelpButton: false,
            selectionIndicator: false,
            infoBox: false,
            creditContainer: document.createElement('div'),
            baseLayer: false,
          });
          if (cancelled) {
            try { viewer.destroy(); } catch {}
            return;
          }
          viewerRef.current = viewer;
          cesiumRef.current = Cesium;

          viewer.imageryLayers.addImageryProvider(
            new Cesium.UrlTemplateImageryProvider({
              url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
              maximumLevel: 18,
            })
          );
          viewer.scene.globe.enableLighting = true;
          setReady(true);
        } catch (e) {
          console.error('Cesium init failed:', e);
          setLoadError(e instanceof Error ? e.message : String(e));
        }
      }).catch(e => {
        console.error('Cesium module load failed:', e);
        setLoadError(e instanceof Error ? e.message : String(e));
      });
    }, 100);

    return () => {
      cancelled = true;
      if (initTimer) clearTimeout(initTimer);
      // Clean up tick listener before destroying
      const viewer = viewerRef.current;
      const tickListener = tickListenerRef.current;
      if (viewer && tickListener) {
        try { viewer.clock.onTick.removeEventListener(tickListener); } catch {}
      }
      tickListenerRef.current = null;
      if (viewer) {
        try { viewer.destroy(); } catch {}
        viewerRef.current = null;
      }
      cesiumRef.current = null;
      setReady(false);
    };
  }, []);

  // --- Apply playing state to clock (without re-running entity effect) ---
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.clock.shouldAnimate = playingRef.current;
  }, [playing]);

  // --- Apply speed state to clock (without re-running entity effect) ---
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.clock.multiplier = speedRef.current;
  }, [speed]);

  // --- Entities + tick callback (only re-runs on data change) ---
  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium || !ready) return;
    if (!primaryTrajectory?.length || !secondaryTrajectory?.length) return;

    // Remove old tick listener
    if (tickListenerRef.current) {
      try { viewer.clock.onTick.removeEventListener(tickListenerRef.current); } catch {}
      tickListenerRef.current = null;
    }

    viewer.entities.removeAll();

    const startJulian = Cesium.JulianDate.fromIso8601(primaryTrajectory[0].t);
    const endJulian = Cesium.JulianDate.fromIso8601(primaryTrajectory[primaryTrajectory.length - 1].t);

    viewer.clock.startTime = startJulian.clone();
    viewer.clock.stopTime = endJulian.clone();
    viewer.clock.currentTime = startJulian.clone();
    viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
    viewer.clock.multiplier = speedRef.current;
    viewer.clock.shouldAnimate = playingRef.current;

    function toCartesian3(point: TrajectoryPoint): CesiumType.Cartesian3 {
      return new Cesium!.Cartesian3(point.x * 1000, point.y * 1000, point.z * 1000);
    }

    const primaryPosition = new Cesium.SampledPositionProperty();
    for (const p of primaryTrajectory) {
      primaryPosition.addSample(Cesium.JulianDate.fromIso8601(p.t), toCartesian3(p));
    }
    const secondaryPosition = new Cesium.SampledPositionProperty();
    for (const p of secondaryTrajectory) {
      secondaryPosition.addSample(Cesium.JulianDate.fromIso8601(p.t), toCartesian3(p));
    }
    primaryPositionRef.current = primaryPosition;
    secondaryPositionRef.current = secondaryPosition;

    // Primary satellite
    viewer.entities.add({
      name: primaryName,
      position: primaryPosition,
      point: { pixelSize: 8, color: Cesium.Color.fromCssColorString('#5ee695'), outlineColor: Cesium.Color.WHITE, outlineWidth: 2 },
      label: { text: primaryName, font: '12px monospace', fillColor: Cesium.Color.fromCssColorString('#5ee695'), outlineColor: Cesium.Color.BLACK, outlineWidth: 2, style: Cesium.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cesium.Cartesian2(15, -10) },
    });

    // Secondary object
    viewer.entities.add({
      name: secondaryName,
      position: secondaryPosition,
      point: { pixelSize: 6, color: Cesium.Color.fromCssColorString('#ffb450'), outlineColor: Cesium.Color.WHITE, outlineWidth: 2 },
      label: { text: secondaryName, font: '12px monospace', fillColor: Cesium.Color.fromCssColorString('#ffb450'), outlineColor: Cesium.Color.BLACK, outlineWidth: 2, style: Cesium.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cesium.Cartesian2(15, 15) },
    });

    // Orbit tracks
    viewer.entities.add({
      name: `${primaryName} Orbit`,
      polyline: { positions: primaryTrajectory.map(toCartesian3), width: 1.5, material: Cesium.Color.fromCssColorString('rgba(94, 230, 149, 0.5)') },
    });
    viewer.entities.add({
      name: `${secondaryName} Orbit`,
      polyline: { positions: secondaryTrajectory.map(toCartesian3), width: 1.5, material: Cesium.Color.fromCssColorString('rgba(255, 180, 80, 0.5)') },
    });

    // TCA — find nearest sample by timestamp
    const tcaTime = new Date(tca);
    const tcaMs = tcaTime.getTime();
    let nearestPIdx = 0, nearestPDiff = Infinity;
    for (let i = 0; i < primaryTrajectory.length; i++) {
      const d = Math.abs(new Date(primaryTrajectory[i].t).getTime() - tcaMs);
      if (d < nearestPDiff) { nearestPDiff = d; nearestPIdx = i; }
    }
    let nearestSIdx = 0, nearestSDiff = Infinity;
    for (let i = 0; i < secondaryTrajectory.length; i++) {
      const d = Math.abs(new Date(secondaryTrajectory[i].t).getTime() - tcaMs);
      if (d < nearestSDiff) { nearestSDiff = d; nearestSIdx = i; }
    }

    // Minimum separation line
    if (primaryTrajectory[nearestPIdx] && secondaryTrajectory[nearestSIdx]) {
      const pPos = toCartesian3(primaryTrajectory[nearestPIdx]);
      const sPos = toCartesian3(secondaryTrajectory[nearestSIdx]);
      viewer.entities.add({
        name: 'Minimum Separation',
        polyline: { positions: [pPos, sPos], width: 2, material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.2, color: Cesium.Color.fromCssColorString('#ff5050') }) },
        label: { text: minimumRangeKm < 1 ? `${(minimumRangeKm * 1000).toFixed(0)} m` : `${minimumRangeKm.toFixed(3)} km`, font: 'bold 14px monospace', fillColor: Cesium.Color.fromCssColorString('#ff5050'), outlineColor: Cesium.Color.BLACK, outlineWidth: 2, style: Cesium.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cesium.Cartesian2(20, -20) },
      });

      const mid = Cesium.Cartesian3.lerp(pPos, sPos, 0.5, new Cesium.Cartesian3());
      if (mid) {
        viewer.entities.add({
          name: 'TCA', position: mid,
          point: { pixelSize: 10, color: Cesium.Color.fromCssColorString('#ff5050').withAlpha(0.5), outlineColor: Cesium.Color.fromCssColorString('#ff5050'), outlineWidth: 2 },
          label: { text: 'TCA', font: 'bold 12px monospace', fillColor: Cesium.Color.fromCssColorString('#ff5050'), outlineColor: Cesium.Color.BLACK, outlineWidth: 2, style: Cesium.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cesium.Cartesian2(20, -25) },
        });
      }
    }

    // Fly to full Earth
    viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(0, 0, 20000000), duration: 2 });

    // Tick callback — reads live state from refs so it never goes stale.
    const tickFn = (clock: CesiumType.Clock) => {
      const date = Cesium!.JulianDate.toDate(clock.currentTime);
      setCurrentTime(date.toISOString().slice(11, 19) + 'Z');

      const diff = tcaTime.getTime() - date.getTime();
      if (diff > 0) {
        setTcaCountdown(`T-${Math.floor(diff / 3600000)}h ${Math.floor((diff % 3600000) / 60000)}m`);
      } else {
        const ad = Math.abs(diff);
        setTcaCountdown(`T+${Math.floor(ad / 3600000)}h ${Math.floor((ad % 3600000) / 60000)}m`);
      }

      const cm = cameraModeRef.current;
      if (cm === 'FOLLOW_PRIMARY') {
        const pos = primaryPosition.getValue(clock.currentTime);
        if (pos) viewer.camera.lookAt(pos, new Cesium!.HeadingPitchRange(0, Cesium!.Math.toRadians(-45), 500000));
      } else if (cm === 'FOLLOW_SECONDARY') {
        const pos = secondaryPosition.getValue(clock.currentTime);
        if (pos) viewer.camera.lookAt(pos, new Cesium!.HeadingPitchRange(0, Cesium!.Math.toRadians(-45), 500000));
      }

      if (playingRef.current && Math.abs(diff) < 2000 && speedRef.current > 0) {
        setPlaying(false);
      }
    };
    tickListenerRef.current = tickFn;
    viewer.clock.onTick.addEventListener(tickFn);

    // No explicit cleanup return — the init useEffect's destroy() and the
    // next run of THIS effect both remove the old listener at the top.
    // This avoids the "viewer.clock is undefined" crash when the viewer
    // has already been destroyed by React Strict Mode double-mount.
  }, [primaryTrajectory, secondaryTrajectory, tca, minimumRangeKm, primaryName, secondaryName, ready]);

  // --- Camera helpers ---
  function flyToEncounter() {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium || !primaryTrajectory?.length) return;
    const tcaTime = new Date(tca);
    let nearestIdx = 0, nearestDiff = Infinity;
    for (let i = 0; i < primaryTrajectory.length; i++) {
      const d = Math.abs(new Date(primaryTrajectory[i].t).getTime() - tcaTime.getTime());
      if (d < nearestDiff) { nearestDiff = d; nearestIdx = i; }
    }
    const pos = new Cesium.Cartesian3(primaryTrajectory[nearestIdx].x * 1000, primaryTrajectory[nearestIdx].y * 1000, primaryTrajectory[nearestIdx].z * 1000);
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.add(pos, new Cesium.Cartesian3(100000, 100000, 100000), new Cesium.Cartesian3()),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-45), roll: 0 },
      duration: 2,
    });
  }

  function resetCamera() {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium) return;
    viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(0, 0, 20000000), duration: 2 });
    setCameraMode('ORBIT');
  }

  function jumpToTca() {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium) return;
    try {
      const tcaJulian = Cesium.JulianDate.fromIso8601(tca);
      viewer.clock.currentTime = tcaJulian.clone();
    } catch {}
    setPlaying(false);
    flyToEncounter();
  }

  function jumpNow() {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium) return;
    try {
      viewer.clock.currentTime = Cesium.JulianDate.now();
    } catch {}
  }

  const SPEEDS = [0.25, 1, 10, 100, 1000];

  return (
    <div className="relative w-full h-full bg-black">
      <div ref={containerRef} className="w-full h-full" />

      {ready && (
        <div className="absolute top-3 left-3 z-10 bg-black/70 backdrop-blur rounded px-3 py-2 font-mono text-[10px] space-y-0.5 pointer-events-none">
          <div className="text-emerald-400">SIM TIME: {currentTime}</div>
          <div className="text-red-400">TCA: {tca ? new Date(tca).toISOString().slice(11, 19) + 'Z' : '--'}</div>
          <div className={tcaCountdown.startsWith('T-') ? 'text-emerald-400' : 'text-red-400'}>COUNTDOWN: {tcaCountdown}</div>
          <div className="text-amber-400 mt-1">ENGINE: SGP4</div>
        </div>
      )}

      {ready && (
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
          {(['ORBIT', 'ENCOUNTER', 'FOLLOW_PRIMARY', 'FOLLOW_SECONDARY'] as const).map(mode => (
            <button key={mode} onClick={() => { setCameraMode(mode); if (mode === 'ORBIT') resetCamera(); if (mode === 'ENCOUNTER') flyToEncounter(); }}
              className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors ${cameraMode === mode ? 'bg-primary text-primary-foreground border-primary' : 'bg-black/70 text-muted-foreground border-border hover:bg-muted/40'}`}>
              {mode.replace('_', ' ')}
            </button>
          ))}
          <button onClick={resetCamera} className="px-2 py-1 text-[9px] font-mono rounded border border-border bg-black/70 text-muted-foreground hover:bg-muted/40">RESET</button>
        </div>
      )}

      {ready && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-black/70 backdrop-blur rounded px-3 py-2">
          <button onClick={() => { setPlaying(false); jumpNow(); }} className="text-[10px] font-mono text-muted-foreground hover:text-foreground">NOW</button>
          <button onClick={jumpToTca} className="px-3 py-1 text-[10px] font-mono font-bold rounded border border-red-500/40 bg-red-500/10 text-red-400">JUMP TO TCA</button>
          <button onClick={() => setPlaying(p => !p)} className="px-3 py-1 text-[11px] font-mono rounded border border-border hover:bg-muted/40">
            {playing ? '⏸ PAUSE' : '▶ PLAY'}
          </button>
          <div className="flex items-center gap-1 ml-2">
            {SPEEDS.map(s => (
              <button key={s} onClick={() => setSpeed(s)}
                className={`px-1.5 py-0.5 text-[9px] font-mono rounded ${speed === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/40'}`}>
                {s}x
              </button>
            ))}
          </div>
        </div>
      )}

      {!ready && !loadError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-emerald-400 font-mono text-sm animate-pulse">● Loading 3D Globe…</div>
            <div className="text-muted-foreground font-mono text-[10px] mt-1">Initializing CesiumJS</div>
          </div>
        </div>
      )}

      {loadError && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <div className="text-red-400 font-mono text-sm mb-2">⚠ Globe initialization failed</div>
            <div className="text-muted-foreground font-mono text-[10px] mt-1 break-words">{loadError}</div>
            <div className="text-muted-foreground font-mono text-[10px] mt-3">Falling back to 2D trajectory chart (left panel) — the 3D globe is optional.</div>
          </div>
        </div>
      )}
    </div>
  );
}
