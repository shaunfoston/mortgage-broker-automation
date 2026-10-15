import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';
import { Repo } from '@mortgage-options/shared/db/repo.ts';
import type { Backend } from '@mortgage-options/shared/apiClient.ts';
import { openAppDb, type DbInfo } from './db.ts';
import { loadBackendSettings, makeBackend, saveBackendSettings, type BackendSettings } from './backend.ts';
import { getLockTimeout, hasPin } from './lock.ts';

interface AppCtx {
  repo: Repo;
  dbInfo: DbInfo;
  brokerName: string;
  setBrokerName(name: string): Promise<void>;
  backendSettings: BackendSettings;
  backend: Backend;
  updateBackend(p: Partial<BackendSettings>): Promise<void>;
  locked: boolean;
  pinSet: boolean;
  markPinSet(): void;
  unlock(): void;
  lockNow(): void;
  /** Bumped whenever data changes so screens can refresh. */
  version: number;
  bump(): void;
}

const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp outside AppProvider');
  return c;
}

export type InitState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready' };

export function AppProvider({ children, fallback }: { children: React.ReactNode; fallback: (s: InitState) => React.ReactNode }) {
  const [init, setInit] = useState<InitState>({ status: 'loading' });
  const [repo, setRepo] = useState<Repo | null>(null);
  const [dbInfo, setDbInfo] = useState<DbInfo | null>(null);
  const [brokerName, setBroker] = useState('');
  const brokerRef = useRef('');
  const [backendSettings, setBackendSettings] = useState<BackendSettings | null>(null);
  const [locked, setLocked] = useState(true);
  const [pinSet, setPinSet] = useState(false);
  const [version, setVersion] = useState(0);
  const backgroundAt = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { db, info } = await openAppDb();
        const r = new Repo(db, { actor: () => brokerRef.current || 'Broker' });
        await applyScreenProtection((await r.getSetting('allow_screenshots')) !== '1');
        const name = (await r.getSetting('broker_name')) ?? '';
        brokerRef.current = name;
        const bs = await loadBackendSettings();
        const p = await hasPin();
        if (cancelled) return;
        setRepo(r);
        setDbInfo(info);
        setBroker(name);
        setBackendSettings(bs);
        setPinSet(p);
        setInit({ status: 'ready' });
      } catch (e) {
        if (!cancelled) setInit({ status: 'error', message: (e as Error)?.message ?? String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-lock after the configured time in the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (s: AppStateStatus) => {
      if (s === 'background' || s === 'inactive') {
        if (backgroundAt.current === null) backgroundAt.current = Date.now();
      } else if (s === 'active' && backgroundAt.current !== null) {
        const away = (Date.now() - backgroundAt.current) / 1000;
        backgroundAt.current = null;
        if (away >= (await getLockTimeout())) setLocked(true);
      }
    });
    return () => sub.remove();
  }, []);

  const setBrokerName = useCallback(
    async (name: string) => {
      if (!repo) return;
      const n = name.trim().slice(0, 80);
      await repo.setSetting('broker_name', n);
      brokerRef.current = n;
      setBroker(n);
    },
    [repo],
  );

  const updateBackend = useCallback(async (p: Partial<BackendSettings>) => {
    await saveBackendSettings(p);
    setBackendSettings(await loadBackendSettings());
  }, []);

  const backend = useMemo(() => (backendSettings ? makeBackend(backendSettings) : null), [backendSettings]);

  const value = useMemo<AppCtx | null>(() => {
    if (!repo || !dbInfo || !backendSettings || !backend) return null;
    return {
      repo,
      dbInfo,
      brokerName,
      setBrokerName,
      backendSettings,
      backend,
      updateBackend,
      locked,
      pinSet,
      markPinSet: () => setPinSet(true),
      unlock: () => {
        setLocked(false);
        repo.audit({ action: 'app.unlocked', entityType: 'app', entityId: null, caseId: null }).catch(() => undefined);
      },
      lockNow: () => setLocked(true),
      version,
      bump: () => setVersion((v) => v + 1),
    };
  }, [repo, dbInfo, brokerName, setBrokerName, backendSettings, backend, updateBackend, locked, pinSet, version]);

  if (!value) return <>{fallback(init)}</>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Block screenshots/screen recording (Android) and blur the app switcher (iOS). */
export async function applyScreenProtection(on: boolean): Promise<void> {
  try {
    if (on) {
      await ScreenCapture.preventScreenCaptureAsync('mo-global');
      await ScreenCapture.enableAppSwitcherProtectionAsync(0.9);
    } else {
      await ScreenCapture.allowScreenCaptureAsync('mo-global');
      await ScreenCapture.disableAppSwitcherProtectionAsync();
    }
  } catch {
    /* not available on this platform */
  }
}

/** Run an async loader on mount, when deps change, and whenever data is bumped. */
export function useData<T>(fn: () => Promise<T>, deps: React.DependencyList): { data: T | null; error: string | null; loading: boolean; reload: () => void } {
  const { version } = useApp();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    fn()
      .then((d) => {
        if (live) {
          setData(d);
          setError(null);
        }
      })
      .catch((e) => live && setError((e as Error)?.message ?? String(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version, n]);
  return { data, error, loading, reload: () => setN((x) => x + 1) };
}
