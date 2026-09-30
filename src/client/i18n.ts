import de from '../data/i18n/de.json';
import en from '../data/i18n/en.json';

export type Lang = 'de' | 'en';
const dicts: Record<Lang, Record<string, string>> = { de: de as Record<string, string>, en: en as Record<string, string> };
let current: Lang = 'de';

export function setLang(l: Lang): void { current = l; }
export function getLang(): Lang { return current; }

/** Translate `key`; `{name}` placeholders are replaced from params. Falls back to German, then the key. */
export function t(key: string, params: Record<string, string | number> = {}): string {
  let s = dicts[current][key] ?? dicts.de[key] ?? key;
  for (const [k, v] of Object.entries(params)) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  return s;
}

export function has(key: string): boolean { return key in dicts[current] || key in dicts.de; }
