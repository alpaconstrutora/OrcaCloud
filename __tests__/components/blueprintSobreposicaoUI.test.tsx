// @vitest-environment jsdom
/**
 * SOBREPOSIÇÃO no editor — o controle que deixa a decisão reversível.
 *
 * O aviso da criação (`ModalSobreposicao`) pergunta uma vez, e chegar nele exige
 * clique no CANVAS, que é opaco em jsdom. O que dá para exercitar aqui é o outro
 * caminho, e ele é o que importa depois: abrir um estudo que JÁ tem um pilar
 * embutido, selecionar a peça pela lista de Componentes — que é DOM, não canvas
 * — e mudar quem cede.
 *
 * Isso cobre a promessa que a aba Quantitativos faz na linha de disputa
 * ("selecione uma das duas peças e escolha quem cede"). Aviso que aponta para
 * uma ação inexistente é pior do que aviso nenhum.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlueprintStudy } from '../../types/blueprint';
import { ConfirmProvider } from '../../components/ui/confirm';

const RAMO_LIMPO = {
  id: 'brc_1',
  study_id: 'std_1',
  organization_id: 'org_1',
  name: 'principal',
  parent_snapshot_id: null as string | null,
  base_revision: 0,
  draft_payload: null,
  draft_kernel_version: null,
  draft_hash: null,
  draft_saved_at: null,
  created_by: null,
  created_at: '',
  updated_at: '',
};

const loadBranchModel = vi.fn(async () => null as unknown);

vi.mock('../../services/blueprintService', () => ({
  loadBranchModel: (...a: unknown[]) => loadBranchModel(...(a as [])),
  getSnapshotIdentity: vi.fn(async () => null),
  getBranch: vi.fn(async () => RAMO_LIMPO),
  saveDraft: vi.fn(async () => 'hash'),
  publishSnapshot: vi.fn(async () => 'snap_1'),
  listSnapshots: vi.fn(async () => []),
  getQuantitySnapshot: vi.fn(async () => null),
  computeAndStoreQuantities: vi.fn(async () => null),
  listObrasDaOrganizacao: vi.fn(async () => [{ id: 'prj_1', name: 'Residencial Alfa' }]),
  setStudyProject: vi.fn(async () => ({})),
}));

vi.mock('../../services/blueprintBudgetService', () => ({
  listMappings: vi.fn(async () => []),
  saveMapping: vi.fn(async () => ({})),
  deleteMapping: vi.fn(async () => {}),
  preverLancamentos: vi.fn(async () => null),
  aplicarNoProjeto: vi.fn(async () => ({ removidas: 0, adicionadas: 0, total: 0 })),
}));

const NIVEL = { id: 'lvl_1', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 };

/**
 * O caso do relato: parede de 4 m e um pilar 20×40 embutido no eixo dela.
 * O pedaço disputado é 0,084 m³ — ver `blueprintSobreposicao.test.ts`.
 */
function comPilarEmbutido() {
  return {
    levels: [NIVEL],
    walls: [
      {
        id: 'wal_0001',
        levelId: NIVEL.id,
        a: { x: 0, y: 0 },
        b: { x: 4000, y: 0 },
        thicknessMm: 150,
        heightMm: 2800,
      },
    ],
    openings: [],
    boundaries: [],
    structures: [
      {
        id: 'str_0001',
        levelId: NIVEL.id,
        kind: 'PILAR' as const,
        pontos: [{ x: 2000, y: 0 }],
        larguraMm: 200,
        profundidadeMm: 400,
        alturaMm: 2800,
        baseMm: 0,
        circular: false,
        rotacaoDeg: 0,
        rotulo: null,
      },
    ],
    labels: [],
    spaces: [],
    areaEscrituraMm2: null,
    seq: { wal: 1, lvl: 1, str: 1 },
  };
}

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

beforeEach(() => {
  localStorage.clear();
  loadBranchModel.mockResolvedValue(comPilarEmbutido());
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  (Element.prototype as any).scrollIntoView = vi.fn();
});

async function montar() {
  const { default: BlueprintEditor } = await import('../../components/blueprint/BlueprintEditor');
  render(
    <ConfirmProvider>
      <BlueprintEditor study={study} branchId="brc_1" onBack={() => {}} />
    </ConfirmProvider>,
  );
  await waitFor(() => expect(screen.getByRole('toolbar')).toBeInTheDocument());
}

describe('BlueprintEditor · sobreposição entre componentes', () => {
  it('o controle de quem cede aparece na peça que atravessa outra', async () => {
    const usuario = userEvent.setup();
    await montar();

    // Seleciona o pilar pela LISTA — o canvas não responde em jsdom.
    await usuario.click(await screen.findByRole('button', { name: /^P1 · Pilar/ }));

    const caixa = await screen.findByRole('checkbox', { name: /Cede o volume sobreposto/ });
    expect(caixa).not.toBeChecked();
    // O número tem de estar na tela: é ele que sustenta a decisão.
    expect(screen.getByText(/0,084 m³/)).toBeTruthy();
    expect(screen.getByText(/duas vezes/)).toBeTruthy();
  });

  it('marcar o controle passa a dizer que o volume saiu daqui', async () => {
    const usuario = userEvent.setup();
    await montar();

    await usuario.click(await screen.findByRole('button', { name: /^P1 · Pilar/ }));
    await usuario.click(await screen.findByRole('checkbox', { name: /Cede o volume sobreposto/ }));

    await waitFor(() =>
      expect(screen.getByText(/saem daqui e ficam só na outra peça/)).toBeTruthy(),
    );
    expect(
      screen.getByRole('checkbox', { name: /Cede o volume sobreposto/ }),
    ).toBeChecked();
  });

  it('peça JÁ EXISTENTE oferece o corte, e ele NÃO destrói a parede', async () => {
    const usuario = userEvent.setup();
    await montar();

    await usuario.click(await screen.findByRole('button', { name: /^P1 · Pilar/ }));

    // ⚠️ O BOTÃO PRECISA EXISTIR PARA PEÇA ANTIGA. O aviso da criação só aparece
    // uma vez; sem esta ação, a planta já desenhada não tinha como ser cortada —
    // foi o que fez o usuário relatar a mesma sobreposição três vezes.
    await usuario.click(await screen.findByRole('button', { name: /Cortar a parede/ }));

    // ⚠️ E O CORTE NÃO PARTE A PAREDE. Ele grava a RELAÇÃO "esta parede é
    // interrompida por este pilar", que é recalculada a cada leitura. Partir de
    // verdade foi o que produziu vão órfão quando o pilar era reposicionado com
    // o snap — o defeito que o usuário fotografou em 01/09/2026.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^Parede 2/ })).toBeNull(),
    );
    expect(screen.getByRole('button', { name: /^Parede 1/ })).toBeTruthy();

    // A prova de que a decisão foi gravada: a parede passa a dizer que cede.
    await usuario.click(screen.getByRole('button', { name: /^Parede 1/ }));
    await waitFor(() =>
      expect(
        screen.getByRole('checkbox', { name: /Cede o volume sobreposto/ }),
      ).toBeChecked(),
    );
  });

  it('a parede sem sobreposição NÃO ganha o controle', async () => {
    const usuario = userEvent.setup();
    loadBranchModel.mockResolvedValue({
      ...comPilarEmbutido(),
      // Mesma parede, sem pilar nenhum.
      structures: [],
    });
    await montar();

    await usuario.click(await screen.findByRole('button', { name: /^Parede 1/ }));

    // Interruptor em toda parede seria ruído — e ruído que não faz nada, porque
    // sem disputa não há volume a ceder.
    expect(screen.queryByRole('checkbox', { name: /Cede o volume sobreposto/ })).toBeNull();
  });
});
