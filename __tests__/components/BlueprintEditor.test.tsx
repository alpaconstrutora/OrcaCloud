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
const getSnapshotIdentity = vi.fn(async () => null as unknown);
// `getBranch` PRECISA ser controlável: com `parent_snapshot_id` nulo o editor
// nunca chega a comparar hash nenhum, e um teste de "já publicado" passaria sem
// exercitar a comparação. Foi o que aconteceu na primeira versão destes casos —
// eles aprovavam o código defeituoso.
const getBranch = vi.fn(async () => RAMO_LIMPO as unknown);

vi.mock('../../services/blueprintService', () => ({
  loadBranchModel: (...a: unknown[]) => loadBranchModel(...(a as [])),
  getSnapshotIdentity: (...a: unknown[]) => getSnapshotIdentity(...(a as [])),
  getBranch: (...a: unknown[]) => getBranch(...(a as [])),
  saveDraft: vi.fn(async () => 'hash'),
  publishSnapshot: vi.fn(async () => 'snap_1'),
  listSnapshots: vi.fn(async () => []),
  getQuantitySnapshot: vi.fn(async () => null),
  computeAndStoreQuantities: vi.fn(async () => null),
  listObrasDaOrganizacao: vi.fn(async () => [{ id: 'prj_1', name: 'Residencial Alfa' }]),
  setStudyProject: vi.fn(async () => ({})),
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
  loadBranchModel.mockResolvedValue(null);
  getSnapshotIdentity.mockResolvedValue(null);
  getBranch.mockResolvedValue(RAMO_LIMPO);

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

    // A tela não só avisa: oferece onde vincular. Aviso sem ação é beco sem saída.
    expect(await screen.findByLabelText(/obra a vincular/i)).toBeInTheDocument();
  });
});

describe('BlueprintEditor · o editor não pode mentir que já publicou', () => {
  it('RASCUNHO DIFERENTE DA VERSÃO PUBLICADA HABILITA PUBLICAR', async () => {
    // DEFEITO REAL, encontrado em uso. A referência do "já publicado" era o hash
    // do PRÓPRIO RASCUNHO: o editor comparava o desenho consigo mesmo, concluía
    // "sem alterações" e DESABILITAVA Publicar. Três paredes ficaram presas no
    // rascunho, sem nenhuma forma de publicá-las, e a tela afirmava que estavam
    // publicadas.
    const { applyBatch, applyCommand, emptyModel, point } = await import(
      '../../utils/blueprintKernel'
    );

    const base = applyCommand(emptyModel(), {
      type: 'AddLevel',
      name: 'Térreo',
      elevationMm: 0,
      defaultHeightMm: 2800,
    }).model;
    const levelId = base.levels[0].id;
    const rascunho = applyBatch(base, [
      {
        type: 'AddWall',
        levelId,
        a: point(0, 0),
        b: point(4000, 0),
        thicknessMm: 150,
        heightMm: 2800,
      },
    ]).model;

    loadBranchModel.mockResolvedValue(rascunho);
    getBranch.mockResolvedValue({ ...RAMO_LIMPO, parent_snapshot_id: 'snap_1', base_revision: 2 });
    // O snapshot publicado tem OUTRA geometria — hash diferente.
    getSnapshotIdentity.mockResolvedValue({
      hash: 'hash-de-outra-geometria',
      kernel_version: 'blueprint-kernel-ts-0.3.0',
    });

    await montar();
    await waitFor(() => expect(botao(/publicar/i)).toBeEnabled());
  });

  it('kernel diferente torna o hash INCOMPARÁVEL — e aí Publicar fica ligado', async () => {
    // O payload canônico muda de formato entre versões do kernel, então o hash
    // gravado sob 0.2.0 nunca bate com o que o 0.3.0 calcula. Errar para o lado
    // de oferecer publicar é recuperável; esconder o botão prende o trabalho.
    const { applyBatch, applyCommand, emptyModel, point, snapshotHash } = await import(
      '../../utils/blueprintKernel'
    );

    const base = applyCommand(emptyModel(), {
      type: 'AddLevel',
      name: 'Térreo',
      elevationMm: 0,
      defaultHeightMm: 2800,
    }).model;
    const levelId = base.levels[0].id;
    const modelo = applyBatch(base, [
      {
        type: 'AddWall',
        levelId,
        a: point(0, 0),
        b: point(4000, 0),
        thicknessMm: 150,
        heightMm: 2800,
      },
    ]).model;

    loadBranchModel.mockResolvedValue(modelo);
    getBranch.mockResolvedValue({ ...RAMO_LIMPO, parent_snapshot_id: 'snap_1', base_revision: 2 });
    // MESMO hash do desenho na tela, mas de um kernel ANTIGO.
    getSnapshotIdentity.mockResolvedValue({
      hash: snapshotHash(modelo),
      kernel_version: 'blueprint-kernel-ts-0.2.0',
    });

    await montar();
    await waitFor(() => expect(botao(/publicar/i)).toBeEnabled());
  });
});

describe('BlueprintEditor · orto e mover ponta', () => {
  it('O ORTO NASCE LIGADO — é ele que impede a parede torta', async () => {
    // O defeito que motivou isto: uma ponta encaixou na grade de 200 mm, mas
    // 200 mm acima da outra. A parede saiu fora do esquadro, invisível na escala
    // da tela, e só apareceu quando o desenho foi para o CAD. Nascer desligado
    // deixaria o erro possível para quem nunca abrir a barra.
    await montar();
    expect(botao(/orto/i)).toHaveAttribute('aria-pressed', 'true');
  });

  it('o botão alterna, e diz o que Shift faz em cada estado', async () => {
    // Shift INVERTE o modo, não liga: com orto ligado ele libera. Ter tecla e
    // botão fazendo a mesma coisa seria dois caminhos para o mesmo lugar.
    await montar();
    const user = userEvent.setup();

    expect(botao(/orto/i).title).toMatch(/Shift libera/i);

    await user.click(botao(/orto/i));
    expect(botao(/orto/i)).toHaveAttribute('aria-pressed', 'false');
    expect(botao(/orto/i).title).toMatch(/Shift trava/i);
  });

  it('F8 alterna o orto, como em qualquer CAD', async () => {
    await montar();
    expect(botao(/orto/i)).toHaveAttribute('aria-pressed', 'true');

    await userEvent.setup().keyboard('{F8}');
    await waitFor(() => expect(botao(/orto/i)).toHaveAttribute('aria-pressed', 'false'));
  });

  it('a dica do rodapé anuncia o estado do orto', async () => {
    // O canvas é opaco para leitor de tela; o estado precisa existir em DOM.
    await montar();
    expect(screen.getByText(/orto \(Shift libera\)/i)).toBeInTheDocument();
  });
});

describe('BlueprintEditor · mostrar/ocultar medidas das paredes', () => {
  it('nasce DESLIGADO — cota em toda parede é poluição visual até ser pedida', async () => {
    await montar();
    expect(botao(/medidas/i)).toHaveAttribute('aria-pressed', 'false');
  });

  it('o botão alterna e o título muda de acordo', async () => {
    await montar();
    const user = userEvent.setup();

    expect(botao(/medidas/i).title).toMatch(/mostrar/i);

    await user.click(botao(/medidas/i));
    expect(botao(/medidas/i)).toHaveAttribute('aria-pressed', 'true');
    expect(botao(/medidas/i).title).toMatch(/ocultar/i);

    await user.click(botao(/medidas/i));
    expect(botao(/medidas/i)).toHaveAttribute('aria-pressed', 'false');
    expect(botao(/medidas/i).title).toMatch(/mostrar/i);
  });
});
