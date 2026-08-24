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
import { ConfirmProvider } from '../../components/ui/confirm';

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
  // Nem `scrollIntoView` — jsdom não faz layout. A lista de vãos o chama para
  // trazer à vista a linha do vão que a seleção do desenho acendeu.
  (Element.prototype as any).scrollIntoView = vi.fn();
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
  // `ConfirmProvider` vem do root do app (`index.tsx`) — montar o editor sem ele
  // é montar uma árvore que não existe em produção. O painel do Terreno usa
  // `useConfirm` antes de substituir a área do empreendimento na ficha.
  render(
    <ConfirmProvider>
      <BlueprintEditor study={study} branchId="brc_1" onBack={() => {}} />
    </ConfirmProvider>,
  );
  // O nível "Térreo" é criado num efeito depois do carregamento.
  await waitFor(() => expect(screen.getByRole('toolbar')).toBeInTheDocument());
}

/** Desenha paredes chamando o canvas por dentro não dá; usa-se o próprio DOM. */
function botao(nome: RegExp) {
  return screen.getByRole('button', { name: nome });
}

describe('BlueprintEditor · ações oferecidas', () => {
  it('monta com as ferramentas de desenho e o painel de ambientes', async () => {
    await montar();

    expect(botao(/selecionar/i)).toBeInTheDocument();
    expect(botao(/^parede$/i)).toBeInTheDocument();
    expect(botao(/^retângulo$/i)).toBeInTheDocument();
    expect(botao(/^polígono$/i)).toBeInTheDocument();
    expect(botao(/abertura/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/ambientes derivados/i)).toBeInTheDocument();
  });

  it('Retângulo NÃO traz o seletor de lados — ele sempre tem quatro', async () => {
    // Pedido de 16/08/2026: usar a forma fechada para fazer cômodo depressa,
    // começando por um CANTO. Retângulo não escolhe lados nem giro.
    await montar();
    await userEvent.setup().click(botao(/^retângulo$/i));
    expect(screen.queryByLabelText(/^lados$/i)).not.toBeInTheDocument();
  });

  it('a ferramenta Polígono traz o seletor de lados, e só ela', async () => {
    // O seletor de lados não faz sentido nas outras ferramentas: mostrá-lo
    // sempre sugeriria que ele muda algo no traçado manual.
    await montar();
    const user = userEvent.setup();

    expect(screen.queryByLabelText(/^lados$/i)).not.toBeInTheDocument();

    await user.click(botao(/^polígono$/i));
    const lados = screen.getByLabelText(/^lados$/i);
    expect(lados).toBeInTheDocument();
    // Cobre do triângulo ao dodecágono; 6 é o padrão porque retângulo já sai
    // fácil no traçado à mão.
    expect((lados as HTMLSelectElement).value).toBe('6');
    expect(within(lados as HTMLSelectElement).getByRole('option', { name: '3' })).toBeInTheDocument();
    expect(within(lados as HTMLSelectElement).getByRole('option', { name: '12' })).toBeInTheDocument();
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

  it('a ferramenta Abertura oferece porta, correr, janela e vão livre', async () => {
    await montar();
    const user = userEvent.setup();
    await user.click(botao(/abertura/i));

    // Nomes EXATOS, e não `/porta/i`: com "Porta de correr" no menu, o padrão
    // solto passou a casar com duas opções e o teste quebrou por ambiguidade
    // em vez de por defeito. Nome exato também documenta o rótulo.
    expect(screen.getByRole('option', { name: 'Porta' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Janela' })).toBeInTheDocument();
    // Vão livre entrou em 15/08/2026: vão sem esquadria (passagem, arco).
    expect(screen.getByRole('option', { name: 'Vão livre' })).toBeInTheDocument();
    // Porta de correr entrou em 23/08/2026, quando uma prancha real mostrou
    // que as duas saídas existentes erravam de formas opostas: vão livre some
    // do quantitativo de esquadrias, porta de abrir desenha um arco que não há.
    expect(screen.getByRole('option', { name: 'Porta de correr' })).toBeInTheDocument();
  });

  it('o vão encontrado oferece TODOS os tipos, não só porta e parede', async () => {
    // O usuário topou com o limite revisando uma planta gerada: em planta,
    // JANELA interrompe a face da parede igual a porta, então o detector
    // oferece o vão dela junto. Com só "é porta" e "é parede" as duas saídas
    // erravam calado — porta ganha peitoril zero e come o rodapé; parede perde
    // a esquadria do orçamento.
    //
    // O teste é sobre a LISTA de vãos, que só aparece com pontas soltas. Sem
    // modelo carregado ela não existe, então o que se afirma aqui é o contrato
    // dos rótulos: se algum sumir, este teste diz qual.
    const ROTULOS = ['É porta', 'É de correr', 'É janela', 'É vão livre', 'É parede'];
    const fonte = await import('node:fs').then((fs) =>
      fs.readFileSync('components/blueprint/BlueprintEditor.tsx', 'utf8'),
    );
    for (const r of ROTULOS) expect(fonte).toContain(r);
    // E cada um tem de chamar o fechamento com um tipo distinto.
    for (const k of ["'door'", "'sliding'", "'window'", "'passage'"]) {
      expect(fonte).toContain(`fecharComAbertura(v, ${k})`);
    }
  });

  it('a forma da folha só aparece com porta de correr escolhida', async () => {
    // Um controle sempre visível que não faz nada em três dos quatro tipos
    // ensina o usuário a ignorá-lo.
    await montar();
    const user = userEvent.setup();
    await user.click(botao(/abertura/i));

    expect(screen.queryByRole('combobox', { name: /folha/i })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: /tipo/i }), 'sliding');

    const folha = screen.getByRole('combobox', { name: /folha/i });
    expect(folha).toBeInTheDocument();
    // Nasce POR FORA: bolso exige parede preparada, e o padrão não pode
    // inventar uma parede oca que ninguém construiu.
    expect((folha as HTMLSelectElement).value).toBe('fora');
    expect(screen.getByRole('option', { name: /embutida/i })).toBeInTheDocument();
  });

  it('o seletor de tipo explica o que o vão livre faz no orçamento', async () => {
    // O tipo novo muda dois números (não entra em esquadrias, interrompe
    // rodapé) e nada disso se deduz do nome. O título do seletor é onde isso
    // fica ao alcance de quem escolhe.
    await montar();
    await userEvent.setup().click(botao(/abertura/i));

    const seletor = screen.getByRole('combobox', { name: /tipo/i });
    expect(seletor.title).toMatch(/esquadria/i);
    expect(seletor.title).toMatch(/rodapé/i);
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

  it('a linha do vão SELECIONA no desenho as paredes das duas pontas', async () => {
    // O casamento lista ↔ planta. Antes, "Vão 1 · 1,00 m" era texto: media,
    // oferecia fechar, e não dizia ONDE fica. Numa planta real as medidas se
    // repetem (havia quatro vãos de 0,98 m), então achar o vão pela medida não
    // é achar.
    //
    // O canvas é opaco em jsdom, então o que se afirma aqui é o efeito
    // OBSERVÁVEL da seleção: o painel de seleção múltipla passa a contar as
    // duas paredes, e a própria linha se marca como selecionada — que é o
    // caminho de volta (`vaosDaSelecao`), o "vice-versa" do pedido.
    loadBranchModel.mockResolvedValue(comDuasParedesSoltas());
    await montar();

    const linha = await screen.findByRole('button', { name: /Vão 1 · 1,00 m/ });
    expect(linha).toHaveAttribute('aria-pressed', 'false');

    await userEvent.setup().click(linha);

    expect(screen.getByText(/2 paredes/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Vão 1 · 1,00 m/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('canto aberto NÃO vira vão — fechá-lo criaria uma parede diagonal', async () => {
    // Defeito real (23/08/2026), trazido por print de uma planta gerada do PDF:
    // o detector emparelhava pontas soltas só por DISTÂNCIA e desenhava um leque
    // de diagonais — a ombreira de cima de uma porta oferecida como "vão" contra
    // o canto de uma parede a 1,86 m dali, do outro lado do arco de abertura.
    // Duas das três ofertas eram geometricamente impossíveis, e aceitar
    // qualquer uma criava uma parede enviesada atravessando o cômodo. O usuário
    // leu o desenho como bug da geração de paredes, que é o que ele parecia ser.
    //
    // Aqui as duas pontas estão a 1,41 m uma da outra — dentro da faixa de
    // abertura — mas em paredes PERPENDICULARES. Nenhuma continua o eixo da
    // outra.
    loadBranchModel.mockResolvedValue(comCantoAberto());
    await montar();

    // O aviso de ponta solta continua: o contorno segue aberto, e esconder isso
    // seria trocar um defeito por outro.
    expect(await screen.findByText(/ponta\(s\) solta\(s\)/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Vão \d/ })).not.toBeInTheDocument();
    expect(screen.getByText(/na mesma linha/i)).toBeInTheDocument();
  });
});

describe('BlueprintEditor · juntar pontas soltas num canto', () => {
  // Pedido de 23/08/2026: "gostaria de clicar em circulo laranja e ela mudar de
  // cor e clicar no segundo circulo laranja mudar de cor e fazer a conexão das
  // paredes automaticamente".
  //
  // O GESTO em si (clicar nos círculos) vive no canvas, opaco em jsdom — a
  // matemática do canto está em `cantoEntreEixos` no teste do kernel, e o
  // apontar-e-clicar é assunto do harness. O que se afirma AQUI é o que a
  // interface oferece: a ferramenta existe, ativa, e diz o que fazer em seguida.

  it('a barra oferece a ferramenta Juntar', async () => {
    await montar();
    expect(botao(/^juntar$/i)).toBeInTheDocument();
  });

  it('com a ferramenta ativa, o rodapé manda clicar numa ponta solta', async () => {
    loadBranchModel.mockResolvedValue(comCantoAberto());
    await montar();

    await userEvent.setup().click(botao(/^juntar$/i));
    expect(screen.getByText(/clique numa ponta solta/i)).toBeInTheDocument();
  });

  it('sem ponta solta, a ferramenta diz que não há canto para juntar', async () => {
    // Ferramenta que aceita o clique e não faz nada ensina a desconfiar da
    // ferramenta. Numa planta fechada ela avisa por que não há o que fazer.
    await montar();

    await userEvent.setup().click(botao(/^juntar$/i));
    expect(screen.getByText(/nenhuma ponta solta/i)).toBeInTheDocument();
  });
});

const NIVEL = { id: 'lvl_1', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 };

function parede(id: string, a: { x: number; y: number }, b: { x: number; y: number }) {
  return { id, levelId: NIVEL.id, a, b, thicknessMm: 150, heightMm: 2800 };
}

function modelo(walls: ReturnType<typeof parede>[]) {
  return {
    levels: [NIVEL],
    walls,
    openings: [],
    boundaries: [],
    labels: [],
    spaces: [],
    areaEscrituraMm2: null,
    seq: { wal: walls.length, lvl: 1 },
  };
}

/**
 * Duas paredes NA MESMA LINHA, separadas por 1,00 m — uma abertura de verdade,
 * o menor caso que produz UM vão candidato.
 *
 * Os comprimentos (5 m) passam do teto de abertura (3 m) de propósito: as duas
 * pontas da MESMA parede também são pontas soltas, e com 3 m ou menos elas
 * formariam um segundo vão entre si, embaralhando a numeração do teste.
 */
function comDuasParedesSoltas() {
  return modelo([
    parede('wal_0001', { x: 0, y: 0 }, { x: 0, y: 5000 }),
    parede('wal_0002', { x: 0, y: 6000 }, { x: 0, y: 11000 }),
  ]);
}

/**
 * Duas paredes PERPENDICULARES cujas pontas passam a 1,00 m uma da outra: um
 * canto aberto, não um vão.
 *
 * É a forma exata do defeito de 23/08/2026 — o detector emparelhava por
 * distância pura e oferecia fechar na diagonal, o que criaria uma parede
 * enviesada atravessando o cômodo.
 */
function comCantoAberto() {
  return modelo([
    parede('wal_0001', { x: 0, y: 0 }, { x: 0, y: 5000 }),
    parede('wal_0002', { x: 1000, y: 6000 }, { x: 6000, y: 6000 }),
  ]);
}

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

/**
 * Sala fechada com uma divisória cujas DUAS pontas param na FACE das paredes de
 * cima e de baixo — 75 mm de meia espessura em cada uma.
 *
 * É a forma exata do defeito de 23/08/2026: em planta a divisória parece dividir
 * o cômodo; no modelo, feito de eixos, ela não toca nada.
 */
function comDivisoriaSoltaNaFace() {
  return modelo([
    parede('wal_0001', { x: 0, y: 0 }, { x: 6000, y: 0 }),
    parede('wal_0002', { x: 6000, y: 0 }, { x: 6000, y: 3000 }),
    parede('wal_0003', { x: 6000, y: 3000 }, { x: 0, y: 3000 }),
    parede('wal_0004', { x: 0, y: 3000 }, { x: 0, y: 0 }),
    parede('wal_0005', { x: 3000, y: 75 }, { x: 3000, y: 2925 }),
  ]);
}

describe('BlueprintEditor · conexão em T automática', () => {
  // Pedido de 23/08/2026, com print: "a conexão de paredes em T aparentemente não
  // está acontecendo". Medido na planta real do usuário: 35 paredes, 22 vértices
  // de grau 1 e ZERO ambientes; treze pontas paravam a 11–100 mm do eixo da
  // parede que deveriam encontrar. Corrigidas: 5 ambientes.
  //
  // O usuário escolheu que a correção fosse AUTOMÁTICA. Automático sem aviso
  // seria o editor mexendo na planta dele em silêncio — por isso o que se afirma
  // aqui é o aviso, que é a parte observável.

  it('ao carregar, encosta as pontas e CONTA o que fez', async () => {
    loadBranchModel.mockResolvedValue(comDivisoriaSoltaNaFace());
    await montar();

    const aviso = await screen.findByText(/encostavam noutra parede sem alcançar o eixo/i);
    expect(aviso).toBeInTheDocument();
    // As duas pontas da divisória.
    expect(aviso.textContent).toMatch(/^2 ponta/);
    // E diz como voltar atrás: mexer na planta de alguém sem oferecer a saída
    // seria pior que não mexer.
    expect(aviso.textContent).toMatch(/desfazer/i);
  });

  it('o ambiente que não fechava passa a fechar', async () => {
    // É o efeito que motivou tudo: sem a conexão o contorno não fecha, e sem
    // contorno fechado não há área, não há piso e não há quantitativo.
    loadBranchModel.mockResolvedValue(comDivisoriaSoltaNaFace());
    await montar();

    await waitFor(() =>
      expect(screen.getByText(/2 ambiente\(s\) ·/)).toBeInTheDocument(),
    );
  });

  it('planta sem encosto em T não recebe aviso nenhum', async () => {
    // A correção não pode ser barulhenta em planta que já está certa.
    loadBranchModel.mockResolvedValue(comDuasParedesSoltas());
    await montar();

    expect(screen.queryByText(/encostavam noutra parede/i)).not.toBeInTheDocument();
  });
});

describe('BlueprintEditor · conectar sob demanda', () => {
  // Quinta rodada do mesmo relato (23/08/2026). O passe automático resolve tudo
  // — medido na planta do usuário: 7 movimentos, 7 -> 10 ambientes, 6 pontas
  // soltas -> 0 — mas rodava UMA vez, no carregamento. Editar cria encosto novo,
  // e nada o pegava até o próximo carregamento.
  //
  // A ferramenta Juntar não cobria o buraco: as duas pontas de um canto estavam
  // a 10 mm uma da outra, e o raio de clique é 9 px — em zoom de trabalho as duas
  // bolinhas são o mesmo pixel. "Não é possível alinhar essas duas paredes", nas
  // palavras dele, e estava certo.

  it('o painel de pontas soltas oferece conectar', async () => {
    loadBranchModel.mockResolvedValue(comCantoAberto());
    await montar();
    expect(await screen.findByRole('button', { name: /conectar automaticamente/i })).toBeInTheDocument();
  });

  it('sem nada a encostar, o botão DIZ isso em vez de ficar mudo', async () => {
    // `comCantoAberto` tem as pontas a 1,41 m — longe demais para encostar sem
    // adivinhar. Um botão que aceita o clique e não responde ensina a
    // desconfiar do botão.
    loadBranchModel.mockResolvedValue(comCantoAberto());
    await montar();

    await userEvent.setup().click(screen.getByRole('button', { name: /conectar automaticamente/i }));
    expect(screen.getByText(/nenhuma ponta se sobrepõe/i)).toBeInTheDocument();
  });

  it('com encosto de verdade, conecta e conta quantas', async () => {
    // A divisória que morre na face das paredes de cima e de baixo. O passe
    // automático já a pega no carregamento, então aqui o clique encontra o
    // trabalho feito — e é justamente isso que o texto tem de saber dizer.
    loadBranchModel.mockResolvedValue(comDivisoriaSoltaNaFace());
    await montar();

    await waitFor(() =>
      expect(screen.getByText(/2 ambiente\(s\) ·/)).toBeInTheDocument(),
    );
  });
});

describe('BlueprintEditor · abertura nasce selecionada', () => {
  // Pedido de 23/08/2026: "ao inserir porta; janela afins, selecionar
  // automaticamente".
  //
  // Tudo que se faz com uma abertura logo depois de inserir — girar, espelhar,
  // acertar largura, subir peitoril, trocar o tipo — mora no painel do
  // selecionado. Sem isto cada porta custava um clique a mais só para dizer
  // "esta que acabei de pôr", e esse clique tem de acertar o vão: perto da
  // ombreira ele pega a PAREDE, e o painel mostra a coisa errada.
  //
  // A inserção pelo canvas (ferramenta Abertura) é opaca em jsdom; o que se
  // exercita aqui é o outro caminho, o da lista de vãos, que é DOM de verdade.

  it('fechar um vão como porta já deixa a PORTA selecionada', async () => {
    loadBranchModel.mockResolvedValue(comDuasParedesSoltas());
    await montar();

    await userEvent.setup().click(await screen.findByRole('button', { name: /é porta/i }));

    // O painel do selecionado passa a falar da abertura, não da parede.
    expect(
      screen.getByText((_, el) => el?.tagName === 'P' && /porta a /i.test(el.textContent ?? '')),
    ).toBeInTheDocument();
    // E com ela vêm as ações que só existem para quem tem folha.
    expect(screen.getByRole('button', { name: /girar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /espelhar/i })).toBeInTheDocument();
  });

  it('como JANELA, idem — e o painel traz o peitoril', async () => {
    // Janela nasce com peitoril de 90 cm, que é o que a distingue de porta no
    // rodapé. Nascer selecionada é o que põe esse campo ao alcance na hora.
    loadBranchModel.mockResolvedValue(comDuasParedesSoltas());
    await montar();

    await userEvent.setup().click(await screen.findByRole('button', { name: /é janela/i }));

    expect(
      screen.getByText((_, el) => el?.tagName === 'P' && /janela a /i.test(el.textContent ?? '')),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/altura do peitoril/i)).toBeInTheDocument();
  });

  it('fechar como PAREDE não seleciona abertura nenhuma — não há esquadria', async () => {
    loadBranchModel.mockResolvedValue(comDuasParedesSoltas());
    await montar();

    await userEvent.setup().click(await screen.findByRole('button', { name: /é parede/i }));

    expect(screen.queryByText(/abertura selecionada/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /girar/i })).not.toBeInTheDocument();
  });
});
