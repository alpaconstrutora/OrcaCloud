// @vitest-environment jsdom
/**
 * CLIMATIZAÇÃO E6 (05/10/2026): o painel do VRF — tabela por sistema, ligar as
 * evaporadoras sem sistema, trocar a condensadora, hipóteses na faixa,
 * Lançar/Aceitar com motivo quando desligados e a conferência.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import PainelVrf from '../../components/blueprint/PainelVrf';
import { HIPOTESES_DO_VRF_PADRAO } from '../../utils/blueprintClimatizacao';
import type { AnaliseDoVrf, PlanoDoVrf } from '../../utils/blueprintVrf';
import type { Terminal } from '../../utils/blueprintKernel';

const cond = { id: 'c1', uid: 'uc1', levelId: 'l1', disciplina: 'FRIGORIGENA', tipo: 'VRF', tipoHidraulico: 'CONDENSADORA_VRF', at: { x: 0, y: 0 }, cotaMm: 850, capacidadeBtuH: 96000 } as Terminal;
const ev = (id: string) => ({ ...cond, id, uid: `u${id}`, tipoHidraulico: 'EVAPORADORA_HI_WALL', capacidadeBtuH: 24000, condensadoraId: 'c1' }) as Terminal;
const analise: AnaliseDoVrf = {
  sistema: { condensadora: cond, nome: 'CD-1', evaporadoras: [ev('e1'), ev('e2'), ev('e3'), ev('e4')], foraDoPavimento: [], derivadores: [] },
  somaBtuH: 96000,
  capacidadeBtuH: 96000,
  taxaPct: 100,
  alcancadas: ['e1', 'e2', 'e3', 'e4'],
  naoAlcancadas: [],
  trechos: [],
  derivacoes: [{ no: 'n', levelId: 'l1', at: { x: 0, y: 0 }, cotaMm: 2500, jusanteBtuH: 96000, temDerivador: true }],
  comprimentoTotalM: 22.29,
  maisDistanteM: 20.835,
  aposPrimeiraDerivacaoM: 12.485,
  desnivelCondEvapM: 1.35,
  desnivelEntreEvapM: 0,
};
const plano: PlanoDoVrf = { comandos: [{ type: 'AddLevel', name: 'x', elevationMm: 0, defaultHeightMm: 2800 }], aCriar: [{ condensadoraId: 'c1', nome: 'CD-1', evaporadoras: 4, derivadores: 3, avisos: [] }], jaLigados: [], semLugar: [], apagados: 0, motivo: null, resumo: ['CD-1: 4 evaporadora(s), 3 derivador(es), 22,3 m de linha'] };
const conferencia = [{ codigo: 'TAXA', item: 'Taxa de combinação entre 50 % e 130 %', estado: 'OK' as const, obtido: 'CD-1 100 %', spaceIds: [] }];

describe('PainelVrf', () => {
  it('tabela por sistema (Σ/cond, taxa, comprimentos), ligar e trocar a condensadora, lançar; aceitar desligado com motivo', () => {
    const onLigar = vi.fn();
    const onTrocar = vi.fn();
    const onLancar = vi.fn();
    render(
      <PainelVrf
        analises={[analise]}
        plano={plano}
        conferencia={conferencia}
        hip={HIPOTESES_DO_VRF_PADRAO}
        onHip={() => {}}
        semSistema={['e9', 'e8']}
        condensadoras={[{ id: 'c1', nome: 'CD-1' }, { id: 'c2', nome: 'CD-2' }]}
        onLigar={onLigar}
        onTrocar={onTrocar}
        sugeridos={{ trechos: [], terminais: [] }}
        onLancar={onLancar}
        onAceitar={() => {}}
      />,
    );
    const linha = within(screen.getByTestId('tabela-vrf')).getByRole('row', { name: 'Sistema CD-1' });
    expect(linha).toHaveTextContent('96.000 / 96.000');
    expect(linha).toHaveTextContent('100 %');
    expect(linha).toHaveTextContent('22,3 m');
    expect(linha).toHaveTextContent('12,5 m');
    expect(linha).toHaveTextContent('1 derivação(ões)');
    fireEvent.click(within(linha).getByRole('button', { name: 'Ligar 2 sem sistema' }));
    expect(onLigar).toHaveBeenCalledWith('c1');
    const troca = within(linha).getByLabelText('Trocar a condensadora de CD-1') as HTMLSelectElement;
    expect([...troca.options].map((o) => o.textContent)).toEqual(['Trocar condensadora…', 'CD-2']);
    fireEvent.change(troca, { target: { value: 'c2' } });
    expect(onTrocar).toHaveBeenCalledWith('c1', 'c2');
    expect(screen.getByTestId('vrf-resumo')).toHaveTextContent(/Lança 1 árvore/);
    fireEvent.click(screen.getByRole('button', { name: 'Lançar a rede VRF' }));
    expect(onLancar).toHaveBeenCalledTimes(1);
    const aceitar = screen.getByRole('button', { name: /^Aceitar/ }) as HTMLButtonElement;
    expect(aceitar.disabled).toBe(true);
    expect(aceitar.title).toMatch(/não há trecho ou derivador do VRF sugerido/);
    expect(screen.getByTestId('vrf-conferencia')).toHaveTextContent('CD-1 100 %');
  });

  it('sem condensadora VRF a mensagem diz; ligar desligado sem evaporadora solta; hipóteses na faixa; motivo desliga o lançar', () => {
    const onHip = vi.fn();
    const r = render(<PainelVrf analises={[]} plano={{ ...plano, aCriar: [], comandos: [], motivo: 'nenhuma condensadora VRF neste pavimento' }} conferencia={[]} hip={HIPOTESES_DO_VRF_PADRAO} onHip={onHip} semSistema={[]} condensadoras={[]} onLigar={() => {}} onTrocar={() => {}} sugeridos={{ trechos: ['t1'], terminais: ['d1'] }} onLancar={() => {}} onAceitar={() => {}} />);
    expect(screen.getByTestId('vrf-vazio')).toBeInTheDocument();
    const lancar = screen.getByRole('button', { name: 'Lançar a rede VRF' }) as HTMLButtonElement;
    expect(lancar.disabled).toBe(true);
    expect(lancar.title).toMatch(/nenhuma condensadora VRF/);
    expect(screen.getByRole('button', { name: 'Aceitar (2)' })).toBeInTheDocument();
    const taxa = screen.getByLabelText('Taxa máxima (%)') as HTMLInputElement;
    fireEvent.change(taxa, { target: { value: '120' } });
    expect(onHip).toHaveBeenLastCalledWith({ ...HIPOTESES_DO_VRF_PADRAO, taxaMaxPct: 120 });
    fireEvent.change(taxa, { target: { value: '500' } });
    expect(onHip).toHaveBeenCalledTimes(1);
    r.unmount();
    render(<PainelVrf analises={[analise]} plano={plano} conferencia={[]} hip={HIPOTESES_DO_VRF_PADRAO} onHip={() => {}} semSistema={[]} condensadoras={[{ id: 'c1', nome: 'CD-1' }]} onLigar={() => {}} onTrocar={() => {}} sugeridos={{ trechos: [], terminais: [] }} onLancar={() => {}} onAceitar={() => {}} />);
    const ligar = screen.getByRole('button', { name: 'Ligar 0 sem sistema' }) as HTMLButtonElement;
    expect(ligar.disabled).toBe(true);
    expect(ligar.title).toMatch(/não há evaporadora sem sistema/);
    expect((screen.getByLabelText('Trocar a condensadora de CD-1') as HTMLSelectElement).disabled).toBe(true);
  });
});
