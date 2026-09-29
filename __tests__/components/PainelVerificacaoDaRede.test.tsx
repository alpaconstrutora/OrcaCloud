// @vitest-environment jsdom
/**
 * A verificação da rede na gaveta (28/09/2026, E0.1 do roadmap hidrossanitário):
 * pontas abertas e DN fora do necessário, com o atalho para selecionar.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PainelVerificacaoDaRede from '../../components/blueprint/PainelVerificacaoDaRede';
import type { MarcaDeVerificacao } from '../../utils/blueprintVerificacaoRede';

const ponta = (id: string, x: number): MarcaDeVerificacao => ({
  chave: `ponta|${id}|${x}`, tipo: 'PONTA_ABERTA', levelId: 'lvl', at: { x, y: 0 }, texto: 'ponta aberta', severidade: 'ERRO', alvoId: id, disciplina: 'AGUA_FRIA',
});
const dn: MarcaDeVerificacao = {
  chave: 'dn|t9', tipo: 'DN_MENOR', levelId: 'lvl', at: { x: 0, y: 0 }, texto: 'DN 50 < 100 (6 UHC)', severidade: 'ERRO', alvoId: 't9', disciplina: 'ESGOTO',
};

describe('PainelVerificacaoDaRede', () => {
  it('água: conta as pontas abertas e "Selecionar" seleciona os trechos delas (sem repetir)', async () => {
    const onSelecionar = vi.fn();
    render(<PainelVerificacaoDaRede marcas={[ponta('t1', 0), ponta('t1', 2000), dn]} disciplinas={['AGUA_FRIA', 'AGUA_QUENTE']} onSelecionar={onSelecionar} />);
    expect(screen.getByTestId('verificacao-rede')).toHaveTextContent('2 ponta(s) aberta(s)');
    // O DN do esgoto não aparece na gaveta da água.
    expect(screen.queryByText(/DN 50 < 100/)).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Selecionar' }));
    expect(onSelecionar).toHaveBeenCalledWith(['t1']);
  });

  it('esgoto: o DN abaixo do necessário, com o atalho para o trecho', async () => {
    const onSelecionar = vi.fn();
    render(<PainelVerificacaoDaRede marcas={[dn]} disciplinas={['ESGOTO']} onSelecionar={onSelecionar} />);
    expect(screen.getByTestId('verificacao-rede')).toHaveTextContent('DN abaixo do necessário: DN 50 < 100 (6 UHC)');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Selecionar' }));
    expect(onSelecionar).toHaveBeenCalledWith(['t9']);
  });

  it('E5.2: contrafluxo e sem destino aparecem com o que é e o atalho para selecionar', () => {
    const onSelecionar = vi.fn();
    const marcas = [
      { chave: 'fluxo|t1', tipo: 'CONTRAFLUXO' as const, levelId: 'l', at: { x: 0, y: 0 }, texto: 'contrafluxo — sobe até a caixa', severidade: 'ERRO' as const, alvoId: 't1', disciplina: 'ESGOTO' as const },
      { chave: 'destino|t2', tipo: 'SEM_DESTINO' as const, levelId: 'l', at: { x: 0, y: 0 }, texto: 'não chega à caixa de inspeção', severidade: 'ERRO' as const, alvoId: 't2', disciplina: 'ESGOTO' as const },
    ];
    render(<PainelVerificacaoDaRede marcas={marcas} disciplinas={['ESGOTO']} onSelecionar={onSelecionar} />);
    expect(screen.getByText('Contrafluxo: contrafluxo — sobe até a caixa')).toBeTruthy();
    expect(screen.getByText('Sem destino: não chega à caixa de inspeção')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Selecionar' })[1]);
    expect(onSelecionar).toHaveBeenCalledWith(['t2']);
  });

  it('rede em ordem: uma linha só dizendo o que foi conferido', () => {
    render(<PainelVerificacaoDaRede marcas={[]} disciplinas={['ESGOTO']} onSelecionar={() => {}} />);
    expect(screen.getByTestId('verificacao-rede-ok')).toHaveTextContent('nenhuma ponta aberta, todos os DN conferem com a NBR 8160 e todo trecho desce até a caixa');
  });
});
