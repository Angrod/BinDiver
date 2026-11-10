export interface Size { width: number; height: number }
export interface Rect { x: number; y: number; width: number; height: number }
export type Percent = `${number}%`;
export interface PercentRegion { left: Percent; top: Percent; width: Percent; height: Percent }

export const CARD_ASPECT = 63 / 88; // width / height
/**
 * The outline's width as a share of the camera's, and its top margin as a share of its own height: the size and
 * place it had when the camera took the top half of Matt's iPhone 13 (Nov 10), so the holding distance stays.
 */
export const OUTLINE_WIDTH_SHARE = 0.41;
export const OUTLINE_TOP = 0.068;
// The title strip, as shares of the outline: from 2% above its top edge to 20% down, and 4% of its
// width past each side. A title sits about 5-8% down a card; only the topmost line in the strip is read.
export const BAND_TOP = -0.02;
export const BAND_HEIGHT = 0.22;
export const BAND_SIDE = 0.04;

/** The frame output's resolution (a VisionCamera CommonResolutions key) and its display-oriented width / height. */
export interface FrameShape { resolution: 'FHD_16_9' | 'FHD_4_3'; aspect: number }

/**
 * The frame output's shape, matched to the camera preview's so the orange strip is the area read.
 * iOS gives the preview and the frames one format. Android's CameraX sizes the preview on its own, at 4:3
 * by default (VisionCamera 5.2.4 sets no preview resolution), so the frames are asked for at 4:3 there too.
 * VisionCamera is pinned at 5.2.4 for this: re-check the Android preview's size after any upgrade (the
 * Pixel 8 logged Preview 1600x1200 with ImageAnalysis 1920x1440).
 */
export function frameShape(os: string): FrameShape {
  return os === 'android' ? { resolution: 'FHD_4_3', aspect: 3 / 4 } : { resolution: 'FHD_16_9', aspect: 9 / 16 };
}
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

/**
 * Whether a camera error is Android's refusal to zoom before the camera is active: VisionCamera sets the
 * zoom prop as soon as the camera is created, and the scan screen sets it again once the camera starts.
 */
export function isEarlyZoomError(message: string): boolean {
  return message.includes('OperationCanceledException') && message.includes('Camera is not active');
}

/**
 * The camera view's height: all the space available, but never taller than the frame at that width
 * (`frameAspect` is the frame's width / height), so the preview never crops its sides and the cover
 * scale stays viewWidth / frameWidth. On a taller screen the rest is page background.
 */
export function cameraHeight(available: Size, frameAspect: number): number {
  return Math.min(available.height, available.width / frameAspect);
}

/** The card-shaped outline: a fixed share of the camera's width, centred across it, near its top. */
export function cardOutline(view: Size): Rect {
  const width = OUTLINE_WIDTH_SHARE * view.width;
  const height = width / CARD_ASPECT;
  return { x: (view.width - width) / 2, y: OUTLINE_TOP * height, width, height };
}

/** The title strip across the top of the outline. */
export function titleBand(outline: Rect): Rect {
  return {
    x: outline.x - BAND_SIDE * outline.width,
    y: outline.y + BAND_TOP * outline.height,
    width: (1 + 2 * BAND_SIDE) * outline.width,
    height: BAND_HEIGHT * outline.height,
  };
}

const pct = (n: number): Percent => `${(n * 100).toFixed(2)}%` as Percent;

/** Convert a rectangle in view points to a percentage region of the camera frame, undoing resizeMode 'cover'. */
export function viewRectToFrameRegion(rect: Rect, view: Size, frameAspect: number): PercentRegion {
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
