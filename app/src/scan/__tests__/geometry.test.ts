import { cardOutline, titleBand, viewRectToFrameRegion } from '../geometry';

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
  it('is a strip near the top of the outline', () => {
    expectRect(titleBand({ x: 75.3, y: 22.8, width: 239.4, height: 334.4 }), { x: 75.3, y: 32.832, width: 239.4, height: 40.128 });
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
      left: '19.31%', top: '27.33%', width: '61.38%', height: '5.79%',
    });
  });
  it('maps when the frame is cropped left and right', () => {
    const view = { width: 300, height: 600 };
    expect(viewRectToFrameRegion({ x: 0, y: 0, ...view }, view)).toEqual({
      left: '5.56%', top: '0.00%', width: '88.89%', height: '100.00%',
    });
  });
});
