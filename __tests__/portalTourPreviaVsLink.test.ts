/**
 * Tour guiado — "prévia do gestor" não é o link do externo.
 * Regressão do tour v2 (04/10/2026), docs/planos/2026-10-04-tour-guiado-v2-portais.md
 *
 * As rotas públicas do Fornecedor e do Corretor (App.tsx) montam o portal com
 * `portalToken` E `isPreview` — o `isPreview` ali é histórico, só esconde o
 * cromo de admin. Quando o tour passou a ter "modo prévia" (não abre sozinho,
 * não grava "já viu"), `modoPrevia={isPreview}` desligou o tour do LINK REAL.
 * Prévia do gestor = isPreview SEM token. O Fornecedor tem teste de
 * comportamento (SupplierPortalAjuda.test.tsx); o Corretor não tem harness de
 * componente, então o contrato fica preso aqui no código-fonte.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ler = (f: string) => readFileSync(resolve(__dirname, '..', f), 'utf-8');

describe('modoPrevia exclui o acesso pelo link', () => {
  it('as rotas públicas passam isPreview junto com o token (o motivo da regra)', () => {
    const app = ler('App.tsx');
    expect(app).toMatch(/<SupplierDashboardPublic[^>]*portalToken=\{token\}[^>]*isPreview/);
    expect(app).toMatch(/<BrokerPortal[\s\S]{0,400}?portalToken=\{token\}[\s\S]{0,200}?isPreview/);
  });

  it.each(['components/SupplierDashboard.tsx', 'components/BrokerPortal.tsx'])('%s: modoPrevia = isPreview && !portalToken', (f) => {
    const fonte = ler(f);
    expect(fonte).toContain('modoPrevia={isPreview && !portalToken}');
    expect(fonte).not.toMatch(/modoPrevia=\{isPreview\}/);
  });
});
