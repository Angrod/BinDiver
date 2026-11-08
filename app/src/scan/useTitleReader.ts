import { useCallback, useMemo, useRef } from 'react';
import {
  CommonResolutions, useFrameOutput, type CameraFrameOutput, type Frame,
} from 'react-native-vision-camera';
import {
  useTextRecognition, type Text, type TextRecognitionOptions,
} from 'react-native-vision-camera-ocr-plus';
import { scheduleOnRN } from 'react-native-worklets';
import type { PercentRegion, Size } from './geometry';
import { linesFromText, type OcrLine } from './lines';
import { displayFrameSize, ReadThrottle, type RawFrameSize } from './reading';

/** OCR starts on every 6th frame; the frames between return the last finished result. */
const FRAME_SKIP = 6;

export interface TitleReaderOptions {
  /** The title band as a share of the display-oriented frame; null until the view has a size. */
  region: PercentRegion | null;
  /** When false (or with no region yet), reads are dropped. */
  active: boolean;
  /** Runs on the React Native thread, at most once per READ_INTERVAL_MS. */
  onText(rawText: string, lines: OcrLine[], frameSize: Size): void;
}

export function useTitleReader({ region, active, onText }: TitleReaderOptions): { frameOutput: CameraFrameOutput } {
  // useTextRecognition rebuilds the recognizer whenever the options object changes, so key it by value.
  const left = region?.left;
  const top = region?.top;
  const width = region?.width;
  const height = region?.height;
  const options = useMemo<TextRecognitionOptions>(
    () => ({
      language: 'latin',
      scanRegion: left && top && width && height ? { left, top, width, height } : undefined,
      frameSkipThreshold: FRAME_SKIP,
    }),
    [left, top, width, height],
  );
  const { scanText } = useTextRecognition(options);

  const activeRef = useRef(false);
  activeRef.current = active && region !== null;
  const onTextRef = useRef(onText);
  onTextRef.current = onText;
  const throttle = useRef<ReadThrottle | null>(null);
  if (throttle.current === null) throttle.current = new ReadThrottle();

  // React Native thread: the lines are computed here, not in the worklet.
  const deliver = useCallback((text: Text, raw: RawFrameSize) => {
    if (!activeRef.current) return;
    if (!throttle.current?.accept(Date.now())) return;
    try {
      onTextRef.current(text.resultText, linesFromText(text), displayFrameSize(raw));
    } catch (e) {
      console.warn('title reader: read failed', e);
    }
  }, []);

  const onFrame = useCallback(
    (frame: Frame) => {
      'worklet';
      try {
        const text = scanText(frame);
        scheduleOnRN(deliver, text, { width: frame.width, height: frame.height, orientation: frame.orientation });
      } catch (_e) {
        // scanText throws once after a failed OCR job; skip this frame.
      } finally {
        frame.dispose();
      }
    },
    [scanText, deliver],
  );

  const frameOutput = useFrameOutput({
    pixelFormat: 'rgb',
    targetResolution: CommonResolutions.FHD_16_9,
    onFrame,
  });
  return { frameOutput };
}
