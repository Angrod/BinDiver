import {
  CAMERA_ZOOM_X, cameraZoom, cardOutline, frameShape, isEarlyZoomError, titleBand, viewRectToFrameRegion, zoomToApply,
} from '../geometry';

const IOS = frameShape('ios').aspect;

function expectRect(actual: { x: number; y: number; width: number; height: number }, e: { x: number; y: number; width: number; height: number }) {
  expect(actual.x).toBeCloseTo(e.x, 4);
  expect(actual.y).toBeCloseTo(e.y, 4);
  expect(actual.width).toBeCloseTo(e.width, 4);
  expect(actual.height).toBeCloseTo(e.height, 4);
}

describe('cardOutline', () => {
  it('is height-limited in a wide view', () => {
    expectRect(cardOutline({ width: 390, height: 380 }), { x: 75.3, y: 22.8, width: 239.4, height: 334.4 });
  });
  it('is width-limited in a narrow view', () => {
    expectRect(cardOutline({ width: 200, height: 380 }), { x: 12, y: 67.0794, width: 176, height: 245.8413 });
  });
});

describe('titleBand', () => {
  // Matt (Nov 9): the 3-15% strip was tight to line a title up in. It now runs from 2% above the
  // outline's top edge to 20% down, 4% wider on each side; it stops just above the outline so a card
  // standing behind in a bin doesn't put its own title on top.
  it('runs from just above the outline to a fifth of the way down, a little wider than the outline', () => {
    expectRect(titleBand({ x: 75.3, y: 22.8, width: 239.4, height: 334.4 }), { x: 65.724, y: 16.112, width: 258.552, height: 73.568 });
  });
  it('stays inside the view for both a height-limited and a width-limited outline', () => {
    for (const view of [{ width: 390, height: 380 }, { width: 200, height: 380 }]) {
      const band = titleBand(cardOutline(view));
      expect(band.x).toBeGreaterThanOrEqual(0);
      expect(band.y).toBeGreaterThanOrEqual(0);
      expect(band.x + band.width).toBeLessThanOrEqual(view.width);
      expect(band.y + band.height).toBeLessThanOrEqual(view.height);
    }
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
    const band = titleBand(cardOutline(view));
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
    expect(viewRectToFrameRegion(titleBand(cardOutline(view)), view, frameShape('android').aspect)).toEqual({
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
