"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_OPTIONS,
  OVSimulator,
  PRESETS,
  type PresetName,
  type SimulatorOptions,
  type SimulatorSnapshot,
  makeHistogram,
  optimalVelocity,
  optimalVelocitySlope
} from "../lib/ov-core";

type ControlKey =
  | "carCount"
  | "roadLength"
  | "sensitivity"
  | "velocityScale"
  | "headwayOffset"
  | "perturbation"
  | "noise"
  | "stepsPerFrame";

type CanvasRefs = {
  ring: HTMLCanvasElement | null;
  xt: HTMLCanvasElement | null;
  velocity: HTMLCanvasElement | null;
  headway: HTMLCanvasElement | null;
  speed: HTMLCanvasElement | null;
  fourier: HTMLCanvasElement | null;
  stability: HTMLCanvasElement | null;
};

const COLORS = {
  ink: "#f2fff9",
  panel: "#0d1413",
  panelAlt: "#141d1a",
  muted: "#91a19b",
  grid: "#2a3934",
  road: "#252d2b",
  roadEdge: "#8a9791",
  green: "#2fe098",
  blue: "#58a9ff",
  red: "#ff6358",
  amber: "#ffb454",
  purple: "#bb8cff"
};

const MODE_COLORS = ["#58a9ff", "#2fe098", "#ff6358", "#bb8cff", "#ffb454", "#9aa7ff"];

const BANDO_CITE = `@article{Bando1995OV,
  author = {Bando, M. and Hasebe, K. and Nakayama, A. and Shibata, A. and Sugiyama, Y.},
  title = {Dynamical model of traffic congestion and numerical simulation},
  journal = {Physical Review E},
  volume = {51},
  pages = {1035--1042},
  year = {1995},
  doi = {10.1103/PhysRevE.51.1035}
}`;

export function OvSimulatorCockpit() {
  const initialOptions = useMemo(
    () => ({ ...DEFAULT_OPTIONS, ...PRESETS.bandoFigure }),
    []
  );
  const simulatorRef = useRef<OVSimulator>(new OVSimulator(initialOptions));
  const optionsRef = useRef<SimulatorOptions>(simulatorRef.current.options);
  const runningRef = useRef(true);
  const frameRef = useRef(0);
  const canvasRefs = useRef<CanvasRefs>({
    ring: null,
    xt: null,
    velocity: null,
    headway: null,
    speed: null,
    fourier: null,
    stability: null
  });

  const [options, setOptions] = useState<SimulatorOptions>(simulatorRef.current.options);
  const [snapshot, setSnapshot] = useState<SimulatorSnapshot>(simulatorRef.current.snapshot());
  const [running, setRunning] = useState(true);
  const [activePreset, setActivePreset] = useState<PresetName>("bandoFigure");

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  useEffect(() => {
    let animationId = 0;
    let mounted = true;

    const tick = () => {
      if (!mounted) return;
      const simulator = simulatorRef.current;
      simulator.setOptions({ stepsPerFrame: optionsRef.current.stepsPerFrame });
      if (runningRef.current) {
        simulator.step(simulator.options.stepsPerFrame);
      }
      frameRef.current += 1;
      const nextSnapshot = simulator.snapshot();
      drawAll(canvasRefs.current, nextSnapshot, simulator.options, frameRef.current);
      if (frameRef.current % 3 === 0) {
        setSnapshot(nextSnapshot);
      }
      animationId = window.requestAnimationFrame(tick);
    };

    tick();
    return () => {
      mounted = false;
      window.cancelAnimationFrame(animationId);
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      drawAll(canvasRefs.current, simulatorRef.current.snapshot(), simulatorRef.current.options, frameRef.current);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const resetWith = (nextOptions: Partial<SimulatorOptions>, preset?: PresetName) => {
    const merged = { ...simulatorRef.current.options, ...nextOptions };
    simulatorRef.current.reset(merged);
    optionsRef.current = simulatorRef.current.options;
    setOptions(simulatorRef.current.options);
    setSnapshot(simulatorRef.current.snapshot());
    if (preset) setActivePreset(preset);
    drawAll(canvasRefs.current, simulatorRef.current.snapshot(), simulatorRef.current.options, frameRef.current);
  };

  const setControl = (key: ControlKey, value: number) => {
    resetWith({ [key]: value } as Partial<SimulatorOptions>);
    setActivePreset("bandoFigure");
  };

  const applyPreset = (preset: PresetName) => {
    resetWith({ ...PRESETS[preset], stepsPerFrame: options.stepsPerFrame }, preset);
  };

  const stepBurst = () => {
    setRunning(false);
    runningRef.current = false;
    simulatorRef.current.step(100);
    const nextSnapshot = simulatorRef.current.snapshot();
    setSnapshot(nextSnapshot);
    drawAll(canvasRefs.current, nextSnapshot, simulatorRef.current.options, frameRef.current);
  };

  return (
    <main className="shell">
      <section className="hero-panel" aria-labelledby="app-title">
        <div className="hero-copy">
          <p className="eyebrow">Bando Optimal Velocity Model</p>
          <h1 id="app-title">Traffic Jam Phase Lab</h1>
          <div className="formula-strip" aria-label="model equations">
            <span>x<sub>n</sub>'' = a {"{ V(dx_n) - x_n' }"}</span>
            <span>V(h) = tanh(h - 2) + tanh 2</span>
            <span>V'(h) {"<="} a / 2</span>
          </div>
        </div>
        <div className="hero-stat-grid" aria-label="main readouts">
          <Metric label="time" value={formatNumber(snapshot.t, 1)} />
          <Metric label="density" value={formatNumber(snapshot.density, 3)} />
          <Metric label="flow" value={formatNumber(snapshot.flow, 2)} />
          <Metric label="state" value={snapshot.stable ? "stable" : "unstable"} tone={snapshot.stable ? "good" : "bad"} />
        </div>
      </section>

      <section className="simulator-grid">
        <div className="road-console">
          <div className="console-topline">
            <div>
              <span className="section-kicker">circular road</span>
              <h2>Live Ring</h2>
            </div>
            <div className={`phase-badge ${snapshot.stable ? "stable" : "unstable"}`}>
              {snapshot.stable ? "linear stable" : "jam forming"}
            </div>
          </div>
          <canvas
            ref={(node) => {
              canvasRefs.current.ring = node;
            }}
            className="ring-canvas"
            aria-label="Animated circular road simulation"
          />
          <div className="micro-metrics" aria-label="traffic metrics">
            <Metric label="cars" value={String(options.carCount)} />
            <Metric label="length" value={String(options.roadLength)} />
            <Metric label="headway" value={formatNumber(snapshot.meanHeadway, 2)} />
            <Metric label="avg speed" value={formatNumber(snapshot.avgSpeed, 2)} />
            <Metric label="jam share" value={`${Math.round(snapshot.jamFraction * 100)}%`} tone={snapshot.jamFraction > 0.08 ? "bad" : "good"} />
          </div>
        </div>

        <aside className="control-console" aria-label="simulation controls">
          <div className="transport-row">
            <IconButton
              label={running ? "Pause" : "Run"}
              title={running ? "Pause simulation" : "Run simulation"}
              active={running}
              onClick={() => setRunning((value) => !value)}
            >
              {running ? <PauseIcon /> : <PlayIcon />}
            </IconButton>
            <IconButton label="Reset" title="Reset simulation" onClick={() => resetWith({})}>
              <ResetIcon />
            </IconButton>
            <IconButton label="Step" title="Advance simulation" onClick={stepBurst}>
              <StepIcon />
            </IconButton>
          </div>

          <div className="preset-grid" aria-label="presets">
            {(Object.keys(PRESETS) as PresetName[]).map((preset) => (
              <button
                className={activePreset === preset ? "preset active" : "preset"}
                key={preset}
                type="button"
                onClick={() => applyPreset(preset)}
              >
                {PRESETS[preset].label}
              </button>
            ))}
          </div>

          <ControlSlider label="Cars" value={options.carCount} min={20} max={150} step={1} onChange={(value) => setControl("carCount", value)} />
          <ControlSlider label="Road length" value={options.roadLength} min={50} max={320} step={1} onChange={(value) => setControl("roadLength", value)} />
          <ControlSlider label="Sensitivity a" value={options.sensitivity} min={0.2} max={2.4} step={0.01} onChange={(value) => setControl("sensitivity", value)} />
          <ControlSlider label="Velocity scale" value={options.velocityScale} min={0.3} max={2.4} step={0.01} onChange={(value) => setControl("velocityScale", value)} />
          <ControlSlider label="Headway offset" value={options.headwayOffset} min={0} max={5} step={0.01} onChange={(value) => setControl("headwayOffset", value)} />
          <ControlSlider label="Perturbation" value={options.perturbation} min={0} max={1.5} step={0.01} onChange={(value) => setControl("perturbation", value)} />
          <ControlSlider label="Noise" value={options.noise} min={0} max={0.04} step={0.001} onChange={(value) => setControl("noise", value)} />
          <ControlSlider label="Speed" value={options.stepsPerFrame} min={1} max={40} step={1} onChange={(value) => {
            simulatorRef.current.setOptions({ stepsPerFrame: value });
            optionsRef.current = simulatorRef.current.options;
            setOptions(simulatorRef.current.options);
          }} />

          <label className="select-field">
            <span>Optimal velocity</span>
            <select
              value={options.model}
              onChange={(event) => resetWith({ model: event.target.value as SimulatorOptions["model"] })}
            >
              <option value="bando">tanh(h - 2) + tanh(2)</option>
              <option value="normalized">normalized Bando</option>
              <option value="simple">tanh(h)</option>
            </select>
          </label>

          <label className="toggle-field">
            <input
              type="checkbox"
              checked={options.clampVelocity}
              onChange={(event) => resetWith({ clampVelocity: event.target.checked })}
            />
            <span>nonnegative velocity</span>
          </label>
        </aside>
      </section>

      <section className="chart-grid" aria-label="paper figure views">
        <ChartShell title="Space-time trace" cite="Fig. 6">
          <canvas ref={(node) => { canvasRefs.current.xt = node; }} aria-label="x-t diagram" />
        </ChartShell>
        <ChartShell title="Velocity snapshot" cite="Fig. 5">
          <canvas ref={(node) => { canvasRefs.current.velocity = node; }} aria-label="velocity snapshot" />
        </ChartShell>
        <ChartShell title="Headway distribution" cite="Fig. 7">
          <canvas ref={(node) => { canvasRefs.current.headway = node; }} aria-label="headway distribution" />
        </ChartShell>
        <ChartShell title="Velocity distribution" cite="Fig. 8">
          <canvas ref={(node) => { canvasRefs.current.speed = node; }} aria-label="velocity distribution" />
        </ChartShell>
        <ChartShell title="Fourier modes" cite="Fig. 9">
          <canvas ref={(node) => { canvasRefs.current.fourier = node; }} aria-label="Fourier mode chart" />
        </ChartShell>
        <ChartShell title="Stability field" cite="Fig. 10">
          <canvas ref={(node) => { canvasRefs.current.stability = node; }} aria-label="stability map" />
        </ChartShell>
      </section>

      <section className="reference-panel" aria-labelledby="reference-title">
        <div>
          <span className="section-kicker">reference / cite</span>
          <h2 id="reference-title">Bando et al. 1995</h2>
        </div>
        <p>
          M. Bando, K. Hasebe, A. Nakayama, A. Shibata, and Y. Sugiyama,
          "Dynamical model of traffic congestion and numerical simulation,"
          <cite> Physical Review E</cite> 51, 1035-1042 (1995).
          DOI: <a href="https://doi.org/10.1103/PhysRevE.51.1035">10.1103/PhysRevE.51.1035</a>.
        </p>
        <pre><code>{BANDO_CITE}</code></pre>
      </section>
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className={`metric ${tone ?? ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function IconButton({
  children,
  label,
  title,
  active,
  onClick
}: {
  children: ReactNode;
  label: string;
  title: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button className={active ? "icon-button active" : "icon-button"} type="button" title={title} aria-label={title} onClick={onClick}>
      {children}
      <span>{label}</span>
    </button>
  );
}

function ControlSlider({
  label,
  value,
  min,
  max,
  step,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="slider-field">
      <span>
        {label}
        <strong>{step < 0.01 ? value.toFixed(3) : step < 1 ? value.toFixed(2) : Math.round(value)}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function ChartShell({ title, cite, children }: { title: string; cite: string; children: ReactNode }) {
  return (
    <article className="chart-shell">
      <header>
        <h3>{title}</h3>
        <span>{cite}</span>
      </header>
      {children}
    </article>
  );
}

function PlayIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>;
}

function PauseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>;
}

function ResetIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.2 6.2A8 8 0 1 1 4 12H1.8a10.2 10.2 0 1 0 3-7.2L2.5 2.5v6.7h6.7z" /></svg>;
}

function StepIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h3v14H5zM10 6l9 6-9 6z" /></svg>;
}

function formatNumber(value: number, digits = 2) {
  return Number(value).toFixed(digits);
}

function canvasContext(canvas: HTMLCanvasElement | null) {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(280, Math.round(rect.width));
  const height = Math.max(180, Math.round(rect.height));
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

function drawAll(refs: CanvasRefs, snapshot: SimulatorSnapshot, options: SimulatorOptions, frame: number) {
  drawRing(refs.ring, snapshot, options, frame);
  drawXT(refs.xt, snapshot, options);
  drawVelocity(refs.velocity, snapshot);
  drawHeadway(refs.headway, snapshot);
  drawSpeed(refs.speed, snapshot);
  drawFourier(refs.fourier, snapshot);
  drawStability(refs.stability, snapshot, options);
}

function drawPanelFrame(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#111918");
  background.addColorStop(0.56, "#0c1110");
  background.addColorStop(1, "#17130f");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  const shine = ctx.createLinearGradient(0, 0, width, height);
  shine.addColorStop(0, "rgba(88,169,255,0.12)");
  shine.addColorStop(0.48, "rgba(47,224,152,0.03)");
  shine.addColorStop(1, "rgba(255,180,84,0.08)");
  ctx.fillStyle = shine;
  ctx.fillRect(0, 0, width, height);
}

function drawAxes(ctx: CanvasRenderingContext2D, plot: PlotRect, xTicks: number, yTicks: number) {
  ctx.save();
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  for (let i = 0; i <= xTicks; i += 1) {
    const x = plot.left + plot.width * i / xTicks;
    ctx.beginPath();
    ctx.moveTo(x, plot.top);
    ctx.lineTo(x, plot.top + plot.height);
    ctx.stroke();
  }
  for (let j = 0; j <= yTicks; j += 1) {
    const y = plot.top + plot.height * j / yTicks;
    ctx.beginPath();
    ctx.moveTo(plot.left, y);
    ctx.lineTo(plot.left + plot.width, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "#6b7b75";
  ctx.beginPath();
  ctx.moveTo(plot.left, plot.top);
  ctx.lineTo(plot.left, plot.top + plot.height);
  ctx.lineTo(plot.left + plot.width, plot.top + plot.height);
  ctx.stroke();
  ctx.restore();
}

type PlotRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = COLORS.muted, align: CanvasTextAlign = "left") {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
  ctx.restore();
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function speedColor(speed: number, maxSpeed: number) {
  const value = maxSpeed > 0 ? Math.max(0, Math.min(1, speed / maxSpeed)) : 0;
  if (speed < 0.14) return COLORS.red;
  if (value < 0.42) return COLORS.amber;
  return COLORS.green;
}

function drawRing(canvas: HTMLCanvasElement | null, snapshot: SimulatorSnapshot, options: SimulatorOptions, frame: number) {
  const canvasData = canvasContext(canvas);
  if (!canvasData) return;
  const { ctx, width, height } = canvasData;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.34;
  const roadWidth = Math.max(32, Math.min(width, height) * 0.11);
  const inner = radius - roadWidth / 2;
  const outer = radius + roadWidth / 2;
  drawPanelFrame(ctx, width, height);

  ctx.save();
  ctx.strokeStyle = "rgba(145,161,155,0.08)";
  ctx.lineWidth = 1;
  const gridSize = 34;
  for (let gx = (frame % gridSize) - gridSize; gx < width; gx += gridSize) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, height);
    ctx.stroke();
  }
  for (let gy = 0; gy < height; gy += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(width, gy);
    ctx.stroke();
  }

  const halo = ctx.createRadialGradient(centerX, centerY, inner * 0.2, centerX, centerY, outer * 1.25);
  halo.addColorStop(0, "rgba(47,224,152,0.05)");
  halo.addColorStop(0.55, "rgba(88,169,255,0.10)");
  halo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, width, height);

  ctx.shadowColor = "rgba(47,224,152,0.24)";
  ctx.shadowBlur = 26;
  ctx.fillStyle = COLORS.road;
  ctx.beginPath();
  ctx.arc(centerX, centerY, outer, 0, Math.PI * 2);
  ctx.arc(centerX, centerY, inner, 0, Math.PI * 2, true);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = COLORS.roadEdge;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(centerX, centerY, outer, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(centerX, centerY, inner, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(242,255,249,0.22)";
  ctx.setLineDash([11, 16]);
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = COLORS.blue;
  ctx.lineWidth = 3;
  ctx.shadowColor = "rgba(88,169,255,0.8)";
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(centerX + inner, centerY);
  ctx.lineTo(centerX + outer + 18, centerY);
  ctx.stroke();
  ctx.shadowBlur = 0;
  drawLabel(ctx, "detector", centerX + outer + 22, centerY, COLORS.blue);

  const maxSpeed = Math.max(1, snapshot.maxSpeed);
  const carLength = Math.max(11, Math.min(20, roadWidth * 0.45));
  const carWidth = Math.max(5, Math.min(10, roadWidth * 0.24));
  for (let i = 0; i < snapshot.x.length; i += 1) {
    const theta = (snapshot.x[i] ?? 0) / options.roadLength * Math.PI * 2;
    const x = centerX + radius * Math.cos(theta);
    const y = centerY + radius * Math.sin(theta);
    const angle = theta + Math.PI / 2;
    const color = speedColor(snapshot.v[i] ?? 0, maxSpeed);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(242,255,249,0.34)";
    ctx.lineWidth = 1;
    ctx.shadowColor = color;
    ctx.shadowBlur = (snapshot.v[i] ?? 0) < 0.14 ? 18 : 9;
    roundedRect(ctx, -carWidth / 2, -carLength / 2, carWidth, carLength, 3);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.62)";
    ctx.fillRect(-carWidth / 2 + 1.2, -carLength / 2 + 2, carWidth - 2.4, 2);
    ctx.restore();
  }

  ctx.fillStyle = COLORS.ink;
  ctx.font = "800 22px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(snapshot.stable ? "FREE FLOW" : "DENSITY WAVE", centerX, centerY - 16);
  ctx.fillStyle = snapshot.jamFraction > 0.08 ? COLORS.red : COLORS.green;
  ctx.font = "700 13px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(`jam share ${Math.round(snapshot.jamFraction * 100)}%`, centerX, centerY + 14);
  ctx.restore();
}

function drawXT(canvas: HTMLCanvasElement | null, snapshot: SimulatorSnapshot, options: SimulatorOptions) {
  const canvasData = canvasContext(canvas);
  if (!canvasData) return;
  const { ctx, width, height } = canvasData;
  const history = snapshot.history;
  const plot = { left: 42, top: 18, width: width - 56, height: height - 52 };
  drawPanelFrame(ctx, width, height);
  drawAxes(ctx, plot, 4, 4);
  if (history.length > 1) {
    const stride = Math.max(1, Math.floor(options.carCount / 70));
    for (let h = 0; h < history.length; h += 1) {
      const sample = history[h];
      if (!sample) continue;
      const y = plot.top + plot.height * h / (history.length - 1);
      for (let n = 0; n < sample.x.length; n += stride) {
        const speed = sample.v[n] ?? 0;
        const x = plot.left + (sample.x[n] ?? 0) / options.roadLength * plot.width;
        ctx.fillStyle = speedColor(speed, Math.max(1, snapshot.maxSpeed));
        ctx.globalAlpha = speed < 0.14 ? 0.86 : 0.34;
        ctx.fillRect(x, y, speed < 0.14 ? 2.4 : 1.4, speed < 0.14 ? 2.4 : 1.4);
      }
    }
    ctx.globalAlpha = 1;
  }
  drawLabel(ctx, "traffic position", plot.left + plot.width / 2, height - 14, COLORS.muted, "center");
  drawLabel(ctx, "time", 14, plot.top + plot.height / 2, COLORS.muted, "center");
}

function drawVelocity(canvas: HTMLCanvasElement | null, snapshot: SimulatorSnapshot) {
  const canvasData = canvasContext(canvas);
  if (!canvasData) return;
  const { ctx, width, height } = canvasData;
  const values = snapshot.v;
  const yMax = Math.max(2.05, snapshot.maxSpeed * 1.15, 0.4);
  const plot = { left: 42, top: 18, width: width - 56, height: height - 52 };
  drawPanelFrame(ctx, width, height);
  drawAxes(ctx, plot, 4, 4);
  ctx.save();
  ctx.shadowColor = "rgba(88,169,255,0.38)";
  ctx.shadowBlur = 12;
  ctx.strokeStyle = COLORS.blue;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < values.length; i += 1) {
    const x = plot.left + i / Math.max(1, values.length - 1) * plot.width;
    const y = plot.top + plot.height - (values[i] ?? 0) / yMax * plot.height;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  for (let n = 0; n < values.length; n += 1) {
    const px = plot.left + n / Math.max(1, values.length - 1) * plot.width;
    const py = plot.top + plot.height - (values[n] ?? 0) / yMax * plot.height;
    const color = speedColor(values[n] ?? 0, yMax);
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  const jamY = plot.top + plot.height - 0.12 / yMax * plot.height;
  ctx.strokeStyle = "rgba(255,99,88,0.7)";
  ctx.setLineDash([5, 6]);
  ctx.beginPath();
  ctx.moveTo(plot.left, jamY);
  ctx.lineTo(plot.left + plot.width, jamY);
  ctx.stroke();
  ctx.restore();
  drawLabel(ctx, "car number", plot.left + plot.width / 2, height - 14, COLORS.muted, "center");
}

function drawHeadway(canvas: HTMLCanvasElement | null, snapshot: SimulatorSnapshot) {
  const max = Math.max(5, snapshot.headwayP90 * 1.7, snapshot.meanHeadway * 3);
  drawHistogram(canvas, snapshot.headways, 24, 0, max, COLORS.green, "headway");
}

function drawSpeed(canvas: HTMLCanvasElement | null, snapshot: SimulatorSnapshot) {
  const max = Math.max(2.05, snapshot.maxSpeed * 1.2);
  drawHistogram(canvas, snapshot.v, 24, 0, max, COLORS.amber, "velocity");
}

function drawHistogram(canvas: HTMLCanvasElement | null, values: number[], binCount: number, minValue: number, maxValue: number, color: string, label: string) {
  const canvasData = canvasContext(canvas);
  if (!canvasData) return;
  const { ctx, width, height } = canvasData;
  const plot = { left: 42, top: 18, width: width - 56, height: height - 52 };
  const bins = makeHistogram(values, binCount, minValue, maxValue);
  const maxCount = Math.max(1, ...bins.map((bin) => bin.count));
  drawPanelFrame(ctx, width, height);
  drawAxes(ctx, plot, 4, 4);
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  bins.forEach((bin, index) => {
    const barWidth = plot.width / bins.length - 2;
    const barHeight = bin.count / maxCount * plot.height;
    const x = plot.left + index * plot.width / bins.length + 1;
    const y = plot.top + plot.height - barHeight;
    ctx.fillRect(x, y, Math.max(1, barWidth), barHeight);
  });
  ctx.restore();
  drawLabel(ctx, label, plot.left + plot.width / 2, height - 14, COLORS.muted, "center");
}

function drawFourier(canvas: HTMLCanvasElement | null, snapshot: SimulatorSnapshot) {
  const canvasData = canvasContext(canvas);
  if (!canvasData) return;
  const { ctx, width, height } = canvasData;
  const history = snapshot.history;
  const plot = { left: 42, top: 18, width: width - 56, height: height - 52 };
  const modes = [1, 2, 3, 4, 5, 10].filter((mode) => mode < snapshot.x.length);
  let maxAmp = 0.02;
  history.forEach((sample) => {
    modes.forEach((mode) => {
      maxAmp = Math.max(maxAmp, sample.modeAmplitudes[mode] ?? 0);
    });
  });
  drawPanelFrame(ctx, width, height);
  drawAxes(ctx, plot, 4, 4);
  modes.forEach((mode, modeIndex) => {
    const color = MODE_COLORS[modeIndex % MODE_COLORS.length] ?? COLORS.blue;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.lineWidth = 2;
    ctx.beginPath();
    history.forEach((sample, index) => {
      const x = plot.left + (history.length <= 1 ? 0 : index / (history.length - 1) * plot.width);
      const amp = sample.modeAmplitudes[mode] ?? 0;
      const y = plot.top + plot.height - amp / maxAmp * plot.height;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
    drawLabel(ctx, `k=${mode}`, plot.left + 10 + modeIndex * 46, plot.top + 12, color);
  });
  drawLabel(ctx, "time", plot.left + plot.width / 2, height - 14, COLORS.muted, "center");
}

function drawStability(canvas: HTMLCanvasElement | null, snapshot: SimulatorSnapshot, options: SimulatorOptions) {
  const canvasData = canvasContext(canvas);
  if (!canvasData) return;
  const { ctx, width, height } = canvasData;
  const plot = { left: 42, top: 18, width: width - 56, height: height - 52 };
  const xMax = Math.max(6, snapshot.headwayP90 * 1.35, snapshot.meanHeadway * 2.2);
  const yMax = Math.max(2.05, optimalVelocity(xMax, options) * 1.1, snapshot.maxSpeed * 1.2);
  drawPanelFrame(ctx, width, height);
  for (let s = 0; s < 90; s += 1) {
    const h0 = xMax * s / 90;
    const h1 = xMax * (s + 1) / 90;
    const stable = optimalVelocitySlope((h0 + h1) / 2, options) <= options.sensitivity / 2;
    ctx.fillStyle = stable ? "rgba(47,224,152,0.09)" : "rgba(255,99,88,0.11)";
    ctx.fillRect(plot.left + h0 / xMax * plot.width, plot.top, (h1 - h0) / xMax * plot.width + 1, plot.height);
  }
  drawAxes(ctx, plot, 4, 4);
  ctx.save();
  ctx.strokeStyle = COLORS.ink;
  ctx.shadowColor = "rgba(242,255,249,0.26)";
  ctx.shadowBlur = 12;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 180; i += 1) {
    const h = xMax * i / 180;
    const v = optimalVelocity(h, options);
    const x = plot.left + h / xMax * plot.width;
    const y = plot.top + plot.height - v / yMax * plot.height;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
  drawVerticalMarker(ctx, plot, snapshot.meanHeadway, xMax, COLORS.blue, "mean");
  drawVerticalMarker(ctx, plot, snapshot.headwayP10, xMax, COLORS.red, "p10");
  drawVerticalMarker(ctx, plot, snapshot.headwayP90, xMax, COLORS.green, "p90");
  drawLabel(ctx, "headway", plot.left + plot.width / 2, height - 14, COLORS.muted, "center");
}

function drawVerticalMarker(
  ctx: CanvasRenderingContext2D,
  plot: PlotRect,
  value: number,
  xMax: number,
  color: string,
  label: string
) {
  if (!Number.isFinite(value)) return;
  const clamped = Math.max(0, Math.min(xMax, value));
  const x = plot.left + clamped / xMax * plot.width;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.moveTo(x, plot.top);
  ctx.lineTo(x, plot.top + plot.height);
  ctx.stroke();
  ctx.restore();
  drawLabel(ctx, label, x + 5, plot.top + 16, color);
}
