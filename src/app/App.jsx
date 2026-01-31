import { useEffect, useMemo, useRef, useState } from "react";

const MAX_ENERGY = 100;
const ENERGY_STEP = 2.6;
const paletteColors = [
  { key: "obsidienne", name: "Obsidienne", color: "#1b2233" },
  { key: "vermilion", name: "Vermillon", color: "#cc5a3f" },
  { key: "cendre", name: "Cendre", color: "#6b7c8f" },
  { key: "jade", name: "Jade", color: "#3f8b82" }
];

const normalizePalette = (palette) => {
  const total = Object.values(palette).reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return {
      obsidienne: 35,
      vermilion: 30,
      cendre: 20,
      jade: 15
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
  const echoTimersRef = useRef([]);
  const audioPulseRef = useRef(0.2);
  const energyRef = useRef(40);
  const gesturePointsRef = useRef([]);

  const [energy, setEnergy] = useState(40);
  const [isCharging, setIsCharging] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [audioPulse, setAudioPulse] = useState(0.2);
  const [palette, setPalette] = useState({
    obsidienne: 35,
    vermilion: 30,
    cendre: 20,
    jade: 15
  });
  const [gestureMetrics, setGestureMetrics] = useState({ points: 0, distance: 0, speed: 0 });
  const [lastRitual, setLastRitual] = useState(null);

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
      const pulse = base + Math.abs(Math.sin(tick)) * 0.45 + Math.random() * 0.2;
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

  const hasGesture = gestureMetrics.points > 1;
  const isReadyToLaunch = energy > 5 && hasGesture && !isLaunching;

  const ritualSteps = useMemo(() => {
    return [
      {
        key: "shout",
        title: "Invoquer le cri",
        description: "Maintenez pour charger l'énergie Kaï puis relâchez.",
        status: isCharging ? "active" : energy > 5 ? "complete" : "pending"
      },
      {
        key: "palette",
        title: "Répartir l'énergie",
        description: "Distribuez la charge sur la palette vivante.",
        status: energy > 5 ? "active" : "pending"
      },
      {
        key: "gesture",
        title: "Poser le geste",
        description: "Tracez un seul mouvement pour guider l'encre.",
        status: hasGesture ? "complete" : "pending"
      },
      {
        key: "launch",
        title: "Projeter l'encre",
        description: "Relâchez l'encre audioreactive asynchrone.",
        status: isLaunching ? "active" : isReadyToLaunch ? "ready" : "pending"
      }
    ];
  }, [energy, hasGesture, isCharging, isLaunching, isReadyToLaunch]);

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
      return { points: points.length, distance: 0, speed: 0 };
    }
    let distance = 0;
    let speedSum = 0;
    points.slice(1).forEach((point, index) => {
      const prev = points[index];
      const dx = point.x - prev.x;
      const dy = point.y - prev.y;
      const stepDistance = Math.hypot(dx, dy);
      distance += stepDistance;
      speedSum += stepDistance;
    });
    return {
      points: points.length,
      distance: Math.round(distance),
      speed: Math.round(speedSum / Math.max(1, points.length - 1))
    };
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
    const gradient = ctx.createLinearGradient(points[0].x, points[0].y, points.at(-1).x, points.at(-1).y);
    gradient.addColorStop(0, "rgba(27, 34, 51, 0.25)");
    gradient.addColorStop(1, "rgba(197, 91, 61, 0.6)");
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2 + audioPulseRef.current * 2;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.stroke();
  };

  const handlePaletteChange = (key, value) => {
    const next = normalizePalette({ ...palette, [key]: value });
    setPalette(next);
  };

  const cancelEchoes = () => {
    echoTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    echoTimersRef.current = [];
  };

  const handleLaunch = () => {
    if (!isReadyToLaunch) return;
    setIsLaunching(true);
    animateInk(gesturePointsRef.current);
  };

  const animateInk = (points) => {
    const inkCanvas = inkCanvasRef.current;
    if (!inkCanvas) return;
    const ctx = inkCanvas.getContext("2d");
    let progress = 0;
    const totalSegments = points.length - 1;
    const speed = Math.max(1, Math.floor(points.length / 70));
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

    const drawSplash = (point, spread = 1) => {
      const droplets = Math.round(6 + (energyRef.current / 12) * spread);
      for (let i = 0; i < droplets; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * 22 * spread;
        ctx.fillStyle = `${pickColor(Math.random())}55`;
        ctx.beginPath();
        ctx.arc(
          point.x + Math.cos(angle) * radius,
          point.y + Math.sin(angle) * radius,
          Math.random() * 2.8 + 0.8,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    };

    const drawRipple = (point, size) => {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
      ctx.stroke();
    };

    const scheduleEchoes = () => {
      cancelEchoes();
      const echoes = Math.min(10, Math.floor(points.length / 6));
      for (let i = 0; i < echoes; i += 1) {
        const timer = window.setTimeout(() => {
          const point = points[Math.floor(Math.random() * points.length)];
          drawSplash(point, 0.6);
          drawRipple(point, 16 + Math.random() * 20);
        }, 300 + i * 140 + Math.random() * 120);
        echoTimersRef.current.push(timer);
      }
    };

    const step = () => {
      if (progress >= totalSegments) {
        setIsLaunching(false);
        setEnergy(0);
        drawSplash(points[points.length - 1], 1.4);
        scheduleEchoes();
        setLastRitual({
          energy: Math.round(energyRef.current),
          distance: gestureMetrics.distance,
          palette: paletteWithEnergy
        });
        return;
      }
      const pulse = audioPulseRef.current;
      for (let i = 0; i < speed && progress < totalSegments; i += 1) {
        const start = points[progress];
        const end = points[progress + 1];
        const ratio = progress / totalSegments;
        const weight = 4 + pulse * 6 + (energyRef.current / MAX_ENERGY) * 9;
        const alpha = Math.round(120 + pulse * 100)
          .toString(16)
          .padStart(2, "0");
        ctx.strokeStyle = `${pickColor(ratio)}${alpha}`;
        ctx.lineWidth = weight;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x + (Math.random() - 0.5) * pulse * 4, end.y + (Math.random() - 0.5) * pulse * 4);
        ctx.stroke();
        if (Math.random() < 0.25 + pulse * 0.25) {
          drawSplash(end, 0.8);
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
    cancelEchoes();
    setIsLaunching(false);
    setEnergy(40);
    clearInkLayer();
    clearGestureLayer();
    gesturePointsRef.current = [];
    setGestureMetrics({ points: 0, distance: 0, speed: 0 });
    setLastRitual(null);
  };

  return (
    <div className="app">
      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Rituel de dessin audioreactif</p>
          <h1>Kaï du Shodo</h1>
          <p className="lead">
            Accumulez un cri, répartissez son énergie, puis gravez un geste unique : l&apos;encre
            écoute votre souffle et répond en échos asynchrones.
          </p>
          <div className="status-row">
            <span className={`status-pill ${isLaunching ? "active" : isReadyToLaunch ? "ready" : ""}`}>
              {isLaunching ? "Encre en transe" : isReadyToLaunch ? "Rituel prêt" : "Préparer le rituel"}
            </span>
            <span className="status-pill muted">Pulse {Math.round(audioPulse * 100)}%</span>
          </div>
        </div>
        <div className="energy-orb" style={{ "--pulse": audioPulse }}>
          <span>{Math.round(energy)}%</span>
          <small>Énergie du cri</small>
          <div className="energy-rings">
            <span />
            <span />
          </div>
        </div>
      </header>

      <main className="layout">
        <section className="control-panel">
          <div className="ritual-steps">
            {ritualSteps.map((step) => (
              <article key={step.key} className={`step-card ${step.status}`}>
                <div className="step-header">
                  <h2>{step.title}</h2>
                  <span className="step-status">{step.status === "complete" ? "✓" : "•"}</span>
                </div>
                <p>{step.description}</p>
              </article>
            ))}
          </div>

          <div className="step action-step">
            <h3>Capture du cri</h3>
            <p>Maintenez pour amplifier le Kaï, relâchez pour stabiliser.</p>
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
            <h3>Palette vibratoire</h3>
            <p>Orchestrez la distribution : chaque couleur recevra une part du cri.</p>
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
            <h3>Geste guidé</h3>
            <p>Un seul trait : laissez votre bras dicter le souffle de l&apos;encre.</p>
            <div className="gesture-meta">
              <span>{gestureMetrics.points} points</span>
              <span>{gestureMetrics.distance} px</span>
              <span>{gestureMetrics.speed} vitesse</span>
            </div>
          </div>

          <div className="step launch-step">
            <h3>Projection</h3>
            <p>Lancez l&apos;encre et observez ses résonances.</p>
            <div className="action-row">
              <button className="launch-btn" type="button" onClick={handleLaunch} disabled={!isReadyToLaunch}>
                {isLaunching ? "Rituel en cours…" : "Projeter l'encre"}
              </button>
              <button className="ghost-btn" type="button" onClick={handleReset}>
                Réinitialiser
              </button>
            </div>
            {!isReadyToLaunch && (
              <p className="hint">Chargez l&apos;énergie et tracez un geste pour déclencher.</p>
            )}
          </div>

          {lastRitual && (
            <div className="ritual-summary">
              <h3>Dernier rituel</h3>
              <p>
                {lastRitual.energy}% d&apos;énergie • {lastRitual.distance} px • palette répartie
              </p>
              <div className="summary-bar">
                {lastRitual.palette.map((item) => (
                  <span key={item.key} style={{ backgroundColor: item.color, flex: item.energy }} />
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="canvas-panel">
          <div
            ref={canvasWrapRef}
            className={`canvas-stage ${isLaunching ? "launching" : ""}`}
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
                  ? "L'encre vibre, les échos s'étirent…"
                  : hasGesture
                    ? "Relâchez l'encre pour sceller le rituel."
                    : "Tracez un geste long pour appeler l'encre."}
              </p>
            </div>
            <div className="sigil" />
          </div>
        </section>
      </main>
    </div>
  );
};

export default App;
