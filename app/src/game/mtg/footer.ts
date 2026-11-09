import { normalizeName } from './normalize';

/** What comes before "coast" on every card's copyright line, "™ & © 2026 Wizards of the Coast". */
const FOOTER_HEAD = 'wizards of the ';

/**
 * Whether a camera line is a card's copyright line ("™ & © 2026 Wizards of the Coast", "© 2026 Viacom")
 * or a piece of one. A title strip only sees it when it sits over the bottom of a card (the phone held
 * off the card, or a card upside down), so nothing else in that frame is a title either.
 * Caught: a © mark, or "c" and a year as the camera reads "©2026"; "viacom"; a line ending in "the coast"
 * (after dropping "inc"); and "coast" alone or after the end of "wizards of the" ("he coast").
 * "The Ultimate Nightmare of Wizards of the Coast Customer Service" doesn't end there, so it stays a
 * title; the joke card "Of the Coast" is caught, and can only be found by typing.
 */
export function isFooterLine(raw: string): boolean {
  if (raw.includes('©')) return true;
  const norm = normalizeName(raw).replace(/ inc$/, '');
  if (norm.includes('viacom') || /(?:^| )c(?:19|20)\d\d(?: |$)/.test(norm)) return true;
  if (norm.endsWith('the coast')) return true;
  if (!norm.endsWith('coast')) return false;
  const before = norm.slice(0, -'coast'.length);
  return before === '' || (before.endsWith(' ') && FOOTER_HEAD.endsWith(before));
}
