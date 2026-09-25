import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Kuwahara filter: flattens detail into brush-like patches — the "painted" look of
// hand-drawn animation backgrounds.
const PaintShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    amount: { value: 1 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 resolution; uniform float amount; varying vec2 vUv;
    void main(){
      vec2 px = 1.0/resolution;
      vec3 m[4]; vec3 s[4];
      for(int k=0;k<4;k++){ m[k]=vec3(0.); s[k]=vec3(0.); }
      for(int j=-2;j<=0;j++) for(int i=-2;i<=0;i++){
        vec3 c;
        c=texture2D(tDiffuse,vUv+vec2(i,j)*px).rgb; m[0]+=c; s[0]+=c*c;
        c=texture2D(tDiffuse,vUv+vec2(-i,j)*px).rgb; m[1]+=c; s[1]+=c*c;
        c=texture2D(tDiffuse,vUv+vec2(i,-j)*px).rgb; m[2]+=c; s[2]+=c*c;
        c=texture2D(tDiffuse,vUv+vec2(-i,-j)*px).rgb; m[3]+=c; s[3]+=c*c;
      }
      float best=1e9; vec3 outc=vec3(0.);
      for(int k=0;k<4;k++){
        vec3 mu=m[k]/9.0; vec3 v=abs(s[k]/9.0-mu*mu);
        float sv=v.r+v.g+v.b;
        if(sv<best){ best=sv; outc=mu; }
      }
      vec3 orig=texture2D(tDiffuse,vUv).rgb;
      gl_FragColor=vec4(mix(orig,outc,amount),1.);
    }`,
};

// Gravitational lensing + warp streaks + cinematic grade (vignette, warmth, grain).
const CinemaShader = {
  uniforms: {
    tDiffuse: { value: null },
    center: { value: new THREE.Vector2(0.5, 0.5) },
    lens: { value: 0 },
    lensRadius: { value: 0.1 },
    aspect: { value: 1 },
    streak: { value: 0 },
    vignette: { value: 0.35 },
    warmth: { value: 0 },
    saturation: { value: 1.08 },
    time: { value: 0 },
    shake: { value: 0 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 center; uniform float lens, lensRadius, aspect, streak, vignette, warmth, saturation, time, shake;
    varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec2 uv = vUv + shake*vec2(sin(time*61.0), cos(time*53.0))*0.004;
      vec2 d = uv - center; d.x *= aspect;
      float r = length(d);
      // Einstein-ring style deflection: pulls the background outward around the mass.
      float rr = lensRadius*lensRadius;
      vec2 dir = d/(r+1e-5);
      float bend = lens * rr / (r + 0.015);
      vec2 off = dir*bend; off.x /= aspect;
      vec2 suv = uv - off;
      vec3 col;
      if (streak > 0.001) {
        vec3 acc = vec3(0.); float tot = 0.;
        vec2 toC = (center - suv);
        for (int i=0;i<12;i++){
          float t = float(i)/11.0;
          float w = 1.0 - t*0.6;
          acc += texture2D(tDiffuse, suv + toC*t*streak*0.35).rgb * w; tot += w;
        }
        col = acc/tot;
      } else {
        float ca = lens*0.004;
        col = vec3(texture2D(tDiffuse, suv + dir*ca).r, texture2D(tDiffuse, suv).g, texture2D(tDiffuse, suv - dir*ca).b);
      }
      float l = dot(col, vec3(0.299,0.587,0.114));
      col = mix(vec3(l), col, saturation);
      col *= mix(vec3(1.), vec3(1.08,1.0,0.86), warmth);
      vec2 v = vUv-0.5;
      col *= 1.0 - vignette*dot(v,v)*1.6;
      col += (rnd(vUv*vec2(1733.,977.)+time)-0.5)*0.018;
      gl_FragColor = vec4(col,1.);
    }`,
};

export class Engine {
  constructor(container) {
    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    this.maxDpr = 1.75;
    renderer.setPixelRatio(Math.min(devicePixelRatio, this.maxDpr));
    renderer.setSize(innerWidth, innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local-floor');
    container.appendChild(renderer.domElement);
    this.canvas = renderer.domElement;

    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 9000);
    this.rig = new THREE.Group();
    this.rig.name = 'cameraRig';
    this.rig.add(this.camera);
    this.scene = new THREE.Scene();

    const composer = (this.composer = new EffectComposer(renderer));
    this.renderPass = new RenderPass(this.scene, this.camera);
    composer.addPass(this.renderPass);
    this.paintPass = new ShaderPass(PaintShader);
    composer.addPass(this.paintPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.6, 0.85);
    composer.addPass(this.bloom);
    this.cinema = new ShaderPass(CinemaShader);
    composer.addPass(this.cinema);
    composer.addPass(new OutputPass());

    this.painterly = true;
    try { this.painterly = localStorage.getItem('astra.painterly') !== '0'; } catch { /* ignore */ }
    this.paintPass.enabled = this.painterly;

    addEventListener('resize', () => this.resize());
    this.resize();
  }

  setPainterly(on) {
    this.painterly = on;
    this.paintPass.enabled = on;
    try { localStorage.setItem('astra.painterly', on ? '1' : '0'); } catch { /* ignore */ }
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    const dpr = this.renderer.getPixelRatio();
    this.paintPass.uniforms.resolution.value.set(w * dpr, h * dpr);
    this.cinema.uniforms.aspect.value = w / h;
  }

  setScene(scene) {
    this.scene = scene;
    this.renderPass.scene = scene;
    scene.add(this.rig);
  }

  setBloom({ strength = 0.5, radius = 0.6, threshold = 0.85 } = {}) {
    this.bloom.strength = strength;
    this.bloom.radius = radius;
    this.bloom.threshold = threshold;
  }

  setGrade({ vignette = 0.35, warmth = 0, saturation = 1.08, exposure = 1.0 } = {}) {
    const u = this.cinema.uniforms;
    u.vignette.value = vignette;
    u.warmth.value = warmth;
    u.saturation.value = saturation;
    this.renderer.toneMappingExposure = exposure;
  }

  render(t) {
    this.cinema.uniforms.time.value = t;
    if (this.renderer.xr.isPresenting) this.renderer.render(this.scene, this.camera);
    else this.composer.render();
  }
}
