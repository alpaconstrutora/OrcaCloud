// @vitest-environment jsdom
/**
 * E4 — o painel de versões, exportação e comparação.
 *
 * Classe alvo: **ação apresentada ao usuário que não funciona**. Aqui o
 * candidato principal é o botão de exportar habilitado numa escala em que o
 * desenho não cabe — clicar produziria uma folha que diz 1:50 e mede outra
 * coisa, ou um erro depois do clique, quando já era para ter sido dito antes.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { BlueprintStudy } from '../../types/blueprint';
import {
  applyBatch,
  applyCommand,
  canonicalPayload,
  emptyModel,
  point,
  type Command,
} from '../../utils/blueprintKernel';

const listSnapshots = vi.fn();
const getSnapshot = vi.fn();
const exportarPranchasPdf = vi.fn();
const exportarPranchasPng = vi.fn();
const exportarManifesto = vi.fn();
const exportarDxf = vi.fn();
const exportarIfc = vi.fn();
const publicarNoGed = vi.fn();
const compartilharComCliente = vi.fn();
const listClients = vi.fn();

vi.mock('../../services/blueprintGedService', () => ({
  publicarNoGed: (...a: unknown[]) => publicarNoGed(...a),
  compartilharComCliente: (...a: unknown[]) => compartilharComCliente(...a),
}));

vi.mock('../../services/clientService', () => ({
  clientService: { listClients: (...a: unknown[]) => listClients(...a) },
}));

vi.mock('../../services/blueprintService', () => ({
  listSnapshots: (...a: unknown[]) => listSnapshots(...a),
  getSnapshot: (...a: unknown[]) => getSnapshot(...a),
}));

vi.mock('../../services/blueprintExportService', () => ({
  exportarPranchasPdf: (...a: unknown[]) => exportarPranchasPdf(...a),
  exportarPranchasPng: (...a: unknown[]) => exportarPranchasPng(...a),
  exportarManifesto: (...a: unknown[]) => exportarManifesto(...a),
  exportarDxf: (...a: unknown[]) => exportarDxf(...a),
  exportarIfc: (...a: unknown[]) => exportarIfc(...a),
}));

const study: BlueprintStudy = {
  id: 'std_1',
  organization_id: 'org_1',
  project_id: 'prj_1',
  name: 'Casa térrea',
  unit_system: 'METRIC',
  status: 'RASCUNHO',
  created_by: null,
  created_at: '',
  updated_at: '',
};

/** Payload canônico de uma sala de `l` × `a` metros. */
function payloadSala(l: number, a: number) {
  const r = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  });
  const levelId = r.model.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall',
    levelId,
    a: point(ax, ay),
    b: point(bx, by),
    thicknessMm: 150,
    heightMm: 2800,
  });

  const m = applyBatch(r.model, [
    w(0, 0, l * 1000, 0),
    w(l * 1000, 0, l * 1000, a * 1000),
    w(l * 1000, a * 1000, 0, a * 1000),
    w(0, a * 1000, 0, 0),
  ]).model;

  return JSON.parse(canonicalPayload(m));
}

function snap(id: string, revision: number, l = 4, a = 3) {
  return {
    id,
    study_id: 'std_1',
    branch_id: 'brc_1',
    organization_id: 'org_1',
    revision,
    hash: `hash${revision}00000000000000`,
    kernel_version: 'blueprint-kernel-ts-0.3.0',
    notes: null,
    published_by: null,
    published_at: '2026-08-09T12:00:00Z',
    payload: payloadSala(l, a),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  listSnapshots.mockResolvedValue([snap('snap_2', 2), snap('snap_1', 1)]);
  // Sempre uma promessa: o painel busca os clientes assim que há o que
  // compartilhar, e um mock sem retorno derruba casos que não falam de cliente.
  listClients.mockResolvedValue([]);
  getSnapshot.mockImplementation(async (id: string) =>
    id === 'snap_1' ? snap('snap_1', 1) : snap('snap_2', 2),
  );
});

async function montar() {
  const { default: PainelVersoes } = await import('../../components/blueprint/PainelVersoes');
  render(<PainelVersoes study={study} />);
  await waitFor(() => expect(listSnapshots).toHaveBeenCalled());
}

/**
 * ⚠️ AS CONSULTAS DE BOTÃO SÃO EXATAS, e não por regex.
 *
 * Desde 08/09/2026 este painel tem DOIS botões por formato: um que BAIXA
 * ("PDF") e um que PUBLICA NO GED ("Publicar PDF no GED"). Uma consulta
 * `/PDF/i` casa os dois e falha por ambiguidade — e, se casasse só um, seria
 * pior: o teste poderia estar afirmando sobre o botão errado sem avisar.
 */
describe('PainelVersoes · histórico', () => {
  it('lista as versões com número, data e hash', async () => {
    await montar();
    // Por `role`, e não por texto: "Versão 1" também aparece como opção do
    // seletor de comparação, e `getByText` acharia as duas.
    expect(await screen.findByRole('button', { name: /Versão 2/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Versão 1/ })).toBeInTheDocument();
    // O hash é o que liga a folha impressa à versão.
    expect(screen.getAllByText(/hash200000000000/).length).toBeGreaterThan(0);
  });

  it('sem versão publicada, explica em vez de mostrar tela vazia', async () => {
    listSnapshots.mockResolvedValue([]);
    await montar();
    expect(await screen.findByText(/Nenhuma versão publicada ainda/i)).toBeInTheDocument();
  });

  it('com uma versão só, não oferece comparação', async () => {
    listSnapshots.mockResolvedValue([snap('snap_1', 1)]);
    await montar();
    expect(await screen.findByText(/não há com o que comparar/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/versão a comparar/i)).not.toBeInTheDocument();
  });
});

describe('PainelVersoes · exportação', () => {
  it('exporta na escala escolhida, e a escala chega ao serviço', async () => {
    await montar();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByRole('button', { name: 'PDF' })).toBeEnabled());
    await user.selectOptions(screen.getByLabelText(/escala/i), '50');
    await user.click(screen.getByRole('button', { name: 'PDF' }));

    expect(exportarPranchasPdf).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ denominador: 50, revisao: 2 }),
      expect.arrayContaining(['planta']),
    );
  });

  it('A ESCALA QUE NÃO CABE DESABILITA O BOTÃO, E DIZ QUAL CABERIA', async () => {
    // Descobrir que não cabe DEPOIS de clicar é descobrir tarde. E exportar
    // encolhido produziria uma folha que diz 1:20 e mede outra coisa.
    await montar();
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText(/escala/i), '20');

    await waitFor(() =>
      expect(screen.getByText(/não cabe em 1:20 neste papel/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/A partir de 1:\d+ cabe/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PDF' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'PNG' })).toBeDisabled();
  });

  it('o manifesto continua disponível mesmo quando o desenho não cabe', async () => {
    // Ele não é uma folha: é o JSON que liga o arquivo à versão, e independe de
    // escala.
    await montar();
    await userEvent.setup().selectOptions(screen.getByLabelText(/escala/i), '20');

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /manifesto/i })).toBeEnabled(),
    );
  });

  it('trocar o papel volta a fazer caber', async () => {
    await montar();
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText(/escala/i), '20');
    await waitFor(() => expect(screen.getByRole('button', { name: 'PDF' })).toBeDisabled());

    await user.selectOptions(screen.getByLabelText(/papel/i), 'A1');
    await waitFor(() => expect(screen.getByRole('button', { name: 'PDF' })).toBeEnabled());
  });

  it('exportar parte da VERSÃO escolhida, não do rascunho', async () => {
    await montar();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Versão 1/ }));
    await waitFor(() => expect(getSnapshot).toHaveBeenCalledWith('snap_1'));

    await user.click(screen.getByRole('button', { name: 'PDF' }));
    expect(exportarPranchasPdf).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ revisao: 1, hash: 'hash100000000000000' }),
      expect.anything(),
    );
  });
});

describe('PainelVersoes · comparação (RF-124)', () => {
  it('compara duas versões e mostra a alteração em frase', async () => {
    // A versão 1 é uma sala 4 × 3; a 2, uma 6 × 3. O que interessa a quem revisa
    // é "o ambiente cresceu", não "3 linhas mudaram no JSON".
    listSnapshots.mockResolvedValue([snap('snap_2', 2, 6, 3), snap('snap_1', 1, 4, 3)]);
    getSnapshot.mockImplementation(async (id: string) =>
      id === 'snap_1' ? snap('snap_1', 1, 4, 3) : snap('snap_2', 2, 6, 3),
    );

    await montar();
    const user = userEvent.setup();

    await user.selectOptions(await screen.findByLabelText(/versão a comparar/i), 'snap_1');
    await user.click(screen.getByRole('button', { name: /comparar/i }));

    // 12,00 → 18,00 m² de área de eixo.
    expect(await screen.findByText(/\+6,00 m²/)).toBeInTheDocument();
  });

  it('versões idênticas dizem isso, em vez de lista vazia', async () => {
    await montar();
    const user = userEvent.setup();

    await user.selectOptions(await screen.findByLabelText(/versão a comparar/i), 'snap_1');
    await user.click(screen.getByRole('button', { name: /comparar/i }));

    expect(await screen.findByText(/mesma geometria/i)).toBeInTheDocument();
  });
});

describe('PainelVersoes · DXF, IFC e cotas', () => {
  it('DXF e IFC NÃO dependem da escala caber — eles não têm escala', () => {
    // Os dois saem em 1:1, em unidade real. Desabilitá-los junto com o PDF
    // esconderia uma exportação que funcionaria perfeitamente.
    return (async () => {
      await montar();
      const user = userEvent.setup();

      await user.selectOptions(screen.getByLabelText(/escala/i), '20');
      await waitFor(() => expect(screen.getByRole('button', { name: 'PDF' })).toBeDisabled());

      expect(screen.getByRole('button', { name: 'DXF' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'IFC' })).toBeEnabled();
    })();
  });

  it('a tela diz o que o IFC LEVA e o que NÃO leva', async () => {
    // O que um IFC não contém é indistinguível do que não existe. Descobrir isso
    // só depois de abrir o arquivo no visualizador é tarde. Desde 04/09/2026 o
    // IFC leva portas e janelas; o aviso passou a listar o que ficou de fora.
    await montar();
    // `findByText` casa os nós de texto DIRETOS de um elemento: "não leva" mora
    // num <strong> próprio, e o resto da frase no <p>. Duas asserções, então.
    expect(await screen.findByText(/leva portas e janelas com vão/i)).toBeInTheDocument();
    expect(await screen.findByText(/^não leva$/i)).toBeInTheDocument();
    expect(
      await screen.findByText(/escada, forro, instalações nem armadura/i),
    ).toBeInTheDocument();
  });

  it('a tela declara que DXF e IFC saem em 1:1', async () => {
    await montar();
    expect(await screen.findByText(/1:1, em milímetro real/i)).toBeInTheDocument();
  });

  it('ligar cota chega ao serviço e avisa que a cota é de EIXO', async () => {
    await montar();
    const user = userEvent.setup();

    await user.click(screen.getByRole('checkbox', { name: /cotas/i }));
    expect(await screen.findByText(/medidas no EIXO das paredes/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'PDF' }));
    expect(exportarPranchasPdf).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ cotas: true }),
      expect.anything(),
    );
  });
});

describe('PainelVersoes · publicar no GED', () => {
  beforeEach(() => {
    publicarNoGed.mockReset();
    publicarNoGed.mockResolvedValue([
      { documento: { id: 'doc-1' }, artefato: { tipo: 'ifc' } },
      { documento: { id: 'doc-2' }, artefato: { tipo: 'cobertura' } },
    ]);
  });

  it('leva a ORGANIZAÇÃO e a OBRA do estudo, e a revisão da versão escolhida', async () => {
    // Errar a organização aqui não dá erro de tipo: dá recusa da RLS de
    // `opura_documents`, em produção, com o arquivo já no Storage.
    const user = userEvent.setup();
    await montar();
    await waitFor(() => expect(screen.getByRole('button', { name: 'IFC' })).toBeEnabled());

    await user.click(screen.getByRole('button', { name: 'Publicar IFC no GED' }));

    await waitFor(() => expect(publicarNoGed).toHaveBeenCalled());
    const [formato, , , alvo] = publicarNoGed.mock.calls[0];
    expect(formato).toBe('ifc');
    expect(alvo).toEqual(
      expect.objectContaining({
        organizationId: 'org_1',
        projectId: 'prj_1',
        titulo: 'Casa térrea',
        revisao: 2,
      }),
    );
    expect(String(alvo.hash).length).toBeGreaterThan(0);
  });

  it('diz o que foi parar no GED — inclusive a COBERTURA', async () => {
    const user = userEvent.setup();
    await montar();
    await waitFor(() => expect(screen.getByRole('button', { name: 'IFC' })).toBeEnabled());

    await user.click(screen.getByRole('button', { name: 'Publicar IFC no GED' }));

    // Na MESMA frase: "2 arquivos" sem dizer quais deixaria quem publicou sem
    // saber se a cobertura foi junto — que é justamente o ponto.
    const aviso = await screen.findByText(/2 arquivos em Documentos/);
    expect(aviso).toHaveTextContent('ifc, cobertura');
  });

  it('⚠️ a FALHA aparece ao lado do botão, e não no rodapé', async () => {
    // A fatia anterior desta etapa foi publicada QUEBRADA porque o erro
    // renderizava abaixo da dobra: o serviço levantava, o estado era gravado, e
    // a tela não mostrava nada onde quem clicou estava olhando.
    publicarNoGed.mockRejectedValue(new Error('permission denied for table opura_documents'));
    const user = userEvent.setup();
    await montar();
    await waitFor(() => expect(screen.getByRole('button', { name: 'IFC' })).toBeEnabled());

    await user.click(screen.getByRole('button', { name: 'Publicar IFC no GED' }));

    const aviso = await screen.findByText(/permission denied for table opura_documents/);
    const secao = screen.getByText('Publicar no GED').closest('div');
    expect(secao).toContainElement(aviso);
  });
});

/**
 * Compartilhar com o cliente, de dentro do editor (09/09/2026).
 *
 * Classe alvo: **mandar ao cliente a revisão errada sem nenhum aviso**. O
 * caminho antigo era sair da planta e achar os arquivos no módulo Documentos,
 * com a revisão anterior ao lado da nova e a cobertura como um segundo arquivo
 * de nome parecido — achar o arquivo é o passo que erra, e errar ali não dá
 * erro, dá o arquivo errado no Portal.
 */
describe('PainelVersoes · compartilhar com o cliente', () => {
  beforeEach(() => {
    publicarNoGed.mockReset();
    compartilharComCliente.mockReset();
    listClients.mockReset();
    publicarNoGed.mockResolvedValue([
      { documento: { id: 'doc-1' }, artefato: { tipo: 'ifc' } },
      { documento: { id: 'doc-2' }, artefato: { tipo: 'cobertura' } },
    ]);
    compartilharComCliente.mockResolvedValue(undefined);
    listClients.mockResolvedValue([
      { id: 'cli-1', name: 'Construtora Alfa' },
      { id: 'cli-2', name: 'Beta Incorporações' },
    ]);
  });

  /** Publica o IFC e devolve o `user` já pronto para o resto do caso. */
  async function publicarIfc() {
    const user = userEvent.setup();
    await montar();
    await waitFor(() => expect(screen.getByRole('button', { name: 'IFC' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Publicar IFC no GED' }));
    await waitFor(() => expect(publicarNoGed).toHaveBeenCalled());
    return user;
  }

  it('não oferece compartilhar ANTES de publicar — não há o que mandar', async () => {
    await montar();
    await waitFor(() => expect(screen.getByRole('button', { name: 'IFC' })).toBeEnabled());
    expect(screen.queryByRole('button', { name: 'Compartilhar' })).toBeNull();
  });

  it('manda os arquivos que ACABARAM de ser publicados — a cobertura junto', async () => {
    const user = await publicarIfc();

    await screen.findByRole('button', { name: 'Compartilhar' });
    await waitFor(() => expect(listClients).toHaveBeenCalledWith('org_1'));
    await user.selectOptions(screen.getByLabelText('Cliente'), 'cli-1');
    await user.click(screen.getByRole('button', { name: 'Compartilhar' }));

    // Os DOIS: reter a cobertura entregaria o IFC parcial sem o que o limita.
    await waitFor(() => expect(compartilharComCliente).toHaveBeenCalledWith(['doc-1', 'doc-2'], 'cli-1'));
    expect(await screen.findByText(/2 arquivos no Portal de Construtora Alfa/)).toBeTruthy();
  });

  it('⚠️ os clientes vêm da organização do ESTUDO, e não do seletor do topo', async () => {
    // Com "Todas as organizações" no topo, o contexto devolve nulo e a lista
    // viria de TODAS — e compartilhar documento da org A com cliente da org B é
    // vazamento entre inquilinos.
    await publicarIfc();
    await waitFor(() => expect(listClients).toHaveBeenCalledWith('org_1'));
  });

  it('⚠️ TROCAR DE VERSÃO apaga a oferta — senão o cliente recebe a revisão errada', async () => {
    // Publicar a revisão 2, mudar o seletor para a 1 e clicar em compartilhar:
    // os ids são os da 2, a tela fala da 1, e ninguém é avisado.
    const user = await publicarIfc();
    await screen.findByRole('button', { name: 'Compartilhar' });

    await user.click(screen.getByRole('button', { name: /Versão 1/ }));
    await waitFor(() => expect(getSnapshot).toHaveBeenCalledWith('snap_1'));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Compartilhar' })).toBeNull());
    expect(compartilharComCliente).not.toHaveBeenCalled();
  });

  it('publicar DOIS formatos manda os dois — o segundo não substitui o primeiro', async () => {
    const user = await publicarIfc();
    publicarNoGed.mockResolvedValue([{ documento: { id: 'doc-9' }, artefato: { tipo: 'pdf' } }]);
    await user.click(screen.getByRole('button', { name: 'Publicar PDF no GED' }));

    // O número vai dentro de um `<strong>`, então a frase está partida em
    // vários nós — a asserção é sobre o texto da SEÇÃO.
    await waitFor(() => {
      const secao = screen.getByText('Compartilhar com o cliente').closest('div')!;
      expect(secao.textContent).toContain('3 arquivos que você acabou de publicar');
    });
    await user.selectOptions(screen.getByLabelText('Cliente'), 'cli-2');
    await user.click(screen.getByRole('button', { name: 'Compartilhar' }));

    await waitFor(() =>
      expect(compartilharComCliente).toHaveBeenCalledWith(['doc-1', 'doc-2', 'doc-9'], 'cli-2'),
    );
  });

  it('a FALHA aparece ao lado do botão, e o aviso de sucesso não fica', async () => {
    compartilharComCliente.mockRejectedValue(new Error('permission denied for opura_document_portal_shares'));
    const user = await publicarIfc();
    await screen.findByRole('button', { name: 'Compartilhar' });
    await user.selectOptions(screen.getByLabelText('Cliente'), 'cli-1');
    await user.click(screen.getByRole('button', { name: 'Compartilhar' }));

    const aviso = await screen.findByText(/permission denied for opura_document_portal_shares/);
    const secao = screen.getByText('Compartilhar com o cliente').closest('div');
    expect(secao).toContainElement(aviso);
    expect(screen.queryByText(/no Portal de/)).toBeNull();
  });
});
