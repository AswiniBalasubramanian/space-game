import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { WatercolorShader } from '../render/WatercolorShader.js';

// Renderer + camera + post chain. In WebXR the post chain is bypassed (it can't
// run per-eye) and the cel-shaded scene renders directly to the headset.
export class Engine {
  constructor(container) {
    this.container = container;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.xr.enabled = true;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 5000);
    // XR rig: in VR the headset pose is applied relative to this group.
    this.rig = new THREE.Group();
    this.rig.add(this.camera);

    this.scene = new THREE.Scene();
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.15, 0.25, 1.0);
    this.output = new OutputPass();
    this.watercolor = new ShaderPass(WatercolorShader);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.output);
    this.composer.addPass(this.watercolor);
    this.fx = this.watercolor.uniforms;
    this.postEnabled = true;

    addEventListener('resize', () => this.resize());
    this.resize();
  }

  get inXR() { return this.renderer.xr.isPresenting; }

  // Only offer "Enter VR" when an immersive headset is actually available.
  async enableVRButton(onStart, onEnd) {
    const ok = await navigator.xr?.isSessionSupported?.('immersive-vr').catch(() => false);
    if (!ok) return null;
    const btn = VRButton.createButton(this.renderer);
    btn.classList.add('vr-button');
    btn.removeAttribute('style');
    document.body.appendChild(btn);
    this.renderer.xr.addEventListener('sessionstart', onStart);
    this.renderer.xr.addEventListener('sessionend', onEnd);
    return btn;
  }

  setScene(scene) {
    this.scene = scene;
    this.renderPass.scene = scene;
    if (this.rig.parent !== scene) scene.add(this.rig);
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    this.fx.uRes.value.set(w * pr, h * pr);
  }

  render(t) {
    this.fx.uTime.value = t;
    if (this.inXR || !this.postEnabled) {
      this.renderer.render(this.scene, this.camera);
    } else {
      this.composer.render();
    }
  }
}
