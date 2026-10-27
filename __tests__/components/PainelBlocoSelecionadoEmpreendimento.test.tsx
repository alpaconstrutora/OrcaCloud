// @vitest-environment jsdom
/**
 * O BLOCO E A TORRE DO EMPREENDIMENTO (27/10/2026): *"os dados do empreendimento … aba torres e unidades deve-se ser
 * vinculados. Torre A e Torre B, quantidade de pavimentos, nome dos pavimentos"*. O painel do bloco diz de qual torre
 * ele é, compara os pavimentos, dá o nome de cada pavimento e ajusta.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PainelBlocoSelecionado from '../../components/blueprint/PainelBlocoSelecionado';
import type { Bloco } from '../../utils/blueprintKernel';
import type { MedidaDoBloco, PisoDoBloco } from '../../utils/blueprintMassa';
import type { LinhaDoAjuste } from '../../utils/blueprintAjusteAoEmpreendimento';

const BLOCO = { id: 'b1', uid: 'u-b1', levelId: 'l0', nome: 'Torre A', uso: 'RESIDENCIAL', pontos: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], cotaBaseMm: 0, pavimentos: 6, peDireitoMm: 3000 } as unknown as Bloco;
const piso = (indice: number): PisoDoBloco => ({ indice, baseMm: (indice - 1) * 3000, topoMm: indice * 3000, subsolo: false, ordinal: indice, acimaDoGabarito: false, motivoDoGabarito: null, pecasDoEnvelope: [], cabe: true, areaForaMm2: 0, afastamentoMm: null });
const MEDIDA: MedidaDoBloco = {
  blocoId: 'b1', nome: 'Torre A', uso: 'RESIDENCIAL', projecaoM2: 176, pavimentos: 6, pavimentosNoSubsolo: 0, areaConstruidaM2: 1056, areaComputavelM2: 1056, areaNaoComputavelM2: 0,
  baseMm: 0, topoMm: 18000, alturaM: 18, pisos: [1, 2, 3, 4, 5, 6].map(piso), pisosAcimaDoGabarito: 0, pisosForaDoEnvelope: 0, apoiadoEm: null,
};
const LINHA: LinhaDoAjuste = { torre: 'Torre A', fonte: 'UNIDADES', acima: 4, garagens: 2, blocoNome: 'Torre A', pavimentosNaPlanta: 6, garagensNaPlanta: 0, estado: 'AJUSTAR' };
const PAPEL = { torre: 'Torre A', tipo: 'TORRE' as const, nomesDosPisos: ['Térreo', 'Pavimento 1', 'Pavimento 2', 'Pavimento 3'] };

const montar = (extra: { pendentes?: number; onAjustar?: () => Promise<string | void>; piso?: number | null } = {}) =>
  render(
    <PainelBlocoSelecionado
      bloco={BLOCO}
      medida={MEDIDA}
      onProps={vi.fn()}
      onExcluir={vi.fn()}
      onAbrirEstudo={vi.fn()}
      pisoSelecionado={extra.piso ?? null}
      onPiso={vi.fn()}
      empreendimento={{
        nome: '011 - Garden Cambuhy',
        papel: PAPEL,
        linha: LINHA,
        avisos: ['Torre "Torre A": sem número de pavimentos no cadastro da torre — contados pelas unidades (4 acima do solo + 2 abaixo).'],
        pendentes: extra.pendentes ?? 2,
        onAjustar: extra.onAjustar ?? vi.fn(async () => 'Blocos ajustados'),
      }}
    />,
  );

describe('painel do bloco › Empreendimento', () => {
  it('diz de qual torre o bloco é e compara os pavimentos', () => {
    montar();
    const t = screen.getByTestId('torre-do-bloco');
    expect(t).toHaveTextContent('Torre A: 4 pavimento(s) + 2 garagem(ns) pelos andares das unidades');
    expect(t).toHaveTextContent('na planta 6');
    expect(t).toHaveTextContent('a ajustar');
    expect(screen.getByTestId('avisos-do-empreendimento')).toHaveTextContent('sem número de pavimentos');
  });

  it('o pavimento escolhido leva o nome do Empreendimento', () => {
    montar({ piso: 2 });
    expect(screen.getByTestId('resumo-do-pavimento')).toHaveTextContent('Torre A · 2º pavimento de 6 — Pavimento 1');
    expect(screen.getByRole('button', { name: '1º' })).toHaveAttribute('title', expect.stringContaining('Térreo'));
  });

  it('Ajustar chama o editor e mostra o resultado; sem nada a ajustar, desligado dizendo por quê', async () => {
    const onAjustar = vi.fn(async () => 'Blocos ajustados às torres do Empreendimento (2 mudança(s), Ctrl+Z desfaz).');
    const { unmount } = montar({ onAjustar });
    await userEvent.click(screen.getByTestId('ajustar-ao-empreendimento'));
    expect(onAjustar).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('ajuste-resultado')).toHaveTextContent('2 mudança(s)');
    unmount();
    montar({ pendentes: 0 });
    const b = screen.getByTestId('ajustar-ao-empreendimento');
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute('title', expect.stringContaining('já seguem'));
  });
});
