// @vitest-environment jsdom
/**
 * Testes de componente do editor de plantas (épico E3).
 *
 * POR QUE ESTES TESTES EXISTEM. Dois defeitos chegaram ao usuário nesta mesma
 * classe: a parede vazada com canto aberto e o botão "Unir" que oferecia a
 * vizinha perpendicular. Nos dois casos o comentário do código afirmava a
 * intenção certa, o código não a cumpria, e `tsc` mais 886 testes de unidade
 * passaram — porque nenhum deles olha o que a interface OFERECE.
 *
 * O alvo aqui é essa classe específica: **ação apresentada ao usuário que não
 * funciona**. Botão habilitado que erra, aviso que não aparece, opção que some.
 * Não cobre desenho — canvas é opaco em jsdom e continua sendo assunto do
 * harness em docs/spikes/wall-render.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { BlueprintStudy } from '../../types/blueprint';

// ─── Dublês ───────────────────────────────────────────────────────────────────

// O editor carrega do Supabase ao montar. Sem dublê, cada teste viraria uma ida
// à rede — e o que se quer medir aqui é a interface, não a persistência.
vi.mock('../../services/blueprintService', () => ({
  loadBranchModel: vi.fn(async () => null),
  getBranch: vi.fn(async () => ({
    id: 'brc_1',
    study_id: 'std_1',
    organization_id: 'org_1',
    name: 'principal',
    parent_snapshot_id: null,
    base_revision: 0,
    draft_payload: null,
    draft_kernel_version: null,
    draft_hash: null,
    draft_saved_at: null,
    created_by: null,
    created_at: '',
    updated_at: '',
  })),
  saveDraft: vi.fn(async () => 'hash'),
  publishSnapshot: vi.fn(async () => 'snap_1'),
  listSnapshots: vi.fn(async () => []),
  getQuantitySnapshot: vi.fn(async () => null),
  computeAndStoreQuantities: vi.fn(async () => null),
}));

// O painel de Orçamento vive numa aba do editor e consulta o de-para ao montar.
vi.mock('../../services/blueprintBudgetService', () => ({
  listMappings: vi.fn(async () => []),
  saveMapping: vi.fn(async () => ({})),
  deleteMapping: vi.fn(async () => {}),
  preverLancamentos: vi.fn(async () => null),
  aplicarNoProjeto: vi.fn(async () => ({ removidas: 0, adicionadas: 0, total: 0 })),
}));

// jsdom não implementa ResizeObserver, e o canvas o usa para acompanhar o
// tamanho do container.
beforeEach(() => {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

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

async function montar() {
  const { default: BlueprintEditor } = await import('../../components/blueprint/BlueprintEditor');
  render(<BlueprintEditor study={study} branchId="brc_1" onBack={() => {}} />);
  // O nível "Térreo" é criado num efeito depois do carregamento.
  await waitFor(() => expect(screen.getByRole('toolbar')).toBeInTheDocument());
}

/** Desenha paredes chamando o canvas por dentro não dá; usa-se o próprio DOM. */
function botao(nome: RegExp) {
  return screen.getByRole('button', { name: nome });
}

describe('BlueprintEditor · ações oferecidas', () => {
  it('monta com as três ferramentas e o painel de ambientes', async () => {
    await montar();

    expect(botao(/selecionar/i)).toBeInTheDocument();
    expect(botao(/^parede$/i)).toBeInTheDocument();
    expect(botao(/abertura/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/ambientes derivados/i)).toBeInTheDocument();
  });

  it('a ferramenta Abertura troca os controles da barra', async () => {
    await montar();
    const user = userEvent.setup();

    // Com a ferramenta Parede, a barra mostra Espessura.
    expect(screen.getByText(/espessura/i)).toBeInTheDocument();

    await user.click(botao(/abertura/i));

    // Com a ferramenta Abertura, mostra Tipo e Largura no lugar.
    expect(screen.getByText(/^tipo$/i)).toBeInTheDocument();
    expect(screen.getByText(/^largura$/i)).toBeInTheDocument();
    expect(screen.queryByText(/espessura/i)).not.toBeInTheDocument();
  });

  it('Publicar fica desabilitado quando nada mudou', async () => {
    await montar();
    expect(botao(/publicar/i)).toBeDisabled();
  });

  it('Desfazer e Refazer nascem desabilitados', async () => {
    await montar();
    expect(botao(/desfazer/i)).toBeDisabled();
    expect(botao(/refazer/i)).toBeDisabled();
  });

  it('a grade automática anuncia o passo em vigor', async () => {
    await montar();
    // O seletor de grade nasce em "Automática (…)" mostrando o passo aplicado —
    // sem isso o usuário não sabe a que está encaixando.
    expect(screen.getByRole('option', { name: /autom[áa]tica \(/i })).toBeInTheDocument();
  });
});

describe('BlueprintEditor · regressões relatadas em uso', () => {
  it('o nível padrão não é um passo desfazível', async () => {
    await montar();

    // Regressão. O nível "Térreo" era criado por COMANDO, entrando no histórico.
    // Numa planta nova, "Desfazer" apagava o nível; `levelId` virava nulo e
    // desenhar parede passava a não fazer nada, EM SILÊNCIO, sem volta — o guard
    // de StrictMode impedia o nível de ser recriado. Agora ele entra na linha de
    // base, antes do histórico existir.
    expect(botao(/desfazer/i)).toBeDisabled();
  });

  it('o seletor de espessura oferece as bitolas usuais', async () => {
    await montar();
    // Escopado ao seletor de espessura: "100 mm" e "250 mm" também aparecem no
    // seletor de grade, e uma busca global acharia os dois e mediria outra coisa.
    const espessura = within(screen.getByLabelText(/espessura/i));
    for (const mm of ['100 mm', '150 mm', '200 mm', '250 mm']) {
      expect(espessura.getByRole('option', { name: mm })).toBeInTheDocument();
    }
  });

  it('a ferramenta Abertura oferece porta e janela', async () => {
    await montar();
    const user = userEvent.setup();
    await user.click(botao(/abertura/i));

    expect(screen.getByRole('option', { name: /porta/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /janela/i })).toBeInTheDocument();
  });
});

describe('BlueprintEditor · quantitativos', () => {
  it('a aba existe e anuncia a versão da política', async () => {
    await montar();
    const user = userEvent.setup();

    await user.click(screen.getByRole('tab', { name: /quantitativos/i }));
    // RF-121: o resultado precisa dizer sob qual política foi calculado.
    expect(screen.getByText(/pol[íi]tica quant-/i)).toBeInTheDocument();
  });

  it('sem ambiente fechado, explica que não há o que quantificar', async () => {
    await montar();
    const user = userEvent.setup();

    await user.click(screen.getByRole('tab', { name: /quantitativos/i }));
    expect(screen.getByText(/sem contorno fechado n[ãa]o h[áa] [áa]rea/i)).toBeInTheDocument();
  });

  it('sem versão publicada, explica que orçamento não cita rascunho', async () => {
    await montar();
    const user = userEvent.setup();

    await user.click(screen.getByRole('tab', { name: /quantitativos/i }));
    // A distinção oficial × ao vivo é o ponto do painel: o número que o orçamento
    // cita não pode vir de geometria que ainda muda.
    expect(screen.getByText(/o or[çc]amento n[ãa]o cita rascunho/i)).toBeInTheDocument();
  });

  it('as duas abas alternam sem perder a outra', async () => {
    await montar();
    const user = userEvent.setup();

    const abaAmb = screen.getByRole('tab', { name: /ambientes/i });
    const abaQtd = screen.getByRole('tab', { name: /quantitativos/i });

    expect(abaAmb).toHaveAttribute('aria-selected', 'true');
    await user.click(abaQtd);
    expect(abaQtd).toHaveAttribute('aria-selected', 'true');
    expect(abaAmb).toHaveAttribute('aria-selected', 'false');
  });
});

describe('BlueprintEditor · painel do selecionado', () => {
  it('sem seleção, o painel de propriedades não aparece', async () => {
    await montar();
    expect(screen.queryByText(/parede selecionada/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/abertura selecionada/i)).not.toBeInTheDocument();
  });

  it('sem ponta solta, o aviso de vão não aparece', async () => {
    await montar();
    // Planta vazia não tem ponta solta — o aviso âmbar só existe quando há.
    expect(screen.queryByText(/ponta\(s\) solta\(s\)/i)).not.toBeInTheDocument();
  });
});

describe('BlueprintEditor · caminho para o orçamento (RF-122)', () => {
  it('a aba Orçamento existe e alterna com as outras', async () => {
    await montar();
    const user = userEvent.setup();

    const abaOrc = screen.getByRole('tab', { name: /orçamento/i });
    expect(abaOrc).toHaveAttribute('aria-selected', 'false');

    await user.click(abaOrc);
    expect(abaOrc).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /ambientes/i })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('estudo sem obra vinculada avisa antes de o usuário montar o de-para', async () => {
    await montar();
    await userEvent.setup().click(screen.getByRole('tab', { name: /orçamento/i }));

    expect(
      await screen.findByText(/não está vinculado a uma obra/i),
    ).toBeInTheDocument();
  });
});
