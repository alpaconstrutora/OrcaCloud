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
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { BlueprintStudy } from '../../types/blueprint';
import { ConfirmProvider } from '../../components/ui/confirm';

// ⚠️ TETO DE TEMPO MAIOR, e o motivo medido em 07/09/2026.
//
// Cada caso deste arquivo monta o BlueprintEditor INTEIRO. Isolado, o arquivo
// roda em 2,6 s para 6 casos (~430 ms cada) — folgado. Na suíte completa, com
// os workers disputando CPU, casos isolados passavam de 5 s e o vitest os
// derrubava com "Test timed out", sempre em arquivos diferentes a cada rodada.
//
// Não é lentidão de lógica nem regressão: é contenção. O teto de 5 s do padrão
// é apertado para um teste que monta um editor de plantas com canvas, e subi-lo
// AQUI (e não globalmente) mantém a trava curta em todo o resto da suíte.
vi.setConfig({ testTimeout: 30_000 });

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
// O catálogo de tipos de elemento (E1.1) é controlável: o seletor aplica o que
// o dublê devolve, e "salvar" grava pelo dublê.
const listElementTypes = vi.fn(async () => [] as unknown[]);
vi.mock('../../services/blueprintElementTypeService', () => ({
  listElementTypes: (...a: unknown[]) => listElementTypes(...(a as [])),
  saveElementType: vi.fn(async () => ({})),
  deleteElementType: vi.fn(),
}));

// Definições de parâmetro (E1.2): controláveis, como os tipos de elemento.
const listParameterDefinitions = vi.fn(async () => [] as unknown[]);
vi.mock('../../services/blueprintParameterDefinitionService', async () => {
  const real = await vi.importActual<typeof import('../../services/blueprintParameterDefinitionService')>('../../services/blueprintParameterDefinitionService');
  return {
    ...real,
    listParameterDefinitions: (...a: unknown[]) => listParameterDefinitions(...(a as [])),
    saveParameterDefinition: vi.fn(async () => ({})),
    deleteParameterDefinition: vi.fn(),
  };
});

// Programa de necessidades (E4.1): `get` controlável; `save` observável (gravação com respiro).
const getPrograma = vi.fn(async () => null as unknown);
const savePrograma = vi.fn(async () => ({}));
vi.mock('../../services/blueprintProgramService', () => ({
  blueprintProgramService: {
    get: (...a: unknown[]) => getPrograma(...(a as [])),
    save: (...a: unknown[]) => savePrograma(...(a as [])),
    remove: vi.fn(async () => {}),
  },
}));

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
  // O painel guarda quais seções estão abertas em `localStorage`
  // (`blueprint:secoesDoPainel:v2`), e o jsdom é o MESMO entre os testes deste
  // arquivo. Sem esta limpeza, a seção que um teste abre chega aberta no
  // seguinte, e o clique que deveria abrir FECHA — três testes quebraram assim
  // em 29/08/2026, com falhas que pareciam de conteúdo ("texto não encontrado")
  // e eram de estado herdado.
  localStorage.clear();

  loadBranchModel.mockResolvedValue(null);
  getSnapshotIdentity.mockResolvedValue(null);
  getBranch.mockResolvedValue(RAMO_LIMPO);
  getPrograma.mockResolvedValue(null);
  savePrograma.mockClear();

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

/**
 * Abre a seção Componentes do painel e EXPANDE os grupos (nascem recolhidos
 * desde 17/09/2026) — para os testes que procuram uma linha da lista.
 */
async function abrirComponentes(user: ReturnType<typeof userEvent.setup>) {
  const secao = document.querySelector<HTMLButtonElement>('button[aria-controls="secao-componentes-corpo"]')!;
  expect(secao).toBeTruthy();
  if (secao.getAttribute('aria-expanded') === 'false') await user.click(secao);
  // O modelo chega por promessa: no CI os grupos ainda não existiam quando o
  // helper rodava, e nada era expandido. Espera o primeiro grupo aparecer.
  await waitFor(() => expect(document.querySelector('button[aria-controls^="componentes-"]')).toBeTruthy());
  for (let i = 0; i < 5; i++) {
    const fechados = [...document.querySelectorAll<HTMLButtonElement>('button[aria-expanded="false"][aria-controls^="componentes-"]')];
    if (fechados.length === 0) break;
    for (const b of fechados) await user.click(b);
  }
}

/** Desenha paredes chamando o canvas por dentro não dá; usa-se o próprio DOM. */
function botao(nome: RegExp) {
  return screen.getByRole('button', { name: nome });
}

/**
 * Abre uma aba do RIBBON (13/09/2026).
 *
 * A barra de ferramentas virou abas por disciplina — Arquitetura, Terreno,
 * Instalações, Inserir, Analisar, Vista. Só o painel da aba ativa está no DOM,
 * então o teste que quer o menu Exibir ou o seletor de Precisão abre "Vista"
 * antes. O editor nasce em Arquitetura, onde moram Selecionar, Componentes,
 * Juntar e Corte — os testes que só usam esses não precisam trocar de aba.
 */
async function abrirAba(nome: RegExp) {
  await userEvent.setup().click(screen.getByRole('tab', { name: nome }));
}

/**
 * Escolhe um componente pelo menu — o caminho único desde 31/08/2026.
 *
 * Os botões Parede/Retângulo/Polígono/Abertura e o menu Estrutural viraram um
 * menu "Componentes" só, e o select de Tipo da abertura saiu da barra. Estes
 * testes continuam afirmando o MESMO comportamento (quais controles aparecem em
 * cada ferramenta); só o caminho até a ferramenta mudou.
 *
 * O botão do menu troca de rótulo conforme o componente ativo — por isso o
 * seletor casa com qualquer um dos nomes possíveis.
 */
const NOMES_DO_BOTAO =
  /^(Componentes|Parede|Parede em retângulo|Parede em polígono|Porta|Porta de correr|Janela|Vão livre|Pilar|Viga|Laje|Estaca|Bloco de coroamento|Viga de fundação|Shaft|Elevador|Vaga|Vaga PCD|Vaga idoso|Vaga de moto)$/;

/**
 * O botão do menu.
 *
 * ⚠️ Ele NÃO se chama "Componentes" na maior parte do tempo. O editor abre com a
 * ferramenta Parede ativa, então o rótulo já nasce "Parede" — o botão diz o
 * componente ATIVO, que é a razão de ele existir assim (menu fechado não pode
 * esconder o estado). "Componentes" só aparece com uma ferramenta que não é
 * componente: Selecionar, Juntar, Terreno, Divisa, as medições.
 */
function botaoComponentes() {
  return screen.getByRole('button', { name: NOMES_DO_BOTAO });
}

async function escolherComponente(nome: RegExp) {
  const user = userEvent.setup();
  await user.click(botaoComponentes());
  await user.click(screen.getByRole('menuitemradio', { name: nome }));
}

describe('BlueprintEditor · ações oferecidas', () => {
  it('monta com o menu de componentes e o painel de ambientes', async () => {
    await montar();

    expect(botao(/^selecionar$/i)).toBeInTheDocument();
    // Nasce com a Parede ativa — o editor abre pronto para desenhar.
    expect(botaoComponentes()).toHaveTextContent('Parede');
    // O painel lateral é navegador + propriedades desde 13/09/2026; a seção
    // "Ambientes" nasce aberta dentro do navegador.
    expect(screen.getByRole('region', { name: /navegador/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /^ambientes$/i })).toBeInTheDocument();
  });

  it('o menu reúne alvenaria, esquadria, estrutura e fundação', async () => {
    await montar();
    await userEvent.setup().click(botaoComponentes());

    // Os ONZE tipos, num lugar só. Antes eram dois lugares e um select
    // escondido: quem procurava "janela" tinha de saber que ela morava dentro
    // de um seletor ao lado de um botão chamado "Abertura".
    for (const nome of [
      /^Parede$/,
      /^Parede em retângulo$/,
      /^Parede em polígono$/,
      /^Porta$/,
      /^Porta de correr$/,
      /^Janela$/,
      /^Vão livre$/,
      /^Pilar$/,
      /^Viga$/,
      /^Laje$/,
      /^Estaca$/,
      /^Bloco de coroamento$/,
      /^Viga de fundação$/,
    ]) {
      expect(screen.getByRole('menuitemradio', { name: nome })).toBeInTheDocument();
    }
  });

  it('Retângulo NÃO traz o seletor de lados — ele sempre tem quatro', async () => {
    // Pedido de 16/08/2026: usar a forma fechada para fazer cômodo depressa,
    // começando por um CANTO. Retângulo não escolhe lados nem giro.
    await montar();
    await escolherComponente(/^Parede em retângulo$/);
    expect(screen.queryByLabelText(/^lados$/i)).not.toBeInTheDocument();
  });

  it('a Parede em polígono traz o seletor de lados, e só ela', async () => {
    // O seletor de lados não faz sentido nas outras ferramentas: mostrá-lo
    // sempre sugeriria que ele muda algo no traçado manual.
    await montar();
    expect(screen.queryByLabelText(/^lados$/i)).not.toBeInTheDocument();

    await escolherComponente(/^Parede em polígono$/);
    const lados = screen.getByLabelText(/^lados$/i);
    expect(lados).toBeInTheDocument();
    // Cobre do triângulo ao dodecágono; 6 é o padrão porque retângulo já sai
    // fácil no traçado à mão.
    expect((lados as HTMLSelectElement).value).toBe('6');
    expect(within(lados as HTMLSelectElement).getByRole('option', { name: '3' })).toBeInTheDocument();
    expect(within(lados as HTMLSelectElement).getByRole('option', { name: '12' })).toBeInTheDocument();
  });

  it('escolher uma esquadria troca os controles da barra', async () => {
    await montar();

    // Com a Parede, a barra mostra Espessura.
    expect(screen.getByText(/espessura/i)).toBeInTheDocument();

    await escolherComponente(/^Janela$/);

    // Com uma esquadria, mostra Largura no lugar. O "Tipo" saiu da barra: ele
    // agora é o próprio menu, e dois lugares para a mesma escolha
    // desacordariam.
    expect(screen.getByText(/^largura$/i)).toBeInTheDocument();
    expect(screen.queryByText(/espessura/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /^tipo$/i })).not.toBeInTheDocument();
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

  it('o modo de junção NASCE em "Manter junções", e a chave discrimina', async () => {
    // O padrão antigo era desprender: mover uma parede conectada desfazia a
    // junção, o ambiente derivado sumia junto com a área, e o usuário só
    // descobria pelo aviso no painel lateral. Aqui trava-se o padrão novo —
    // sem isto, uma linha de `useState` desfaz a mudança sem nada acusar.
    localStorage.removeItem('blueprint:modoJuncao');
    await montar();
    // A chave só aparece na ferramenta de seleção — fora dela não há conjunto
    // para mover. O editor abre em "Parede".
    await userEvent.click(botao(/^selecionar$/i));

    const chave = botao(/manter junções/i);
    expect(chave).toHaveAttribute('aria-pressed', 'true');

    // E continua sendo uma ESCOLHA: desprender é legítimo, só não é o padrão.
    await userEvent.click(chave);
    expect(botao(/^soltar$/i)).toHaveAttribute('aria-pressed', 'false');
  });

  it('a grade automática anuncia o passo em vigor', async () => {
    await montar();
    await abrirAba(/^vista$/i);
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

  it('as quatro esquadrias estão no menu, com o rótulo da fonte única', async () => {
    await montar();
    await userEvent.setup().click(botaoComponentes());

    // Nomes EXATOS, e não `/porta/i`: com "Porta de correr" na lista, o padrão
    // solto casa com duas entradas e o teste quebra por ambiguidade em vez de
    // por defeito. Nome exato também documenta o rótulo — que sai de
    // `nomeDoTipoDeAbertura`, a fonte única.
    expect(screen.getByRole('menuitemradio', { name: 'Porta' })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: 'Janela' })).toBeInTheDocument();
    // Vão livre entrou em 15/08/2026: vão sem esquadria (passagem, arco).
    expect(screen.getByRole('menuitemradio', { name: 'Vão livre' })).toBeInTheDocument();
    // Porta de correr entrou em 23/08/2026, quando uma prancha real mostrou
    // que as duas saídas existentes erravam de formas opostas: vão livre some
    // do quantitativo de esquadrias, porta de abrir desenha um arco que não há.
    expect(screen.getByRole('menuitemradio', { name: 'Porta de correr' })).toBeInTheDocument();
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

    await escolherComponente(/^Janela$/);
    expect(screen.queryByRole('combobox', { name: /folha/i })).not.toBeInTheDocument();

    await escolherComponente(/^Porta de correr$/);
    const folha = screen.getByRole('combobox', { name: /folha/i });
    expect(folha).toBeInTheDocument();
    // Nasce POR FORA: bolso exige parede preparada, e o padrão não pode
    // inventar uma parede oca que ninguém construiu.
    expect((folha as HTMLSelectElement).value).toBe('fora');
    expect(screen.getByRole('option', { name: /embutida/i })).toBeInTheDocument();
  });

  it('o menu explica o que o vão livre faz no orçamento', async () => {
    // O tipo muda dois números (não entra em esquadrias, interrompe rodapé) e
    // nada disso se deduz do nome. A ajuda saiu do title do seletor da barra —
    // que não existe mais — para o title do item do menu, que é onde a escolha
    // acontece agora.
    await montar();
    await userEvent.setup().click(botaoComponentes());

    const item = screen.getByRole('menuitemradio', { name: 'Vão livre' });
    expect(item.title).toMatch(/esquadria/i);
    expect(item.title).toMatch(/rodapé/i);
  });

  it('o botão do menu DIZ qual componente está ativo', async () => {
    // Menu fechado não pode esconder o estado — a razão do contador em
    // `MenuExibir`, aqui levada a um seletor.
    await montar();
    expect(botaoComponentes()).toHaveTextContent('Parede');

    await escolherComponente(/^Pilar$/);
    expect(botaoComponentes()).toHaveTextContent('Pilar');

    // E com uma ferramenta que NÃO é componente, o botão volta ao nome do grupo.
    await userEvent.setup().click(botao(/^selecionar$/i));
    expect(botaoComponentes()).toHaveTextContent('Componentes');
  });
});

/**
 * Abre uma seção do painel lateral pelo cabeçalho.
 *
 * Era `getByRole('tab', …)` até 29/08/2026, quando as abas do painel viraram
 * seções de accordion. O seletor de vista (Planta/elevações/3D) também deixou de
 * ser `role="tab"` no mesmo dia — virou um popover — então a busca por `button`
 * casa com o cabeçalho da seção sem ambiguidade.
 */
function cabecalhoDaSecao(nome: RegExp) {
  return screen.getByRole('button', { name: nome });
}

/**
 * Abre um RELATÓRIO em DRAWER (14/09/2026): Quantitativos, Orçamento,
 * Conflitos e Medições moram na aba Analisar do ribbon e abrem num `Sheet`
 * (pedido: "converter em drawer: analisar < conflitos; medições;
 * quantitativos; orçamento"). Só Comentários e Versões (Colaborar) seguem no
 * dock embaixo do canvas. Eram seções do acordeão até 13/09.
 */
async function abrirRelatorio(nome: RegExp, aba: RegExp = /^analisar$/i) {
  await abrirAba(aba);
  await userEvent.setup().click(screen.getByRole('button', { name: nome }));
  return screen.findByRole('dialog');
}

/** 17/09/2026: Quantitativos é TELA em fluxo (*"criar nova tela também em vez de drawer"*). */
async function abrirTelaDeQuantitativos() {
  await abrirAba(/^analisar$/i);
  await userEvent.setup().click(screen.getByRole('button', { name: /^quantitativos$/i }));
  const titulo = await screen.findByRole('heading', { level: 1, name: /quantitativos/i });
  return titulo.closest('[data-tela="quantitativos"]') as HTMLElement;
}

describe('BlueprintEditor · quantitativos', () => {
  beforeEach(() => localStorage.clear());

  it('a tela existe e anuncia a versão da política', async () => {
    await montar();
    const tela = await abrirTelaDeQuantitativos();
    expect(tela).not.toBeNull();
    // RF-121: o resultado precisa dizer sob qual política foi calculado.
    expect(within(tela).getAllByText(/pol[íi]tica quant-/i).length).toBeGreaterThan(0);
    // É tela, não drawer: sem dialog, com as abas do padrão.
    expect(screen.queryByRole('dialog')).toBeNull();
    for (const aba of ['Resumo', 'Por ambiente', 'Por peça estrutural', 'Por pavimento', 'Instalações', 'Sobreposições']) {
      expect(within(tela).getByRole('tab', { name: new RegExp(`^${aba}`) })).toBeInTheDocument();
    }
  });

  it('sem ambiente fechado, explica que não há o que quantificar', async () => {
    await montar();
    const tela = await abrirTelaDeQuantitativos();
    expect(within(tela).getAllByText(/sem contorno fechado n[ãa]o h[áa] [áa]rea/i).length).toBeGreaterThan(0);
  });

  it('sem versão publicada, explica que orçamento não cita rascunho', async () => {
    await montar();
    const tela = await abrirTelaDeQuantitativos();
    // A distinção oficial × ao vivo é o ponto da tela: o número que o orçamento
    // cita não pode vir de geometria que ainda muda.
    expect(within(tela).getByText(/o or[çc]amento n[ãa]o cita rascunho/i)).toBeInTheDocument();
  });

  it('Quantitativos é tela: o botão acende, Voltar devolve o editor com Ambientes como estava; Conflitos segue drawer', async () => {
    // Este teste trocou de sentido em 29/08/2026 (abas → seções irmãs), em
    // 13/09 (seção → dock), em 14/09 (dock → drawer) e em 17/09 (drawer →
    // tela). O que continua valendo é a tese — ver o quantitativo não pode
    // custar a lista de ambientes.
    await montar();
    const secAmb = cabecalhoDaSecao(/ambientes/i);
    expect(secAmb).toHaveAttribute('aria-expanded', 'true');

    const tela = await abrirTelaDeQuantitativos();
    // A tela toma o lugar do editor (ribbon inclusive): nada de dialog nem dock.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('region', { name: /^relatório:/i })).not.toBeInTheDocument();

    await userEvent.setup().click(within(tela).getByRole('button', { name: /voltar ao editor/i }));
    expect(document.querySelector('[data-tela="quantitativos"]')).toBeNull();
    expect(screen.getByRole('button', { name: /^quantitativos$/i })).toHaveAttribute('aria-pressed', 'false');
    expect(cabecalhoDaSecao(/ambientes/i)).toHaveAttribute('aria-expanded', 'true');

    await userEvent.setup().click(screen.getByRole('button', { name: /^conflitos/i }));
    expect(screen.getByRole('dialog')).toHaveTextContent(/conflitos/i);
  });

  it('tipo × instância (E1.1): o pilar mostra o seletor, conta as peças iguais, aplica um tipo do catálogo num lote e abre o nome para salvar como tipo', async () => {
    listElementTypes.mockResolvedValue([
      { id: 'tp_1', organizationId: 'org_1', familia: 'ESTRUTURA', nome: 'P-30', active: true, createdAt: '', updatedAt: '',
        propriedades: { familia: 'ESTRUTURA', kind: 'PILAR', larguraMm: 300, profundidadeMm: 300, alturaMm: 2800, baseMm: 0, circular: false } },
    ]);
    const k = await import('../../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    loadBranchModel.mockResolvedValue(
      k.applyBatch(nivel.model, [
        { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [k.point(1000, 1000)], larguraMm: 200, profundidadeMm: 200, alturaMm: 2800 },
        { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [k.point(4000, 1000)], larguraMm: 200, profundidadeMm: 200, alturaMm: 2800 },
      ]).model,
    );
    await montar();
    const user = userEvent.setup();
    await abrirComponentes(user);
    await user.click(await screen.findByRole('button', { name: /^P1 · Pilar/ }));
    const seletor = await screen.findByTestId('seletor-de-tipo-estrutura');
    expect(seletor).toHaveTextContent(/Sem tipo salvo com estas propriedades · 2 peças iguais/);
    const select = (await within(seletor).findByLabelText(/Aplicar um tipo de estrutura salvo/)) as HTMLSelectElement;
    await waitFor(() => expect(select).toBeEnabled());
    await user.selectOptions(select, 'tp_1');
    // A peça virou 30×30 (o campo Largura mostra 30) e o seletor a reconhece como P-30, agora sozinha.
    expect(await screen.findByLabelText(/Largura da seção.*Agora: 30/)).toBeInTheDocument();
    expect(screen.getByTestId('seletor-de-tipo-estrutura')).toHaveTextContent(/Tipo P-30 · só esta peça/);
    // Salvar tipo: nome sugerido inline, Enter grava pelo serviço.
    await user.click(within(screen.getByTestId('seletor-de-tipo-estrutura')).getByRole('button', { name: /salvar tipo/i }));
    const nome = screen.getByLabelText(/Nome do tipo de estrutura/) as HTMLInputElement;
    expect(nome.value).toBe('Pilar 30×30 · 2,80 m');
    // A gravação passa por `resolveWriteOrg` (REGRA #5), que sem organização no
    // topo abre o modal de escolha — fora do alcance deste teste; o caminho de
    // gravar é o mesmo do tipo de parede, coberto em `PainelCamadasParede.test`.
    await user.keyboard('{Escape}');
    expect(screen.queryByLabelText(/Nome do tipo de estrutura/)).toBeNull();
    listElementTypes.mockResolvedValue([]);
  });

  it('parâmetros personalizados (E1.2): o pilar mostra os campos das definições da família, grava ao sair do campo (Desfazer acende) e a nova definição deriva a chave', async () => {
    listParameterDefinitions.mockResolvedValue([
      { id: 'pd_1', organizationId: 'org_1', chave: 'fck_mpa', nome: 'fck', familia: 'structural', tipo: 'NUMERO', unidade: 'MPa', opcoes: [], compartilhado: true, formula: '', active: true },
      { id: 'pd_2', organizationId: 'org_1', chave: 'fabricante', nome: 'Fabricante', familia: null, tipo: 'TEXTO', unidade: '', opcoes: [], compartilhado: true, formula: '', active: true },
      { id: 'pd_3', organizationId: 'org_1', chave: 'largura_folha', nome: 'Largura da folha', familia: 'opening', tipo: 'NUMERO', unidade: 'cm', opcoes: [], compartilhado: true, formula: '', active: true },
    ]);
    const k = await import('../../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    loadBranchModel.mockResolvedValue(
      k.applyCommand(nivel.model, { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [k.point(3000, 1500)], larguraMm: 200, profundidadeMm: 200, alturaMm: 2800 }).model,
    );
    await montar();
    const user = userEvent.setup();
    const barra = () => within(screen.getByRole('toolbar'));
    await abrirComponentes(user);
    await user.click(await screen.findByRole('button', { name: /^P1 · Pilar/ }));
    const painel = await screen.findByTestId('painel-parametros');
    // Da família + de todas; a de esquadria não.
    const fck = (await within(painel).findByLabelText('fck (MPa)')) as HTMLInputElement;
    expect(within(painel).getByLabelText('Fabricante')).toBeInTheDocument();
    expect(within(painel).queryByLabelText(/Largura da folha/)).toBeNull();
    expect(barra().getByRole('button', { name: /^desfazer/i })).toBeDisabled();
    await user.type(fck, '30');
    await user.tab();
    await waitFor(() => expect(barra().getByRole('button', { name: /^desfazer/i })).toBeEnabled());
    expect((within(screen.getByTestId('painel-parametros')).getByLabelText('fck (MPa)') as HTMLInputElement).value).toBe('30');
    // Nova definição: a chave é derivada do nome.
    await user.click(within(screen.getByTestId('painel-parametros')).getByRole('button', { name: /nova definição/i }));
    await user.type(screen.getByLabelText(/Nome da nova definição/), 'Índice de esbeltez (λ)');
    expect(screen.getByTestId('painel-parametros')).toHaveTextContent(/Chave de programa: indice_de_esbeltez/);
    await user.keyboard('{Escape}');
    listParameterDefinitions.mockResolvedValue([]);
  });

  it('fórmulas (E1.3): a definição com fórmula aparece calculada a partir da geometria e dos parâmetros; fórmula quebrada mostra o erro; a nova definição valida a sintaxe', async () => {
    listParameterDefinitions.mockResolvedValue([
      { id: 'pd_1', organizationId: 'org_1', chave: 'custo_m3', nome: 'Custo do concreto', familia: 'structural', tipo: 'NUMERO', unidade: 'R$/m³', opcoes: [], compartilhado: true, formula: '', active: true },
      { id: 'pd_2', organizationId: 'org_1', chave: 'custo', nome: 'Custo da peça', familia: 'structural', tipo: 'NUMERO', unidade: 'R$', opcoes: [], compartilhado: true, formula: 'arred(volume * custo_m3, 2)', active: true },
      { id: 'pd_3', organizationId: 'org_1', chave: 'quebrada', nome: 'Quebrada', familia: 'structural', tipo: 'NUMERO', unidade: '', opcoes: [], compartilhado: true, formula: 'volume / zero', active: true },
    ]);
    const k = await import('../../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    // Pilar 20×40×2,80 = 0,224 m³.
    const r = k.applyCommand(nivel.model, { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [k.point(3000, 1500)], larguraMm: 200, profundidadeMm: 400, alturaMm: 2800 });
    loadBranchModel.mockResolvedValue(
      k.applyCommand(r.model, { type: 'SetParametros', familia: 'structural', id: r.diff.created[0], valores: { custo_m3: 1000 } }).model,
    );
    await montar();
    const user = userEvent.setup();
    await abrirComponentes(user);
    await user.click(await screen.findByRole('button', { name: /^P1 · Pilar/ }));
    const painel = await screen.findByTestId('painel-parametros');
    const custo = await within(painel).findByTestId('parametro-calculado-custo');
    expect(custo).toHaveTextContent('224'); // 0,224 × 1000
    expect(custo).toHaveAttribute('title', '= arred(volume * custo_m3, 2)');
    expect(within(painel).getByTestId('parametro-calculado-quebrada')).toHaveTextContent(/Variável desconhecida "zero"/);
    // Nova definição com fórmula errada: o botão trava e o erro aponta a coluna.
    await user.click(within(painel).getByRole('button', { name: /nova definição/i }));
    await user.type(screen.getByLabelText(/Nome da nova definição/), 'Teste');
    await user.type(screen.getByLabelText(/Fórmula da nova definição/), 'volume * (2');
    expect(screen.getByTestId('painel-parametros')).toHaveTextContent(/Faltou "\)"/);
    expect(screen.getByRole('button', { name: /salvar definição/i })).toBeDisabled();
    await user.keyboard('{Escape}');
    listParameterDefinitions.mockResolvedValue([]);
  });

  it('eixos da malha (E1.4): a ferramenta Eixo está no grupo Estrutural e Pilares automáticos contam os cruzamentos', async () => {
    const k = await import('../../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    const m = k.applyBatch(nivel.model, [
      { type: 'AddWall', levelId: t, a: k.point(0, 0), b: k.point(6000, 0), thicknessMm: 150, heightMm: 2800 },
      { type: 'AddEixo', a: k.point(-500, 0), b: k.point(6500, 0) },
      { type: 'AddEixo', a: k.point(0, -500), b: k.point(0, 4500) },
      { type: 'AddEixo', a: k.point(6000, -500), b: k.point(6000, 4500) },
    ]).model;
    loadBranchModel.mockResolvedValue(m);
    await montar();
    const user = userEvent.setup();
    expect(botao(/^eixo$/i)).toBeInTheDocument();
    await user.click(botao(/^eixo$/i));
    expect(botao(/^eixo$/i)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('region', { name: /opções da ferramenta/i })).toHaveTextContent(/^Eixo da malha/);
    // Pilares automáticos: 2 cruzamentos (A×1, A×2 — os nós da parede coincidem com eles) + 1 intermediário
    // (a parede de 6 m passa do vão máximo de 5 m) → 3.
    expect(botao(/^pilares automáticos/i)).toHaveTextContent('3');
    // O painel do eixo selecionado (nome, cruzamentos, Excluir) nasce do clique
    // na linha do canvas — sem geometria em jsdom; é provado no app real.
  });

  it('restrições (E1.4b): a parede declara "sobre o eixo", a violação aparece com o desvio e conta no botão Restrições, Ajustar corrige e Remover apaga', async () => {
    const k = await import('../../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    const m = k.applyBatch(nivel.model, [
      { type: 'AddWall', levelId: t, a: k.point(0, 300), b: k.point(6000, 300), thicknessMm: 150, heightMm: 2800 },
      { type: 'AddEixo', a: k.point(-500, 0), b: k.point(6500, 0), nome: 'A' },
    ]).model;
    loadBranchModel.mockResolvedValue(m);
    await montar();
    const user = userEvent.setup();
    await abrirComponentes(user);
    await user.click(await screen.findByRole('button', { name: /^Parede 1/ }));
    const bloco = await screen.findByTestId('painel-restricoes-peca');
    expect(bloco).toHaveTextContent(/Restrições/);
    // Tipo padrão "Sobre o eixo"; a referência lista o eixo A.
    await user.selectOptions(within(bloco).getByLabelText(/Referência da nova restrição/), 'eixo:' + m.eixos[0].id);
    await user.click(within(bloco).getByRole('button', { name: /adicionar restrição/i }));
    // Violada: está a 300 mm do eixo.
    const linha = await within(screen.getByTestId('painel-restricoes-peca')).findByText(/está a 300 mm do eixo A/);
    expect(linha).toBeInTheDocument();
    await abrirAba(/^analisar$/i);
    expect(botao(/^restrições/i)).toHaveTextContent('1');
    // Ajustar: a parede vai para o eixo e a violação some do botão.
    await user.click(within(screen.getByTestId('painel-restricoes-peca')).getByRole('button', { name: /^ajustar$/i }));
    await waitFor(() => expect(botao(/^restrições/i)).not.toHaveTextContent('1'));
    expect(screen.getByTestId('painel-restricoes-peca')).toHaveTextContent(/sobre o eixo A/);
    // Remover apaga a restrição.
    await user.click(within(screen.getByTestId('painel-restricoes-peca')).getByRole('button', { name: /remover restrição/i }));
    expect(screen.getByTestId('painel-restricoes-peca')).not.toHaveTextContent(/sobre o eixo A/);
  });

  it('ficha do elemento (E1.5): recolhida sob o painel do pilar, expande com geometria, tipo e o parâmetro calculado; a escada ganha o seletor de tipo', async () => {
    listParameterDefinitions.mockResolvedValue([
      { id: 'pd_1', organizationId: 'org_1', chave: 'custo_m3', nome: 'Custo do concreto', familia: 'structural', tipo: 'NUMERO', unidade: 'R$/m³', opcoes: [], compartilhado: true, formula: '', active: true },
      { id: 'pd_2', organizationId: 'org_1', chave: 'custo', nome: 'Custo da peça', familia: 'structural', tipo: 'NUMERO', unidade: 'R$', opcoes: [], compartilhado: true, formula: 'arred(volume * custo_m3, 2)', active: true },
    ]);
    const k = await import('../../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    const r = k.applyBatch(nivel.model, [
      { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [k.point(3000, 1500)], larguraMm: 200, profundidadeMm: 400, alturaMm: 2800 },
      { type: 'AddEscada', levelId: t, pontos: [k.point(6000, 0), k.point(9000, 0)], larguraMm: 1200 },
    ]);
    loadBranchModel.mockResolvedValue(k.applyCommand(r.model, { type: 'SetParametros', familia: 'structural', id: r.model.structures[0].id, valores: { custo_m3: 1000 } }).model);
    await montar();
    const user = userEvent.setup();
    await abrirComponentes(user);
    await user.click(await screen.findByRole('button', { name: /^P1 · Pilar/ }));
    const ficha = await screen.findByTestId('ficha-do-elemento');
    expect(ficha).toHaveTextContent(/Ficha · Pilar C-/); // sem rótulo declarado, vale o identificador
    expect(within(ficha).getByRole('button', { name: /copiar ficha/i })).toBeInTheDocument();
    await user.click(within(ficha).getByRole('button', { name: /^Ficha · Pilar/ }));
    expect(ficha).toHaveTextContent(/Geometria/);
    expect(ficha).toHaveTextContent(/Pilar 20×40 · 2,80 m/);
    expect(ficha).toHaveTextContent(/Peças iguais no desenho/);
    await waitFor(() => expect(ficha).toHaveTextContent(/Custo da peça \(R\$\)/));
    expect(ficha).toHaveTextContent(/224/); // 0,224 m³ × 1000
    // Escada: o seletor de tipo (E1.5 estende E1.1).
    await user.click(await screen.findByRole('button', { name: /^Escada 1/ }));
    expect(await screen.findByTestId('seletor-de-tipo-escada')).toHaveTextContent(/só esta peça/);
    listParameterDefinitions.mockResolvedValue([]);
  });

  it('pavimento tipo (E2.1): "Repetir" cria cópias vivas com as paredes, a lista diz "cópia de", a faixa aparece no andar e "desvincular" a remove', async () => {
    const k = await import('../../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    loadBranchModel.mockResolvedValue(
      k.applyBatch(nivel.model, [
        { type: 'AddWall', levelId: t, a: k.point(0, 0), b: k.point(6000, 0), thicknessMm: 150, heightMm: 2800 },
        { type: 'AddWall', levelId: t, a: k.point(6000, 0), b: k.point(6000, 4000), thicknessMm: 150, heightMm: 2800 },
      ]).model,
    );
    await montar();
    const user = userEvent.setup();
    // Menu de ações do Térreo → Repetir como pavimento tipo… → 2 cópias.
    // `findBy`: o modelo do mock chega depois da toolbar; no CI (mais lento)
    // o `getBy` síncrono via "Pavimentos 0" e não achava o menu.
    await user.click(await screen.findByRole('button', { name: 'Ações de Térreo' }));
    await user.click(screen.getByRole('menuitem', { name: /repetir como pavimento tipo/i }));
    const quantas = screen.getByLabelText('Quantas cópias de Térreo') as HTMLInputElement;
    await user.clear(quantas);
    await user.type(quantas, '2');
    await user.click(screen.getByRole('button', { name: /^repetir$/i }));
    expect(await screen.findByRole('radio', { name: 'Editar Térreo 1' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Editar Térreo 2' })).toBeInTheDocument();
    expect(screen.getAllByText(/cópia de/)).toHaveLength(2);
    expect(screen.getByText(/pavimento tipo de 2 pavimento/)).toBeInTheDocument();
    // A cópia tem as 2 paredes; a faixa aparece ao ativá-la; "desvincular" a tira.
    await user.click(screen.getByRole('radio', { name: 'Editar Térreo 1' }));
    const faixa = await screen.findByTestId('faixa-pavimento-vinculado');
    expect(faixa).toHaveTextContent(/Térreo 1.*cópia viva do pavimento tipo.*Térreo/);
    expect(screen.getByText(/Térreo 1/, { selector: 'p' }).parentElement).toHaveTextContent(/2 parede\(s\)/);
    await user.click(within(faixa).getByRole('button', { name: /^desvincular$/i }));
    expect(screen.queryByTestId('faixa-pavimento-vinculado')).toBeNull();
    expect(screen.getAllByText(/cópia de/)).toHaveLength(1);
  });

  it('clash arquitetônico (E0.4): pilar no vão da porta entra em Conflitos, conta no botão e o clique seleciona a porta', async () => {
    const k = await import('../../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    const r = k.applyCommand(nivel.model, { type: 'AddWall', levelId: t, a: k.point(0, 0), b: k.point(6000, 0), thicknessMm: 150, heightMm: 2800 });
    const wallId = r.diff.created[0];
    loadBranchModel.mockResolvedValue(
      k.applyBatch(r.model, [
        { type: 'AddOpening', wallId, kind: 'door', offsetMm: 1000, widthMm: 900, heightMm: 2100, sillMm: 0 },
        { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [k.point(1800, 0)], larguraMm: 200, profundidadeMm: 200, alturaMm: 2800 },
      ]).model,
    );
    await montar();
    await abrirAba(/^analisar$/i);
    const conflitos = screen.getByRole('button', { name: /^conflitos/i });
    expect(conflitos).toHaveTextContent('1');
    await userEvent.setup().click(conflitos);
    const dialog = screen.getByRole('dialog');
    const linha = within(dialog).getByRole('button', { name: /Porta V-.* encontra (P1|C-)/ });
    expect(linha).toHaveTextContent(/200 mm do vão tomados/);
    await userEvent.setup().click(linha);
    // A porta fica selecionada (o painel de propriedades passa a falar dela).
    expect(await screen.findByText(/abertura selecionada/i)).toBeInTheDocument();
  });

  it('com estrutura, a aba Por peça lista a peça com fórmula e o clique seleciona no desenho', async () => {
    const k = await import('../../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    loadBranchModel.mockResolvedValue(
      k.applyBatch(nivel.model, [
        { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [k.point(3000, 1500)], larguraMm: 200, profundidadeMm: 200, alturaMm: 2800, rotulo: 'P1' },
      ]).model,
    );
    await montar();
    const user = userEvent.setup();
    const tela = await abrirTelaDeQuantitativos();
    // Resumo: concreto dos pilares.
    expect(within(tela).getByText(/Concreto — pilares/)).toBeInTheDocument();
    await user.click(within(tela).getByRole('tab', { name: /^Por peça estrutural/ }));
    const linha = within(tela).getAllByRole('row').find((r) => /P1/.test(r.textContent ?? ''))!;
    expect(linha).toHaveTextContent(/Pilar/);
    expect(linha).toHaveTextContent(/0[,.]112/); // 0,2 × 0,2 × 2,8 m³
    await user.click(linha);
    // Volta ao editor com a peça selecionada (as propriedades abrem em Sheet).
    expect(document.querySelector('[data-tela="quantitativos"]')).toBeNull();
    expect(await screen.findByTestId('propriedades-sheet')).toHaveTextContent(/P1/);
  });

  it('unidades (E2.2): criar pelo número na tela, compor pelo cartão do ambiente, privativa e fração ideal na tabela, "Un." no rótulo', async () => {
    const k = await import('../../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    // Dois cômodos 4 × 3 de eixo lado a lado (externas 200, meio 150), etiquetados.
    let m = k.applyBatch(nivel.model, [
      { type: 'AddWall', levelId: t, a: k.point(0, 0), b: k.point(8000, 0), thicknessMm: 200, heightMm: 2800 },
      { type: 'AddWall', levelId: t, a: k.point(8000, 0), b: k.point(8000, 3000), thicknessMm: 200, heightMm: 2800 },
      { type: 'AddWall', levelId: t, a: k.point(8000, 3000), b: k.point(0, 3000), thicknessMm: 200, heightMm: 2800 },
      { type: 'AddWall', levelId: t, a: k.point(0, 3000), b: k.point(0, 0), thicknessMm: 200, heightMm: 2800 },
      { type: 'AddWall', levelId: t, a: k.point(4000, 0), b: k.point(4000, 3000), thicknessMm: 150, heightMm: 2800 },
    ]).model;
    const esq = m.spaces.find((s) => s.ring.some((p) => p.x === 0))!.id;
    const dir = m.spaces.find((s) => s.ring.some((p) => p.x === 8000))!.id;
    m = k.applyBatch(m, [
      { type: 'NameSpace', spaceId: esq, name: 'Sala A' },
      { type: 'NameSpace', spaceId: dir, name: 'Sala B' },
    ]).model;
    loadBranchModel.mockResolvedValue(m);
    await montar();
    const user = userEvent.setup();
    // Tela: Analisar › Unidades; cria "101" e "102".
    await abrirAba(/^analisar$/i);
    await user.click(screen.getByRole('button', { name: /^unidades$/i }));
    const tela = (await screen.findByRole('heading', { level: 1, name: /^unidades$/i })).closest('[data-tela="unidades"]') as HTMLElement;
    const numero = within(tela).getByLabelText('Número da nova unidade');
    await user.type(numero, '101{Enter}');
    await user.type(numero, '102{Enter}');
    expect(within(tela).getByLabelText('Número da unidade 101')).toBeInTheDocument();
    expect(within(tela).getAllByText(/^sem ambientes —/)).toHaveLength(2);
    // Número repetido: o kernel recusa e a tela mostra.
    await user.type(numero, '101{Enter}');
    expect(within(tela).getByRole('alert')).toHaveTextContent(/Já existe a unidade "101"/);
    // Volta ao editor e compõe pelo cartão do ambiente.
    await user.click(within(tela).getByRole('button', { name: /^voltar ao editor$/i }));
    const selA = screen.getByLabelText('Unidade do ambiente Sala A');
    await user.selectOptions(selA, within(selA).getByRole('option', { name: 'Un. 101' }));
    const selB = screen.getByLabelText('Unidade do ambiente Sala B');
    await user.selectOptions(selB, within(selB).getByRole('option', { name: 'Un. 102' }));
    expect((screen.getByLabelText('Unidade do ambiente Sala A') as HTMLSelectElement).value).not.toBe('');
    // Tabela: privativa = 12 m² de eixo + externas (4 + 3 + 4 m) × 0,1 = 13,10; fração 500 ‰ cada; geminadas entre si.
    await abrirAba(/^analisar$/i);
    // O botão do ribbon conta as unidades.
    expect(screen.getByRole('button', { name: /^unidades/i })).toHaveTextContent('2');
    await user.click(screen.getByRole('button', { name: /^unidades/i }));
    const tela2 = (await screen.findByRole('heading', { level: 1, name: /^unidades$/i })).closest('[data-tela="unidades"]') as HTMLElement;
    const linhas = within(tela2).getAllByRole('row').map((r) => (r.textContent ?? '').replace(/\s+/g, ' '));
    expect(linhas.some((l) => /Sala A.*13,10.*500,000 ‰.*102/.test(l))).toBe(true);
    expect(linhas.some((l) => /Sala B.*13,10.*500,000 ‰.*101/.test(l))).toBe(true);
    expect(linhas.some((l) => /Térreo.*2.*26,20/.test(l))).toBe(true);
  });

  it('grupo com origem (E2.3): "Repetir" a unidade espelhada cria a 102 com paredes copiadas; a gaveta Grupo mostra a instância, remove e desagrupa', async () => {
    const k = await import('../../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    let m = k.applyBatch(nivel.model, [
      { type: 'AddWall', levelId: t, a: k.point(0, 0), b: k.point(6000, 0), thicknessMm: 150, heightMm: 2800 },
      { type: 'AddWall', levelId: t, a: k.point(6000, 0), b: k.point(6000, 4000), thicknessMm: 150, heightMm: 2800 },
      { type: 'AddWall', levelId: t, a: k.point(6000, 4000), b: k.point(0, 4000), thicknessMm: 150, heightMm: 2800 },
      { type: 'AddWall', levelId: t, a: k.point(0, 4000), b: k.point(0, 0), thicknessMm: 150, heightMm: 2800 },
    ]).model;
    m = k.applyCommand(m, { type: 'NameSpace', spaceId: m.spaces[0].id, name: 'Sala' }).model;
    m = k.applyCommand(m, { type: 'AddUnidade', numero: '101', labelIds: [m.labels[0].id] }).model;
    loadBranchModel.mockResolvedValue(m);
    await montar();
    const user = userEvent.setup();
    await abrirAba(/^analisar$/i);
    await user.click(screen.getByRole('button', { name: /^unidades/i }));
    const tela = (await screen.findByRole('heading', { level: 1, name: /^unidades$/i })).closest('[data-tela="unidades"]') as HTMLElement;
    await user.click(within(tela).getByRole('button', { name: 'Repetir a unidade 101' }));
    const painel = within(tela).getByTestId('repetir-unidade');
    expect((within(painel).getByLabelText('Número da unidade copiada') as HTMLInputElement).value).toBe('102');
    expect(within(painel).getByRole('button', { name: 'Espelhada à direita' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(painel).getByRole('button', { name: /^repetir$/i }));
    // A 102 existe, com a Sala copiada, mesma privativa e geminada com a 101.
    const linhas = () => within(tela).getAllByRole('row').map((r) => (r.textContent ?? '').replace(/\s+/g, ' '));
    expect(within(tela).getByLabelText('Número da unidade 102')).toBeInTheDocument();
    expect(linhas().filter((l) => /Sala.*25,20.*500,000 ‰/.test(l))).toHaveLength(2); // as duas, geminadas entre si
    expect(linhas().some((l) => /Sala.*500,000 ‰.*—101/.test(l))).toBe(true);
    expect(linhas().some((l) => /Térreo.*2/.test(l))).toBe(true);
    // Gaveta Grupo: selecionar a origem lista o grupo "Unidade 101" com 1 instância; remover a instância tira a cópia; desagrupar.
    await user.click(within(tela).getByRole('button', { name: /^voltar ao editor$/i }));
    await abrirAba(/^vista$/i);
    await user.click(screen.getByRole('button', { name: /^grupo com origem/i }));
    const gaveta = await screen.findByTestId('tarefa-grupo');
    expect(gaveta).toHaveTextContent(/Unidade 101.*3 parede\(s\).*1 instância\(s\)/);
    await user.click(within(gaveta).getByRole('button', { name: /selecionar a origem/i }));
    expect(within(gaveta).getByText(/espelho X · Térreo/)).toBeInTheDocument();
    await user.click(within(gaveta).getByRole('button', { name: 'Remover a instância 1' }));
    expect(within(gaveta).getByText(/Sem instâncias ainda/)).toBeInTheDocument();
    await user.click(within(gaveta).getByRole('button', { name: /^desagrupar/i }));
    expect(within(gaveta).getByText(/Agrupar a seleção/)).toBeInTheDocument();
  });

  it('núcleo vertical (E2.4): o elevador aparece no navegador, o painel aplica a ficha e muda a chegada; o menu oferece Shaft/Elevador; a escada ganha "Até"', async () => {
    const k = await import('../../utils/blueprintKernel');
    let m = k.applyBatch(k.emptyModel(), [
      { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 },
      { type: 'AddLevel', name: '1º', elevationMm: 2800, defaultHeightMm: 2800 },
      { type: 'AddLevel', name: '2º', elevationMm: 5600, defaultHeightMm: 2800 },
    ]).model;
    const [t, , p2] = m.levels.map((l) => l.id);
    m = k.applyBatch(m, [
      { type: 'AddNucleo', levelId: t, tipo: 'ELEVADOR', ring: [k.point(1000, 1000), k.point(2800, 1000), k.point(2800, 3100), k.point(1000, 3100)], rotulo: 'E1' },
      { type: 'AddEscada', levelId: t, pontos: [k.point(6000, 0), k.point(9000, 0)], larguraMm: 1200 },
    ]).model;
    loadBranchModel.mockResolvedValue(m);
    await montar();
    const user = userEvent.setup();
    await abrirComponentes(user);
    const linha = await screen.findByRole('button', { name: /^E1/ });
    expect(linha).toHaveTextContent(/1,80 × 2,10 m/);
    expect(linha).toHaveTextContent(/3 pavimento\(s\) · Térreo → 2º/);
    await user.click(linha);
    const painel = await screen.findByTestId('painel-nucleo');
    expect(painel).toHaveTextContent(/Elevador E1/);
    expect(painel).toHaveTextContent(/3 pavimento\(s\) · 8,40 m/);
    // Ficha de 8 passageiros: capacidade, poço e casa de máquinas entram na peça.
    await user.selectOptions(within(painel).getByLabelText('Aplicar ficha do elevador por capacidade'), '8');
    expect((within(painel).getByLabelText('Capacidade do elevador (passageiros)') as HTMLInputElement).value).toBe('8');
    expect((within(painel).getByLabelText('Profundidade do poço (mm)') as HTMLInputElement).value).toBe('1500');
    expect(painel).toHaveTextContent(/Ficha de 8 passageiros/);
    expect(painel).toHaveTextContent(/12,50 m com poço e casa de máquinas/);
    // Chegada no 1º: 2 pavimentos.
    await user.selectOptions(within(painel).getByLabelText('Pavimento de chegada do núcleo vertical'), m.levels[1].id);
    expect(painel).toHaveTextContent(/2 pavimento\(s\) · 5,60 m/);
    // A escada ganhou "Até": escolher o 2º dobra o desnível.
    await user.click(await screen.findByRole('button', { name: /^Escada 1/ }));
    const ate = await screen.findByLabelText('Pavimento de chegada da escada (vazio = o próximo acima)');
    await user.selectOptions(ate, p2);
    expect(screen.getByRole('button', { name: /^Escada 1/ })).toHaveTextContent(/vence 5,60 m até 2º/);
    // O menu de componentes oferece Shaft e Elevador (Circulação), e o botão passa a dizer o ativo.
    await escolherComponente(/^Shaft$/);
    expect(botaoComponentes()).toHaveTextContent('Shaft');
  });

  it('vagas (E2.5): Terreno › Vagas planeja 7 na garagem (1 PCD, 1 idoso), lança sugeridas, aceita; o painel da vaga troca o tipo; o menu oferece Vaga', async () => {
    const k = await import('../../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Subsolo', elevationMm: -2800, defaultHeightMm: 2600 });
    const t = nivel.model.levels[0].id;
    let m = k.applyBatch(nivel.model, [
      { type: 'AddWall', levelId: t, a: k.point(0, 0), b: k.point(20000, 0), thicknessMm: 200, heightMm: 2600 },
      { type: 'AddWall', levelId: t, a: k.point(20000, 0), b: k.point(20000, 15000), thicknessMm: 200, heightMm: 2600 },
      { type: 'AddWall', levelId: t, a: k.point(20000, 15000), b: k.point(0, 15000), thicknessMm: 200, heightMm: 2600 },
      { type: 'AddWall', levelId: t, a: k.point(0, 15000), b: k.point(0, 0), thicknessMm: 200, heightMm: 2600 },
    ]).model;
    m = k.applyCommand(m, { type: 'NameSpace', spaceId: m.spaces[0].id, name: 'Garagem' }).model;
    loadBranchModel.mockResolvedValue(m);
    await montar();
    const user = userEvent.setup();
    await abrirAba(/^terreno$/i);
    await user.click(screen.getByRole('button', { name: /^vagas$/i }));
    const gaveta = await screen.findByTestId('tarefa-vagas');
    const plano = within(gaveta).getByTestId('plano-de-vagas');
    expect(plano).toHaveTextContent(/Em "Garagem": 7 vaga\(s\) a lançar/);
    expect(plano).toHaveTextContent(/PCD: 1 de 1 mínimas/);
    expect(plano).toHaveTextContent(/Idoso: 1 de 1 mínimas/);
    expect(plano).toHaveTextContent(/Sem exigência declarada/);
    // Exigência manual de 12: faltam 5.
    await user.clear(within(gaveta).getByLabelText('Exigência de vagas (número)'));
    await user.type(within(gaveta).getByLabelText('Exigência de vagas (número)'), '12');
    expect(plano).toHaveTextContent(/Faltam 5 para a exigência de 12/);
    await user.click(within(gaveta).getByRole('button', { name: /^lançar$/i }));
    expect(await within(gaveta).findByText(/7 vaga\(s\) lançada\(s\) como sugeridas/)).toBeInTheDocument();
    const botaoVagas = () => screen.getAllByRole('button', { name: /^vagas/i }).find((b) => b.getAttribute('title')?.startsWith('Lança'))!;
    expect(botaoVagas()).toHaveTextContent('7');
    // Relançar substitui; aceitar confirma e zera a contagem de sugeridas.
    expect(within(gaveta).getByRole('button', { name: /^relançar$/i })).toBeInTheDocument();
    await user.click(within(gaveta).getByRole('button', { name: /^aceitar 7 sugerida/i }));
    expect(botaoVagas()).not.toHaveTextContent('7');
    expect(plano).toHaveTextContent(/PCD: 1 de 1 mínimas/);
    // Painel da vaga: fecha a gaveta, seleciona a 1 pelo navegador, troca para moto → 1,00 × 2,00.
    await user.click(botaoVagas());
    await abrirComponentes(user);
    const linhaVaga1 = screen.getAllByRole('button').find((b) => /^Vaga 1 · PCD/.test(b.textContent ?? ''))!;
    expect(linhaVaga1).toBeTruthy();
    await user.click(linhaVaga1);
    const painel = await screen.findByTestId('painel-vaga');
    expect(painel).toHaveTextContent(/Vaga 1 · PCD/);
    expect(painel).toHaveTextContent(/3,70 × 5,00 m/);
    await user.selectOptions(within(painel).getByLabelText('Tipo da vaga'), 'MOTO');
    expect(painel).toHaveTextContent(/1,00 × 2,00 m/);
    // O menu oferece a vaga avulsa (aba Arquitetura).
    await abrirAba(/^arquitetura$/i);
    await escolherComponente(/^Vaga PCD$/);
    expect(botaoComponentes()).toHaveTextContent('Vaga PCD');
  });

  it('vocabulário e restrição (E3.1): a APP nos fundos reduz a área construtível; testada mínima digitada é conferida; a ferramenta Divisa oferece a faixa restrita', async () => {
    const k = await import('../../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    const d = (ax: number, ay: number, bx: number, by: number, papel: 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA') =>
      ({ type: 'AddBoundary', levelId: t, a: k.point(ax, ay), b: k.point(bx, by), kind: 'TERRENO', papel }) as const;
    loadBranchModel.mockResolvedValue(
      k.applyBatch(nivel.model, [
        d(0, 0, 20000, 0, 'FRENTE'),
        d(20000, 0, 20000, 30000, 'LATERAL_DIREITA'),
        d(20000, 30000, 0, 30000, 'FUNDOS'),
        d(0, 30000, 0, 0, 'LATERAL_ESQUERDA'),
        { type: 'AddBoundary', levelId: t, a: k.point(20000, 30000), b: k.point(0, 30000), kind: 'RESTRICAO', restricao: { tipo: 'APP', faixaMm: 10000 } },
      ]).model,
    );
    await montar();
    const user = userEvent.setup();
    await abrirAba(/^terreno$/i);
    await user.click(botao(/^dados do lote$/i));
    const drawer = (await screen.findAllByRole('dialog')).find((d) => /dados do lote/i.test(d.textContent ?? ''))!;
    // Lote 600 m²; sem recuos o envelope seria o lote — a APP de 10 m nos fundos deixa 400 m².
    expect(drawer).toHaveTextContent(/600,00 m²/);
    expect(drawer).toHaveTextContent(/Área construtível 400,00 m²/);
    // Vocabulário: testada mínima 25 m → o lote de 20 m de frente é acusado.
    const testada = within(drawer).getByLabelText('Testada mínima do lote (m)');
    await user.type(testada, '25');
    await user.tab();
    const conferencia = await within(drawer).findByTestId('conferencia-do-lote');
    expect(conferencia).toHaveTextContent(/Testada 20,00 m < mínima 25,00 m/);
    // Afastamento progressivo (h − 6)/10 acima de 6 m: a casa tem 2,80 m — não se aplica ainda.
    await user.type(within(drawer).getByLabelText('Fórmula do afastamento progressivo em h (metros)'), '(h - 6) / 10');
    await user.tab();
    expect(within(drawer).queryByText(/Afastamento progressivo em vigor/)).toBeNull();
    // A ferramenta Divisa oferece "Faixa restrita do lote" com o tipo e a faixa padrão.
    await user.click(botao(/^divisa$/i));
    const oQue = screen.getByLabelText('O que a ferramenta Divisa desenha');
    await user.selectOptions(oQue, 'RESTRICAO');
    expect(screen.getByLabelText('Tipo da faixa restrita a desenhar')).toHaveTextContent(/APP \(Código Florestal\) · 30 m/);
  });

  it('legislação (E3.2): a tela lista violadas/conformes/não avaliadas por fonte, filtra, o clique leva ao ambiente; a aba Regras mostra a semente e valida a regra nova', async () => {
    const k = await import('../../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2600 });
    const t = nivel.model.levels[0].id;
    const w = (ax: number, ay: number, bx: number, by: number) => ({ type: 'AddWall', levelId: t, a: k.point(ax, ay), b: k.point(bx, by), thicknessMm: 150, heightMm: 2600 }) as const;
    let m = k.applyBatch(nivel.model, [w(0, 0, 4150, 0), w(4150, 0, 4150, 4150), w(4150, 4150, 0, 4150), w(0, 4150, 0, 0), w(4150, 0, 5400, 0), w(5400, 0, 5400, 2400), w(5400, 2400, 4150, 2400)]).model;
    const sala = m.spaces.find((s) => s.areaMm2 > 10_000_000)!;
    const banho = m.spaces.find((s) => s.areaMm2 < 10_000_000)!;
    const divisa = m.walls.find((x) => x.a.x === 4150 && x.b.x === 4150)!;
    m = k.applyBatch(m, [
      { type: 'NameSpace', spaceId: sala.id, name: 'Sala', tipoDeAmbiente: 'SALA_DORMITORIO' },
      { type: 'NameSpace', spaceId: banho.id, name: 'Banho', tipoDeAmbiente: 'BANHEIRO' },
      { type: 'AddOpening', wallId: divisa.id, kind: 'door', offsetMm: 500, widthMm: 700, heightMm: 2100, sillMm: 0 },
    ]).model;
    loadBranchModel.mockResolvedValue(m);
    await montar();
    const user = userEvent.setup();
    await abrirAba(/^analisar$/i);
    const botaoLegislacao = () => screen.getAllByRole('button', { name: /^legislação/i }).find((b) => b.getAttribute('title')?.startsWith('Verificar'))!;
    expect(botaoLegislacao()).toHaveTextContent(/\d/); // há erros
    await user.click(botaoLegislacao());
    const tela = (await screen.findByRole('heading', { level: 1, name: /verificar legislação/i })).closest('[data-tela="legislacao"]') as HTMLElement;
    const resumo = within(tela).getByTestId('resumo-legislacao');
    expect(resumo).toHaveTextContent(/\d+ violada\(s\)/);
    expect(resumo).toHaveTextContent(/\d+ não avaliada\(s\)/);
    // Filtra as violadas: banheiro estreito, porta de 0,70, NBR 5410 sem tomadas.
    await user.selectOptions(within(tela).getByLabelText('Filtrar por estado'), 'VIOLADA');
    const linhas = () => within(tela).getAllByRole('row').map((r) => (r.textContent ?? '').replace(/\s+/g, ' '));
    expect(linhas().some((l) => /Banheiro: largura mínima.*Banho.*largura_min = 1,1/.test(l))).toBe(true);
    expect(linhas().some((l) => /Porta: vão livre mínimo.*Porta 0,70 m/.test(l))).toBe(true);
    expect(linhas().some((l) => /NBR 5410.*Tomadas mínimas.*Sala/.test(l))).toBe(true);
    expect(linhas().every((l) => !/Conforme/.test(l) || /Conforme se/.test(l))).toBe(true);
    // Fonte: só a NBR 9050.
    await user.selectOptions(within(tela).getByLabelText('Filtrar por fonte'), 'NBR 9050:2020');
    expect(linhas().filter((l) => /NBR 9050/.test(l))).toHaveLength(1);
    // O clique na linha da porta leva ao elemento: a tela fecha e a porta fica selecionada.
    await user.click(within(tela).getByText(/^Porta 0,70 m$/));
    expect(screen.queryByRole('heading', { level: 1, name: /verificar legislação/i })).toBeNull();
    expect(await screen.findByText(/^Abertura selecionada$/i)).toBeInTheDocument();
    // Aba Regras: a semente está lá; a regra nova é validada antes de salvar.
    await user.click(botaoLegislacao());
    const tela2 = (await screen.findByRole('heading', { level: 1, name: /verificar legislação/i })).closest('[data-tela="legislacao"]') as HTMLElement;
    await user.click(within(tela2).getByRole('tab', { name: /^Regras/ }));
    expect(within(tela2).getAllByText(/Código de obras genérico \(semente\)/).length).toBeGreaterThan(5);
    const nova = within(tela2).getByTestId('nova-regra');
    await user.type(within(nova).getByLabelText('Nome da regra'), 'Dormitório 9 m²');
    await user.type(within(nova).getByLabelText('Expressão da regra'), 'largura >= 9');
    expect(nova).toHaveTextContent(/variável "largura" não existe no escopo Ambiente/);
    expect(within(nova).getByRole('button', { name: /adicionar regra/i })).toBeDisabled();
  });

  it('envelope 3D (E3.3): Dados do lote mostra o envelope por pavimento com "cabe?"; a Legislação acusa o pavimento fora do envelope; o menu 3D tem o toggle', async () => {
    const k = await import('../../utils/blueprintKernel');
    let m = k.applyBatch(k.emptyModel(), [
      { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 },
      { type: 'AddLevel', name: '1º', elevationMm: 3000, defaultHeightMm: 3000 },
    ]).model;
    const t = m.levels[0].id;
    const d = (ax: number, ay: number, bx: number, by: number, papel: 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA') =>
      ({ type: 'AddBoundary', levelId: t, a: k.point(ax, ay), b: k.point(bx, by), kind: 'TERRENO', papel }) as const;
    m = k.applyBatch(m, [d(0, 0, 20000, 0, 'FRENTE'), d(20000, 0, 20000, 30000, 'LATERAL_DIREITA'), d(20000, 30000, 0, 30000, 'FUNDOS'), d(0, 30000, 0, 0, 'LATERAL_ESQUERDA')]).model;
    // Uma APP de 10 m nos fundos: o envelope vai só até y = 20000. O térreo desenhado passa (até y = 24000).
    m = k.applyCommand(m, { type: 'AddBoundary', levelId: t, a: k.point(20000, 30000), b: k.point(0, 30000), kind: 'RESTRICAO', restricao: { tipo: 'APP', faixaMm: 10000 } }).model;
    const w = (ax: number, ay: number, bx: number, by: number) => ({ type: 'AddWall', levelId: t, a: k.point(ax, ay), b: k.point(bx, by), thicknessMm: 200, heightMm: 3000 }) as const;
    m = k.applyBatch(m, [w(4000, 4000, 16000, 4000), w(16000, 4000, 16000, 24000), w(16000, 24000, 4000, 24000), w(4000, 24000, 4000, 4000)]).model;
    loadBranchModel.mockResolvedValue(m);
    await montar();
    const user = userEvent.setup();
    await abrirAba(/^terreno$/i);
    await user.click(botao(/^dados do lote$/i));
    const drawer = (await screen.findAllByRole('dialog')).find((x) => /dados do lote/i.test(x.textContent ?? ''))!;
    const tabela = await within(drawer).findByTestId('envelope-por-pavimento');
    expect(tabela).toHaveTextContent(/máx. 800,00 m² e 2\.400 m³ dentro do gabarito/); // 2 × (20 × 20 m) × 3 m
    const linhas = within(tabela).getAllByRole('row').map((r) => (r.textContent ?? '').replace(/\s+/g, ' '));
    expect(linhas.some((l) => /Térreo.*400,00 m².*246,44 m².*48,00 m² fora/.test(l))).toBe(true); // 12,2 × 20,2 construídos; 12 × 4 m de eixo fora
    expect(linhas.some((l) => /1º.*400,00 m².*—.*vazio/.test(l))).toBe(true);
    await user.click(within(drawer).getByRole('button', { name: /^fechar$/i }));
    // Legislação: "Pavimento dentro do envelope edificável" violada no térreo.
    await abrirAba(/^analisar$/i);
    await user.click(screen.getAllByRole('button', { name: /^legislação/i }).find((b) => b.getAttribute('title')?.startsWith('Verificar'))!);
    const tela = (await screen.findByRole('heading', { level: 1, name: /verificar legislação/i })).closest('[data-tela="legislacao"]') as HTMLElement;
    await user.selectOptions(within(tela).getByLabelText('Filtrar por estado'), 'VIOLADA');
    const rows = within(tela).getAllByRole('row').map((r) => (r.textContent ?? '').replace(/\s+/g, ' '));
    expect(rows.some((l) => /Pavimento dentro do envelope edificável.*Térreo.*cabe_no_envelope = não/.test(l))).toBe(true);
    expect(rows.some((l) => /Pavimento dentro do envelope edificável.*1º/.test(l))).toBe(false);
    await user.click(within(tela).getByRole('button', { name: /^voltar ao editor$/i }));
    // O menu 3D oferece o envelope (ligado por padrão).
    await abrirAba(/^vista$/i);
    await user.click(screen.getByRole('button', { name: /^vista: 3d$/i }));
    await user.click(screen.getAllByRole('button', { name: /exibir/i })[0]);
    expect(await screen.findByRole('menuitemcheckbox', { name: /envelope edificável/i })).toHaveAttribute('aria-checked', 'true');
  });

  it('programa (E4.1): a tela abre vazia, a semente 2Q povoa itens e matriz, a célula editada grava com respiro, a matriz troca a relação e o item removido leva as relações', async () => {
    await montar();
    const user = userEvent.setup();
    await abrirAba(/^analisar$/i);
    const botaoPrograma = () => screen.getAllByRole('button', { name: /^programa/i }).find((b) => b.getAttribute('title')?.startsWith('Programa de necessidades'))!;
    expect(botaoPrograma()).not.toHaveTextContent(/\d/);
    await user.click(botaoPrograma());
    const tela = (await screen.findByRole('heading', { level: 1, name: /programa de necessidades/i })).closest('[data-tela="programa"]') as HTMLElement;
    expect(within(tela).getByTestId('resumo-programa')).toHaveTextContent(/0 ambiente\(s\) em 0 item\(ns\)/);
    expect(within(tela).getByText(/^Programa vazio$/)).toBeInTheDocument();
    // Semente 2Q sem confirmação (programa vazio).
    await user.selectOptions(within(tela).getByLabelText('Tipologia da semente'), 'APTO_2Q');
    await user.click(within(tela).getByTestId('aplicar-semente'));
    expect(within(tela).getByTestId('resumo-programa')).toHaveTextContent(/8 ambiente\(s\) em 7 item\(ns\)/);
    expect(within(tela).getByTestId('resumo-programa')).toHaveTextContent(/9 relação\(ões\) \(1 obrigatória\(s\), 2 proibida\(s\)\)/);
    // Gravação com respiro: o serviço recebe o programa do estudo.
    await waitFor(() => expect(savePrograma).toHaveBeenCalled(), { timeout: 2000 });
    expect(savePrograma.mock.calls.at(-1)![0]).toBe('std_1');
    expect((savePrograma.mock.calls.at(-1)![2] as { itens: unknown[] }).itens).toHaveLength(7);
    // Célula editada: área ideal da sala 18 → 22; o resumo acompanha.
    const areaSala = within(tela).getByLabelText('Área ideal do item Sala de estar/jantar') as HTMLInputElement;
    await user.clear(areaSala);
    await user.type(areaSala, '22{Enter}');
    expect(within(tela).getByTestId('resumo-programa')).toHaveTextContent(/ideal 69,50 m²/); // 65,5 + 4
    // Quantidade de dormitórios 2 → 3.
    const qtd = within(tela).getByLabelText('Quantidade do item Dormitório') as HTMLInputElement;
    await user.clear(qtd);
    await user.type(qtd, '3{Enter}');
    expect(within(tela).getByTestId('resumo-programa')).toHaveTextContent(/9 ambiente\(s\)/);
    // Matriz: Sala × Cozinha era 8; vira Obrigatória; Cozinha × Dormitório é Proibida.
    await user.click(within(tela).getByRole('tab', { name: /^Proximidade/ }));
    const matriz = within(tela).getByTestId('matriz-de-proximidade');
    const salaCoz = within(matriz).getByLabelText('Relação Sala de estar/jantar × Cozinha') as HTMLSelectElement;
    expect(salaCoz.value).toBe('8');
    expect((within(matriz).getByLabelText('Relação Cozinha × Dormitório') as HTMLSelectElement).value).toBe('P');
    await user.selectOptions(salaCoz, 'O');
    expect(within(tela).getByTestId('resumo-programa')).toHaveTextContent(/2 obrigatória\(s\)/);
    // Remover a cozinha leva as relações dela (Sala×Coz e Coz×Serv, as duas obrigatórias, e Coz×Dorm).
    await user.click(within(tela).getByRole('tab', { name: /^Itens/ }));
    await user.click(within(tela).getByRole('button', { name: 'Remover o item Cozinha' }));
    expect(within(tela).getByTestId('resumo-programa')).toHaveTextContent(/6 relação\(ões\) \(0 obrigatória\(s\), 1 proibida\(s\)\)/);
    // Semente com itens: pede confirmação (padrão do app) e substitui.
    await user.selectOptions(within(tela).getByLabelText('Tipologia da semente'), 'CASA_TERREA');
    await user.click(within(tela).getByTestId('aplicar-semente'));
    await user.click(await screen.findByRole('button', { name: /^substituir$/i }));
    expect(within(tela).getByTestId('resumo-programa')).toHaveTextContent(/12 ambiente\(s\) em 11 item\(ns\)/);
    expect(within(tela).getByLabelText('Nome do item Garagem (2 vagas)')).toBeInTheDocument();
    // A contagem do botão do ribbon é o número de itens (o ribbon volta com o editor).
    await user.click(within(tela).getByRole('button', { name: /^voltar ao editor$/i }));
    await abrirAba(/^analisar$/i);
    expect(botaoPrograma()).toHaveTextContent('11');
  });

  it('grafo espacial (E4.2): a gaveta resume o pavimento e lista vizinhos, fachadas e saída; o percurso cozinha → dormitório passa pela sala; o cartão do ambiente e a ficha da porta leem o grafo', async () => {
    const k = await import('../../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    const w = (ax: number, ay: number, bx: number, by: number) => ({ type: 'AddWall', levelId: t, a: k.point(ax, ay), b: k.point(bx, by), thicknessMm: 150, heightMm: 2800 }) as const;
    let m = k.applyBatch(nivel.model, [w(0, 0, 8000, 0), w(8000, 0, 8000, 6000), w(8000, 6000, 0, 6000), w(0, 6000, 0, 0), w(4000, 0, 4000, 6000), w(4000, 3000, 8000, 3000)]).model;
    const sala = m.spaces.find((s) => s.ring.some((p) => p.x === 0))!;
    const coz = m.spaces.find((s) => s.ring.every((p) => p.x >= 4000) && s.ring.every((p) => p.y <= 3000))!;
    const dorm = m.spaces.find((s) => s.ring.every((p) => p.x >= 4000) && s.ring.every((p) => p.y >= 3000))!;
    const baixo = m.walls.find((x) => x.a.y === 0 && x.b.y === 0)!;
    const meio = m.walls.find((x) => x.a.x === 4000 && x.b.x === 4000)!;
    const direita = m.walls.find((x) => x.a.x === 8000 && x.b.x === 8000)!;
    m = k.applyBatch(m, [
      { type: 'NameSpace', spaceId: sala.id, name: 'Sala', tipoDeAmbiente: 'SALA_DORMITORIO' },
      { type: 'NameSpace', spaceId: coz.id, name: 'Cozinha', tipoDeAmbiente: 'COZINHA_SERVICO' },
      { type: 'NameSpace', spaceId: dorm.id, name: 'Dormitório 1', tipoDeAmbiente: 'SALA_DORMITORIO' },
      { type: 'AddOpening', wallId: baixo.id, kind: 'door', offsetMm: 1000, widthMm: 900, heightMm: 2100, sillMm: 0 },
      { type: 'AddOpening', wallId: meio.id, kind: 'door', offsetMm: 1000, widthMm: 800, heightMm: 2100, sillMm: 0 },
      { type: 'AddOpening', wallId: meio.id, kind: 'door', offsetMm: 4000, widthMm: 700, heightMm: 2100, sillMm: 0 },
      { type: 'AddOpening', wallId: direita.id, kind: 'window', offsetMm: 4000, widthMm: 1200, heightMm: 1200, sillMm: 1000 },
    ]).model;
    loadBranchModel.mockResolvedValue(m);
    await montar();
    const user = userEvent.setup();
    // O cartão do ambiente já traz o grafo (Ambientes nasce aberta).
    const dormId = m.spaces.find((s) => s.name === 'Dormitório 1')!.id;
    const cartao = await screen.findByTestId(`grafo-do-ambiente-${dormId}`);
    expect(cartao).toHaveTextContent(/Liga-se a: Sala/);
    expect(cartao).toHaveTextContent(/Fachada: N 4,00 m · L 3,00 m \(1 jan\.\)/);
    expect(cartao).toHaveTextContent(/Saída: 7,05 m/);
    // Gaveta Analisar › Grafo.
    await abrirAba(/^analisar$/i);
    const botaoGrafo = screen.getAllByRole('button', { name: /^grafo/i }).find((b) => b.getAttribute('title')?.startsWith('Grafo espacial'))!;
    expect(botaoGrafo).toHaveTextContent('3');
    await user.click(botaoGrafo);
    const gaveta = await screen.findByTestId('tarefa-grafo');
    const resumo = within(gaveta).getByTestId('resumo-do-grafo');
    expect(resumo).toHaveTextContent(/3 ambiente\(s\) · 3 porta\(s\), 0 passagem\(ns\), 3 parede\(s\) dividida\(s\) · 1 saída\(s\)/);
    expect(resumo).toHaveTextContent(/circulação 0,0 %/);
    expect(resumo).toHaveTextContent(/Percurso mais longo até a saída: Dormitório 1, 7,05 m/);
    expect(resumo).toHaveTextContent(/Porta\(s\) com vão < 0,80 m: .*\(700 mm\)/);
    const linha = within(gaveta).getByRole('row', { name: 'Ambiente Cozinha' });
    expect(linha).toHaveTextContent(/Cozinha.*Cozinha.*12,00 m².*Sala \(porta 0,80\).*Dormitório 1 \(4,00 m\).*L 3,00 m · S 4,00 m.*4,91 m · 2 porta\(s\)/);
    // Percurso cozinha → dormitório: pela sala, 2 portas, menor vão 0,70.
    await user.selectOptions(within(gaveta).getByLabelText('Percurso: de'), coz.id);
    await user.selectOptions(within(gaveta).getByLabelText('Percurso: para'), dormId);
    expect(within(gaveta).getByTestId('resultado-do-percurso')).toHaveTextContent(/6,96 m · Cozinha → Sala → Dormitório 1 · 2 porta\(s\) · menor vão 0,70 m/);
    // Clique na linha seleciona a etiqueta do ambiente e fecha a gaveta.
    await user.click(within(gaveta).getByRole('row', { name: 'Ambiente Dormitório 1' }));
    await waitFor(() => expect(screen.queryByTestId('tarefa-grafo')).toBeNull());
  });

  it('conferência do programa (E4.3): a aba Programa da Legislação casa itens pelo nome, acusa faltas, relações e fora do programa; as linhas entram em Resultados pela fonte; o clique leva ao ambiente', async () => {
    const k = await import('../../utils/blueprintKernel');
    const prog = await import('../../utils/blueprintPrograma');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    const w = (ax: number, ay: number, bx: number, by: number) => ({ type: 'AddWall', levelId: t, a: k.point(ax, ay), b: k.point(bx, by), thicknessMm: 150, heightMm: 2800 }) as const;
    let m = k.applyBatch(nivel.model, [w(0, 0, 8000, 0), w(8000, 0, 8000, 6000), w(8000, 6000, 0, 6000), w(0, 6000, 0, 0), w(4000, 0, 4000, 6000), w(4000, 3000, 8000, 3000)]).model;
    const sala = m.spaces.find((s) => s.ring.some((p) => p.x === 0))!;
    const coz = m.spaces.find((s) => s.ring.every((p) => p.x >= 4000) && s.ring.every((p) => p.y <= 3000))!;
    const dorm = m.spaces.find((s) => s.ring.every((p) => p.x >= 4000) && s.ring.every((p) => p.y >= 3000))!;
    const baixo = m.walls.find((x) => x.a.y === 0 && x.b.y === 0)!;
    const meio = m.walls.find((x) => x.a.x === 4000 && x.b.x === 4000)!;
    const direita = m.walls.find((x) => x.a.x === 8000 && x.b.x === 8000)!;
    m = k.applyBatch(m, [
      { type: 'NameSpace', spaceId: sala.id, name: 'Sala de estar' },
      { type: 'NameSpace', spaceId: coz.id, name: 'Escritório' },
      { type: 'NameSpace', spaceId: dorm.id, name: 'Dorm. casal' },
      { type: 'AddOpening', wallId: baixo.id, kind: 'door', offsetMm: 1000, widthMm: 900, heightMm: 2100, sillMm: 0 },
      { type: 'AddOpening', wallId: meio.id, kind: 'door', offsetMm: 1000, widthMm: 800, heightMm: 2100, sillMm: 0 },
      { type: 'AddOpening', wallId: meio.id, kind: 'door', offsetMm: 4000, widthMm: 700, heightMm: 2100, sillMm: 0 },
      { type: 'AddOpening', wallId: direita.id, kind: 'window', offsetMm: 4000, widthMm: 1200, heightMm: 1200, sillMm: 1000 },
    ]).model;
    loadBranchModel.mockResolvedValue(m);
    // O programa do estudo vem do serviço: sala, cozinha, dormitório casal, banheiro; sala × cozinha obrigatória; cozinha × dormitório proibida; percurso ≤ 7 m.
    let programa = prog.programaVazio('Casa teste');
    const iSala = prog.novoItem('SALA');
    const iCoz = prog.novoItem('COZINHA');
    const iDorm = prog.novoItem('DORMITORIO', 'Dormitório casal');
    const iBanho = prog.novoItem('BANHEIRO');
    programa = [iSala, iCoz, iDorm, iBanho].reduce((acc, i) => prog.adicionarItem(acc, i), programa);
    programa = prog.definirRelacao(programa, iSala.id, iCoz.id, 10, 'OBRIGATORIA');
    programa = prog.definirRelacao(programa, iSala.id, iDorm.id, 8);
    programa.percursoMaxM = 7;
    getPrograma.mockResolvedValue({ id: 'p1', study_id: 'std_1', organization_id: 'org_1', nome: programa.nome, programa, created_at: '', updated_at: '' });
    await montar();
    const user = userEvent.setup();
    await abrirAba(/^analisar$/i);
    const botaoLegislacao = () => screen.getAllByRole('button', { name: /^legislação/i }).find((b) => b.getAttribute('title')?.startsWith('Verificar'))!;
    await user.click(botaoLegislacao());
    const tela = (await screen.findByRole('heading', { level: 1, name: /verificar legislação/i })).closest('[data-tela="legislacao"]') as HTMLElement;
    // Resultados: a fonte "Programa de necessidades" está lá, com a cozinha faltando.
    await user.selectOptions(within(tela).getByLabelText('Filtrar por fonte'), 'Programa de necessidades');
    const linhas = () => within(tela).getAllByRole('row').map((r) => (r.textContent ?? '').replace(/\s+/g, ' '));
    expect(linhas().some((l) => /Cozinha: quantidade.*encontrados = 0 · pedidos = 1 · faltam 1/.test(l))).toBe(true);
    expect(linhas().some((l) => /Ambiente fora do programa.*Escritório/.test(l))).toBe(true);
    // Aba Programa.
    await user.click(within(tela).getByRole('tab', { name: /^Programa/ }));
    const conf = within(tela).getByTestId('conferencia-do-programa');
    expect(within(conf).getByTestId('resumo-da-conferencia')).toHaveTextContent(/\d+ atendido\(s\) · \d+ falta\(s\)/);
    expect(within(conf).getByRole('row', { name: 'Item Dormitório casal' })).toHaveTextContent(/1\/1.*Dorm\. casal \(Térreo\) · 10,97 m².*área ideal falta.*percurso até a saída falta \(7,05 m por 2 porta\(s\)/);
    expect(within(conf).getByRole('row', { name: 'Item Banheiro' })).toHaveTextContent(/0\/1faltam 1nenhum ambiente com este uso/);
    expect(within(conf).getByRole('row', { name: 'Item Sala' })).toHaveTextContent(/iluminação natural falta/);
    expect(within(conf).getByRole('row', { name: 'Relação Sala × Cozinha' })).toHaveTextContent(/obrigatória.*Cozinha sem ambiente casado no desenho.*não avaliada/);
    expect(within(conf).getByRole('row', { name: 'Relação Sala × Dormitório casal' })).toHaveTextContent(/peso 8.*porta direta.*atende/);
    expect(within(conf).getByTestId('fora-do-programa')).toHaveTextContent(/Escritório \(Escritório\) · Térreo/);
    // Clique no ambiente casado: a tela fecha e o ambiente fica selecionado.
    await user.click(within(conf).getByRole('button', { name: /^Sala de estar \(Térreo\) · 22,52 m²$/ }));
    await waitFor(() => expect(screen.queryByRole('heading', { level: 1, name: /verificar legislação/i })).toBeNull());
  });

  it('insolação (E5.1): a gaveta mostra o sol por data/hora solar, horas por fachada e ambiente, ventilação cruzada e "agora"; um vizinho a leste tira o sol da manhã; a Legislação lê a insolação', async () => {
    const k = await import('../../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    const w = (ax: number, ay: number, bx: number, by: number) => ({ type: 'AddWall', levelId: t, a: k.point(ax, ay), b: k.point(bx, by), thicknessMm: 150, heightMm: 2800 }) as const;
    let m = k.applyBatch(nivel.model, [w(0, 0, 8000, 0), w(8000, 0, 8000, 6000), w(8000, 6000, 0, 6000), w(0, 6000, 0, 0), w(4000, 0, 4000, 6000), w(4000, 3000, 8000, 3000)]).model;
    const sala = m.spaces.find((s) => s.ring.some((p) => p.x === 0))!;
    const dorm = m.spaces.find((s) => s.ring.every((p) => p.x >= 4000) && s.ring.every((p) => p.y >= 3000))!;
    const baixo = m.walls.find((x) => x.a.y === 0 && x.b.y === 0)!;
    const esquerda = m.walls.find((x) => x.a.x === 0 && x.b.x === 0)!;
    const meio = m.walls.find((x) => x.a.x === 4000 && x.b.x === 4000)!;
    const direita = m.walls.find((x) => x.a.x === 8000 && x.b.x === 8000)!;
    const d = (ax: number, ay: number, bx: number, by: number, papel: 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA') =>
      ({ type: 'AddBoundary', levelId: t, a: k.point(ax, ay), b: k.point(bx, by), kind: 'TERRENO', papel }) as const;
    m = k.applyBatch(m, [
      { type: 'NameSpace', spaceId: sala.id, name: 'Sala', tipoDeAmbiente: 'SALA_DORMITORIO' },
      { type: 'NameSpace', spaceId: dorm.id, name: 'Dormitório', tipoDeAmbiente: 'SALA_DORMITORIO' },
      { type: 'AddOpening', wallId: baixo.id, kind: 'door', offsetMm: 1000, widthMm: 900, heightMm: 2100, sillMm: 0 },
      { type: 'AddOpening', wallId: esquerda.id, kind: 'window', offsetMm: 2000, widthMm: 1500, heightMm: 1200, sillMm: 1000 },
      { type: 'AddOpening', wallId: meio.id, kind: 'door', offsetMm: 4000, widthMm: 800, heightMm: 2100, sillMm: 0 },
      { type: 'AddOpening', wallId: direita.id, kind: 'window', offsetMm: 4000, widthMm: 1200, heightMm: 1200, sillMm: 1000 },
      d(-1000, -1000, 9000, -1000, 'FRENTE'),
      d(9000, -1000, 9000, 7000, 'LATERAL_DIREITA'),
      d(9000, 7000, -1000, 7000, 'FUNDOS'),
      d(-1000, 7000, -1000, -1000, 'LATERAL_ESQUERDA'),
    ]).model;
    m = { ...m, georreferencia: { latitude: -23.55, longitude: -46.63, rotacaoNorteDeg: null } };
    loadBranchModel.mockResolvedValue(m);
    await montar();
    const user = userEvent.setup();
    await abrirAba(/^analisar$/i);
    const botao = screen.getAllByRole('button', { name: /^insolação/i }).find((b) => b.getAttribute('title')?.startsWith('Insolação'))!;
    await user.click(botao);
    const gaveta = await screen.findByTestId('tarefa-insolacao');
    // Instante padrão: 21/06 às 9 h solar, latitude da georreferência.
    expect(within(gaveta).getByTestId('hora-solar')).toHaveTextContent('9,0 h');
    expect(within(gaveta).getByTestId('posicao-do-sol')).toHaveTextContent(/Sol a \d+° de altura, azimute \d+° \(NE\)/);
    expect(within(gaveta).getByTestId('posicao-do-sol')).toHaveTextContent(/latitude da georreferência \(-23,55°\)/);
    expect(within(gaveta).getByLabelText('Latitude (graus, negativa ao sul)')).toBeDisabled();
    // Tabela: sala com janela a oeste (sol à tarde) → "sombra" às 9 h; dormitório com janela a leste → "sol"; ventilação cruzada só na sala (O + S).
    const linhaSala = within(gaveta).getByRole('row', { name: 'Ambiente Sala' });
    const linhaDorm = within(gaveta).getByRole('row', { name: 'Ambiente Dormitório' });
    expect(linhaSala).toHaveTextContent(/O \(1 jan\.\): \d,\d · \d,\d · \d,\d/);
    expect(linhaSala).toHaveTextContent(/sim \(S\/O\)/);
    expect(linhaSala).toHaveTextContent(/sombra/);
    expect(linhaDorm).toHaveTextContent(/L \(1 jan\.\)/);
    expect(linhaDorm).toHaveTextContent(/não — abertura só na fachada L/);
    expect(linhaDorm).toHaveTextContent(/sol/);
    const horasDoDorm = () => Number((within(gaveta).getByRole('row', { name: 'Ambiente Dormitório' }).textContent ?? '').match(/(\d+,\d+) h/)![1].replace(',', '.'));
    const antes = horasDoDorm();
    expect(antes).toBeGreaterThan(3);
    // Às 15 h solar o sol está a noroeste: a sala pega, o dormitório não.
    fireEvent.change(within(gaveta).getByLabelText('Hora solar'), { target: { value: '15' } });
    expect(within(gaveta).getByTestId('hora-solar')).toHaveTextContent('15,0 h');
    expect(within(gaveta).getByRole('row', { name: 'Ambiente Sala' })).toHaveTextContent(/sol/);
    expect(within(gaveta).getByRole('row', { name: 'Ambiente Dormitório' })).toHaveTextContent(/sombra/);
    // Vizinho de 15 m colado na lateral direita (leste): o dormitório perde horas de inverno.
    await user.click(within(gaveta).getByTestId('novo-vizinho'));
    await user.clear(within(gaveta).getByLabelText('Altura do vizinho 1 (m)'));
    await user.type(within(gaveta).getByLabelText('Altura do vizinho 1 (m)'), '15');
    await user.clear(within(gaveta).getByLabelText('Afastamento do vizinho 1 (m)'));
    await user.type(within(gaveta).getByLabelText('Afastamento do vizinho 1 (m)'), '0');
    expect(horasDoDorm()).toBeLessThan(antes);
    // Legislação lê a insolação: a regra de ventilação cruzada viola no dormitório; a de insolação mínima fica não avaliada (a zona não disse).
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('tarefa-insolacao')).toBeNull());
    await abrirAba(/^analisar$/i);
    await user.click(screen.getAllByRole('button', { name: /^legislação/i }).find((b) => b.getAttribute('title')?.startsWith('Verificar'))!);
    const tela = (await screen.findByRole('heading', { level: 1, name: /verificar legislação/i })).closest('[data-tela="legislacao"]') as HTMLElement;
    await user.selectOptions(within(tela).getByLabelText('Filtrar por fonte'), 'NBR 15575-1:2021');
    const linhas = () => within(tela).getAllByRole('row').map((r) => (r.textContent ?? '').replace(/\s+/g, ' '));
    expect(linhas().some((l) => /Violada.*ventilação cruzada.*Dormitório/.test(l))).toBe(true);
    expect(linhas().some((l) => /Conforme.*ventilação cruzada.*Sala/.test(l))).toBe(true);
    await user.selectOptions(within(tela).getByLabelText('Filtrar por fonte'), 'Zona urbanística');
    expect(linhas().some((l) => /Não avaliada.*insolação mínima no inverno.*falta o dado "insolacao_minima"/.test(l))).toBe(true);
  });

  it('avaliação (E5.2): a tela mostra a nota geral, os piores, dezoito indicadores com explicação; peso 0 muda a média; o detalhe leva à porta estreita; o Resumo dos Quantitativos tem o cartão', async () => {
    const k = await import('../../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    const w = (ax: number, ay: number, bx: number, by: number) => ({ type: 'AddWall', levelId: t, a: k.point(ax, ay), b: k.point(bx, by), thicknessMm: 150, heightMm: 2800 }) as const;
    let m = k.applyBatch(nivel.model, [w(0, 0, 8000, 0), w(8000, 0, 8000, 6000), w(8000, 6000, 0, 6000), w(0, 6000, 0, 0), w(4000, 0, 4000, 6000), w(4000, 3000, 8000, 3000)]).model;
    const sala = m.spaces.find((s) => s.ring.some((p) => p.x === 0))!;
    const dorm = m.spaces.find((s) => s.ring.every((p) => p.x >= 4000) && s.ring.every((p) => p.y >= 3000))!;
    const baixo = m.walls.find((x) => x.a.y === 0 && x.b.y === 0)!;
    const esquerda = m.walls.find((x) => x.a.x === 0 && x.b.x === 0)!;
    const meio = m.walls.find((x) => x.a.x === 4000 && x.b.x === 4000)!;
    const direita = m.walls.find((x) => x.a.x === 8000 && x.b.x === 8000)!;
    m = k.applyBatch(m, [
      { type: 'NameSpace', spaceId: sala.id, name: 'Sala', tipoDeAmbiente: 'SALA_DORMITORIO' },
      { type: 'NameSpace', spaceId: dorm.id, name: 'Dormitório', tipoDeAmbiente: 'SALA_DORMITORIO' },
      { type: 'AddOpening', wallId: baixo.id, kind: 'door', offsetMm: 1000, widthMm: 900, heightMm: 2100, sillMm: 0 },
      { type: 'AddOpening', wallId: esquerda.id, kind: 'window', offsetMm: 2000, widthMm: 1500, heightMm: 1200, sillMm: 1000 },
      { type: 'AddOpening', wallId: meio.id, kind: 'door', offsetMm: 4000, widthMm: 700, heightMm: 2100, sillMm: 0 },
      { type: 'AddOpening', wallId: direita.id, kind: 'window', offsetMm: 4000, widthMm: 1200, heightMm: 1200, sillMm: 1000 },
    ]).model;
    loadBranchModel.mockResolvedValue(m);
    await montar();
    const user = userEvent.setup();
    await abrirAba(/^analisar$/i);
    const botao = () => screen.getAllByRole('button', { name: /^avaliação/i }).find((b) => b.getAttribute('title')?.startsWith('Avaliação'))!;
    expect(botao()).toHaveTextContent(/\d{2}/); // a nota geral no botão
    await user.click(botao());
    const tela = (await screen.findByRole('heading', { level: 1, name: /^avaliação$/i })).closest('[data-tela="avaliacao"]') as HTMLElement;
    const notaGeral = () => Number(within(within(tela).getByTestId('resumo-da-avaliacao')).getByTestId('nota-geral').textContent);
    const antes = notaGeral();
    expect(antes).toBeGreaterThan(0);
    expect(within(tela).getByTestId('resumo-da-avaliacao')).toHaveTextContent(/média ponderada de \d+ indicador\(es\) avaliado\(s\) · \d+ não avaliado\(s\)/);
    expect(within(tela).getByTestId('piores')).toHaveTextContent(/Pesam mais para baixo:/);
    // Dezoito linhas; a de corredores explica a porta de 0,70 e o detalhe leva a ela.
    expect(within(tela).getByTestId('tabela-de-indicadores').querySelectorAll('tbody tr[aria-label^="Indicador "]')).toHaveLength(18);
    const corredores = within(tela).getByRole('row', { name: 'Indicador Corredores e passagens' });
    expect(corredores).toHaveTextContent(/1 de 2: circulações com ≥ 0,90 m livres e portas com vão ≥ 0,80 m/);
    expect(within(tela).getByRole('row', { name: 'Indicador Programa de necessidades' })).toHaveTextContent(/não avaliado.*Sem programa de necessidades/);
    expect(within(tela).getByRole('row', { name: 'Indicador Legislação e normas' })).toHaveTextContent(/conforme\(s\), \d+ erro\(s\)/);
    expect(within(tela).getByRole('row', { name: 'Indicador Insolação' })).toHaveTextContent(/2 de 2 ambiente\(s\) de permanência/);
    // Peso 0 na legislação muda a média geral.
    fireEvent.change(within(tela).getByLabelText('Peso de Legislação e normas'), { target: { value: '0' } });
    expect(notaGeral()).not.toBe(antes);
    // Detalhes: abre e clica no alvo (porta) → a tela fecha e a abertura fica selecionada.
    await user.click(corredores);
    const detalhes = within(tela).getByTestId('detalhes-corredores');
    expect(detalhes).toHaveTextContent(/porta 0,70 m em Sala/);
    await user.click(within(detalhes).getByRole('button', { name: 'Porta 0,70 m' }));
    expect(screen.queryByRole('heading', { level: 1, name: /^avaliação$/i })).toBeNull();
    expect(await screen.findByText(/^Abertura selecionada$/i)).toBeInTheDocument();
    // Cartão no Resumo dos Quantitativos.
    await abrirAba(/^analisar$/i);
    await user.click(screen.getByRole('button', { name: /^quantitativos$/i }));
    const cartao = await screen.findByTestId('cartao-da-avaliacao');
    expect(cartao).toHaveTextContent(/Avaliação · \d+ indicador\(es\) avaliado\(s\)/);
    await user.click(within(cartao).getByRole('button', { name: /ver avaliação/i }));
    expect(await screen.findByRole('heading', { level: 1, name: /^avaliação$/i })).toBeInTheDocument();
  });

  it('Por ambiente (E0.2): pé-direito do pavimento e volume = piso × pé-direito', async () => {
    const k = await import('../../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2500 });
    const t = nivel.model.levels[0].id;
    // Sala 4 × 3 de eixo, paredes de 150: piso (3,85 × 2,85) = 10,97 m²; volume 10,97 × 2,50 = 27,43 m³.
    loadBranchModel.mockResolvedValue(
      k.applyBatch(nivel.model, [
        { type: 'AddWall', levelId: t, a: k.point(0, 0), b: k.point(4000, 0), thicknessMm: 150, heightMm: 2500 },
        { type: 'AddWall', levelId: t, a: k.point(4000, 0), b: k.point(4000, 3000), thicknessMm: 150, heightMm: 2500 },
        { type: 'AddWall', levelId: t, a: k.point(4000, 3000), b: k.point(0, 3000), thicknessMm: 150, heightMm: 2500 },
        { type: 'AddWall', levelId: t, a: k.point(0, 3000), b: k.point(0, 0), thicknessMm: 150, heightMm: 2500 },
      ]).model,
    );
    await montar();
    const user = userEvent.setup();
    const tela = await abrirTelaDeQuantitativos();
    await user.click(within(tela).getByRole('tab', { name: /^Por ambiente/ }));
    expect(within(tela).getByRole('columnheader', { name: /Pé-direito \(m\)/ })).toBeInTheDocument();
    expect(within(tela).getByRole('columnheader', { name: /Volume \(m³\)/ })).toBeInTheDocument();
    const linhas = within(tela).getAllByRole('row').map((r) => (r.textContent ?? '').replace(/\s+/g, ' '));
    expect(linhas.some((l) => /10,97.*2,50.*27,43/.test(l))).toBe(true);
  });

  it('aba Instalações (18/09/2026): tubo por DN, pontos por classificação e conexões deduzidas, com filtro por disciplina', async () => {
    // "incluir hidráulica no quantitativo"
    const k = await import('../../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    loadBranchModel.mockResolvedValue(
      k.applyBatch(nivel.model, [
        { type: 'AddTrecho', levelId: t, disciplina: 'AGUA_FRIA', a: k.point(0, 0), b: k.point(4000, 0), cotaAMm: 2200, cotaBMm: 2200, bitolaMm: 25 },
        { type: 'AddTrecho', levelId: t, disciplina: 'AGUA_FRIA', a: k.point(4000, 0), b: k.point(4000, 2000), cotaAMm: 2200, cotaBMm: 2200, bitolaMm: 25 },
        { type: 'AddTrecho', levelId: t, disciplina: 'ELETRICA', a: k.point(0, 3000), b: k.point(2000, 3000), cotaAMm: 2800, cotaBMm: 2800, bitolaMm: 25 },
        { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: 'Chuveiro', at: k.point(4000, 2000), cotaMm: 2200, tipoHidraulico: 'CHUVEIRO' },
      ]).model,
    );
    await montar();
    const user = userEvent.setup();
    const tela = await abrirTelaDeQuantitativos();
    await user.click(within(tela).getByRole('tab', { name: /^Instalações/ }));
    const linhas = () => within(tela).getAllByRole('row').map((r) => r.textContent ?? '');
    expect(linhas().some((l) => /Tubo.*Água fria.*25.*6[,.]00/.test(l))).toBe(true);
    expect(linhas().some((l) => /Ponto.*Água fria.*Chuveiro/.test(l))).toBe(true);
    expect(linhas().some((l) => /Conexão.*Joelho 90°/.test(l))).toBe(true);
    expect(linhas().some((l) => /Tubo.*Elétrica.*Eletroduto/.test(l))).toBe(true);
    // Filtro por disciplina: só a água fria.
    await user.selectOptions(within(tela).getByLabelText(/filtrar por disciplina/i), 'AGUA_FRIA');
    expect(linhas().some((l) => /Eletroduto/.test(l))).toBe(false);
    expect(within(tela).getByText(/Total — Água fria/)).toBeInTheDocument();
  });

  it('com dois pavimentos: aba Por pavimento lista os dois, coluna e filtro de pavimento nas peças', async () => {
    // 17/09/2026: "incluir pavimentos em quantitativos".
    const k = await import('../../utils/blueprintKernel');
    let m = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    m = k.applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 2800, defaultHeightMm: 2800 }).model;
    const [terreo, superior] = m.levels.map((l) => l.id);
    m = k.applyBatch(m, [
      { type: 'AddStructural', levelId: terreo, kind: 'PILAR', pontos: [k.point(1000, 1000)], larguraMm: 200, profundidadeMm: 200, alturaMm: 2800, rotulo: 'P1' },
      { type: 'AddStructural', levelId: superior, kind: 'PILAR', pontos: [k.point(1000, 1000)], larguraMm: 300, profundidadeMm: 300, alturaMm: 2800, rotulo: 'P2' },
    ]).model;
    loadBranchModel.mockResolvedValue(m);
    await montar();
    const user = userEvent.setup();
    const tela = await abrirTelaDeQuantitativos();

    await user.click(within(tela).getByRole('tab', { name: /^Por pavimento/ }));
    const linhas = () => within(tela).getAllByRole('row').filter((r) => /Térreo|Superior/.test(r.textContent ?? ''));
    expect(linhas()).toHaveLength(2);
    expect(linhas()[0]).toHaveTextContent(/Térreo/);
    expect(linhas()[0]).toHaveTextContent(/0[,.]11/); // 0,2 × 0,2 × 2,8 = 0,112, 2 casas da política
    expect(linhas()[1]).toHaveTextContent(/Superior/);
    expect(linhas()[1]).toHaveTextContent(/0[,.]25/); // 0,3 × 0,3 × 2,8 = 0,252

    // Por peça: a coluna Pavimento e o filtro.
    await user.click(within(tela).getByRole('tab', { name: /^Por peça estrutural/ }));
    const linhaP2 = () => within(tela).getAllByRole('row').find((r) => /P2/.test(r.textContent ?? ''));
    expect(linhaP2()).toHaveTextContent(/Superior/);
    await user.selectOptions(within(tela).getByLabelText(/filtrar por pavimento/i), terreo);
    expect(linhaP2()).toBeUndefined();
    expect(within(tela).getAllByRole('row').some((r) => /P1/.test(r.textContent ?? ''))).toBe(true);
  });

  it('Comentários e Versões (Colaborar) continuam no dock, embaixo do canvas', async () => {
    await montar();
    await abrirAba(/^colaborar$/i);
    await userEvent.setup().click(screen.getByRole('button', { name: /^versões$/i }));
    expect(screen.getByRole('region', { name: /^relatório:/i })).toHaveAccessibleName(/versões/i);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: /fechar o relatório/i }));
    expect(screen.queryByRole('region', { name: /^relatório:/i })).not.toBeInTheDocument();
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

/**
 * ⚠️ TODA FAMÍLIA DO MODELO PRECISA ESTAR AQUI, mesmo vazia.
 *
 * Este dublê entra por `loadBranchModel`, que é mockado com `as unknown` — o
 * compilador não confere nada. Quando `structures` nasceu (kernel 0.9.0), a
 * ausência dela aqui derrubou onze casos com "Cannot read properties of
 * undefined", em testes que não têm nada a ver com estrutura. O caminho REAL
 * nunca produz isso: `loadBranchModel` devolve sempre um
 * `modelFromCanonicalPayload`, que preenche todas as listas. Quem esquecer de
 * acrescentar a família nova aqui vai depurar o componente errado.
 */
function modelo(walls: ReturnType<typeof parede>[]) {
  return {
    levels: [NIVEL],
    walls,
    openings: [],
    boundaries: [],
    structures: [],
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
  it('o relatório Orçamento abre em drawer sem fechar Ambientes no navegador', async () => {
    await montar();

    const drawer = await abrirRelatorio(/^orçamento$/i);
    expect(drawer).toHaveTextContent(/orçamento/i);
    expect(screen.getByRole('button', { name: /^orçamento$/i })).toHaveAttribute('aria-pressed', 'true');
    expect(cabecalhoDaSecao(/ambientes/i)).toHaveAttribute('aria-expanded', 'true');
  });

  it('estudo sem obra vinculada avisa antes de o usuário montar o de-para', async () => {
    await montar();
    await abrirRelatorio(/^orçamento$/i);

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
    // `findByText`, não `getByText`: `montar()` espera a TOOLBAR, e o rodapé do
    // canvas assenta depois dela. No Windows a corrida era ganha e o teste
    // passava; no Linux do CI, não — e falhou 30 runs seguidos desde 29/08 com
    // "Unable to find an element", sempre igual, nunca intermitente. Consulta
    // síncrona logo após um `montar()` que não espera por este elemento é uma
    // aposta no escalonador da máquina.
    expect(await screen.findByText(/orto \(Shift libera\)/i)).toBeInTheDocument();
  });
});

describe('BlueprintEditor · menu Exibir', () => {
  /** Item do menu — `menuitemcheckbox`, não botão da barra (mudou em 28/08/2026). */
  function item(nome: RegExp) {
    return screen.getByRole('menuitemcheckbox', { name: nome });
  }

  async function abrirMenu() {
    await abrirAba(/^vista$/i);
    await userEvent.click(botao(/exibir/i));
  }

  beforeEach(() => {
    // Os toggles são persistidos: sem limpar, um teste liga e o seguinte já
    // nasce ligado — e a falha aparece no teste errado.
    localStorage.clear();
  });

  it('as medidas nascem DESLIGADAS — cota em toda parede é poluição até ser pedida', async () => {
    await montar();
    await abrirMenu();
    expect(item(/medidas das paredes/i)).toHaveAttribute('aria-checked', 'false');
  });

  it('o item alterna', async () => {
    await montar();
    await abrirMenu();

    await userEvent.click(item(/medidas das paredes/i));
    expect(item(/medidas das paredes/i)).toHaveAttribute('aria-checked', 'true');

    await userEvent.click(item(/medidas das paredes/i));
    expect(item(/medidas das paredes/i)).toHaveAttribute('aria-checked', 'false');
  });

  it('grade e preenchimento nascem LIGADOS — esconder é a exceção, não o padrão', async () => {
    await montar();
    await abrirMenu();
    expect(item(/^grade$/i)).toHaveAttribute('aria-checked', 'true');
    expect(item(/preenchimento dos ambientes/i)).toHaveAttribute('aria-checked', 'true');
    expect(item(/uma cor por ambiente/i)).toHaveAttribute('aria-checked', 'false');
  });

  it('a dica da grade avisa que esconder NÃO desliga o encaixe', async () => {
    // É a confusão que o toggle cria: sem o aviso, o usuário desenha achando
    // que está livre e o ponto continua grudando no passo.
    await montar();
    await abrirMenu();
    expect(item(/^grade$/i).title).toMatch(/n[ãa]o desliga o encaixe/i);
  });

  it('"uma cor por ambiente" fica travada sem preenchimento — não há o que colorir', async () => {
    await montar();
    await abrirMenu();
    await userEvent.click(item(/preenchimento dos ambientes/i));

    const cores = item(/uma cor por ambiente/i);
    expect(cores).toBeDisabled();
    expect(cores.title).toMatch(/ligue "preenchimento/i);
  });

  it('o estado sobrevive a remontar o editor — é preferência, não gesto', async () => {
    await montar();
    await abrirMenu();
    await userEvent.click(item(/cadeias de cota/i));
    cleanup();

    await montar();
    await abrirMenu();
    expect(item(/cadeias de cota/i)).toHaveAttribute('aria-checked', 'true');
  });
});

/**
 * O RIBBON (13/09/2026) — abas por disciplina no lugar da barra única.
 *
 * O que se afirma aqui é o CONTRATO das abas, não o de cada botão (esses têm os
 * testes de sempre acima): cada comando mora numa aba só; a aba persiste; em
 * vista 3D só existe o que se pode fazer ali; a aba salva que deixou de existir
 * cai na primeira em vez de deixar o painel vazio.
 */
describe('BlueprintEditor · ribbon', () => {
  beforeEach(() => localStorage.clear());

  it('nasce em Arquitetura, com as oito abas da planta baixa (uma por disciplina MEP) e o seletor de vista fora delas', async () => {
    await montar();
    const abas = screen.getAllByRole('tab').map((t) => t.textContent);
    // 17/09/2026: "Instalações" virou Elétrica + Hidráulica (Mecânica entra quando houver componente).
    expect(abas).toEqual(['Arquitetura', 'Terreno', 'Elétrica', 'Hidráulica', 'Inserir', 'Analisar', 'Colaborar', 'Vista']);
    expect(screen.getByRole('tab', { name: 'Arquitetura' })).toHaveAttribute('aria-selected', 'true');
    // O seletor de vista continua dentro da barra, mas não é aba: usa-se o tempo todo.
    expect(within(screen.getByRole('toolbar')).getByRole('button', { name: /^planta$/i })).toBeInTheDocument();
  });

  it('cada comando mora numa aba só — Terreno e Área não estão em Arquitetura', async () => {
    await montar();
    expect(botao(/^selecionar$/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^terreno$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^área$/i })).not.toBeInTheDocument();

    await abrirAba(/^terreno$/i);
    expect(botao(/^terreno$/i)).toBeInTheDocument();
    expect(botao(/^divisa$/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^selecionar$/i })).not.toBeInTheDocument();

    await abrirAba(/^analisar$/i);
    expect(botao(/^área$/i)).toBeInTheDocument();
    expect(botao(/^contar$/i)).toBeInTheDocument();
  });

  it('a barra de opções diz a ferramenta ativa mesmo com o ribbon noutra aba', async () => {
    await montar();
    const opcoes = () => screen.getByRole('region', { name: /opções da ferramenta/i });
    expect(opcoes()).toHaveTextContent(/^Parede/);
    expect(within(opcoes()).getByLabelText(/espessura/i)).toBeInTheDocument();

    await abrirAba(/^terreno$/i);
    await userEvent.setup().click(botao(/^divisa$/i));
    await abrirAba(/^vista$/i);
    // A aba mudou, a ferramenta não — e é a barra de opções que conta isso.
    expect(opcoes()).toHaveTextContent(/^Divisa/);
    // Divisa não tem espessura: o campo é da parede.
    expect(within(opcoes()).queryByLabelText(/espessura/i)).not.toBeInTheDocument();
    expect(within(opcoes()).getByRole('button', { name: /orto/i })).toBeInTheDocument();
  });

  it('o acesso rápido (desfazer, refazer, excluir) fica visível em qualquer aba', async () => {
    await montar();
    await abrirAba(/^inserir$/i);
    expect(botao(/desfazer/i)).toBeInTheDocument();
    expect(botao(/refazer/i)).toBeInTheDocument();
    expect(botao(/excluir/i)).toBeInTheDocument();
  });

  it('o acesso rápido tem Selecionar, Mover e as seis vistas em ícone; a vista troca num clique e esconde as ferramentas fora da planta', async () => {
    // 17/09/2026: "ao lado do botão desfazer colocar um separador e inserir os
    // botões de vista… o botão selecionar… botão mover".
    await montar();
    const user = userEvent.setup();
    const barra = () => within(screen.getByRole('toolbar'));
    expect(barra().getByRole('button', { name: /^ferramenta: selecionar$/i })).toHaveAttribute('aria-pressed', 'false');
    for (const v of ['Planta', 'Frente', 'Fundos', 'Lat. esquerda', 'Lat. direita', '3D']) {
      expect(barra().getByRole('button', { name: `Vista: ${v}` })).toBeInTheDocument();
    }
    expect(barra().getByRole('button', { name: 'Vista: Planta' })).toHaveAttribute('aria-pressed', 'true');

    // Mover acende e a barra de opções passa a dizer a ferramenta.
    await user.click(barra().getByRole('button', { name: /^ferramenta: mover/i }));
    expect(barra().getByRole('button', { name: /^ferramenta: mover/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('region', { name: /opções da ferramenta/i })).toHaveTextContent(/^Mover a vista/);
    // O mesmo botão vive no grupo Construir, ao lado de Selecionar.
    expect(botao(/^mover$/i)).toHaveAttribute('aria-pressed', 'true');

    // Um clique troca a vista — e o seletor à esquerda acompanha.
    await user.click(barra().getByRole('button', { name: 'Vista: Frente' }));
    expect(barra().getByRole('button', { name: 'Vista: Frente' })).toHaveAttribute('aria-pressed', 'true');
    expect(barra().getByRole('button', { name: /^frente$/i })).toBeInTheDocument();
    // Fora da planta baixa não há ferramenta de desenho: Selecionar e Mover somem.
    expect(barra().queryByRole('button', { name: /^ferramenta: selecionar$/i })).toBeNull();
    expect(barra().queryByRole('button', { name: /^ferramenta: mover/i })).toBeNull();

    await user.click(barra().getByRole('button', { name: 'Vista: Planta' }));
    expect(barra().getByRole('button', { name: /^ferramenta: selecionar$/i })).toBeInTheDocument();
  });

  it('Situação, Implantação e Cobertura (E0.3): vistas fixas, read-only, com faixa que diz o pavimento e o recorte', async () => {
    await montar();
    const user = userEvent.setup();
    const barra = () => within(screen.getByRole('toolbar'));
    for (const v of ['Situação', 'Implantação', 'Cobertura']) {
      expect(barra().getByRole('button', { name: `Vista: ${v}` })).toBeInTheDocument();
    }
    await user.click(barra().getByRole('button', { name: 'Vista: Situação' }));
    const faixa = await screen.findByTestId('faixa-vista-de-planta');
    expect(faixa).toHaveTextContent(/Situação · Térreo — Lote, divisas/);
    // Read-only como as elevações: sem ferramenta de desenho; o canvas da planta continua (não é elevação).
    expect(barra().queryByRole('button', { name: /^ferramenta: selecionar$/i })).toBeNull();
    expect(screen.getByRole('application', { name: /área de desenho da planta/i })).toBeInTheDocument();
    // A aba Vista oferece só o preenchimento do terreno.
    await abrirAba(/^vista$/i);
    await user.click(botao(/exibir/i));
    expect(screen.getByRole('menuitemcheckbox', { name: /preenchimento do terreno/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitemcheckbox', { name: /piso \/ laje/i })).toBeNull();
    // "voltar à planta" devolve o editor.
    await user.click(within(faixa).getByRole('button', { name: /voltar à planta/i }));
    expect(screen.queryByTestId('faixa-vista-de-planta')).toBeNull();
    expect(barra().getByRole('button', { name: /^ferramenta: selecionar$/i })).toBeInTheDocument();
  });

  it('uma aba por disciplina MEP: Elétrica tem pontos/eletroduto/quadro e as tarefas; Hidráulica só água e esgoto', async () => {
    // 17/09/2026: "menubar Instalações está agrupando todas as disciplinas.
    // Melhor separar um menu para cada disciplina MEP: Elétrica; Hidráulica; Mecânica".
    await montar();
    const user = userEvent.setup();

    await abrirAba(/^elétrica$/i);
    await user.click(botao(/^elétrica$/i));
    const menu = () => within(screen.getByRole('menu', { name: /componentes do desenho/i }));
    expect(menu().getByRole('menuitemradio', { name: 'Eletroduto' })).toBeInTheDocument();
    expect(menu().getByRole('menuitemradio', { name: 'Quadro de distribuição' })).toBeInTheDocument();
    expect(menu().queryByRole('menuitemradio', { name: 'Água fria' })).toBeNull();
    expect(menu().queryByRole('menuitemradio', { name: 'Ponto de esgoto (sem tipo)' })).toBeNull();
    await user.keyboard('{Escape}');
    expect(botao(/^circuitos automáticos/i)).toBeInTheDocument();
    expect(botao(/^quadro de cargas/i)).toBeInTheDocument();

    await abrirAba(/^hidráulica$/i);
    await user.click(botao(/^hidráulica$/i));
    expect(menu().getByRole('menuitemradio', { name: 'Água fria' })).toBeInTheDocument();
    expect(menu().getByRole('menuitemradio', { name: 'Ponto de esgoto (sem tipo)' })).toBeInTheDocument();
    expect(menu().queryByRole('menuitemradio', { name: 'Eletroduto' })).toBeNull();
    expect(menu().queryByRole('menuitemradio', { name: 'Quadro de distribuição' })).toBeNull();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: /^circuitos automáticos/i })).toBeNull();
  });

  it('o acesso rápido é uma linha própria de GRUPOS com alça, e a ordem salva é respeitada', async () => {
    // 17/09/2026: "o toolbar de botões está deslocado: 1. alinhe à esquerda
    // 2. crie grupos de botões e possibilidade de mover os grupos para
    // direita/esquerda". O arraste em si não tem geometria em jsdom (provado no
    // app real); aqui: os grupos, as alças e a ordem persistida.
    localStorage.setItem('blueprint:ordemDoAcessoRapido', JSON.stringify(['editar', 'vistas', 'ferramenta']));
    await montar();
    const linha = screen.getByTestId('acesso-rapido');
    const grupos = within(linha).getAllByRole('group').map((g) => g.getAttribute('data-grupo-do-acesso-rapido'));
    // Os três salvos vêm primeiro, na ordem salva; os demais entram no fim, na ordem padrão.
    expect(grupos.slice(0, 3)).toEqual(['editar', 'vistas', 'ferramenta']);
    expect(grupos).toEqual(expect.arrayContaining(['zoom', 'modos', 'selecao', 'exibir', 'saida']));
    // Cada grupo tem a alça de arrasto, e os botões estão dentro do grupo certo.
    expect(within(linha).getByRole('button', { name: /^arrastar o grupo vistas$/i })).toBeInTheDocument();
    const editar = within(linha).getByRole('group', { name: 'Editar' });
    expect(within(editar).getByRole('button', { name: /desfazer/i })).toBeInTheDocument();
    const vistas = within(linha).getByRole('group', { name: 'Vistas' });
    expect(within(vistas).getAllByRole('button', { name: /^vista: /i })).toHaveLength(9);
    // A linha não é o slot à direita das abas: é filha direta da toolbar, abaixo do tablist.
    const toolbar = screen.getByRole('toolbar');
    expect(linha.closest('[role="toolbar"]')).toBe(toolbar);
    expect(screen.getByRole('tablist').compareDocumentPosition(linha) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("menu Hidráulica (18/09/2026): pontos tipados, caixa d'água, esgoto, registros, conexões e prumadas; escolher nomeia a barra de opções", async () => {
    // "Hidráulica (MEP) estão faltando componentes como: conexões, caixa d'água, ralo etc."
    await montar();
    const user = userEvent.setup();
    await abrirAba(/^hidráulica$/i);
    await user.click(botao(/^hidráulica$/i));
    const menu = () => within(screen.getByRole('menu', { name: /componentes do desenho/i }));
    for (const nome of [
      /^Chuveiro · água fria$/, /^Chuveiro · água quente$/, /^Chuveiro · esgoto$/, /^Vaso sanitário · esgoto$/,
      /^Caixa d'água$/, /^Aquecedor · água quente$/, /^Ralo sifonado$/, /^Caixa de inspeção$/,
      /^Registro de gaveta$/, /^Hidrômetro$/, /^Tê$/, /^Tubo de queda \(prumada\)$/, /^Ponto de esgoto \(sem tipo\)$/,
    ]) {
      expect(menu().getByRole('menuitemradio', { name: nome })).toBeInTheDocument();
    }
    // Registro tem UM item (a disciplina vem do trecho); vaso não existe em água quente.
    expect(menu().queryByRole('menuitemradio', { name: /^Registro de gaveta · /i })).toBeNull();
    expect(menu().queryByRole('menuitemradio', { name: /^Vaso sanitário · água quente$/ })).toBeNull();

    await user.click(menu().getByRole('menuitemradio', { name: /^Caixa d'água$/ }));
    const opcoes = () => screen.getByRole('region', { name: /opções da ferramenta/i });
    expect(opcoes()).toHaveTextContent(/^Caixa d'água/);

    await user.click(botao(/^caixa d'água$/i));
    await user.click(menu().getByRole('menuitemradio', { name: /^Tubo de queda \(prumada\)$/ }));
    expect(opcoes()).toHaveTextContent(/^Tubo de queda/);
  });

  it('Hidráulica › Distribuir pontos (18/09/2026): a gaveta lista o banheiro classificado, lança o kit sugerido e Aceitar confirma', async () => {
    const k = await import('../../utils/blueprintKernel');
    let m = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const t = m.levels[0].id;
    const w = (ax: number, ay: number, bx: number, by: number) =>
      ({ type: 'AddWall', levelId: t, a: k.point(ax, ay), b: k.point(bx, by), thicknessMm: 150, heightMm: 2800 }) as const;
    m = k.applyBatch(m, [w(0, 0, 2000, 0), w(2000, 0, 2000, 3000), w(2000, 3000, 0, 3000), w(0, 3000, 0, 0)]).model;
    m = k.applyCommand(m, { type: 'AddOpening', wallId: m.walls[0].id, kind: 'door', offsetMm: 600, widthMm: 700, heightMm: 2100, sillMm: 0 }).model;
    m = k.applyCommand(m, { type: 'NameSpace', spaceId: m.spaces[0].id, name: 'Banho', tipoDeAmbiente: 'BANHEIRO' }).model;
    loadBranchModel.mockResolvedValue(m);
    await montar();
    const user = userEvent.setup();

    await abrirAba(/^hidráulica$/i);
    const botaoDistribuir = () => botao(/^distribuir pontos/i);
    expect(botaoDistribuir()).toHaveTextContent('1'); // um ambiente com kit a criar
    await user.click(botaoDistribuir());
    const gaveta = await screen.findByTestId('tarefa-pontos-hidraulicos');
    const linha = within(gaveta).getByRole('row', { name: /banho/i });
    expect(within(linha).getByLabelText(/kit de banho/i)).toHaveValue('BANHEIRO');
    expect(linha).toHaveTextContent(/VS \(fria\/Esgoto\)/);
    expect(linha).toHaveTextContent(/CH \(fria\/quente\)/);

    await user.click(within(linha).getByRole('button', { name: /^lançar 8$/i }));
    // Oito pontos nasceram sugeridos; a linha diz que o kit está completo.
    await waitFor(() => expect(within(gaveta).getByRole('row', { name: /banho/i })).toHaveTextContent(/completo/i));
    // O Sheet não tem nome acessível; a gaveta é o dialog que contém a tarefa.
    const dialog = gaveta.closest('[role="dialog"]') as HTMLElement;
    expect(within(dialog).getByText(/8 sugerida\(s\)/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /aceitar sugeridas/i }));
    expect(within(dialog).getByText(/nenhuma peça sugerida/i)).toBeInTheDocument();
    // O botão do ribbon não conta mais nada a criar.
    expect(botaoDistribuir()).not.toHaveTextContent('1');
  });

  it("Hidráulica › Água automática (18/09/2026): a gaveta lista a caixa d'água, lança a rede sugerida e o botão zera", async () => {
    const k = await import('../../utils/blueprintKernel');
    let m = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const t = m.levels[0].id;
    m = k.applyBatch(m, [
      { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: "Caixa d'água", at: k.point(500, 500), cotaMm: 2800, tipoHidraulico: 'RESERVATORIO', volumeL: 1000 },
      { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: 'Chuveiro', at: k.point(1000, 2500), cotaMm: 2100, tipoHidraulico: 'CHUVEIRO' },
      { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: 'Lavatório', at: k.point(1600, 2500), cotaMm: 600, tipoHidraulico: 'LAVATORIO' },
    ]).model;
    loadBranchModel.mockResolvedValue(m);
    await montar();
    const user = userEvent.setup();

    await abrirAba(/^hidráulica$/i);
    const botaoAgua = () => botao(/^água automática/i);
    expect(botaoAgua()).toHaveTextContent('2'); // dois pontos a ligar
    await user.click(botaoAgua());
    const gaveta = await screen.findByTestId('tarefa-agua');
    const linha = within(gaveta).getByRole('row', { name: /caixa d'água/i });
    expect(linha).toHaveTextContent(/2 ponto\(s\) · 0 ligado\(s\)/);
    expect(linha).toHaveTextContent(/DN máx\. 20/);
    await user.click(within(linha).getByRole('button', { name: /^lançar 2$/i }));
    await waitFor(() => expect(within(gaveta).getByRole('row', { name: /caixa d'água/i })).toHaveTextContent(/2 ligado\(s\)/));
    expect(within(gaveta).getByRole('row', { name: /caixa d'água/i })).toHaveTextContent(/já estão ligados/);
    // Refazer existe (há rede); o botão do ribbon não conta mais nada a ligar.
    expect(within(gaveta).getByRole('button', { name: /^refazer$/i })).toBeInTheDocument();
    expect(botaoAgua()).not.toHaveTextContent('2');
  });

  it('Hidráulica › Esgoto automático (18/09/2026): a gaveta mostra o pavimento, lança a rede sugerida até a caixa de inspeção e o botão zera', async () => {
    const k = await import('../../utils/blueprintKernel');
    let m = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const t = m.levels[0].id;
    const w = (ax: number, ay: number, bx: number, by: number) =>
      ({ type: 'AddWall', levelId: t, a: k.point(ax, ay), b: k.point(bx, by), thicknessMm: 150, heightMm: 2800 }) as const;
    m = k.applyBatch(m, [
      w(0, 0, 2000, 0), w(2000, 0, 2000, 3000), w(2000, 3000, 0, 3000), w(0, 3000, 0, 0),
      { type: 'AddTerminal', levelId: t, disciplina: 'ESGOTO', tipo: 'Lavatório', at: k.point(600, 2500), cotaMm: 500, tipoHidraulico: 'LAVATORIO' },
      { type: 'AddTerminal', levelId: t, disciplina: 'ESGOTO', tipo: 'Caixa sifonada', at: k.point(1200, 2100), cotaMm: 0, tipoHidraulico: 'CAIXA_SIFONADA' },
      { type: 'AddTerminal', levelId: t, disciplina: 'ESGOTO', tipo: 'Vaso', at: k.point(600, 800), cotaMm: 0, tipoHidraulico: 'VASO_SANITARIO' },
      { type: 'AddTerminal', levelId: t, disciplina: 'ESGOTO', tipo: 'CI', at: k.point(4000, -1000), cotaMm: -700, tipoHidraulico: 'CAIXA_INSPECAO' },
    ]).model;
    loadBranchModel.mockResolvedValue(m);
    await montar();
    const user = userEvent.setup();

    await abrirAba(/^hidráulica$/i);
    const botaoEsgoto = () => botao(/^esgoto automático/i);
    expect(botaoEsgoto()).toHaveTextContent('3'); // lavatório, caixa sifonada e vaso
    await user.click(botaoEsgoto());
    const gaveta = await screen.findByTestId('tarefa-esgoto');
    const linha = within(gaveta).getByRole('row', { name: /térreo/i });
    expect(linha).toHaveTextContent(/3/);
    expect(gaveta).toHaveTextContent(/DN máx\. 100/);
    const dialog = gaveta.closest('[role="dialog"]') as HTMLElement;
    await user.click(within(dialog).getByRole('button', { name: /^lançar \(3\)$/i }));
    await waitFor(() => expect(screen.getByTestId('tarefa-esgoto')).toHaveTextContent(/já estão ligados/));
    expect(within(dialog).getByRole('button', { name: /^refazer$/i })).toBeInTheDocument();
    expect(botaoEsgoto()).not.toHaveTextContent('3');
  });

  it('a aba persiste entre montagens — é preferência, não gesto', async () => {
    await montar();
    await abrirAba(/^elétrica$/i);
    cleanup();

    await montar();
    expect(screen.getByRole('tab', { name: 'Elétrica' })).toHaveAttribute('aria-selected', 'true');
    expect(botao(/^elétrica$/i)).toBeInTheDocument(); // o menu filtrado
  });

  it('em 3D sobram as abas de leitura, e a aba salva que sumiu cai em Vista em vez de deixar o painel vazio', async () => {
    localStorage.setItem('blueprint:abaDoRibbon', JSON.stringify('terreno'));
    localStorage.setItem('blueprint:vista', JSON.stringify('3d'));
    await montar();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Elétrica',
      'Analisar',
      'Colaborar',
      'Vista',
    ]);
    expect(screen.getByRole('tab', { name: 'Vista' })).toHaveAttribute('aria-selected', 'true');
    expect(botao(/exibir/i)).toBeInTheDocument();
    // Nada de desenhar fora da planta: nem ferramentas, nem barra de opções.
    expect(screen.queryByRole('button', { name: /^selecionar$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /opções da ferramenta/i })).not.toBeInTheDocument();
    // Em Analisar, no 3D, só o que se lê ali: Conflitos e Quantitativos (como
    // as seções já eram) — sem Medir, sem Orçamento.
    await abrirAba(/^analisar$/i);
    expect(botao(/^conflitos/i)).toBeInTheDocument();
    expect(botao(/^quantitativos$/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^área$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^orçamento$/i })).not.toBeInTheDocument();
  });

  it('as tarefas do ribbon abrem em DRAWER (13/09/2026) e fecham pelo rodapé ou pelo mesmo botão', async () => {
    await montar();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await abrirAba(/^inserir$/i);
    await userEvent.setup().click(botao(/^do ifc$/i));
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveTextContent(/importar do ifc/i);
    expect(botao(/^do ifc$/i)).toHaveAttribute('aria-pressed', 'true');
    // Nada de tarefa no painel: a metade de baixo é só das Propriedades.
    expect(screen.queryByRole('region', { name: /importar do ifc/i })).not.toBeInTheDocument();

    // Uma tarefa por vez: abrir outra troca o conteúdo do mesmo drawer.
    await userEvent.setup().click(botao(/^do dxf$/i));
    expect(screen.getByRole('dialog')).toHaveTextContent(/importar do dxf/i);
    expect(botao(/^do ifc$/i)).toHaveAttribute('aria-pressed', 'false');

    await userEvent
      .setup()
      .click(within(screen.getByRole('dialog')).getByRole('button', { name: /^fechar$/i }));
    expect(botao(/^do dxf$/i)).toHaveAttribute('aria-pressed', 'false');
  });

  it('TELA CHEIA: o acesso rápido liga e desliga o modo, e a raiz do editor cobre o shell', async () => {
    await montar();
    // A raiz do editor é o `flex-col` que envolve o toolbar do ribbon.
    const raiz = screen.getByRole('toolbar').closest('[class*="flex-col"]') as HTMLElement;
    expect(raiz).not.toHaveAttribute('data-tela-cheia');
    expect(raiz.className).not.toMatch(/fixed/);

    // Sem `requestFullscreen` (jsdom não tem) o modo interno vale sozinho.
    await userEvent.setup().click(screen.getByRole('button', { name: /^tela cheia$/i }));
    expect(raiz).toHaveAttribute('data-tela-cheia');
    expect(raiz.className).toMatch(/fixed inset-0/);
    const sair = screen.getByRole('button', { name: /^sair da tela cheia$/i });
    expect(sair).toHaveAttribute('aria-pressed', 'true');

    await userEvent.setup().click(sair);
    expect(raiz).not.toHaveAttribute('data-tela-cheia');
    expect(screen.getByRole('button', { name: /^tela cheia$/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('a aba contextual Modificar só existe com seleção — e traz Copiar, Excluir e as ações da peça', async () => {
    loadBranchModel.mockResolvedValue(comDuasParedesSoltas());
    await montar();
    expect(screen.queryByRole('tab', { name: 'Modificar' })).not.toBeInTheDocument();

    // Selecionar pela lista de vãos (o canvas é opaco em jsdom) marca as duas paredes.
    await userEvent.setup().click(await screen.findByRole('button', { name: /Vão 1 · 1,00 m/ }));
    const modificar = screen.getByRole('tab', { name: 'Modificar' });
    expect(modificar).toBeInTheDocument();
    // Não pula sozinha na primeira seleção: quem está desenhando continua onde estava.
    expect(screen.getByRole('tab', { name: 'Arquitetura' })).toHaveAttribute('aria-selected', 'true');

    await userEvent.setup().click(modificar);
    expect(modificar).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('group', { name: /2 selecionados/i })).toBeInTheDocument();
    expect(botao(/^copiar$/i)).toBeInTheDocument();
    // Dividir/Unir são de UMA parede; com duas, não aparecem.
    expect(screen.queryByRole('button', { name: /^dividir$/i })).not.toBeInTheDocument();

    // Excluir esvazia a seleção: a aba some e o ribbon volta à aba de trabalho.
    // (Escopado ao ribbon: o painel de seleção múltipla também tem "Excluir".)
    await userEvent
      .setup()
      .click(within(screen.getByRole('toolbar')).getByRole('button', { name: /^excluir$/i }));
    expect(screen.queryByRole('tab', { name: 'Modificar' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Arquitetura' })).toHaveAttribute('aria-selected', 'true');
  });

  it('"Distribuir tomadas" (aba Instalações) abre a tarefa com os ambientes — é onde se procura o lançamento automático', async () => {
    // 13/09/2026: "não encontrei a funcionalidade de lançamento automático de
    // tomadas" — ela morava só dentro de cada cartão de ambiente.
    await montar();
    await abrirAba(/^elétrica$/i);
    await userEvent.setup().click(botao(/^distribuir tomadas$/i));
    // Em DRAWER (teste de formato de 13/09/2026), não na metade de baixo do painel.
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveTextContent(/tomadas pela nbr 5410/i);
    expect(drawer).toHaveTextContent(/completar pela norma/i);
    // Planta vazia: diz que a norma conta por cômodo, em vez de uma lista vazia.
    expect(drawer).toHaveTextContent(/nenhum ambiente fechado/i);
    expect(screen.queryByRole('region', { name: /tomadas pela nbr 5410/i })).not.toBeInTheDocument();
    // Sem sugerida pendente, "Aceitar sugeridas" existe (ribbon e rodapé) mas está apagado.
    for (const b of screen.getAllByRole('button', { name: /^aceitar sugeridas/i })) expect(b).toBeDisabled();
    // Fechar no rodapé desliga a tarefa (o Sheet sai com transição; o que se
    // afirma é o estado — o botão do ribbon deixa de estar pressionado).
    await userEvent.setup().click(within(drawer).getByRole('button', { name: /^fechar$/i }));
    expect(botao(/^distribuir tomadas$/i)).toHaveAttribute('aria-pressed', 'false');
  });

  it('"Lançar eletrodutos" (aba Instalações) abre o drawer com as hipóteses e a tabela por circuito', async () => {
    await montar();
    await abrirAba(/^elétrica$/i);
    await userEvent.setup().click(botao(/^lançar eletrodutos/i));
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveTextContent(/eletrodutos por circuito/i);
    expect(drawer).toHaveTextContent(/hipóteses do lançamento/i);
    expect(drawer).toHaveTextContent(/menor comprimento/i);
    // Planta sem quadro: diz o que falta em vez de uma tabela vazia.
    expect(drawer).toHaveTextContent(/nenhum quadro ainda/i);
    // 15/09/2026: uma rede por quadro, compartilhada, atravessando a laje.
    expect(drawer).toHaveTextContent(/uma rede por quadro/i);
    expect(drawer).toHaveTextContent(/prumada na posição do quadro/i);
    expect(within(drawer).getByRole('combobox', { name: /bitola do eletroduto/i })).toHaveValue('25');
    for (const b of within(drawer).getAllByRole('button', { name: /lançar em todos|aceitar sugeridos/i })) expect(b).toBeDisabled();
  });

  it('"Circuitos automáticos" (aba Instalações) sem quadro: o drawer pede o quadro e "Criar" fica apagado', async () => {
    await montar();
    await abrirAba(/^elétrica$/i);
    await userEvent.setup().click(botao(/^circuitos automáticos/i));
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveTextContent(/circuitos automáticos/i);
    expect(drawer).toHaveTextContent(/hipóteses da criação/i);
    expect(drawer).toHaveTextContent(/nunca no mesmo circuito/i);
    expect(drawer).toHaveTextContent(/insira um quadro de distribuição/i);
    expect(within(drawer).getByRole('combobox', { name: /critério de divisão/i })).toHaveValue('ambiente');
    expect(within(drawer).getByRole('button', { name: /^criar 0 circuito/i })).toBeDisabled();
    expect(botao(/^circuitos automáticos/i)).toHaveAttribute('aria-pressed', 'true');
  });

  it('com quadro e pontos: contagem no ribbon, prévia por função, "Criar" grava num passo só e um Desfazer volta tudo', async () => {
    // Sala fechada com QDC 127 V; luz + interruptor + 2 TUG + 1 TUE + 1 antena
    // (a antena fica de fora: não é circuito de força).
    const k = await import('../../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    const w = (ax: number, ay: number, bx: number, by: number) =>
      ({ type: 'AddWall', levelId: t, a: k.point(ax, ay), b: k.point(bx, by), thicknessMm: 150, heightMm: 2800 }) as const;
    let m = k.applyBatch(nivel.model, [w(0, 0, 6000, 0), w(6000, 0, 6000, 4000), w(6000, 4000, 0, 4000), w(0, 4000, 0, 0)]).model;
    m = k.applyCommand(m, { type: 'NameSpace', spaceId: m.spaces[0].id, name: 'Sala', tipoDeAmbiente: 'SALA_DORMITORIO' }).model;
    m = k.applyCommand(m, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: k.point(300, 300), cotaMm: 1500, tensaoV: 127, ligacao: 'FN' }).model;
    const ponto = (x: number, y: number, tipoEletrico: 'ILUMINACAO_TETO' | 'INTERRUPTOR' | 'TUG' | 'TUE' | 'DADOS_TV', potenciaW?: number) =>
      ({ type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: tipoEletrico, at: k.point(x, y), cotaMm: 300, tipoEletrico, ...(potenciaW != null ? { potenciaW } : {}) }) as const;
    m = k.applyBatch(m, [
      ponto(3000, 2000, 'ILUMINACAO_TETO', 160),
      ponto(200, 1200, 'INTERRUPTOR'),
      ponto(1000, 200, 'TUG', 100),
      ponto(2000, 200, 'TUG', 100),
      ponto(5000, 200, 'TUE', 1200),
      ponto(4000, 200, 'DADOS_TV'),
    ]).model;
    loadBranchModel.mockResolvedValue(m);
    await montar();
    await abrirAba(/^elétrica$/i);
    // 5 elegíveis: luz, interruptor, 2 TUG, TUE — a antena não conta.
    expect(botao(/^circuitos automáticos/i)).toHaveTextContent('5');

    await userEvent.setup().click(botao(/^circuitos automáticos/i));
    const drawer = await screen.findByRole('dialog');
    const previa = within(drawer).getByRole('table', { name: /prévia dos circuitos/i });
    const linhas = within(previa).getAllByRole('row').slice(1);
    expect(linhas.map((l) => l.textContent)).toEqual([
      expect.stringMatching(/C1 — Iluminação Sala.*Sala.*2.*160.*1,5 mm²/),
      expect.stringMatching(/C2 — TUG Sala.*Sala.*2.*200.*2,5 mm²/),
      expect.stringMatching(/C3 — TUE Sala.*Sala.*1.*1200.*4 mm²/),
    ]);
    expect(drawer).toHaveTextContent(/1 ponto\(s\) fora do plano/i);

    await userEvent.setup().click(within(drawer).getByRole('button', { name: /^criar 3 circuito/i }));
    expect(drawer).toHaveTextContent(/3 circuito\(s\) criado\(s\) para 5 ponto\(s\)/i);
    expect(drawer).toHaveTextContent(/nenhum ponto sem circuito neste pavimento/i);
    expect(botao(/^quadro de cargas/i)).toHaveTextContent('3');
    expect(botao(/^circuitos automáticos/i)).not.toHaveTextContent('5');

    // UM desfazer devolve os cinco: o lote foi um passo só.
    await userEvent.setup().click(botao(/^desfazer/i));
    expect(botao(/^circuitos automáticos/i)).toHaveTextContent('5');
    expect(botao(/^quadro de cargas/i)).toHaveTextContent('0');
  });

  it('trocar o critério para "Um por função" persiste em localStorage e a carga máxima fica apagada', async () => {
    await montar();
    await abrirAba(/^elétrica$/i);
    await userEvent.setup().click(botao(/^circuitos automáticos/i));
    const drawer = await screen.findByRole('dialog');
    await userEvent.selectOptions(within(drawer).getByRole('combobox', { name: /critério de divisão/i }), 'funcao');
    expect(JSON.parse(localStorage.getItem('blueprint:circuitosAutomaticos')!).criterio).toBe('funcao');
    expect(within(drawer).getByRole('spinbutton', { name: /carga máxima por circuito/i })).toBeDisabled();
  });

  // ── Pilares automáticos (15/09/2026) ─────────────────────────────────────
  it('"Pilares automáticos" (aba Arquitetura › Estrutural) sem parede: hipóteses, o que não faz, e "Lançar 0" apagado', async () => {
    await montar();
    await abrirAba(/^arquitetura$/i);
    await userEvent.setup().click(botao(/^pilares automáticos/i));
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveTextContent(/hipóteses do lançamento/i);
    expect(drawer).toHaveTextContent(/não dimensiona/i);
    expect(drawer).toHaveTextContent(/desenhe paredes neste pavimento/i);
    expect(within(drawer).getByRole('combobox', { name: /vão máximo entre pilares/i })).toHaveValue('5000');
    expect(within(drawer).getByRole('combobox', { name: /seção do pilar/i })).toHaveValue('190x190');
    expect(within(drawer).getByRole('button', { name: /^lançar 0 pilar/i })).toBeDisabled();
    expect(botao(/^pilares automáticos/i)).toHaveAttribute('aria-pressed', 'true');
  });

  it('com paredes: contagem no ribbon, prévia, "Lançar" grava num passo só (paredes cedem) e um Desfazer volta tudo', async () => {
    // Retângulo 6×4 com uma interna a meia altura: 4 cantos + 2 Ts + 3
    // intermediários (as três paredes de 6 m passam do vão de 5 m).
    const k = await import('../../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    const w = (ax: number, ay: number, bx: number, by: number) =>
      ({ type: 'AddWall', levelId: t, a: k.point(ax, ay), b: k.point(bx, by), thicknessMm: 150, heightMm: 2800 }) as const;
    const m = k.applyBatch(nivel.model, [
      w(0, 0, 6000, 0), w(6000, 0, 6000, 4000), w(6000, 4000, 0, 4000), w(0, 4000, 0, 0), w(0, 2000, 6000, 2000),
    ]).model;
    loadBranchModel.mockResolvedValue(m);
    await montar();
    await abrirAba(/^arquitetura$/i);
    expect(botao(/^pilares automáticos/i)).toHaveTextContent('9');

    await userEvent.setup().click(botao(/^pilares automáticos/i));
    const drawer = await screen.findByRole('dialog');
    const previa = within(drawer).getByRole('table', { name: /prévia dos pilares/i });
    const linhas = within(previa).getAllByRole('row').slice(1);
    expect(linhas).toHaveLength(9);
    expect(linhas[0]).toHaveTextContent(/P1.*canto.*0,02 · 0,02.*19 × 19 cm/); // 20 mm para dentro: face na face
    expect(drawer).toHaveTextContent(/9 pilar\(es\) · 5 parede\(s\) cedem/i);

    await userEvent.setup().click(within(drawer).getByRole('button', { name: /^lançar 9 pilar/i }));
    expect(drawer).toHaveTextContent(/9 pilar\(es\) lançado\(s\) · 5 parede\(s\) passaram a ceder/i);
    expect(drawer).toHaveTextContent(/todos os encontros de paredes já têm pilar/i);
    expect(botao(/^pilares automáticos/i)).not.toHaveTextContent('9');

    // UM desfazer devolve os nove: o lote foi um passo só.
    await userEvent.setup().click(botao(/^desfazer/i));
    expect(botao(/^pilares automáticos/i)).toHaveTextContent('9');
  });

  it('depois de lançar, "Relançar" fica disponível: mudar a seção, confirmar, e os pilares nascem de novo com ela; um Desfazer volta', async () => {
    // 16/09/2026: "caso o usuário queira alterar as dimensões dos pilares ele
    // precisa que o botão de relançar esteja sempre disponível".
    const k = await import('../../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    const w = (ax: number, ay: number, bx: number, by: number) =>
      ({ type: 'AddWall', levelId: t, a: k.point(ax, ay), b: k.point(bx, by), thicknessMm: 150, heightMm: 2800 }) as const;
    const m = k.applyBatch(nivel.model, [w(0, 0, 4000, 0), w(4000, 0, 4000, 3000), w(4000, 3000, 0, 3000), w(0, 3000, 0, 0)]).model;
    loadBranchModel.mockResolvedValue(m);
    await montar();
    await abrirAba(/^arquitetura$/i);
    await userEvent.setup().click(botao(/^pilares automáticos/i));
    const drawer = await screen.findByRole('dialog');
    // Antes de lançar não há o que relançar.
    expect(within(drawer).queryByRole('button', { name: /^relançar/i })).toBeNull();
    await userEvent.setup().click(within(drawer).getByRole('button', { name: /^lançar 4 pilar/i }));
    expect(drawer).toHaveTextContent(/todos os encontros de paredes já têm pilar/i);
    expect(within(drawer).getByRole('button', { name: /^lançar 0 pilar/i })).toBeDisabled();
    // Mudou a seção: "Relançar 4" está lá, pede confirmação e regrava.
    await userEvent.selectOptions(within(drawer).getByRole('combobox', { name: /seção do pilar/i }), '250x250');
    const relancar = within(drawer).getByRole('button', { name: /^relançar 4/i });
    expect(relancar).toBeEnabled();
    await userEvent.setup().click(relancar);
    const confirmacao = await screen.findByText(/apaga os 4 pilar\(es\) do pavimento/i);
    expect(confirmacao).toHaveTextContent(/25 × 25 cm/);
    await userEvent.setup().click(screen.getByRole('button', { name: /^relançar$/i }));
    expect(drawer).toHaveTextContent(/4 pilar\(es\) apagado\(s\) e 4 lançado\(s\) com 25 × 25 cm/i);
    // UM desfazer devolve os 19×19 (e "Relançar" continua disponível).
    await userEvent.setup().click(within(drawer).getByRole('button', { name: /^fechar$/i }));
    await userEvent.setup().click(botao(/^desfazer/i));
    await userEvent.setup().click(botao(/^pilares automáticos/i));
    expect(await screen.findByRole('dialog')).toHaveTextContent(/todos os encontros de paredes já têm pilar/i);
  });

  // ── Vigas e lajes automáticas (16/09/2026) ───────────────────────────────
  it('"Vigas automáticas" sem parede: hipóteses, "lance os pilares antes", e "Lançar 0" apagado', async () => {
    await montar();
    await abrirAba(/^arquitetura$/i);
    await userEvent.setup().click(botao(/^vigas automáticas/i));
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveTextContent(/hipóteses do lançamento/i);
    expect(drawer).toHaveTextContent(/lance os pilares antes/i);
    expect(drawer).toHaveTextContent(/não dimensiona/i);
    expect(drawer).toHaveTextContent(/desenhe paredes neste pavimento/i);
    expect(within(drawer).getByRole('combobox', { name: /divisor da altura da viga/i })).toHaveValue('10');
    expect(within(drawer).getByRole('button', { name: /^lançar 0 viga/i })).toBeDisabled();
    expect(botao(/^vigas automáticas/i)).toHaveAttribute('aria-pressed', 'true');
  });

  it('vigas: contagem no ribbon, prévia com seção por vão, "Lançar" grava num passo só, Relançar com L/12 muda a altura, Desfazer volta', async () => {
    const k = await import('../../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    const w = (ax: number, ay: number, bx: number, by: number) =>
      ({ type: 'AddWall', levelId: t, a: k.point(ax, ay), b: k.point(bx, by), thicknessMm: 150, heightMm: 2800 }) as const;
    const m = k.applyBatch(nivel.model, [
      w(0, 0, 6000, 0), w(6000, 0, 6000, 4000), w(6000, 4000, 0, 4000), w(0, 4000, 0, 0), w(0, 2000, 6000, 2000),
    ]).model;
    loadBranchModel.mockResolvedValue(m);
    await montar();
    await abrirAba(/^arquitetura$/i);
    expect(botao(/^vigas automáticas/i)).toHaveTextContent('5');
    await userEvent.setup().click(botao(/^vigas automáticas/i));
    const drawer = await screen.findByRole('dialog');
    const previa = within(drawer).getByRole('table', { name: /prévia das vigas/i });
    const linhas = within(previa).getAllByRole('row').slice(1);
    expect(linhas).toHaveLength(5);
    // A de 6 m sem apoio no meio: 15 × 60 (L/10); a vertical de 4 m com o T: 15 × 30 (mínimo).
    expect(linhas[0]).toHaveTextContent(/V1.*6,00.*15 × 60.*6,00/);
    expect(drawer).toHaveTextContent(/5 viga\(s\) · 5 parede\(s\) cedem/i);
    await userEvent.setup().click(within(drawer).getByRole('button', { name: /^lançar 5 viga/i }));
    expect(drawer).toHaveTextContent(/5 viga\(s\) lançada\(s\) · 5 parede\(s\) passaram a ceder/i);
    expect(drawer).toHaveTextContent(/todas as paredes já têm viga/i);
    // Relançar com L/12: 6 m → 50.
    await userEvent.selectOptions(within(drawer).getByRole('combobox', { name: /divisor da altura da viga/i }), '12');
    expect(JSON.parse(localStorage.getItem('blueprint:vigasAutomaticas')!).divisorDaAltura).toBe(12);
    await userEvent.setup().click(within(drawer).getByRole('button', { name: /^relançar 5/i }));
    await screen.findByText(/apaga as 5 viga\(s\) do pavimento/i);
    await userEvent.setup().click(screen.getByRole('button', { name: /^relançar$/i }));
    expect(drawer).toHaveTextContent(/5 viga\(s\) apagada\(s\) e 5 lançada\(s\)/i);
    // UM desfazer devolve as de L/10 (e a prévia continua vazia: ainda há viga em toda parede).
    await userEvent.setup().click(within(drawer).getByRole('button', { name: /^fechar$/i }));
    await userEvent.setup().click(botao(/^desfazer/i));
    expect(botao(/^vigas automáticas/i)).not.toHaveTextContent('5');
    await userEvent.setup().click(botao(/^desfazer/i));
    expect(botao(/^vigas automáticas/i)).toHaveTextContent('5');
  });

  it('lajes: uma por ambiente fechado, "Lançar 2 laje(s)" grava e um Desfazer volta; espessura persiste', async () => {
    const k = await import('../../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    const w = (ax: number, ay: number, bx: number, by: number) =>
      ({ type: 'AddWall', levelId: t, a: k.point(ax, ay), b: k.point(bx, by), thicknessMm: 150, heightMm: 2800 }) as const;
    let m = k.applyBatch(nivel.model, [
      w(0, 0, 6000, 0), w(6000, 0, 6000, 4000), w(6000, 4000, 0, 4000), w(0, 4000, 0, 0), w(0, 2000, 6000, 2000),
    ]).model;
    m = k.applyCommand(m, { type: 'NameSpace', spaceId: m.spaces[0].id, name: 'Sala', tipoDeAmbiente: 'SALA_DORMITORIO' }).model;
    loadBranchModel.mockResolvedValue(m);
    await montar();
    await abrirAba(/^arquitetura$/i);
    expect(botao(/^lajes automáticas/i)).toHaveTextContent('2');
    await userEvent.setup().click(botao(/^lajes automáticas/i));
    const drawer = await screen.findByRole('dialog');
    const previa = within(drawer).getByRole('table', { name: /prévia das lajes/i });
    expect(within(previa).getAllByRole('row').slice(1)).toHaveLength(2);
    expect(previa).toHaveTextContent(/Sala/);
    expect(previa).toHaveTextContent(/12,00/);
    expect(drawer).toHaveTextContent(/2 laje\(s\) · 24,00 m²/i);
    await userEvent.selectOptions(within(drawer).getByRole('combobox', { name: /espessura da laje/i }), '120');
    expect(JSON.parse(localStorage.getItem('blueprint:lajesAutomaticas')!).espessuraMm).toBe(120);
    expect(previa).toHaveTextContent(/12 cm/);
    await userEvent.setup().click(within(drawer).getByRole('button', { name: /^lançar 2 laje/i }));
    expect(drawer).toHaveTextContent(/2 laje\(s\) lançada\(s\) · 24,00 m²/i);
    expect(drawer).toHaveTextContent(/todos os ambientes já têm laje/i);
    expect(within(drawer).getByRole('button', { name: /^relançar 2/i })).toBeEnabled();
    await userEvent.setup().click(within(drawer).getByRole('button', { name: /^fechar$/i }));
    await userEvent.setup().click(botao(/^desfazer/i));
    expect(botao(/^lajes automáticas/i)).toHaveTextContent('2');
  });

  // ── Fundações automáticas (16/09/2026) ───────────────────────────────────
  it('"Fundações automáticas" sem pilar: pede os pilares, hipóteses, "Lançar 0" apagado', async () => {
    await montar();
    await abrirAba(/^arquitetura$/i);
    await userEvent.setup().click(botao(/^fundações automáticas/i));
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveTextContent(/hipóteses do lançamento/i);
    expect(drawer).toHaveTextContent(/lance os pilares antes/i);
    expect(drawer).toHaveTextContent(/não dimensiona/i);
    expect(within(drawer).getByRole('combobox', { name: /estacas por bloco/i })).toHaveValue('1');
    expect(within(drawer).getByRole('combobox', { name: /diâmetro da estaca/i })).toHaveValue('300');
    expect(within(drawer).getByRole('button', { name: /^lançar 0 bloco/i })).toBeDisabled();
    expect(botao(/^fundações automáticas/i)).toHaveAttribute('aria-pressed', 'true');
  });

  it('fundações: depois dos pilares, um bloco e uma estaca por pilar; "Lançar" grava num passo só; 2 estacas muda a prévia; Desfazer volta', async () => {
    const k = await import('../../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    const w = (ax: number, ay: number, bx: number, by: number) =>
      ({ type: 'AddWall', levelId: t, a: k.point(ax, ay), b: k.point(bx, by), thicknessMm: 150, heightMm: 2800 }) as const;
    const m = k.applyBatch(nivel.model, [w(0, 0, 4000, 0), w(4000, 0, 4000, 3000), w(4000, 3000, 0, 3000), w(0, 3000, 0, 0)]).model;
    loadBranchModel.mockResolvedValue(m);
    await montar();
    await abrirAba(/^arquitetura$/i);
    // Sem pilar, o botão não tem contagem.
    expect(botao(/^fundações automáticas/i)).not.toHaveTextContent('8');
    await userEvent.setup().click(botao(/^pilares automáticos/i));
    let drawer = await screen.findByRole('dialog');
    await userEvent.setup().click(within(drawer).getByRole('button', { name: /^lançar 4 pilar/i }));
    await userEvent.setup().click(within(drawer).getByRole('button', { name: /^fechar$/i }));
    // 4 blocos + 4 baldrames (uma por parede).
    expect(botao(/^fundações automáticas/i)).toHaveTextContent('8');

    await userEvent.setup().click(botao(/^fundações automáticas/i));
    drawer = await screen.findByRole('dialog');
    const previa = within(drawer).getByRole('table', { name: /prévia das fundações/i });
    const linhas = within(previa).getAllByRole('row').slice(1);
    expect(linhas).toHaveLength(4);
    expect(linhas[0]).toHaveTextContent(/P1.*B1 · 60 × 60 × 60.*1 × Ø 30 · 8,00 m.*-0,50/);
    expect(drawer).toHaveTextContent(/4 bloco\(s\) · 4 estaca\(s\) · 4 baldrame\(s\)/i);
    // A baldrame: 15 × 50 do topo do bloco ao piso, uma por parede.
    const baldrames = within(drawer).getByRole('table', { name: /prévia das vigas baldrame/i });
    expect(within(baldrames).getAllByRole('row').slice(1)).toHaveLength(4);
    expect(within(baldrames).getAllByRole('row')[1]).toHaveTextContent(/VB1.*15 × 50 · topo no piso/);
    await userEvent.selectOptions(within(drawer).getByRole('combobox', { name: /estacas por bloco/i }), '2');
    expect(JSON.parse(localStorage.getItem('blueprint:fundacoesAutomaticas')!).estacasPorBloco).toBe(2);
    expect(within(previa).getAllByRole('row')[1]).toHaveTextContent(/150 × 60 × 60.*2 × Ø 30/);
    expect(drawer).toHaveTextContent(/4 bloco\(s\) · 8 estaca\(s\)/i);
    await userEvent.setup().click(within(drawer).getByRole('button', { name: /^lançar 4 bloco\(s\), 8 estaca\(s\) e 4 baldrame/i }));
    expect(drawer).toHaveTextContent(/4 bloco\(s\), 8 estaca\(s\) e 4 baldrame\(s\) lançado\(s\)/i);
    expect(drawer).toHaveTextContent(/todos os pilares já têm bloco/i);
    expect(within(drawer).getByRole('button', { name: /^relançar 8/i })).toBeEnabled();
    await userEvent.setup().click(within(drawer).getByRole('button', { name: /^fechar$/i }));
    await userEvent.setup().click(botao(/^desfazer/i));
    expect(botao(/^fundações automáticas/i)).toHaveTextContent('8');
  });

  it('fundações: baldrame desligada na hipótese some da prévia e do rodapé; a escolha persiste', async () => {
    const k = await import('../../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    const w = (ax: number, ay: number, bx: number, by: number) =>
      ({ type: 'AddWall', levelId: t, a: k.point(ax, ay), b: k.point(bx, by), thicknessMm: 150, heightMm: 2800 }) as const;
    const m = k.applyBatch(nivel.model, [w(0, 0, 4000, 0), w(4000, 0, 4000, 3000), w(4000, 3000, 0, 3000), w(0, 3000, 0, 0)]).model;
    loadBranchModel.mockResolvedValue(m);
    await montar();
    await abrirAba(/^arquitetura$/i);
    await userEvent.setup().click(botao(/^pilares automáticos/i));
    let drawer = await screen.findByRole('dialog');
    await userEvent.setup().click(within(drawer).getByRole('button', { name: /^lançar 4 pilar/i }));
    await userEvent.setup().click(within(drawer).getByRole('button', { name: /^fechar$/i }));
    await userEvent.setup().click(botao(/^fundações automáticas/i));
    drawer = await screen.findByRole('dialog');
    const caixa = within(drawer).getByRole('checkbox', { name: /lançar viga baldrame/i });
    expect(caixa).toBeChecked();
    await userEvent.setup().click(caixa);
    expect(JSON.parse(localStorage.getItem('blueprint:fundacoesAutomaticas')!).vigaBaldrame).toBe(false);
    expect(within(drawer).queryByRole('table', { name: /prévia das vigas baldrame/i })).toBeNull();
    expect(drawer).toHaveTextContent(/4 bloco\(s\) · 4 estaca\(s\)\./i);
    expect(within(drawer).getByRole('button', { name: /^lançar 4 bloco\(s\) e 4 estaca\(s\)$/i })).toBeEnabled();
    expect(botao(/^fundações automáticas/i)).toHaveTextContent('4');
    // Sem baldrame, nem posição nem altura dela aparecem.
    expect(within(drawer).queryByRole('combobox', { name: /posição da baldrame/i })).toBeNull();
    // Religa: posição "No nível do bloco" mostra a altura e muda a prévia (topo −0,50).
    await userEvent.setup().click(caixa);
    await userEvent.selectOptions(within(drawer).getByRole('combobox', { name: /posição da baldrame/i }), 'NO_NIVEL_DO_BLOCO');
    expect(JSON.parse(localStorage.getItem('blueprint:fundacoesAutomaticas')!).posicaoDaBaldrame).toBe('NO_NIVEL_DO_BLOCO');
    await userEvent.selectOptions(within(drawer).getByRole('combobox', { name: /altura da baldrame/i }), '300');
    const baldrames = within(drawer).getByRole('table', { name: /prévia das vigas baldrame/i });
    // No nível do bloco a casa assenta na viga: topo no piso; o arrasamento fica desabilitado.
    expect(within(baldrames).getAllByRole('row')[1]).toHaveTextContent(/15 × 30 · topo no piso/);
    expect(within(drawer).getByRole('combobox', { name: /arrasamento do bloco/i })).toBeDisabled();
  });

  it('vão máximo e seção escolhidos persistem em localStorage e mudam a prévia', async () => {
    const k = await import('../../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    const w = (ax: number, ay: number, bx: number, by: number) =>
      ({ type: 'AddWall', levelId: t, a: k.point(ax, ay), b: k.point(bx, by), thicknessMm: 150, heightMm: 2800 }) as const;
    const m = k.applyBatch(nivel.model, [w(0, 0, 6000, 0), w(6000, 0, 6000, 4000), w(6000, 4000, 0, 4000), w(0, 4000, 0, 0)]).model;
    loadBranchModel.mockResolvedValue(m);
    await montar();
    await abrirAba(/^arquitetura$/i);
    expect(botao(/^pilares automáticos/i)).toHaveTextContent('6'); // 4 cantos + 2 intermediários (paredes de 6 m)
    await userEvent.setup().click(botao(/^pilares automáticos/i));
    const drawer = await screen.findByRole('dialog');
    await userEvent.selectOptions(within(drawer).getByRole('combobox', { name: /vão máximo entre pilares/i }), '6000');
    expect(JSON.parse(localStorage.getItem('blueprint:pilaresAutomaticos')!).vaoMaximoMm).toBe(6000);
    expect(botao(/^pilares automáticos/i)).toHaveTextContent('4'); // 6 m cabe no vão: só os cantos
    await userEvent.selectOptions(within(drawer).getByRole('combobox', { name: /seção do pilar/i }), '140x400');
    expect(JSON.parse(localStorage.getItem('blueprint:pilaresAutomaticos')!).secao).toBe('140x400');
    expect(within(drawer).getByRole('table', { name: /prévia dos pilares/i })).toHaveTextContent(/40 × 14 cm/);
  });

  it('"Quadro de cargas" (aba Instalações) abre uma TELA própria — título, Voltar, sem drawer nem dock; o editor fica escondido e volta inteiro', async () => {
    // 15/09/2026: "quadro de cargas e unifilar em drawer ficou muito ruim
    // visualização. vamos criar uma tela nova para cada um". Tela em fluxo
    // (h1 + Voltar), nunca `fixed inset-0`, nunca Sheet.
    await montar();
    await abrirAba(/^elétrica$/i);
    await userEvent.setup().click(botao(/^quadro de cargas/i));
    const titulo = await screen.findByRole('heading', { level: 1, name: /quadro de cargas e nbr 5410/i });
    const tela = titulo.closest('[data-tela="quadro-de-cargas"]') as HTMLElement;
    expect(tela).not.toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('region', { name: /^relatório:/i })).not.toBeInTheDocument();
    // 15/09/2026: TabsBar + StandardTable — a conferência é uma aba.
    expect(within(tela).getByRole('tab', { name: /conferência nbr 5410/i })).toBeInTheDocument();
    expect(within(tela).getByRole('tab', { name: /^circuitos/i })).toHaveAttribute('aria-selected', 'true');
    expect(within(tela).getByRole('button', { name: /^novo circuito$/i })).toBeDisabled();
    // A emissão com ART não mora aqui (14/09/2026).
    expect(tela).not.toHaveTextContent(/responsável técnico/i);
    expect(within(tela).queryByLabelText(/número da art/i)).toBeNull();
    // O editor está montado, mas escondido: a barra some da árvore acessível…
    expect(screen.queryByRole('toolbar')).toBeNull();
    // …e volta com o botão Voltar, com o botão do ribbon apagado.
    await userEvent.setup().click(within(tela).getByRole('button', { name: /^voltar ao editor$/i }));
    expect(screen.getByRole('toolbar')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: /quadro de cargas/i })).toBeNull();
    expect(botao(/^quadro de cargas/i)).toHaveAttribute('aria-pressed', 'false');
  });

  it('⚠️ a lixeira da lista APAGA um ponto elétrico (TUG) — era um return mudo', async () => {
    // 13/09/2026: "o botão excluir no painel lateral não está funcionando.
    // não consigo excluir TUG". `excluirComponente` não conhecia instalações.
    const k = await import('../../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const comTug = k.applyCommand(nivel.model, {
      type: 'AddTerminal', levelId: nivel.model.levels[0].id, disciplina: 'ELETRICA', tipo: 'TUG',
      at: k.point(1000, 1000), cotaMm: 300, tipoEletrico: 'TUG', potenciaW: 100,
    }).model;
    loadBranchModel.mockResolvedValue(comTug);
    await montar();
    const user = userEvent.setup();
    await abrirComponentes(user);

    const lixeira = await screen.findByRole('button', { name: /^excluir .*tug/i });
    await user.click(lixeira);
    await waitFor(() => expect(screen.queryByRole('button', { name: /^excluir .*tug/i })).not.toBeInTheDocument());
  });

  it('"Projeto executivo (ART)" tem botão e TELA próprios em Elétrica — sem drawer', async () => {
    // 15/09/2026: "transformar drawer Projeto executivo elétrico (ART) também em tela".
    await montar();
    await abrirAba(/^elétrica$/i);
    await userEvent.setup().click(botao(/^projeto executivo \(art\)/i));
    const titulo = await screen.findByRole('heading', { level: 1, name: /projeto executivo elétrico \(art\)/i });
    const tela = titulo.closest('[data-tela="executivo-eletrico"]') as HTMLElement;
    expect(tela).not.toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(tela).toHaveTextContent(/responsável técnico/i);
    // Sem a tabela do quadro de cargas: aqui só a emissão (as regras da 5410
    // aparecem como VERIFICAÇÕES da emissão, o que é outra coisa).
    expect(within(tela).queryByLabelText(/nome do circuito/i)).toBeNull();
    expect(tela).not.toHaveTextContent(/nenhum quadro de distribuição ainda/i);
    // O editor (e o ribbon) está escondido enquanto a tela está aberta — o botão
    // segue aceso, mas fora da árvore acessível.
    expect(screen.getByRole('button', { name: /^projeto executivo \(art\)/i, hidden: true })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.setup().click(within(tela).getByRole('button', { name: /^voltar ao editor$/i }));
    expect(screen.getByRole('toolbar')).toBeInTheDocument();
    expect(botao(/^projeto executivo \(art\)/i)).toHaveAttribute('aria-pressed', 'false');
  });

  it('"Diagrama unifilar" (aba Instalações) abre uma TELA própria: sem quadro pede um; Voltar devolve o editor', async () => {
    await montar();
    await abrirAba(/^elétrica$/i);
    await userEvent.setup().click(botao(/^diagrama unifilar/i));
    const titulo = await screen.findByRole('heading', { level: 1, name: /diagrama unifilar/i });
    const tela = titulo.closest('[data-tela="unifilar"]') as HTMLElement;
    expect(tela).toHaveTextContent(/nenhum quadro de distribuição ainda/i);
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.setup().click(within(tela).getByRole('button', { name: /^voltar ao editor$/i }));
    expect(botao(/^diagrama unifilar/i)).toHaveAttribute('aria-pressed', 'false');
  });

  it('com QDC e um circuito, o unifilar mostra o quadro, o ramal C1 e os condutores', async () => {
    const k = await import('../../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    let m = k.applyCommand(nivel.model, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: k.point(300, 300), cotaMm: 1500, tensaoV: 127, ligacao: 'FN' }).model;
    m = k.applyCommand(m, { type: 'AddCircuito', quadroId: m.quadros![0].id, nome: 'C1 — TUG Sala', tensaoV: 127, secaoMm2: 2.5, disjuntorA: 16 }).model;
    m = k.applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'TUG', at: k.point(1000, 200), cotaMm: 300, tipoEletrico: 'TUG', potenciaW: 600 }).model;
    m = k.applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais![0].id, circuitoId: m.circuitos![0].id }).model;
    loadBranchModel.mockResolvedValue(m);
    await montar();
    await abrirAba(/^elétrica$/i);
    await userEvent.setup().click(botao(/^diagrama unifilar/i));
    const titulo = await screen.findByRole('heading', { level: 1, name: /diagrama unifilar/i });
    const tela = titulo.closest('[data-tela="unifilar"]') as HTMLElement;
    const svg = within(tela).getByRole('img', { name: /unifilar do quadro qdc/i });
    expect(svg).toHaveTextContent(/QDC — FN 127 V/);
    expect(svg).toHaveTextContent(/GERAL \d+ A/);
    expect(svg).toHaveTextContent('C1');
    expect(svg).toHaveTextContent('16 A');
    expect(svg).toHaveTextContent('2#2,5 + T2,5');
    expect(tela).toHaveTextContent(/1 circuito\(s\) · instalado 600 VA/);
  });

  it('"Dados do lote" (aba Terreno) abre o painel do terreno como tarefa', async () => {
    await montar();
    await abrirAba(/^terreno$/i);
    await userEvent.setup().click(botao(/^dados do lote$/i));
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveTextContent(/dados do lote, zona e topografia/i);
    expect(botao(/^dados do lote$/i)).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('BlueprintEditor · precisão do mover', () => {
  beforeEach(() => localStorage.clear());

  it('nasce seguindo a grade — quem não pediu precisão fixa segue como antes', async () => {
    await montar();
    await abrirAba(/^vista$/i);
    const seletor = screen.getByRole('combobox', { name: /precis[ãa]o/i });
    expect((seletor as HTMLSelectElement).value).toBe('grade');
  });

  it('oferece passo em mm que NÃO depende do zoom, com 1 mm de piso', async () => {
    // O piso é o do kernel: coordenada é inteira em mm (`assertIntegerMm`).
    await montar();
    await abrirAba(/^vista$/i);
    const seletor = screen.getByRole('combobox', { name: /precis[ãa]o/i });
    const valores = Array.from((seletor as HTMLSelectElement).options).map((o) => o.value);
    expect(valores).toEqual(['grade', '1', '5', '10', '25', '50', '100', '500', '1000']);
  });

  it('escolher um passo fixo aparece no rodapé, para o usuário saber o que está valendo', async () => {
    await montar();
    await abrirAba(/^vista$/i);
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /precis[ãa]o/i }),
      '10',
    );
    expect(screen.getByText(/mover 10 mm/i)).toBeInTheDocument();
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

    // `findByRole`/`findByText` pela mesma razão do rodapé do orto acima: o
    // botão só existe depois que o modelo carregou E as pontas soltas foram
    // derivadas, e `montar()` não espera por nada disso.
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: /conectar automaticamente/i }));
    expect(await screen.findByText(/nenhuma ponta se sobrepõe/i)).toBeInTheDocument();
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

/**
 * O grupo ESTRUTURAL na barra.
 *
 * A pergunta é a deste arquivo: o que a INTERFACE oferece. Desenhar depende do
 * canvas, que é opaco em jsdom — o que se cobre aqui é que os seis tipos estão
 * alcançáveis, que escolher um liga a ferramenta, e que o botão fechado não
 * esconde qual peça vai sair do próximo clique.
 */
describe('BlueprintEditor · componentes de estrutura', () => {
  beforeEach(() => localStorage.clear());

  it('os SEIS elementos estruturais estão no menu Componentes', async () => {
    // O grupo nasceu como menu próprio "Estrutural" em 30/08/2026 e foi
    // absorvido pelo menu Componentes no dia seguinte, a pedido do usuário.
    // O que se afirma continua sendo o mesmo: os seis são alcançáveis.
    await montar();
    await userEvent.setup().click(botaoComponentes());

    for (const nome of [
      /^Pilar$/,
      /^Viga$/,
      /^Laje$/,
      /^Estaca$/,
      /^Bloco de coroamento$/,
      /^Viga de fundação$/,
    ]) {
      expect(screen.getByRole('menuitemradio', { name: nome })).toBeInTheDocument();
    }
  });

  it('cada tipo traz as MEDIDAS dele, e os campos seguem a forma geométrica', async () => {
    await montar();
    await escolherComponente(/^Pilar$/);

    // PONTO: largura E profundidade (as duas dimensões em planta).
    expect(screen.getByRole('spinbutton', { name: /largura/i })).toHaveValue(200);
    expect(screen.getByRole('spinbutton', { name: /profundidade/i })).toHaveValue(400);

    await escolherComponente(/^Laje$/);

    // AREA: nem largura nem profundidade — a área sai do contorno desenhado.
    // Um campo que não faz nada ensina o usuário a ignorar todos.
    expect(screen.queryByRole('spinbutton', { name: /largura/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: /profundidade/i })).not.toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /espessura/i })).toHaveValue(120);
  });

  it('a ESTACA nasce redonda e abaixo do piso', async () => {
    await montar();
    await escolherComponente(/^Estaca$/);

    expect(screen.getByRole('spinbutton', { name: /di[âa]metro/i })).toHaveValue(300);
    // Cota negativa: é o que põe a fundação abaixo do piso sem exigir um
    // pavimento "Fundação" só para ela.
    expect(
      Number((screen.getByRole('spinbutton', { name: /cota/i }) as HTMLInputElement).value),
    ).toBeLessThan(0);
  });

  it('trocar de tipo troca as medidas INTEIRAS — não mistura viga com pilar', async () => {
    await montar();
    await escolherComponente(/^Pilar$/);
    expect(screen.getByRole('spinbutton', { name: /largura/i })).toHaveValue(200);

    await escolherComponente(/^Viga$/);
    expect(screen.getByRole('spinbutton', { name: /largura/i })).toHaveValue(150);
    expect(screen.getByRole('spinbutton', { name: /altura/i })).toHaveValue(500);
  });
});


/**
 * "Inverter o lado" do corte — alcance, não comportamento.
 *
 * ─── O DEFEITO QUE ISTO FECHA ───────────────────────────────────────────────
 *
 * Em 06/09/2026 o usuário disse: "não encontro o botão Inverter o lado do
 * corte". Ele existia — no painel "Corte selecionado" —, e mesmo assim era
 * praticamente inalcançável, por quatro coisas somadas:
 *
 *   1. criar um corte pula para a VISTA do corte, e o painel só existe na Planta;
 *   2. na planta a marca é a ÚLTIMA na prioridade de clique (ela cruza a planta
 *      inteira; vir antes faria clicar em qualquer parede pegar o corte), então
 *      um corte traçado só por cima da construção não se seleciona;
 *   3. o painel mora dentro da seção Componentes, quase sempre recolhida;
 *   4. e o lado errado só se percebe OLHANDO o corte — onde não havia o botão.
 *
 * É exatamente a classe que este arquivo persegue: ação oferecida que não se
 * alcança. Nenhum teste de unidade a veria, porque `SetCorteProps` sempre
 * funcionou.
 */
describe('BlueprintEditor · inverter o lado do corte', () => {
  /** Um modelo com um corte já traçado — desenhar exige canvas, opaco em jsdom. */
  async function comCorte() {
    const k = await import('../../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), {
      type: 'AddLevel',
      name: 'Térreo',
      elevationMm: 0,
      defaultHeightMm: 2800,
    });
    const comParede = k.applyCommand(nivel.model, {
      type: 'AddWall',
      levelId: nivel.model.levels[0].id,
      a: k.point(0, 0),
      b: k.point(6000, 0),
      thicknessMm: 150,
      heightMm: 2800,
    });
    return k.applyCommand(comParede.model, {
      type: 'AddCorte',
      a: k.point(3000, -3000),
      b: k.point(3000, 3000),
    }).model;
  }

  /**
   * Abre o popover de vistas e escolhe a do corte.
   *
   * O gatilho se procura pelo RÓTULO DA VISTA ATUAL ("Planta"), e não pelo
   * `title`: quando o botão tem conteúdo, é o conteúdo que vira o nome
   * acessível, e o `title` fica só como dica do mouse.
   */
  async function irParaOCorte(user: ReturnType<typeof userEvent.setup>) {
    await user.click(within(screen.getByRole('toolbar')).getByRole('button', { name: /^planta$/i }));
    await user.click(await screen.findByRole('menuitemradio', { name: /corte a/i }));
  }

  beforeEach(async () => {
    loadBranchModel.mockResolvedValue(await comCorte());
  });

  it('NA VISTA DO CORTE o botão existe — era o que faltava', async () => {
    await montar();
    const user = userEvent.setup();
    await irParaOCorte(user);
    const b = await screen.findByRole('button', { name: /inverter o lado/i });
    expect(b).toBeEnabled();
  });

  it('e clicar nele não derruba a vista', async () => {
    await montar();
    const user = userEvent.setup();
    await irParaOCorte(user);
    await user.click(await screen.findByRole('button', { name: /inverter o lado/i }));
    // Continua no corte, e o botão continua ali para desfazer o gesto.
    expect(screen.getByRole('button', { name: /inverter o lado/i })).toBeInTheDocument();
  });

  it('NA PLANTA só aparece com um corte SELECIONADO', async () => {
    // Desde 06/09/2026 a barra da planta também oferece o botão — mas ligado ao
    // corte selecionado, nunca a "o último": com dois cortes, um botão que
    // adivinha qual virar viraria o errado em silêncio.
    //
    // O caso POSITIVO (com a marca selecionada) não cabe aqui: selecionar exige
    // clique no canvas, opaco em jsdom, que é a razão de os painéis de seleção
    // terem sido extraídos para arquivos próprios. O que este caso trava é a
    // outra metade — que o botão não vaze para a planta sem seleção nenhuma.
    await montar();
    expect(screen.queryByRole('button', { name: /inverter o lado/i })).not.toBeInTheDocument();
  });
});

/**
 * O OLHO NA PLANTA BAIXA (16/09/2026): *"os botões de exibir e ocultar presentes
 * nos componentes na visualização 3D devem estar disponíveis na visualização em
 * planta"*. O canvas é opaco em jsdom; o que se prova aqui é o que o painel
 * promete: o olho existe na planta, esconder tira a peça da seleção e oferece
 * "Mostrar tudo", que devolve.
 */
describe('BlueprintEditor · ocultar componentes na planta baixa', () => {
  async function comPilar() {
    const k = await import('../../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    return k.applyBatch(nivel.model, [
      { type: 'AddWall', levelId: t, a: k.point(0, 0), b: k.point(6000, 0), thicknessMm: 150, heightMm: 2800 },
      { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [k.point(3000, 1500)], larguraMm: 200, profundidadeMm: 200, alturaMm: 2800 },
    ]).model;
  }

  it('o olho está na planta; ocultar deseleciona a peça e "Mostrar tudo" devolve', async () => {
    loadBranchModel.mockResolvedValue(await comPilar());
    await montar();
    const user = userEvent.setup();
    await abrirComponentes(user);
    // Seleciona o pilar pela lista.
    await user.click(await screen.findByRole('button', { name: /^P1 · Pilar/ }));
    expect(screen.getByRole('button', { name: /^P1 · Pilar/ })).toHaveAttribute('aria-pressed', 'true');
    // O olho, na planta baixa.
    await user.click(screen.getByRole('button', { name: 'Ocultar P1 · Pilar no desenho' }));
    expect(screen.getByRole('button', { name: 'Exibir P1 · Pilar no desenho' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /^P1 · Pilar/ })).toHaveAttribute('aria-pressed', 'false');
    // Pelo tipo também: "Pilar" inteiro.
    expect(screen.getByRole('button', { name: 'Exibir Pilar no desenho' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /mostrar tudo/i }));
    expect(screen.getByRole('button', { name: 'Ocultar P1 · Pilar no desenho' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mostrar tudo/i })).toBeNull();
  });

  /**
   * 17/09/2026, *"implemente todos"*: os botões sugeridos para o acesso rápido.
   * Enquadrar/zoom mexem na vista do canvas, que em jsdom não tem tamanho —
   * aqui só a presença; o efeito é provado no app real. Duplicar, espelhar,
   * isolar, orto, encaixe, medir e exportar são observáveis no DOM.
   */
  it('acesso rápido: navegar, modos, duplicar/espelhar, isolar, medir e exportar', async () => {
    loadBranchModel.mockResolvedValue(await comPilar());
    await montar();
    const user = userEvent.setup();
    const barra = () => within(screen.getByRole('toolbar'));
    await abrirComponentes(user);

    // Navegar
    for (const nome of [/^enquadrar/i, /^afastar/i, /^aproximar/i, /^escala 1:100/i]) {
      expect(barra().getByRole('button', { name: nome })).toBeInTheDocument();
    }
    // Modos: orto e encaixe nascem ligados e alternam
    const orto = () => barra().getByRole('button', { name: /^trava 90°/i });
    expect(orto()).toHaveAttribute('aria-pressed', 'true');
    await user.click(orto());
    expect(orto()).toHaveAttribute('aria-pressed', 'false');
    const encaixe = () => barra().getByRole('button', { name: /^encaixe/i });
    expect(encaixe()).toHaveAttribute('aria-pressed', 'true');
    await user.click(encaixe());
    expect(encaixe()).toHaveAttribute('aria-pressed', 'false');
    await user.click(encaixe());
    expect(encaixe()).toHaveAttribute('aria-pressed', 'true');

    // Sem seleção: duplicar, espelhar e isolar desligados
    const duplicar = () => barra().getByRole('button', { name: /^duplicar seleção/i });
    const espelharH = () => barra().getByRole('button', { name: /^espelho horizontal/i });
    const isolar = () => barra().getByRole('button', { name: /^isolar seleção|^reexibir tudo/i });
    expect(duplicar()).toBeDisabled();
    expect(espelharH()).toBeDisabled();
    expect(isolar()).toBeDisabled();

    // Seleciona o pilar e DUPLICA: nasce P2, selecionado
    await user.click(await screen.findByRole('button', { name: /^P1 · Pilar/ }));
    expect(duplicar()).toBeEnabled();
    await user.click(duplicar());
    expect(await screen.findByRole('button', { name: /^P2 · Pilar/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^P1 · Pilar/ })).toHaveAttribute('aria-pressed', 'false');

    // ESPELHA a cópia (vira no lugar — continua existindo, continua selecionada)
    await user.click(espelharH());
    expect(screen.getByRole('button', { name: /^P2 · Pilar/ })).toHaveAttribute('aria-pressed', 'true');

    // ISOLA: P1 e a parede somem do desenho; o botão vira "Mostrar tudo" e devolve
    await user.click(isolar());
    expect(screen.getByRole('button', { name: 'Exibir P1 · Pilar no desenho' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ocultar P2 · Pilar no desenho' })).toBeInTheDocument();
    expect(barra().getByRole('button', { name: /^reexibir tudo/i })).toHaveAttribute('aria-pressed', 'true');
    await user.click(barra().getByRole('button', { name: /^reexibir tudo/i }));
    expect(screen.getByRole('button', { name: 'Ocultar P1 · Pilar no desenho' })).toBeInTheDocument();

    // MEDIR: a régua vira a ferramenta ativa, sem trocar de aba
    await user.click(barra().getByRole('button', { name: /^medir linha/i }));
    expect(screen.getByRole('region', { name: /opções da ferramenta/i })).toHaveTextContent(/^Medir linha/);
    expect(screen.getByRole('tab', { name: 'Arquitetura' })).toHaveAttribute('aria-selected', 'true');

    // EXPORTAR: abre Versões (a exportação continua saindo da versão publicada)
    await user.click(barra().getByRole('button', { name: /^exportar a vista atual/i }));
    // Dois títulos "Versões" (o do dock e o do painel): o que importa é o painel com a regra da versão publicada.
    expect(await screen.findByText(/Exportar sempre parte dela, nunca do/)).toBeInTheDocument();
  });

  /**
   * 18/09/2026, roadmap E0.1: girar, alinhar e matriz no grupo Seleção. O giro
   * e o alinhamento são provados no kernel (`blueprintSelecao.test.ts`); aqui o
   * que o DOM mostra — o botão age (Desfazer acende), alinhar exige duas peças,
   * a matriz abre a gaveta e cria N−1 cópias num lote só.
   */
  it('girar, alinhar e matriz: o giro é desfazível, alinhar pede duas peças, a matriz cria P2 e P3 num lote', async () => {
    loadBranchModel.mockResolvedValue(await comPilar());
    await montar();
    const user = userEvent.setup();
    const barra = () => within(screen.getByRole('toolbar'));
    await abrirComponentes(user);

    const girar = () => barra().getByRole('button', { name: /^rotacionar 90° à esquerda/i });
    const alinhar = () => barra().getByRole('button', { name: /^alinhar à referência/i });
    const matriz = () => barra().getByRole('button', { name: /^matriz/i });
    const desfazer = () => barra().getByRole('button', { name: /^desfazer/i });
    expect(girar()).toBeDisabled();
    expect(alinhar()).toBeDisabled();
    expect(matriz()).toBeDisabled();

    await user.click(await screen.findByRole('button', { name: /^P1 · Pilar/ }));
    expect(girar()).toBeEnabled();
    expect(alinhar()).toBeDisabled(); // uma peça só: não há o que alinhar a quê
    expect(desfazer()).toBeDisabled();
    await user.click(girar());
    expect(desfazer()).toBeEnabled(); // o giro entrou no histórico
    expect(screen.getByRole('button', { name: /^P1 · Pilar/ })).toHaveAttribute('aria-pressed', 'true');

    // MATRIZ: gaveta com quantidade e passo; criar gera P2 e P3 (3 exemplares) e seleciona as cópias
    await user.click(matriz());
    const gaveta = await screen.findByTestId('tarefa-matriz');
    expect(within(gaveta).getByLabelText('Exemplares da matriz')).toHaveValue(3);
    await user.click(within(gaveta).getByRole('button', { name: 'Criar matriz' }));
    expect(await screen.findByRole('button', { name: /^P2 · Pilar/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^P3 · Pilar/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: /^P4 · Pilar/ })).not.toBeInTheDocument();
    // Um lote: um Desfazer tira as duas
    await user.click(desfazer());
    expect(screen.queryByRole('button', { name: /^P2 · Pilar/ })).not.toBeInTheDocument();
  });

  it('Ctrl+D duplica a seleção pelo teclado', async () => {
    loadBranchModel.mockResolvedValue(await comPilar());
    await montar();
    const user = userEvent.setup();
    await abrirComponentes(user);
    await user.click(await screen.findByRole('button', { name: /^P1 · Pilar/ }));
    fireEvent.keyDown(window, { key: 'd', ctrlKey: true });
    expect(await screen.findByRole('button', { name: /^P2 · Pilar/ })).toBeInTheDocument();
  });
});

/**
 * EDITAR NO 3D (16/09/2026): *"No modo de visualização em planta ao clicar em um
 * componente estrutural é possível editá-lo no painel lateral, porém não consigo
 * fazer o mesmo no modo de visualização em 3D. Implemente"*. A cena é WebGL,
 * opaca em jsdom; o caminho provável aqui é a lista de Componentes do 3D, que
 * passa pelo MESMO `selecionar` que o clique na cena.
 */
describe('BlueprintEditor · propriedades no 3D', () => {
  it('selecionar um pilar pela lista no 3D abre as propriedades e editar muda o modelo', async () => {
    const k = await import('../../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    const m = k.applyBatch(nivel.model, [
      { type: 'AddWall', levelId: t, a: k.point(0, 0), b: k.point(6000, 0), thicknessMm: 150, heightMm: 2800 },
      { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [k.point(3000, 1500)], larguraMm: 200, profundidadeMm: 200, alturaMm: 2800 },
    ]).model;
    loadBranchModel.mockResolvedValue(m);
    localStorage.setItem('blueprint:vista', JSON.stringify('3d'));
    await montar();
    const user = userEvent.setup();
    await abrirComponentes(user);
    // Antes: sem seleção, sem Propriedades.
    expect(screen.queryByTestId('propriedades-sheet')).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /^P1 · Pilar/ }));
    const props = await screen.findByTestId('propriedades-sheet');
    const rotulo = within(props).getByRole('textbox', { name: /rótulo da peça/i });
    expect(rotulo).toBeInTheDocument();
    await user.clear(rotulo);
    await user.type(rotulo, 'P7');
    await user.tab();
    expect(await screen.findByRole('button', { name: /^P7 · Pilar/ })).toBeInTheDocument();
  });
});

/**
 * GRUPO DE FUNDAÇÃO (16/09/2026): *"um bloco e estaca forma um grupo… ao clicar
 * no grupo implementar opção de duplicação de estacas ou campo quantidade"*,
 * com os critérios de distribuição (centro de carga, ≥ 3φ, simetria).
 */
describe('BlueprintEditor · grupo de fundação', () => {
  async function comFundacao() {
    const k = await import('../../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    return k.applyBatch(nivel.model, [
      { type: 'AddWall', levelId: t, a: k.point(0, 0), b: k.point(6000, 0), thicknessMm: 150, heightMm: 2800 },
      { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [k.point(3000, 1500)], larguraMm: 190, profundidadeMm: 190, alturaMm: 3300, baseMm: -500, rotulo: 'P1' },
      { type: 'AddStructural', levelId: t, kind: 'BLOCO_COROAMENTO', pontos: [k.point(3000, 1500)], larguraMm: 600, profundidadeMm: 600, alturaMm: 600, baseMm: -1100, rotulo: 'B1' },
      { type: 'AddStructural', levelId: t, kind: 'ESTACA', pontos: [k.point(3000, 1500)], larguraMm: 300, profundidadeMm: 300, alturaMm: 8000, baseMm: -9100, circular: true, rotulo: 'E1' },
    ]).model;
  }

  it('um clique na estaca seleciona o grupo; Quantidade 3 redistribui em triângulo; duplo clique isola a peça; Desfazer volta', async () => {
    loadBranchModel.mockResolvedValue(await comFundacao());
    await montar();
    const user = userEvent.setup();
    await abrirComponentes(user);

    // 1 clique na ESTACA → o grupo inteiro (bloco + estaca), painel do grupo.
    await user.click(await screen.findByRole('button', { name: /^E1 · Estaca/ }));
    const props = await screen.findByTestId('propriedades-sheet');
    expect(props).toHaveTextContent(/Grupo de fundação/);
    expect(props).toHaveTextContent(/B1 · 1 estaca/);
    expect(props).toHaveTextContent(/sob o pilar P1/);
    expect(screen.getByRole('button', { name: /^B1 · Bloco de coroamento/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^E1 · Estaca/ })).toHaveAttribute('aria-pressed', 'true');

    // Quantidade 3: triângulo, 3Ø = 90 cm, bloco 150 × 140; rótulos E1 (reaproveitado), E2, E3.
    await user.click(within(props).getByRole('button', { name: /^3 estacas em triângulo/ }));
    const props2 = await screen.findByTestId('propriedades-sheet');
    expect(props2).toHaveTextContent(/B1 · 3 estacas/);
    expect(props2).toHaveTextContent(/Arranjo triângulo/);
    expect(props2).toHaveTextContent(/90 cm/);
    expect(props2).toHaveTextContent(/Bloco 150 × 140 × 60 cm/);
    const linhaBloco = screen.getByRole('button', { name: /^B1 · Bloco de coroamento/ }).closest('li')!;
    expect(within(linhaBloco).getAllByRole('button', { name: /^E[0-9]+ · Estaca/ })).toHaveLength(3);
    expect(within(linhaBloco).getByRole('button', { name: /^E3 · Estaca/ })).toBeInTheDocument();

    // Campo livre: 7 → hexágono com centro.
    const campo = within(props2).getByRole('spinbutton', { name: /quantidade de estacas/i });
    await user.clear(campo);
    await user.type(campo, '7{Enter}');
    expect(await screen.findByText(/hexágono com centro/)).toBeInTheDocument();
    expect(screen.getByTestId('propriedades-sheet')).toHaveTextContent(/B1 · 7 estacas/);

    // Duplo clique na estaca isola a peça: painel da estaca, com o atalho de volta ao grupo.
    await user.dblClick(screen.getByRole('button', { name: /^E2 · Estaca/ }));
    const props3 = await screen.findByTestId('propriedades-sheet');
    expect(props3).toHaveTextContent(/Estaca do bloco B1 · 7 estacas/);
    expect(props3).toHaveTextContent(/Comprimento/);
    await user.click(within(props3).getByRole('button', { name: /editar o grupo/i }));
    expect(await screen.findByText(/Grupo de fundação/)).toBeInTheDocument();

    // Fechar o Sheet DESMARCA (17/09/2026): nada de propriedades no painel lateral.
    expect(await screen.findByTestId('propriedades-sheet')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('propriedades-sheet')).toBeNull();
    expect(screen.queryByRole('region', { name: /propriedades/i })).toBeNull();
    expect(screen.getByRole('button', { name: /^B1 · Bloco de coroamento/ })).toHaveAttribute('aria-pressed', 'false');
    // Desfazer duas vezes: 3 estacas, depois 1.
    await user.click(botao(/^desfazer/i));
    await user.click(botao(/^desfazer/i));
    expect(screen.getByRole('button', { name: 'Bloco de coroamento: 1 peça' })).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: /^B1 · Bloco de coroamento/ }).closest('li')!).getAllByRole('button', { name: /^E[0-9]+ · Estaca/ })).toHaveLength(1);
  });
});

/**
 * ESC NO 3D (16/09/2026): *"quando clico na tecla ESC a seleção se desfaz. O
 * mesmo comportamento não acontece na visualização 3D"*.
 */
describe('BlueprintEditor · Escape limpa a seleção no 3D', () => {
  it('seleciona pela lista no 3D, Escape na cena desfaz a seleção e fecha as Propriedades', async () => {
    const k = await import('../../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    const m = k.applyBatch(nivel.model, [
      { type: 'AddWall', levelId: t, a: k.point(0, 0), b: k.point(6000, 0), thicknessMm: 150, heightMm: 2800 },
      { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [k.point(3000, 1500)], larguraMm: 200, profundidadeMm: 200, alturaMm: 2800, rotulo: 'P1' },
    ]).model;
    loadBranchModel.mockResolvedValue(m);
    localStorage.setItem('blueprint:vista', JSON.stringify('3d'));
    await montar();
    const user = userEvent.setup();
    await abrirComponentes(user);
    await user.click(await screen.findByRole('button', { name: /^P1 · Pilar/ }));
    expect(await screen.findByTestId('propriedades-sheet')).toBeInTheDocument();
    // A cena 3D é o contêiner focável; a tecla chega a ele como chegaria no clique.
    const cena = screen.getByTestId('cena-3d');
    expect(cena).toBeTruthy();
    cena.focus();
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('propriedades-sheet')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^P1 · Pilar/ })).toHaveAttribute('aria-pressed', 'false');
  });
});

/**
 * ARMADURA ESQUEMÁTICA (16/09/2026): *"implementar armadura em vigas, lajes,
 * pilares, blocos e estacas"*. A gaveta "Armadura" (aba Analisar) tem as
 * hipóteses e o kg por família e por peça; mudar fck/bitola muda o kg; o
 * painel da peça e os Quantitativos mostram o aço.
 */
describe('BlueprintEditor · armadura esquemática', () => {
  async function comEstrutura() {
    const k = await import('../../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    return k.applyBatch(nivel.model, [
      { type: 'AddWall', levelId: t, a: k.point(0, 0), b: k.point(6000, 0), thicknessMm: 150, heightMm: 2800 },
      { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [k.point(3000, 1500)], larguraMm: 600, profundidadeMm: 600, alturaMm: 2800, rotulo: 'P1' },
      { type: 'AddStructural', levelId: t, kind: 'VIGA', pontos: [k.point(0, 1500), k.point(6000, 1500)], larguraMm: 150, alturaMm: 400, baseMm: 2400, rotulo: 'V1' },
    ]).model;
  }

  it('a TELA Armadura (Analisar) tem abas Por peça / Por família / Hipóteses; trocar a taxa do pilar muda o kg; voltar fecha; Quantitativos e painel da peça mostram aço', async () => {
    loadBranchModel.mockResolvedValue(await comEstrutura());
    await montar();
    const user = userEvent.setup();
    await abrirAba(/^analisar$/i);
    await user.click(botao(/^armadura/i));
    // É TELA em fluxo, não gaveta: raiz `space-y-6 pb-20`, h1, voltar; o editor some.
    const tela = document.querySelector<HTMLElement>('[data-tela="armadura"]')!;
    expect(tela).toBeTruthy();
    expect(tela.className).toMatch(/space-y-6/);
    expect(within(tela).getByRole('heading', { level: 1 })).toHaveTextContent(/Armadura/);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(tela).getByRole('tab', { name: /por peça/i })).toHaveAttribute('aria-selected', 'true');
    const linhaP1 = () => within(tela).getAllByRole('row').find((r) => /P1/.test(r.textContent ?? ''))!;
    // Pilar 60 × 60: o piso da taxa (100 kg/m³ × 1,008 m³ ≈ 100,8 kg) vence o mínimo.
    expect(linhaP1()).toHaveTextContent(/taxa de referência/);
    expect(linhaP1()).toHaveTextContent(/100,8/);
    // Seção e comprimentos (17/09/2026): 60 × 60; 12 barras de 3,3 m = 39,6 m; estribos n × Ø 5,0 c/15.
    expect(linhaP1()).toHaveTextContent(/60 × 60 cm/);
    expect(linhaP1()).toHaveTextContent(/39,6/);
    expect(linhaP1()).toHaveTextContent(/Ø 5,0 c\/15/);
    // Por família.
    await user.click(within(tela).getByRole('tab', { name: /por família/i }));
    expect(within(tela).getAllByRole('row').some((r) => /Pilares/.test(r.textContent ?? ''))).toBe(true);
    expect(within(tela).getAllByRole('row').some((r) => /Vigas/.test(r.textContent ?? ''))).toBe(true);
    // Hipóteses: taxa do pilar → 0 faz valer o esquema mínimo (12 Ø 12,5 + estribos).
    await user.click(within(tela).getByRole('tab', { name: /hipóteses/i }));
    expect(tela).toHaveTextContent(/Não dimensiona nem detalha/);
    const taxaPilar = within(tela).getByRole('spinbutton', { name: /taxa de referência — pilar/i });
    await user.clear(taxaPilar);
    await user.type(taxaPilar, '0');
    await user.selectOptions(within(tela).getByRole('combobox', { name: /fck do concreto/i }), '40');
    await user.click(within(tela).getByRole('tab', { name: /por peça/i }));
    expect(linhaP1()).toHaveTextContent(/esquema mínimo/);
    expect(linhaP1()).toHaveTextContent(/12 Ø 12,5/);
    const linhaV1 = within(tela).getAllByRole('row').find((r) => /V1/.test(r.textContent ?? ''))!;
    expect(linhaV1).toHaveTextContent(/2 Ø 10,0 inf\./); // fck 40: 0,23 % × 15 × 40 = 1,38 cm² → ainda 2 Ø 10
    // Voltar ao editor.
    await user.click(within(tela).getByRole('button', { name: /voltar ao editor/i }));
    expect(document.querySelector('[data-tela="armadura"]')).toBeNull();

    // Quantitativos (tela, 17/09) — as linhas de aço no Resumo; Voltar para seguir.
    await user.click(botao(/^quantitativos$/i));
    expect(await screen.findByText(/Aço — pilares/)).toBeInTheDocument();
    expect(screen.getByText(/Aço — total \(esquemático\)/)).toBeInTheDocument();
    const telaQ = document.querySelector('[data-tela="quantitativos"]') as HTMLElement;
    await user.click(within(telaQ).getByRole('button', { name: /voltar ao editor/i }));

    await abrirComponentes(user);
    await user.click(await screen.findByRole('button', { name: /^P1 · Pilar/ }));
    const props = await screen.findByTestId('propriedades-sheet');
    expect(props).toHaveTextContent(/kg de aço/);
    expect(props).toHaveTextContent(/12 Ø 12,5/);
  });
});

/**
 * ARMADURA NO 3D (16/09/2026): *"implementar exibição gráfica das armaduras"*.
 * A cena é WebGL (opaca em jsdom); o que se prova aqui é a porta: o item
 * "Armadura" no menu Exibir do 3D, persistido, e o painel da peça com a seção.
 */
describe('BlueprintEditor · armadura desenhada', () => {
  it('no 3D, Exibir tem "Armadura" (nasce desligada) e a escolha persiste', async () => {
    localStorage.clear();
    localStorage.setItem('blueprint:vista', JSON.stringify('3d'));
    await montar();
    const user = userEvent.setup();
    await abrirAba(/^vista$/i);
    await user.click(botao(/exibir/i));
    const item = screen.getByRole('menuitemcheckbox', { name: /armadura/i });
    expect(item).toHaveAttribute('aria-checked', 'false');
    await user.click(item);
    expect(JSON.parse(localStorage.getItem('blueprint:vista3dArmadura')!)).toBe(true);
  });
});

/**
 * LANÇAMENTO MANUAL DE ARMADURA (16/09/2026): no painel da peça, o esquema
 * automático dá lugar ao lançado; vale no kg da gaveta Armadura e a gaveta
 * conta as peças manuais.
 */
describe('BlueprintEditor · armadura manual', () => {
  it('lançar manualmente no painel do pilar muda a origem para manual, o kg e a contagem na gaveta; voltar ao automático limpa', async () => {
    const k = await import('../../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    const m = k.applyBatch(nivel.model, [
      { type: 'AddWall', levelId: t, a: k.point(0, 0), b: k.point(6000, 0), thicknessMm: 150, heightMm: 2800 },
      { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [k.point(3000, 1500)], larguraMm: 190, profundidadeMm: 190, alturaMm: 2800, rotulo: 'P1' },
    ]).model;
    loadBranchModel.mockResolvedValue(m);
    await montar();
    const user = userEvent.setup();
    await abrirComponentes(user);
    await user.click(await screen.findByRole('button', { name: /^P1 · Pilar/ }));
    const props = await screen.findByTestId('propriedades-sheet');
    expect(props).toHaveTextContent(/mínimos NBR 6118/);
    await user.click(within(props).getByRole('button', { name: /lançar manualmente/i }));
    expect(props).toHaveTextContent(/Armadura lançada manualmente/);
    const barras = within(props).getByRole('spinbutton', { name: /barras longitudinais/i });
    await user.clear(barras);
    await user.type(barras, '8');
    expect(props).toHaveTextContent(/8 Ø 12,5/);
    expect(props).toHaveTextContent(/\(manual\)/);
    // A tela Armadura vê a peça manual.
    await abrirAba(/^analisar$/i);
    await user.click(botao(/^armadura/i));
    const tela = document.querySelector<HTMLElement>('[data-tela="armadura"]')!;
    const linhaP1 = within(tela).getAllByRole('row').find((r) => /P1/.test(r.textContent ?? ''))!;
    expect(linhaP1).toHaveTextContent(/manual/);
    expect(linhaP1).toHaveTextContent(/8 Ø 12,5/);
    await user.click(within(tela).getByRole('tab', { name: /hipóteses/i }));
    expect(tela).toHaveTextContent(/1 peça\(s\) com armadura lançada manualmente/);
    await user.click(within(tela).getByRole('button', { name: /voltar todas ao automático/i }));
    expect(tela).not.toHaveTextContent(/com armadura lançada manualmente/);
  });
});

/**
 * ARMADURA NO GRUPO DE FUNDAÇÃO (17/09/2026): *"ao clicar em uma estaca o
 * drawer propriedades não exibe a armadura para edição"* — um clique na estaca
 * seleciona o grupo, então bloco e estacas mostram esquema, seção e o
 * lançamento manual ali.
 */
describe('BlueprintEditor · armadura no painel do grupo', () => {
  it('clicar na estaca abre o grupo com a armadura do bloco e das estacas; lançar manualmente vale para todas as estacas', async () => {
    const k = await import('../../utils/blueprintKernel');
    const nivel = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
    const t = nivel.model.levels[0].id;
    const m = k.applyBatch(nivel.model, [
      { type: 'AddWall', levelId: t, a: k.point(0, 0), b: k.point(6000, 0), thicknessMm: 150, heightMm: 2800 },
      { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [k.point(3000, 1500)], larguraMm: 190, profundidadeMm: 190, alturaMm: 3300, baseMm: -500, rotulo: 'P1' },
      { type: 'AddStructural', levelId: t, kind: 'BLOCO_COROAMENTO', pontos: [k.point(3000, 1500)], larguraMm: 1500, profundidadeMm: 600, alturaMm: 600, baseMm: -1100, rotulo: 'B1' },
      { type: 'AddStructural', levelId: t, kind: 'ESTACA', pontos: [k.point(2550, 1500)], larguraMm: 300, profundidadeMm: 300, alturaMm: 8000, baseMm: -9100, circular: true, rotulo: 'E1' },
      { type: 'AddStructural', levelId: t, kind: 'ESTACA', pontos: [k.point(3450, 1500)], larguraMm: 300, profundidadeMm: 300, alturaMm: 8000, baseMm: -9100, circular: true, rotulo: 'E2' },
    ]).model;
    loadBranchModel.mockResolvedValue(m);
    await montar();
    const user = userEvent.setup();
    await abrirComponentes(user);
    await user.click(await screen.findByRole('button', { name: /^E1 · Estaca/ }));
    const sheet = await screen.findByTestId('propriedades-sheet');
    expect(sheet).toHaveTextContent(/Grupo de fundação/);
    const bloco = within(sheet).getByTestId('armadura-do-bloco');
    expect(bloco).toHaveTextContent(/Armadura do bloco B1/);
    expect(bloco).toHaveTextContent(/malha inferior/);
    const estacas = within(sheet).getByTestId('armadura-das-estacas');
    expect(estacas).toHaveTextContent(/Armadura das estacas/);
    expect(estacas).toHaveTextContent(/kg cada × 2/);
    expect(estacas).toHaveTextContent(/6 Ø 10,0/);
    // Lançar manualmente nas estacas: vale para E1 e E2.
    await user.click(within(estacas).getByRole('button', { name: /lançar manualmente/i }));
    const barras = within(within(sheet).getByTestId('armadura-das-estacas')).getByRole('spinbutton', { name: /barras longitudinais/i });
    await user.clear(barras);
    await user.type(barras, '8');
    expect(within(sheet).getByTestId('armadura-das-estacas')).toHaveTextContent(/8 Ø 10,0/);
    expect(within(sheet).getByTestId('armadura-das-estacas')).toHaveTextContent(/\(manual\)/);
    expect(within(sheet).getByTestId('armadura-das-estacas')).toHaveTextContent(/vale para as 2 estacas/);
    // Na tela Armadura, E1 e E2 estão manuais e o bloco não.
    await user.keyboard('{Escape}');
    await abrirAba(/^analisar$/i);
    await user.click(botao(/^armadura/i));
    const tela = document.querySelector<HTMLElement>('[data-tela="armadura"]')!;
    const linhas = within(tela).getAllByRole('row');
    expect(linhas.find((r) => /E1/.test(r.textContent ?? ''))).toHaveTextContent(/manual/);
    expect(linhas.find((r) => /E2/.test(r.textContent ?? ''))).toHaveTextContent(/manual/);
    expect(linhas.find((r) => /B1/.test(r.textContent ?? ''))).not.toHaveTextContent(/manual/);
  });
});

/**
 * SEÇÕES ORDENÁVEIS (17/09/2026): *"implemente sortable no painel lateral"*.
 * A ordem persistida manda na leitura; a alça reordena e grava.
 */
describe('BlueprintEditor · seções do painel ordenáveis', () => {
  const ordem = () => [...document.querySelectorAll('[data-secao-ordenavel]')].map((el) => el.getAttribute('data-secao-ordenavel'));

  it('nasce Pavimentos · Componentes · Ambientes, respeita a ordem salva e ignora id desconhecido', async () => {
    localStorage.setItem('blueprint:ordemDasSecoes', JSON.stringify(['ambientes', 'nada', 'pavimentos']));
    await montar();
    expect(ordem()).toEqual(['ambientes', 'pavimentos', 'componentes']);
    expect(screen.getAllByRole('button', { name: /arrastar a seção/i })).toHaveLength(3);
  });

  // O arrasto em si não se prova em jsdom (o dnd-kit precisa de geometria
  // real para decidir onde soltar); fica para a prova no app real — ver o plano.
});
