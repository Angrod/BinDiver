import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import {
  CommonResolutions, useFrameOutput, type CameraFrameOutput, type Frame,
} from 'react-native-vision-camera';
import {
  useTextRecognition, type Text, type TextRecognitionOptions,
} from 'react-native-vision-camera-ocr-plus';
import { createSynchronizable, scheduleOnRN } from 'react-native-worklets';
import { frameShape, type PercentRegion, type Size } from './geometry';
import { linesFromText, type OcrLine } from './lines';
import {
  displayFrameSize, frameMsPerUnit, READ_INTERVAL_MS, readDue, type RawFrameSize,
} from './reading';

/** OCR starts on every 6th frame; the frames between return the last finished result. */
const FRAME_SKIP = 6;

/** The frames' resolution, in the camera preview's shape on this platform. */
const FRAME_RESOLUTION = CommonResolutions[frameShape(Platform.OS).resolution];

/** Converts Frame.timestamp to milliseconds on this platform. */
const FRAME_MS = frameMsPerUnit(Platform.OS);

export interface TitleReaderOptions {
  /** The title band as a share of the display-oriented frame; null until the view has a size. */
  region: PercentRegion | null;
  /** When false (or with no region yet), reads are dropped. */
  active: boolean;
  /** Runs on the React Native thread, at most once per READ_INTERVAL_MS of frame time. */
  onText(rawText: string, lines: OcrLine[], frameSize: Size): void;
}

export interface ReaderCounts {
  /** OCR errors caught in the frame worklet. */
  ocrErrors: number;
  /** Frames the camera pipeline dropped. */
  droppedFrames: number;
}

export function useTitleReader({ region, active, onText }: TitleReaderOptions): {
  frameOutput: CameraFrameOutput;
  readCounts(): ReaderCounts;
} {
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

  // Shared with the frame worklet without locks: the reader's on/off flag (written here), the frame time
  // of the last read sent and the OCR error count (both written only by the worklet).
  const shared = useMemo(
    () => ({
      active: createSynchronizable(false, { fixedType: true }),
      lastSentMs: createSynchronizable(Number.NEGATIVE_INFINITY, { fixedType: true }),
      ocrErrors: createSynchronizable(0, { fixedType: true }),
    }),
    [],
  );

  const isActive = active && region !== null;
  const activeRef = useRef(false);
  activeRef.current = isActive;
  useEffect(() => {
    shared.active.setDirty(isActive);
  }, [isActive, shared]);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  // React Native thread: the lines are computed here, not in the worklet.
  const deliver = useCallback((text: Text, raw: RawFrameSize) => {
    if (!activeRef.current) return; // the worklet's flag can lag a render behind
    try {
      onTextRef.current(text.resultText, linesFromText(text), displayFrameSize(raw));
    } catch (e) {
      console.warn('title reader: read failed', e);
    }
  }, []);

  // VisionCamera calls this on the React Native thread; setting it also stops its console.warn per drop.
  const dropped = useRef(0);
  const onFrameDropped = useCallback(() => {
    dropped.current += 1;
  }, []);

  const { active: activeFlag, lastSentMs, ocrErrors } = shared;
  const onFrame = useCallback(
    (frame: Frame) => {
      'worklet';
      try {
        if (!activeFlag.getDirty()) return;
        // Called on every frame so OCR keeps its every-6th-frame cadence; only the sending is throttled.
        const text = scanText(frame);
        const now = frame.timestamp * FRAME_MS;
        if (!readDue(now, lastSentMs.getDirty(), READ_INTERVAL_MS)) return;
        lastSentMs.setDirty(now);
        scheduleOnRN(deliver, text, { width: frame.width, height: frame.height, orientation: frame.orientation });
      } catch (_e) {
        // scanText throws once after a failed OCR job: count it and skip this frame.
        ocrErrors.setDirty(ocrErrors.getDirty() + 1);
      } finally {
        frame.dispose();
      }
    },
    [scanText, deliver, activeFlag, lastSentMs, ocrErrors],
  );

  const frameOutput = useFrameOutput({
    pixelFormat: 'rgb',
    targetResolution: FRAME_RESOLUTION,
    onFrame,
    onFrameDropped,
  });

  const readCounts = useCallback(
    (): ReaderCounts => ({ ocrErrors: ocrErrors.getDirty(), droppedFrames: dropped.current }),
    [ocrErrors],
  );
  return { frameOutput, readCounts };
}
