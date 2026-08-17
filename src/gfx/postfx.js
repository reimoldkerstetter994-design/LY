/**
 * Post-processing stack.
 *
 *   RenderPass ─► [GTAO] ─► UnrealBloom ─► OutputPass ─► HorrorGrade ─► [SMAA]
 *
 * `HorrorGrade` is a single custom pass that does the heavy atmospheric lifting:
 * lens distortion, chromatic aberration, breathing vignette, film grain,
 * sanity warping, hallucination glitches and the damage overlay.
 */

import { Vector2, ShaderMaterial } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { clamp01 } from '../core/utils.js';

export const HorrorGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new Vector2(1, 1) },
    uVignette: { value: 1.0 },
    uAberration: { value: 0.0015 },
    uGrain: { value: 0.055 },
    uWarp: { value: 0.0 },
    uDamage: { value: 0.0 },
    uSaturation: { value: 0.72 },
    uGlitch: { value: 0.0 },
    uExposure: { value: 1.0 },
    uPulse: { value: 0.0 },
    uBlackout: { value: 0.0 },
    uDistort: { value: 0.14 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;

    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2  uResolution;
    uniform float uVignette;
    uniform float uAberration;
    uniform float uGrain;
    uniform float uWarp;
    uniform float uDamage;
    uniform float uSaturation;
    uniform float uGlitch;
    uniform float uExposure;
    uniform float uPulse;
    uniform float uBlackout;
    uniform float uDistort;

    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(443.897, 441.423));
      p += dot(p, p + 19.19);
      return fract(p.x * p.y);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    // Barrel distortion around the centre of the frame.
    vec2 barrel(vec2 uv, float k) {
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);
      return 0.5 + c * (1.0 + k * r2);
    }

    void main() {
      vec2 uv = vUv;

      // --- sanity warp: slow organic breathing of the whole image
      if (uWarp > 0.001) {
        float w = uWarp;
        uv.x += sin(uv.y * 11.0 + uTime * 1.7) * 0.0055 * w;
        uv.y += cos(uv.x * 9.0 - uTime * 1.3) * 0.0045 * w;
        uv += (vec2(noise(uv * 3.0 + uTime * 0.15), noise(uv * 3.0 - uTime * 0.11)) - 0.5) * 0.02 * w;
      }

      // --- hallucination tearing
      if (uGlitch > 0.001) {
        float band = floor(uv.y * 42.0);
        float shift = (hash(vec2(band, floor(uTime * 14.0))) - 0.5) * 0.12 * uGlitch;
        if (hash(vec2(band * 1.7, floor(uTime * 9.0))) > 0.72) uv.x += shift;
      }

      // --- lens shape + heartbeat pulse zoom
      float k = uDistort + uPulse * 0.05;
      uv = barrel(uv, k);
      uv = mix(uv, 0.5 + (uv - 0.5) * (1.0 - uPulse * 0.02), 1.0);

      // --- chromatic aberration, stronger toward the edges
      vec2 dir = uv - 0.5;
      float edge = dot(dir, dir);
      float ab = uAberration * (1.0 + edge * 5.5) + uPulse * 0.0022 + uWarp * 0.004;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + dir * ab).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - dir * ab).b;

      // Sample outside → black (avoids stretched edges from the distortion).
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) col = vec3(0.0);

      // --- colour grade: cold shadows, sickly desaturated midtones
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(lum), col, uSaturation);
      col = pow(max(col, 0.0), vec3(1.06, 1.0, 0.96));
      col += vec3(-0.004, 0.002, 0.014) * (1.0 - lum);   // blue lift in shadow
      col *= vec3(1.02, 0.995, 0.95);                     // warm highlights
      col *= uExposure;

      // --- vignette (breathes with tension)
      float vig = 1.0 - uVignette * smoothstep(0.18, 0.98, length((uv - 0.5) * vec2(1.06, 1.16)) * 1.32);
      col *= clamp(vig, 0.0, 1.0);

      // --- damage / rage red at the edges
      if (uDamage > 0.001) {
        float rim = smoothstep(0.25, 0.85, length(uv - 0.5) * 1.5);
        col = mix(col, vec3(0.42, 0.015, 0.02), rim * uDamage * 0.9);
        col.r += rim * uDamage * 0.14;
      }

      // --- film grain (animated, luminance-aware so blacks stay noisy)
      float g = hash(uv * uResolution + vec2(uTime * 91.7, uTime * 57.3));
      float grainAmt = uGrain * (1.35 - lum * 0.75);
      col += (g - 0.5) * grainAmt;

      // --- very subtle horizontal instability, like an old VHS transfer
      col *= 1.0 + sin(uv.y * uResolution.y * 1.7 + uTime * 4.0) * 0.006;

      col *= (1.0 - uBlackout);

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

export class PostFX {
  constructor(renderer, scene, camera, quality) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.quality = quality;
    this.gtao = null;

    const size = renderer.getSize(new Vector2());
    this.composer = new EffectComposer(renderer);
    this.composer.setSize(size.x, size.y);

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    if (quality.ao) this._tryAddGTAO(size);

    if (quality.bloom) {
      this.bloom = new UnrealBloomPass(
        new Vector2(size.x, size.y),
        quality.bloomStrength,
        0.62,
        0.86,
      );
      this.composer.addPass(this.bloom);
    }

    this.composer.addPass(new OutputPass());

    this.grade = new ShaderPass(HorrorGradeShader);
    this.grade.material.uniforms.uResolution.value.set(size.x, size.y);
    this.composer.addPass(this.grade);

    if (quality.smaa) {
      this.smaa = new SMAAPass();
      this.composer.addPass(this.smaa);
    }

    // Ensure the final pass renders to screen.
    const passes = this.composer.passes;
    passes.forEach((p, i) => {
      p.renderToScreen = i === passes.length - 1;
    });
  }

  async _tryAddGTAO(size) {
    try {
      const { GTAOPass } = await import('three/addons/postprocessing/GTAOPass.js');
      const gtao = new GTAOPass(this.scene, this.camera, size.x, size.y);
      gtao.updateGtaoMaterial?.({
        radius: 0.32,
        distanceExponent: 1.4,
        thickness: 0.6,
        scale: 1.1,
        samples: 12,
        screenSpaceRadius: false,
      });
      gtao.blendIntensity = 0.85;
      // Insert directly after the render pass.
      this.composer.insertPass(gtao, 1);
      this.gtao = gtao;
      const passes = this.composer.passes;
      passes.forEach((p, i) => {
        p.renderToScreen = i === passes.length - 1;
      });
    } catch (err) {
      console.warn('[postfx] ambient occlusion unavailable:', err?.message ?? err);
    }
  }

  get u() {
    return this.grade.material.uniforms;
  }

  setSize(w, h) {
    this.composer.setSize(w, h);
    this.u.uResolution.value.set(w, h);
    this.bloom?.setSize(w, h);
    this.gtao?.setSize?.(w, h);
  }

  /**
   * @param {object} s visual state: tension, sanity, damage, pulse, glitch, blackout…
   */
  update(dt, s) {
    const u = this.u;
    u.uTime.value += dt;

    const insanity = 1 - clamp01(s.sanity ?? 1);
    const tension = clamp01(s.tension ?? 0);

    u.uVignette.value = 0.82 + tension * 0.42 + insanity * 0.3 + (s.hiding ? 0.5 : 0);
    u.uAberration.value = 0.0012 + tension * 0.0055 + insanity * 0.006;
    u.uGrain.value = 0.05 + insanity * 0.1 + tension * 0.035;
    u.uWarp.value = insanity * 1.25 + (s.warpBoost ?? 0);
    u.uSaturation.value = 0.78 - insanity * 0.42 + tension * 0.1;
    u.uDamage.value = clamp01(s.damage ?? 0);
    u.uGlitch.value = clamp01((s.glitch ?? 0) + Math.max(0, insanity - 0.72) * 0.8);
    u.uExposure.value = s.exposure ?? 1;
    u.uPulse.value = clamp01(s.pulse ?? 0);
    u.uBlackout.value = clamp01(s.blackout ?? 0);
    u.uDistort.value = 0.1 + tension * 0.07 + insanity * 0.09;
  }

  render(dt) {
    this.composer.render(dt);
  }

  dispose() {
    this.composer.passes.forEach((p) => {
      if (p.material instanceof ShaderMaterial) p.material.dispose();
      p.dispose?.();
    });
  }
}
