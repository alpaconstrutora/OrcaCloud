// @vitest-environment jsdom
/**
 * A seção "Onde fica" do painel do terreno (07/09/2026).
 *
 * ─── O QUE ESTES CASOS PROTEGEM ─────────────────────────────────────────────
 *
 * Um formulário de coordenada tem um jeito clássico de errar em silêncio:
 * campo vazio virar ZERO. Latitude 0 e longitude 0 é o golfo da Guiné — um
 * lugar de verdade, a 6.000 km daqui, e o IFC sairia afirmando que a obra fica
 * lá. Por isso vazio é AUSENTE, e limpar a latitude limpa a georreferência
 * inteira em vez de deixar meia coordenada gravada.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import PainelTerreno from '../../components/blueprint/PainelTerreno';
import { point, type Boundary, type Georreferencia } from '../../utils/blueprintKernel';

/** Uma divisa qualquer: o painel só se monta com terreno ou divisa. */
const DIVISA: Boundary = {
  id: 'bnd_0001',
  uid: '11111111-2222-4333-8444-555555555555',
  levelId: 'lvl_0001',
  kind: 'LOTE',
  a: point(0, 0),
  b: point(10000, 0),
  papel: null,
} as Boundary;

function montar(georreferencia: Georreferencia | null) {
  const onGeorreferencia = vi.fn();
  render(
    <PainelTerreno
      terreno={null}
      divisaSelecionada={DIVISA}
      onComprimento={vi.fn()}
      onPapel={vi.fn()}
      recuos={{}}
      onRecuo={vi.fn()}
      envelope={null}
      aproveitamento={null}
      taxaOcupacaoMax={null}
      coeficienteMax={null}
      onTaxaOcupacaoMax={vi.fn()}
      onCoeficienteMax={vi.fn()}
      empreendimentos={[]}
      empreendimentoId=""
      onEmpreendimento={vi.fn()}
      onGravarArea={vi.fn()}
      onAbrirQuadro={vi.fn()}
      ladosSemPapel={0}
      ladosDivergentes={0}
      gabaritoAlturaMaxM={null}
      gabaritoPavimentos={null}
      taxaPermeabilidadeMin={null}
      pavimentosDesenhados={1}
      alturaDesenhadaM={null}
      georreferencia={georreferencia}
      onGeorreferencia={onGeorreferencia}
    />,
  );
  return { onGeorreferencia };
}

const CAMBUI: Georreferencia = { latitude: -22.6136, longitude: -46.0578 };

describe('Onde fica · o que a tela grava', () => {
  it('digitar a latitude grava a coordenada', () => {
    // ⚠️ `type` não serve aqui: o input é CONTROLADO pela prop, e num dublê a
    // prop não muda — digitar caractere a caractere deixaria só o último, e o
    // teste afirmaria `6` no lugar de `-22,6136`.
    const { onGeorreferencia } = montar(null);
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '-22.6136' } });
    expect(onGeorreferencia.mock.calls.at(-1)![0].latitude).toBe(-22.6136);
  });

  it('LIMPAR a latitude tira a georreferência inteira', async () => {
    // ⚠️ Não vira zero. Meia coordenada gravada afirmaria que a obra fica no
    // meridiano de Greenwich, na latitude que sobrou.
    const { onGeorreferencia } = montar(CAMBUI);
    await userEvent.clear(screen.getByLabelText('Latitude'));
    expect(onGeorreferencia).toHaveBeenCalledWith(null);
  });

  it('o botão Limpar só aparece quando há coordenada', () => {
    montar(null);
    expect(screen.queryByRole('button', { name: 'Limpar' })).toBeNull();
  });

  it('a cota e o giro do norte são OPCIONAIS — vazio continua vazio', () => {
    const { onGeorreferencia } = montar(CAMBUI);
    fireEvent.change(screen.getByLabelText('Giro do norte'), { target: { value: '30' } });
    expect(onGeorreferencia.mock.calls.at(-1)![0].rotacaoNorteDeg).toBe(30);
  });

  it('APAGAR a cota devolve `null`, e não zero', () => {
    // Zero de cota é o nível do mar — uma afirmação, não uma ausência. E o
    // campo precisa estar PREENCHIDO para ser apagado: mudar de vazio para
    // vazio não dispara evento nenhum, e o teste mediria a chamada anterior.
    const { onGeorreferencia } = montar({ ...CAMBUI, elevacaoM: 745.2 });
    fireEvent.change(screen.getByLabelText('Cota do terreno'), { target: { value: '' } });
    expect(onGeorreferencia.mock.calls.at(-1)![0].elevacaoM).toBeNull();
  });
});

describe('Onde fica · a coordenada do topógrafo', () => {
  it('só aparece depois que há latitude e longitude', () => {
    montar(null);
    expect(screen.queryByLabelText('Leste (E)')).toBeNull();
    expect(screen.queryByLabelText('Sistema de projeção (CRS)')).toBeNull();
  });

  it('a tela DIZ que ela não é calculada a partir da latitude', () => {
    // O usuário precisa saber por que não há um botão de converter: a conta
    // depende do fuso, e o fuso errado põe o modelo a centenas de quilômetros
    // daqui com a forma perfeita.
    montar(CAMBUI);
    expect(screen.getByText(/NÃO é calculada/i)).toBeTruthy();
    expect(screen.getByText(/fuso/i)).toBeTruthy();
  });

  /**
   * A0 (26/09/2026): o CRS deixou de ser campo livre e virou LISTA do catálogo.
   * O teste antigo digitava "E" e afirmava que "E" era gravado — o que provava
   * que o campo repassava texto, não que o sistema escolhido fazia sentido.
   * Agora se afirma o que importa: só sistema do catálogo entra, e o que já
   * estava gravado fora dele continua sendo oferecido (tirar a opção apagaria
   * o dado no primeiro salvamento).
   */
  it('o CRS é escolhido na lista, e grava o código EPSG', async () => {
    const { onGeorreferencia } = montar(CAMBUI);
    const select = screen.getByLabelText('Sistema de projeção (CRS)') as HTMLSelectElement;
    await userEvent.selectOptions(select, 'EPSG:31983');
    expect(onGeorreferencia.mock.calls.at(-1)![0].projetada.crs).toBe('EPSG:31983');
  });

  it('a lista separa o sistema LEGAL dos herdados, e cobre os 8 fusos do Brasil', () => {
    montar(CAMBUI);
    const select = screen.getByLabelText('Sistema de projeção (CRS)') as HTMLSelectElement;
    const grupos = Array.from(select.querySelectorAll('optgroup')).map((g) => g.label);
    expect(grupos[0]).toMatch(/SIRGAS 2000/);
    expect(grupos.some((g) => /herdados/i.test(g))).toBe(true);
    // SIRGAS 2000 / UTM 18S a 25S.
    const sirgas = Array.from(select.querySelectorAll('optgroup')[0].querySelectorAll('option'));
    expect(sirgas).toHaveLength(8);
    expect(sirgas[0].textContent).toMatch(/UTM 18S/);
  });
});
