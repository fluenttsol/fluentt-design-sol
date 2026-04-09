import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.164.1/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.164.1/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'https://cdn.jsdelivr.net/npm/three@0.164.1/examples/jsm/loaders/RGBELoader.js';

const DEFAULT_MODEL_URL = './assets/model.glb';
const DEFAULT_HDR_URL = './assets/hdri.hdr';

const canvas = document.querySelector('#canvas');
const progressEl = document.querySelector('#progress');
const statusEl = document.querySelector('#status');
const bgToggle = document.querySelector('#bgToggle');
const shadowToggle = document.querySelector('#shadowToggle');
const autoRotateToggle = document.querySelector('#autoRotateToggle');
const lightRange = document.querySelector('#lightRange');
const lightValue = document.querySelector('#lightValue');
const exposureRange = document.querySelector('#exposureRange');
const exposureValue = document.querySelector('#exposureValue');
const envRange = document.querySelector('#envRange');
const envValue = document.querySelector('#envValue');
const resetCameraBtn = document.querySelector('#resetCameraBtn');
const clearModelBtn = document.querySelector('#clearModelBtn');
const dropzone = document.querySelector('#dropzone');
const pickModelBtn = document.querySelector('#pickModelBtn');
const pickHdrBtn = document.querySelector('#pickHdrBtn');
const modelInput = document.querySelector('#modelInput');
const hdrInput = document.querySelector('#hdrInput');
const modelFileName = document.querySelector('#modelFileName');
const hdrFileName = document.querySelector('#hdrFileName');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.physicallyCorrectLights = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d10);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(1.8, 1.4, 3.2);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 0.6;
controls.maxDistance = 15;
controls.autoRotate = false;
controls.autoRotateSpeed = 2;
controls.target.set(0, 0.9, 0);
controls.update();

const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, Number(lightRange.value));
directionalLight.position.set(5, 8, 6);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.set(2048, 2048);
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 30;
directionalLight.shadow.camera.left = -6;
directionalLight.shadow.camera.right = 6;
directionalLight.shadow.camera.top = 6;
directionalLight.shadow.camera.bottom = -6;
scene.add(directionalLight);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.18 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.001;
ground.receiveShadow = true;
scene.add(ground);

const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();
const clock = new THREE.Clock();
const gltfLoader = new GLTFLoader();
const rgbeLoader = new RGBELoader();

let mixer = null;
let modelRoot = null;
let envTexture = null;
let currentModelUrl = DEFAULT_MODEL_URL;
let currentHdrUrl = DEFAULT_HDR_URL;
let currentModelObjectUrl = null;
let currentHdrObjectUrl = null;
let lastFrame = null;

const setStatus = (text, isError = false) => {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', isError);
};

const updateProgress = (loaded, total, label = 'Loading…') => {
  if (total > 0) {
    const value = Math.round((loaded / total) * 100);
    progressEl.value = value;
    setStatus(`${label} ${value}%`);
  } else {
    progressEl.removeAttribute('value');
    setStatus(label);
  }
};

const applyShadowState = (enabled) => {
  renderer.shadowMap.enabled = enabled;
  directionalLight.castShadow = enabled;
  ground.visible = enabled;
  if (!modelRoot) return;
  modelRoot.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = enabled;
    child.receiveShadow = enabled;
  });
};

const resetCamera = () => {
  if (!lastFrame) {
    camera.position.set(1.8, 1.4, 3.2);
    controls.target.set(0, 0.9, 0);
    controls.update();
    return;
  }
  camera.position.copy(lastFrame.position);
  controls.target.copy(lastFrame.target);
  controls.update();
};

const frameModel = (root) => {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  root.position.sub(center);
  root.position.y += size.y * 0.5;

  const maxSize = Math.max(size.x, size.y, size.z) || 1;
  const fitDistance = maxSize / (2 * Math.tan((Math.PI * camera.fov) / 360));
  camera.near = Math.max(maxSize / 100, 0.01);
  camera.far = maxSize * 20;
  camera.updateProjectionMatrix();

  const nextPosition = new THREE.Vector3(maxSize * 0.8, maxSize * 0.6, fitDistance * 1.6);
  const nextTarget = new THREE.Vector3(0, size.y * 0.35, 0);
  camera.position.copy(nextPosition);
  controls.target.copy(nextTarget);
  controls.update();

  lastFrame = { position: nextPosition.clone(), target: nextTarget.clone() };

  directionalLight.position.set(maxSize * 1.5, maxSize * 2, maxSize * 1.25);
  directionalLight.shadow.camera.left = -maxSize * 1.5;
  directionalLight.shadow.camera.right = maxSize * 1.5;
  directionalLight.shadow.camera.top = maxSize * 1.5;
  directionalLight.shadow.camera.bottom = -maxSize * 1.5;
  directionalLight.shadow.camera.far = maxSize * 8;
  directionalLight.shadow.camera.updateProjectionMatrix();
};

const clearCurrentModel = () => {
  if (!modelRoot) return;
  scene.remove(modelRoot);
  modelRoot.traverse((child) => {
    if (child.geometry) child.geometry.dispose?.();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material.dispose?.());
    }
  });
  modelRoot = null;
  mixer = null;
};

const setBackgroundState = () => {
  scene.background = bgToggle.checked ? envTexture : new THREE.Color(0x0b0d10);
};

const loadEnvironment = async (url = currentHdrUrl, label = 'Loading environment…') => {
  setStatus(label);
  const hdr = await rgbeLoader.loadAsync(url);
  const nextEnv = pmremGenerator.fromEquirectangular(hdr).texture;
  if (envTexture) envTexture.dispose?.();
  envTexture = nextEnv;
  scene.environment = envTexture;
  scene.environmentIntensity = Number(envRange.value);
  setBackgroundState();
  hdr.dispose();
};

const loadModel = async (url = currentModelUrl) => {
  clearCurrentModel();
  const gltf = await new Promise((resolve, reject) => {
    gltfLoader.load(url, resolve, (event) => updateProgress(event.loaded, event.total, 'Loading model…'), reject);
  });

  modelRoot = gltf.scene;
  modelRoot.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    child.frustumCulled = true;
    if (child.material) child.material.needsUpdate = true;
  });

  scene.add(modelRoot);
  frameModel(modelRoot);
  applyShadowState(shadowToggle.checked);

  if (gltf.animations?.length) {
    mixer = new THREE.AnimationMixer(modelRoot);
    gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
  }
};

const bootWithDefaults = async () => {
  try {
    await loadEnvironment(DEFAULT_HDR_URL);
    hdrFileName.textContent = 'assets/hdri.hdr';
  } catch (error) {
    console.warn(error);
    setStatus('No default HDRI found. Drop an .hdr file to light the scene.');
  }

  try {
    await loadModel(DEFAULT_MODEL_URL);
    modelFileName.textContent = 'assets/model.glb';
    progressEl.value = 100;
    setStatus('Loaded');
    dropzone.classList.remove('hidden');
  } catch (error) {
    console.warn(error);
    progressEl.value = 0;
    setStatus('No default GLB found. Drop a model to start.');
    dropzone.classList.remove('hidden');
  }
};

const revokeObjectUrl = (key) => {
  if (key === 'model' && currentModelObjectUrl) {
    URL.revokeObjectURL(currentModelObjectUrl);
    currentModelObjectUrl = null;
  }
  if (key === 'hdr' && currentHdrObjectUrl) {
    URL.revokeObjectURL(currentHdrObjectUrl);
    currentHdrObjectUrl = null;
  }
};

const handleModelFile = async (file) => {
  if (!file) return;
  revokeObjectUrl('model');
  currentModelObjectUrl = URL.createObjectURL(file);
  currentModelUrl = currentModelObjectUrl;
  modelFileName.textContent = file.name;
  try {
    await loadModel(currentModelUrl);
    progressEl.value = 100;
    setStatus(`Loaded ${file.name}`);
    dropzone.classList.add('hidden');
  } catch (error) {
    console.error(error);
    progressEl.value = 0;
    setStatus(`Failed to load model: ${error.message}`, true);
  }
};

const handleHdrFile = async (file) => {
  if (!file) return;
  revokeObjectUrl('hdr');
  currentHdrObjectUrl = URL.createObjectURL(file);
  currentHdrUrl = currentHdrObjectUrl;
  hdrFileName.textContent = file.name;
  try {
    await loadEnvironment(currentHdrUrl, `Loading ${file.name}…`);
    setStatus(`Environment updated: ${file.name}`);
  } catch (error) {
    console.error(error);
    setStatus(`Failed to load HDRI: ${error.message}`, true);
  }
};

const handleFiles = async (files) => {
  const list = [...files];
  const model = list.find((file) => file.name.toLowerCase().endsWith('.glb'));
  const hdr = list.find((file) => file.name.toLowerCase().endsWith('.hdr'));
  if (hdr) await handleHdrFile(hdr);
  if (model) await handleModelFile(model);
};

const animate = () => {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  if (mixer) mixer.update(delta);
  controls.update();
  renderer.render(scene, camera);
};

bgToggle.addEventListener('change', setBackgroundState);
shadowToggle.addEventListener('change', () => applyShadowState(shadowToggle.checked));
autoRotateToggle.addEventListener('change', () => {
  controls.autoRotate = autoRotateToggle.checked;
});
lightRange.addEventListener('input', (event) => {
  const value = Number(event.target.value);
  directionalLight.intensity = value;
  lightValue.textContent = value.toFixed(1);
});
exposureRange.addEventListener('input', (event) => {
  const value = Number(event.target.value);
  renderer.toneMappingExposure = value;
  exposureValue.textContent = value.toFixed(1);
});
envRange.addEventListener('input', (event) => {
  const value = Number(event.target.value);
  scene.environmentIntensity = value;
  envValue.textContent = value.toFixed(1);
});
resetCameraBtn.addEventListener('click', resetCamera);
clearModelBtn.addEventListener('click', () => {
  clearCurrentModel();
  modelFileName.textContent = 'none';
  progressEl.value = 0;
  dropzone.classList.remove('hidden');
  setStatus('Model cleared. Drop another .glb file.');
});
pickModelBtn.addEventListener('click', () => modelInput.click());
pickHdrBtn.addEventListener('click', () => hdrInput.click());
modelInput.addEventListener('change', async (event) => handleModelFile(event.target.files?.[0]));
hdrInput.addEventListener('change', async (event) => handleHdrFile(event.target.files?.[0]));

['dragenter', 'dragover'].forEach((type) => {
  window.addEventListener(type, (event) => {
    event.preventDefault();
    dropzone.classList.add('dragover');
  });
});
['dragleave', 'dragend'].forEach((type) => {
  window.addEventListener(type, () => dropzone.classList.remove('dragover'));
});
window.addEventListener('drop', async (event) => {
  event.preventDefault();
  dropzone.classList.remove('dragover');
  if (event.dataTransfer?.files?.length) await handleFiles(event.dataTransfer.files);
});

dropzone.addEventListener('dragover', (event) => event.preventDefault());
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

bootWithDefaults();
animate();
