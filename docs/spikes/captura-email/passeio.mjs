/**
 * Passeio do harness da aba "Captura por e-mail": print da tela, do painel
 * "Conectar caixa" (com o erro de senha que a function devolve) e do painel de
 * remetente — e reprova se houver erro de console/JS.
 *
 *   node docs/spikes/captura-email/passeio.mjs http://localhost:3117 <pasta>
 *   (com playwright-core resolvível: rode de c:/tmp/pwtest ou defina PLAYWRIGHT_CORE)
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';

async function loadChromium() {
    const pick = (m) => m.chromium ?? m.default?.chromium;
    try { const local = await import('playwright-core'); if (pick(local)) return pick(local); } catch { /* env */ }
    const base = process.env.PLAYWRIGHT_CORE;
    if (!base) throw new Error('defina PLAYWRIGHT_CORE');
    return pick(await import(pathToFileURL(path.join(base, 'index.js')).href));
}

const urlBase = process.argv[2] ?? 'http://localhost:3117';
const outDir = process.argv[3] ?? '.';
const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1340, height: 1000 } });
const erros = [];
page.on('pageerror', e => erros.push('PAGEERROR ' + e.message));
page.on('console', m => { if (m.type() === 'error') erros.push('CONSOLE ' + m.text()); });

await page.goto(`${urlBase}/docs/spikes/captura-email/index.html`, { waitUntil: 'networkidle' });
await page.waitForSelector('text=Histórico da captura');
await page.waitForSelector('text=financeiro.alpa@gmail.com');
await page.screenshot({ path: path.join(outDir, '01-aba-captura.png'), fullPage: true });

await page.getByRole('button', { name: 'Conectar caixa' }).first().click();
await page.waitForSelector('text=Conectar caixa do Gmail');
const botao = page.getByRole('button', { name: 'Conectar caixa' }).last();
const motivoVazio = await botao.getAttribute('title');
await page.fill('#ecap-usuario', 'teste@gmail.com');
await page.fill('#ecap-senha', 'abcd efgh ijkl mnop');
await botao.click();
await page.waitForSelector('text=O Gmail recusou');
await page.screenshot({ path: path.join(outDir, '02-conectar-caixa-erro.png') });
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
// dirty → o Sheet pede confirmação ao fechar
const confirmou = await page.locator('text=/Descartar|Sair sem salvar|Descartar alterações/i').first().isVisible().catch(() => false);
if (confirmou) await page.locator('button', { hasText: /Descartar|Sair/i }).first().click();
await page.waitForTimeout(400);

await page.getByText('Cobrança Energisa').first().click();
await page.waitForSelector('text=Editar remetente monitorado');
await page.screenshot({ path: path.join(outDir, '03-remetente.png') });

console.log(JSON.stringify({ motivoBotaoVazio: motivoVazio, confirmouAoFechar: confirmou, erros }, null, 2));
await browser.close();
process.exit(erros.length ? 1 : 0);
