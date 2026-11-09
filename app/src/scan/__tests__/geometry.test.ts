import { CAMERA_ZOOM_X, cameraZoom, cardOutline, titleBand, viewRectToFrameRegion, zoomToApply } from '../geometry';

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
    }
  });
});

describe('viewRectToFrameRegion', () => {
  it('maps the full view when the frame is cropped top and bottom', () => {
    const view = { width: 390, height: 380 };
    expect(viewRectToFrameRegion({ x: 0, y: 0, ...view }, view)).toEqual({
      left: '0.00%', top: '22.60%', width: '100.00%', height: '54.81%',
    });
  });
  it('maps the title band', () => {
    const view = { width: 390, height: 380 };
    const band = titleBand(cardOutline(view));
    expect(viewRectToFrameRegion(band, view)).toEqual({
      left: '16.85%', top: '24.92%', width: '66.30%', height: '10.61%',
    });
  });
  it('maps when the frame is cropped left and right', () => {
    const view = { width: 300, height: 600 };
    expect(viewRectToFrameRegion({ x: 0, y: 0, ...view }, view)).toEqual({
      left: '5.56%', top: '0.00%', width: '88.89%', height: '100.00%',
    });
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
