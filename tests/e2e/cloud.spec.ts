import { expect, test, type Page } from '@playwright/test';
import {
  emptyDraft,
  initialCategories,
  initialDepartments,
  type Asset,
} from '../../src/domain/models';
const URL = 'https://sivtgmclfgebjippxgxp.supabase.co';
const user = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'teste@example.test',
  aud: 'authenticated',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
};
async function mockCloud(page: Page, authorized = true) {
  const assets: Asset[] = [];
  const unexpected: string[] = [];
  const token = [
    { alg: 'HS256', typ: 'JWT' },
    {
      sub: user.id,
      aud: 'authenticated',
      role: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: URL + '/auth/v1',
    },
    'signature',
  ]
    .map((v) => (typeof v === 'string' ? v : Buffer.from(JSON.stringify(v)).toString('base64url')))
    .join('.');
  await page.route(URL + '/**', async (route) => {
    const req = route.request();
    const path = new globalThis.URL(req.url()).pathname;
    const send = (data: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers: {
          'X-Supabase-Api-Version': '2024-01-01',
          'Access-Control-Expose-Headers': 'X-Supabase-Api-Version',
        },
        body: JSON.stringify(data),
      });
    if (path === '/auth/v1/token') {
      const body = req.postDataJSON();
      if (body.password !== 'password123')
        return send(
          {
            code: 'invalid_credentials',
            error_code: 'invalid_credentials',
            message: 'Invalid login credentials',
          },
          400,
        );
      return send({
        access_token: token,
        refresh_token: 'refresh-test-token',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user,
      });
    }
    if (path === '/auth/v1/user') return send(user);
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (path === '/rest/v1/rpc/acervo_access') return send(authorized ? 'admin' : null);
    if (path === '/rest/v1/rpc/acervo_read') {
      const body = req.postDataJSON();
      if (body.scope === 'catalog')
        return send({
          assets,
          departments: initialDepartments,
          categories: initialCategories,
          revision: assets.length,
        });
      if (body.scope === 'detail')
        return send({
          asset: assets.find((a) => a.id === body.asset_id),
          photos: [],
          verifications: [],
          history: [],
        });
    }
    if (path === '/rest/v1/rpc/acervo_command') {
      const { action, payload } = req.postDataJSON();
      if (action === 'create') {
        const now = new Date().toISOString();
        const asset = {
          ...emptyDraft('urbanismo'),
          ...payload.draft,
          id: payload.id,
          codigoInterno: `URB-${String(assets.length + 1).padStart(6, '0')}`,
          fotoCount: 0,
          criadoEm: now,
          atualizadoEm: now,
        };
        assets.push(asset);
        return send(asset);
      }
    }
    unexpected.push(`${req.method()} ${path}`);
    return send({ message: 'Unexpected test request' }, 500);
  });
  return unexpected;
}
test('autentica, grava pelo adaptador em nuvem, persiste sessão e permite sair', async ({
  page,
}, info) => {
  const unexpected = await mockCloud(page);
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Entre no seu espaço de trabalho' }),
  ).toBeVisible();
  await page.getByLabel('E-mail', { exact: true }).fill('teste@example.test');
  await page.getByLabel('Senha', { exact: true }).fill('incorreta');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('E-mail ou senha incorretos');
  await page.getByLabel('Senha', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Inventário patrimonial', exact: false }),
  ).toBeVisible();
  await expect(page.locator('.version-tag')).toHaveText('NUVEM');
  await page.getByRole('button', { name: 'Novo patrimônio', exact: true }).click();
  await page.getByLabel('Nome do equipamento *').fill('Bem na nuvem');
  await page.getByRole('button', { name: 'Salvar patrimônio', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bem na nuvem', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Bem na nuvem', exact: true })).toBeVisible();
  await expect(page.locator('.detail-subtitle')).toContainText('URB-000001');
  await page.getByRole('button', { name: 'Sair da conta', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Entre no seu espaço de trabalho' }),
  ).toBeVisible();
  await page.screenshot({ path: `.local/login-${info.project.name}.png`, fullPage: true });
  expect(unexpected).toEqual([]);
});
test('conta autenticada sem aprovação não abre o inventário', async ({ page }) => {
  const unexpected = await mockCloud(page, false);
  await page.goto('/');
  await page.getByLabel('E-mail', { exact: true }).fill('teste@example.test');
  await page.getByLabel('Senha', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Acesso pendente' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Novo patrimônio', exact: true })).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('não tem acesso');
  expect(unexpected).toEqual([]);
});
