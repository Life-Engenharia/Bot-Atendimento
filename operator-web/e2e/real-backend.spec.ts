import { expect, test } from '@playwright/test';

// Somente leitura contra o backend real. Não clica em assumir, concluir, enviar nem transferir.
// Credenciais vêm de variáveis de ambiente: OPERATOR_E2E_EMAIL e OPERATOR_E2E_PASSWORD.
const email = process.env.OPERATOR_E2E_EMAIL;
const password = process.env.OPERATOR_E2E_PASSWORD;

test.skip(!email || !password, 'defina OPERATOR_E2E_EMAIL e OPERATOR_E2E_PASSWORD para rodar contra o backend real');

test('login pela tela e quadro carrega dados reais sem erros', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await page.getByLabel('E-mail corporativo').fill(email!);
  await page.getByLabel('Senha').fill(password!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.locator('.card').first()).toBeVisible({ timeout: 30_000 });
  const cards = await page.locator('.card').count();
  expect(cards).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('visão Minha fila e Todas abrem sem erro (somente leitura)', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('E-mail corporativo').fill(email!);
  await page.getByLabel('Senha').fill(password!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.locator('.tabs')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /Minha fila/ }).click();
  await page.getByRole('button', { name: /Todas/ }).click();
  await expect(page.locator('.col')).toHaveCount(5);
});

test('painel Clientes/Ploomes carrega overview real', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('E-mail corporativo').fill(email!);
  await page.getByLabel('Senha').fill(password!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.locator('.card').first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /Clientes · Ploomes/ }).click();
  await expect(page.locator('.crm')).toBeVisible();
  await expect(page.locator('.kpis .kpi').first()).toBeVisible();
});
