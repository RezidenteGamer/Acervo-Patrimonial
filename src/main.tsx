import { Component, lazy, Suspense, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import './styles.css';
import App from './App';
import Inventory from './pages/Inventory';
const Settings = lazy(() => import('./pages/Settings'));
import { InventoryProvider } from './hooks/useInventory';
import { AuthGate } from './components/AuthGate';
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="fatal-error">
        <h1>Não foi possível exibir o sistema</h1>
        <p>
          Recarregue a página para tentar novamente. Seus dados já salvos permanecem no navegador.
        </p>
        <button onClick={() => location.reload()}>Recarregar</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
const router = createBrowserRouter([
  {
    element: <App />,
    children: [
      { path: '/', element: <Inventory /> },
      {
        path: '/configuracoes',
        element: (
          <Suspense fallback={<p className="list-loading">Abrindo configurações…</p>}>
            <Settings />
          </Suspense>
        ),
      },
    ],
  },
]);
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <AuthGate>
      <InventoryProvider>
        <RouterProvider router={router} />
      </InventoryProvider>
    </AuthGate>
  </ErrorBoundary>,
);
