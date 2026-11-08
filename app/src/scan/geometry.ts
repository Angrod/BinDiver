export interface Size { width: number; height: number }
export interface Rect { x: number; y: number; width: number; height: number }
export type Percent = `${number}%`;
export interface PercentRegion { left: Percent; top: Percent; width: Percent; height: Percent }

export const CARD_ASPECT = 63 / 88; // width / height
export const OUTLINE_SHARE = 0.88; // outline fits within 88% of the view in both directions
export const BAND_TOP = 0.03;
export const BAND_HEIGHT = 0.12; // title strip, as shares of the outline's height
export const FRAME_ASPECT = 9 / 16; // display-oriented frame (CommonResolutions.FHD_16_9)
/**
 * Field of view relative to the main camera; tune at the gate.
 * At 1× a card filling the outline sits about 13–14 cm away, likely closer than the main camera can focus.
 */
export const CAMERA_ZOOM_X = 2;

/** What the zoom choice needs from a VisionCamera CameraDevice. */
export interface ZoomInfo {
  /** The types of the device's physical cameras, in the device's order; empty for a single camera. */
  physicalTypes: string[];
  /** The zoom values at which a multi-camera device switches to its next physical camera. */
  zoomLensSwitchFactors: number[];
  /** The device's maximum zoom; 0 when not yet known (Android before the camera opens). */
  maxZoom: number;
}

/**
 * The camera zoom: CAMERA_ZOOM_X times the zoom that shows the main (wide-angle) camera's view,
 * capped at the device maximum when that is known.
 * The neutral zoom is 1, except on a multi-camera device whose wide-angle camera comes after another
 * (an ultra-wide): there it is the switch factor into the wide-angle camera.
 */
export function cameraZoom(d: ZoomInfo): number {
  const wide = d.physicalTypes.indexOf('wide-angle');
  const neutral = wide > 0 ? (d.zoomLensSwitchFactors[wide - 1] ?? 1) : 1;
  const want = CAMERA_ZOOM_X * neutral;
  return d.maxZoom > 0 ? Math.min(want, d.maxZoom) : want;
}

/** How far the live zoom may sit from the target before it is set again. */
const ZOOM_TOLERANCE = 0.05;

/**
 * The zoom to set now, or null to leave it: the target, capped at the live maximum when that is known,
 * whenever the live zoom has drifted from it (Android's camera drops back to 1x on every stop and start).
 */
export function zoomToApply(actual: number, target: number, maxZoom: number): number | null {
  const want = maxZoom > 0 ? Math.min(target, maxZoom) : target;
  return Math.abs(actual - want) > ZOOM_TOLERANCE ? want : null;
}

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
