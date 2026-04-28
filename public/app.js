const requestedMode = typeof window !== "undefined"
  ? new URLSearchParams(window.location.search).get("mode")
  : null;
const isRealRendererMode = typeof requestedMode === "string" && requestedMode.startsWith("real-");
const REAL_ADAPTER_WAIT_MS = 5000;
const REAL_ADAPTER_LOAD_MS = 20000;

function withTimeout(promise, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs} ms`)), timeoutMs);
    promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    }, (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function findRegisteredRealRenderer() {
  const registry = typeof window !== "undefined" ? window.__aiWebGpuLabRendererRegistry : null;
  if (!registry || typeof registry.list !== "function") return null;
  return registry.list().find((adapter) => adapter && adapter.isReal === true) || null;
}

async function awaitRealRenderer(timeoutMs = REAL_ADAPTER_WAIT_MS) {
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeoutMs) {
    const adapter = findRegisteredRealRenderer();
    if (adapter) return adapter;
    if (typeof window !== "undefined" && window.__aiWebGpuLabRealThreeBootstrapError) {
      return null;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

const state = {
  startedAt: performance.now(),
  environment: buildEnvironment(),
  capability: null,
  run: null,
  active: false,
  realAdapterError: null,
  logs: []
};

const elements = {
  statusRow: document.getElementById("status-row"),
  summary: document.getElementById("summary"),
  probeCapability: document.getElementById("probe-capability"),
  runScene: document.getElementById("run-scene"),
  downloadJson: document.getElementById("download-json"),
  canvas: document.getElementById("scene-canvas"),
  metricGrid: document.getElementById("metric-grid"),
  metaGrid: document.getElementById("meta-grid"),
  logList: document.getElementById("log-list"),
  resultJson: document.getElementById("result-json")
};

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function parseBrowser() {
  const ua = navigator.userAgent;
  for (const [needle, name] of [["Edg/", "Edge"], ["Chrome/", "Chrome"], ["Firefox/", "Firefox"], ["Version/", "Safari"]]) {
    const marker = ua.indexOf(needle);
    if (marker >= 0) return { name, version: ua.slice(marker + needle.length).split(/[\s)/;]/)[0] || "unknown" };
  }
  return { name: "Unknown", version: "unknown" };
}

function parseOs() {
  const ua = navigator.userAgent;
  if (/Windows NT/i.test(ua)) return { name: "Windows", version: (ua.match(/Windows NT ([0-9.]+)/i) || [])[1] || "unknown" };
  if (/Mac OS X/i.test(ua)) return { name: "macOS", version: ((ua.match(/Mac OS X ([0-9_]+)/i) || [])[1] || "unknown").replace(/_/g, ".") };
  if (/Linux/i.test(ua)) return { name: "Linux", version: "unknown" };
  return { name: "Unknown", version: "unknown" };
}

function inferDeviceClass() {
  const threads = navigator.hardwareConcurrency || 0;
  const memory = navigator.deviceMemory || 0;
  if (memory >= 16 && threads >= 12) return "desktop-high";
  if (memory >= 8 && threads >= 8) return "desktop-mid";
  if (threads >= 4) return "laptop";
  return "unknown";
}

function buildEnvironment() {
  return {
    browser: parseBrowser(),
    os: parseOs(),
    device: {
      name: navigator.platform || "unknown",
      class: inferDeviceClass(),
      cpu: navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} threads` : "unknown",
      memory_gb: navigator.deviceMemory || undefined,
      power_mode: "unknown"
    },
    gpu: { adapter: "pending", required_features: [], limits: {} },
    backend: "pending",
    fallback_triggered: false,
    worker_mode: "main",
    cache_state: "warm"
  };
}

function log(message) {
  state.logs.unshift(`[${new Date().toLocaleTimeString()}] ${message}`);
  state.logs = state.logs.slice(0, 12);
  renderLogs();
}

async function probeCapability() {
  if (state.active) return;
  state.active = true;
  render();
  const hasWebGpu = typeof navigator !== "undefined" && Boolean(navigator.gpu);
  const limits = hasWebGpu ? { maxTextureDimension2D: 8192, maxBindGroups: 4 } : {};
  state.capability = {
    hasWebGpu,
    adapter: hasWebGpu ? "navigator.gpu available" : "webgl-fallback",
    requiredFeatures: hasWebGpu ? ["shader-f16"] : []
  };
  state.environment.gpu = {
    adapter: state.capability.adapter,
    required_features: state.capability.requiredFeatures,
    limits
  };
  state.environment.backend = hasWebGpu ? "webgpu" : "webgl";
  state.environment.fallback_triggered = !hasWebGpu;
  state.active = false;
  log(hasWebGpu ? "WebGPU capability detected for scene readiness." : "navigator.gpu unavailable. Scene readiness will record a fallback path.");
  render();
}

function projectPoint(point, angle, width, height) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const x = point[0] * cos - point[2] * sin;
  const z = point[0] * sin + point[2] * cos + 4.2;
  const y = point[1] * Math.cos(angle * 0.7) - point[2] * Math.sin(angle * 0.7);
  const scale = 220 / z;
  return {
    x: width / 2 + x * scale,
    y: height / 2 + y * scale
  };
}

function drawFrame(ctx, angle, frameIndex) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#050912";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(96, 165, 250, 0.42)";
  ctx.lineWidth = 1.2;

  const points = [];
  for (let index = 0; index < 24; index += 1) {
    const ring = Math.floor(index / 8);
    const theta = (index % 8) / 8 * Math.PI * 2 + angle * (0.9 + ring * 0.15);
    const radius = 0.9 + ring * 0.45;
    points.push([
      Math.cos(theta) * radius,
      (ring - 1) * 0.6 + Math.sin(theta * 1.5) * 0.14,
      Math.sin(theta) * radius
    ]);
  }

  const projected = points.map((point) => projectPoint(point, angle, width, height));
  for (let index = 0; index < projected.length; index += 1) {
    const current = projected[index];
    const next = projected[(index + 1) % projected.length];
    ctx.beginPath();
    ctx.moveTo(current.x, current.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
  }

  ctx.fillStyle = "#bfdbfe";
  for (const point of projected) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(191, 219, 254, 0.9)";
  ctx.font = "14px Segoe UI";
  ctx.fillText(`frame ${frameIndex + 1}/96`, 18, 28);
  ctx.fillText(state.environment.backend === "webgpu" ? "synthetic webgpu path" : "fallback path", 18, 48);
}

async function runRealRendererBaseline(adapter) {
  log(`Connecting real renderer adapter '${adapter.id}'.`);
  const startedAt = performance.now();
  const sceneLoadStartedAt = performance.now();
  const realCanvas = document.createElement("canvas");
  realCanvas.width = elements.canvas.width;
  realCanvas.height = elements.canvas.height;
  realCanvas.style.display = "none";
  document.body.appendChild(realCanvas);
  try {
    await withTimeout(
      Promise.resolve(adapter.createRenderer({ canvas: realCanvas })),
      REAL_ADAPTER_LOAD_MS,
      `createRenderer(${adapter.id})`
    );
    await withTimeout(
      Promise.resolve(adapter.loadScene({ nodeCount: 24 })),
      REAL_ADAPTER_LOAD_MS,
      `loadScene(${adapter.id})`
    );
    const sceneLoadMs = performance.now() - sceneLoadStartedAt;

    const frameTimes = [];
    for (let index = 0; index < 32; index += 1) {
      const frameInfo = await withTimeout(
        Promise.resolve(adapter.renderFrame({ frameIndex: index })),
        REAL_ADAPTER_LOAD_MS,
        `renderFrame(${adapter.id})`
      );
      frameTimes.push(typeof frameInfo?.frameMs === "number" ? frameInfo.frameMs : 0);
    }

    const totalMs = performance.now() - startedAt;
    const avgFrame = frameTimes.reduce((sum, value) => sum + value, 0) / Math.max(frameTimes.length, 1);
    return {
      totalMs,
      sceneLoadMs,
      avgFps: 1000 / Math.max(avgFrame, 0.001),
      p95FrameMs: percentile(frameTimes, 0.95) || 0,
      frameTimes,
      nodeCount: 24,
      sampleCount: frameTimes.length,
      realAdapter: adapter
    };
  } finally {
    realCanvas.remove();
  }
}

async function runSceneBaseline() {
  if (state.active) return;
  if (!state.capability) {
    await probeCapability();
  }

  state.active = true;
  state.realAdapterError = null;
  render();

  if (isRealRendererMode) {
    log(`Mode=${requestedMode} requested; awaiting real renderer adapter registration.`);
    const adapter = await awaitRealRenderer();
    if (adapter) {
      try {
        state.run = await runRealRendererBaseline(adapter);
        state.active = false;
        log(`Real renderer '${adapter.id}' complete: avg fps ${round(state.run.avgFps, 2)}, p95 frame ${round(state.run.p95FrameMs, 2)} ms.`);
        render();
        return;
      } catch (error) {
        state.realAdapterError = error?.message || String(error);
        log(`Real renderer '${adapter.id}' failed: ${state.realAdapterError}; falling back to deterministic.`);
      }
    } else {
      const reason = (typeof window !== "undefined" && window.__aiWebGpuLabRealThreeBootstrapError) || "timed out waiting for adapter registration";
      state.realAdapterError = reason;
      log(`No real renderer adapter registered (${reason}); falling back to deterministic scene baseline.`);
    }
  }

  const ctx = elements.canvas.getContext("2d");
  const frameTimes = [];
  const startedAt = performance.now();
  const sceneLoadStartedAt = performance.now();
  await new Promise((resolve) => setTimeout(resolve, state.environment.fallback_triggered ? 48 : 26));
  const sceneLoadMs = performance.now() - sceneLoadStartedAt;

  let previous = performance.now();
  for (let index = 0; index < 96; index += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const now = performance.now();
    frameTimes.push(now - previous);
    previous = now;
    drawFrame(ctx, index * 0.05, index);
  }

  const totalMs = performance.now() - startedAt;
  const avgFrame = frameTimes.reduce((sum, value) => sum + value, 0) / Math.max(frameTimes.length, 1);
  state.run = {
    totalMs,
    sceneLoadMs,
    avgFps: 1000 / Math.max(avgFrame, 0.001),
    p95FrameMs: percentile(frameTimes, 0.95) || 0,
    frameTimes,
    nodeCount: 24,
    sampleCount: frameTimes.length,
    realAdapter: null
  };
  state.active = false;
  log(`Scene readiness complete: avg fps ${round(state.run.avgFps, 2)}, p95 frame ${round(state.run.p95FrameMs, 2)} ms.`);
  render();
}

function describeRendererAdapter() {
  const registry = typeof window !== "undefined" ? window.__aiWebGpuLabRendererRegistry : null;
  const requested = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("mode")
    : null;
  if (registry) {
    return registry.describe(requested);
  }
  return {
    id: "deterministic-three-style",
    label: "Deterministic Three-style",
    status: "deterministic",
    isReal: false,
    version: "1.0.0",
    capabilities: ["scene-load", "frame-pace", "fallback-record"],
    backendHint: "synthetic",
    message: "Renderer adapter registry unavailable; using inline deterministic mock."
  };
}

function buildResult() {
  const run = state.run;
  const isRealRun = Boolean(run && run.realAdapter);
  let realFallbackNote = "";
  if (isRealRendererMode && !isRealRun) {
    realFallbackNote = state.realAdapterError
      ? `; realAdapter=fallback(${state.realAdapterError})`
      : "; realAdapter=fallback(unavailable)";
  }
  return {
    meta: {
      repo: "exp-three-webgpu-core",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "graphics",
      scenario: run
        ? (isRealRun ? `three-webgpu-scene-real-${run.realAdapter.id}` : "three-webgpu-scene-readiness")
        : "three-webgpu-scene-pending",
      notes: run
        ? `nodeCount=${run.nodeCount}; samples=${run.sampleCount}; backend=${state.environment.backend}; fallback=${state.environment.fallback_triggered}${isRealRun ? `; realAdapter=${run.realAdapter.id}` : realFallbackNote}`
        : "Probe capability and run the deterministic three-style scene baseline."
    },
    environment: state.environment,
    workload: {
      kind: "graphics",
      name: "three-scene-readiness",
      input_profile: "24-nodes-orbit-camera",
      model_id: "three-webgpu-core-readiness",
      resolution: `${elements.canvas.width}x${elements.canvas.height}`
    },
    metrics: {
      common: {
        time_to_interactive_ms: round(performance.now() - state.startedAt, 2) || 0,
        init_ms: run ? round(run.sceneLoadMs, 2) || 0 : 0,
        success_rate: run ? 1 : state.capability ? 0.5 : 0,
        peak_memory_note: navigator.deviceMemory ? `${navigator.deviceMemory} GB reported by browser` : "deviceMemory unavailable",
        error_type: ""
      },
      graphics: {
        avg_fps: run ? round(run.avgFps, 2) || 0 : 0,
        p95_frametime_ms: run ? round(run.p95FrameMs, 2) || 0 : 0,
        scene_load_ms: run ? round(run.sceneLoadMs, 2) || 0 : 0,
        resolution_scale: 1,
        visual_artifact_note: state.environment.fallback_triggered ? "fallback scene path" : "synthetic three-style orbit scene"
      }
    },
    status: run ? "success" : state.capability ? "partial" : "pending",
    artifacts: {
      raw_logs: state.logs.slice(0, 5),
      deploy_url: "https://ai-webgpu-lab.github.io/exp-three-webgpu-core/",
      renderer_adapter: describeRendererAdapter()
    }
  };
}

function renderStatus() {
  const badges = state.active
    ? ["Scene baseline running", state.environment.backend === "pending" ? "Capability pending" : state.environment.backend]
    : state.run
      ? ["Scene baseline complete", `${round(state.run.avgFps, 2)} fps`]
      : state.capability
        ? ["Capability captured", state.environment.backend]
        : ["Awaiting probe", "No baseline run"];
  elements.statusRow.innerHTML = "";
  for (const text of badges) {
    const node = document.createElement("span");
    node.className = "badge";
    node.textContent = text;
    elements.statusRow.appendChild(node);
  }
  elements.summary.textContent = state.run
    ? `Last run: ${round(state.run.avgFps, 2)} fps average, p95 frame ${round(state.run.p95FrameMs, 2)} ms, scene load ${round(state.run.sceneLoadMs, 2)} ms.`
    : "Probe capability first, then run the deterministic scene baseline to record init and frame pacing metrics.";
}

function renderMetrics() {
  const run = state.run;
  const cards = [
    ["Backend", state.environment.backend],
    ["Fallback", String(state.environment.fallback_triggered)],
    ["Avg FPS", run ? `${round(run.avgFps, 2)}` : "pending"],
    ["P95 Frame", run ? `${round(run.p95FrameMs, 2)} ms` : "pending"],
    ["Scene Load", run ? `${round(run.sceneLoadMs, 2)} ms` : "pending"],
    ["Nodes", run ? String(run.nodeCount) : "24"]
  ];
  elements.metricGrid.innerHTML = "";
  for (const [label, value] of cards) {
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `<span class="label">${label}</span><div class="value">${value}</div>`;
    elements.metricGrid.appendChild(card);
  }
}

function renderEnvironment() {
  const info = [
    ["Browser", `${state.environment.browser.name} ${state.environment.browser.version}`],
    ["OS", `${state.environment.os.name} ${state.environment.os.version}`],
    ["Device", state.environment.device.class],
    ["CPU", state.environment.device.cpu],
    ["Memory", state.environment.device.memory_gb ? `${state.environment.device.memory_gb} GB` : "unknown"],
    ["Adapter", state.environment.gpu.adapter],
    ["Backend", state.environment.backend]
  ];
  elements.metaGrid.innerHTML = "";
  for (const [label, value] of info) {
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `<span class="label">${label}</span><div class="value">${value}</div>`;
    elements.metaGrid.appendChild(card);
  }
}

function renderLogs() {
  elements.logList.innerHTML = "";
  const entries = state.logs.length ? state.logs : ["No scene activity yet."];
  for (const entry of entries) {
    const li = document.createElement("li");
    li.textContent = entry;
    elements.logList.appendChild(li);
  }
}

function render() {
  renderStatus();
  renderMetrics();
  renderEnvironment();
  renderLogs();
  elements.resultJson.textContent = JSON.stringify(buildResult(), null, 2);
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(buildResult(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `exp-three-webgpu-core-${state.run ? "scene-ready" : "pending"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  log("Downloaded three-scene readiness JSON draft.");
}

elements.probeCapability.addEventListener("click", probeCapability);
elements.runScene.addEventListener("click", runSceneBaseline);
elements.downloadJson.addEventListener("click", downloadJson);

log("Three scene readiness harness ready.");
render();
