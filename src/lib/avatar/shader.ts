/**
 * The character as a signed distance field: smooth-blended spheres,
 * ellipsoids and capsules, raymarched per pixel. Three outputs share it:
 * soft clay lighting, flat cel shading, and a data pass (material id, depth,
 * light) that the 2D styles post-process.
 */

export const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const FRAG = `#version 300 es
precision highp float;
out vec4 frag;

uniform vec2 uRes;
uniform int uMode;            // 0 clay, 1 cel, 2 data
uniform mat3 uRot;            // world -> head space
uniform float uHeadW;
uniform int uHair, uHat, uEyes, uMouth, uNose, uGlasses, uBeard, uTop, uEarring;
uniform vec3 uEyeL, uEyeR, uEyeNL, uEyeNR, uNosePos, uMouthPos;
uniform vec3 uBrowL0, uBrowL1, uBrowR0, uBrowR1;
uniform vec4 uCurls[14];
uniform int uCurlN;
uniform float uHairline, uFringe;
uniform vec2 uGaze;
uniform vec3 cSkin, cHair, cIris, cShirt, cHat, cFrame, cBg, cBg2, cBlush, cLip;
uniform float uBlush, uFreckles;

float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
float smax(float a, float b, float k) { return -smin(-a, -b, k); }
float sdSphere(vec3 p, float r) { return length(p) - r; }
float sdEllipsoid(vec3 p, vec3 r) { float k0 = length(p / r); float k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / k1; }
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) { vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }
float sdBox(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
float sdRoundBox(vec3 p, vec3 b, float r) { return sdBox(p, b - r) - r; }
float sdRoundRect(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
// an arc of radius ra opening around +y, half-aperture ta
float sdArc(vec2 p, float ta, float ra) { p.x = abs(p.x); vec2 sc = vec2(sin(ta), cos(ta)); return (sc.y * p.x > sc.x * p.y) ? length(p - sc * ra) : abs(length(p) - ra); }
vec2 U(vec2 a, float d, float id) { return d < a.x ? vec2(d, id) : a; }

float headShape(vec3 p) {
  vec3 q = vec3(p.x / uHeadW, p.y, p.z);
  float d = smin(sdSphere(q - vec3(0.0, 0.1, 0.0), 1.0), sdEllipsoid(q - vec3(0.0, -0.32, 0.06), vec3(0.8, 0.72, 0.82)), 0.35);
  return d * min(uHeadW, 1.0);
}

// sclera, iris or pupil, by the angle from the gaze direction
float eyePart(vec3 p, vec3 c, vec3 n) {
  vec3 dir = normalize(n + vec3(uGaze * 0.5, 0.0));
  float a = dot(normalize(p - c), dir);
  return a > 0.958 ? 5.0 : a > 0.83 ? 4.0 : 3.0;
}

vec2 eye(vec2 res, vec3 p, vec3 E, vec3 N, int kind) {
  if (kind == 0 || kind == 2) {
    vec3 c = E - N * 0.07;
    res = U(res, sdSphere(p - c, 0.17), eyePart(p, c, N));
    if (kind == 2) res = U(res, max(sdSphere(p - c, 0.183), -dot(p - c, normalize(vec3(0.0, 1.0, 0.25)))), 1.0);
  } else if (kind == 1) {
    res = U(res, sdSphere(p - (E - N * 0.02), 0.085), 5.0);
  } else {
    vec3 m = p - E;
    float d2 = sdArc(vec2(m.x, m.y + 0.06), 1.0, 0.11);
    res = U(res, length(vec2(d2, dot(m, N))) - 0.03, 5.0);
  }
  return res;
}

vec2 glassesRing(vec2 res, vec3 p, vec3 G, vec3 N) {
  vec3 q = p - G;
  float zz = dot(q, N);
  float ring = uGlasses == 2 ? sdRoundRect(q.xy, vec2(0.23, 0.17), 0.07) : length(q.xy) - 0.215;
  res = U(res, length(vec2(ring, zz)) - 0.025, 10.0);
  if (uGlasses == 3) res = U(res, max(ring, abs(zz) - 0.012), 11.0);
  return res;
}

vec2 map(vec3 pw) {
  vec3 p = uRot * pw;

  // ---- head, ears, nose, neck: one skin surface
  float head = headShape(p);
  vec3 qe = vec3(abs(p.x), p.y, p.z);
  head = smin(head, sdEllipsoid(qe - vec3(0.92 * uHeadW, -0.1, -0.05), vec3(0.14, 0.24, 0.12)), 0.07);
  float nose = uNose == 0 ? sdSphere(p - uNosePos, 0.12)
    : uNose == 1 ? sdEllipsoid(p - uNosePos - vec3(0.0, 0.04, -0.02), vec3(0.1, 0.18, 0.15))
    : sdSphere(p - uNosePos, 0.075);
  head = smin(head, nose, 0.07);
  head = smin(head, sdCapsule(p, vec3(0.0, -0.7, -0.14), vec3(0.0, -1.7, -0.14), 0.33), 0.15);

  float id = 1.0;
  vec3 m = p - uMouthPos;
  if (uMouth == 2 || uMouth == 3) {
    float cut = uMouth == 2 ? max(sdEllipsoid(m - vec3(0.0, 0.02, 0.0), vec3(0.23, 0.15, 0.22)), m.y - 0.03)
                            : sdEllipsoid(m, vec3(0.085, 0.1, 0.2));
    float hb = head;
    head = smax(hb, -cut, 0.025);
    if (-cut > hb - 0.01) id = 6.0;
  }
  vec2 res = vec2(head, id);
  if (uMouth == 2) {
    res = U(res, sdRoundBox(m - vec3(0.0, 0.0, -0.11), vec3(0.17, 0.035, 0.09), 0.02), 7.0);
    res = U(res, sdSphere(m - vec3(0.0, -0.12, -0.17), 0.1), 13.0);
  }
  float mz = m.z + m.x * m.x * 0.55;
  if (uMouth == 0 || uMouth == 4) {
    vec2 a = m.xy;
    if (uMouth == 4) { a -= vec2(0.05, 0.0); a = mat2(cos(0.3), sin(0.3), -sin(0.3), cos(0.3)) * a; }
    float d2 = sdArc(vec2(a.x, -(a.y - 0.18)), uMouth == 4 ? 0.55 : 0.72, 0.2);
    res = U(res, length(vec2(d2, mz)) - 0.032, 6.0);
  } else if (uMouth == 1) {
    res = U(res, sdCapsule(vec3(m.x, m.y, mz), vec3(-0.11, 0.0, 0.0), vec3(0.11, 0.0, 0.0), 0.03), 6.0);
  }

  // ---- eyes and brows
  res = eye(res, p, uEyeL, uEyeNL, uEyes == 4 ? 0 : uEyes);
  res = eye(res, p, uEyeR, uEyeNR, uEyes == 4 ? 3 : uEyes);
  res = U(res, sdCapsule(p, uBrowL0, uBrowL1, 0.038), 2.0);
  res = U(res, sdCapsule(p, uBrowR0, uBrowR1, 0.038), 2.0);

  // ---- hair, carved away from the face below the hairline
  if (uHair > 0) {
    // a fringe sweeps to one side; uFringe's sign picks which
    float hl = uHairline + 0.22 * p.x * p.x + abs(uFringe) * 0.035 * sin(p.x * 13.0 + 1.3) + uFringe * 0.14 * p.x;
    float face = max(-(p.z - 0.05), p.y - hl);
    vec3 hc = p - vec3(0.0, 0.12, -0.03);
    float back = 0.55 * max(-p.z, 0.0);
    float V = 1e5;
    if (uHair == 1) V = max(sdSphere(hc, 1.08), -(p.y + 0.02 + back));
    else if (uHair == 2) V = max(sdSphere(hc, 1.035), -(p.y + back));
    else if (uHair == 3) V = max(sdEllipsoid(p - vec3(0.0, 0.05, -0.06), vec3(1.17, 1.14, 1.13)), -(p.y + 0.66));
    else if (uHair == 4) {
      V = max(sdEllipsoid(p - vec3(0.0, 0.05, -0.06), vec3(1.15, 1.12, 1.12)), -(p.y + 0.3));
      V = smin(V, sdRoundBox(p - vec3(0.0, -0.95, -0.42), vec3(0.98, 0.95, 0.32), 0.3), 0.3);
    }
    else if (uHair == 5) { V = max(sdSphere(hc, 1.07), -(p.y + 0.02 + back)); V = smin(V, sdSphere(p - vec3(0.0, 1.12, -0.32), 0.42), 0.12); }
    else if (uHair == 6) V = max(sdSphere(p - vec3(0.0, 0.35, -0.22), 1.42), -(p.y + 0.45));
    else if (uHair == 7) V = sdEllipsoid(p - vec3(0.0, 0.92, -0.1), vec3(0.16, 0.5, 0.95));
    else if (uHair == 8) {
      V = max(sdSphere(hc, 1.05), -(p.y + 0.02 + back));
      for (int i = 0; i < 14; i++) { if (i >= uCurlN) break; V = smin(V, sdSphere(p - uCurls[i].xyz, uCurls[i].w), 0.08); }
    }
    V = smax(V, -face, 0.04);
    res = U(res, V, 2.0);
  }

  // ---- hats
  if (uHat == 1) {
    float tilt = 0.3 * max(-p.z, 0.0);
    float b = max(sdSphere(p - vec3(0.0, 0.14, -0.03), 1.1), -(p.y - 0.3 + tilt));
    float band = max(sdSphere(p - vec3(0.0, 0.14, -0.03), 1.16), abs(p.y - 0.4 + tilt) - 0.11);
    b = smin(b, band, 0.03);
    b = smin(b, sdSphere(p - vec3(0.0, 1.32, -0.1), 0.24), 0.05);
    res = U(res, b, 9.0);
  } else if (uHat == 2) {
    float dome = max(sdSphere(p - vec3(0.0, 0.15, -0.03), 1.08), -(p.y - 0.32));
    vec3 bq = p - vec3(0.0, 0.37, 0.92);
    bq.yz = mat2(cos(-0.15), sin(-0.15), -sin(-0.15), cos(-0.15)) * bq.yz;
    float brim = max(sdEllipsoid(bq, vec3(0.8, 0.055, 0.72)), -(p.z - 0.35));
    dome = min(dome, brim);
    dome = min(dome, sdSphere(p - vec3(0.0, 1.22, -0.03), 0.07));
    res = U(res, dome, 9.0);
  }

  // ---- glasses
  if (uGlasses > 0) {
    vec3 gL = uEyeL + uEyeNL * 0.13, gR = uEyeR + uEyeNR * 0.13;
    res = glassesRing(res, p, gL, uEyeNL);
    res = glassesRing(res, p, gR, uEyeNR);
    vec3 mid = vec3(0.0, (gL.y + gR.y) * 0.5 + 0.06, (gL.z + gR.z) * 0.5 + 0.02);
    float w = uGlasses == 2 ? 0.23 : 0.215;
    res = U(res, sdCapsule(p, gL + vec3(w, 0.02, 0.0), mid, 0.022), 10.0);
    res = U(res, sdCapsule(p, gR - vec3(w, -0.02, 0.0), mid, 0.022), 10.0);
    res = U(res, sdCapsule(p, gL - vec3(w, 0.0, 0.0), vec3(-0.9 * uHeadW, gL.y + 0.02, -0.25), 0.02), 10.0);
    res = U(res, sdCapsule(p, gR + vec3(w, 0.0, 0.0), vec3(0.9 * uHeadW, gR.y + 0.02, -0.25), 0.02), 10.0);
  }

  // ---- facial hair
  if (uBeard == 1) {
    float bd = max(sdEllipsoid(p - vec3(0.0, -0.5, 0.1), vec3(0.88, 0.66, 0.86)), p.y + 0.18);
    bd = smax(bd, -sdEllipsoid(m - vec3(0.0, 0.02, 0.15), vec3(0.24, 0.1, 0.35)), 0.04);
    bd = max(bd, -(p.z + 0.1));
    res = U(res, bd, 2.0);
  }
  if (uBeard > 0) {
    res = U(res, sdEllipsoid(p - (uNosePos + vec3(-0.1, -0.15, -0.05)), vec3(0.13, 0.05, 0.07)), 2.0);
    res = U(res, sdEllipsoid(p - (uNosePos + vec3(0.1, -0.15, -0.05)), vec3(0.13, 0.05, 0.07)), 2.0);
  }

  if (uEarring == 1) {
    vec3 q = vec3(abs(p.x), p.y, p.z) - vec3(0.95 * uHeadW, -0.36, 0.0);
    res = U(res, length(vec2(length(q.yz) - 0.06, q.x)) - 0.016, 12.0);
  }

  // ---- shoulders
  res = U(res, sdEllipsoid(p - vec3(0.0, -2.15, -0.15), vec3(1.6, 0.85, 0.9)), 8.0);
  if (uTop == 1) res = U(res, sdCapsule(p, vec3(0.0, -1.0, -0.14), vec3(0.0, -1.55, -0.14), 0.37), 8.0);
  else {
    vec3 q = p - vec3(0.0, -1.42, -0.12);
    res = U(res, length(vec2(length(q.xz) - 0.38, q.y)) - 0.07, 8.0);
  }
  return res;
}

vec3 normalAt(vec3 p) {
  vec2 e = vec2(1.0, -1.0) * 0.0015;
  return normalize(e.xyy * map(p + e.xyy).x + e.yyx * map(p + e.yyx).x + e.yxy * map(p + e.yxy).x + e.xxx * map(p + e.xxx).x);
}

float shadow(vec3 ro, vec3 rd) {
  float r = 1.0, t = 0.03;
  for (int i = 0; i < 22; i++) {
    float h = map(ro + rd * t).x;
    r = min(r, 9.0 * h / t);
    t += clamp(h, 0.03, 0.25);
    if (r < 0.01 || t > 3.0) break;
  }
  return clamp(r, 0.0, 1.0);
}

float occlusion(vec3 p, vec3 n) {
  float o = 0.0, s = 1.0;
  for (int i = 0; i < 5; i++) {
    float h = 0.02 + 0.11 * float(i);
    o += (h - map(p + n * h).x) * s;
    s *= 0.72;
  }
  return clamp(1.0 - 1.7 * o, 0.0, 1.0);
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

vec3 albedo(float id, vec3 p) {
  if (id < 1.5) {
    vec3 c = cSkin;
    float bl = max(exp(-dot(p.xy - vec2(0.5, -0.33), p.xy - vec2(0.5, -0.33)) / 0.03), exp(-dot(p.xy - vec2(-0.5, -0.33), p.xy - vec2(-0.5, -0.33)) / 0.03));
    c = mix(c, cBlush, bl * uBlush * 0.5 * step(0.0, p.z));
    if (uFreckles > 0.5 && p.z > 0.4) {
      vec2 g = floor(p.xy * 26.0);
      float f = step(0.8, hash(g)) * smoothstep(0.32, 0.0, length(fract(p.xy * 26.0) - 0.5) - 0.12);
      float zone = max(exp(-dot(p.xy - vec2(0.38, -0.22), p.xy - vec2(0.38, -0.22)) / 0.05), exp(-dot(p.xy - vec2(-0.38, -0.22), p.xy - vec2(-0.38, -0.22)) / 0.05));
      c = mix(c, c * vec3(0.62, 0.45, 0.35), f * zone);
    }
    return c;
  }
  if (id < 2.5) return cHair;
  if (id < 3.5) return vec3(0.92, 0.91, 0.88);
  if (id < 4.5) return cIris;
  if (id < 5.5) return vec3(0.012, 0.012, 0.016);
  if (id < 6.5) return cLip;
  if (id < 7.5) return vec3(0.9, 0.88, 0.82);
  if (id < 8.5) return cShirt;
  if (id < 9.5) return cHat;
  if (id < 10.5) return cFrame;
  if (id < 11.5) return vec3(0.01, 0.012, 0.02);
  if (id < 12.5) return vec3(0.9, 0.6, 0.18);
  return vec3(0.85, 0.3, 0.34);
}

// [strength, shininess]
vec2 gloss(float id) {
  if (id > 2.5 && id < 5.5) return vec2(0.9, 90.0);
  if (id > 10.5 && id < 12.5) return vec2(1.0, 70.0);
  if (id > 9.5 && id < 10.5) return vec2(0.5, 50.0);
  if (id < 1.5) return vec2(0.12, 18.0);
  if (id < 2.5) return vec2(0.16, 24.0);
  return vec2(0.06, 12.0);
}

vec3 background(vec2 uv) {
  float r = length(uv - vec2(0.0, 0.3));
  return mix(cBg2, cBg, smoothstep(0.1, 1.3, r));
}

void main() {
  vec2 uv = (2.0 * gl_FragCoord.xy - uRes) / uRes.y;
  vec3 ro = vec3(0.0, -0.1, 7.2), ta = vec3(0.0, -0.2, 0.0);
  vec3 ww = normalize(ta - ro), uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0))), vv = cross(uu, ww);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + 4.0 * ww);

  float t = 4.0, id = 0.0;
  for (int i = 0; i < 140; i++) {
    vec2 h = map(ro + rd * t);
    if (h.x < 0.001 * t) { id = h.y; break; }
    t += h.x * 0.9;
    if (t > 10.5) break;
  }

  vec3 L = normalize(vec3(-0.55, 0.62, 0.7));
  if (id < 0.5) {
    if (uMode == 2) { frag = vec4(0.0, 1.0, 1.0, 1.0); return; }
    vec3 bg = background(uv);
    if (uMode == 1) {
      vec2 g = mat2(0.707, 0.707, -0.707, 0.707) * gl_FragCoord.xy / (uRes.y / 90.0);
      float dotR = 0.22 * smoothstep(0.2, 1.6, length(uv - vec2(0.0, 0.25)));
      bg = length(fract(g) - 0.5) < dotR ? cBg * 0.86 : cBg;
    }
    frag = vec4(pow(bg, vec3(1.0 / 2.2)), 1.0);
    return;
  }

  vec3 pos = ro + rd * t;
  vec3 n = normalAt(pos);
  vec3 po = uRot * pos;
  vec3 alb = albedo(id, po);
  float dif = clamp(dot(n, L), 0.0, 1.0);
  if (id < 1.5) dif = clamp((dot(n, L) + 0.3) / 1.3, 0.0, 1.0);
  float sh = shadow(pos + n * 0.01, L);
  float ao = occlusion(pos, n);
  float amb = 0.5 + 0.5 * n.y;
  float fre = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
  vec3 H = normalize(L - rd);
  vec2 gs = gloss(id);
  float spe = pow(max(dot(n, H), 0.0), gs.y) * gs.x * sh;

  if (uMode == 2) {
    frag = vec4(id / 16.0, clamp((t - 4.0) / 6.0, 0.0, 1.0), clamp(dif * sh * 0.8 + amb * ao * 0.3, 0.0, 1.0), 1.0);
    return;
  }

  vec3 col;
  if (uMode == 0) {
    vec3 lin = vec3(1.05, 0.98, 0.9) * dif * sh * 1.15;
    lin += mix(vec3(0.3, 0.27, 0.25), vec3(0.55, 0.6, 0.7), amb) * ao * 0.6;
    lin += vec3(0.85, 0.75, 0.7) * clamp(dot(n, normalize(vec3(0.7, -0.1, 0.5))), 0.0, 1.0) * 0.18 * ao;
    lin += cBg * fre * 0.55 * ao;
    col = alb * lin + vec3(spe);
    if (id < 1.5) col += alb * vec3(0.9, 0.25, 0.15) * 0.08 * (1.0 - dif); // warm subsurface in the shadows
    col = col / (1.0 + col * 0.12);
  } else {
    float lam = dif * sh;
    float band = lam > 0.42 ? 1.0 : lam > 0.1 ? 0.8 : 0.66;
    col = alb * band;
    if (band < 1.0) {
      vec2 g = mat2(0.707, 0.707, -0.707, 0.707) * gl_FragCoord.xy / (uRes.y / 110.0);
      if (length(fract(g) - 0.5) < (1.0 - lam) * 0.38) col *= 0.82;
    }
    if (spe > 0.45) col = mix(col, vec3(1.0), 0.85);
    if (fre > 0.55 && lam > 0.1) col = mix(col, vec3(1.0), 0.18);
  }
  frag = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}`;
