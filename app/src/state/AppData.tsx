import { Directory, File, Paths } from 'expo-file-system';
import {
  createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { AppState } from 'react-native';
import { openExpoDb } from '../db/expoDb';
import type { Db } from '../db/types';
import { createExpoRefreshIO } from '../data/expoIO';
import { currentNetwork } from '../data/network';
import { downloadPermission, needsCheck } from '../data/policy';
import { LIVE_DB, refresh } from '../data/refresh';
import type { Game } from '../game/types';
import { createMtgGame } from '../game/mtg';
import { createUserStore, UserStore } from '../user/store';

export type Phase = 'starting' | 'loading' | 'setup' | 'ready';

export interface AppDataValue {
  game: Game | null;
  priceDate: string | null;
  user: UserStore;
  phase: Phase;
  status: string;
  downloadNow(confirmedCellular: boolean): Promise<void>;
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

  const closeLive = useCallback(() => {
    // Drop the game first so no screen calls into a closed handle.
    setGame(null);
    const db = liveRef.current;
    liveRef.current = null;
    db?.close();
  }, []);

  /** Opens the live database (if present) and builds the game. */
  const openLive = useCallback(async () => {
    if (!new File(cardsDir, LIVE_DB).exists) {
      setGame(null);
      setPriceDate(null);
      setPhase('setup');
      return;
    }
    setPhase('loading');
    setStatus('Loading cards…');
    await tick(); // let the status paint; building the name index blocks the JS thread
    try {
      closeLive();
      const db = openExpoDb(LIVE_DB, cardsDir.uri);
      liveRef.current = db;
      const row = db.get<{ value: string }>("SELECT value FROM meta WHERE key = 'price_date'");
      setPriceDate(row?.value ?? null);
      setGame(createMtgGame(db));
      setStatus('');
      setPhase('ready');
    } catch (e) {
      closeLive();
      setGame(null);
      setPhase('setup');
      setStatus(`Could not open the card data: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [cardsDir, closeLive]);

  /** Runs refresh and reopens the database after `updated` or `failed` (refresh may have closed it). */
  const runRefresh = useCallback(async (): Promise<string | null> => {
    if (busy.current) return null;
    busy.current = true;
    try {
      const io = createExpoRefreshIO(cardsDir, closeLive);
      const result = await refresh(io, priceDate ?? currentPriceDate(liveRef.current));
      user.setSetting('last_check_at', new Date().toISOString());
      if (result.status === 'updated' || result.status === 'failed') {
        if (liveRef.current === null || result.status === 'updated') await openLive();
      }
      if (result.status === 'failed') return result.error;
      if (result.status === 'app-too-old') return 'Update BinDiver to get newer card data.';
      return null;
    } finally {
      busy.current = false;
    }
  }, [cardsDir, closeLive, openLive, priceDate, user]);

  // Latest closure for use from the AppState listener.
  const runRefreshRef = useRef(runRefresh);
  runRefreshRef.current = runRefresh;

  const maybeBackgroundRefresh = useCallback(async () => {
    if (!new File(cardsDir, LIVE_DB).exists) return;
    if (!needsCheck(user.getSetting('last_check_at'), new Date())) return;
    const net = await currentNetwork();
    if (downloadPermission(net, user.getSetting('allow_cellular') === '1') !== 'go') return;
    await runRefreshRef.current();
  }, [cardsDir, user]);

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
    async (confirmedCellular: boolean) => {
      const net = await currentNetwork();
      const perm = downloadPermission(net, confirmedCellular);
      if (perm === 'offline') {
        setStatus('Connect to the internet to download the card data.');
        return;
      }
      if (perm === 'ask') {
        setStatus('Confirm the download to continue.');
        return;
      }
      setStatus('Downloading card data…');
      const error = await runRefresh();
      if (error) setStatus(error);
      else if (liveRef.current === null) setStatus('The download did not complete. Try again.');
    },
    [runRefresh],
  );

  const value = useMemo<AppDataValue>(
    () => ({ game, priceDate, user, phase, status, downloadNow }),
    [game, priceDate, user, phase, status, downloadNow],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function currentPriceDate(db: Db | null): string | null {
  return db?.get<{ value: string }>("SELECT value FROM meta WHERE key = 'price_date'")?.value ?? null;
}
