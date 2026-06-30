export type OvModel = "bando" | "normalized" | "simple";
export type InitialVelocity = "optimal" | "zero";

export type SimulatorOptions = {
  carCount: number;
  roadLength: number;
  sensitivity: number;
  dt: number;
  stepsPerFrame: number;
  velocityScale: number;
  headwayOffset: number;
  model: OvModel;
  perturbation: number;
  noise: number;
  initialVelocity: InitialVelocity;
  clampVelocity: boolean;
  sampleEvery: number;
  maxSamples: number;
  seed: number;
};

export type HistorySample = {
  t: number;
  x: number[];
  v: number[];
  headways: number[];
  modeAmplitudes: Record<number, number>;
  avgSpeed: number;
  jamFraction: number;
  minHeadway: number;
  maxHeadway: number;
};

export type SimulatorSnapshot = {
  t: number;
  x: number[];
  v: number[];
  headways: number[];
  density: number;
  meanHeadway: number;
  avgSpeed: number;
  minSpeed: number;
  maxSpeed: number;
  speedStd: number;
  minHeadway: number;
  maxHeadway: number;
  headwayP10: number;
  headwayP90: number;
  jamFraction: number;
  flow: number;
  slope: number;
  criticalSlope: number;
  stable: boolean;
  history: HistorySample[];
};

export type PresetName = "bandoFigure" | "freeFlow" | "denseJam" | "slowReaction" | "simpleModel";

export type Preset = Partial<SimulatorOptions> & {
  label: string;
};

const TWO_PI = Math.PI * 2;

export const DEFAULT_OPTIONS: SimulatorOptions = {
  carCount: 100,
  roadLength: 200,
  sensitivity: 1,
  dt: 0.05,
  stepsPerFrame: 8,
  velocityScale: 1,
  headwayOffset: 2,
  model: "bando",
  perturbation: 0.1,
  noise: 0.001,
  initialVelocity: "optimal",
  clampVelocity: true,
  sampleEvery: 8,
  maxSamples: 760,
  seed: 240715
};

export const PRESETS: Record<PresetName, Preset> = {
  bandoFigure: {
    label: "Bando 1995",
    carCount: 100,
    roadLength: 200,
    sensitivity: 1,
    velocityScale: 1,
    headwayOffset: 2,
    perturbation: 0.1,
    noise: 0.001,
    initialVelocity: "optimal",
    clampVelocity: true,
    model: "bando"
  },
  freeFlow: {
    label: "Free flow",
    carCount: 40,
    roadLength: 200,
    sensitivity: 1,
    velocityScale: 1,
    headwayOffset: 2,
    perturbation: 0.04,
    noise: 0,
    initialVelocity: "optimal",
    clampVelocity: true,
    model: "bando"
  },
  denseJam: {
    label: "Dense jam",
    carCount: 125,
    roadLength: 200,
    sensitivity: 1,
    velocityScale: 1,
    headwayOffset: 2,
    perturbation: 0.12,
    noise: 0.006,
    initialVelocity: "optimal",
    clampVelocity: true,
    model: "bando"
  },
  slowReaction: {
    label: "Slow reaction",
    carCount: 86,
    roadLength: 200,
    sensitivity: 0.52,
    velocityScale: 1,
    headwayOffset: 2,
    perturbation: 0.16,
    noise: 0.004,
    initialVelocity: "optimal",
    clampVelocity: true,
    model: "bando"
  },
  simpleModel: {
    label: "Simple model",
    carCount: 100,
    roadLength: 50,
    sensitivity: 1,
    velocityScale: 1,
    headwayOffset: 0,
    perturbation: 0.1,
    noise: 0,
    initialVelocity: "optimal",
    clampVelocity: false,
    model: "simple"
  }
};

export type HistogramBin = {
  x0: number;
  x1: number;
  count: number;
};

function mergeOptions(base: SimulatorOptions, patch?: Partial<SimulatorOptions>): SimulatorOptions {
  const next = { ...base, ...(patch ?? {}) };
  next.carCount = Math.max(2, Math.round(next.carCount));
  next.roadLength = Math.max(10, Number(next.roadLength));
  next.sensitivity = Math.max(0.01, Number(next.sensitivity));
  next.dt = Math.max(0.001, Number(next.dt));
  next.stepsPerFrame = Math.max(1, Math.round(next.stepsPerFrame));
  next.velocityScale = Math.max(0.05, Number(next.velocityScale));
  next.headwayOffset = Math.max(0, Number(next.headwayOffset));
  next.perturbation = Math.max(0, Number(next.perturbation));
  next.noise = Math.max(0, Number(next.noise));
  next.sampleEvery = Math.max(1, Math.round(next.sampleEvery));
  next.maxSamples = Math.max(60, Math.round(next.maxSamples));
  return next;
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wrapPosition(x: number, length: number) {
  const wrapped = x % length;
  return wrapped < 0 ? wrapped + length : wrapped;
}

function percentile(values: number[], q: number) {
  if (!values.length) return 0;
  const sorted = values.toSorted((a, b) => a - b);
  const index = (sorted.length - 1) * q;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) return sorted[low] ?? 0;
  return (sorted[low] ?? 0) * (high - index) + (sorted[high] ?? 0) * (index - low);
}

export function mean(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function standardDeviation(values: number[]) {
  if (!values.length) return 0;
  const avg = mean(values);
  const variance = values.reduce((total, value) => total + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function optimalVelocity(headway: number, options: SimulatorOptions) {
  if (options.model === "simple") {
    return options.velocityScale * Math.tanh(headway);
  }
  if (options.model === "normalized") {
    const denominator = 1 + Math.tanh(options.headwayOffset);
    return options.velocityScale *
      (Math.tanh(headway - options.headwayOffset) + Math.tanh(options.headwayOffset)) /
      denominator;
  }
  return options.velocityScale *
    (Math.tanh(headway - options.headwayOffset) + Math.tanh(options.headwayOffset));
}

export function optimalVelocitySlope(headway: number, options: SimulatorOptions) {
  if (options.model === "simple") {
    const simpleTanh = Math.tanh(headway);
    return options.velocityScale * (1 - simpleTanh * simpleTanh);
  }
  const shiftedTanh = Math.tanh(headway - options.headwayOffset);
  let slope = options.velocityScale * (1 - shiftedTanh * shiftedTanh);
  if (options.model === "normalized") {
    slope /= 1 + Math.tanh(options.headwayOffset);
  }
  return slope;
}

export function headwaysFor(positions: number[], length: number) {
  const headways = new Array<number>(positions.length);
  for (let n = 0; n < positions.length; n += 1) {
    const ahead = positions[(n + 1) % positions.length] ?? 0;
    let dx = ahead - (positions[n] ?? 0);
    if (dx <= 0) dx += length;
    headways[n] = dx;
  }
  return headways;
}

export function fourierAmplitude(values: number[], mode: number) {
  const n = values.length;
  if (!n) return 0;
  const avg = mean(values);
  let c = 0;
  let s = 0;
  for (let i = 0; i < n; i += 1) {
    const phase = TWO_PI * mode * i / n;
    const y = (values[i] ?? 0) - avg;
    c += y * Math.cos(phase);
    s += y * Math.sin(phase);
  }
  return Math.sqrt(c * c + s * s) / n;
}

export function makeHistogram(values: number[], binCount: number, minValue?: number, maxValue?: number): HistogramBin[] {
  let min = Number.isFinite(minValue) ? Number(minValue) : Math.min(...values);
  let max = Number.isFinite(maxValue) ? Number(maxValue) : Math.max(...values);
  if (!values.length) {
    min = 0;
    max = 1;
  }
  if (max <= min) max = min + 1;
  const bins = Array.from({ length: binCount }, (_, index) => ({
    x0: min + (max - min) * index / binCount,
    x1: min + (max - min) * (index + 1) / binCount,
    count: 0
  }));
  for (const value of values) {
    const raw = Math.floor((value - min) / (max - min) * binCount);
    const index = Math.max(0, Math.min(binCount - 1, raw));
    const bin = bins[index];
    if (bin) bin.count += 1;
  }
  return bins;
}

export class OVSimulator {
  options: SimulatorOptions;
  x: number[];
  v: number[];
  private nextX: number[];
  private nextV: number[];
  private t = 0;
  private stepIndex = 0;
  private crossings = 0;
  private history: HistorySample[] = [];

  constructor(options?: Partial<SimulatorOptions>) {
    this.options = mergeOptions(DEFAULT_OPTIONS, options);
    this.x = [];
    this.v = [];
    this.nextX = [];
    this.nextV = [];
    this.reset();
  }

  setOptions(options: Partial<SimulatorOptions>) {
    this.options = mergeOptions(this.options, options);
  }

  reset(options?: Partial<SimulatorOptions>) {
    if (options) this.setOptions(options);
    const opts = this.options;
    const rng = mulberry32(opts.seed);
    const spacing = opts.roadLength / opts.carCount;
    this.x = new Array<number>(opts.carCount);
    this.v = new Array<number>(opts.carCount);
    this.nextX = new Array<number>(opts.carCount);
    this.nextV = new Array<number>(opts.carCount);
    this.t = 0;
    this.stepIndex = 0;
    this.crossings = 0;
    this.history = [];
    for (let n = 0; n < opts.carCount; n += 1) {
      const jitter = (rng() - 0.5) * opts.noise * spacing;
      this.x[n] = wrapPosition(n * spacing + jitter, opts.roadLength);
    }
    this.x[0] = wrapPosition((this.x[0] ?? 0) + opts.perturbation, opts.roadLength);
    this.x.sort((a, b) => a - b);
    const headways = headwaysFor(this.x, opts.roadLength);
    for (let i = 0; i < opts.carCount; i += 1) {
      this.v[i] = opts.initialVelocity === "zero" ? 0 : optimalVelocity(headways[i] ?? spacing, opts);
    }
    this.recordSample();
  }

  step(count = 1) {
    for (let iter = 0; iter < count; iter += 1) {
      this.stepOnce();
    }
  }

  private stepOnce() {
    const opts = this.options;
    const headways = headwaysFor(this.x, opts.roadLength);
    for (let n = 0; n < opts.carCount; n += 1) {
      const desired = optimalVelocity(headways[n] ?? 0, opts);
      let velocity = (this.v[n] ?? 0) + opts.dt * opts.sensitivity * (desired - (this.v[n] ?? 0));
      if (opts.clampVelocity && velocity < 0) velocity = 0;
      const previous = this.x[n] ?? 0;
      const position = wrapPosition(previous + opts.dt * (this.v[n] ?? 0), opts.roadLength);
      if (position < previous && (this.v[n] ?? 0) > 0) this.crossings += 1;
      this.nextV[n] = velocity;
      this.nextX[n] = position;
    }
    [this.x, this.nextX] = [this.nextX, this.x];
    [this.v, this.nextV] = [this.nextV, this.v];
    this.t += opts.dt;
    this.stepIndex += 1;
    if (this.stepIndex % opts.sampleEvery === 0) this.recordSample();
  }

  private recordSample() {
    const opts = this.options;
    const headways = headwaysFor(this.x, opts.roadLength);
    const modes = [1, 2, 3, 4, 5, 10, 20, 30, 40, 50].filter((mode) => mode < opts.carCount);
    const modeAmplitudes: Record<number, number> = {};
    for (const mode of modes) {
      modeAmplitudes[mode] = fourierAmplitude(headways, mode);
    }
    this.history.push({
      t: this.t,
      x: this.x.slice(),
      v: this.v.slice(),
      headways,
      modeAmplitudes,
      avgSpeed: mean(this.v),
      jamFraction: this.v.filter((velocity) => velocity < 0.12).length / this.v.length,
      minHeadway: Math.min(...headways),
      maxHeadway: Math.max(...headways)
    });
    if (this.history.length > opts.maxSamples) {
      this.history.splice(0, this.history.length - opts.maxSamples);
    }
  }

  snapshot(): SimulatorSnapshot {
    const opts = this.options;
    const headways = headwaysFor(this.x, opts.roadLength);
    const avgSpeed = mean(this.v);
    const meanHeadway = opts.roadLength / opts.carCount;
    const slope = optimalVelocitySlope(meanHeadway, opts);
    const criticalSlope = opts.sensitivity / 2;
    const elapsed = Math.max(opts.dt, this.t);
    return {
      t: this.t,
      x: this.x.slice(),
      v: this.v.slice(),
      headways,
      density: opts.carCount / opts.roadLength,
      meanHeadway,
      avgSpeed,
      minSpeed: Math.min(...this.v),
      maxSpeed: Math.max(...this.v),
      speedStd: standardDeviation(this.v),
      minHeadway: Math.min(...headways),
      maxHeadway: Math.max(...headways),
      headwayP10: percentile(headways, 0.1),
      headwayP90: percentile(headways, 0.9),
      jamFraction: this.v.filter((velocity) => velocity < 0.12).length / this.v.length,
      flow: this.crossings / elapsed,
      slope,
      criticalSlope,
      stable: slope <= criticalSlope,
      history: this.history.slice()
    };
  }
}
