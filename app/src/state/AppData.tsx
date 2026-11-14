import { Directory, File, Paths } from 'expo-file-system';
import {
  createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { AppState } from 'react-native';
import type { KnownMarks } from '../alert/alert';
import { openExpoDb } from '../db/expoDb';
import type { Db } from '../db/types';
import { createExpoRefreshIO } from '../data/expoIO';
import { currentNetwork } from '../data/network';
import { downloadPermission, needsCheck } from '../data/policy';
import { LIVE_SLOT_KEY, parseSlot, refresh, SLOT_FILES } from '../data/refresh';
import type { Game, KnownCard } from '../game/types';
import { createMtgGame } from '../game/mtg';
import { seedBasicsOnce } from '../user/basics';
import { AppSettings, readSettings, writeSetting } from '../user/settings';
import { createUserStore, UserStore } from '../user/store';

export type Phase = 'starting' | 'loading' | 'setup' | 'ready';

export const LAST_CHECK_ERROR = 'last_check_error';
export const APP_TOO_OLD = 'Update the app to get newer prices';

export interface AppDataValue {
  game: Game | null;
  priceDate: string | null;
  user: UserStore;
  phase: Phase;
  status: string;
  downloadNow(confirmed: boolean): Promise<void>;
  settings: AppSettings;
  setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void;
  marks: KnownMarks;
  markKnown(card: KnownCard): void;
  unmarkKnown(oracleId: string): void;
  setKept(oracleId: string, versionKey: string, kept: boolean): void;
  /**
   * 'ask' when downloads need the user's OK (cellular with them off) and it wasn't given; 'up-to-date' when the
   * published prices are no newer than the phone's.
   */
  checkNow(confirmed: boolean): Promise<'ok' | 'up-to-date' | 'ask' | 'offline'>;
  /** The last failed check's error, until a check succeeds. */
  lastCheckError: string | null;
  appTooOld: boolean;
  /** The live card file's size. */
  dataBytes: number | null;
}

const Ctx = createContext<AppDataValue | null>(null);

export function useAppData(): AppDataValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppData needs an AppDataProvider');
  return v;
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export function AppDataProvider({ children }: { children: ReactNode }) {
  const cardsDir = useMemo(() => {
    const d = new Directory(Paths.document, 'cards');
    d.create({ idempotent: true, intermediates: true });
    return d;
  }, []);
  const user = useMemo(() => createUserStore(openExpoDb('user.sqlite')), []);

  const liveRef = useRef<Db | null>(null);
  const busy = useRef(false);
  const [game, setGame] = useState<Game | null>(null);
  const [priceDate, setPriceDate] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('starting');
  const [status, setStatus] = useState('');
  const [settings, setSettings] = useState<AppSettings>(() => readSettings(user));
  const [marks, setMarks] = useState<KnownMarks>(() => user.knownMarks());
  const [lastCheckError, setLastCheckError] = useState<string | null>(
    () => user.getSetting(LAST_CHECK_ERROR) || null,
  );
  const [appTooOld, setAppTooOld] = useState(false);
  const [dataBytes, setDataBytes] = useState<number | null>(null);

  /** The file of the slot recorded as live; the camera-test file when none is recorded. */
  const liveFile = useCallback(() => SLOT_FILES[parseSlot(user.getSetting(LIVE_SLOT_KEY))], [user]);

  const closeLive = useCallback(() => {
    // Drop the game first so no screen calls into a closed handle.
    setGame(null);
    const db = liveRef.current;
    liveRef.current = null;
    db?.close();
  }, []);

  /** Opens the live database (if present) and builds the game. */
  const openLive = useCallback(async () => {
    const name = liveFile();
    const file = new File(cardsDir, name);
    if (!file.exists) {
      setGame(null);
      setPriceDate(null);
      setDataBytes(null);
      setPhase('setup');
      return;
    }
    setPhase('loading');
    setStatus('Loading cards…');
    await tick(); // let the status paint; building the name index blocks the JS thread
    try {
      closeLive();
      const db = openExpoDb(name, cardsDir.uri);
      liveRef.current = db;
      const row = db.get<{ value: string }>("SELECT value FROM meta WHERE key = 'price_date'");
      setPriceDate(row?.value ?? null);
      const built = createMtgGame(db);
      seedBasicsOnce(user, built, new Date().toISOString());
      setMarks(user.knownMarks());
      setGame(built);
      setDataBytes(file.exists ? file.size : null);
      setStatus('');
      setPhase('ready');
    } catch (e) {
      closeLive();
      setGame(null);
      setPriceDate(null); // it may have been read before the game failed to build
      setDataBytes(null);
      setPhase('setup');
      setStatus(`Could not open the card data: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [cardsDir, closeLive, liveFile, user]);

  const recordCheckError = useCallback((error: string | null) => {
    user.setSetting(LAST_CHECK_ERROR, error ?? '');
    setLastCheckError(error);
  }, [user]);

  /**
   * Runs refresh and opens the new slot after `updated`. Returns the message to show, if any, and whether the
   * published prices were no newer than the phone's (false when another check was already running).
   */
  const runRefresh = useCallback(async (): Promise<{ message: string | null; upToDate: boolean }> => {
    if (busy.current) return { message: null, upToDate: false };
    busy.current = true;
    try {
      const io = createExpoRefreshIO(cardsDir, closeLive, (slot) => user.setSetting(LIVE_SLOT_KEY, slot));
      // The local price date comes only from an open live handle, so a recovery download after a
      // failed load never reports up-to-date against a database that did not open.
      const result = await refresh(io, {
        priceDate: currentPriceDate(liveRef.current),
        live: parseSlot(user.getSetting(LIVE_SLOT_KEY)),
      });
      user.setSetting('last_check_at', new Date().toISOString());
      // A failed refresh never closes the live handle; with none open, the recorded slot may still open.
      if (result.status === 'updated' || (result.status === 'failed' && liveRef.current === null)) {
        await openLive();
      }
      if (result.status === 'failed') {
        recordCheckError(result.error);
        return { message: result.error, upToDate: false };
      }
      if (result.status === 'app-too-old') {
        setAppTooOld(true);
        return { message: APP_TOO_OLD, upToDate: false };
      }
      recordCheckError(null);
      setAppTooOld(false);
      return { message: null, upToDate: result.status === 'up-to-date' };
    } finally {
      busy.current = false;
    }
  }, [cardsDir, closeLive, openLive, recordCheckError, user]);

  // Latest closure for use from the AppState listener.
  const runRefreshRef = useRef(runRefresh);
  runRefreshRef.current = runRefresh;

  const maybeBackgroundRefresh = useCallback(async () => {
    // No live handle: the mount's open is still pending, or there are no usable cards yet.
    // Either way the first download is the SetupScreen's job.
    if (liveRef.current === null) return;
    if (!new File(cardsDir, liveFile()).exists) return;
    if (!needsCheck(user.getSetting('last_check_at'), new Date())) return;
    const net = await currentNetwork();
    if (downloadPermission(net, readSettings(user).allowCellular) !== 'go') return;
    await runRefreshRef.current();
  }, [cardsDir, liveFile, user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await openLive();
      if (!cancelled) await maybeBackgroundRefresh();
    })();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void maybeBackgroundRefresh();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const downloadNow = useCallback(
    async (confirmed: boolean) => {
      const net = await currentNetwork();
      const perm = downloadPermission(net, confirmed);
      if (perm === 'offline') {
        setStatus('Connect to the internet to download the card data.');
        return;
      }
      // A user's confirmation counts as go on any connected network.
      if (perm === 'ask' && !confirmed) {
        setStatus('Confirm the download to continue.');
        return;
      }
      setStatus('Downloading card data…');
      const { message: error } = await runRefresh();
      if (error) setStatus(error);
      else if (liveRef.current === null) setStatus('The download did not complete. Try again.');
    },
    [runRefresh],
  );

  const checkNow = useCallback(
    async (confirmed: boolean): Promise<'ok' | 'up-to-date' | 'ask' | 'offline'> => {
      const perm = downloadPermission(await currentNetwork(), settings.allowCellular);
      if (perm === 'offline') return 'offline';
      if (perm === 'ask' && !confirmed) return 'ask';
      const { upToDate } = await runRefresh();
      return upToDate ? 'up-to-date' : 'ok';
    },
    [runRefresh, settings.allowCellular],
  );

  const setSetting = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      writeSetting(user, key, value);
      setSettings(readSettings(user));
    },
    [user],
  );

  const markKnown = useCallback((card: KnownCard) => {
    user.markKnown(card, new Date().toISOString());
    setMarks(user.knownMarks());
  }, [user]);

  const unmarkKnown = useCallback((oracleId: string) => {
    user.unmarkKnown(oracleId);
    setMarks(user.knownMarks());
  }, [user]);

  const setKept = useCallback((oracleId: string, versionKey: string, kept: boolean) => {
    user.setKeptVersion(oracleId, versionKey, kept);
    setMarks(user.knownMarks());
  }, [user]);

  const value = useMemo<AppDataValue>(
    () => ({
      game, priceDate, user, phase, status, downloadNow, settings, setSetting, marks, markKnown,
      unmarkKnown, setKept, checkNow, lastCheckError, appTooOld, dataBytes,
    }),
    [game, priceDate, user, phase, status, downloadNow, settings, setSetting, marks, markKnown,
      unmarkKnown, setKept, checkNow, lastCheckError, appTooOld, dataBytes],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function currentPriceDate(db: Db | null): string | null {
  return db?.get<{ value: string }>("SELECT value FROM meta WHERE key = 'price_date'")?.value ?? null;
}
