// @vitest-environment jsdom
/**
 * CRIAR O LOTE DIGITANDO (03/10/2026) — a gaveta.
 *
 * Cada aba entrega ao pai um contorno FECHADO; o botão desligado diz sempre
 * por quê (não fecha, falta medida, lote existente sem "substituir"); acima da
 * tolerância a escolha de como fechar é de quem digitou; colar do Excel enche
 * a tabela; o memorial colado vai para a tabela de azimutes para corrigir.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PainelLoteDigitado from '../../components/blueprint/PainelLoteDigitado';
import type { LoteFechado } from '../../utils/blueprintLoteDigitado';

function montar(extra: Partial<React.ComponentProps<typeof PainelLoteDigitado>> = {}) {
  const onLancar = vi.fn(async (_l: LoteFechado, _o: { substituir: boolean; medidasDaEscritura: boolean }) => null as string | null);
  render(<PainelLoteDigitado rotacaoNorteDeg={0} georreferencia={null} temLote={false} onLancar={onLancar} {...extra} />);
  return { onLancar, user: userEvent.setup() };
}

const lancar = () => screen.getByRole('button', { name: 'Lançar o lote' });

describe('PainelLoteDigitado', () => {
  it('frente × fundo: 12 × 30 dá 360 m² e lança com papéis, medidas da escritura e confrontante', async () => {
    const { onLancar, user } = montar();
    expect(lancar()).toBeDisabled();
    expect(lancar()).toHaveAttribute('title', 'Digite as medidas do lote');
    await user.type(screen.getByLabelText('Frente (m)'), '12');
    await user.type(screen.getByLabelText('Profundidade (m)'), '30,00');
    await user.type(screen.getByLabelText('Confrontante da frente'), 'Rua das Acácias');
    expect(screen.getByTestId('resumo-do-lote')).toHaveTextContent(/4 lados · área 360,00 m²/);
    await user.click(lancar());
    expect(onLancar).toHaveBeenCalledTimes(1);
    const [lote, opcoes] = onLancar.mock.calls[0];
    expect(lote.anel).toHaveLength(4);
    expect(lote.lados.map((l) => l.papel)).toEqual(['FRENTE', 'LATERAL_DIREITA', 'FUNDOS', 'LATERAL_ESQUERDA']);
    expect(lote.lados[0].confrontante).toBe('Rua das Acácias');
    expect(opcoes).toEqual({ substituir: false, medidasDaEscritura: true, editando: false });
  });

  it('com lote existente: desligado até marcar "Substituir", e diz por quê', async () => {
    const { onLancar, user } = montar({ temLote: true });
    await user.type(screen.getByLabelText('Frente (m)'), '10');
    await user.type(screen.getByLabelText('Profundidade (m)'), '20');
    expect(lancar()).toBeDisabled();
    expect(lancar()).toHaveAttribute('title', expect.stringMatching(/Substituir o lote atual/));
    await user.click(screen.getByRole('checkbox', { name: /Substituir o lote atual/ }));
    expect(lancar()).toBeEnabled();
    await user.click(lancar());
    expect(onLancar.mock.calls[0][1]).toEqual({ substituir: true, medidasDaEscritura: true, editando: false });
  });

  it('azimutes que não fecham: a escolha aparece; a divisa de ajuste entra como 5º lado', async () => {
    const { onLancar, user } = montar();
    await user.click(screen.getByRole('tab', { name: 'Azimutes/rumos' }));
    const valores = [
      ['0', '20'],
      ['90', '20'],
      ['180', '20'],
      ['270', '19,5'],
    ];
    for (let i = 0; i < 4; i += 1) {
      await user.type(screen.getByLabelText(`Azimute ou rumo do trecho ${i + 1}`), valores[i][0]);
      await user.type(screen.getByLabelText(`Distância do trecho ${i + 1}`), valores[i][1]);
    }
    expect(lancar()).toBeDisabled();
    expect(lancar()).toHaveAttribute('title', expect.stringMatching(/Não fecha: sobram 0,50 m/));
    await user.click(screen.getByRole('radio', { name: /divisa de ajuste de 0,500 m/ }));
    expect(lancar()).toBeEnabled();
    await user.click(lancar());
    const [lote] = onLancar.mock.calls[0];
    expect(lote.anel).toHaveLength(5);
    expect(lote.compensacao).toBe('DIVISA_DE_AJUSTE');
  });

  it('lados e ângulos: colar do Excel enche a tabela e cria linhas', async () => {
    const { onLancar, user } = montar();
    await user.click(screen.getByRole('tab', { name: 'Lados e ângulos' }));
    const primeiro = screen.getByLabelText('Vértice do lado 1');
    fireEvent.paste(primeiro, {
      clipboardData: { getData: () => 'P1\t10\t90\tRua A\nP2\t10\t90\tLote 2\nP3\t5\t90\tLote 3\nP4\t5\t90\tLote 3\nP5\t5\t270\tLote 4\nP6\t5\t90\tLote 4\n' },
    });
    expect(screen.getByLabelText('Medida do lado 6')).toHaveValue('5');
    // Um L (10 × 10 sem um canto de 5 × 5; o 270° é o canto reentrante) ⇒ 100 − 25 = 75 m².
    await waitFor(() => expect(screen.getByTestId('resumo-do-lote')).toHaveTextContent(/6 lados · área 75,00 m²/));
    await user.click(lancar());
    const [lote] = onLancar.mock.calls[0];
    expect(lote.vertices).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
    expect(lote.lados[0]).toMatchObject({ medidaMm: 10000, confrontante: 'Rua A' });
  });

  it('coordenadas: nomes viram vértices; nas coordenadas não há "medidas da escritura"', async () => {
    const { onLancar, user } = montar();
    await user.click(screen.getByRole('tab', { name: 'Coordenadas' }));
    fireEvent.change(screen.getByLabelText(/Vértices, um por linha/), { target: { value: 'M1 100 100\nM2 112 100\nM3 112 130\nM4 100 130' } });
    expect(screen.queryByRole('checkbox', { name: /medidas digitadas são as da escritura/ })).toBeNull();
    expect(screen.getByTestId('resumo-do-lote')).toHaveTextContent(/área 360,00 m²/);
    await user.click(lancar());
    const [lote, opcoes] = onLancar.mock.calls[0];
    expect(lote.vertices).toEqual(['M1', 'M2', 'M3', 'M4']);
    expect(lote.anel[0]).toEqual({ x: 0, y: 0 });
    expect(opcoes.medidasDaEscritura).toBe(false);
  });

  it('memorial colado: lança direto ou vai para a tabela de azimutes para corrigir', async () => {
    const { onLancar, user } = montar({ abaInicial: 'MEMORIAL' });
    const texto =
      'Inicia-se a descrição no vértice P1; daí segue com azimute 90°00\'00" e distância de 12,00 m até o vértice P2, confrontando com a Rua A; ' +
      'daí segue com azimute 180°00\'00" e distância de 30,00 m até o vértice P3, confrontando com Lote 11; ' +
      'daí segue com azimute 270°00\'00" e distância de 12,00 m até o vértice P4, confrontando com Lote 20; ' +
      'daí segue com azimute 0°00\'00" e distância de 30,00 m até o vértice P1, confrontando com Lote 13, vértice inicial da descrição, fechando o perímetro.';
    fireEvent.change(screen.getByLabelText('Texto do memorial'), { target: { value: texto } });
    expect(screen.getByTestId('resumo-do-lote')).toHaveTextContent(/área 360,00 m²/);
    await user.click(screen.getByRole('button', { name: /Corrigir na tabela de azimutes/ }));
    expect(screen.getByRole('tab', { name: 'Azimutes/rumos' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Vértice do trecho 2')).toHaveValue('P2');
    expect(screen.getByLabelText('Distância do trecho 2')).toHaveValue('30,00');
    expect(screen.getByLabelText('Confrontante do trecho 1')).toHaveValue('a Rua A');
    await user.click(lancar());
    const [lote] = onLancar.mock.calls[0];
    expect(lote.vertices).toEqual(['P1', 'P2', 'P3', 'P4']);
    expect(lote.lados.map((l) => l.confrontante)).toEqual(['a Rua A', 'Lote 11', 'Lote 20', 'Lote 13']);
  });

  it('o erro do lançamento aparece ao lado do botão', async () => {
    const onLancar = vi.fn(async () => 'O desenho recusou o contorno: teste');
    render(<PainelLoteDigitado rotacaoNorteDeg={0} georreferencia={null} temLote={false} onLancar={onLancar} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Frente (m)'), '10');
    await user.type(screen.getByLabelText('Profundidade (m)'), '20');
    await user.click(lancar());
    expect(await within(screen.getByTestId('painel-lote-digitado')).findByText('O desenho recusou o contorno: teste')).toBeInTheDocument();
  });
});

/**
 * EDITAR (03/10/2026) — *"se o lote já estiver sido criado, e ao clicar em
 * digitar, carregar os valores do lote e permita editar (alterar)"*.
 */
describe('PainelLoteDigitado · editar o lote existente', () => {
  async function existenteRetangular() {
    const k = await import('../../utils/blueprintKernel');
    const ld = await import('../../utils/blueprintLoteDigitado');
    const m0 = k.applyCommand(k.emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
    const f = ld.fecharLote(ld.loteRetangular({ frenteMm: 12000, profundidadeMm: 30000, origem: { x: 5000, y: 2000 }, confrontantes: { FRENTE: 'Rua A', FUNDOS: 'Lote 9' } }));
    let m = k.applyBatch(m0, ld.comandosDoLote(m0, m0.levels[0].id, f, { medidasDaEscritura: true })).model;
    m = k.applyCommand(m, { type: 'NomearVerticesDoTerreno', pontos: f.anel }).model;
    return ld.loteExistente(m)!;
  }

  it('retângulo: abre em Frente × fundo com os valores do lote; mudar a frente e aplicar não pede "substituir"', async () => {
    const existente = await existenteRetangular();
    const { onLancar, user } = montar({ temLote: true, existente });
    expect(screen.getByTestId('editando-lote')).toHaveTextContent(/Editando o lote atual \(4 lados, 360,00 m²\)/);
    expect(screen.getByRole('tab', { name: 'Frente × fundo' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Frente (m)')).toHaveValue('12,00');
    expect(screen.getByLabelText('Profundidade (m)')).toHaveValue('30,00');
    expect(screen.getByLabelText('Confrontante da frente')).toHaveValue('Rua A');
    expect(screen.getByLabelText('Fundos')).toHaveValue('Lote 9');
    // Sem "substituir": editar já é substituir, e nada se perde.
    expect(screen.queryByRole('checkbox', { name: /Substituir o lote atual/ })).toBeNull();
    // A escritura que o lote tem fica, a não ser que se diga o contrário.
    expect(screen.getByRole('checkbox', { name: /medidas digitadas são as da escritura/ })).not.toBeChecked();
    const aplicar = screen.getByRole('button', { name: 'Aplicar as alterações' });
    await user.clear(screen.getByLabelText('Frente (m)'));
    await user.type(screen.getByLabelText('Frente (m)'), '15');
    expect(screen.getByTestId('resumo-do-lote')).toHaveTextContent(/área 450,00 m²/);
    await user.click(aplicar);
    const [lote, opcoes] = onLancar.mock.calls[0];
    expect(opcoes).toEqual({ substituir: true, medidasDaEscritura: false, editando: true });
    // No mesmo lugar (a ponta esquerda da frente fica), com papéis, escritura antiga e nomes herdados.
    expect(lote.anel[0]).toEqual({ x: 5000, y: 2000 });
    expect(lote.lados.map((l) => l.papel)).toEqual(['FRENTE', 'LATERAL_DIREITA', 'FUNDOS', 'LATERAL_ESQUERDA']);
    expect(lote.lados.map((l) => l.escrituraMm)).toEqual([12000, 30000, 12000, 30000]);
    expect(lote.vertices.every((v) => v && /^P\d$/.test(v))).toBe(true);
  });

  it('azimutes: o lote vem linha a linha, no sentido do Roteiro; aplicar sem mexer devolve o mesmo lote com a herança', async () => {
    const existente = await existenteRetangular();
    const { onLancar, user } = montar({ temLote: true, existente, abaInicial: 'AZIMUTES' });
    expect(screen.getByLabelText('Vértice do trecho 1')).toHaveValue(existente.vertices[0]!.nome);
    expect(screen.getByLabelText('Distância do trecho 1')).toHaveValue(existente.distanciasMm[0] === 12000 ? '12,00' : '30,00');
    expect(screen.getByTestId('resumo-do-lote')).toHaveTextContent(/área 360,00 m²/);
    expect(screen.getByTestId('resumo-do-lote')).toHaveTextContent(/erro de fechamento 0,000 m/);
    await user.click(screen.getByRole('button', { name: 'Aplicar as alterações' }));
    const [lote] = onLancar.mock.calls[0];
    expect(lote.anel).toEqual(existente.anel);
    expect(lote.lados.map((l) => l.papel)).toEqual(existente.lados.map((l) => l.papel));
    expect(lote.lados.map((l) => l.escrituraMm)).toEqual(existente.lados.map((l) => l.escrituraMm));
  });

  it('lados e ângulos e coordenadas também vêm preenchidos; as coordenadas são as do desenho', async () => {
    const existente = await existenteRetangular();
    const { onLancar, user } = montar({ temLote: true, existente, abaInicial: 'LADOS' });
    expect(screen.getByLabelText('Ângulo interno do lado 2')).toHaveValue("90°00'00\"");
    await user.click(screen.getByRole('tab', { name: 'Coordenadas' }));
    const texto = (screen.getByLabelText(/Vértices, um por linha/) as HTMLTextAreaElement).value;
    expect(texto.split('\n')).toHaveLength(4);
    expect(texto).toMatch(/^P\d\s+\d+,\d{2}\s+\d+,\d{2}/);
    expect(screen.getByRole('checkbox', { name: /São coordenadas do desenho/ })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Aplicar as alterações' }));
    const [lote] = onLancar.mock.calls[0];
    expect(lote.anel).toEqual(existente.anel);
    // Coordenadas não têm coluna de confrontante: herdam pelo vértice.
    expect(lote.lados.map((l) => l.confrontante)).toEqual(existente.lados.map((l) => l.confrontante));
  });
});
