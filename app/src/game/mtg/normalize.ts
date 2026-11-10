// Port of bindiver/mtg/normalize.py; normalize.json is the referee.
const LIGATURES: Record<string, string> = { 'æ': 'ae', 'Æ': 'ae', 'œ': 'oe', 'Œ': 'oe' };

export function normalizeName(raw: string): string {
  let text = raw.replace(/[æÆœŒ]/g, (c) => LIGATURES[c]);
  text = text.normalize('NFKD').replace(/\p{Mn}/gu, '');
  text = text.toLowerCase().replace(/['’‘`]/g, '');
  text = text.replace(/_+/g, ' _ ');
  return text
    .split(/\s*\/\/\s*/)
    .map((face) => face.replace(/[^a-z0-9_ ]+/g, ' ').split(/\s+/).filter(Boolean).join(' '))
    .join(' // ');
}
