/**
 * As torres do Empreendimento como restrição do Gerar massa (26/10/2026, etapa 1 de
 * docs/planos/2026-10-26-planta-empreendimento-tres-etapas.md).
 */
import { describe, expect, it } from 'vitest';
import { massaDoEmpreendimento } from '../utils/blueprintMassaDoEmpreendimento';

describe('massaDoEmpreendimento', () => {
  it('2 torres de 12: restrição fixa e resumo', () => {
    const r = massaDoEmpreendimento([{ name: 'A', floors_count: 12 }, { name: 'B', floors_count: 12 }]);
    expect(r.restricao).toEqual({ torres: 2, pavimentosMin: 12, pavimentosMax: 12 });
    expect(r.resumo).toBe('2 torres × 12 pavimentos');
    expect(r.avisos).toEqual([]);
  });

  it('pavimentos diferentes: o menor é o piso, o maior o teto, com aviso', () => {
    const r = massaDoEmpreendimento([{ name: 'A', floors_count: 8 }, { name: 'B', floors_count: 14 }, { name: 'C' }]);
    expect(r.restricao).toEqual({ torres: 3, pavimentosMin: 8, pavimentosMax: 14 });
    expect(r.resumo).toBe('3 torres × 8 a 14 pavimentos');
    expect(r.avisos.join(' ')).toMatch(/1 torre\(s\) sem pavimentos/);
    expect(r.avisos.join(' ')).toMatch(/de 8 a 14/);
  });

  it('sem pavimentos cadastrados: só o número de torres', () => {
    const r = massaDoEmpreendimento([{ name: 'A' }]);
    expect(r.restricao).toEqual({ torres: 1, pavimentosMin: null, pavimentosMax: null });
    expect(r.resumo).toBe('1 torre × pavimentos livres');
  });

  it('torres da própria massa e quadras do loteamento não contam', () => {
    const r = massaDoEmpreendimento([{ name: 'Bloco 1', floors_count: 10, blueprint_bloco_uid: 'b1' }, { name: 'Quadra A', blueprint_quadra_uid: 'q1' }, { name: 'Torre', floors_count: 6 }]);
    expect(r.restricao).toEqual({ torres: 1, pavimentosMin: 6, pavimentosMax: 6 });
    expect(r.avisos.join(' ')).toMatch(/Estudo de massa/);
    expect(r.avisos.join(' ')).toMatch(/quadra/);
  });

  it('nada a seguir: motivo', () => {
    expect(massaDoEmpreendimento([])).toMatchObject({ restricao: null, motivo: expect.stringMatching(/não tem torres/) });
    expect(massaDoEmpreendimento([{ name: 'Bloco 1', blueprint_bloco_uid: 'b1' }])).toMatchObject({ restricao: null, motivo: expect.stringMatching(/Estudo de massa/) });
  });
});

describe('massaDoEmpreendimento com a estrutura das torres (27/10/2026)', () => {
  const est = (nome: string, acima: number, garagens: number) => ({
    torreId: nome,
    nome,
    acima: Array.from({ length: acima }, (_, i) => ({ numero: i, nome: `P${i}`, tipo: null, peDireitoMm: null, unidades: [] })),
    garagens: Array.from({ length: garagens }, (_, i) => ({ numero: -garagens + i, nome: `G${i}`, tipo: null, peDireitoMm: null, unidades: [] })),
    fonte: 'UNIDADES' as const,
    avisos: [],
  });
  it('Garden: Torre A sem floors_count conta pelas unidades; o resumo diz cada torre', () => {
    const r = massaDoEmpreendimento([{ name: 'Torre A', floors_count: null }, { name: 'Torre B', floors_count: 6 }], [est('Torre A', 4, 2), est('Torre B', 6, 0)]);
    expect(r.restricao).toEqual({ torres: 2, pavimentosMin: 4, pavimentosMax: 6 });
    expect(r.resumo).toBe('Torre A: 4 + 2 garagens · Torre B: 6');
  });
});


describe('massaDoEmpreendimento com a distância entre torres (28/10/2026)', () => {
  const T = (id: string, name: string) => ({ id, name, floors_count: 6 });
  it('o gerador usa a MAIOR distância dos pares, e o resumo diz', () => {
    const r = massaDoEmpreendimento([T('a', 'Torre A'), T('b', 'Torre B'), T('c', 'Torre C')], [], [
      { torre_a: 'a', torre_b: 'b', distancia_m: 6 },
      { torre_a: 'a', torre_b: 'c', distancia_m: 8 },
      { torre_a: 'b', torre_b: 'c', distancia_m: 7 },
    ]);
    expect(r.restricao?.afastamentoEntreBlocosM).toBe(8);
    expect(r.resumo).toContain('entre torres 8 m');
    expect(r.avisos.join(' ')).toContain('As distâncias entre torres vão de 6 a 8 m — o gerador usa a maior entre todos os blocos.');
  });
  it('parte dos pares informada: avisa o que falta; nenhuma informada = a hipótese do gerador, sem aviso', () => {
    const parcial = massaDoEmpreendimento([T('a', 'Torre A'), T('b', 'Torre B'), T('c', 'Torre C')], [], [{ torre_a: 'a', torre_b: 'b', distancia_m: 6 }]);
    expect(parcial.restricao?.afastamentoEntreBlocosM).toBe(6);
    expect(parcial.avisos.join(' ')).toContain('2 par(es) de torres sem distância em Torres e Unidades — vale a maior informada.');
    const nenhuma = massaDoEmpreendimento([T('a', 'Torre A'), T('b', 'Torre B')], [], []);
    expect(nenhuma.restricao?.afastamentoEntreBlocosM).toBeUndefined();
    expect(nenhuma.avisos.join(' ')).not.toContain('distância');
  });
  it('uma torre só: sem distância e sem aviso', () => {
    const r = massaDoEmpreendimento([T('a', 'Torre A')], [], []);
    expect(r.restricao?.afastamentoEntreBlocosM).toBeUndefined();
    expect(r.avisos.join(' ')).not.toContain('distância');
  });
});
