import * as THREE from 'three';
import { GLSL_NOISE } from '../utils/noise.js';

// Final full-screen pass that turns the cel-shaded render into a watercolour
// painting: wobbling brush edges, pigment pooling at edges, paper grain,
// soft colour blotches. It also owns the spacetime effects: gravitational
// lensing around black holes and the portal warp / darkness / flash.
export const WatercolorShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uStrength: { value: 1 },
    uWarp: { value: 0 },
    uDark: { value: 0 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color('#fff4dc') },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uHoles: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    uVignette: { value: 0.35 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 uRes;
    uniform float uTime, uStrength, uWarp, uDark, uFlash, uVignette;
    uniform vec3 uFlashColor, uTint;
    uniform vec4 uHoles[3];
    varying vec2 vUv;
    ${GLSL_NOISE}

    vec3 tap(vec2 uv){ return texture2D(tDiffuse, clamp(uv, 0.001, 0.999)).rgb; }
    float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }

    void main(){
      vec2 uv = vUv;
      float aspect = uRes.x / uRes.y;

      // Gravitational lensing: pull the image toward each visible black hole.
      for (int i = 0; i < 3; i++) {
        vec4 h = uHoles[i];
        if (h.w <= 0.0) continue;
        vec2 d = uv - h.xy; d.x *= aspect;
        float r = length(d);
        float bend = h.w * (h.z * h.z) / (r * r + h.z * h.z * 0.35);
        float swirl = h.w * 0.6 * h.z / (r + h.z);
        float s = sin(swirl), c = cos(swirl);
        d = mat2(c, -s, s, c) * d;
        d *= max(0.0, 1.0 - bend);
        d.x /= aspect;
        uv = h.xy + d;
      }

      // Portal warp: swirl + radial stretch toward the centre.
      vec3 col;
      if (uWarp > 0.001) {
        vec2 cdir = uv - 0.5;
        float r = length(cdir * vec2(aspect, 1.0));
        float a = uWarp * 2.6 * (1.0 - smoothstep(0.0, 0.9, r));
        float s = sin(a), c = cos(a);
        cdir = mat2(c, -s, s, c) * cdir;
        cdir *= 1.0 - uWarp * 0.25;
        vec2 base = 0.5 + cdir;
        vec3 acc = vec3(0.0);
        for (int k = 0; k < 10; k++) {
          float f = float(k) / 9.0;
          acc += tap(0.5 + cdir * (1.0 - f * uWarp * 0.55));
        }
        col = acc / 10.0;
        col += vec3(1.0, 0.75, 0.45) * uWarp * uWarp * 0.35 * (1.0 - r);
        uv = base;
      } else {
        // Hand-painted edge wobble + a tiny pigment blur.
        vec2 px = 1.0 / uRes;
        vec2 wob = (vec2(vnoise(uv * 9.0 + uTime * 0.05), vnoise(uv * 9.0 + 31.7 + uTime * 0.05)) - 0.5) * 0.0045 * uStrength;
        vec2 uw = uv + wob;
        col = tap(uw) * 0.4 + (tap(uw + vec2(px.x, 0.0) * 1.5) + tap(uw - vec2(px.x, 0.0) * 1.5)
              + tap(uw + vec2(0.0, px.y) * 1.5) + tap(uw - vec2(0.0, px.y) * 1.5)) * 0.15;

        // Edge darkening: pigment pools where tones change (the watercolour "rim").
        float l = luma(col);
        float lx = luma(tap(uw + vec2(px.x * 2.0, 0.0))) - luma(tap(uw - vec2(px.x * 2.0, 0.0)));
        float ly = luma(tap(uw + vec2(0.0, px.y * 2.0))) - luma(tap(uw - vec2(0.0, px.y * 2.0)));
        float edge = clamp(length(vec2(lx, ly)) * 2.2, 0.0, 1.0);
        // pooled pigment: slightly deeper and more saturated, never muddy
        vec3 pooled = col * 0.82 + (col - vec3(l)) * 0.25;
        col = mix(col, pooled, edge * 0.5 * uStrength);
        // gentle saturation lift: watercolour pigments stay clean and bright
        col = mix(vec3(luma(col)), col, 1.0 + 0.05 * uStrength);

        // Large soft blotches (uneven pigment density) and bleeding into paper.
        float blot = fbm2(uv * vec2(aspect, 1.0) * 2.4 + 3.1);
        col *= mix(1.0, 0.94 + blot * 0.12, uStrength);
        col = mix(col, vec3(0.99, 0.97, 0.93), smoothstep(0.88, 1.0, l) * 0.18 * uStrength);
      }

      // Paper: fibres + granulation.
      vec2 pp = vUv * uRes / 2.2;
      float grain = vnoise(pp) * 0.6 + vnoise(pp * 0.37 + 11.0) * 0.4;
      float fibre = vnoise(vec2(pp.x * 0.05, pp.y * 0.9));
      float paper = 0.95 + grain * 0.06 + fibre * 0.012;
      col *= mix(1.0, paper, uStrength);

      col *= uTint;

      // Soft warm vignette.
      vec2 vv = vUv - 0.5; vv.x *= aspect * 0.8;
      float vig = smoothstep(0.35, 1.05, length(vv));
      col = mix(col, col * vec3(0.72, 0.62, 0.7), vig * uVignette);

      col *= 1.0 - uDark;
      col = mix(col, uFlashColor, uFlash);
      gl_FragColor = vec4(col, 1.0);
    }`,
};
