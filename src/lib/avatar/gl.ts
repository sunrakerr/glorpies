import { FRAG, VERT } from './shader';
import { BEARD, EYES, GLASSES, HAIR, HAT, MOUTH, NOSE, srgbToLinear, TOP, type Character } from './spec';

export type Mode = 'clay' | 'cel' | 'data';
const MODE: Record<Mode, number> = { clay: 0, cel: 1, data: 2 };

type GL = { canvas: HTMLCanvasElement; gl: WebGL2RenderingContext; prog: WebGLProgram; locs: Map<string, WebGLUniformLocation | null> };
let shared: GL | null = null;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`shader: ${gl.getShaderInfoLog(s)}`);
  return s;
}

function context(): GL {
  if (shared) return shared;
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false });
  if (!gl) throw new Error('WebGL2 is not available');
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`link: ${gl.getProgramInfoLog(prog)}`);
  shared = { canvas, gl, prog, locs: new Map() };
  return shared;
}

/** Raymarches the character into a fresh 2D canvas of w×h pixels. */
export function renderGL(c: Character, mode: Mode, w: number, h = w): HTMLCanvasElement {
  const { canvas, gl, prog, locs } = context();
  canvas.width = w;
  canvas.height = h;
  gl.viewport(0, 0, w, h);
  gl.useProgram(prog);
  const loc = (name: string) => {
    if (!locs.has(name)) locs.set(name, gl.getUniformLocation(prog, name));
    return locs.get(name)!;
  };
  const i = (name: string, v: number) => gl.uniform1i(loc(name), v);
  const f = (name: string, v: number) => gl.uniform1f(loc(name), v);
  const v3 = (name: string, v: readonly number[]) => gl.uniform3f(loc(name), v[0]!, v[1]!, v[2]!);
  const col = (name: string, hex: string) => v3(name, srgbToLinear(hex));

  gl.uniform2f(loc('uRes'), w, h);
  i('uMode', MODE[mode]);
  // the head turns by yaw then pitch; GLSL reads this row-major array as its transpose, which is the inverse rotation
  const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
  gl.uniformMatrix3fv(loc('uRot'), false, [cy, 0, sy, sp * sy, cp, -sp * cy, -cp * sy, sp, cp * cy]);
  f('uHeadW', c.headW);
  i('uHair', HAIR.indexOf(c.hair));
  i('uHat', HAT.indexOf(c.hat));
  i('uEyes', EYES.indexOf(c.eyes));
  i('uMouth', MOUTH.indexOf(c.mouth));
  i('uNose', NOSE.indexOf(c.nose));
  i('uGlasses', GLASSES.indexOf(c.glasses));
  i('uBeard', BEARD.indexOf(c.beard));
  i('uTop', TOP.indexOf(c.top));
  i('uEarring', c.earring ? 1 : 0);
  const L = c.layout;
  v3('uEyeL', L.eyeL); v3('uEyeR', L.eyeR); v3('uEyeNL', L.eyeNL); v3('uEyeNR', L.eyeNR);
  v3('uNosePos', L.nose); v3('uMouthPos', L.mouth);
  v3('uBrowL0', L.browL[0]); v3('uBrowL1', L.browL[1]); v3('uBrowR0', L.browR[0]); v3('uBrowR1', L.browR[1]);
  const curls = new Float32Array(14 * 4);
  c.curls.slice(0, 14).forEach((q, k) => curls.set(q, k * 4));
  gl.uniform4fv(loc('uCurls[0]'), curls);
  i('uCurlN', Math.min(14, c.curls.length));
  f('uHairline', c.hairline);
  f('uFringe', c.fringe);
  gl.uniform2f(loc('uGaze'), c.gaze[0], c.gaze[1]);
  col('cSkin', c.skin); col('cHair', c.hairCol); col('cIris', c.iris); col('cShirt', c.shirt); col('cHat', c.hatCol);
  col('cFrame', c.frame); col('cBg', c.bg); col('cBg2', c.bg2); col('cBlush', c.blushCol); col('cLip', c.lip);
  f('uBlush', c.blush);
  f('uFreckles', c.freckles ? 1 : 0);

  gl.drawArrays(gl.TRIANGLES, 0, 3);
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  out.getContext('2d')!.drawImage(canvas, 0, 0);
  return out;
}
