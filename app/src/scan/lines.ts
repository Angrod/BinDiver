export interface OcrLine { text: string; x: number; y: number; width: number; height: number }

interface TextLike {
  blocks: Array<{ lines: Array<{ lineText: string; lineFrame: { x: number; y: number; width: number; height: number } }> }>;
}

/** Flatten the OCR result into lines, in block order. */
export function linesFromText(text: TextLike): OcrLine[] {
  const out: OcrLine[] = [];
  for (const block of text.blocks) {
    for (const l of block.lines) {
      const { x, y, width, height } = l.lineFrame;
      out.push({ text: l.lineText, x, y, width, height });
    }
  }
  return out;
}

/** The topmost non-blank line: smallest y, ties broken by smaller x. */
export function topLine(lines: OcrLine[]): OcrLine | null {
  let best: OcrLine | null = null;
  for (const l of lines) {
    if (l.text.trim() === '') continue;
    if (best === null || l.y < best.y || (l.y === best.y && l.x < best.x)) best = l;
  }
  return best;
}
