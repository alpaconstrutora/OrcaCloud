/**
 * A ORDEM DAS UNIDADES NO PAVIMENTO (27/10/2026): *"Temos que fazer uma ordenação de duas maneiras, automática como
 * você está sugerindo e manual"*. A manual mora no Empreendimento (sort_order, setas na aba Torres e Unidades); a
 * automática ordena pelo número da unidade (a coluna: 101, 201 e 301 caem no mesmo lugar). Puro.
 */
import { describe, expect, it } from 'vitest';
import { compararNaOrdemDoEmpreendimento, compararPorNumero, moverNaOrdem, ordemPorNumero } from '../utils/empreendimentoOrdemDasUnidades';

const u = (id: string, sort_order = 0) => ({ id, name: id, sort_order });

describe('compararPorNumero', () => {
  it('pela coluna (os dois últimos dígitos): o 3º andar da Torre A do Garden (303, 204, 201, 202) alinha com o 2º', () => {
    expect(['303', '204', '201', '202'].map((n) => u(n)).sort(compararPorNumero).map((x) => x.name)).toEqual(['201', '202', '303', '204']);
  });

  it('nome sem número vai para o fim, em ordem alfabética', () => {
    expect(['Área Comum Horizontal', '004', '002'].map((n) => u(n)).sort(compararPorNumero).map((x) => x.name)).toEqual(['002', '004', 'Área Comum Horizontal']);
  });

  it('número com prefixo (Apto 12, Casa 3): pelo número', () => {
    expect(['Casa 12', 'Casa 3', 'Casa 1'].map((n) => u(n)).sort(compararPorNumero).map((x) => x.name)).toEqual(['Casa 1', 'Casa 3', 'Casa 12']);
  });
});

describe('compararNaOrdemDoEmpreendimento', () => {
  it('sort_order, e no empate o nome com número', () => {
    expect([u('103', 0), u('101', 0), u('102', 1)].sort(compararNaOrdemDoEmpreendimento).map((x) => x.name)).toEqual(['101', '103', '102']);
  });
});

describe('moverNaOrdem', () => {
  it('troca com a vizinha e renumera o pavimento a partir do menor sort_order (empates do cadastro viram distintos)', () => {
    const lista = [u('101', 0), u('102', 0), u('103', 0), u('104', 0)];
    // 103 sobe: 101, 103, 102, 104 → 0, 1, 2, 3 (a 101 já era 0).
    expect(moverNaOrdem(lista, 2, -1)).toEqual([
      { id: '103', sort_order: 1 },
      { id: '102', sort_order: 2 },
      { id: '104', sort_order: 3 },
    ]);
  });

  it('só devolve o que muda', () => {
    const lista = [u('101', 10), u('102', 11), u('103', 12)];
    expect(moverNaOrdem(lista, 0, 1)).toEqual([
      { id: '102', sort_order: 10 },
      { id: '101', sort_order: 11 },
    ]);
  });

  it('na ponta não há para onde ir', () => {
    const lista = [u('101', 0), u('102', 1)];
    expect(moverNaOrdem(lista, 0, -1)).toEqual([]);
    expect(moverNaOrdem(lista, 1, 1)).toEqual([]);
  });
});

describe('ordemPorNumero', () => {
  it('grava a ordem pelo número, renumerada a partir do menor sort_order', () => {
    const lista = [u('303', 12), u('204', 13), u('201', 14), u('202', 15)];
    expect(ordemPorNumero(lista)).toEqual([
      { id: '201', sort_order: 12 },
      { id: '202', sort_order: 13 },
      { id: '303', sort_order: 14 },
      { id: '204', sort_order: 15 },
    ]);
  });

  it('já na ordem: nada a gravar', () => {
    expect(ordemPorNumero([u('101', 1), u('102', 2)])).toEqual([]);
  });
});
