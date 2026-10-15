import { expect, test, type Page } from '@playwright/test';
async function create(page: Page, name: string) {
  await page.getByRole('button', { name: 'Novo patrimônio', exact: true }).click();
  await page.getByLabel('Nome do equipamento *').fill(name);
  await page.getByRole('button', { name: 'Salvar patrimônio', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Ficha do patrimônio' })).toBeVisible();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}
async function close(page: Page) {
  await page.getByRole('button', { name: 'Fechar ficha e voltar à lista' }).click();
}
function nav(page: Page, project: string) {
  return page.getByRole('navigation', {
    name: project === 'desktop' ? 'Navegação principal' : 'Navegação em celular',
  });
}
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Inventário patrimonial', exact: false }),
  ).toBeVisible();
  await expect(page.getByText('Carregando seu inventário…')).not.toBeVisible();
});
test('cadastro mínimo, persistência, edição, cancelamento e contexto', async ({ page }, info) => {
  await page.getByRole('button', { name: 'Novo patrimônio', exact: true }).click();
  await page.getByRole('button', { name: 'Salvar patrimônio', exact: true }).click();
  await expect(page.getByText('Informe o nome do equipamento.')).toBeVisible();
  await page.getByLabel('Nome do equipamento *').fill('Roçadeira de teste');
  await page.getByRole('button', { name: 'Salvar patrimônio', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Roçadeira de teste', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.detail-subtitle')).toContainText('URB-000001');
  if (info.project.name === 'desktop') {
    await expect(page.getByRole('list', { name: 'Lista de patrimônios' })).toBeVisible();
    const bounds = await page.locator('.list-column').boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(280);
    expect(bounds!.width).toBeLessThanOrEqual(360);
  } else {
    await expect(page.getByRole('list', { name: 'Lista de patrimônios' })).not.toBeVisible();
  }
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Roçadeira de teste', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Editar ficha', exact: true }).click();
  await page.getByLabel('Nome do equipamento *').fill('Nome descartado');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Roçadeira de teste', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Editar ficha', exact: true }).click();
  await page.getByLabel('Nome do equipamento *').fill('Roçadeira editada');
  await page.getByLabel('Patrimônio oficial', { exact: true }).fill('PAT-123');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByRole('heading', { name: 'Roçadeira editada', exact: true })).toBeVisible();
  await close(page);
  await page.getByLabel('Secretaria selecionada').selectOption('interior');
  await expect(page.getByText('O primeiro registro é o começo')).toBeVisible();
  await create(page, 'Escavadeira teste');
  await expect(page.locator('.detail-subtitle')).toContainText('INT-000001');
  await close(page);
  await page.getByLabel('Secretaria selecionada').selectOption('todos');
  await expect(page.locator('.asset-row')).toHaveCount(2);
});
test('pesquisa, filtros e navegação de ficha preservam o contexto', async ({ page }, info) => {
  await create(page, 'Roçadeira Alfa');
  await close(page);
  await create(page, 'Roçadeira Beta');
  await close(page);
  await create(page, 'Caminhão');
  await close(page);
  await page.getByLabel('Pesquisar patrimônios').fill('rocadeira');
  await expect(page.locator('.asset-row')).toHaveCount(2);
  await page.getByRole('button', { name: 'Filtros', exact: true }).click();
  await page
    .locator('.filters-panel')
    .getByRole('combobox', { name: 'Fotografia', exact: true })
    .selectOption('nao');
  await page.locator('.asset-row').filter({ hasText: 'Roçadeira Alfa' }).click();
  await expect(page.getByRole('heading', { name: 'Roçadeira Alfa', exact: true })).toBeVisible();
  if (info.project.name === 'desktop') {
    await page.locator('.asset-row').filter({ hasText: 'Roçadeira Beta' }).click();
    await expect(page.getByRole('heading', { name: 'Roçadeira Beta', exact: true })).toBeVisible();
  }
  await close(page);
  await expect(page.getByLabel('Pesquisar patrimônios')).toHaveValue('rocadeira');
  await expect(
    page.locator('.filters-panel').getByRole('combobox', { name: 'Fotografia', exact: true }),
  ).toHaveValue('nao');
  await expect(page.locator('.asset-row')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('fotografias, verificação, arquivamento, backup e restauração', async ({ page }, info) => {
  await create(page, 'Bem com foto');
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 80;
    canvas.height = 80;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#2859dc';
    ctx.fillRect(0, 0, 80, 80);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByLabel('Selecionar fotografias', { exact: true }).setInputFiles({
    name: 'foto.png',
    mimeType: 'image/png',
    buffer: Buffer.from(image, 'base64'),
  });
  await expect(page.getByRole('button', { name: 'Ampliar fotografia principal' })).toBeVisible();
  await page.getByRole('button', { name: 'Registrar verificação', exact: true }).click();
  await page.getByLabel('Responsável *', { exact: true }).fill('Ana de teste');
  await page.getByRole('button', { name: 'Registrar verificação', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Existência física verificada' })).toBeVisible();
  await page.screenshot({ path: `.local/ficha-${info.project.name}.png`, fullPage: true });
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Arquivar patrimônio', exact: true }).click();
  await expect(page.locator('.archive-label')).toBeVisible();
  await close(page);
  await page
    .getByRole('navigation', {
      name: info.project.name === 'desktop' ? 'Navegação principal' : 'Navegação em celular',
    })
    .getByRole('link', { name: 'Arquivados' })
    .click();
  await page.locator('.asset-row').click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Restaurar patrimônio', exact: true }).click();
  await expect(page.locator('.archive-label')).not.toBeVisible();
  await page
    .getByRole('navigation', {
      name: info.project.name === 'desktop' ? 'Navegação principal' : 'Navegação em celular',
    })
    .getByRole('link', { name: info.project.name === 'desktop' ? 'Configurações' : 'Ajustes' })
    .click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar backup completo' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  await page.getByLabel('Selecionar backup para restauração').setInputFiles(path!);
  await expect(page.getByRole('dialog', { name: 'Substituir todo o inventário?' })).toBeVisible();
  await page.getByRole('button', { name: 'Substituir dados e restaurar' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page
    .getByRole('navigation', {
      name: info.project.name === 'desktop' ? 'Navegação principal' : 'Navegação em celular',
    })
    .getByRole('link', { name: 'Inventário' })
    .click();
  await expect(page.locator('.asset-row')).toHaveCount(1);
  await page.locator('.asset-row').click();
  await expect(page.getByRole('button', { name: 'Ampliar fotografia principal' })).toBeVisible();
  await page.getByRole('button', { name: 'Ampliar fotografia principal' }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Remover', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Ampliar fotografia principal' }),
  ).not.toBeVisible();
});
test('cadastro em sequência, aviso de alterações e transferência preservam código e campos', async ({
  page,
}, info) => {
  await page.getByLabel('Secretaria selecionada').selectOption('todos');
  await page.getByRole('button', { name: 'Novo patrimônio', exact: true }).click();
  await page.getByLabel('Nome do equipamento *').fill('Cadastro em lote');
  await page.getByRole('button', { name: 'Salvar patrimônio', exact: true }).click();
  await expect(page.getByText('Escolha a secretaria de destino.')).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('combobox', { name: 'Secretaria *', exact: true })
    .selectOption('interior');
  await page.getByRole('button', { name: 'Salvar e cadastrar outro', exact: true }).click();
  await expect(page.getByLabel('Nome do equipamento *')).toHaveValue('');
  await expect(page.getByLabel('Nome do equipamento *')).toBeFocused();
  await page.getByLabel('Nome do equipamento *').fill('Veículo transferido');
  await page.getByRole('button', { name: 'Salvar patrimônio', exact: true }).click();
  await expect(page.locator('.detail-subtitle')).toContainText('INT-000002');
  await page.getByRole('button', { name: 'Editar ficha', exact: true }).click();
  await page
    .getByRole('form')
    .getByRole('combobox', { name: 'Categoria', exact: true })
    .selectOption('veiculos');
  await page.getByLabel('Placa', { exact: true }).fill('ABC1234');
  await page
    .getByRole('form')
    .getByRole('combobox', { name: 'Categoria', exact: true })
    .selectOption('outros');
  await page
    .getByRole('form')
    .getByRole('combobox', { name: 'Secretaria', exact: true })
    .selectOption('urbanismo');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Fechar ficha e voltar à lista' }).click();
  await expect(page.getByRole('form', { name: 'Editar patrimônio' })).toBeVisible();
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.locator('.detail-subtitle')).toContainText('INT-000002');
  await expect(page.locator('.detail-subtitle')).toContainText('Urbanismo');
  await expect(page.getByText('ABC1234', { exact: true })).toBeVisible();
  const direct = page.url();
  await page.goto(direct.replace(/secretaria=[^&]+&?/, ''));
  await expect(page.locator('.detail-subtitle')).toContainText('INT-000002');
  await expect(page.getByLabel('Secretaria selecionada')).toHaveValue('urbanismo');
  await close(page);
  expect(await page.locator('.asset-row').count()).toBe(1);
  await nav(page, info.project.name)
    .getByRole('link', { name: info.project.name === 'desktop' ? 'Configurações' : 'Ajustes' })
    .click();
  await page.getByLabel('Nome da nova categoria').fill('Equipamentos de jardim');
  await page.getByRole('button', { name: 'Criar categoria', exact: true }).click();
  await expect(page.getByLabel('Nome da categoria Equipamentos de jardim')).toBeVisible();
});
test('demonstração explícita e rolagem preservada ao alternar fichas', async ({ page }, info) => {
  await nav(page, info.project.name)
    .getByRole('link', { name: info.project.name === 'desktop' ? 'Configurações' : 'Ajustes' })
    .click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Carregar exemplos em base vazia' }).click();
  await expect(
    page.getByRole('button', { name: 'Carregar exemplos em base vazia' }),
  ).toBeDisabled();
  await nav(page, info.project.name).getByRole('link', { name: 'Inventário' }).click();
  await page.getByLabel('Secretaria selecionada').selectOption('todos');
  await expect(page.locator('.asset-row')).toHaveCount(10);
  if (info.project.name === 'desktop') {
    const list = page.getByRole('list', { name: 'Lista de patrimônios' });
    await list.evaluate((el) => {
      el.scrollTop = 150;
    });
    const top = await list.evaluate((el) => el.scrollTop);
    await page.locator('.asset-row').nth(4).click();
    await expect(page.getByRole('article')).toBeVisible();
    expect(await list.evaluate((el) => el.scrollTop)).toBe(top);
    await page.locator('.asset-row').nth(5).click();
    expect(await list.evaluate((el) => el.scrollTop)).toBe(top);
    await close(page);
    expect(await list.evaluate((el) => el.scrollTop)).toBe(top);
  }
  await page.screenshot({ path: `.local/lista-${info.project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
