export interface OcrLine { text: string; x: number; y: number; width: number; height: number }

interface TextLike {
  blocks: Array<{
    lines: Array<{
      lineText: string;
      lineFrame: { boundingCenterX: number; boundingCenterY: number; width: number; height: number };
    }>;
  }>;
}

/**
 * Flatten the OCR result into lines, in block order.
 * ocr-plus's lineFrame x and y are skewed (top + (centreY − ceil(height)) / 2, on iOS and Android),
 * so the top-left corner comes from the exact centre and size instead.
 */
export function linesFromText(text: TextLike): OcrLine[] {
  const out: OcrLine[] = [];
  for (const block of text.blocks) {
    for (const l of block.lines) {
      const { boundingCenterX, boundingCenterY, width, height } = l.lineFrame;
      out.push({ text: l.lineText, x: boundingCenterX - width / 2, y: boundingCenterY - height / 2, width, height });
    }
  }
  return out;
}

/**
 * The strings to match, in the order to try: the top row joined left to right, then each of its lines alone.
 * The top row is the topmost non-blank line (smallest y, ties to smaller x) plus every non-blank line whose
 * vertical centre falls within that line's vertical extent, so a separate mana-cost line joins its title.
 */
export function titleCandidates(lines: OcrLine[]): string[] {
  const filled = lines.filter((l) => l.text.trim() !== '');
  let top: OcrLine | null = null;
  for (const l of filled) {
    if (top === null || l.y < top.y || (l.y === top.y && l.x < top.x)) top = l;
  }
  if (top === null) return [];
  const t = top;
  const row = filled
    .filter((l) => {
      const centre = l.y + l.height / 2;
      return l === t || (centre >= t.y && centre <= t.y + t.height);
    })
    .sort((a, b) => a.x - b.x)
    .map((l) => l.text.trim());
  return row.length === 1 ? row : [row.join(' '), ...row];
}
