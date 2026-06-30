"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import katex from "katex";
import { LocaleSwitch } from "./LocaleSwitch";
import { BANDO_PAPER_URL, GitHubLink } from "./ExternalLinks";
import { COMMON_TEXT, LIVE_TEXT, presetText, useLocalePreference, type Locale } from "../lib/i18n";
import {
  DEFAULT_OPTIONS,
  OVSimulator,
  PRESETS,
  PRESET_ORDER,
  type PresetName,
  type SimulatorOptions,
  type SimulatorSnapshot,
  makeHistogram,
  optimalVelocity,
  optimalVelocitySlope,
  presetMarkForName
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

type ActivePresetName = PresetName | "custom";

type CanvasRefs = {
  ring: HTMLCanvasElement | null;
  xt: HTMLCanvasElement | null;
  velocity: HTMLCanvasElement | null;
  headway: HTMLCanvasElement | null;
  speed: HTMLCanvasElement | null;
  fourier: HTMLCanvasElement | null;
  stability: HTMLCanvasElement | null;
  fundamental: HTMLCanvasElement | null;
};

type FundamentalPoint = {
  density: number;
  flow: number;
  stable: boolean;
};

type FundamentalPresetMarker = FundamentalPoint & {
  label: string;
  mark: string;
  source: string;
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

const FORMULAS = [
  {
    labelKey: "motion",
    tex: String.raw`\ddot{x}_n = a\left\{ V\!\left(\Delta x_n\right)-\dot{x}_n \right\}`
  },
  {
    labelKey: "optimalVelocity",
    tex: String.raw`V(h)=\tanh(h-2)+\tanh 2`
  },
  {
    labelKey: "linearStability",
    tex: String.raw`V'(b)\leq {a\over 2}`
  },
  {
    labelKey: "headway",
    tex: String.raw`\Delta x_n=x_{n+1}-x_n,\quad b={L\over N}`
  }
] as const;

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
  const { mode: localeMode, locale, setMode: setLocaleMode } = useLocalePreference();
  const text = LIVE_TEXT[locale];
  const commonText = COMMON_TEXT[locale];
  const initialOptions = useMemo(
    () => ({ ...DEFAULT_OPTIONS, ...PRESETS.bandoFigure }),
    []
  );
  const simulatorRef = useRef<OVSimulator>(new OVSimulator(initialOptions));
  const optionsRef = useRef<SimulatorOptions>(simulatorRef.current.options);
  const runningRef = useRef(true);
  const frameRef = useRef(0);
  const localeRef = useRef<Locale>(locale);
  const canvasRefs = useRef<CanvasRefs>({
    ring: null,
    xt: null,
    velocity: null,
    headway: null,
    speed: null,
    fourier: null,
    stability: null,
    fundamental: null
  });

  const [options, setOptions] = useState<SimulatorOptions>(simulatorRef.current.options);
  const [snapshot, setSnapshot] = useState<SimulatorSnapshot>(simulatorRef.current.snapshot());
  const [running, setRunning] = useState(true);
  const [activePreset, setActivePreset] = useState<ActivePresetName>("bandoFigure");

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  useEffect(() => {
    localeRef.current = locale;
    drawAll(canvasRefs.current, simulatorRef.current.snapshot(), simulatorRef.current.options, frameRef.current, locale);
  }, [locale]);

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
      drawAll(canvasRefs.current, nextSnapshot, simulator.options, frameRef.current, localeRef.current);
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
      drawAll(canvasRefs.current, simulatorRef.current.snapshot(), simulatorRef.current.options, frameRef.current, localeRef.current);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const resetWith = (nextOptions: Partial<SimulatorOptions>, preset?: ActivePresetName) => {
    const merged = { ...simulatorRef.current.options, ...nextOptions };
    simulatorRef.current.reset(merged);
    optionsRef.current = simulatorRef.current.options;
    setOptions(simulatorRef.current.options);
    setSnapshot(simulatorRef.current.snapshot());
    if (preset) setActivePreset(preset);
    drawAll(canvasRefs.current, simulatorRef.current.snapshot(), simulatorRef.current.options, frameRef.current, localeRef.current);
  };

  const setControl = (key: ControlKey, value: number) => {
    resetWith({ [key]: value } as Partial<SimulatorOptions>);
    setActivePreset("custom");
  };

  const applyPreset = (preset: PresetName) => {
    const { label: _label, description: _description, source: _source, ...presetOptions } = PRESETS[preset];
    resetWith({ ...presetOptions, stepsPerFrame: options.stepsPerFrame }, preset);
  };

  const stepBurst = () => {
    setRunning(false);
    runningRef.current = false;
    simulatorRef.current.step(100);
    const nextSnapshot = simulatorRef.current.snapshot();
    setSnapshot(nextSnapshot);
    drawAll(canvasRefs.current, nextSnapshot, simulatorRef.current.options, frameRef.current, localeRef.current);
  };

  const presetInfo = activePreset === "custom"
    ? {
        label: text.customLabel,
        description: text.customDescription,
        source: "User-adjusted parameters; model equations and stability criterion from Bando et al. 1995."
      }
    : {
        ...PRESETS[activePreset],
        ...presetText(activePreset, locale)
      };
  const activePresetMark = activePreset === "custom" ? null : presetMarkForName(activePreset);

  return (
    <main className="shell">
      <section className="hero-panel" aria-labelledby="app-title">
        <div className="hero-copy">
          <p className="eyebrow">{text.appEyebrow}</p>
          <h1 id="app-title">{text.appTitle}</h1>
          <div className="formula-strip" aria-label={text.aria.formulas}>
            {FORMULAS.map((formula) => (
              <FormulaCard key={formula.labelKey} label={text.formulas[formula.labelKey]} tex={formula.tex} />
            ))}
          </div>
        </div>
        <div className="hero-stat-grid" aria-label={text.aria.readouts}>
          <div className="external-link-row nav-pill-grid">
            <GitHubLink label={commonText.githubRepo} />
            <LocaleSwitch mode={localeMode} locale={locale} onChange={setLocaleMode} compact />
          </div>
          <Link className="nav-pill nav-pill-grid" href="/fundamental-diagram">{text.navFundamental}</Link>
          <Metric label={text.metrics.time} value={formatNumber(snapshot.t, 1)} />
          <Metric label={text.metrics.density} value={formatNumber(snapshot.density, 3)} />
          <Metric label={text.metrics.flow} value={formatNumber(snapshot.flow, 2)} />
          <Metric label={text.metrics.state} value={snapshot.stable ? commonText.stable : commonText.unstable} tone={snapshot.stable ? "good" : "bad"} />
        </div>
      </section>

      <section className="simulator-grid">
        <div className="road-console">
          <div className="console-topline">
            <div>
              <span className="section-kicker">{text.circularRoad}</span>
              <h2>{text.liveRing}</h2>
            </div>
            <div className={`phase-badge ${snapshot.stable ? "stable" : "unstable"}`}>
              {snapshot.stable ? text.linearStable : text.jamForming}
            </div>
          </div>
          <div className="ring-main-layout">
            <div className="ring-stage">
              <canvas
                ref={(node) => {
                  canvasRefs.current.ring = node;
                }}
                className="ring-canvas"
                aria-label={text.aria.ring}
              />
            </div>
            <section className="ring-fundamental-map" aria-label={text.aria.miniDiagram}>
              <div className="mini-map-topline">
                <span>{text.rhoQMap}</span>
                <strong>{text.uniformFlowTheory}</strong>
              </div>
              <canvas
                ref={(node) => {
                  canvasRefs.current.fundamental = node;
                }}
                className="fundamental-mini-canvas"
                aria-label={text.aria.miniDiagramCanvas}
              />
              <div className="mini-ring-stats fundamental-mini-stats">
                <div>
                  <span>{text.metrics.rho}</span>
                  <strong>{formatNumber(snapshot.density, 3)}</strong>
                </div>
                <div>
                  <span>{text.metrics.flow}</span>
                  <strong>{formatNumber(snapshot.flow, 3)}</strong>
                </div>
                <div>
                  <span>{text.metrics.state}</span>
                  <strong>{snapshot.stable ? commonText.stable : commonText.wave}</strong>
                </div>
              </div>
            </section>
          </div>
          <div className="micro-metrics" aria-label={text.aria.trafficMetrics}>
            <Metric label={text.metrics.cars} value={String(options.carCount)} />
            <Metric label={text.metrics.length} value={String(options.roadLength)} />
            <Metric label={text.metrics.headway} value={formatNumber(snapshot.meanHeadway, 2)} />
            <Metric label={text.metrics.avgSpeed} value={formatNumber(snapshot.avgSpeed, 2)} />
            <Metric label={text.metrics.jamShare} value={`${Math.round(snapshot.jamFraction * 100)}%`} tone={snapshot.jamFraction > 0.08 ? "bad" : "good"} />
          </div>
        </div>

        <aside className="control-console" aria-label={text.controls}>
          <div className="transport-row">
            <IconButton
              label={running ? text.pause : text.run}
              title={running ? text.pauseTitle : text.runTitle}
              active={running}
              onClick={() => setRunning((value) => !value)}
            >
              {running ? <PauseIcon /> : <PlayIcon />}
            </IconButton>
            <IconButton label={text.reset} title={text.resetTitle} onClick={() => resetWith({})}>
              <ResetIcon />
            </IconButton>
            <IconButton label={text.step} title={text.stepTitle} onClick={stepBurst}>
              <StepIcon />
            </IconButton>
          </div>

          <div className="preset-grid" aria-label={text.aria.presets}>
            {PRESET_ORDER.map((preset) => (
              <button
                className={activePreset === preset ? "preset preset-choice active" : "preset preset-choice"}
                key={preset}
                type="button"
                onClick={() => applyPreset(preset)}
                title={PRESETS[preset].source}
              >
                <span className="preset-mark preset-mark-compact">{presetMarkForName(preset)}</span>
                <span>{presetText(preset, locale).label}</span>
              </button>
            ))}
          </div>

          <section className="preset-info" aria-label={text.aria.presetDescription}>
            <div className="preset-info-heading">
              <span>{text.selectedPreset}</span>
              <strong className="preset-info-title">
                {activePresetMark ? <span className="preset-mark">{activePresetMark}</span> : null}
                <span>{presetInfo.label}</span>
              </strong>
            </div>
            <p>{presetInfo.description}</p>
            <dl>
              <div>
                <dt>{commonText.params}</dt>
                <dd>N={options.carCount}, L={options.roadLength}, a={formatNumber(options.sensitivity, 2)}</dd>
              </div>
              <div>
                <dt>{commonText.source}</dt>
                <dd>{presetInfo.source}</dd>
              </div>
            </dl>
          </section>

          <ControlSlider label={text.sliders.cars} value={options.carCount} min={20} max={150} step={1} onChange={(value) => setControl("carCount", value)} />
          <ControlSlider label={text.sliders.roadLength} value={options.roadLength} min={50} max={320} step={1} onChange={(value) => setControl("roadLength", value)} />
          <ControlSlider label={text.sliders.sensitivity} value={options.sensitivity} min={0.2} max={2.4} step={0.01} onChange={(value) => setControl("sensitivity", value)} />
          <ControlSlider label={text.sliders.velocityScale} value={options.velocityScale} min={0.3} max={2.4} step={0.01} onChange={(value) => setControl("velocityScale", value)} />
          <ControlSlider label={text.sliders.headwayOffset} value={options.headwayOffset} min={0} max={5} step={0.01} onChange={(value) => setControl("headwayOffset", value)} />
          <ControlSlider label={text.sliders.perturbation} value={options.perturbation} min={0} max={1.5} step={0.01} onChange={(value) => setControl("perturbation", value)} />
          <ControlSlider label={text.sliders.noise} value={options.noise} min={0} max={0.04} step={0.001} onChange={(value) => setControl("noise", value)} />
          <ControlSlider label={text.sliders.speed} value={options.stepsPerFrame} min={1} max={40} step={1} onChange={(value) => {
            simulatorRef.current.setOptions({ stepsPerFrame: value });
            optionsRef.current = simulatorRef.current.options;
            setOptions(simulatorRef.current.options);
          }} />

          <label className="select-field">
            <span>{text.optimalVelocity}</span>
            <select
              value={options.model}
              onChange={(event) => resetWith({ model: event.target.value as SimulatorOptions["model"] }, "custom")}
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
              onChange={(event) => resetWith({ clampVelocity: event.target.checked }, "custom")}
            />
            <span>{text.nonnegativeVelocity}</span>
          </label>
        </aside>
      </section>

      <section className="chart-grid" aria-label={text.aria.paperFigures}>
        <ChartShell title={text.charts.spaceTime} cite="Fig. 6">
          <canvas ref={(node) => { canvasRefs.current.xt = node; }} aria-label="x-t diagram" />
        </ChartShell>
        <ChartShell title={text.charts.velocitySnapshot} cite="Fig. 5">
          <canvas ref={(node) => { canvasRefs.current.velocity = node; }} aria-label="velocity snapshot" />
        </ChartShell>
        <ChartShell title={text.charts.headwayDistribution} cite="Fig. 7">
          <canvas ref={(node) => { canvasRefs.current.headway = node; }} aria-label="headway distribution" />
        </ChartShell>
        <ChartShell title={text.charts.velocityDistribution} cite="Fig. 8">
          <canvas ref={(node) => { canvasRefs.current.speed = node; }} aria-label="velocity distribution" />
        </ChartShell>
        <ChartShell title={text.charts.fourierModes} cite="Fig. 9">
          <canvas ref={(node) => { canvasRefs.current.fourier = node; }} aria-label="Fourier mode chart" />
        </ChartShell>
        <ChartShell title={text.charts.stabilityField} cite="Fig. 10">
          <canvas ref={(node) => { canvasRefs.current.stability = node; }} aria-label="stability map" />
        </ChartShell>
      </section>

      <section className="reference-panel" aria-labelledby="reference-title">
        <div>
          <span className="section-kicker">{text.reference}</span>
          <h2 id="reference-title">
            <a href={BANDO_PAPER_URL} target="_blank" rel="noreferrer">Bando et al. 1995</a>
          </h2>
        </div>
        <p>
          M. Bando, K. Hasebe, A. Nakayama, A. Shibata, and Y. Sugiyama,
          <a href={BANDO_PAPER_URL} target="_blank" rel="noreferrer"> "Dynamical model of traffic congestion and numerical simulation,"</a>
          <cite> Physical Review E</cite> 51, 1035-1042 (1995).
          DOI: <a href={BANDO_PAPER_URL} target="_blank" rel="noreferrer">10.1103/PhysRevE.51.1035</a>.
        </p>
        <pre><code>{BANDO_CITE}</code></pre>
      </section>
    </main>
  );
}

function FormulaCard({ label, tex }: { label: string; tex: string }) {
  const html = useMemo(
    () => katex.renderToString(tex, {
      displayMode: true,
      output: "html",
      strict: false,
      throwOnError: false
    }),
    [tex]
  );

  return (
    <div className="formula-card">
      <span className="formula-label">{label}</span>
      <div
        className="formula-tex"
        aria-label={tex}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
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

function drawAll(refs: CanvasRefs, snapshot: SimulatorSnapshot, options: SimulatorOptions, frame: number, locale: Locale) {
  safeCanvasDraw(() => drawRing(refs.ring, snapshot, options, frame, locale));
  if (frame <= 1 || frame % 3 === 0) {
    safeCanvasDraw(() => drawFundamentalMini(refs.fundamental, snapshot, options, locale));
  }
  safeCanvasDraw(() => drawXT(refs.xt, snapshot, options, locale));
  safeCanvasDraw(() => drawVelocity(refs.velocity, snapshot, locale));
  safeCanvasDraw(() => drawHeadway(refs.headway, snapshot, locale));
  safeCanvasDraw(() => drawSpeed(refs.speed, snapshot, locale));
  safeCanvasDraw(() => drawFourier(refs.fourier, snapshot, locale));
  safeCanvasDraw(() => drawStability(refs.stability, snapshot, options, locale));
}

function safeCanvasDraw(draw: () => void) {
  try {
    draw();
  } catch (error) {
    console.error(error);
  }
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

function drawRing(canvas: HTMLCanvasElement | null, snapshot: SimulatorSnapshot, options: SimulatorOptions, frame: number, locale: Locale) {
  const canvasData = canvasContext(canvas);
  if (!canvasData) return;
  const text = LIVE_TEXT[locale].canvas;
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
  drawLabel(ctx, text.detector, centerX + outer + 22, centerY, COLORS.blue);

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
  ctx.fillText(snapshot.stable ? text.freeFlow : text.densityWave, centerX, centerY - 16);
  ctx.fillStyle = snapshot.jamFraction > 0.08 ? COLORS.red : COLORS.green;
  ctx.font = "700 13px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(`${text.jamShare} ${Math.round(snapshot.jamFraction * 100)}%`, centerX, centerY + 14);
  ctx.restore();
}

function drawFundamentalMini(canvas: HTMLCanvasElement | null, snapshot: SimulatorSnapshot, options: SimulatorOptions, locale: Locale) {
  const canvasData = canvasContext(canvas);
  if (!canvasData) return;
  const text = LIVE_TEXT[locale].canvas;
  const { ctx, width, height } = canvasData;
  const presetMarkers = buildFundamentalPresetMarkers(options);
  const xMax = 0.92;
  const curve = buildFundamentalMiniCurve(options, xMax);
  const visiblePresetMarkers = presetMarkers.filter((marker) => marker.density <= xMax);
  const yMax = Math.max(
    0.1,
    snapshot.flow,
    ...curve.map((point) => point.flow),
    ...visiblePresetMarkers.map((marker) => marker.flow)
  ) * 1.18;
  const plot = { left: 42, top: 24, width: width - 62, height: height - 64 };
  const xScale = (density: number) => plot.left + density / xMax * plot.width;
  const yScale = (flow: number) => plot.top + plot.height - flow / yMax * plot.height;

  drawPanelFrame(ctx, width, height);
  curve.forEach((point, index) => {
    const next = curve[index + 1];
    if (!next) return;
    ctx.fillStyle = point.stable ? "rgba(47,224,152,0.07)" : "rgba(255,99,88,0.10)";
    ctx.fillRect(xScale(point.density), plot.top, Math.max(1, xScale(next.density) - xScale(point.density)), plot.height);
  });
  drawAxes(ctx, plot, 4, 3);

  ctx.save();
  ctx.strokeStyle = COLORS.blue;
  ctx.shadowColor = "rgba(88,169,255,0.42)";
  ctx.shadowBlur = 10;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  curve.forEach((point, index) => {
    const x = xScale(point.density);
    const y = yScale(point.flow);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.restore();
  drawMiniChartLabel(ctx, text.uniformFlowCurve, plot.left + 10, plot.top + 12, COLORS.blue);

  visiblePresetMarkers.forEach((marker) => {
    drawMiniPresetMarker(ctx, xScale(marker.density), yScale(marker.flow), marker.stable ? COLORS.green : COLORS.red, marker.mark, plot);
  });

  const currentX = xScale(Math.min(snapshot.density, xMax));
  const currentY = yScale(Math.min(snapshot.flow, yMax));
  ctx.save();
  ctx.strokeStyle = "rgba(255,99,88,0.34)";
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  ctx.moveTo(currentX, plot.top);
  ctx.lineTo(currentX, plot.top + plot.height);
  ctx.moveTo(plot.left, currentY);
  ctx.lineTo(plot.left + plot.width, currentY);
  ctx.stroke();
  ctx.setLineDash([]);
  drawMiniCurrentPoint(ctx, currentX, currentY);
  ctx.restore();

  drawMiniAxisLabels(ctx, plot, xMax, yMax, locale);
  drawMiniChartLabel(ctx, text.nowQ, Math.min(width - 38, currentX + 10), Math.max(16, currentY - 13), COLORS.red);
}

function drawMiniCurrentPoint(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.fillStyle = COLORS.red;
  ctx.shadowColor = "rgba(255,99,88,0.76)";
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = COLORS.ink;
  ctx.stroke();
  ctx.restore();
}

function buildFundamentalMiniCurve(options: SimulatorOptions, xMax: number) {
  const points: FundamentalPoint[] = [];
  const minDensity = 0.08;
  for (let i = 0; i <= 160; i += 1) {
    const density = minDensity + (xMax - minDensity) * i / 160;
    const headway = 1 / density;
    const speed = Math.max(0, optimalVelocity(headway, options));
    points.push({
      density,
      flow: density * speed,
      stable: optimalVelocitySlope(headway, options) <= options.sensitivity / 2
    });
  }
  return points;
}

function buildFundamentalPresetMarkers(options: SimulatorOptions): FundamentalPresetMarker[] {
  return PRESET_ORDER.map((presetName) => {
    const preset = PRESETS[presetName];
    const { label: _label, description: _description, source: _source, ...presetOptions } = preset;
    const merged = { ...options, ...presetOptions };
    const density = merged.carCount / merged.roadLength;
    const headway = 1 / density;
    const speed = Math.max(0, optimalVelocity(headway, merged));
    return {
      label: preset.label,
      mark: presetMarkForName(presetName),
      source: preset.source,
      density,
      flow: density * speed,
      stable: optimalVelocitySlope(headway, merged) <= merged.sensitivity / 2
    };
  });
}

function drawMiniPresetMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  mark: string,
  plot: PlotRect
) {
  const nearRightEdge = x > plot.left + plot.width - 25;
  const labelX = x + (nearRightEdge ? -9 : 9);
  const labelY = y - 9;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 9;
  ctx.fillRect(-4.8, -4.8, 9.6, 9.6);
  ctx.restore();

  ctx.save();
  ctx.font = "800 10px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = nearRightEdge ? "right" : "left";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(5,9,8,0.9)";
  ctx.strokeText(mark, labelX, labelY);
  ctx.fillStyle = COLORS.ink;
  ctx.fillText(mark, labelX, labelY);
  ctx.restore();
}

function drawMiniAxisLabels(ctx: CanvasRenderingContext2D, plot: PlotRect, xMax: number, yMax: number, locale: Locale) {
  const text = LIVE_TEXT[locale].canvas;
  ctx.save();
  ctx.fillStyle = COLORS.muted;
  ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  for (let i = 0; i <= 3; i += 1) {
    const flow = yMax * i / 3;
    const y = plot.top + plot.height - flow / yMax * plot.height;
    ctx.fillText(formatNumber(flow, 2), plot.left - 6, y);
  }
  ctx.textAlign = "center";
  for (let i = 0; i <= 4; i += 1) {
    const density = xMax * i / 4;
    const x = plot.left + density / xMax * plot.width;
    ctx.fillText(formatNumber(density, 2), x, plot.top + plot.height + 16);
  }
  ctx.fillText(text.densityRho, plot.left + plot.width / 2, plot.top + plot.height + 30);
  ctx.save();
  ctx.translate(13, plot.top + plot.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(text.flowQ, 0, 0);
  ctx.restore();
  ctx.restore();
}

function drawMiniChartLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  ctx.save();
  ctx.font = "800 10px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(5,9,8,0.88)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawXT(canvas: HTMLCanvasElement | null, snapshot: SimulatorSnapshot, options: SimulatorOptions, locale: Locale) {
  const canvasData = canvasContext(canvas);
  if (!canvasData) return;
  const text = LIVE_TEXT[locale].canvas;
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
  drawLabel(ctx, text.trafficPosition, plot.left + plot.width / 2, height - 14, COLORS.muted, "center");
  drawLabel(ctx, text.time, 14, plot.top + plot.height / 2, COLORS.muted, "center");
}

function drawVelocity(canvas: HTMLCanvasElement | null, snapshot: SimulatorSnapshot, locale: Locale) {
  const canvasData = canvasContext(canvas);
  if (!canvasData) return;
  const text = LIVE_TEXT[locale].canvas;
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
  drawLabel(ctx, text.carNumber, plot.left + plot.width / 2, height - 14, COLORS.muted, "center");
}

function drawHeadway(canvas: HTMLCanvasElement | null, snapshot: SimulatorSnapshot, locale: Locale) {
  const max = Math.max(5, snapshot.headwayP90 * 1.7, snapshot.meanHeadway * 3);
  drawHistogram(canvas, snapshot.headways, 24, 0, max, COLORS.green, LIVE_TEXT[locale].canvas.headway);
}

function drawSpeed(canvas: HTMLCanvasElement | null, snapshot: SimulatorSnapshot, locale: Locale) {
  const max = Math.max(2.05, snapshot.maxSpeed * 1.2);
  drawHistogram(canvas, snapshot.v, 24, 0, max, COLORS.amber, LIVE_TEXT[locale].canvas.velocity);
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

function drawFourier(canvas: HTMLCanvasElement | null, snapshot: SimulatorSnapshot, locale: Locale) {
  const canvasData = canvasContext(canvas);
  if (!canvasData) return;
  const text = LIVE_TEXT[locale].canvas;
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
  drawLabel(ctx, text.time, plot.left + plot.width / 2, height - 14, COLORS.muted, "center");
}

function drawStability(canvas: HTMLCanvasElement | null, snapshot: SimulatorSnapshot, options: SimulatorOptions, locale: Locale) {
  const canvasData = canvasContext(canvas);
  if (!canvasData) return;
  const text = LIVE_TEXT[locale].canvas;
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
  drawLabel(ctx, text.headway, plot.left + plot.width / 2, height - 14, COLORS.muted, "center");
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
