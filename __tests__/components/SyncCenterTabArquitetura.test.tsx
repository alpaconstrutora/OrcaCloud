// @vitest-environment jsdom
/**
 * Central de Sincronização do Empreendimento — a ARQUITETURA é a Planta
 * Inteligente (decisão do usuário, 02/10/2026). O vértice e a aresta com o
 * hub leem `blueprint_study_id`; o estudo de massa ganha card próprio com
 * "Trazer"; o loteamento só aparece quando o estudo é de loteamento. O Planta
 * IA v1 (card de legado e aresta direta com a Viabilidade) saiu do app em
 * 19/10/2026 — docs/planos/2026-10-19-remover-planta-ai.md.
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const relatorio = (o: Partial<Record<string, unknown>> = {}) => ({ towersCreated: 0, towersUpdated: 0, unitsCreated: 0, unitsUpdated: 0, scenarioUnits: 0, orphanTowers: [], orphanUnits: [], warnings: [], ...o });

const previewMassa = vi.fn(async () => relatorio({ towersCreated: 1, unitsCreated: 40, scenarioUnits: 40 }) as unknown);
const syncMassa = vi.fn(async () => relatorio() as unknown);
const previewLote = vi.fn(async () => relatorio({ warnings: ['A versão publicada não tem lote.'] }) as unknown);

vi.mock('../../services/massaEmpreendimentoSync', () => ({
  massaEmpreendimentoSync: { previewSync: (...a: unknown[]) => previewMassa(...(a as [])), syncToEmpreendimento: (...a: unknown[]) => syncMassa(...(a as [])) },
}));
vi.mock('../../services/blueprintEmpreendimentoSync', () => ({
  blueprintEmpreendimentoSync: { previewSync: (...a: unknown[]) => previewLote(...(a as [])), syncToEmpreendimento: vi.fn() },
}));
// Terreno da planta (22/10/2026): campos da própria ficha — vazio preenche, diferente vai à Curadoria.
const terrenoPadrao = () => ({
  fills: [{ entity: 'empreendimento', entityId: 'emp_1', field: 'terreno_profundidade', label: 'Profundidade do terreno (m)', group: 'area', kind: 'fill', origin: 'blueprint', from: null, to: 71, sourceRef: {} }],
  conflicts: [{ entity: 'empreendimento', entityId: 'emp_1', field: 'terreno_fundos', label: 'Fundos do terreno (m)', group: 'area', kind: 'conflict', origin: 'blueprint', from: 11, to: 12, sourceRef: {} }],
  motivo: null as string | null,
});
const previewTerreno = vi.fn(async () => terrenoPadrao());
const syncTerreno = vi.fn(async () => terrenoPadrao());
vi.mock('../../services/terrenoEmpreendimentoSync', () => ({
  terrenoEmpreendimentoSync: { previewSync: (...a: unknown[]) => previewTerreno(...(a as [])), syncToEmpreendimento: (...a: unknown[]) => syncTerreno(...(a as [])) },
}));
const previewWB = vi.fn(async () => [] as unknown[]);
vi.mock('../../services/sync/writeBackImovib', () => ({ previewWriteBackImovib: (...a: unknown[]) => previewWB(...(a as [])), applyWriteBackImovib: vi.fn() }));
// Datas de "último envio" vêm do Histórico: [Arquitetura, Viabilidade], na ordem das chamadas.
const auditList = vi.fn(async (_id: string, opts: { source: string[] }) => (opts.source.includes('sync_imovib') ? historicoViab : historicoArq) as unknown[]);
let historicoArq: unknown[] = [];
let historicoViab: unknown[] = [];
vi.mock('../../services/empreendimentoAuditService', () => ({ empreendimentoAuditService: { list: (...a: unknown[]) => auditList(...(a as [string, { source: string[] }])) } }));
vi.mock('../../lib/supabase', () => {
  const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }) };
  return { supabase: { from: () => q } };
});

import { SyncCenterTab } from '../../components/empreendimento/SyncCenterTab';
import { ConfirmProvider } from '../../components/ui/confirm';

const EMP = { id: 'emp_1', organization_id: 'org_1', name: 'Residencial Teste', blueprint_study_id: 'blp_1', imovib_study_id: null, last_synced_at: null } as never;
const onChanged = vi.fn();
const montar = (e = EMP) => render(<ConfirmProvider><SyncCenterTab empreendimento={e} onChanged={onChanged} /></ConfirmProvider>);

describe('Central de Sincronização — a arquitetura é a Planta Inteligente', () => {
  beforeEach(() => {
    previewMassa.mockClear();
    syncMassa.mockClear();
    onChanged.mockClear();
    historicoArq = [];
    historicoViab = [];
    previewTerreno.mockClear();
    syncTerreno.mockClear();
  });

  it('estudo de massa vinculado: vértice "Planta Inteligente", card da massa com o diff; sem card de loteamento nem de legado', async () => {
    montar();
    const card = await screen.findByText('Estudo de massa → Empreendimento');
    expect(screen.getAllByText('Planta Inteligente').length).toBeGreaterThan(0);
    expect(screen.getByText('40 unidade(s) na massa publicada')).toBeInTheDocument();
    expect(previewMassa).toHaveBeenCalledWith('emp_1');
    expect(screen.queryByText('Loteamento → Empreendimento')).not.toBeInTheDocument();
    expect(screen.queryByText(/Planta IA/)).not.toBeInTheDocument();
    // Sem aresta direta Arquitetura ↔ Viabilidade (era do Planta AI v1): tudo passa pelo hub.
    expect(screen.queryByText('Sem vínculo direto')).not.toBeInTheDocument();
    expect(card).toBeInTheDocument();
  });

  it('"Trazer" confirma e chama o envio da massa', async () => {
    const user = userEvent.setup();
    montar();
    await user.click(await screen.findByTestId('trazer-da-massa'));
    // O painel de envio à Viabilidade também é um "dialog" montado: acha a confirmação pelo texto.
    const titulo = await screen.findByText('Trazer o estudo de massa para o empreendimento?');
    const dialogo = titulo.closest('[role="dialog"]') as HTMLElement;
    await user.click(within(dialogo).getByRole('button', { name: /^trazer$/i }));
    await waitFor(() => expect(syncMassa).toHaveBeenCalledWith('emp_1'));
  });

  it('estudo de loteamento: o card do loteamento aparece e o da massa some', async () => {
    previewMassa.mockResolvedValueOnce(relatorio({ warnings: ['A versão publicada não tem bloco de massa.'] }) as never);
    previewLote.mockResolvedValueOnce(relatorio({ unitsCreated: 12, towersCreated: 1, scenarioUnits: 12 }) as never);
    montar();
    expect(await screen.findByText('Loteamento → Empreendimento')).toBeInTheDocument();
    expect(screen.queryByText('Estudo de massa → Empreendimento')).not.toBeInTheDocument();
    expect(screen.getByText('12 lote(s) no desenho publicado')).toBeInTheDocument();
  });

  it('terreno: card próprio com o que preenche e o que vai à Curadoria; "Trazer o terreno" confirma e envia', async () => {
    const user = userEvent.setup();
    montar();
    expect(await screen.findByText('Terreno → Empreendimento')).toBeInTheDocument();
    expect(await screen.findByTestId('terreno-sync-terreno_profundidade')).toHaveTextContent('Profundidade do terreno (m): — → 71');
    expect(screen.getByTestId('terreno-sync-terreno_fundos')).toHaveTextContent('Fundos do terreno (m): 11 → 12');
    await user.click(screen.getByRole('button', { name: 'Trazer o terreno' }));
    const titulo = await screen.findByText('Trazer o terreno da planta?');
    expect(titulo.closest('[role="dialog"]')).toHaveTextContent(/viram propostas na Curadoria, no fim desta aba/);
    await user.click(within(titulo.closest('[role="dialog"]') as HTMLElement).getByRole('button', { name: /^trazer$/i }));
    await waitFor(() => expect(syncTerreno).toHaveBeenCalledWith('emp_1'));
  });

  it('terreno sem versão publicada: o card diz o motivo e não oferece trazer', async () => {
    previewTerreno.mockResolvedValueOnce({ fills: [], conflicts: [], motivo: 'A planta ainda não tem versão publicada — o terreno vem da versão publicada.' });
    montar();
    expect(await screen.findByText(/o terreno vem da versão publicada/)).toBeInTheDocument();
    // Desde 22/10/2026 (plano da aba Sincronização, item 5) o botão não some: fica desligado e diz o
    // motivo — mesma regra de "Trazer da massa" e "Trazer o loteamento".
    const botao = screen.getByRole('button', { name: 'Trazer o terreno' });
    expect(botao).toBeDisabled();
    expect(botao.parentElement?.getAttribute('title')).toMatch(/o terreno vem da versão publicada/);
  });

  it('sem estudo da Planta Inteligente: o vértice diz que não há vínculo e nenhum dry-run da Planta roda', async () => {
    montar({ ...(EMP as object), blueprint_study_id: null } as never);
    expect(await screen.findAllByText('Nenhum estudo vinculado')).not.toHaveLength(0);
    expect(previewMassa).not.toHaveBeenCalled();
    expect(previewTerreno).not.toHaveBeenCalled();
    expect(screen.queryByText('Terreno → Empreendimento')).not.toBeInTheDocument();
    expect(screen.getByText(/não está vinculado a um estudo da Planta Inteligente/)).toBeInTheDocument();
    // Um card genérico — nem "loteamento" nem "massa" para o que ainda não existe.
    expect(screen.getByText('Planta Inteligente → Empreendimento')).toBeInTheDocument();
    expect(screen.queryByText('Loteamento → Empreendimento')).not.toBeInTheDocument();
    expect(screen.queryByText('Estudo de massa → Empreendimento')).not.toBeInTheDocument();
  });
});

/** docs/planos/2026-10-20-empreendimento-aba-sincronizacao.md — os 6 problemas da análise. */
describe('Central de Sincronização — correções de 22/10/2026', () => {
  beforeEach(() => {
    previewMassa.mockClear();
    syncMassa.mockClear();
    onChanged.mockClear();
    historicoArq = [];
    historicoViab = [];
    previewTerreno.mockClear();
    syncTerreno.mockClear();
  });

  it('1. conflito que já espera na Curadoria não é "divergência": Alinhado + aguardando a Curadoria, nada a trazer', async () => {
    previewMassa.mockResolvedValueOnce(relatorio({ scenarioUnits: 40, conflitosNaCuradoria: 2, conflitosRejeitados: 1 }) as never);
    previewTerreno.mockResolvedValueOnce({ fills: [], conflicts: [], motivo: null } as never);
    montar();
    expect(await screen.findByText('Alinhado')).toBeInTheDocument();
    expect(screen.getByText('2 aguardando a Curadoria')).toBeInTheDocument();
    expect(screen.getByText('Aguardando decisão na Curadoria')).toBeInTheDocument();
    expect(screen.getByText('Mantidos por decisão na Curadoria')).toBeInTheDocument();
    const botao = screen.getByTestId('trazer-da-massa');
    expect(botao).toBeDisabled();
    expect(botao.parentElement).toHaveAttribute('title', 'Nada a trazer: o empreendimento já reflete a massa publicada');
  });

  it('1. conflito novo é trabalho: o botão liga e o confirmar avisa que vai para a Curadoria', async () => {
    const user = userEvent.setup();
    previewMassa.mockResolvedValueOnce(relatorio({ scenarioUnits: 40, conflitosNovos: 3 }) as never);
    previewTerreno.mockResolvedValueOnce({ fills: [], conflicts: [], motivo: null } as never);
    montar();
    expect(await screen.findByText('3 divergências')).toBeInTheDocument();
    expect(screen.getByText('Campos em conflito (vão para a Curadoria)')).toBeInTheDocument();
    await user.click(screen.getByTestId('trazer-da-massa'));
    expect(await screen.findByText(/3 campos divergem do que o cadastro já tem/)).toBeInTheDocument();
  });

  it('2. depois de trazer: mensagem com o resultado e o detalhe é avisado', async () => {
    const user = userEvent.setup();
    syncMassa.mockResolvedValueOnce(relatorio({ towersCreated: 1, unitsCreated: 40, conflitosEnviados: 2 }) as never);
    montar();
    await user.click(await screen.findByTestId('trazer-da-massa'));
    const dialogo = (await screen.findByText('Trazer o estudo de massa para o empreendimento?')).closest('[role="dialog"]') as HTMLElement;
    await user.click(within(dialogo).getByRole('button', { name: /^trazer$/i }));
    expect(await screen.findByRole('status')).toHaveTextContent('1 torre criada(s) · 40 unidades criada(s) · 2 conflitos enviados à Curadoria');
    expect(onChanged).toHaveBeenCalled();
  });

  it('3. a data de cada card vem do Histórico — last_synced_at não aparece no card da Viabilidade', async () => {
    historicoViab = [{ created_at: '2026-10-21T15:30:00Z' }];
    montar({ ...(EMP as object), imovib_study_id: 'est_1', last_synced_at: '2026-07-17T16:25:25Z' } as never);
    expect(await screen.findByText(/^Último envio ao estudo: 21\/10\/2026/)).toBeInTheDocument();
    expect(screen.getByText('Nada trazido ainda')).toBeInTheDocument();
    expect(screen.queryByText(/17\/07\/2026/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Última sync/)).not.toBeInTheDocument();
  });

  it('4. uma ação, um botão; as ligações dizem o sentido real', async () => {
    montar({ ...(EMP as object), imovib_study_id: 'est_1' } as never);
    await screen.findByText('Estudo de massa → Empreendimento');
    // Cada ação aparece uma vez — antes "Trazer" existia no diagrama e de novo no card.
    for (const nome of ['Trazer da massa', 'Trazer o terreno']) expect(screen.getAllByRole('button', { name: nome })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /^Trazer \d/ })).not.toBeInTheDocument();
    expect(screen.getAllByText('Empreendimento → Viabilidade').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Viabilidade ↔ Empreendimento/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir na planta' })).toBeInTheDocument();
  });

  it('5b. estudo vinculado e NUNCA publicado: "Nada publicado no estudo", não "Alinhado" (visto na tela real, 22/10)', async () => {
    previewMassa.mockResolvedValueOnce(relatorio({ semVersaoPublicada: true, warnings: ['O estudo ainda não tem versão publicada.'] }) as never);
    previewLote.mockResolvedValueOnce(relatorio({ semVersaoPublicada: true, warnings: ['O estudo ainda não tem versão publicada.'] }) as never);
    montar();
    expect(await screen.findByText('Nada publicado no estudo')).toBeInTheDocument();
    expect(screen.queryByText('Alinhado')).not.toBeInTheDocument();
    for (const id of ['trazer-da-massa', 'trazer-o-loteamento']) {
      const b = screen.getByTestId(id);
      expect(b).toBeDisabled();
      expect(b.parentElement?.getAttribute('title')).toMatch(/ainda não tem versão publicada/);
    }
  });

  it('5. estudo sem massa nem lotes: os dois botões aparecem, desligados, cada um com o seu motivo', async () => {
    previewMassa.mockResolvedValueOnce(relatorio({ warnings: ['A versão publicada não tem bloco de massa.'] }) as never);
    previewLote.mockResolvedValueOnce(relatorio({ warnings: ['A versão publicada não tem lote nenhum.'] }) as never);
    montar();
    const massa = await screen.findByTestId('trazer-da-massa');
    const lote = screen.getByTestId('trazer-o-loteamento');
    expect(massa).toBeDisabled();
    expect(lote).toBeDisabled();
    expect(massa.parentElement?.getAttribute('title')).toMatch(/não tem massa publicada/);
    expect(lote.parentElement?.getAttribute('title')).toMatch(/não tem lotes publicados/);
  });
});
