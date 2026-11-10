import { expect, test } from '@playwright/test';
import { asOperator, mockOperatorApi } from './fixtures';

const noHorizontalScroll = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe('Central de atendimento', () => {
  test('tela de login não tem rolagem horizontal', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`quadro renderiza sem rolagem horizontal (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await asOperator(page);
      await mockOperatorApi(page);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto('/');
      await expect(page.locator('.card').first()).toBeVisible();
      expect(await noHorizontalScroll(page)).toBe(true);
      expect(errors).toEqual([]);
    });
  }

  test('selo Atrasado aparece fora da coluna Retorno e não aparece nela', async ({ page }) => {
    await asOperator(page);
    await mockOperatorApi(page);
    await page.goto('/');
    await expect(page.locator('.card[data-id="c2"] .badge.due')).toContainText('Atrasado');
    await expect(page.locator('.col[data-col="followup"] .badge.due')).toHaveCount(0);
  });

  test('abrir cartão mostra o atendimento e o compositor', async ({ page }) => {
    await asOperator(page);
    await mockOperatorApi(page);
    await page.goto('/');
    await page.locator('.card[data-id="c2"]').click();
    await expect(page.locator('.ws h2')).toHaveText('Roberto Almeida');
    await expect(page.locator('#message')).toBeVisible();
  });

  test('assumir envia claim ao backend', async ({ page }) => {
    await asOperator(page);
    const writes: string[] = [];
    await mockOperatorApi(page, writes);
    await page.goto('/');
    await page.locator('.card[data-id="c2"]').click();
    await page.getByRole('button', { name: 'Assumir' }).click();
    await expect.poll(() => writes).toContain('POST /api/operator/conversations/c2/claim');
  });

  test('concluir exige resolução de pelo menos 3 caracteres', async ({ page }) => {
    await asOperator(page);
    const writes: string[] = [];
    await mockOperatorApi(page, writes);
    await page.goto('/');
    // c3 é de Mariana Costa: aparece na visão "Minha fila"
    await page.getByRole('button', { name: /Minha fila/ }).click();
    await page.locator('.card[data-id="c3"]').click();
    await page.getByRole('button', { name: 'Concluir', exact: true }).click();
    await page.locator('#resolution').fill('ok');
    await page.locator('dialog form').getByRole('button', { name: 'Concluir', exact: true }).click();
    await expect(page.locator('dialog .err')).toContainText('3 caracteres');
    expect(writes.filter((w) => w.includes('/close'))).toHaveLength(0);
  });
});
