// @vitest-environment jsdom
/**
 * RF-122 — o painel que leva o quantitativo para o orçamento.
 *
 * Mesma classe de defeito que os testes do editor perseguem: **ação apresentada
 * ao usuário que não funciona**. Aqui os dois candidatos óbvios são "Aplicar"
 * habilitado num estudo sem obra vinculada (não há orçamento onde escrever) e
 * divergência de unidade que o painel calcula mas não mostra — o usuário
 * concluiria que o de-para está valendo quando ele foi recusado.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { BlueprintStudy } from '../../types/blueprint';

const listMappings = vi.fn();
const preverLancamentos = vi.fn();
const aplicarNoProjeto = vi.fn();
const saveMapping = vi.fn(async () => ({}) as never);
const deleteMapping = vi.fn(async () => {});
const listSnapshots = vi.fn();

vi.mock('../../services/blueprintBudgetService', () => ({
  listMappings: (...a: unknown[]) => listMappings(...a),
  saveMapping: (...a: unknown[]) => saveMapping(...a),
  deleteMapping: (...a: unknown[]) => deleteMapping(...a),
  preverLancamentos: (...a: unknown[]) => preverLancamentos(...a),
  aplicarNoProjeto: (...a: unknown[]) => aplicarNoProjeto(...a),
}));

vi.mock('../../services/blueprintService', () => ({
  listSnapshots: (...a: unknown[]) => listSnapshots(...a),
}));

const study: BlueprintStudy = {
  id: 'std_1',
  organization_id: 'org_1',
  project_id: null,
  name: 'Planta de teste',
  unit_system: 'METRIC',
  status: 'RASCUNHO',
  created_by: null,
  created_at: '',
  updated_at: '',
};

const MAPEAMENTO = {
  id: 'map_1',
  organization_id: 'org_1',
  medida: 'AREA_PISO',
  item_code: '87251',
  phase: '',
  budget_group: 'Planta Inteligente',
  agrupamento: 'TOTAL' as const,
  filtro_ambiente: [],
  active: true,
};

const CONTEXTO = {
  studyId: 'std_1',
  studyName: 'Planta de teste',
  snapshotId: 'snap_1',
  snapshotHash: 'abcdef0123456789',
  revision: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  listMappings.mockResolvedValue([MAPEAMENTO]);
  listSnapshots.mockResolvedValue([{ id: 'snap_1' }]);
  aplicarNoProjeto.mockResolvedValue({ removidas: 0, adicionadas: 1, total: 1 });
});

async function montar(over: Partial<BlueprintStudy> = {}) {
  const { default: PainelOrcamento } = await import(
    '../../components/blueprint/PainelOrcamento'
  );
  render(<PainelOrcamento study={{ ...study, ...over }} revisao={1} dirty={false} />);
  await waitFor(() => expect(listMappings).toHaveBeenCalled());
}

describe('PainelOrcamento · o que o painel oferece', () => {
  it('lista os mapeamentos existentes pelo rótulo da medida, não pelo id', async () => {
    await montar();
    // "AREA_PISO" não é linguagem de quem monta orçamento.
    const linha = (await screen.findByRole('button', { name: /remover mapeamento/i }))
      .closest('li')!;
    expect(within(linha).getByText(/Área de piso/i)).toBeInTheDocument();
    expect(within(linha).getByText(/87251/)).toBeInTheDocument();
  });

  it('sem de-para, a prévia nem é oferecida', async () => {
    listMappings.mockResolvedValue([]);
    await montar();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /prévia/i })).toBeDisabled(),
    );
    expect(screen.getByText(/Sem de-para/i)).toBeInTheDocument();
  });

  it('DIVERGÊNCIA RECUSADA APARECE — é o motivo de a prévia existir', async () => {
    // Se a recusa não aparecesse, o usuário veria "nenhuma linha gerada" e
    // concluiria que a planta está vazia, quando o problema é o de-para.
    preverLancamentos.mockResolvedValue({
      entries: [],
      divergencias: [
        {
          mapeamentoId: 'map_1',
          medida: 'AREA_PISO',
          itemCode: '87251',
          motivo:
            '"Área de piso" produz M2, mas o item 87251 é cotado em "M". Nenhuma linha foi gerada.',
        },
      ],
      contexto: CONTEXTO,
      totalEstimado: 0,
    });

    await montar();
    await userEvent.click(screen.getByRole('button', { name: /prévia/i }));

    expect(await screen.findByText(/1 mapeamento\(s\) recusado\(s\)/i)).toBeInTheDocument();
    expect(screen.getByText(/cotado em "M"/)).toBeInTheDocument();
  });

  it('sem obra vinculada, Aplicar não fica habilitado', async () => {
    // O estudo sem `project_id` não tem orçamento onde escrever. Oferecer o botão
    // habilitado seria prometer uma ação que só pode falhar.
    preverLancamentos.mockResolvedValue({
      entries: [
        {
          id: 'bp:std_1:map_1:total',
          sinapiItem: { code: '87251', description: 'Piso', unit: 'M2', price: 50 },
          quantity: 10.97,
          phase: '',
          group: 'Planta Inteligente',
        },
      ],
      divergencias: [],
      contexto: CONTEXTO,
      totalEstimado: 548.5,
    });

    await montar();
    await userEvent.click(screen.getByRole('button', { name: /prévia/i }));

    const aplicar = await screen.findByRole('button', { name: /aplicar no orçamento/i });
    expect(aplicar).toBeDisabled();
    expect(screen.getByText(/não está vinculado a uma obra/i)).toBeInTheDocument();
  });

  it('com obra vinculada, Aplicar chama o serviço e relata a substituição', async () => {
    preverLancamentos.mockResolvedValue({
      entries: [
        {
          id: 'bp:std_1:map_1:total',
          sinapiItem: { code: '87251', description: 'Piso', unit: 'M2', price: 50 },
          quantity: 10.97,
          phase: '',
          group: 'Planta Inteligente',
        },
      ],
      divergencias: [],
      contexto: CONTEXTO,
      totalEstimado: 548.5,
    });
    aplicarNoProjeto.mockResolvedValue({ removidas: 3, adicionadas: 1, total: 4 });

    await montar({ project_id: 'prj_1' });
    await userEvent.click(screen.getByRole('button', { name: /prévia/i }));
    await userEvent.click(await screen.findByRole('button', { name: /aplicar no orçamento/i }));

    await waitFor(() => expect(aplicarNoProjeto).toHaveBeenCalledWith('prj_1', expect.any(Array), CONTEXTO));
    // Substituir 3 linhas é informação que o usuário precisa VER, não deduzir.
    expect(await screen.findByText(/substituindo 3/i)).toBeInTheDocument();
  });

  it('sem versão publicada, a prévia explica por quê', async () => {
    // Quantitativo não sai de rascunho. Falhar sem dizer isso mandaria o usuário
    // procurar defeito no de-para.
    listSnapshots.mockResolvedValue([]);
    await montar();

    await userEvent.click(screen.getByRole('button', { name: /prévia/i }));
    expect(await screen.findByText(/não sai de rascunho/i)).toBeInTheDocument();
    expect(preverLancamentos).not.toHaveBeenCalled();
  });

  it('mudar o de-para invalida a prévia na tela', async () => {
    // Prévia antiga ao lado de de-para novo é pior que prévia nenhuma: parece
    // conferida e não é.
    preverLancamentos.mockResolvedValue({
      entries: [
        {
          id: 'bp:std_1:map_1:total',
          sinapiItem: { code: '87251', description: 'Piso', unit: 'M2', price: 50 },
          quantity: 10.97,
          phase: '',
          group: 'Planta Inteligente',
        },
      ],
      divergencias: [],
      contexto: CONTEXTO,
      totalEstimado: 548.5,
    });

    await montar({ project_id: 'prj_1' });
    await userEvent.click(screen.getByRole('button', { name: /prévia/i }));
    expect(await screen.findByText(/Total estimado/i)).toBeInTheDocument();

    listMappings.mockResolvedValue([]);
    await userEvent.click(screen.getByRole('button', { name: /remover mapeamento/i }));

    await waitFor(() => expect(screen.queryByText(/Total estimado/i)).not.toBeInTheDocument());
  });

  it('a medida escolhida explica o que é, e mostra a dimensão', async () => {
    // Sem a dimensão à vista, escolher item de unidade compatível vira tentativa
    // e erro contra a trava.
    await montar();
    expect(screen.getByRole('option', { name: /Área de piso \(M2\)/i })).toBeInTheDocument();
    expect(screen.getByText(/NÃO é a área de eixo/i)).toBeInTheDocument();
  });
});
