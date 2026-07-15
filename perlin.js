/**
 * 2D Perlin noise (classic gradient noise)
 * Deterministic given a seed via mulberry32 PRNG.
 */
(function (global) {
  "use strict";

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function lerp(a, b, t) {
    return a + t * (b - a);
  }

  function grad(hash, x, y) {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  function createPerlin(seed) {
    const rand = mulberry32(seed);
    const p = new Uint8Array(512);
    const perm = new Uint8Array(256);

    for (let i = 0; i < 256; i++) perm[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = perm[i];
      perm[i] = perm[j];
      perm[j] = tmp;
    }
    for (let i = 0; i < 512; i++) p[i] = perm[i & 255];

    function noise2D(x, y) {
      const X = Math.floor(x) & 255;
      const Y = Math.floor(y) & 255;
      const xf = x - Math.floor(x);
      const yf = y - Math.floor(y);

      const u = fade(xf);
      const v = fade(yf);

      const aa = p[p[X] + Y];
      const ab = p[p[X] + Y + 1];
      const ba = p[p[X + 1] + Y];
      const bb = p[p[X + 1] + Y + 1];

      const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
      const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);

      // Map roughly from [-1, 1] to [0, 1]
      return (lerp(x1, x2, v) + 1) * 0.5;
    }

    /** Fractal Brownian Motion */
    function fbm(x, y, octaves, lacunarity, gain) {
      octaves = octaves || 5;
      lacunarity = lacunarity || 2;
      gain = gain || 0.5;

      let amp = 1;
      let freq = 1;
      let sum = 0;
      let max = 0;

      for (let i = 0; i < octaves; i++) {
        sum += noise2D(x * freq, y * freq) * amp;
        max += amp;
        amp *= gain;
        freq *= lacunarity;
      }
      return sum / max;
    }

    return { noise2D, fbm, rand };
  }

  /** Hash string seed to 32-bit int */
  function hashSeed(str) {
    if (typeof str === "number" && Number.isFinite(str)) {
      return str >>> 0;
    }
    const s = String(str || "atlas");
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  global.Perlin = { createPerlin, hashSeed, mulberry32 };
})(typeof window !== "undefined" ? window : globalThis);
