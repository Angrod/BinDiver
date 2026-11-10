import { levenshtein } from '../../text/levenshtein';
import { normalizeName } from './normalize';

/** The end of every card's copyright line, "™ & © 2026 Wizards of the Coast". */
const FOOTER = 'wizards of the coast';
/** What comes before "coast" in it. */
const FOOTER_HEAD = 'wizards of the ';
/** The shortest end of the footer that may be one letter off: shorter ones are too close to titles (Roast). */
const SHORTEST_FUZZY_TAIL = 'the coast'.length;
/** Trailing words led by a digit, which the matcher also drops ("of the Coast 2", "Coast 28"). */
const TRAILING_DIGIT_WORDS = /(?: [0-9][0-9a-z]{0,2})+$/;

/** Whether the line ends within one edit of "the coast", "e the coast", ... up to "wizards of the coast". */
function endsLikeFooter(norm: string): boolean {
  for (let start = 0; start <= FOOTER.length - SHORTEST_FUZZY_TAIL; start++) {
    const tail = FOOTER.slice(start);
    for (const len of [tail.length - 1, tail.length, tail.length + 1]) {
      if (len <= norm.length && levenshtein(norm.slice(norm.length - len), tail, 1) <= 1) return true;
    }
  }
  return false;
}

/**
 * Whether a camera line is a card's copyright line ("™ & © 2026 Wizards of the Coast", "© 2026 Viacom")
 * or a piece of one. A title strip only sees it when it sits over the bottom of a card (the phone held
 * off the card, or a card upside down), so nothing else in that frame is a title either.
 * Caught, after dropping trailing digit-led words and "inc": a © mark, or "c" and a year as the camera reads
 * "©2026"; "viacom"; a line ending within one letter of "the coast" or more of "wizards of the coast"; and
 * "coast" exactly, alone or after the end of "wizards of the" ("he coast"). A lone word one letter off
 * ("Coust") isn't caught: it is as close to Joust or Roast.
 * "The Ultimate Nightmare of Wizards of the Coast Customer Service" doesn't end there, so it stays a
 * title; the joke card "Of the Coast" is caught, and can only be found by typing.
 */
export function isFooterLine(raw: string): boolean {
  if (raw.includes('©')) return true;
  const norm = normalizeName(raw).replace(TRAILING_DIGIT_WORDS, '').replace(/ inc$/, '');
  if (norm.includes('viacom') || /(?:^| )c(?:19|20)\d\d(?: |$)/.test(norm)) return true;
  if (endsLikeFooter(norm)) return true;
  if (!norm.endsWith('coast')) return false;
  const before = norm.slice(0, -'coast'.length);
  return before === '' || (before.endsWith(' ') && FOOTER_HEAD.endsWith(before));
}
