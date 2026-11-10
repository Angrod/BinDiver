import {
  CAMERA_ZOOM_X, CARD_ASPECT, cameraHeight, cameraZoom, cardOutline, frameShape, isEarlyZoomError, titleBand,
  viewRectToFrameRegion, zoomToApply, type Rect, type Size,
} from '../geometry';

const IOS = frameShape('ios').aspect;
const ANDROID = frameShape('android').aspect;

function expectRect(actual: Rect, e: Rect) {
  expect(actual.x).toBeCloseTo(e.x, 4);
  expect(actual.y).toBeCloseTo(e.y, 4);
  expect(actual.width).toBeCloseTo(e.width, 4);
  expect(actual.height).toBeCloseTo(e.height, 4);
}

/** The outline before Nov 10, when the camera took the top half: the card shape fitted to 88% of the view, centred. */
function halfScreenOutline(view: Size): Rect {
  const height = Math.min(0.88 * view.height, (0.88 * view.width) / CARD_ASPECT);
  const width = height * CARD_ASPECT;
  return { x: (view.width - width) / 2, y: (view.height - height) / 2, width, height };
}

// The space below the top strip: the iPhone 13 (390x844 pt, insets 47 and 34, a 60 pt strip) and the
// Pixel 8 (412x915 dp, insets of 24 dp top and bottom). An iPhone SE (375x667, a 20 pt status bar) is the short screen.
const IPHONE_13: Size = { width: 390, height: 703 };
const PIXEL_8: Size = { width: 412, height: 807 };
const IPHONE_SE: Size = { width: 375, height: 587 };

describe('cameraHeight', () => {
  // Nov 10: the camera takes the screen below the top strip, but never more than the frame's own height at the
  // screen's width, so the preview never crops its sides and the cover scale stays viewWidth / frameWidth.
  it('stops at the 16:9 frame height on the iPhone 13, leaving a sliver below', () => {
    expect(cameraHeight(IPHONE_13, IOS)).toBeCloseTo(693.3333, 4);
  });
  it('stops at the 4:3 frame height on the Pixel 8, leaving page background below', () => {
    expect(cameraHeight(PIXEL_8, ANDROID)).toBeCloseTo(549.3333, 4);
  });
  it('takes all the space on a screen shorter than the frame', () => {
    expect(cameraHeight(IPHONE_SE, IOS)).toBe(587);
  });
});

describe('cardOutline', () => {
  // The outline keeps the size and place it had in the half-screen camera on Matt's iPhone 13 (test mode):
  // 41% of the camera's width, card-shaped, centred, with its top 6.8% of its height below the camera's top.
  it('is 41% of the camera width, card-shaped, centred and near the top on the iPhone 13', () => {
    expectRect(cardOutline({ width: 390, height: 693.3333 }), { x: 115.05, y: 15.188, width: 159.9, height: 223.3524 });
  });
  it('is the same shape and margin on the Pixel 8', () => {
    expectRect(cardOutline({ width: 412, height: 549.3333 }), { x: 121.54, y: 16.0447, width: 168.92, height: 235.9517 });
  });
  it("depends only on the camera's width, so the extra height only shows more of the table", () => {
    expectRect(cardOutline({ width: 390, height: 587 }), cardOutline({ width: 390, height: 693.3333 }));
  });
});

describe('titleBand', () => {
  // Matt (Nov 9): the 3-15% strip was tight to line a title up in. It now runs from 2% above the
  // outline's top edge to 20% down, 4% wider on each side; it stops just above the outline so a card
  // standing behind in a bin doesn't put its own title on top.
  it('runs from just above the outline to a fifth of the way down, a little wider than the outline', () => {
    expectRect(titleBand({ x: 75.3, y: 22.8, width: 239.4, height: 334.4 }), { x: 65.724, y: 16.112, width: 258.552, height: 73.568 });
  });
  it('stays inside the camera view on the iPhone 13, the Pixel 8 and a short screen', () => {
    for (const [available, aspect] of [[IPHONE_13, IOS], [PIXEL_8, ANDROID], [IPHONE_SE, IOS]] as const) {
      const view = { width: available.width, height: cameraHeight(available, aspect) };
      const band = titleBand(cardOutline(view));
      expect(band.x).toBeGreaterThanOrEqual(0);
      expect(band.y).toBeGreaterThanOrEqual(0);
      expect(band.x + band.width).toBeLessThanOrEqual(view.width);
      expect(band.y + band.height).toBeLessThanOrEqual(view.height);
    }
  });
});

describe('the title band in the full-height camera', () => {
  // The half-screen camera on the iPhone 13 in test mode was 253.8 pt tall, which gave this same 159.9 pt outline.
  // Its band read 44.28% of the frame's width and 7.09% of its height: the same share now, so the same part of the
  // card at the same holding distance. Only its place in the frame moves up, as the camera now shows the whole frame.
  it('reads the same share of the frame as the half-screen layout on the iPhone 13, now near the top', () => {
    const before = { width: 390, height: 253.8095 };
    expect(halfScreenOutline(before).width).toBeCloseTo(159.9, 3);
    expect(viewRectToFrameRegion(titleBand(halfScreenOutline(before)), before, IOS)).toEqual({
      left: '27.86%', top: '33.25%', width: '44.28%', height: '7.09%',
    });
    const view = { width: 390, height: cameraHeight(IPHONE_13, IOS) };
    expect(viewRectToFrameRegion(titleBand(cardOutline(view)), view, IOS)).toEqual({
      left: '27.86%', top: '1.55%', width: '44.28%', height: '7.09%',
    });
  });
  it('reads the same share of the frame as the half-screen layout on the Pixel 8, now near the top', () => {
    const before = { width: 412, height: 268.127 };
    expect(halfScreenOutline(before).width).toBeCloseTo(168.92, 3);
    expect(viewRectToFrameRegion(titleBand(halfScreenOutline(before)), before, ANDROID)).toEqual({
      left: '27.86%', top: '27.66%', width: '44.28%', height: '9.45%',
    });
    const view = { width: 412, height: cameraHeight(PIXEL_8, ANDROID) };
    expect(viewRectToFrameRegion(titleBand(cardOutline(view)), view, ANDROID)).toEqual({
      left: '27.86%', top: '2.06%', width: '44.28%', height: '9.45%',
    });
  });
  it('keeps the cover scale on a short screen, where the frame is cropped top and bottom', () => {
    const view = { width: 375, height: cameraHeight(IPHONE_SE, IOS) };
    expect(viewRectToFrameRegion(titleBand(cardOutline(view)), view, IOS)).toEqual({
      left: '27.86%', top: '7.52%', width: '44.28%', height: '7.09%',
    });
  });
});

describe('viewRectToFrameRegion', () => {
  it('maps the full view when the frame is cropped top and bottom', () => {
    const view = { width: 390, height: 380 };
    expect(viewRectToFrameRegion({ x: 0, y: 0, ...view }, view, IOS)).toEqual({
      left: '0.00%', top: '22.60%', width: '100.00%', height: '54.81%',
    });
  });
  it('maps the title band', () => {
    const view = { width: 390, height: 380 };
    const band = titleBand(halfScreenOutline(view));
    expect(viewRectToFrameRegion(band, view, IOS)).toEqual({
      left: '16.85%', top: '24.92%', width: '66.30%', height: '10.61%',
    });
  });
  it('maps when the frame is cropped left and right', () => {
    const view = { width: 300, height: 600 };
    expect(viewRectToFrameRegion({ x: 0, y: 0, ...view }, view, IOS)).toEqual({
      left: '5.56%', top: '0.00%', width: '88.89%', height: '100.00%',
    });
  });
});

// Android run 1 (Pixel 8, Nov 9): CameraX gave the preview 1600x1200 (4:3) and the frames 1920x1080 (16:9),
// so the reader saw only the middle three quarters of the preview's width and read 11-27% down the outline:
// below a lined-up card's title. Frames now take the preview's shape on each platform.
describe('frameShape', () => {
  it('keeps iOS at 16:9, where the preview and the frames share one format', () => {
    expect(frameShape('ios')).toEqual({ resolution: 'FHD_16_9', aspect: 9 / 16 });
  });
  it("asks for 4:3 frames on Android, the shape of CameraX's default preview", () => {
    expect(frameShape('android')).toEqual({ resolution: 'FHD_4_3', aspect: 3 / 4 });
  });
  it('maps the title band on a Pixel-shaped view to the scan region the Pixel 8 logged', () => {
    // logcat on update 01a1c2a4: scanRegion=ScanRegion(left=17.18, top=16.89, width=65.65, height=14.01)
    const view = { width: 412, height: 397.5 };
    expect(viewRectToFrameRegion(titleBand(halfScreenOutline(view)), view, ANDROID)).toEqual({
      left: '17.18%', top: '16.89%', width: '65.65%', height: '14.01%',
    });
  });
});

describe('isEarlyZoomError', () => {
  // Android: VisionCamera sets the zoom prop before the camera is active; checkZoom sets it again on start.
  it("spots CameraX's zoom refusal before the camera is active", () => {
    expect(isEarlyZoomError(
      'androidx.camera.core.CameraControl$OperationCanceledException: Camera is not active.\n\tat androidx.camera.camera2.impl.ZoomControl.applyZoomState(ZoomControl.kt:160)',
    )).toBe(true);
  });
  it('leaves every other camera error on screen', () => {
    for (const m of ['Camera is not active.', 'session/camera-has-been-disconnected', 'device/camera-in-use-by-other-app']) {
      expect([m, isEarlyZoomError(m)]).toEqual([m, false]);
    }
  });
});

describe('cameraZoom', () => {
  it('is CAMERA_ZOOM_X on a single wide-angle camera', () => {
    expect(cameraZoom({ physicalTypes: [], zoomLensSwitchFactors: [], maxZoom: 100 })).toBe(CAMERA_ZOOM_X);
  });
  it('counts from the wide-angle camera when an ultra-wide comes first', () => {
    const triple = { physicalTypes: ['ultra-wide-angle', 'wide-angle', 'telephoto'], zoomLensSwitchFactors: [2, 6] };
    expect(cameraZoom({ ...triple, maxZoom: 100 })).toBe(CAMERA_ZOOM_X * 2);
  });
  it('is capped at the device maximum', () => {
    expect(cameraZoom({ physicalTypes: [], zoomLensSwitchFactors: [], maxZoom: 1.5 })).toBe(1.5);
  });
  it('ignores an unknown (zero) maximum', () => {
    expect(cameraZoom({ physicalTypes: [], zoomLensSwitchFactors: [], maxZoom: 0 })).toBe(CAMERA_ZOOM_X);
  });
});

describe('zoomToApply', () => {
  // Android's camera drops back to 1x each time it stops and starts, so the scan screen
  // checks the live zoom and sets it again when it has drifted from the target.
  it('asks for the target when the camera has fallen back to 1x', () => {
    expect(zoomToApply(1, 2, 8)).toBe(2);
  });
  it('leaves a zoom that is at the target, or within 0.05 of it', () => {
    expect(zoomToApply(2, 2, 8)).toBeNull();
    expect(zoomToApply(1.97, 2, 8)).toBeNull();
  });
  it('caps the target at the live maximum zoom', () => {
    expect(zoomToApply(1, 2, 1.5)).toBe(1.5);
    expect(zoomToApply(1.5, 2, 1.5)).toBeNull();
  });
  it('uses the target as is when the maximum is not known', () => {
    expect(zoomToApply(1, 2, 0)).toBe(2);
  });
});
