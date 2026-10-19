// apply per-synapse gains: len 358 -> DN-input edges; len == #edges -> all edges
export function applyGains(brain, base, g) {
  brain.eWeight.set(base); if (!g || !g.length) return;
  if (g.length === brain.ePost.length) { for (let e = 0; e < g.length; e++) brain.eWeight[e] = base[e] * Math.max(0, Math.min(4, 1 + g[e])); return; }
  const outs = new Set(brain.outputs); let j = 0;
  for (let e = 0; e < brain.ePost.length; e++) if (outs.has(brain.ePost[e])) brain.eWeight[e] = base[e] * Math.max(0, Math.min(4, 1 + g[j++]));
}
