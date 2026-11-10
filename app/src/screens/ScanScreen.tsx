import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { useKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState, Button, LayoutChangeEvent, Linking, Platform, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, useCameraDevice, useCameraPermission, type CameraRef } from 'react-native-vision-camera';
import { signalPlan } from '../alert/signal';
import { useAlertSignal } from '../alert/useAlertSignal';
import type { CardMatch } from '../game/types';
import { CommitTracker } from '../scan/commit';
import {
  cameraHeight, cameraZoom, cardOutline, frameShape, isEarlyZoomError, titleBand, viewRectToFrameRegion, zoomToApply,
  type Rect, type Size,
} from '../scan/geometry';
import type { OcrLine } from '../scan/lines';
import { commitKey, frameCandidates, matchCandidates } from '../scan/reading';
import { ReadTimer } from '../scan/readTimer';
import { resultModel, scanAlert, type ResultModel, type Shown } from '../scan/result';
import { normalizeLine, UnmatchedLines, type UnmatchedRow } from '../scan/unmatched';
import { useTitleReader } from '../scan/useTitleReader';
import { useAppData } from '../state/AppData';
import { useUpdateStatus } from '../updates/useUpdateStatus';
import type { TestRun } from '../user/store';
import { formatCounters, formatElapsed, formatFrameSize, formatLastRead } from './format';
import { PriceSheet } from './PriceSheet';
import { ResultCard } from './ResultCardView';
import { ResultSheet } from './ResultSheet';
import { RunScreen } from './RunScreen';
import { TopStrip } from './ScanBars';
import { SearchSheet } from './SearchSheet';
import { SettingsScreen } from './SettingsScreen';
import { useTheme } from './theme';
import { Icon } from './VersionRow';

const DIAGNOSTICS_MS = 500; // the debug line and counters re-render at most this often
const BAND = '#ff9f43';
/** From the outline's bottom edge: the "Tap to pause" hint, then (further down) the space the result card may use. */
const HINT_GAP = 8;
const CARD_AREA_GAP = 32;
/** The test-mode box's margin from the camera's left edge and from the title strip. */
const TEST_BOX_MARGIN = 6;
/** The camera frames' shape on this platform: the preview's, so the title strip is the area read. */
const FRAME_ASPECT = frameShape(Platform.OS).aspect;

interface Props {
  /** The price chip: opens the price sheet. */
  onOpenPrice?: () => void;
  /** The gear: opens Settings. */
  onOpenSettings?: () => void;
}

export function ScanScreen({ onOpenPrice, onOpenSettings }: Props) {
  useKeepAwake();
  const { game, priceDate, user, settings, setSetting, marks } = useAppData();
  const theme = useTheme();
  const updateStatus = useUpdateStatus();
  const signal = useAlertSignal();

  // The frame handler runs outside React's render cycle, so it reads current values through refs.
  const gameRef = useRef(game);
  gameRef.current = game;
  const priceDateRef = useRef(priceDate);
  priceDateRef.current = priceDate;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const marksRef = useRef(marks);
  marksRef.current = marks;

  const [run, setRun] = useState<TestRun | null>(() => user.currentRun());
  const runRef = useRef(run);
  runRef.current = run;
  const [runCount, setRunCount] = useState(() => {
    const r = user.currentRun();
    return r ? user.runScans(r.id).length : 0;
  });

  const [shown, setShown] = useState<Shown | null>(null);
  /** Counts shown cards, so the panel starts fresh (rows closed, scrolled to the top) for each. */
  const [shownId, setShownId] = useState(0);
  const [paused, setPaused] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const openList = useCallback(() => setListOpen(true), []);
  const [frameSize, setFrameSize] = useState<Size | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Tick (test mode only)
  const tick = useAudioPlayer(require('../../assets/tick.wav'));
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch((e) => console.warn('audio mode failed', e));
  }, []);
  const playTick = useCallback(() => {
    tick.seekTo(0).then(() => tick.play()).catch((e) => console.warn('tick failed', e));
  }, [tick]);

  // Camera
  const device = useCameraDevice('back');
  // Zoom in so a card filling the outline sits far enough away for the camera to focus.
  const zoom = useMemo(
    () =>
      device === undefined
        ? undefined
        : cameraZoom({
          physicalTypes: device.physicalDevices.map((d) => d.type),
          zoomLensSwitchFactors: device.zoomLensSwitchFactors,
          maxZoom: device.maxZoom,
        }),
    [device],
  );
  const { hasPermission, canRequestPermission, requestPermission } = useCameraPermission();
  useEffect(() => {
    if (!hasPermission && canRequestPermission) void requestPermission();
  }, [hasPermission, canRequestPermission, requestPermission]);
  const appActive = useAppActive();
  const onCameraError = useCallback((e: Error) => {
    console.warn('camera error', e);
    // Android refuses the zoom prop until the camera is active; onCameraStarted sets the zoom again.
    if (!isEarlyZoomError(e.message)) setCameraError(e.message);
  }, []);
  // Android's camera drops back to 1x each time it stops and starts (a sheet opening or closing, the app
  // going to the background), and the zoom given when the camera is created can land before it is open.
  // So the zoom is checked when the camera starts and on every diagnostics tick, and set again if it has
  // drifted. On iOS the zoom holds, so this only reads it for the debug line.
  const cameraRef = useRef<CameraRef>(null);
  const zoomWarned = useRef(false);
  const checkZoom = useCallback((): { actual: number; target: number } | null => {
    const c = cameraRef.current?.controller;
    if (zoom === undefined || c === undefined) return null;
    const next = zoomToApply(c.zoom, zoom, c.maxZoom);
    if (next !== null) {
      c.setZoom(next).catch((e: unknown) => {
        if (!zoomWarned.current) console.warn('zoom failed', e);
        zoomWarned.current = true;
      });
    }
    return { actual: c.zoom, target: zoom };
  }, [zoom]);
  const onCameraStarted = useCallback(() => {
    setCameraError(null);
    checkZoom();
  }, [checkZoom]);

  // Geometry: only once the space below the top strip has a real size (a zero size would give NaN% regions).
  // The camera view takes that space, but no more than the frame's height at its width (page background below).
  const [area, setArea] = useState<Size | null>(null);
  const onAreaLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setArea((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
    }
  }, []);
  const geometry = useMemo(() => {
    if (!area) return null;
    const view = { width: area.width, height: cameraHeight(area, FRAME_ASPECT) };
    const outline = cardOutline(view);
    const band = titleBand(outline);
    return { view, outline, band, region: viewRectToFrameRegion(band, view, FRAME_ASPECT) };
  }, [area]);

  // The camera (and with it the reader) is off while the Search, Run, Price, Settings or full-list sheet is
  // open, as well as when paused by a tap or with the app in the background.
  const cameraOn = hasPermission && device !== undefined && geometry !== null && appActive && !paused
    && !searchOpen && !runOpen && !priceOpen && !settingsOpen && !listOpen;

  /** A matched card's result at the current settings; null if the game is gone or the lookup throws. */
  const modelFor = useCallback((m: CardMatch): ResultModel | null => {
    const g = gameRef.current;
    if (!g) return null;
    const s = settingsRef.current;
    try {
      return resultModel(g, { match: m, thisVersion: null }, s.minCents, s.sort, marksRef.current);
    } catch (e) {
      console.warn('lookup failed', e);
      return null;
    }
  }, []);

  /**
   * A newly read or picked card. This is the only place a scan is recorded and an alert signalled, and
   * only the camera commit and the search pick call it. A new price, sort or known mark redraws the
   * card and the list (ResultCard's and ResultPanel's useMemo) and never comes here.
   */
  const commitResult = useCallback(
    (m: CardMatch, model: ResultModel, source: 'camera' | 'search', rawText: string, readMs: number | null,
      thisVersion: string | null) => {
      const s = settingsRef.current;
      // A run left open stays open, but only test mode adds scans to it.
      const r = s.testMode ? runRef.current : null;
      user.recordScan({
        at: new Date().toISOString(),
        runId: r?.id ?? null,
        oracleIds: m.oracleIds,
        name: m.name,
        source,
        rawText,
        lineUsed: m.lineUsed,
        match: m.match,
        priceDate: priceDateRef.current ?? '',
        minCents: s.minCents,
        alert: scanAlert(model),
        readMs,
      });
      if (r !== null) setRunCount((n) => n + 1);
      signal(signalPlan(model.alert.kind, source, s.alertStyle));
      setShown({ match: m, thisVersion });
      setShownId((n) => n + 1);
    },
    [signal, user],
  );

  // Camera reads
  const tracker = useRef(new CommitTracker());
  const readTimer = useRef(new ReadTimer());
  const sawFrame = useRef(false);
  /** The last candidate read and its result, for the debug line; rendered by the diagnostics timer. */
  const lastRead = useRef<string | null>(null);
  /** A running average of the time matching takes per read, in ms, for the debug line. */
  const matchMs = useRef<number | null>(null);
  /** The current run's candidate texts that matched nothing (in memory only). */
  const unmatched = useRef<{ runId: number; lines: UnmatchedLines } | null>(null);
  const [lastUnmatched, setLastUnmatched] = useState<{ runId: number; rows: UnmatchedRow[] } | null>(null);
  const onText = useCallback(
    (rawText: string, lines: OcrLine[], size: Size) => {
      if (!sawFrame.current) {
        sawFrame.current = true;
        setFrameSize(size);
      }
      const g = gameRef.current;
      if (!g) return; // cards are loading or being swapped: skip the frame
      // The top row joined, then each of its lines alone: strict matches first, then loose ones. None when
      // the strip sees a card's footer: no title is in view, and the reads either side of it don't add up.
      const { candidates, footer } = frameCandidates(g, lines);
      if (footer) {
        tracker.current.breakStreak();
        lastRead.current = formatLastRead('copyright line', null);
      }
      const started = performance.now();
      const { match, matchedText, noMatch } = matchCandidates(g, candidates);
      if (candidates.length > 0) {
        const took = performance.now() - started;
        matchMs.current = matchMs.current === null ? took : 0.9 * matchMs.current + 0.1 * took;
      }
      if (candidates.length > 0) {
        lastRead.current = match
          ? formatLastRead(normalizeLine(matchedText), match.name)
          : formatLastRead(normalizeLine(candidates[0]), null);
      }
      // Keep the lines only when the whole read found nothing: a joined row that missed while one of
      // its lines matched is a good read, not a line to tune for.
      const r = runRef.current;
      if (r !== null && settingsRef.current.testMode && match === null && noMatch.length > 0) {
        if (unmatched.current?.runId !== r.id) unmatched.current = { runId: r.id, lines: new UnmatchedLines() };
        for (const t of noMatch) unmatched.current.lines.add(t);
      }
      const key = commitKey(match);
      const atMs = Date.now();
      readTimer.current.saw(atMs, matchedText || (candidates[0] ?? ''), key, match?.match === 'exact');
      const committed = tracker.current.push(key);
      if (committed === null || match === null) return;
      const model = modelFor(match);
      if (model === null) {
        // The lookup failed, so this read did not happen: start over so the card can commit again.
        tracker.current = new CommitTracker();
        readTimer.current.reset();
        return;
      }
      const readMs = readTimer.current.committed(atMs, committed, match.name);
      commitResult(match, model, 'camera', rawText, readMs, null);
      if (settingsRef.current.testMode) playTick();
    },
    [commitResult, modelFor, playTick],
  );

  const { frameOutput, readCounts } = useTitleReader({ region: geometry?.region ?? null, active: cameraOn, onText });
  useEffect(() => {
    if (!cameraOn) readTimer.current.interrupt();
  }, [cameraOn]);

  // Diagnostics for the device run: one timer checks the zoom and, in test mode, copies the last read
  // and the counters into state.
  const testMode = settings.testMode;
  const [diag, setDiag] = useState<{ lastRead: string | null; counters: string }>(() => ({
    lastRead: null, counters: formatCounters(0, 0, null, null),
  }));
  useEffect(() => {
    const id = setInterval(() => {
      // A stopped camera can't take a zoom, so only check it while the camera is on.
      const zoomNow = cameraOn ? checkZoom() : null;
      if (!testMode) return;
      const { ocrErrors, droppedFrames } = readCounts();
      const next = {
        lastRead: lastRead.current, counters: formatCounters(ocrErrors, droppedFrames, zoomNow, matchMs.current),
      };
      setDiag((d) => (d.lastRead === next.lastRead && d.counters === next.counters ? d : next));
    }, DIAGNOSTICS_MS);
    return () => clearInterval(id);
  }, [readCounts, cameraOn, checkZoom, testMode]);

  // Search: a picked name, or (from a set-and-number search) a picked printing marked "This version".
  const onPick = (m: CardMatch, thisVersion: string | null = null) => {
    setSearchOpen(false);
    const model = modelFor(m);
    if (model === null) return;
    commitResult(m, model, 'search', m.name, null, thisVersion);
  };

  // Test runs
  const now = useNow(run !== null && testMode);
  const startRun = (stackCount: number) => {
    const at = new Date().toISOString();
    const id = user.startRun(stackCount, at);
    setRun({ id, startedAt: at, stoppedAt: null, stackCount });
    setRunCount(0);
    unmatched.current = { runId: id, lines: new UnmatchedLines() };
    // A fresh streak, so the card under the camera can commit into the run even if it was read just before.
    tracker.current = new CommitTracker();
    readTimer.current.reset();
    setShown(null);
    setRunOpen(false);
  };
  const stopRun = () => {
    if (!run) return;
    user.stopRun(run.id, new Date().toISOString());
    const u = unmatched.current;
    setLastUnmatched({ runId: run.id, rows: u?.runId === run.id ? u.lines.top() : [] });
    unmatched.current = null;
    setRun(null);
    setRunOpen(true);
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.bg }]}>
      <TopStrip theme={theme} priceDate={priceDate} minCents={settings.minCents}
        onOpenPrice={() => { setPriceOpen(true); onOpenPrice?.(); }}
        onOpenSettings={() => { setSettingsOpen(true); onOpenSettings?.(); }} />

      <View style={styles.cameraArea} onLayout={onAreaLayout}>
        <View style={[styles.cameraBox, { backgroundColor: theme.camera }, geometry ? { height: geometry.view.height } : styles.fill]}>
          {hasPermission && device !== undefined && geometry !== null && (
            <Camera
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              device={device}
              isActive={cameraOn}
              outputs={[frameOutput]}
              constraints={[{ resolutionBias: frameOutput }]}
              // The app is portrait-only: follow the interface, not the accelerometer, so tilting the
              // phone over a bin never rotates the frames (and the OCR crop) away from the title band.
              orientationSource="interface"
              zoom={zoom}
              resizeMode="cover"
              onError={onCameraError}
              onStarted={onCameraStarted}
            />
          )}
          {hasPermission && geometry !== null && (
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setPaused((p) => !p)}
              accessibilityRole="button"
              accessibilityLabel={paused ? 'Resume scanning' : 'Pause scanning'}
            >
              <View style={[styles.outline, box(geometry.outline)]} />
              <View style={[styles.band, box(geometry.band)]} />
              {paused && (
                <View style={styles.pausedCover}>
                  <Text style={styles.pausedText}>Paused</Text>
                </View>
              )}
              <View style={[styles.hintBox, { top: bottomOf(geometry.outline) + HINT_GAP }]}>
                <Text style={styles.hint}>{paused ? 'Tap to resume' : 'Tap to pause'}</Text>
              </View>
            </Pressable>
          )}
          {!hasPermission && !canRequestPermission && (
            <View style={styles.cameraMessage}>
              <Text style={styles.messageText}>BinDiver needs the camera to read card titles.</Text>
              <Button title="Open Settings" onPress={() => void Linking.openSettings()} />
            </View>
          )}
          {hasPermission && device === undefined && (
            <View style={styles.cameraMessage}>
              <Text style={styles.messageText}>No camera found.</Text>
            </View>
          )}
          {cameraError !== null && <Text style={styles.cameraError}>{cameraError}</Text>}

          {/* Test mode: beside the outline, left of the title strip. */}
          {testMode && geometry !== null && (
            <View style={[styles.testBox, { top: geometry.band.y, width: geometry.band.x - 2 * TEST_BOX_MARGIN }]}>
              {frameSize && <Text style={styles.debug}>{formatFrameSize(frameSize, FRAME_ASPECT)}</Text>}
              {diag.lastRead !== null && <Text style={styles.debug} numberOfLines={3}>{diag.lastRead}</Text>}
              <Text style={styles.debug}>{diag.counters}</Text>
              <Text style={styles.debug}>{updateStatus}</Text>
              {run !== null ? (
                <View style={styles.runBar}>
                  <Text style={styles.runText}>
                    {runCount} read · {formatElapsed(now - Date.parse(run.startedAt))}
                  </Text>
                  <Button title="Stop" onPress={stopRun} />
                </View>
              ) : (
                <Button title="Run" onPress={() => setRunOpen(true)} />
              )}
            </View>
          )}

          {/* Search and the result card, over the camera's lower part: never above the space below the outline. */}
          <View style={[styles.cardArea, geometry !== null && { top: bottomOf(geometry.outline) + CARD_AREA_GAP }]}
            pointerEvents="box-none">
            <Pressable
              style={[styles.search, { backgroundColor: theme.panel, borderColor: theme.border }, game === null && styles.disabled]}
              onPress={() => setSearchOpen(true)}
              disabled={game === null}
              accessibilityRole="button"
              accessibilityLabel="Search"
              accessibilityState={{ disabled: game === null }}
            >
              <Icon name="search" size={16} color={theme.text} />
              <Text style={[styles.searchText, { color: theme.text }]}>Search</Text>
            </Pressable>
            <ResultCard shown={shown} onOpen={openList} />
          </View>
        </View>
      </View>

      <PriceSheet visible={priceOpen} onClose={() => setPriceOpen(false)} />
      <SettingsScreen visible={settingsOpen} codeStatus={updateStatus} onClose={() => setSettingsOpen(false)} />
      <SearchSheet visible={searchOpen} onPick={onPick} onCancel={() => setSearchOpen(false)} />
      <ResultSheet visible={listOpen} shown={shown} shownId={shownId} onClose={() => setListOpen(false)} />
      <RunScreen
        visible={runOpen}
        unmatched={lastUnmatched}
        onStart={startRun}
        onClose={() => setRunOpen(false)}
      />
    </SafeAreaView>
  );
}

const box = (r: Rect) => ({ left: r.x, top: r.y, width: r.width, height: r.height });
const bottomOf = (r: Rect) => r.y + r.height;

/** Whether the app is in the foreground. */
function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}

/** The current time, updated every second while `enabled`. */
function useNow(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  cameraArea: { flex: 1 },
  cameraBox: { overflow: 'hidden' },
  fill: { flex: 1 },
  outline: { position: 'absolute', borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)', borderRadius: 6 },
  band: { position: 'absolute', borderWidth: 2, borderColor: BAND, backgroundColor: 'rgba(255,159,67,0.18)' },
  pausedCover: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pausedText: { color: '#fff', fontSize: 22, fontWeight: '600' },
  hintBox: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  hint: {
    color: '#fff', fontSize: 12, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden',
  },
  cameraMessage: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  messageText: { color: '#fff', fontSize: 17, textAlign: 'center' },
  cameraError: { position: 'absolute', top: 6, left: 8, right: 8, color: '#f88', fontSize: 12 },
  testBox: {
    position: 'absolute', left: TEST_BOX_MARGIN, padding: 6, gap: 2, borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  debug: { fontSize: 11, color: 'rgba(255,255,255,0.85)' },
  runBar: { alignItems: 'flex-start' },
  runText: { fontSize: 15, color: '#fff', fontVariant: ['tabular-nums'] },
  // flex-end: Search sits on the card, both at the bottom; the card shrinks rather than rise past the top.
  cardArea: { position: 'absolute', left: 10, right: 10, bottom: 10, justifyContent: 'flex-end', gap: 8 },
  search: {
    alignSelf: 'flex-end', height: 46, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  searchText: { fontSize: 14, fontWeight: '500' },
  disabled: { opacity: 0.5 },
});
