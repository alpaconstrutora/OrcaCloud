// @vitest-environment jsdom
/**
 * Painel do Terreno, Aproveitamento (pendências de 03/10/2026): o CA BÁSICO (sem outorga) ao lado do máximo — passar
 * do básico é aviso (âmbar), não infração — e o texto antigo "um nível desenhado: o coeficiente ainda não soma
 * pavimentos", falso desde a M1 (o aproveitamento já soma todos os pavimentos e a massa), sai.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PainelTerreno from '../../components/blueprint/PainelTerreno';
import { point, type Boundary } from '../../utils/blueprintKernel';

const DIVISA = { id: 'bnd_0001', uid: '11111111-2222-4333-8444-555555555555', levelId: 'lvl_0001', kind: 'LOTE', a: point(0, 0), b: point(10000, 0), papel: null } as Boundary;

function montar(ca: number, onCoeficienteBasico = vi.fn()) {
  render(
    <PainelTerreno
      terreno={null}
      divisaSelecionada={DIVISA}
      onComprimento={vi.fn()}
      onPapel={vi.fn()}
      recuos={{}}
      onRecuo={vi.fn()}
      envelope={null}
      aproveitamento={{ taxaOcupacao: 0.5, coeficienteAproveitamento: ca, areaProjetadaM2: 600, areaConstruidaM2: 600 * ca * 2 }}
      taxaOcupacaoMax={null}
      coeficienteMax={4}
      coeficienteBasico={2}
      onTaxaOcupacaoMax={vi.fn()}
      onCoeficienteMax={vi.fn()}
      onCoeficienteBasico={onCoeficienteBasico}
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
  return onCoeficienteBasico;
}

describe('Aproveitamento — CA básico e outorga', () => {
  it('acima do básico: âmbar e o aviso de outorga; o texto falso de "um nível" não aparece', () => {
    montar(3);
    expect(screen.getByText('Coeficiente básico (sem outorga)')).toBeTruthy();
    const linha = screen.getByText('Coeficiente básico (sem outorga)').parentElement!;
    expect(linha.querySelector('strong')!.className).toMatch(/amber/);
    expect(screen.getByText(/Acima do básico, a área depende de outorga onerosa/)).toBeTruthy();
    expect(screen.queryByText(/ainda não soma pavimentos/)).toBeNull();
    expect(screen.getByText(/Todos os pavimentos desenhados e os blocos de massa/)).toBeTruthy();
  });

  it('dentro do básico: sem aviso; digitar o básico chama o ajuste', () => {
    const fn = montar(1.5);
    expect(screen.queryByText(/depende de outorga/)).toBeNull();
    const campo = screen.getByLabelText('Coeficiente de aproveitamento básico da zona (sem outorga onerosa)') as HTMLInputElement;
    fireEvent.change(campo, { target: { value: '2,5' } });
    fireEvent.blur(campo, { target: { value: '2,5' } });
    expect(fn).toHaveBeenCalledWith(2.5);
  });
});
