// @vitest-environment jsdom
/**
 * A zona urbanística aparece ANTES de haver lote (03/10/2026). Sem divisa nenhuma, o painel do terreno saía por um
 * caminho antecipado que só mostrava a georreferência e a topografia — a seção da zona (Mapa Regulatório) sumia,
 * embora escolher a lei não dependa do lote desenhado (o próprio comentário do slot dizia isso).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PainelTerreno from '../../components/blueprint/PainelTerreno';

function montar(comTopografia: boolean) {
  render(
    <PainelTerreno
      emDrawer
      terreno={null}
      divisaSelecionada={null}
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
      zonaSlot={<div data-testid="zona">Zona urbanística</div>}
      topografiaSlot={comTopografia ? <div data-testid="topo">Curvas de nível</div> : undefined}
    />,
  );
}

describe('a zona urbanística sem lote desenhado', () => {
  it('aparece junto da georreferência e da topografia', () => {
    montar(true);
    expect(screen.getByTestId('zona')).toBeTruthy();
    expect(screen.getByTestId('topo')).toBeTruthy();
    expect(screen.getByText('Latitude')).toBeTruthy();
  });

  it('aparece mesmo sem o slot de topografia', () => {
    montar(false);
    expect(screen.getByTestId('zona')).toBeTruthy();
  });
});
