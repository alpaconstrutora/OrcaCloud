// @vitest-environment jsdom
/**
 * Planta › Dados do lote › "Ficha do empreendimento" (plano docs/planos/2026-10-21-terreno-ficha-planta.md,
 * item 2): o número do desenho ao lado do da ficha, com a situação de cada um; "Levar à ficha" diz por
 * que está desligado; o aviso do que entrou sozinho.
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PainelTerreno from '../../components/blueprint/PainelTerreno';
import type { FichaNoPainel } from '../../components/blueprint/FichaDoTerrenoNaPlanta';
import { compararComFicha } from '../../utils/blueprintTerrenoDaFicha';

const FICHA_GARDEN = { terreno_area: 1229, terreno_frente: 18, terreno_fundos: 11, terreno_profundidade: 71 };

function montar(ficha: FichaNoPainel, onLevarAFicha = vi.fn(), onCriarLotePelaFicha = vi.fn()) {
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
      ficha={ficha}
      onLevarAFicha={onLevarAFicha}
      onCriarLotePelaFicha={onCriarLotePelaFicha}
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
  return onLevarAFicha;
}

const celulas = (campo: string) =>
  within(document.querySelector(`[data-campo="${campo}"]`) as HTMLElement)
    .getAllByRole('cell')
    .map((c) => c.textContent);

describe('Dados do lote › Ficha do empreendimento', () => {
  it('sem lote: mostra o que a ficha diz, e "Levar à ficha" desligado com o motivo', () => {
    montar({
      nome: '011 - Garden Cambuhy',
      vinculado: true,
      linhas: compararComFicha(null, FICHA_GARDEN),
      motivoSemLevar: 'Feche o contorno do lote: a área de contorno aberto é estimativa e não vai para a ficha.',
      avisoAutomatico: null,
    });
    expect(screen.getByTestId('ficha-do-terreno')).toHaveTextContent('011 - Garden Cambuhy');
    expect(celulas('terreno_area')).toEqual(['Área total', '—', '1.229,00 m²', 'Só na ficha']);
    expect(celulas('terreno_fundos')).toEqual(['Fundos', '—', '11,00 m', 'Só na ficha']);
    const botao = screen.getByRole('button', { name: /Levar à ficha/ });
    expect(botao).toBeDisabled();
    expect(botao).toHaveAttribute('title', expect.stringMatching(/Feche o contorno/));
  });

  it('com lote: diferença e vazio aparecem por campo; o botão chama a gravação; o aviso do automático', () => {
    const planta = { areaM2: 1229, frenteM: 18, fundosM: 12, lateralDireitaM: 70, lateralEsquerdaM: 72, profundidadeM: 71 };
    const onLevar = montar({
      nome: '011 - Garden Cambuhy',
      vinculado: true,
      linhas: compararComFicha(planta, { ...FICHA_GARDEN, terreno_profundidade: null }),
      motivoSemLevar: null,
      avisoAutomatico: 'Preenchido automaticamente na ficha (estava vazio): Profundidade.',
    });
    expect(celulas('terreno_area')[3]).toBe('Igual');
    expect(celulas('terreno_fundos')).toEqual(['Fundos', '12,00 m', '11,00 m', 'Diferente']);
    expect(celulas('terreno_profundidade')[3]).toBe('Só na planta');
    expect(screen.getByTestId('ficha-preenchida-sozinha')).toHaveTextContent('Profundidade');
    fireEvent.click(screen.getByRole('button', { name: /Levar à ficha/ }));
    expect(onLevar).toHaveBeenCalledTimes(1);
  });

  it('planta sem vínculo: diz que a ficha é a do empreendimento escolhido na zona', () => {
    montar({ nome: 'Outro', vinculado: false, linhas: compararComFicha(null, null), motivoSemLevar: 'x', avisoAutomatico: null });
    expect(screen.getByTestId('ficha-do-terreno')).toHaveTextContent('escolhido na zona urbanística');
  });

  it('sem lote: "Criar lote pela ficha" abre o painel; com dado faltando, desligado dizendo o quê (22/10/2026)', () => {
    const criar = vi.fn();
    const base = { nome: 'Garden', vinculado: true, linhas: compararComFicha(null, FICHA_GARDEN), motivoSemLevar: 'x', avisoAutomatico: null };
    montar({ ...base, criarLote: { motivo: null } }, vi.fn(), criar);
    fireEvent.click(screen.getByRole('button', { name: /Criar lote pela ficha/ }));
    expect(criar).toHaveBeenCalledTimes(1);
  });

  it('ficha sem profundidade nem área: botão desligado com o motivo; com lote, o botão some', () => {
    const base = { nome: 'Garden', vinculado: true, linhas: compararComFicha(null, null), motivoSemLevar: 'x', avisoAutomatico: null };
    montar({ ...base, criarLote: { motivo: 'A ficha não tem profundidade nem área total — preencha uma das duas em Torres & Unidades › Terreno.' } });
    const botao = screen.getByRole('button', { name: /Criar lote pela ficha/ });
    expect(botao).toBeDisabled();
    expect(botao).toHaveAttribute('title', expect.stringMatching(/não tem profundidade nem área/));
  });

  it('com lote (criarLote null): sem o botão', () => {
    montar({ nome: 'Garden', vinculado: true, linhas: compararComFicha(null, null), motivoSemLevar: 'x', avisoAutomatico: null, criarLote: null });
    expect(screen.queryByRole('button', { name: /Criar lote pela ficha/ })).toBeNull();
  });
});
