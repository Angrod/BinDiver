// Typed searches for cards the camera can't read: set code + collector number, or number/total.
export type ParsedSearch =
  | { kind: 'name' }
  | { kind: 'set-number'; pairs: Array<{ set: string; number: string }> }
  | { kind: 'number-total'; number: string; total: number };

const LIST_TOKEN = /^[a-z0-9]{2,5}-[a-z0-9]+$/;
const SET_TOKEN = /^[a-z0-9]{2,6}$/;
const NUMBER_TOKEN = /^(\d+)([a-z★†]{0,2})$/;

function asSet(token: string): string | null {
  return SET_TOKEN.test(token) && /[a-z]/.test(token) ? token : null;
}

function asNumber(token: string): string | null {
  const m = NUMBER_TOKEN.exec(token);
  return m ? (m[1].replace(/^0+(?=\d)/, '') + m[2]) : null;
}

export function parseSearch(text: string): ParsedSearch {
  const t = text.toLowerCase().trim().replace(/\*/g, '★');
  const total = /^(\d+)\s*\/\s*(\d+)$/.exec(t);
  if (total) return { kind: 'number-total', number: String(Number(total[1])), total: Number(total[2]) };

  const tokens = t.split(/\s+/)
    .filter((tok) => !/^[a-z]$/.test(tok))
    .map((tok) => tok.split('/')[0]);

  const listIdx = tokens.findIndex((tok) => LIST_TOKEN.test(tok));
  if (tokens.length === 1 && listIdx === 0) {
    return { kind: 'set-number', pairs: [{ set: 'plst', number: tokens[0] }] };
  }
  if (tokens.length === 2 && listIdx >= 0 && tokens[1 - listIdx] === 'plst') {
    return { kind: 'set-number', pairs: [{ set: 'plst', number: tokens[listIdx] }] };
  }
  if (tokens.length === 2) {
    const pairs: Array<{ set: string; number: string }> = [];
    for (const [s, n] of [[tokens[0], tokens[1]], [tokens[1], tokens[0]]]) {
      const set = asSet(s);
      const number = asNumber(n);
      if (set && number) pairs.push({ set, number });
    }
    if (pairs.length) return { kind: 'set-number', pairs };
  }
  return { kind: 'name' };
}
