import { describe, expect, it } from 'vitest';
import { finalDaUnidade, gravacoesDoArrasto, trocarVagas } from '../utils/blueprintArrastoDasUnidades';
import { arranjarAndar, arrumacaoEfetiva, arrumarUnidades } from '../utils/blueprintUnidadesNoPavimento';

const ANDAR_1 = [
  { id: 'u105', nome: '105', vaga: 0 },
  { id: 'u106', nome: '106', vaga: 1 },
  { id: 'u107', nome: '107', vaga: 2 },
  { id: 'u108', nome: '108', vaga: 3 },
];
const ANDAR_2 = [
  { id: 'u205', nome: '205' },
  { id: 'u206', nome: '206' },
  { id: 'u207', nome: '207' },
  { id: 'u208', nome: '208' },
];

describe('finalDaUnidade', () => {
  it('os dois últimos dígitos com 3 ou mais; senão o número; sem número, o nome', () => {
    expect(finalDaUnidade('107')).toBe('07');
    expect(finalDaUnidade('1204')).toBe('04');
    expect(finalDaUnidade('Loja 3')).toBe('3');
    expect(finalDaUnidade('Zeladoria')).toBe('ZELADORIA');
  });
});

describe('trocarVagas', () => {
  it('soltar uma sobre a outra troca as duas de vaga; as demais ficam', () => {
    const r = trocarVagas(ANDAR_1, 'u105', 'u108');
    expect([...r.entries()]).toEqual([
      ['u105', 3],
      ['u106', 1],
      ['u107', 2],
      ['u108', 0],
    ]);
  });
});

describe('gravacoesDoArrasto', () => {
  it('PAVIMENTO: grava as vagas do andar (todas, na primeira vez) e não mexe nos outros', () => {
    const r = gravacoesDoArrasto(ANDAR_1, 'u105', 'u108', 'PAVIMENTO', [ANDAR_2]);
    expect(r).toEqual([
      { id: 'u105', vaga: 3 },
      { id: 'u106', vaga: 1 },
      { id: 'u107', vaga: 2 },
      { id: 'u108', vaga: 0 },
    ]);
  });

  it('só o que muda é gravado', () => {
    const gravado = ANDAR_1.map((u) => ({ ...u, vagaGravada: u.vaga }));
    expect(gravacoesDoArrasto(gravado, 'u105', 'u106', 'PAVIMENTO')).toEqual([
      { id: 'u105', vaga: 1 },
      { id: 'u106', vaga: 0 },
    ]);
  });

  it('COLUNA: os andares com os mesmos finais copiam a vaga de cada final', () => {
    const r = gravacoesDoArrasto(ANDAR_1, 'u105', 'u108', 'COLUNA', [ANDAR_2]);
    expect(r.filter((g) => g.id.startsWith('u2'))).toEqual([
      { id: 'u205', vaga: 3 },
      { id: 'u206', vaga: 1 },
      { id: 'u207', vaga: 2 },
      { id: 'u208', vaga: 0 },
    ]);
  });

  it('COLUNA: andar com outras unidades (outro número ou outros finais) fica como está', () => {
    const terreo = [{ id: 'u001', nome: '001' }, { id: 'u002', nome: '002' }];
    const outrosFinais = ANDAR_2.map((u, k) => ({ ...u, nome: `20${k + 1}` }));
    const r = gravacoesDoArrasto(ANDAR_1, 'u105', 'u108', 'COLUNA', [terreo, outrosFinais]);
    expect(r.map((g) => g.id).sort()).toEqual(['u105', 'u106', 'u107', 'u108']);
  });
});

describe('o modo arrastado na arrumação', () => {
  const BLOCO = [{ x: 0, y: 0 }, { x: 13500, y: 0 }, { x: 13500, y: 26000 }, { x: 0, y: 26000 }];
  const und = (nome: string, vaga: number | null) => ({ nome, posicao: null, orientacao: null, vaga });

  it('a torre "Arrastado na planta" vale em "Do Empreendimento"; a escolha do usuário vale por cima', () => {
    expect(arrumacaoEfetiva('DO_EMPREENDIMENTO', 'ARRASTO')).toBe('ARRASTO');
    expect(arrumacaoEfetiva('ARRASTO', 'POSICAO')).toBe('ARRASTO');
  });

  it('cada unidade na vaga gravada; a fatia k continua sendo a unidade k', () => {
    const a = arrumarUnidades([und('101', 3), und('102', 2), und('103', 1), und('104', 0)], 'ARRASTO');
    expect(a.vagas).toEqual([3, 2, 1, 0]);
    const r = arranjarAndar(BLOCO, [1, 1, 1, 1], a);
    expect(r.vagas).toEqual([3, 2, 1, 0]);
  });

  it('andar nunca arrastado: como pela posição (sem vagas)', () => {
    const a = arrumarUnidades([und('101', null), und('102', null)], 'ARRASTO');
    expect(a.vagas).toBeUndefined();
  });

  it('vaga repetida ou fora do andar: a segunda fica com a vaga que sobrar', () => {
    const a = arrumarUnidades([und('101', 1), und('102', 1), und('103', 9)], 'ARRASTO');
    const r = arranjarAndar(BLOCO, [1, 1, 1], a);
    expect(r.vagas[0]).toBe(1);
    expect(new Set(r.vagas).size).toBe(3);
  });
});
