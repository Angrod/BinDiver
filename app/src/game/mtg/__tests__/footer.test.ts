import { isFooterLine } from '../footer';
import names from '../__fixtures__/names.json';
import misreads from '../__fixtures__/misreads.json';

// iPhone run 5 (Nov 9): with the strip over the bottom of a card, the copyright line committed
// "Wizards of the _____" (loose, from "Wizards of the Coast"), "Roast" (from a lone "Coast") and "Ninja"
// (a type-line word read with "2/3" and "of the Coast"). These lines are from that run's export.
describe('isFooterLine', () => {
  it('spots the copyright line and the pieces of it the camera reads', () => {
    for (const line of [
      'Wizards of the Coast', 'C2026 Viacom.', 'C2026 Viacom', '5viacom', '5 5 mthe coust 28 viacom', 'of the Coast',
      'f the Coast', 'as bf the coast', 'Coast', 'he coast', 'e coast', '2016 wizards of the coast',
      '™ & © 1999 Wizards of the Coast, Inc.', '© 2025 MARVEL',
    ]) {
      expect([line, isFooterLine(line)]).toEqual([line, true]);
    }
  });
  it('leaves titles alone, including ones with "Coast", "Wizards of the" or a year in them', () => {
    for (const line of [
      'Roast', 'Coast Watcher', 'Beyeen Coast', 'Coastal Tower', 'Wizards of the _____', '1996 World Champion',
      'The Ultimate Nightmare of Wizards of the Coast Customer Service', 'Ninja', 'Raphael, Most Attitude',
      'Command Tower', 'Circle of Protection: Black',
    ]) {
      expect([line, isFooterLine(line)]).toEqual([line, false]);
    }
  });
  it('flags only the joke card "Of the Coast" among all card names', () => {
    expect((names as Array<[string, string]>).map(([n]) => n).filter(isFooterLine)).toEqual(['of the coast']);
  });
  it('flags none of the recorded title misreads', () => {
    expect((misreads as [string, string][]).filter(([read]) => isFooterLine(read))).toEqual([]);
  });
});
