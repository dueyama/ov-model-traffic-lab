"use client";

import Link from "next/link";
import katex from "katex";
import { useEffect, useMemo, useRef, useState } from "react";
import { LocaleSwitch } from "./LocaleSwitch";
import { BANDO_PAPER_URL, GitHubLink } from "./ExternalLinks";
import { COMMON_TEXT, DIAGRAM_TEXT, presetText, useLocalePreference, type Locale } from "../lib/i18n";
import {
  DEFAULT_OPTIONS,
  OVSimulator,
  PRESETS,
  PRESET_ORDER,
  type PresetName,
  type SimulatorOptions,
  makeHistogram,
  optimalVelocity,
  optimalVelocitySlope,
  presetMarkForName
} from "../lib/ov-core";

type DiagramPoint = {
  density: number;
  flow: number;
  speed: number;
  headway: number;
  stable: boolean;
};

type SimulationPoint = DiagramPoint & {
  carCount: number;
  roadLength: number;
  jamFraction: number;
  direction: "densityUp" | "densityDown";
};

type DirectionalSweeps = {
  densityUp: SimulationPoint[];
  densityDown: SimulationPoint[];
};

type SweepPhase = "idle" | "densityUp" | "densityDown" | "done";

type SweepStatus = {
  phase: SweepPhase;
  pointIndex: number;
  stepIndex: number;
  targetStepCount: number;
};

type MiniRingState = {
  direction: SimulationPoint["direction"];
  density: number;
  roadLength: number;
  avgSpeed: number;
  flow: number;
  jamFraction: number;
  positions: number[];
  velocities: number[];
};

type SweepAdvance = {
  done: boolean;
  stepIndex: number;
  targetStepCount: number;
  point: SimulationPoint | null;
  preview: MiniRingState;
};

type RelaxPlan = {
  minStepCount: number;
  maxStepCount: number;
};

const DIAGRAM_FORMULAS = [
  {
    labelKey: "density",
    tex: String.raw`\rho={N\over L}`
  },
  {
    labelKey: "uniformFlow",
    tex: String.raw`q(\rho)=\rho\,V\!\left({1\over\rho}\right)`
  },
  {
    labelKey: "stability",
    tex: String.raw`V'\!\left({1\over\rho}\right)\leq {a\over 2}`
  }
] as const;

const SWEEP_DENSITIES = Array.from({ length: 24 }, (_, index) => 0.1 + (0.86 - 0.1) * index / 23);
const EMPTY_SWEEPS: DirectionalSweeps = { densityUp: [], densityDown: [] };
const MIN_STABLE_STEPS = 2400;
const MAX_STABLE_STEPS = 6000;
const MIN_UNSTABLE_STEPS = 6000;
const MAX_UNSTABLE_STEPS = 18000;
const MIN_DENSE_ENTRY_STEPS = 12000;
const MAX_DENSE_ENTRY_STEPS = 30000;
const WARMUP_STEPS = 12000;
const STEADY_SAMPLE_COUNT = 36;
const STEPS_PER_TICK = 120;
const TICK_MS = 52;
const SWEEP_PERTURBATION_SCALE = 0.024;
const CONVERGENCE_FLOW_DELTA = 0.0035;
const CONVERGENCE_JAM_DELTA = 0.012;
const CONVERGENCE_HEADWAY_SPAN_DELTA = 0.025;
const TWO_PI = Math.PI * 2;

const COLORS = {
  ink: "#f2fff9",
  muted: "#91a19b",
  grid: "#2a3934",
  stable: "#2fe098",
  unstable: "#ff6358",
  curve: "#58a9ff",
  densityUp: "#ffb454",
  densityDown: "#bb8cff",
  purple: "#bb8cff"
};

export function FundamentalDiagram() {
  const { mode: localeMode, locale, setMode: setLocaleMode } = useLocalePreference();
  const text = DIAGRAM_TEXT[locale];
  const commonText = COMMON_TEXT[locale];
  const [options, setOptions] = useState<SimulatorOptions>({
    ...DEFAULT_OPTIONS,
    ...stripPresetMeta(PRESETS.bandoFigure),
    stepsPerFrame: 8
  });
  const [showSimulation, setShowSimulation] = useState(true);
  const [sweepRunId, setSweepRunId] = useState(0);
  const [sweeps, setSweeps] = useState<DirectionalSweeps>(EMPTY_SWEEPS);
  const [sweepStatus, setSweepStatus] = useState<SweepStatus>({
    phase: "idle",
    pointIndex: 0,
    stepIndex: 0,
    targetStepCount: MAX_STABLE_STEPS
  });
  const [miniRing, setMiniRing] = useState<MiniRingState | null>(null);
  const [hover, setHover] = useState<DiagramPoint | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const miniRingRef = useRef<HTMLCanvasElement | null>(null);

  const curve = useMemo(() => buildFundamentalCurve(options), [options]);
  const presetMarkers = useMemo(() => buildPresetMarkers(options, locale), [options, locale]);
  const capacity = useMemo(() => curve.reduce((best, point) => point.flow > best.flow ? point : best, curve[0]), [curve]);
  const hysteresisGap = useMemo(() => maxHysteresisGap(sweeps), [sweeps]);
  const sweepProgress = Math.round((sweepStatus.stepIndex / sweepStatus.targetStepCount) * 100);

  useEffect(() => {
    drawDiagram(canvasRef.current, curve, sweeps, presetMarkers, hover, locale);
  }, [curve, sweeps, presetMarkers, hover, locale]);

  useEffect(() => {
    const handleResize = () => drawDiagram(canvasRef.current, curve, sweeps, presetMarkers, hover, locale);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [curve, sweeps, presetMarkers, hover, locale]);

  useEffect(() => {
    drawMiniRing(miniRingRef.current, miniRing);
  }, [miniRing]);

  useEffect(() => {
    const handleResize = () => drawMiniRing(miniRingRef.current, miniRing);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [miniRing]);

  useEffect(() => {
    if (!showSimulation) {
      setSweeps(EMPTY_SWEEPS);
      setSweepStatus({ phase: "idle", pointIndex: 0, stepIndex: 0, targetStepCount: MAX_STABLE_STEPS });
      setMiniRing(null);
      return;
    }

    let cancelled = false;
    let timer: number | undefined;
    const upRunner = createLengthSweepRunner(options, SWEEP_DENSITIES, "densityUp");
    const downRunner = createLengthSweepRunner(options, SWEEP_DENSITIES.slice().reverse(), "densityDown");
    let activeRunner = upRunner;

    setSweeps({ densityUp: [], densityDown: [] });
    setSweepStatus({ phase: "densityUp", pointIndex: 1, stepIndex: 0, targetStepCount: upRunner.currentTargetStepCount() });
    setMiniRing(upRunner.preview());

    const animateSettledRing = () => {
      if (cancelled) return;
      const result = activeRunner.advance(STEPS_PER_TICK);
      setMiniRing(result.preview);
      timer = window.setTimeout(animateSettledRing, TICK_MS);
    };

    const tick = () => {
      if (cancelled) return;
      const result = activeRunner.advance(STEPS_PER_TICK);
      setMiniRing(result.preview);

      setSweepStatus({
        phase: activeRunner.direction,
        pointIndex: activeRunner.currentPointNumber(),
        stepIndex: result.stepIndex,
        targetStepCount: result.targetStepCount
      });

      if (result.point) {
        const point = result.point;
        setSweeps((current) => ({
          ...current,
          [point.direction]: [...current[point.direction], point]
        }));
      }

      if (result.done) {
        if (activeRunner.direction === "densityUp") {
          activeRunner = downRunner;
          setSweepStatus({ phase: "densityDown", pointIndex: 1, stepIndex: 0, targetStepCount: activeRunner.currentTargetStepCount() });
          setMiniRing(activeRunner.preview());
        } else {
          setSweepStatus({
            phase: "done",
            pointIndex: SWEEP_DENSITIES.length,
            stepIndex: activeRunner.currentTargetStepCount(),
            targetStepCount: activeRunner.currentTargetStepCount()
          });
          timer = window.setTimeout(animateSettledRing, TICK_MS);
          return;
        }
      }

      timer = window.setTimeout(tick, TICK_MS);
    };

    timer = window.setTimeout(tick, TICK_MS);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [options, showSimulation, sweepRunId]);

  const update = (patch: Partial<SimulatorOptions>) => {
    setOptions((current) => ({ ...current, ...patch }));
  };

  return (
    <main className="shell diagram-shell">
      <section className="hero-panel diagram-hero">
        <div className="hero-copy">
          <p className="eyebrow">{text.eyebrow}</p>
          <h1 className="title-lockup">
            <img className="title-icon" src="/ov-lab-icon.png" alt="" aria-hidden="true" />
            <span>{text.title}</span>
          </h1>
          <div className="formula-strip" aria-label={text.aria.formulas}>
            {DIAGRAM_FORMULAS.map((formula) => (
              <FormulaCard key={formula.labelKey} label={text.formulas[formula.labelKey]} tex={formula.tex} />
            ))}
          </div>
        </div>
        <div className="diagram-hero-actions">
          <div className="external-link-row">
            <GitHubLink label={commonText.githubRepo} />
            <LocaleSwitch mode={localeMode} locale={locale} onChange={setLocaleMode} compact />
          </div>
          <Link className="nav-pill" href="/">{text.liveSimulator}</Link>
          <div className="metric good">
            <span>{text.capacityPoint}</span>
            <strong>{formatNumber(capacity.density, 3)} / {formatNumber(capacity.flow, 3)}</strong>
          </div>
          <div className={`metric ${capacity.stable ? "good" : "bad"}`}>
            <span>{text.peakState}</span>
            <strong>{capacity.stable ? commonText.stable : commonText.unstable}</strong>
          </div>
          <div className="metric">
            <span>{text.maxLoopGap}</span>
            <strong>{formatNumber(hysteresisGap, 3)}</strong>
          </div>
        </div>
      </section>

      <section className="diagram-grid">
        <article className="diagram-console">
          <header className="console-topline">
            <div>
              <span className="section-kicker">{text.rhoQPlot}</span>
              <h2>{text.flowDensityDiagram}</h2>
            </div>
            <div className={`phase-badge ${sweepStatus.phase === "done" ? "" : "measuring"}`}>
              {showSimulation ? formatSweepStatus(sweepStatus, sweepProgress, locale) : text.status.idle}
            </div>
          </header>
          <div className="diagram-plot-wrap">
            <canvas
              ref={canvasRef}
              className="diagram-canvas"
              aria-label={text.aria.canvas}
              onMouseMove={(event) => {
                const point = nearestPoint(canvasRef.current, curve, event.clientX, event.clientY);
                setHover(point);
              }}
              onMouseLeave={() => setHover(null)}
            />
            <section className="plot-mini-ring" aria-label={text.aria.miniRing}>
              <div className="mini-ring-topline">
                <span>{text.ringPreview}</span>
                <strong>{miniRing ? formatNumber(miniRing.density, 3) : "--"}</strong>
              </div>
              <canvas
                ref={miniRingRef}
                className="mini-ring-canvas"
                aria-label={text.aria.miniRingCanvas}
              />
              <div className="mini-ring-stats">
                <div>
                  <span>{text.flow}</span>
                  <strong>{miniRing ? formatNumber(miniRing.flow, 3) : "--"}</strong>
                </div>
                <div>
                  <span>{text.jam}</span>
                  <strong>{miniRing ? formatPercent(miniRing.jamFraction) : "--"}</strong>
                </div>
                <div>
                  <span>{text.cars}</span>
                  <strong>{options.carCount}</strong>
                </div>
              </div>
            </section>
          </div>
          <div className="diagram-legend" aria-label={text.aria.legend}>
            <span><i className="legend-line curve" /> {text.legend.uniformFlowCurve}</span>
            <span><i className="legend-dot stable" /> {text.legend.stableRegion}</span>
            <span><i className="legend-dot unstable" /> {text.legend.unstableRegion}</span>
            <span><i className="legend-line density-up" /> {text.legend.densityUp}</span>
            <span><i className="legend-line density-down" /> {text.legend.densityDown}</span>
            <span><i className="legend-dot preset-marker" /> {text.legend.presetMarkers}</span>
          </div>
          <div className="preset-marker-key" aria-label={text.aria.presetMarkerKey}>
            {presetMarkers.map((marker) => (
              <span className="preset-marker-key-item" key={marker.label} title={marker.source}>
                <span className="preset-mark">{marker.mark}</span>
                <strong>{marker.label}</strong>
              </span>
            ))}
          </div>
        </article>

        <aside className="control-console diagram-controls" aria-label={text.aria.controls}>
          <div className="preset-grid" aria-label={text.aria.presets}>
            {PRESET_ORDER.map((preset) => (
              <button
                className="preset preset-choice"
                key={preset}
                type="button"
                onClick={() => setOptions({ ...options, ...stripPresetMeta(PRESETS[preset]) })}
                title={PRESETS[preset].source}
              >
                <span className="preset-mark preset-mark-compact">{presetMarkForName(preset)}</span>
                <span>{presetText(preset, locale).label}</span>
              </button>
            ))}
          </div>

          <section className="preset-info">
            <div className="preset-info-heading">
              <span>{text.readingCurve}</span>
              <strong>{text.fundamentalDiagram}</strong>
            </div>
            <p>{text.explanation}</p>
            <dl>
              <div>
                <dt>{text.measurement}</dt>
                <dd>{MIN_STABLE_STEPS}-{MAX_DENSE_ENTRY_STEPS} {text.measurementBody}</dd>
              </div>
              <div>
                <dt>{commonText.source}</dt>
                <dd><a href={BANDO_PAPER_URL} target="_blank" rel="noreferrer">{text.sourceBody}</a></dd>
              </div>
            </dl>
          </section>

          <label className="select-field">
            <span>{text.optimalVelocity}</span>
            <select
              value={options.model}
              onChange={(event) => update({ model: event.target.value as SimulatorOptions["model"] })}
            >
              <option value="bando">tanh(h - 2) + tanh(2)</option>
              <option value="normalized">normalized Bando</option>
              <option value="simple">tanh(h)</option>
            </select>
          </label>
          <ControlSlider label={text.sliders.carsN} value={options.carCount} min={30} max={150} step={1} onChange={(value) => update({ carCount: value })} />
          <ControlSlider label={text.sliders.sensitivity} value={options.sensitivity} min={0.2} max={2.4} step={0.01} onChange={(value) => update({ sensitivity: value })} />
          <ControlSlider label={text.sliders.velocityScale} value={options.velocityScale} min={0.3} max={2.4} step={0.01} onChange={(value) => update({ velocityScale: value })} />
          <ControlSlider label={text.sliders.headwayOffset} value={options.headwayOffset} min={0} max={5} step={0.01} onChange={(value) => update({ headwayOffset: value })} />

          <label className="toggle-field">
            <input
              type="checkbox"
              checked={showSimulation}
              onChange={(event) => setShowSimulation(event.target.checked)}
            />
            <span>{text.showSamples}</span>
          </label>
          <button
            className="preset replay-sweep"
            type="button"
            onClick={() => setSweepRunId((runId) => runId + 1)}
          >
            {text.replaySweep}
          </button>
        </aside>
      </section>

      <section className="chart-grid diagram-detail-grid">
        <article className="chart-shell">
          <header>
            <h3>{text.keyValues}</h3>
            <span>{commonText.derived}</span>
          </header>
          <div className="diagram-table-wrap">
            <table className="diagram-table">
              <thead>
                <tr>
                  <th>{text.table.presetItem}</th>
                  <th>{text.table.graphMark}</th>
                  <th>{text.table.rho}</th>
                  <th>{text.table.flowQ}</th>
                  <th>{text.table.headway}</th>
                  <th>{text.table.state}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{text.table.hysteresisGap}</td>
                  <td>-</td>
                  <td>-</td>
                  <td>{formatNumber(hysteresisGap, 3)}</td>
                  <td>-</td>
                  <td>{text.table.lSweep}</td>
                </tr>
                <tr>
                  <td>{text.table.capacity}</td>
                  <td>-</td>
                  <td>{formatNumber(capacity.density, 3)}</td>
                  <td>{formatNumber(capacity.flow, 3)}</td>
                  <td>{formatNumber(capacity.headway, 2)}</td>
                  <td>{capacity.stable ? commonText.stable : commonText.unstable}</td>
                </tr>
                {presetMarkers.map((marker) => (
                  <tr key={marker.label}>
                    <td>{marker.label}</td>
                    <td><span className="preset-mark">{marker.mark}</span></td>
                    <td>{formatNumber(marker.density, 3)}</td>
                    <td>{formatNumber(marker.flow, 3)}</td>
                    <td>{formatNumber(marker.headway, 2)}</td>
                    <td>{marker.stable ? commonText.stable : commonText.unstable}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="chart-shell">
          <header>
            <h3>{text.densityBands}</h3>
            <span>{commonText.stability}</span>
          </header>
          <DensityBandSummary curve={curve} locale={locale} />
        </article>
      </section>
    </main>
  );
}

function formatSweepStatus(status: SweepStatus, progress: number, locale: Locale) {
  const text = DIAGRAM_TEXT[locale].status;
  if (status.phase === "idle") return text.idle;
  if (status.phase === "done") return text.done;
  const direction = status.phase === "densityUp" ? text.densityUp : text.densityDown;
  return `${direction} ${status.pointIndex}/${SWEEP_DENSITIES.length} · relax ${Math.min(100, progress)}%`;
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
        <strong>{step < 1 ? value.toFixed(2) : Math.round(value)}</strong>
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

function DensityBandSummary({ curve, locale }: { curve: DiagramPoint[]; locale: Locale }) {
  const text = DIAGRAM_TEXT[locale].densitySummary;
  const bins = makeHistogram(curve.map((point) => point.density), 8, 0.08, 0.9);
  const stableCount = curve.filter((point) => point.stable).length;
  const unstableCount = curve.length - stableCount;
  return (
    <div className="density-summary">
      <p>{text.stableSamples}: <strong>{stableCount}</strong></p>
      <p>{text.unstableSamples}: <strong>{unstableCount}</strong></p>
      <div className="density-bars">
        {bins.map((bin) => {
          const center = (bin.x0 + bin.x1) / 2;
          const nearest = curve.reduce((best, point) => Math.abs(point.density - center) < Math.abs(best.density - center) ? point : best, curve[0]);
          return (
            <span
              className={nearest?.stable ? "stable" : "unstable"}
              key={`${bin.x0}-${bin.x1}`}
              title={`${formatNumber(bin.x0, 2)}-${formatNumber(bin.x1, 2)}`}
            />
          );
        })}
      </div>
    </div>
  );
}

function stripPresetMeta(preset: typeof PRESETS[PresetName]): Partial<SimulatorOptions> {
  const { label: _label, description: _description, source: _source, ...options } = preset;
  return options;
}

function buildFundamentalCurve(options: SimulatorOptions): DiagramPoint[] {
  const points: DiagramPoint[] = [];
  for (let i = 0; i <= 220; i += 1) {
    const density = 0.08 + (0.9 - 0.08) * i / 220;
    const headway = 1 / density;
    const speed = Math.max(0, optimalVelocity(headway, options));
    const slope = optimalVelocitySlope(headway, options);
    points.push({
      density,
      headway,
      speed,
      flow: density * speed,
      stable: slope <= options.sensitivity / 2
    });
  }
  return points;
}

function createLengthSweepRunner(
  options: SimulatorOptions,
  densities: number[],
  direction: SimulationPoint["direction"]
): {
  direction: SimulationPoint["direction"];
  currentPointNumber: () => number;
  currentTargetStepCount: () => number;
  preview: () => MiniRingState;
  advance: (stepCount: number) => SweepAdvance;
} {
  const carCount = options.carCount;
  const firstDensity = densities[0] ?? 0.2;
  const initialRoadLength = carCount / firstDensity;
  const sim = new OVSimulator({
    ...options,
    carCount,
    roadLength: initialRoadLength,
    noise: 0.004,
    perturbation: 0.12,
    sampleEvery: 40,
    maxSamples: 80
  });
  sim.step(WARMUP_STEPS);

  let densityIndex = 0;
  let stepsAtDensity = 0;
  let relaxPlan = relaxPlanForDensity(firstDensity, options, direction, densityIndex);
  let previousLength = initialRoadLength;

  const prepareDensity = () => {
    const density = densities[densityIndex];
    if (!density) return;
    const roadLength = carCount / density;
    setRoadLengthPreservingPhase(sim, previousLength, roadLength);
    seedSweepPerturbation(sim, densityIndex, direction, options);
    relaxPlan = relaxPlanForDensity(density, options, direction, densityIndex);
    previousLength = roadLength;
  };

  prepareDensity();

  return {
    direction,
    currentPointNumber: () => Math.min(densities.length, densityIndex + 1),
    currentTargetStepCount: () => relaxPlan.maxStepCount,
    preview: () => miniRingFromSnapshot(sim.snapshot(), direction),
    advance: (stepCount: number) => {
      if (densityIndex >= densities.length) {
        sim.step(stepCount);
        return {
          done: true,
          stepIndex: relaxPlan.maxStepCount,
          targetStepCount: relaxPlan.maxStepCount,
          point: null,
          preview: miniRingFromSnapshot(sim.snapshot(), direction)
        };
      }

      const steps = Math.min(stepCount, relaxPlan.maxStepCount - stepsAtDensity);
      sim.step(steps);
      stepsAtDensity += steps;
      const snapshot = sim.snapshot();
      const preview = miniRingFromSnapshot(snapshot, direction);
      const hasReachedMinimum = stepsAtDensity >= relaxPlan.minStepCount;
      const hasConverged = hasReachedMinimum && steadyWindowHasConverged(snapshot);
      const hasTimedOut = stepsAtDensity >= relaxPlan.maxStepCount;

      if (!hasConverged && !hasTimedOut) {
        return { done: false, stepIndex: stepsAtDensity, targetStepCount: relaxPlan.maxStepCount, point: null, preview };
      }

      const density = densities[densityIndex] ?? firstDensity;
      const roadLength = carCount / density;
      const completedTargetStepCount = relaxPlan.maxStepCount;
      const completedStepCount = stepsAtDensity;
      const steady = steadyWindowAverage(snapshot);
      const point: SimulationPoint = {
        carCount,
        roadLength,
        density: snapshot.density,
        headway: snapshot.meanHeadway,
        speed: steady.avgSpeed,
        flow: snapshot.density * steady.avgSpeed,
        stable: snapshot.stable,
        jamFraction: steady.jamFraction,
        direction
      };

      densityIndex += 1;
      stepsAtDensity = 0;
      prepareDensity();

      return {
        done: densityIndex >= densities.length,
        stepIndex: completedStepCount,
        targetStepCount: completedTargetStepCount,
        point,
        preview
      };
    }
  };
}

function relaxPlanForDensity(
  density: number,
  options: SimulatorOptions,
  direction: SimulationPoint["direction"],
  densityIndex: number
): RelaxPlan {
  const headway = 1 / density;
  const unstable = optimalVelocitySlope(headway, options) > options.sensitivity / 2;
  if (!unstable) {
    return {
      minStepCount: MIN_STABLE_STEPS,
      maxStepCount: MAX_STABLE_STEPS
    };
  }
  if (direction === "densityDown" && densityIndex === 0) {
    return {
      minStepCount: MIN_DENSE_ENTRY_STEPS,
      maxStepCount: MAX_DENSE_ENTRY_STEPS
    };
  }
  const denseWeight = Math.max(0, Math.min(1, (density - 0.42) / 0.44));
  return {
    minStepCount: Math.round(MIN_UNSTABLE_STEPS + (MIN_DENSE_ENTRY_STEPS - MIN_UNSTABLE_STEPS) * denseWeight),
    maxStepCount: Math.round(MAX_UNSTABLE_STEPS + (MAX_DENSE_ENTRY_STEPS - MAX_UNSTABLE_STEPS) * denseWeight)
  };
}

function seedSweepPerturbation(
  sim: OVSimulator,
  densityIndex: number,
  direction: SimulationPoint["direction"],
  options: SimulatorOptions
) {
  const count = sim.v.length;
  if (count === 0) return;
  const directionPhase = direction === "densityUp" ? 0 : Math.PI / 3;
  const mode = direction === "densityUp" ? 2 : 3;
  const amplitude = Math.max(0.006, options.velocityScale * SWEEP_PERTURBATION_SCALE);
  sim.v = sim.v.map((velocity, index) => {
    const phase = TWO_PI * mode * index / count + densityIndex * 0.61 + directionPhase;
    const ripple = Math.sin(phase) + 0.42 * Math.sin(phase * 2.7 + 0.4);
    const nextVelocity = velocity + amplitude * ripple;
    return options.clampVelocity ? Math.max(0, nextVelocity) : nextVelocity;
  });
}

function miniRingFromSnapshot(snapshot: ReturnType<OVSimulator["snapshot"]>, direction: SimulationPoint["direction"]): MiniRingState {
  return {
    direction,
    density: snapshot.density,
    roadLength: snapshot.meanHeadway * snapshot.x.length,
    avgSpeed: snapshot.avgSpeed,
    flow: snapshot.density * snapshot.avgSpeed,
    jamFraction: snapshot.jamFraction,
    positions: snapshot.x,
    velocities: snapshot.v
  };
}

function steadyWindowAverage(snapshot: ReturnType<OVSimulator["snapshot"]>) {
  const samples = snapshot.history.slice(-STEADY_SAMPLE_COUNT);
  if (samples.length === 0) {
    return {
      avgSpeed: snapshot.avgSpeed,
      jamFraction: snapshot.jamFraction
    };
  }
  return {
    avgSpeed: samples.reduce((total, sample) => total + sample.avgSpeed, 0) / samples.length,
    jamFraction: samples.reduce((total, sample) => total + sample.jamFraction, 0) / samples.length
  };
}

function steadyWindowHasConverged(snapshot: ReturnType<OVSimulator["snapshot"]>) {
  const samples = snapshot.history.slice(-STEADY_SAMPLE_COUNT);
  if (samples.length < STEADY_SAMPLE_COUNT) return false;
  const half = Math.floor(samples.length / 2);
  const first = samples.slice(0, half);
  const second = samples.slice(half);
  const firstAvg = averageHistoryWindow(first, snapshot.density);
  const secondAvg = averageHistoryWindow(second, snapshot.density);
  return Math.abs(firstAvg.flow - secondAvg.flow) <= CONVERGENCE_FLOW_DELTA &&
    Math.abs(firstAvg.jamFraction - secondAvg.jamFraction) <= CONVERGENCE_JAM_DELTA &&
    Math.abs(firstAvg.headwaySpan - secondAvg.headwaySpan) <= CONVERGENCE_HEADWAY_SPAN_DELTA;
}

function averageHistoryWindow(samples: ReturnType<OVSimulator["snapshot"]>["history"], density: number) {
  const length = Math.max(1, samples.length);
  const avgSpeed = samples.reduce((total, sample) => total + sample.avgSpeed, 0) / length;
  return {
    flow: density * avgSpeed,
    jamFraction: samples.reduce((total, sample) => total + sample.jamFraction, 0) / length,
    headwaySpan: samples.reduce((total, sample) => total + sample.maxHeadway - sample.minHeadway, 0) / length
  };
}

function setRoadLengthPreservingPhase(sim: OVSimulator, oldLength: number, newLength: number) {
  const scale = newLength / oldLength;
  sim.x = sim.x.map((position) => position * scale);
  sim.setOptions({ roadLength: newLength });
}

function buildPresetMarkers(options: SimulatorOptions, locale: Locale) {
  return PRESET_ORDER.map((presetName) => {
    const preset = PRESETS[presetName];
    const localized = presetText(presetName, locale);
    const presetOptions = { ...options, ...stripPresetMeta(preset) };
    const density = (presetOptions.carCount ?? options.carCount) / (presetOptions.roadLength ?? options.roadLength);
    const headway = 1 / density;
    const speed = Math.max(0, optimalVelocity(headway, presetOptions as SimulatorOptions));
    const stable = optimalVelocitySlope(headway, presetOptions as SimulatorOptions) <= (presetOptions.sensitivity ?? options.sensitivity) / 2;
    return {
      label: localized.label,
      mark: presetMarkForName(presetName),
      source: preset.source,
      density,
      headway,
      speed,
      flow: density * speed,
      stable
    };
  });
}

type PresetMarker = ReturnType<typeof buildPresetMarkers>[number];

function drawMiniRing(canvas: HTMLCanvasElement | null, state: MiniRingState | null) {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(240, Math.round(rect.width));
  const height = Math.max(150, Math.round(rect.height));
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#101918");
  background.addColorStop(1, "#070c0b");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2 + 4;
  const radius = Math.min(width, height) * 0.31;
  ctx.save();
  ctx.shadowColor = "rgba(47,224,152,0.12)";
  ctx.shadowBlur = 18;
  ctx.strokeStyle = "#192723";
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, TWO_PI);
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = "rgba(171,210,196,0.18)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 7]);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, TWO_PI);
  ctx.stroke();
  ctx.setLineDash([]);

  if (!state) {
    drawMiniRingLabel(ctx, cx, cy, ["rho", "--"]);
    return;
  }

  const sweepColor = state.direction === "densityUp" ? COLORS.densityUp : COLORS.densityDown;
  ctx.strokeStyle = sweepColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 14, -Math.PI / 2, -Math.PI / 2 + TWO_PI * Math.min(1, state.density / 0.9));
  ctx.stroke();

  const maxSpeed = Math.max(0.2, state.avgSpeed, ...state.velocities);
  const carWidth = Math.max(3.4, Math.min(6.2, radius * 0.09));
  const carHeight = Math.max(1.8, Math.min(3.2, radius * 0.045));
  const sampleEvery = state.positions.length > 130 ? 2 : 1;
  state.positions.forEach((position, index) => {
    if (index % sampleEvery !== 0) return;
    const angle = position / state.roadLength * TWO_PI - Math.PI / 2;
    const speed = state.velocities[index] ?? 0;
    const speedRatio = speed / maxSpeed;
    const color = speed < 0.12 ? COLORS.unstable : speedRatio < 0.45 ? COLORS.densityUp : COLORS.stable;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    drawMiniCar(ctx, x, y, angle + Math.PI / 2, color, carWidth, carHeight, speed < 0.12 ? 0.98 : 0.82);
  });

  drawMiniRingLabel(ctx, cx, cy, ["rho", formatNumber(state.density, 3)]);
}

function drawMiniRingLabel(ctx: CanvasRenderingContext2D, x: number, y: number, lines: [string, string]) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = COLORS.muted;
  ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(lines[0], x, y - 8);
  ctx.fillStyle = COLORS.ink;
  ctx.font = "700 17px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(lines[1], x, y + 10);
  ctx.restore();
}

function drawMiniCar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  color: string,
  width: number,
  height: number,
  alpha: number
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 5;
  roundedRect(ctx, -width / 2, -height / 2, width, height, Math.min(2, height / 2));
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(242,255,249,0.9)";
  ctx.fillRect(width * 0.22, -height * 0.32, width * 0.18, height * 0.64);
  ctx.restore();
}

function drawDiagram(
  canvas: HTMLCanvasElement | null,
  curve: DiagramPoint[],
  sweeps: DirectionalSweeps,
  presetMarkers: PresetMarker[],
  hover: DiagramPoint | null,
  locale: Locale
) {
  if (!canvas || curve.length === 0) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(320, Math.round(rect.width));
  const height = Math.max(280, Math.round(rect.height));
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const plot = { left: 64, top: 30, width: width - 96, height: height - 82 };
  const xMax = 0.92;
  const sweepPoints = [...sweeps.densityUp, ...sweeps.densityDown];
  const yMax = Math.max(0.1, Math.max(...curve.map((point) => point.flow), ...sweepPoints.map((point) => point.flow)) * 1.18);
  const xScale = (density: number) => plot.left + density / xMax * plot.width;
  const yScale = (flow: number) => plot.top + plot.height - flow / yMax * plot.height;

  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#111918");
  background.addColorStop(1, "#0c1110");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < curve.length - 1; i += 1) {
    const point = curve[i];
    const next = curve[i + 1];
    if (!point || !next) continue;
    ctx.fillStyle = point.stable ? "rgba(47,224,152,0.08)" : "rgba(255,99,88,0.10)";
    const x0 = xScale(point.density);
    const x1 = xScale(next.density);
    ctx.fillRect(x0, plot.top, Math.max(1, x1 - x0), plot.height);
  }

  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 6; i += 1) {
    const x = plot.left + plot.width * i / 6;
    ctx.beginPath();
    ctx.moveTo(x, plot.top);
    ctx.lineTo(x, plot.top + plot.height);
    ctx.stroke();
  }
  for (let i = 0; i <= 5; i += 1) {
    const y = plot.top + plot.height * i / 5;
    ctx.beginPath();
    ctx.moveTo(plot.left, y);
    ctx.lineTo(plot.left + plot.width, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "#71817a";
  ctx.beginPath();
  ctx.moveTo(plot.left, plot.top);
  ctx.lineTo(plot.left, plot.top + plot.height);
  ctx.lineTo(plot.left + plot.width, plot.top + plot.height);
  ctx.stroke();

  ctx.save();
  ctx.strokeStyle = COLORS.curve;
  ctx.shadowColor = "rgba(88,169,255,0.45)";
  ctx.shadowBlur = 12;
  ctx.lineWidth = 3;
  ctx.beginPath();
  curve.forEach((point, index) => {
    const x = xScale(point.density);
    const y = yScale(point.flow);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.restore();

  drawSweep(ctx, sweeps.densityUp, xScale, yScale, COLORS.densityUp, false);
  drawSweep(ctx, sweeps.densityDown, xScale, yScale, COLORS.densityDown, true);

  presetMarkers.forEach((point) => {
    drawPresetMarker(ctx, xScale(point.density), yScale(point.flow), point.stable ? COLORS.stable : COLORS.unstable, point.mark);
  });

  if (hover) {
    const x = xScale(hover.density);
    const y = yScale(hover.flow);
    ctx.strokeStyle = "rgba(242,255,249,0.35)";
    ctx.setLineDash([5, 6]);
    ctx.beginPath();
    ctx.moveTo(x, plot.top);
    ctx.lineTo(x, plot.top + plot.height);
    ctx.moveTo(plot.left, y);
    ctx.lineTo(plot.left + plot.width, y);
    ctx.stroke();
    ctx.setLineDash([]);
    drawPoint(ctx, x, y, COLORS.ink, 5);
    drawTooltip(ctx, x, y, [
      `rho ${formatNumber(hover.density, 3)}`,
      `q ${formatNumber(hover.flow, 3)}`,
      hover.stable ? COMMON_TEXT[locale].stable : COMMON_TEXT[locale].unstable
    ], width);
  }

  drawAxisLabels(ctx, plot, xMax, yMax, locale);
}

function drawAxisLabels(ctx: CanvasRenderingContext2D, plot: { left: number; top: number; width: number; height: number }, xMax: number, yMax: number, locale: Locale) {
  const text = DIAGRAM_TEXT[locale].canvas;
  ctx.fillStyle = COLORS.muted;
  ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(text.densityAxis, plot.left + plot.width / 2, plot.top + plot.height + 38);
  ctx.save();
  ctx.translate(18, plot.top + plot.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(text.flowAxis, 0, 0);
  ctx.restore();

  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  for (let i = 0; i <= 5; i += 1) {
    const flow = yMax * i / 5;
    const y = plot.top + plot.height - flow / yMax * plot.height;
    ctx.fillText(formatNumber(flow, 2), plot.left - 10, y);
  }
  ctx.textAlign = "center";
  for (let i = 0; i <= 6; i += 1) {
    const density = xMax * i / 6;
    const x = plot.left + density / xMax * plot.width;
    ctx.fillText(formatNumber(density, 2), x, plot.top + plot.height + 18);
  }
}

function drawPoint(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, radius: number) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSweep(
  ctx: CanvasRenderingContext2D,
  points: SimulationPoint[],
  xScale: (density: number) => number,
  yScale: (flow: number) => number,
  color: string,
  dashed: boolean
) {
  if (points.length === 0) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 9;
  ctx.lineWidth = 2.5;
  if (dashed) ctx.setLineDash([7, 7]);
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = xScale(point.density);
    const y = yScale(point.flow);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.setLineDash([]);
  points.forEach((point, index) => {
    drawPoint(ctx, xScale(point.density), yScale(point.flow), color, index % 3 === 0 ? 4.8 : 3.2);
  });
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  if (last && prev) drawArrowHead(ctx, xScale(prev.density), yScale(prev.flow), xScale(last.density), yScale(last.flow), color);
  ctx.restore();
}

function drawArrowHead(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string) {
  const angle = Math.atan2(y1 - y0, x1 - x0);
  const size = 9;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - size * Math.cos(angle - Math.PI / 6), y1 - size * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x1 - size * Math.cos(angle + Math.PI / 6), y1 - size * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = "#f2fff9";
  ctx.shadowColor = color;
  ctx.shadowBlur = 9;
  ctx.beginPath();
  ctx.moveTo(x, y - 6);
  ctx.lineTo(x + 6, y);
  ctx.lineTo(x, y + 6);
  ctx.lineTo(x - 6, y);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.stroke();
  ctx.restore();
}

function drawPresetMarker(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, mark: string) {
  drawDiamond(ctx, x, y, color);
  ctx.save();
  ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(5,9,8,0.86)";
  ctx.strokeText(mark, x + 9, y - 9);
  ctx.fillStyle = COLORS.ink;
  ctx.fillText(mark, x + 9, y - 9);
  ctx.restore();
}

function drawTooltip(ctx: CanvasRenderingContext2D, x: number, y: number, lines: string[], width: number) {
  const tooltipWidth = 126;
  const tooltipHeight = 62;
  const tx = Math.min(width - tooltipWidth - 14, x + 14);
  const ty = Math.max(14, y - tooltipHeight - 12);
  ctx.save();
  ctx.fillStyle = "rgba(5,9,8,0.9)";
  ctx.strokeStyle = "rgba(171,210,196,0.28)";
  ctx.lineWidth = 1;
  roundedRect(ctx, tx, ty, tooltipWidth, tooltipHeight, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = COLORS.ink;
  ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
  lines.forEach((line, index) => {
    ctx.fillText(line, tx + 10, ty + 18 + index * 16);
  });
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

function nearestPoint(canvas: HTMLCanvasElement | null, curve: DiagramPoint[], clientX: number, clientY: number) {
  if (!canvas || curve.length === 0) return null;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, Math.round(rect.width));
  const height = Math.max(280, Math.round(rect.height));
  const plot = { left: 64, top: 30, width: width - 96, height: height - 82 };
  const xMax = 0.92;
  const yMax = Math.max(0.1, Math.max(...curve.map((point) => point.flow)) * 1.18);
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  if (x < plot.left || x > plot.left + plot.width || y < plot.top || y > plot.top + plot.height) return null;
  const density = Math.max(0.08, Math.min(0.9, (x - plot.left) / plot.width * xMax));
  return curve.reduce((best, point) => Math.abs(point.density - density) < Math.abs(best.density - density) ? point : best, curve[0]);
}

function maxHysteresisGap(sweeps: DirectionalSweeps) {
  let gap = 0;
  for (const up of sweeps.densityUp) {
    const down = sweeps.densityDown.reduce<SimulationPoint | null>((best, point) => {
      if (!best) return point;
      return Math.abs(point.density - up.density) < Math.abs(best.density - up.density) ? point : best;
    }, null);
    if (down) gap = Math.max(gap, Math.abs(up.flow - down.flow));
  }
  return gap;
}

function formatNumber(value: number, digits = 2) {
  return Number(value).toFixed(digits);
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}
