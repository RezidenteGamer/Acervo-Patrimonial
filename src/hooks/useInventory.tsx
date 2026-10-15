import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Catalog, Detail } from '../domain/models';
import { repositories } from '../services';
import { errorMessage } from '../lib/utils';
interface InventoryContext {
  catalog: Catalog;
  revision: number;
  loading: boolean;
  error: string;
  notify: (message: string, error?: boolean) => void;
  run: (action: () => Promise<void>, success?: string) => Promise<boolean>;
  reload: () => Promise<void>;
  dirty: React.MutableRefObject<boolean>;
}
const Context = createContext<InventoryContext | null>(null);
export function InventoryProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<Catalog>({ assets: [], departments: [], categories: [] });
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ message: string; error: boolean }>();
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dirty = useRef(false);
  const notify = useCallback((message: string, error = false) => {
    setToast({ message, error });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(undefined), error ? 10000 : 4500);
  }, []);
  const reload = useCallback(async () => {
    const data = await repositories.store.catalog();
    setCatalog(data);
    setError('');
    setRevision((r) => r + 1);
  }, []);
  useEffect(() => {
    let alive = true;
    let unsubscribe = () => {};
    repositories.store
      .initialize()
      .then(async () => {
        if (!alive) return;
        await reload();
        unsubscribe = repositories.store.subscribe(
          () => {
            if (alive) reload().catch((e) => setError(errorMessage(e)));
          },
          (e) => setError(errorMessage(e)),
        );
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      unsubscribe();
      clearTimeout(toastTimer.current);
    };
  }, [reload]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  const run = useCallback(
    async (action: () => Promise<void>, success?: string) => {
      try {
        await action();
        await reload();
        if (success) notify(success);
        return true;
      } catch (e) {
        notify(errorMessage(e), true);
        return false;
      }
    },
    [reload, notify],
  );
  return (
    <Context.Provider value={{ catalog, revision, loading, error, notify, run, reload, dirty }}>
      {children}
      {toast && (
        <div
          role={toast.error ? 'alert' : 'status'}
          className={`toast ${toast.error ? 'toast-error' : ''}`}
        >
          {toast.message}
          <button onClick={() => setToast(undefined)} aria-label="Dispensar mensagem">
            ×
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
export function useInventory() {
  const context = useContext(Context);
  if (!context) throw new Error('Contexto de inventário indisponível.');
  return context;
}
export function useDetail(id?: string) {
  const { revision, notify } = useInventory();
  const [detail, setDetail] = useState<Detail>();
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!id) return;
    setLoading(true);
    repositories.assets
      .detail(id)
      .then((d) => {
        if (alive) setDetail(d);
      })
      .catch((e) => {
        if (alive) notify(errorMessage(e), true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id, revision, notify]);
  return { detail: detail?.asset.id === id ? detail : undefined, loading };
}
export function usePhoto(id?: string, thumbnail = false) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let alive = true;
    let objectURL: string | undefined;
    setUrl(undefined);
    if (id)
      repositories.photos
        .get(id, thumbnail)
        .then((blob) => {
          if (alive && blob) {
            objectURL = URL.createObjectURL(blob);
            setUrl(objectURL);
          }
        })
        .catch(() => {});
    return () => {
      alive = false;
      if (objectURL) URL.revokeObjectURL(objectURL);
    };
  }, [id, thumbnail]);
  return url;
}
