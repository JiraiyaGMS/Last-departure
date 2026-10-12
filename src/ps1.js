/**
 * ps1.js — the look.
 *
 * Three parts, as the doc specifies:
 *   1. the scene renders into a ~320x240 target and is upscaled with NearestFilter
 *   2. every material is patched through onBeforeCompile to snap vertices to a
 *      screen-space grid, which gives the characteristic PS1 wobble
 *   3. a dither pass on top, plus the CRT artefacts the fear state drives
 *
 * The post pass also carries the horror: chromatic separation, frame judder,
 * a tightening vignette and a tape-roll tear all scale with `fear`.
 */
import * as THREE from 'three';

export const PS1_HEIGHT = 240;   // internal vertical resolution

const VERT = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */`
precision mediump float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2  uRes;        // internal render resolution
uniform float uTime;
uniform float uFear;       // 0..1 how close he is
uniform float uGlitch;     // 0..1 tape damage
uniform float uFlash;      // white-out
uniform float uFade;       // to black
uniform float uDither;
uniform float uBlind;      // the restroom mirror / blink

// 4x4 ordered Bayer
float bayer(vec2 p){
  int x = int(mod(p.x,4.0)); int y = int(mod(p.y,4.0));
  int i = y*4+x;
  float m[16];
  m[0]=0.0;  m[1]=8.0;  m[2]=2.0;  m[3]=10.0;
  m[4]=12.0; m[5]=4.0;  m[6]=14.0; m[7]=6.0;
  m[8]=3.0;  m[9]=11.0; m[10]=1.0; m[11]=9.0;
  m[12]=15.0;m[13]=7.0; m[14]=13.0;m[15]=5.0;
  float v = 0.0;
  for(int k=0;k<16;k++){ if(k==i) v = m[k]; }
  return v/16.0 - 0.5;
}

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }

void main(){
  vec2 uv = vUv;

  // --- tape roll: a horizontal tear that drifts when the signal is bad ---
  if(uGlitch > 0.001){
    float band = step(0.995 - uGlitch*0.06, fract(uv.y*3.0 - uTime*0.35));
    uv.x += band * (hash(vec2(floor(uv.y*120.0), floor(uTime*18.0)))-0.5) * uGlitch * 0.09;
  }

  // --- judder: the whole frame shivers when he has line of sight ---
  uv += (vec2(hash(vec2(uTime*61.0, 3.0)), hash(vec2(7.0, uTime*57.0))) - 0.5)
        * uFear * 0.0045;

  // --- barrel, very slight; a CRT is not flat ---
  vec2 c = uv - 0.5;
  uv = 0.5 + c * (1.0 + dot(c,c) * 0.055);

  if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0){ gl_FragColor=vec4(0.0,0.0,0.0,1.0); return; }

  // --- chromatic separation, scaling with dread ---
  float ca = (0.0007 + uFear*0.0042 + uGlitch*0.004);
  vec3 col;
  col.r = texture2D(tDiffuse, uv + vec2( ca, 0.0)).r;
  col.g = texture2D(tDiffuse, uv).g;
  col.b = texture2D(tDiffuse, uv + vec2(-ca, 0.0)).b;

  // --- posterise through a Bayer matrix: the PS1 dither ---
  float steps = mix(32.0, 20.0, uDither);
  vec2 px = uv * uRes;
  col += bayer(px) * (uDither * 1.4 / steps);
  col = floor(col * steps + 0.5) / steps;

  // --- scanlines and a faint shadow mask ---
  col *= 0.90 + 0.10 * sin(uv.y * uRes.y * 3.14159);
  col *= 0.97 + 0.03 * sin(uv.x * uRes.x * 2.0);

  // --- grain, heavier in the dark where the sensor would be straining ---
  float lum = dot(col, vec3(0.299,0.587,0.114));
  float g = hash(px + vec2(uTime*37.0, uTime*17.0)) - 0.5;
  col += g * (0.035 + 0.075*(1.0-lum) + uFear*0.05);

  // --- vignette closes in as he gets near ---
  float r = length(c);
  col *= 1.0 - smoothstep(0.38, 0.92, r) * (0.42 + uFear*0.45);

  // the blood-dark at the very edge when he is right behind you
  col = mix(col, col * vec3(1.0, 0.42, 0.34), smoothstep(0.3,0.9,r) * uFear * 0.55);

  col = mix(col, vec3(1.0), uFlash);
  col *= (1.0 - uFade);
  col *= (1.0 - uBlind);

  gl_FragColor = vec4(col, 1.0);
}
`;

export class PS1 {
  constructor(renderer) {
    this.renderer = renderer;
    this.target = new THREE.WebGLRenderTarget(320, PS1_HEIGHT, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false,
      colorSpace: THREE.SRGBColorSpace,
    });

    this.uniforms = {
      tDiffuse: { value: this.target.texture },
      uRes:     { value: new THREE.Vector2(320, PS1_HEIGHT) },
      uTime:    { value: 0 },
      uFear:    { value: 0 },
      uGlitch:  { value: 0 },
      uFlash:   { value: 0 },
      uFade:    { value: 0 },
      uDither:  { value: 1 },
      uBlind:   { value: 0 },
    };

    this.quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG,
        uniforms: this.uniforms, depthTest: false, depthWrite: false,
      }));
    this.postScene = new THREE.Scene();
    this.postScene.add(this.quad);
    this.postCam = new THREE.Camera();
  }

  setSize(w, h) {
    const ih = PS1_HEIGHT;
    const iw = Math.max(160, Math.round(ih * (w / h)));
    this.target.setSize(iw, ih);
    this.uniforms.uRes.value.set(iw, ih);
    this.renderer.setSize(w, h, false);
  }

  render(scene, camera, dt) {
    this.uniforms.uTime.value += dt;
    this.renderer.setRenderTarget(this.target);
    this.renderer.clear();
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCam);
  }

  set(name, v) { if (this.uniforms[name]) this.uniforms[name].value = v; }
}

/**
 * Snap vertices to the internal pixel grid. Done in NDC after projection, which
 * is what gives PS1 geometry its characteristic twitch as you move.
 */
export function patchMaterials(root, snapRes = 190) {
  const seen = new Set();
  root.traverse(o => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m || seen.has(m.uuid) || m.userData.__ps1) continue;
      seen.add(m.uuid);
      m.userData.__ps1 = true;
      const prev = m.onBeforeCompile;
      m.onBeforeCompile = (shader, rndr) => {
        prev?.(shader, rndr);
        shader.uniforms.uSnap = { value: snapRes };
        shader.vertexShader = 'uniform float uSnap;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          '#include <project_vertex>',
          `#include <project_vertex>
          {
            float w_ = max(1e-5, abs(gl_Position.w));
            vec3 ndc_ = gl_Position.xyz / w_;
            ndc_.xy = floor(ndc_.xy * uSnap) / uSnap;
            gl_Position.xyz = ndc_ * w_;
          }`
        );
      };
      m.needsUpdate = true;
    }
  });
}
