import { describe, it, expect } from 'vitest';
import de from '../src/data/i18n/de.json';
import en from '../src/data/i18n/en.json';

describe('i18n', () => {
  it('English has exactly the German keys, none empty', () => {
    const dk = Object.keys(de).sort();
    const ek = Object.keys(en).sort();
    expect(ek).toEqual(dk);
    for (const k of dk) expect((en as Record<string, string>)[k].trim().length, k).toBeGreaterThan(0);
  });
});
