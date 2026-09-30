import * as THREE from 'three';
import manifest from '../../../assets/manifest.json';
import { paperTexture, corrugatedTexture, cottonTexture, eyeTexture } from '../materials/paper';

/**
 * Asset registry: every part in assets/manifest.json has a code-generated fallback. If a file is configured and
 * loads, it replaces the fallback; otherwise the fallback is used. The game never depends on external images.
 */
export interface Part { id: string; fallback: string; file: string | null; size: [number, number]; beschreibung: string }

const loader = new THREE.TextureLoader();
const cache = new Map<string, THREE.Texture>();

export function parts(): Part[] { return (manifest as { parts: Part[] }).parts; }

function fallbackFor(p: Part): THREE.Texture {
  switch (p.fallback) {
    case 'paperTexture': return paperTexture('#ffffff', 1);
    case 'corrugatedTexture': return corrugatedTexture();
    case 'cottonTexture': return cottonTexture(7);
    case 'eyeTexture': return eyeTexture(0, 0);
    case 'stoneTexture': { const rock = p.id.split('_')[1] ?? 'granit'; return paperTexture({ granit: '#9a8f86', kalkstein: '#d8cdb0', sandstein: '#d1a06a', basalt: '#5d5a5f' }[rock] ?? '#9a8f86', 31 + p.id.length); }
    default: return paperTexture('#e8d6ad', 5);
  }
}

/** Texture for a manifest part: file if present, code fallback otherwise (fallback is returned immediately, the file swaps in when loaded). */
export function partTexture(id: string): THREE.Texture {
  const cached = cache.get(id);
  if (cached) return cached;
  const p = parts().find((x) => x.id === id);
  if (!p) throw new Error('unknown asset part ' + id);
  const tex = fallbackFor(p);
  cache.set(id, tex);
  if (p.file) {
    loader.load(p.file, (loaded) => { loaded.colorSpace = THREE.SRGBColorSpace; cache.set(id, loaded); }, undefined, () => { /* keep fallback */ });
  }
  return tex;
}
