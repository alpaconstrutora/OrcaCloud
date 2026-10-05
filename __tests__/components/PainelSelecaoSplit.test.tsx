// @vitest-environment jsdom
/**
 * CLIMATIZAÇÃO E4 (04/10/2026): o painel de seleção e posição do split — a
 * tabela por ambiente com o estado, as hipóteses editáveis, lançar/aceitar com
 * o motivo quando desligados, e a conferência.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import PainelSelecaoSplit from '../../components/blueprint/PainelSelecaoSplit';
import { HIPOTESES_DE_SELECAO_PADRAO } from '../../utils/blueprintClimatizacao';
import type { SelecaoDoNivel } from '../../utils/blueprintSelecaoClimatizacao';
import type { PlanoDeEquipamentosSplit } from '../../utils/blueprintPosicaoSplit';

const modelo = { id: 'm12', nome: 'Split hi-wall 12.000 BTU/h', tipoHidraulico: 'EVAPORADORA_HI_WALL' as const, capacidadeBtuH: 12000, potenciaVA: 1100, cotaMm: 2200, larguraMm: 900, profundidadeMm: 220, alturaMm: 300 };
const selecao: SelecaoDoNivel = {
  levelId: 'l1',
  modelos: 8,
  ambientes: [
    { spaceId: 's1', levelId: 'l1', labelUid: null, nome: 'Sala', cargaBtuH: 10500, necessarioBtuH: 11550, evaporadoras: [], instaladaBtuH: null, estado: 'SEM_EQUIPAMENTO', sugestao: { necessarioBtuH: 11550, escolhido: modelo, alternativas: [], motivo: null }, pendencias: [] },
    { spaceId: 's2', levelId: 'l1', labelUid: null, nome: 'Quarto', cargaBtuH: 8000, necessarioBtuH: 8800, evaporadoras: [{ id: 'e1', tipoHidraulico: 'EVAPORADORA_HI_WALL', capacidadeBtuH: 7000, condensadoraId: null, sugerida: false }], instaladaBtuH: 7000, estado: 'SUBDIMENSIONADO', sugestao: { necessarioBtuH: 8800, escolhido: modelo, alternativas: [], motivo: null }, pendencias: ['1 evaporadora(s) sem condensadora (sistema)'] },
  ],
  conferencia: [
    { codigo: 'CATALOGO', item: 'Catálogo', estado: 'OK', obtido: '8 modelo(s)', spaceIds: [] },
    { codigo: 'EQUIPAMENTO', item: 'Equipamento em todo ambiente climatizado', estado: 'FALTA', obtido: '1 sem equipamento: Sala', spaceIds: ['s1'] },
  ],
};
const plano: PlanoDeEquipamentosSplit = {
  comandos: [{ type: 'AddLevel', name: 'x', elevationMm: 0, defaultHeightMm: 2800 }],
  aCriar: [{ spaceId: 's1', nome: 'Sala', modelo, evaporadora: { x: 0, y: 0 }, rotacaoGraus: 0, condensadora: { x: 1, y: 1 }, lugarDaCondensadora: 'FACHADA', potenciaVA: 1100 }],
  jaAtendidos: ['Quarto'],
  semLugar: [],
  apagados: 0,
  motivo: null,
  resumo: ['Sala: Split hi-wall 12.000 BTU/h (12.000 BTU/h, 1.100 VA) — evaporadora na parede, condensadora na fachada'],
};

describe('PainelSelecaoSplit', () => {
  it('tabela por ambiente com estado e sugestão; lançar chama onLancar; aceitar desligado diz por quê; a conferência seleciona os ambientes', () => {
    const onLancar = vi.fn();
    const onSelecionar = vi.fn();
    render(<PainelSelecaoSplit selecao={selecao} plano={plano} hip={HIPOTESES_DE_SELECAO_PADRAO} onHip={() => {}} sugeridas={[]} onLancar={onLancar} onAceitar={() => {}} onSelecionar={onSelecionar} />);
    const tabela = screen.getByTestId('tabela-selecao');
    expect(within(tabela).getByTestId('estado-s1')).toHaveTextContent('sem equipamento');
    expect(within(tabela).getByTestId('estado-s2')).toHaveTextContent('subdimensionado');
    expect(tabela).toHaveTextContent('11.550 BTU/h');
    expect(tabela).toHaveTextContent('sem condensadora');
    expect(screen.getByTestId('plano-resumo')).toHaveTextContent(/Lança 1 split/);
    expect(screen.getByTestId('plano-resumo')).toHaveTextContent(/Já atendidos.*Quarto/);
    fireEvent.click(screen.getByRole('button', { name: 'Lançar os splits' }));
    expect(onLancar).toHaveBeenCalledTimes(1);
    const aceitar = screen.getByRole('button', { name: /^Aceitar/ }) as HTMLButtonElement;
    expect(aceitar.disabled).toBe(true);
    expect(aceitar.title).toMatch(/não há peça de climatização sugerida/);
    fireEvent.click(within(screen.getByTestId('selecao-conferencia')).getByRole('button', { name: '1 sem equipamento: Sala' }));
    expect(onSelecionar).toHaveBeenCalledWith(['s1']);
  });

  it('as hipóteses são editáveis dentro da faixa; com motivo no plano o botão de lançar fica desligado com o motivo; sem ambiente a mensagem diz', () => {
    const onHip = vi.fn();
    const onAceitar = vi.fn();
    const r = render(
      <PainelSelecaoSplit selecao={{ ...selecao, ambientes: [] }} plano={{ ...plano, comandos: [], aCriar: [], motivo: 'nenhum ambiente climatizado no pavimento' }} hip={HIPOTESES_DE_SELECAO_PADRAO} onHip={onHip} sugeridas={['a', 'b']} onLancar={() => {}} onAceitar={onAceitar} />,
    );
    expect(screen.getByTestId('selecao-vazia')).toBeInTheDocument();
    const folga = screen.getByLabelText('Folga sobre a carga (%)') as HTMLInputElement;
    fireEvent.change(folga, { target: { value: '15' } });
    expect(onHip).toHaveBeenLastCalledWith({ ...HIPOTESES_DE_SELECAO_PADRAO, folgaPct: 15 });
    fireEvent.change(folga, { target: { value: '99' } });
    expect(onHip).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText('Tipo de evaporadora preferido'), { target: { value: 'EVAPORADORA_CASSETE' } });
    expect(onHip).toHaveBeenLastCalledWith({ ...HIPOTESES_DE_SELECAO_PADRAO, tipoPreferido: 'EVAPORADORA_CASSETE' });
    const lancar = screen.getByRole('button', { name: 'Lançar os splits' }) as HTMLButtonElement;
    expect(lancar.disabled).toBe(true);
    expect(lancar.title).toBe('nenhum ambiente climatizado no pavimento');
    expect(screen.getByTestId('plano-motivo')).toHaveTextContent('nenhum ambiente climatizado');
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar (2)' }));
    expect(onAceitar).toHaveBeenCalledWith(['a', 'b']);
    r.unmount();
  });
});
