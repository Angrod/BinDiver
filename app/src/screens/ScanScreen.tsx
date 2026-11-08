import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { useKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState, Button, LayoutChangeEvent, Linking, Pressable, SafeAreaView, StyleSheet, Text, View,
} from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { isStale } from '../data/policy';
import type { CardMatch } from '../game/types';
import { CommitTracker } from '../scan/commit';
import {
  cameraZoom, cardOutline, titleBand, viewRectToFrameRegion, type Rect, type Size,
} from '../scan/geometry';
import { titleCandidates, type OcrLine } from '../scan/lines';
import { commitKey, qualifyingVersions } from '../scan/reading';
import { normalizeLine, UnmatchedLines, type UnmatchedRow } from '../scan/unmatched';
import { useTitleReader } from '../scan/useTitleReader';
import { useAppData } from '../state/AppData';
import type { TestRun } from '../user/store';
import { formatCounters, formatElapsed, formatFrameSize, formatLastRead, versionsLine } from './format';
import { RunScreen } from './RunScreen';
import { SearchSheet } from './SearchSheet';

const MIN_CENTS = 1000; // $10
const DIAGNOSTICS_MS = 500; // the debug line and counters re-render at most this often
const BAND = '#ff9f43';
const AMBER = '#e5a50a';

/** What the bottom of the screen shows for the last card read or picked. */
interface Shown {
  name: string;
  isToken: boolean;
  versions: number;
  match: CardMatch['match'];
  lineUsed: string;
}

export function ScanScreen() {
  useKeepAwake();
  const { game, priceDate, user } = useAppData();

  // The frame handler runs outside React's render cycle, so it reads current values through refs.
  const gameRef = useRef(game);
  gameRef.current = game;
  const priceDateRef = useRef(priceDate);
  priceDateRef.current = priceDate;

  const [run, setRun] = useState<TestRun | null>(() => user.currentRun());
  const runRef = useRef(run);
  runRef.current = run;
  const [runCount, setRunCount] = useState(() => {
    const r = user.currentRun();
    return r ? user.runScans(r.id).length : 0;
  });

  const [shown, setShown] = useState<Shown | null>(null);
  const [paused, setPaused] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [frameSize, setFrameSize] = useState<Size | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Tick
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
    setCameraError(e.message);
  }, []);
  const onCameraStarted = useCallback(() => setCameraError(null), []);

  // Geometry: only once the camera view has a real size (a zero size would give NaN% regions).
  const [viewSize, setViewSize] = useState<Size | null>(null);
  const onCameraLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setViewSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
    }
  }, []);
  const geometry = useMemo(() => {
    if (!viewSize) return null;
    const outline = cardOutline(viewSize);
    const band = titleBand(outline);
    return { outline, band, region: viewRectToFrameRegion(band, viewSize) };
  }, [viewSize]);

  // The camera (and with it the reader) is off while the Search or Run sheet is open,
  // as well as when paused by a tap or with the app in the background.
  const cameraOn = hasPermission && device !== undefined && geometry !== null && appActive && !paused
    && !searchOpen && !runOpen;

  // Recording
  const record = useCallback(
    (m: CardMatch, source: 'camera' | 'search', rawText: string, versions: number) => {
      const r = runRef.current;
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
        minCents: MIN_CENTS,
        alerted: versions > 0,
      });
      if (r !== null) setRunCount((n) => n + 1);
    },
    [user],
  );

  /** Looks up a matched card's qualifying versions; null if the game is gone or the lookup throws. */
  const versionsFor = useCallback((m: CardMatch): number | null => {
    if (m.isToken) return 0;
    const g = gameRef.current;
    if (!g) return null;
    try {
      return qualifyingVersions(g.lookup(m.oracleIds, MIN_CENTS, 'oldest'));
    } catch (e) {
      console.warn('lookup failed', e);
      return null;
    }
  }, []);

  const show = useCallback((m: CardMatch, versions: number) => {
    setShown({ name: m.name, isToken: m.isToken, versions, match: m.match, lineUsed: m.lineUsed });
  }, []);

  // Camera reads
  const tracker = useRef(new CommitTracker());
  const sawFrame = useRef(false);
  /** The last candidate read and its result, for the debug line; rendered by the diagnostics timer. */
  const lastRead = useRef<string | null>(null);
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
      // The top row joined, then each of its lines alone: the first match wins.
      const candidates = titleCandidates(lines);
      let match: CardMatch | null = null;
      let matchedText = '';
      const noMatch: string[] = [];
      for (const candidate of candidates) {
        try {
          match = g.matchTitle(candidate);
        } catch (e) {
          console.warn('matchTitle failed', e);
          match = null;
          continue;
        }
        if (match !== null) {
          matchedText = candidate;
          break;
        }
        noMatch.push(candidate);
      }
      if (candidates.length > 0) {
        lastRead.current = match
          ? formatLastRead(normalizeLine(matchedText), match.name)
          : formatLastRead(normalizeLine(candidates[0]), null);
      }
      const r = runRef.current;
      if (r !== null && noMatch.length > 0) {
        if (unmatched.current?.runId !== r.id) unmatched.current = { runId: r.id, lines: new UnmatchedLines() };
        for (const t of noMatch) unmatched.current.lines.add(t);
      }
      const committed = tracker.current.push(commitKey(match));
      if (committed === null || match === null) return;
      const versions = versionsFor(match);
      if (versions === null) {
        // The lookup failed, so this read did not happen: start over so the card can commit again.
        tracker.current = new CommitTracker();
        return;
      }
      record(match, 'camera', rawText, versions);
      playTick();
      show(match, versions);
    },
    [playTick, record, show, versionsFor],
  );

  const { frameOutput, readCounts } = useTitleReader({ region: geometry?.region ?? null, active: cameraOn, onText });

  // Diagnostics for the device run: one timer copies the last read and the counters into state.
  const [diag, setDiag] = useState<{ lastRead: string | null; counters: string }>(() => ({
    lastRead: null, counters: formatCounters(0, 0),
  }));
  useEffect(() => {
    const id = setInterval(() => {
      const { ocrErrors, droppedFrames } = readCounts();
      const next = { lastRead: lastRead.current, counters: formatCounters(ocrErrors, droppedFrames) };
      setDiag((d) => (d.lastRead === next.lastRead && d.counters === next.counters ? d : next));
    }, DIAGNOSTICS_MS);
    return () => clearInterval(id);
  }, [readCounts]);

  // Search
  const onPick = (m: CardMatch) => {
    setSearchOpen(false);
    const versions = versionsFor(m);
    if (versions === null) return;
    record(m, 'search', m.name, versions);
    show(m, versions);
  };

  // Test runs
  const now = useNow(run !== null);
  const startRun = (stackCount: number) => {
    const at = new Date().toISOString();
    const id = user.startRun(stackCount, at);
    setRun({ id, startedAt: at, stoppedAt: null, stackCount });
    setRunCount(0);
    unmatched.current = { runId: id, lines: new UnmatchedLines() };
    // A fresh streak, so the card under the camera can commit into the run even if it was read just before.
    tracker.current = new CommitTracker();
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

  const stale = priceDate !== null && isStale(priceDate, new Date());

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.prices}>
        Prices as of <Text style={stale ? styles.stale : undefined}>{priceDate ?? 'unknown'}</Text>
      </Text>

      <View style={styles.cameraBox} onLayout={onCameraLayout}>
        {hasPermission && device !== undefined && geometry !== null && (
          <Camera
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
      </View>

      <View style={styles.bottom}>
        <Text style={styles.hint}>{paused ? 'Tap to resume' : 'Tap to pause'}</Text>
        {frameSize && <Text style={styles.grey}>{formatFrameSize(frameSize)}</Text>}
        {diag.lastRead !== null && <Text style={styles.debug} numberOfLines={1}>{diag.lastRead}</Text>}
        <Text style={styles.debug}>{diag.counters}</Text>
        {game === null && <Text style={styles.grey}>Loading cards…</Text>}

        <View style={styles.result}>
          {shown ? (
            <>
              <Text style={styles.name} numberOfLines={2} adjustsFontSizeToFit>
                {shown.name}
              </Text>
              <Text style={styles.detail}>{shown.isToken ? 'Token, not tracked' : versionsLine(shown.versions)}</Text>
              {shown.match === 'tolerant' && <Text style={styles.grey}>Read as “{shown.lineUsed}”</Text>}
            </>
          ) : (
            <Text style={styles.grey}>No card read yet</Text>
          )}
        </View>

        {run !== null && (
          <View style={styles.runBar}>
            <Text style={styles.runText}>
              {runCount} read · {formatElapsed(now - Date.parse(run.startedAt))}
            </Text>
            <Button title="Stop" onPress={stopRun} />
          </View>
        )}
        <View style={styles.buttons}>
          <Button title="Search" onPress={() => setSearchOpen(true)} disabled={game === null} />
          {run === null && <Button title="Run" onPress={() => setRunOpen(true)} />}
        </View>
      </View>

      <SearchSheet visible={searchOpen} onPick={onPick} onCancel={() => setSearchOpen(false)} />
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
  screen: { flex: 1, backgroundColor: '#111' },
  prices: { color: '#ddd', fontSize: 14, textAlign: 'center', paddingVertical: 6 },
  stale: { color: AMBER, fontWeight: '600' },
  cameraBox: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  outline: { position: 'absolute', borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)', borderRadius: 6 },
  band: { position: 'absolute', borderWidth: 2, borderColor: BAND, backgroundColor: 'rgba(255,159,67,0.18)' },
  pausedCover: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pausedText: { color: '#fff', fontSize: 22, fontWeight: '600' },
  cameraMessage: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  messageText: { color: '#fff', fontSize: 17, textAlign: 'center' },
  cameraError: { position: 'absolute', bottom: 6, left: 8, right: 8, color: '#f88', fontSize: 12 },
  bottom: { flex: 1, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8, gap: 4 },
  hint: { color: '#bbb', fontSize: 13, textAlign: 'center' },
  grey: { color: '#888', fontSize: 13, textAlign: 'center' },
  debug: { color: '#777', fontSize: 11, textAlign: 'center' },
  result: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 4 },
  name: { color: '#fff', fontSize: 30, fontWeight: '700', textAlign: 'center' },
  detail: { color: '#ddd', fontSize: 18, textAlign: 'center' },
  runBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  runText: { color: '#fff', fontSize: 17, fontVariant: ['tabular-nums'] },
  buttons: { flexDirection: 'row', justifyContent: 'space-evenly' },
});
