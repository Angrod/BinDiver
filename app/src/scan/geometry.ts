export interface Size { width: number; height: number }
export interface Rect { x: number; y: number; width: number; height: number }
export type Percent = `${number}%`;
export interface PercentRegion { left: Percent; top: Percent; width: Percent; height: Percent }

export const CARD_ASPECT = 63 / 88; // width / height
export const OUTLINE_SHARE = 0.88; // outline fits within 88% of the view in both directions
export const BAND_TOP = 0.03;
export const BAND_HEIGHT = 0.12; // title strip, as shares of the outline's height
export const FRAME_ASPECT = 9 / 16; // display-oriented frame (CommonResolutions.FHD_16_9)

/** The card-shaped outline, centred in the view. */
export function cardOutline(view: Size): Rect {
  const height = Math.min(OUTLINE_SHARE * view.height, (OUTLINE_SHARE * view.width) / CARD_ASPECT);
  const width = height * CARD_ASPECT;
  return { x: (view.width - width) / 2, y: (view.height - height) / 2, width, height };
}

/** The title strip near the top of the outline. */
export function titleBand(outline: Rect): Rect {
  return {
    x: outline.x,
    y: outline.y + BAND_TOP * outline.height,
    width: outline.width,
    height: BAND_HEIGHT * outline.height,
  };
}

const pct = (n: number): Percent => `${(n * 100).toFixed(2)}%` as Percent;

/** Convert a rectangle in view points to a percentage region of the camera frame, undoing resizeMode 'cover'. */
export function viewRectToFrameRegion(rect: Rect, view: Size, frameAspect: number = FRAME_ASPECT): PercentRegion {
  let frameW: number;
  let frameH: number;
  if (view.width / view.height > frameAspect) {
    frameW = view.width;
    frameH = view.width / frameAspect;
  } else {
    frameH = view.height;
    frameW = view.height * frameAspect;
  }
  const offsetX = (view.width - frameW) / 2;
  const offsetY = (view.height - frameH) / 2;
  return {
    left: pct((rect.x - offsetX) / frameW),
    top: pct((rect.y - offsetY) / frameH),
    width: pct(rect.width / frameW),
    height: pct(rect.height / frameH),
  };
}
