// @vitest-environment jsdom
/**
 * O painel do terreno dentro do drawer de tarefa (01/10/2026).
 *
 * Ele nasceu como SEÇÃO do painel de propriedades: faixa cinza, borda embaixo, px-4 e o
 * cabeçalho "Terreno". Aberto como tarefa, isso aparecia como uma faixa encaixada no drawer,
 * fora do padrão dos outros painéis — e o cabeçalho repetia o título do drawer. Com `emDrawer`
 * ele fica sem nada disso (o padding vem do drawer); fora dele, nada muda.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PainelTerreno from '../../components/blueprint/PainelTerreno';
import { point, type Boundary } from '../../utils/blueprintKernel';

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

function montar(emDrawer: boolean) {
  const { container } = render(
    <PainelTerreno
      emDrawer={emDrawer}
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
      georreferencia={null}
      onGeorreferencia={vi.fn()}
    />,
  );
  return container.firstElementChild as HTMLElement;
}

describe('PainelTerreno — dentro do drawer × no painel de propriedades', () => {
  it('no drawer: sem faixa cinza, sem borda, sem px-4 e sem o cabeçalho "Terreno"', () => {
    const raiz = montar(true);
    expect(raiz.className).not.toMatch(/\bbg-slate-50\b|\bborder-b\b|\bpx-4\b/);
    expect(screen.queryByRole('heading', { name: /^terreno$/i })).toBeNull();
  });

  it('no painel de propriedades: continua seção, com a faixa e o cabeçalho', () => {
    const raiz = montar(false);
    expect(raiz.className).toMatch(/\bbg-slate-50\b/);
    expect(raiz.className).toMatch(/\bpx-4\b/);
    expect(screen.getByRole('heading', { name: /^terreno$/i })).toBeTruthy();
  });
});
