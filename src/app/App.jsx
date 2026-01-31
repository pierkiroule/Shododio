import { useEffect, useMemo, useRef, useState } from "react";

const MAX_ENERGY = 100;
const ENERGY_STEP = 2.6;
const paletteColors = [
  { key: "obsidienne", name: "Obsidienne", color: "#1b2233" },
  { key: "vermilion", name: "Vermillon", color: "#cc5a3f" },
  { key: "cendre", name: "Cendre", color: "#6b7c8f" }
];

const normalizePalette = (palette) => {
  const total = Object.values(palette).reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return {
      obsidienne: 40,
      vermilion: 35,
      cendre: 25
    };
  }
  const factor = 100 / total;
  return Object.fromEntries(
    Object.entries(palette).map(([key, value]) => [key, Math.round(value * factor)])
  );
};

const App = () => {
  const canvasWrapRef = useRef(null);
  const inkCanvasRef = useRef(null);
  const gestureCanvasRef = useRef(null);
  const animationRef = useRef(null);
  const audioPulseRef = useRef(0.2);
  const energyRef = useRef(40);
  const gesturePointsRef = useRef([]);

  const [energy, setEnergy] = useState(40);
  const [isCharging, setIsCharging] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [audioPulse, setAudioPulse] = useState(0.2);
  const [palette, setPalette] = useState({
    obsidienne: 40,
    vermilion: 35,
    cendre: 25
  });
  const [gestureMetrics, setGestureMetrics] = useState({ points: 0, distance: 0 });

  useEffect(() => {
    energyRef.current = energy;
  }, [energy]);

  useEffect(() => {
    audioPulseRef.current = audioPulse;
  }, [audioPulse]);

  useEffect(() => {
    let tick = 0;
    const interval = window.setInterval(() => {
      tick += 0.2;
      const base = isCharging || isLaunching ? 0.35 : 0.15;
      const pulse = base + Math.abs(Math.sin(tick)) * 0.4 + Math.random() * 0.2;
      setAudioPulse(pulse);
    }, 120);
    return () => window.clearInterval(interval);
  }, [isCharging, isLaunching]);

  useEffect(() => {
    if (!isCharging) {
      return undefined;
    }
    const interval = window.setInterval(() => {
      setEnergy((current) => Math.min(MAX_ENERGY, current + ENERGY_STEP + Math.random() * 1.4));
    }, 110);
    return () => window.clearInterval(interval);
  }, [isCharging]);

  useEffect(() => {
    const handleResize = () => {
      const wrap = canvasWrapRef.current;
      const inkCanvas = inkCanvasRef.current;
      const gestureCanvas = gestureCanvasRef.current;
      if (!wrap || !inkCanvas || !gestureCanvas) {
        return;
      }
      const { width, height } = wrap.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      [inkCanvas, gestureCanvas].forEach((canvas) => {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        const context = canvas.getContext("2d");
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
      });
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const paletteWithEnergy = useMemo(() => {
    return paletteColors.map((item) => ({
      ...item,
      energy: Math.round((energy * palette[item.key]) / 100)
    }));
  }, [energy, palette]);

  const clearGestureLayer = () => {
    const gestureCanvas = gestureCanvasRef.current;
    if (!gestureCanvas) return;
    const ctx = gestureCanvas.getContext("2d");
    ctx.clearRect(0, 0, gestureCanvas.width, gestureCanvas.height);
  };

  const clearInkLayer = () => {
    const inkCanvas = inkCanvasRef.current;
    if (!inkCanvas) return;
    const ctx = inkCanvas.getContext("2d");
    ctx.clearRect(0, 0, inkCanvas.width, inkCanvas.height);
  };

  const computeGestureMetrics = (points) => {
    if (points.length < 2) {
      return { points: points.length, distance: 0 };
    }
    const distance = points.slice(1).reduce((acc, point, index) => {
      const prev = points[index];
      const dx = point.x - prev.x;
      const dy = point.y - prev.y;
      return acc + Math.hypot(dx, dy);
    }, 0);
    return { points: points.length, distance: Math.round(distance) };
  };

  const handlePointerDown = (event) => {
    if (isLaunching) return;
    const wrap = canvasWrapRef.current;
    if (!wrap) return;
    wrap.setPointerCapture(event.pointerId);
    const rect = wrap.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const points = [point];
    gesturePointsRef.current = points;
    clearGestureLayer();
    drawGesture(points);
    setGestureMetrics(computeGestureMetrics(points));
  };

  const handlePointerMove = (event) => {
    if (isLaunching) return;
    if (!event.buttons) return;
    const wrap = canvasWrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    gesturePointsRef.current = [...gesturePointsRef.current, point];
    drawGesture(gesturePointsRef.current);
    setGestureMetrics(computeGestureMetrics(gesturePointsRef.current));
  };

  const handlePointerUp = (event) => {
    const wrap = canvasWrapRef.current;
    if (wrap && wrap.hasPointerCapture(event.pointerId)) {
      wrap.releasePointerCapture(event.pointerId);
    }
  };

  const drawGesture = (points) => {
    const gestureCanvas = gestureCanvasRef.current;
    if (!gestureCanvas) return;
    const ctx = gestureCanvas.getContext("2d");
    ctx.clearRect(0, 0, gestureCanvas.width, gestureCanvas.height);
    if (points.length < 2) return;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(27, 34, 51, 0.35)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.stroke();
  };

  const handlePaletteChange = (key, value) => {
    const next = normalizePalette({ ...palette, [key]: value });
    setPalette(next);
  };

  const handleLaunch = () => {
    if (isLaunching) return;
    const points = gesturePointsRef.current;
    if (!points || points.length < 2) return;
    if (energyRef.current <= 0) return;
    setIsLaunching(true);
    animateInk(points);
  };

  const animateInk = (points) => {
    const inkCanvas = inkCanvasRef.current;
    if (!inkCanvas) return;
    const ctx = inkCanvas.getContext("2d");
    let progress = 0;
    const totalSegments = points.length - 1;
    const speed = Math.max(1, Math.floor(points.length / 80));
    const paletteWeights = paletteColors.map((item) => palette[item.key]);
    const totalWeight = paletteWeights.reduce((sum, value) => sum + value, 0) || 1;

    const pickColor = (ratio) => {
      const target = ratio * totalWeight;
      let cumulative = 0;
      for (let i = 0; i < paletteColors.length; i += 1) {
        cumulative += paletteWeights[i];
        if (target <= cumulative) {
          return paletteColors[i].color;
        }
      }
      return paletteColors[0].color;
    };

    const drawSplash = (point) => {
      const droplets = Math.round(8 + energyRef.current / 10);
      for (let i = 0; i < droplets; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * 18;
        ctx.fillStyle = `${pickColor(Math.random())}55`;
        ctx.beginPath();
        ctx.arc(
          point.x + Math.cos(angle) * radius,
          point.y + Math.sin(angle) * radius,
          Math.random() * 3 + 1,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    };

    const step = () => {
      if (progress >= totalSegments) {
        setIsLaunching(false);
        setEnergy(0);
        drawSplash(points[points.length - 1]);
        return;
      }
      const pulse = audioPulseRef.current;
      for (let i = 0; i < speed && progress < totalSegments; i += 1) {
        const start = points[progress];
        const end = points[progress + 1];
        const ratio = progress / totalSegments;
        const weight = 6 + pulse * 6 + (energyRef.current / MAX_ENERGY) * 8;
        const alpha = Math.round(140 + pulse * 90)
          .toString(16)
          .padStart(2, "0");
        ctx.strokeStyle = `${pickColor(ratio)}${alpha}`;
        ctx.lineWidth = weight;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x + (Math.random() - 0.5) * pulse * 3, end.y + (Math.random() - 0.5) * pulse * 3);
        ctx.stroke();
        if (Math.random() < 0.2 + pulse * 0.2) {
          drawSplash(end);
        }
        progress += 1;
      }
      animationRef.current = window.requestAnimationFrame(step);
    };

    animationRef.current = window.requestAnimationFrame(step);
  };

  const handleReset = () => {
    if (animationRef.current) {
      window.cancelAnimationFrame(animationRef.current);
    }
    setIsLaunching(false);
    setEnergy(40);
    clearInkLayer();
    clearGestureLayer();
    gesturePointsRef.current = [];
    setGestureMetrics({ points: 0, distance: 0 });
  };

  return (
    <div className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">Rituel de dessin audioreactif</p>
          <h1>Kaï du Shodo</h1>
          <p className="lead">
            Posez un geste, invoquez un cri, puis laissez l&apos;encre traduire l&apos;énergie du
            Kaï en traces vibrantes et asynchrones.
          </p>
        </div>
        <div className="energy-orb" style={{ "--pulse": audioPulse }}>
          <span>{Math.round(energy)}%</span>
          <small>Énergie du cri</small>
        </div>
      </header>

      <main className="layout">
        <section className="control-panel">
          <div className="step">
            <h2>1. Déclencher le cri</h2>
            <p>
              Maintenez le bouton pour accumuler l&apos;énergie du Kaï. Relâchez pour figer
              la charge.
            </p>
            <div className="charge-row">
              <button
                className={`charge-btn ${isCharging ? "active" : ""}`}
                type="button"
                onPointerDown={() => setIsCharging(true)}
                onPointerUp={() => setIsCharging(false)}
                onPointerLeave={() => setIsCharging(false)}
              >
                {isCharging ? "Cri en cours…" : "Appuyer pour crier"}
              </button>
              <div className="meter">
                <div className="meter-fill" style={{ width: `${energy}%` }} />
              </div>
            </div>
          </div>

          <div className="step">
            <h2>2. Répartir l&apos;énergie</h2>
            <p>Distribuez la charge sonore dans la palette pour guider l&apos;encre.</p>
            <div className="palette">
              {paletteColors.map((item) => (
                <label key={item.key} className="palette-row">
                  <span className="swatch" style={{ backgroundColor: item.color }} />
                  <div>
                    <div className="palette-title">
                      {item.name}
                      <span>{palette[item.key]}%</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="90"
                      value={palette[item.key]}
                      onChange={(event) => handlePaletteChange(item.key, Number(event.target.value))}
                    />
                    <small>{paletteWithEnergy.find((entry) => entry.key === item.key)?.energy} unités</small>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="step">
            <h2>3. Poser le geste</h2>
            <p>Tracez un geste unique sur la toile pour guider la projection d&apos;encre.</p>
            <div className="gesture-meta">
              <span>{gestureMetrics.points} points</span>
              <span>{gestureMetrics.distance} px</span>
            </div>
          </div>

          <div className="step">
            <h2>4. Lancer l&apos;encre</h2>
            <p>L&apos;encre se révèle en mode audioreactif asynchrone.</p>
            <div className="action-row">
              <button className="launch-btn" type="button" onClick={handleLaunch} disabled={isLaunching}>
                {isLaunching ? "Rituel en cours…" : "Projeter l'encre"}
              </button>
              <button className="ghost-btn" type="button" onClick={handleReset}>
                Réinitialiser
              </button>
            </div>
          </div>
        </section>

        <section className="canvas-panel">
          <div
            ref={canvasWrapRef}
            className="canvas-stage"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <canvas ref={inkCanvasRef} className="ink-layer" />
            <canvas ref={gestureCanvasRef} className="gesture-layer" />
            <div className="canvas-overlay">
              <div className="pulse-bar" style={{ transform: `scaleX(${audioPulse})` }} />
              <p>
                {isLaunching
                  ? "L'encre écoute le cri…"
                  : "Tracez puis lancez pour révéler la calligraphie."}
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default App;
