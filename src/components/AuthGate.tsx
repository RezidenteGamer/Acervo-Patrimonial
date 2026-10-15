import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Cloud, LoaderCircle, LockKeyhole, LogOut, Package } from 'lucide-react';
import { backendConfigurationError, isCloud, supabase } from '../services/backend';
import { Button } from './ui/button';

type AccessRole = 'admin' | 'editor';
const AuthContext = createContext<{
  email: string;
  role: AccessRole;
  signOut: () => Promise<void>;
}>({ email: '', role: 'admin', signOut: async () => {} });
export const useAuth = () => useContext(AuthContext);
export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AccessRole>();
  const [loading, setLoading] = useState(isCloud);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const authorizedUser = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let alive = true;
    let generation = 0;
    async function update(next: Session | null) {
      const current = ++generation;
      if (!alive) return;
      const sameUser = !!next && authorizedUser.current === next.user.id;
      setSession(next);
      if (!sameUser) setRole(undefined);
      setError('');
      setLoading(!!next && !sameUser);
      if (!next) {
        authorizedUser.current = undefined;
        setLoading(false);
        return;
      }
      const { data, error } = await Promise.resolve(supabase!.rpc('acervo_access')).catch(() => ({
        data: null,
        error: new Error('connection'),
      }));
      if (!alive || generation !== current) return;
      if (error)
        setError(
          'Não foi possível consultar seu acesso. Confira a conexão e a instalação do banco.',
        );
      else if (data === 'admin' || data === 'editor') {
        setRole(data);
        authorizedUser.current = next.user.id;
      } else {
        setRole(undefined);
        authorizedUser.current = undefined;
        setError(
          'Sua conta ainda não tem acesso ao Acervo. Solicite a liberação ao administrador.',
        );
      }
      setLoading(false);
    }
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) {
          if (alive) {
            setError('Não foi possível recuperar a sessão. Entre novamente.');
            setLoading(false);
          }
        } else void update(data.session);
      })
      .catch(() => {
        if (alive) {
          setError('Falha de conexão ao recuperar a sessão.');
          setLoading(false);
        }
      });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      // Do not await Supabase API calls inside the auth event callback.
      setTimeout(() => {
        void update(next);
      }, 0);
    });
    return () => {
      alive = false;
      generation++;
      data.subscription.unsubscribe();
    };
  }, []);
  if (!isCloud) return children;
  if (backendConfigurationError)
    return (
      <div className="auth-page">
        <section className="auth-card">
          <Cloud size={28} />
          <h1>Conexão ainda não configurada</h1>
          <p>{backendConfigurationError}</p>
          <p>O modo local não será ativado automaticamente em produção.</p>
        </section>
      </div>
    );
  if (loading)
    return (
      <div className="auth-page">
        <LoaderCircle className="spin" size={28} />
        <p>Verificando acesso ao Acervo…</p>
      </div>
    );
  async function signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error('Não foi possível sair da conta. Tente novamente.');
    setSession(null);
    setRole(undefined);
    setPassword('');
  }
  if (session && role)
    return (
      <AuthContext.Provider value={{ email: session.user.email ?? '', role, signOut }}>
        <div key={session.user.id}>{children}</div>
      </AuthContext.Provider>
    );
  return (
    <div className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">
          <Package size={26} />
          <span>acervo</span>
        </div>
        <span className="auth-cloud">
          <Cloud size={14} />
          Inventário compartilhado
        </span>
        <h1>{session ? 'Acesso pendente' : 'Entre no seu espaço de trabalho'}</h1>
        <p>
          {session
            ? session.user.email
            : 'Use sua conta autorizada para consultar e cadastrar patrimônios.'}
        </p>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        {session ? (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await signOut();
              } catch {
                setError('Não foi possível sair da conta.');
              } finally {
                setBusy(false);
              }
            }}
          >
            <LogOut size={16} />
            Sair e usar outra conta
          </Button>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy || !supabase) return;
              setBusy(true);
              setError('');
              try {
                const { error } = await supabase.auth.signInWithPassword({
                  email: email.trim(),
                  password,
                });
                if (error)
                  setError(
                    error.code === 'invalid_credentials'
                      ? 'E-mail ou senha incorretos.'
                      : 'Não foi possível entrar. Confira sua conta e a conexão.',
                  );
              } catch {
                setError('Não foi possível conectar ao Supabase. Tente novamente.');
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="field">
              <span>E-mail</span>
              <input
                type="email"
                name="email"
                autoComplete="username"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Senha</span>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <Button type="submit" disabled={busy}>
              {busy ? <LoaderCircle size={16} className="spin" /> : <LockKeyhole size={16} />}
              {busy ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>
        )}
        <small>
          As contas são criadas e autorizadas pelo administrador. Não há cadastro público.
        </small>
      </section>
    </div>
  );
}
