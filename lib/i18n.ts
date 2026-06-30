"use client";

import { useEffect, useMemo, useState } from "react";
import type { PresetName } from "./ov-core";

export type LocaleMode = "auto" | "ja" | "en";
export type Locale = "ja" | "en";

const STORAGE_KEY = "ov-model-locale-mode";

export const LOCALE_MODES: LocaleMode[] = ["auto", "ja", "en"];

export function resolveLocale(mode: LocaleMode, browserLanguage?: string): Locale {
  if (mode === "ja" || mode === "en") return mode;
  return (browserLanguage ?? "").toLowerCase().startsWith("ja") ? "ja" : "en";
}

export function useLocalePreference() {
  const [mode, setModeState] = useState<LocaleMode>("auto");
  const [browserLanguage, setBrowserLanguage] = useState("en");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "auto" || saved === "ja" || saved === "en") {
      setModeState(saved);
    }
    setBrowserLanguage(window.navigator.language || "en");
  }, []);

  const locale = useMemo(() => resolveLocale(mode, browserLanguage), [mode, browserLanguage]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setMode = (nextMode: LocaleMode) => {
    setModeState(nextMode);
    window.localStorage.setItem(STORAGE_KEY, nextMode);
  };

  return { mode, locale, setMode };
}

export const COMMON_TEXT = {
  en: {
    auto: "AUTO",
    ja: "JP",
    en: "EN",
    language: "Language",
    resolvedLanguage: "Current language",
    stable: "stable",
    unstable: "unstable",
    wave: "wave",
    source: "source",
    params: "params",
    derived: "derived",
    stability: "stability",
    githubRepo: "Open GitHub repository",
    paperLink: "Open Bando et al. 1995 paper",
    paperShort: "Paper"
  },
  ja: {
    auto: "AUTO",
    ja: "JP",
    en: "EN",
    language: "言語",
    resolvedLanguage: "現在の言語",
    stable: "安定",
    unstable: "不安定",
    wave: "波",
    source: "出典",
    params: "パラメータ",
    derived: "算出値",
    stability: "安定性",
    githubRepo: "GitHub リポジトリを開く",
    paperLink: "Bando et al. 1995 の論文を開く",
    paperShort: "論文"
  }
} as const;

export const PRESET_TEXT: Record<PresetName, Record<Locale, { label: string; description: string }>> = {
  bandoFigure: {
    en: {
      label: "Bando 1995",
      description: "A reproduction-oriented preset based on the realistic model in the paper: N=100, L=200, a=1, with a small perturbation so a jam cluster can grow."
    },
    ja: {
      label: "Bando 1995",
      description: "論文の realistic model と同じ N=100, L=200, a=1 を基準に、小さな摂動から渋滞クラスターが発達する様子を見るための再現プリセット。"
    }
  },
  freeFlow: {
    en: {
      label: "Free flow",
      description: "A low-density comparison case. Disturbances decay and the system tends to return to nearly uniform flow."
    },
    ja: {
      label: "自由流",
      description: "車両数を少なくして平均車間距離を大きくした比較用ケース。密度波が減衰し、ほぼ一様流に戻る挙動を確認する。"
    }
  },
  denseJam: {
    en: {
      label: "Dense jam",
      description: "A higher-density comparison case where stopped clusters and faster cars separate clearly, making jam waves easy to see."
    },
    ja: {
      label: "高密度渋滞",
      description: "車両数を増やして高密度にした比較用ケース。停止に近い車群と速い車群に分かれ、渋滞波が見えやすい。"
    }
  },
  slowReaction: {
    en: {
      label: "Slow reaction",
      description: "A lower-sensitivity case. Smaller a makes the stability condition V'(b) <= a/2 harder to satisfy, so density disturbances grow more easily."
    },
    ja: {
      label: "低反応",
      description: "感度 a を下げたケース。反応が鈍いほど安定条件 V'(b) <= a/2 を満たしにくくなり、密度ゆらぎが成長しやすい。"
    }
  },
  simpleModel: {
    en: {
      label: "Simple model",
      description: "The simple V(h)=tanh(h) model. In the paper, this case is used to show breakdown with negative velocities rather than natural jams under unstable conditions."
    },
    ja: {
      label: "単純モデル",
      description: "V(h)=tanh(h) の単純モデル。論文では不安定条件で自然な渋滞ではなく負速度を伴う破綻が起こる例として扱われる。"
    }
  }
};

export function presetText(presetName: PresetName, locale: Locale) {
  return PRESET_TEXT[presetName][locale];
}

export const LIVE_TEXT = {
  en: {
    appEyebrow: "Bando Optimal Velocity Model",
    appTitle: "Traffic Jam Phase Lab",
    formulas: {
      motion: "motion",
      optimalVelocity: "optimal velocity",
      linearStability: "linear stability",
      headway: "headway"
    },
    navFundamental: "Fundamental diagram",
    metrics: {
      time: "time",
      density: "density",
      flow: "flow",
      state: "state",
      cars: "cars",
      length: "length",
      headway: "headway",
      avgSpeed: "avg speed",
      jamShare: "jam share",
      rho: "rho"
    },
    circularRoad: "circular road",
    liveRing: "Live Ring",
    linearStable: "linear stable",
    jamForming: "jam forming",
    rhoQMap: "rho-q map",
    uniformFlowTheory: "uniform-flow theory",
    controls: "simulation controls",
    run: "Run",
    pause: "Pause",
    reset: "Reset",
    step: "Step",
    runTitle: "Run simulation",
    pauseTitle: "Pause simulation",
    resetTitle: "Reset simulation",
    stepTitle: "Advance simulation",
    selectedPreset: "selected preset",
    customLabel: "Custom",
    customDescription: "A manually adjusted case using the current sliders. The dynamics still follow the selected V(h) and stability criterion.",
    sliders: {
      cars: "Cars",
      roadLength: "Road length",
      sensitivity: "Sensitivity a",
      velocityScale: "Velocity scale",
      headwayOffset: "Headway offset",
      perturbation: "Perturbation",
      noise: "Noise",
      speed: "Speed"
    },
    optimalVelocity: "Optimal velocity",
    nonnegativeVelocity: "nonnegative velocity",
    charts: {
      spaceTime: "Space-time trace",
      velocitySnapshot: "Velocity snapshot",
      headwayDistribution: "Headway distribution",
      velocityDistribution: "Velocity distribution",
      fourierModes: "Fourier modes",
      stabilityField: "Stability field"
    },
    reference: "reference / cite",
    aria: {
      formulas: "model equations",
      readouts: "main readouts",
      ring: "Animated circular road simulation",
      miniDiagram: "current point on the flow-density diagram",
      miniDiagramCanvas: "Small fundamental diagram with current simulation point",
      trafficMetrics: "traffic metrics",
      presets: "presets",
      presetDescription: "selected preset description",
      paperFigures: "paper figure views"
    },
    canvas: {
      detector: "detector",
      freeFlow: "FREE FLOW",
      densityWave: "DENSITY WAVE",
      jamShare: "jam share",
      uniformFlowCurve: "uniform-flow curve",
      nowQ: "now q",
      densityRho: "density rho",
      flowQ: "flow q",
      trafficPosition: "traffic position",
      time: "time",
      carNumber: "car number",
      headway: "headway",
      velocity: "velocity"
    }
  },
  ja: {
    appEyebrow: "Bando 最適速度モデル",
    appTitle: "渋滞相ラボ",
    formulas: {
      motion: "運動方程式",
      optimalVelocity: "最適速度",
      linearStability: "線形安定性",
      headway: "車頭間隔"
    },
    navFundamental: "基本図",
    metrics: {
      time: "時刻",
      density: "密度",
      flow: "流量",
      state: "状態",
      cars: "台数",
      length: "道路長",
      headway: "車頭間隔",
      avgSpeed: "平均速度",
      jamShare: "渋滞率",
      rho: "rho"
    },
    circularRoad: "円環道路",
    liveRing: "ライブリング",
    linearStable: "線形安定",
    jamForming: "渋滞形成中",
    rhoQMap: "rho-q 図",
    uniformFlowTheory: "一様流理論",
    controls: "シミュレーション操作",
    run: "再生",
    pause: "停止",
    reset: "リセット",
    step: "ステップ",
    runTitle: "シミュレーションを再生",
    pauseTitle: "シミュレーションを停止",
    resetTitle: "シミュレーションをリセット",
    stepTitle: "少し進める",
    selectedPreset: "選択中プリセット",
    customLabel: "カスタム",
    customDescription: "現在のスライダー値で走らせている手動調整ケース。物理モデルは選択中の V(h) と安定性条件に従う。",
    sliders: {
      cars: "車両数",
      roadLength: "道路長",
      sensitivity: "感度 a",
      velocityScale: "速度スケール",
      headwayOffset: "車頭間隔オフセット",
      perturbation: "摂動",
      noise: "ノイズ",
      speed: "再生速度"
    },
    optimalVelocity: "最適速度",
    nonnegativeVelocity: "速度を非負に制限",
    charts: {
      spaceTime: "時空間図",
      velocitySnapshot: "速度スナップショット",
      headwayDistribution: "車頭間隔分布",
      velocityDistribution: "速度分布",
      fourierModes: "フーリエモード",
      stabilityField: "安定性場"
    },
    reference: "参考文献 / CITE",
    aria: {
      formulas: "モデル方程式",
      readouts: "主要指標",
      ring: "円環道路シミュレーションのアニメーション",
      miniDiagram: "流量密度図上の現在位置",
      miniDiagramCanvas: "現在のシミュレーション点つきの小さな基本図",
      trafficMetrics: "交通指標",
      presets: "プリセット",
      presetDescription: "選択中プリセットの説明",
      paperFigures: "論文図の再現ビュー"
    },
    canvas: {
      detector: "検出器",
      freeFlow: "自由流",
      densityWave: "密度波",
      jamShare: "渋滞率",
      uniformFlowCurve: "一様流曲線",
      nowQ: "現在 q",
      densityRho: "密度 rho",
      flowQ: "流量 q",
      trafficPosition: "道路位置",
      time: "時間",
      carNumber: "車両番号",
      headway: "車頭間隔",
      velocity: "速度"
    }
  }
} as const;

export const DIAGRAM_TEXT = {
  en: {
    eyebrow: "Fundamental Diagram",
    title: "Density vs Flow",
    formulas: {
      density: "density",
      uniformFlow: "uniform flow",
      stability: "stability"
    },
    liveSimulator: "Live simulator",
    capacityPoint: "capacity point",
    peakState: "peak state",
    maxLoopGap: "max loop gap",
    rhoQPlot: "rho-q plot",
    flowDensityDiagram: "Flow-density diagram",
    ringPreview: "ring preview",
    flow: "flow",
    jam: "jam",
    cars: "cars",
    legend: {
      uniformFlowCurve: "uniform-flow curve",
      stableRegion: "stable region",
      unstableRegion: "unstable region",
      densityUp: "L decrease / density up",
      densityDown: "L increase / density down",
      presetMarkers: "preset markers"
    },
    readingCurve: "reading the curve",
    fundamentalDiagram: "fundamental diagram",
    explanation: "For uniform flow, the mean headway is b=L/N=1/rho, so the velocity is V(b) and the flow is q=rho V(1/rho). The sample paths keep N fixed, inherit the current state, and sweep L downward and upward separately. Each density is evolved before measurement. Red bands indicate densities that violate the linear stability condition.",
    measurement: "measurement",
    measurementBody: "steps per density; after the minimum, the sweep advances when final-window flow q, jam fraction, and headway spread stop changing.",
    sourceBody: "Bando et al. 1995, Sec. II B Eq. (3)-(7), stability criterion V'(b) <= a/2; Sec. IV discusses transport capacity.",
    optimalVelocity: "Optimal velocity",
    sliders: {
      carsN: "Cars N",
      sensitivity: "Sensitivity a",
      velocityScale: "Velocity scale",
      headwayOffset: "Headway offset"
    },
    showSamples: "show L-sweep samples",
    replaySweep: "Replay L sweep",
    keyValues: "Key values",
    densityBands: "Density bands",
    table: {
      presetItem: "preset / item",
      graphMark: "graph mark",
      rho: "rho",
      flowQ: "flow q",
      headway: "headway",
      state: "state",
      hysteresisGap: "hysteresis gap",
      capacity: "capacity",
      lSweep: "L sweep"
    },
    densitySummary: {
      stableSamples: "Stable samples",
      unstableSamples: "Unstable samples"
    },
    status: {
      idle: "q = rho V(1/rho)",
      done: "L sweep complete",
      densityUp: "L down / density up",
      densityDown: "L up / density down"
    },
    aria: {
      formulas: "fundamental diagram equations",
      canvas: "Density flow fundamental diagram",
      miniRing: "current L sweep ring animation",
      miniRingCanvas: "Small ring-road car animation for the current sweep density",
      legend: "chart legend",
      presetMarkerKey: "preset marker key",
      controls: "fundamental diagram controls",
      presets: "model presets"
    },
    canvas: {
      densityAxis: "density rho = N / L",
      flowAxis: "flow q"
    }
  },
  ja: {
    eyebrow: "基本図",
    title: "密度と流量",
    formulas: {
      density: "密度",
      uniformFlow: "一様流",
      stability: "安定性"
    },
    liveSimulator: "ライブシミュレータ",
    capacityPoint: "容量点",
    peakState: "ピーク状態",
    maxLoopGap: "最大ループ差",
    rhoQPlot: "rho-q プロット",
    flowDensityDiagram: "流量密度図",
    ringPreview: "リングプレビュー",
    flow: "流量",
    jam: "渋滞",
    cars: "台数",
    legend: {
      uniformFlowCurve: "一様流曲線",
      stableRegion: "安定領域",
      unstableRegion: "不安定領域",
      densityUp: "L 減少 / 密度上昇",
      densityDown: "L 増加 / 密度下降",
      presetMarkers: "プリセット記号"
    },
    readingCurve: "曲線の読み方",
    fundamentalDiagram: "基本図",
    explanation: "一様流では平均車間距離が b=L/N=1/rho なので、速度は V(b)、フローは q=rho V(1/rho) になります。点列は固定 N のまま状態を引き継ぎ、L を縮める方向と伸ばす方向を別々に走らせます。各密度で時間発展させてから測定します。赤い帯は線形安定条件を満たさない密度域です。",
    measurement: "測定",
    measurementBody: "steps per density; 最小ステップ後、最終窓の流量 q、渋滞率、車頭間隔の広がりがほぼ変化しなくなったら次の密度へ進みます。",
    sourceBody: "Bando et al. 1995, Sec. II B Eq. (3)-(7), stability criterion V'(b) <= a/2; Sec. IV discusses transport capacity.",
    optimalVelocity: "最適速度",
    sliders: {
      carsN: "車両数 N",
      sensitivity: "感度 a",
      velocityScale: "速度スケール",
      headwayOffset: "車頭間隔オフセット"
    },
    showSamples: "L 掃引サンプルを表示",
    replaySweep: "L 掃引を再実行",
    keyValues: "主要値",
    densityBands: "密度帯",
    table: {
      presetItem: "プリセット / 項目",
      graphMark: "記号",
      rho: "rho",
      flowQ: "流量 q",
      headway: "車頭間隔",
      state: "状態",
      hysteresisGap: "ヒステリシス差",
      capacity: "容量",
      lSweep: "L 掃引"
    },
    densitySummary: {
      stableSamples: "安定サンプル",
      unstableSamples: "不安定サンプル"
    },
    status: {
      idle: "q = rho V(1/rho)",
      done: "L 掃引完了",
      densityUp: "L 減少 / 密度上昇",
      densityDown: "L 増加 / 密度下降"
    },
    aria: {
      formulas: "基本図の方程式",
      canvas: "密度流量基本図",
      miniRing: "現在の L 掃引リングアニメーション",
      miniRingCanvas: "現在の掃引密度の小さな円環道路アニメーション",
      legend: "グラフ凡例",
      presetMarkerKey: "プリセット記号対応表",
      controls: "基本図コントロール",
      presets: "モデルプリセット"
    },
    canvas: {
      densityAxis: "密度 rho = N / L",
      flowAxis: "流量 q"
    }
  }
} as const;
