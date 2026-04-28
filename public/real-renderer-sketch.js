// Real three.js WebGPURenderer integration sketch for exp-three-webgpu-core.
//
// Gated by ?mode=real-three. The default deterministic harness path is
// untouched. When the gate is active, app.js dynamically imports this module
// which then loads three.js + WebGPURenderer from a CDN and registers a real
// renderer adapter with the registry shipped under public/renderer-adapter.js.
//
// `loadThreeFromCdn` is parameterized so tests can inject a stub instead of
// hitting the network.

const DEFAULT_THREE_VERSION = "0.160.0";
const DEFAULT_THREE_CDN = (version) => `https://esm.sh/three@${version}`;
const DEFAULT_WEBGPU_RENDERER_CDN = (version) =>
  `https://esm.sh/three@${version}/examples/jsm/renderers/webgpu/WebGPURenderer.js`;

export async function loadThreeFromCdn({ version = DEFAULT_THREE_VERSION } = {}) {
  const [three, rendererModule] = await Promise.all([
    import(/* @vite-ignore */ DEFAULT_THREE_CDN(version)),
    import(/* @vite-ignore */ DEFAULT_WEBGPU_RENDERER_CDN(version))
  ]);
  return {
    three,
    WebGPURenderer: rendererModule.default || rendererModule.WebGPURenderer
  };
}

export function buildRealRendererAdapter({ three, WebGPURenderer, version = DEFAULT_THREE_VERSION }) {
  const id = `three-webgpu-${version.replace(/[^0-9]/g, "")}`;
  let renderer = null;
  let scene = null;
  let camera = null;

  return {
    id,
    label: `three.js ${version} WebGPURenderer`,
    version,
    capabilities: ["scene-load", "frame-pace", "fallback-record", "real-render"],
    backendHint: "webgpu",
    isReal: true,
    async createRenderer({ canvas } = {}) {
      const target = canvas || document.querySelector("canvas");
      if (!target) {
        throw new Error("real renderer requires a <canvas> element");
      }
      renderer = new WebGPURenderer({ canvas: target, antialias: true });
      await renderer.init();
      renderer.setSize(target.clientWidth || target.width, target.clientHeight || target.height, false);
      return renderer;
    },
    async loadScene({ nodeCount = 24 } = {}) {
      scene = new three.Scene();
      camera = new three.PerspectiveCamera(45, 16 / 9, 0.1, 100);
      camera.position.set(0, 1.2, 3.6);
      const ambient = new three.HemisphereLight(0xffffff, 0x202830, 0.9);
      scene.add(ambient);
      const geometry = new three.IcosahedronGeometry(0.18, 1);
      for (let index = 0; index < nodeCount; index += 1) {
        const angle = (index / nodeCount) * Math.PI * 2;
        const material = new three.MeshStandardMaterial({
          color: new three.Color().setHSL((index / nodeCount + 0.55) % 1, 0.55, 0.6)
        });
        const mesh = new three.Mesh(geometry, material);
        mesh.position.set(Math.cos(angle) * 1.2, Math.sin(angle * 0.7) * 0.4, Math.sin(angle) * 1.2);
        scene.add(mesh);
      }
      return scene;
    },
    async renderFrame({ frameIndex = 0 } = {}) {
      if (!renderer || !scene || !camera) {
        throw new Error("renderer, scene, camera must be created before renderFrame");
      }
      const t = frameIndex * 0.012;
      camera.position.x = Math.cos(t) * 3.6;
      camera.position.z = Math.sin(t) * 3.6;
      camera.lookAt(0, 0, 0);
      const startedAt = performance.now();
      await renderer.renderAsync(scene, camera);
      return { frameMs: performance.now() - startedAt };
    }
  };
}

export async function connectRealRenderer({
  registry = typeof window !== "undefined" ? window.__aiWebGpuLabRendererRegistry : null,
  loader = loadThreeFromCdn,
  version = DEFAULT_THREE_VERSION
} = {}) {
  if (!registry) {
    throw new Error("renderer registry not available");
  }
  const { three, WebGPURenderer } = await loader({ version });
  const adapter = buildRealRendererAdapter({ three, WebGPURenderer, version });
  registry.register(adapter);
  return { adapter, three, WebGPURenderer };
}

if (typeof window !== "undefined" && window.location && typeof window.location.search === "string") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "real-three" && !window.__aiWebGpuLabRealThreeBootstrapping) {
    window.__aiWebGpuLabRealThreeBootstrapping = true;
    connectRealRenderer().catch((error) => {
      console.warn(`[real-three] bootstrap failed: ${error.message}`);
      window.__aiWebGpuLabRealThreeBootstrapError = error.message;
    });
  }
}
