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
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
  /^(Componentes|Parede|Parede em retângulo|Parede em polígono|Porta|Porta de correr|Janela|Vão livre|Pilar|Viga|Laje|Estaca|Bloco de coroamento|Viga de fundação)$/;

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

    expect(botao(/selecionar/i)).toBeInTheDocument();
    // Nasce com a Parede ativa — o editor abre pronto para desenhar.
    expect(botaoComponentes()).toHaveTextContent('Parede');
    expect(screen.getByLabelText(/ambientes derivados/i)).toBeInTheDocument();
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
    await userEvent.setup().click(botao(/selecionar/i));
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

describe('BlueprintEditor · quantitativos', () => {
  it('a seção existe e anuncia a versão da política', async () => {
    await montar();
    const user = userEvent.setup();

    await user.click(cabecalhoDaSecao(/quantitativos/i));
    // RF-121: o resultado precisa dizer sob qual política foi calculado.
    expect(screen.getByText(/pol[íi]tica quant-/i)).toBeInTheDocument();
  });

  it('sem ambiente fechado, explica que não há o que quantificar', async () => {
    await montar();
    const user = userEvent.setup();

    await user.click(cabecalhoDaSecao(/quantitativos/i));
    expect(screen.getByText(/sem contorno fechado n[ãa]o h[áa] [áa]rea/i)).toBeInTheDocument();
  });

  it('sem versão publicada, explica que orçamento não cita rascunho', async () => {
    await montar();
    const user = userEvent.setup();

    await user.click(cabecalhoDaSecao(/quantitativos/i));
    // A distinção oficial × ao vivo é o ponto do painel: o número que o orçamento
    // cita não pode vir de geometria que ainda muda.
    expect(screen.getByText(/o or[çc]amento n[ãa]o cita rascunho/i)).toBeInTheDocument();
  });

  it('abrir Quantitativos NÃO fecha Ambientes — o painel é multi-aberto', async () => {
    // Este teste trocou de sentido em 29/08/2026. Enquanto eram abas, ele
    // afirmava o contrário: escolher uma DESLIGAVA a outra. Viraram seções
    // irmãs de accordion justamente para poder ver as duas juntas, então a
    // asserção que protegia o comportamento antigo passou a proteger o defeito.
    await montar();
    const user = userEvent.setup();

    const secAmb = cabecalhoDaSecao(/ambientes/i);
    const secQtd = cabecalhoDaSecao(/quantitativos/i);

    expect(secAmb).toHaveAttribute('aria-expanded', 'true');
    expect(secQtd).toHaveAttribute('aria-expanded', 'false');

    await user.click(secQtd);
    expect(secQtd).toHaveAttribute('aria-expanded', 'true');
    expect(secAmb).toHaveAttribute('aria-expanded', 'true');
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
  it('a seção Orçamento existe e abre sem fechar Ambientes', async () => {
    await montar();
    const user = userEvent.setup();

    const secOrc = cabecalhoDaSecao(/orçamento/i);
    expect(secOrc).toHaveAttribute('aria-expanded', 'false');

    await user.click(secOrc);
    expect(secOrc).toHaveAttribute('aria-expanded', 'true');
    expect(cabecalhoDaSecao(/ambientes/i)).toHaveAttribute('aria-expanded', 'true');
  });

  it('estudo sem obra vinculada avisa antes de o usuário montar o de-para', async () => {
    await montar();
    await userEvent.setup().click(cabecalhoDaSecao(/orçamento/i));

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

describe('BlueprintEditor · precisão do mover', () => {
  beforeEach(() => localStorage.clear());

  it('nasce seguindo a grade — quem não pediu precisão fixa segue como antes', async () => {
    await montar();
    const seletor = screen.getByRole('combobox', { name: /precis[ãa]o/i });
    expect((seletor as HTMLSelectElement).value).toBe('grade');
  });

  it('oferece passo em mm que NÃO depende do zoom, com 1 mm de piso', async () => {
    // O piso é o do kernel: coordenada é inteira em mm (`assertIntegerMm`).
    await montar();
    const seletor = screen.getByRole('combobox', { name: /precis[ãa]o/i });
    const valores = Array.from((seletor as HTMLSelectElement).options).map((o) => o.value);
    expect(valores).toEqual(['grade', '1', '5', '10', '25', '50', '100', '500', '1000']);
  });

  it('escolher um passo fixo aparece no rodapé, para o usuário saber o que está valendo', async () => {
    await montar();
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

  it('NA PLANTA ele não aparece na barra — lá o caminho é o painel da linha', async () => {
    await montar();
    expect(screen.queryByRole('button', { name: /inverter o lado/i })).not.toBeInTheDocument();
  });
});
