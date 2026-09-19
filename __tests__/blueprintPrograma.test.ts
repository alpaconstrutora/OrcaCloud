/**
 * Programa de necessidades (19/09/2026, E4.1): sementes por tipologia válidas,
 * matriz de proximidade (par não ordenado, obrigatória/proibida forçam o peso,
 * peso 0 apaga), validação que acusa sem travar, resumo, casador de nome e a
 * leitura tolerante da coluna JSONB.
 */
import { describe, expect, it } from 'vitest';
import {
  adicionarItem,
  definirRelacao,
  FICHA_DO_USO,
  novoItem,
  problemasDoPrograma,
  programaDaColuna,
  programaSemente,
  programaVazio,
  relacaoEntre,
  removerItem,
  resumoDoPrograma,
  TIPOLOGIAS_SEMENTE,
  trocarUsoDoItem,
  USOS_DO_AMBIENTE,
  usoDoNome,
} from '../utils/blueprintPrograma';

describe('programa de necessidades', () => {
  it('as três sementes são válidas, têm os ambientes da tipologia e sobrevivem à ida e volta pela coluna', () => {
    for (const t of TIPOLOGIAS_SEMENTE) {
      const p = programaSemente(t);
      expect(problemasDoPrograma(p)).toEqual([]);
      expect(programaDaColuna(JSON.parse(JSON.stringify(p)))).toEqual(p);
    }
    const q2 = programaSemente('APTO_2Q');
    expect(q2.itens.filter((i) => i.uso === 'DORMITORIO').reduce((s, i) => s + i.quantidade, 0)).toBe(2);
    expect(q2.itens.some((i) => i.uso === 'SUITE')).toBe(false);
    const q3 = programaSemente('APTO_3Q_SUITE');
    expect(q3.itens.filter((i) => i.uso === 'SUITE' || i.uso === 'DORMITORIO').reduce((s, i) => s + i.quantidade, 0)).toBe(3);
    const suite = q3.itens.find((i) => i.uso === 'SUITE')!;
    const banhoDaSuite = q3.itens.find((i) => i.nome === 'Banheiro da suíte')!;
    expect(relacaoEntre(q3, suite.id, banhoDaSuite.id)).toMatchObject({ tipo: 'OBRIGATORIA', peso: 10 });
    const coz = q3.itens.find((i) => i.uso === 'COZINHA')!;
    expect(relacaoEntre(q3, coz.id, suite.id)).toMatchObject({ tipo: 'PROIBIDA', peso: 0 });
    const casa = programaSemente('CASA_TERREA');
    expect(casa.itens.some((i) => i.uso === 'GARAGEM')).toBe(true);
    expect(casa.circulacaoMaxPct).toBe(12);
    // Resumo: soma por quantidade, faixa social/serviço/íntimo, área com circulação.
    const r = resumoDoPrograma(q2);
    expect(r.ambientes).toBe(8); // sala, coz, serv, 2 dorm, banho, circ, varanda
    expect(r.areaIdealM2).toBe(18 + 9 + 4.5 + 2 * 11 + 4 + 2 + 6);
    expect(r.areaIdealComCirculacaoM2).toBe(Math.round((18 + 9 + 4.5 + 22 + 4 + 6) * 1.15 * 100) / 100);
    expect(r.porPrivacidade.INTIMO).toBe(22 + 4 + 2);
    expect(r.obrigatorias).toBe(1);
    expect(r.proibidas).toBe(2);
  });

  it('matriz: par não ordenado, obrigatória força 10, proibida força 0, peso 0 apaga; remover o item leva as relações; trocar o uso puxa a ficha só nos campos intocados', () => {
    let p = programaVazio('Teste');
    const sala = novoItem('SALA');
    const coz = novoItem('COZINHA');
    const dorm = novoItem('DORMITORIO', 'Dorm. casal');
    p = adicionarItem(adicionarItem(adicionarItem(p, sala), coz), dorm);
    p = definirRelacao(p, sala.id, coz.id, 7);
    expect(relacaoEntre(p, coz.id, sala.id)).toMatchObject({ peso: 7, tipo: 'DESEJAVEL' });
    p = definirRelacao(p, coz.id, sala.id, 3, 'OBRIGATORIA');
    expect(p.relacoes).toHaveLength(1);
    expect(relacaoEntre(p, sala.id, coz.id)).toMatchObject({ peso: 10, tipo: 'OBRIGATORIA' });
    p = definirRelacao(p, coz.id, dorm.id, 9, 'PROIBIDA');
    expect(relacaoEntre(p, dorm.id, coz.id)).toMatchObject({ peso: 0, tipo: 'PROIBIDA' });
    p = definirRelacao(p, sala.id, coz.id, 0);
    expect(relacaoEntre(p, sala.id, coz.id)).toBeNull();
    expect(definirRelacao(p, sala.id, sala.id, 5)).toBe(p);
    expect(problemasDoPrograma(p)).toEqual([]);
    // Remover a cozinha leva a proibida com o dormitório.
    const semCoz = removerItem(p, coz.id);
    expect(semCoz.itens.map((i) => i.uso)).toEqual(['SALA', 'DORMITORIO']);
    expect(semCoz.relacoes).toEqual([]);
    // Trocar o uso: área ideal editada fica; largura (intocada) vai para a ficha nova; nome padrão acompanha.
    p = { ...p, itens: p.itens.map((i) => (i.id === sala.id ? { ...i, areaIdealM2: 30 } : i)) };
    const trocado = trocarUsoDoItem(p, sala.id, 'ESCRITORIO').itens.find((i) => i.id === sala.id)!;
    expect(trocado).toMatchObject({ uso: 'ESCRITORIO', nome: 'Escritório', areaIdealM2: 30, larguraMinMm: FICHA_DO_USO.ESCRITORIO.larguraMinMm, areaMinM2: FICHA_DO_USO.ESCRITORIO.areaMinM2 });
    const dormTrocado = trocarUsoDoItem(p, dorm.id, 'SUITE').itens.find((i) => i.id === dorm.id)!;
    expect(dormTrocado.nome).toBe('Dorm. casal'); // nome próprio não é mexido
  });

  it('validação acusa (ideal < mín, máx < ideal, quantidade, relação órfã, peso fora) sem travar; a coluna sanitiza lixo', () => {
    const p = programaSemente('APTO_2Q');
    const sala = p.itens.find((i) => i.uso === 'SALA')!;
    const quebrado = {
      ...p,
      itens: p.itens.map((i) => (i.id === sala.id ? { ...i, areaMinM2: 20, areaIdealM2: 18, areaMaxM2: 10, quantidade: 0 } : i)),
      relacoes: [...p.relacoes, { a: sala.id, b: 'nao-existe', peso: 5, tipo: 'DESEJAVEL' as const }, { a: sala.id, b: p.itens[1].id, peso: 12, tipo: 'DESEJAVEL' as const }],
      circulacaoMaxPct: 140,
    };
    const textos = problemasDoPrograma(quebrado).map((x) => x.texto);
    expect(textos).toEqual(expect.arrayContaining([expect.stringMatching(/quantidade deve ser inteira/), expect.stringMatching(/área ideal \(18,00\) menor que a mínima \(20,00\)/), expect.stringMatching(/área máxima \(10,00\) menor que a ideal/), 'relação cita item que não existe', expect.stringMatching(/peso fora de 0–10/), 'circulação máxima fora de 0–100 %']));
    // Leitura tolerante: item com uso inventado vira OUTRO, número inválido volta ao padrão do uso, relação órfã/duplicada/consigo cai, id repetido ganha outro.
    const lido = programaDaColuna({
      nome: '',
      itens: [
        { id: 'a', uso: 'SALA', areaMinM2: 'x', quantidade: 2.4 },
        { id: 'a', uso: 'FOO' },
        { id: 'b', uso: 'BANHEIRO', areaMaxM2: null, peDireitoMinMm: null, exigeFachada: true },
      ],
      relacoes: [
        { a: 'a', b: 'b', peso: 30, tipo: 'DESEJAVEL' },
        { a: 'b', b: 'a', peso: 3 },
        { a: 'a', b: 'a', peso: 3 },
        { a: 'a', b: 'zzz', peso: 3 },
        { a: 'a', b: 'b', tipo: 'OBRIGATORIA' },
      ],
      circulacaoMaxPct: -4,
    });
    expect(lido.nome).toBe('Programa');
    expect(lido.itens).toHaveLength(3);
    expect(lido.itens[0]).toMatchObject({ id: 'a', uso: 'SALA', areaMinM2: FICHA_DO_USO.SALA.areaMinM2, quantidade: 2 });
    expect(lido.itens[1].uso).toBe('OUTRO');
    expect(lido.itens[1].id).not.toBe('a');
    expect(lido.itens[2]).toMatchObject({ uso: 'BANHEIRO', areaMaxM2: null, peDireitoMinMm: null, exigeFachada: true });
    expect(lido.relacoes).toEqual([{ a: 'a', b: 'b', peso: 10, tipo: 'DESEJAVEL' }]); // 30 → 10; as demais caem
    expect(lido.circulacaoMaxPct).toBe(15);
    expect(problemasDoPrograma(lido)).toEqual([]);
  });

  it('casador de nome: como o projetista escreve → uso do programa; todo uso tem ficha com o tipo NBR 5410', () => {
    expect(usoDoNome('Sala de estar')).toBe('SALA');
    expect(usoDoNome('Dorm. 2')).toBe('DORMITORIO');
    expect(usoDoNome('Quarto casal')).toBe('DORMITORIO');
    expect(usoDoNome('Suíte master')).toBe('SUITE');
    expect(usoDoNome('Banho')).toBe('BANHEIRO');
    expect(usoDoNome('WC')).toBe('BANHEIRO');
    expect(usoDoNome('Lavabo')).toBe('LAVABO');
    expect(usoDoNome('Cozinha/Serviço')).toBe('COZINHA');
    expect(usoDoNome('Área de serviço')).toBe('AREA_DE_SERVICO');
    expect(usoDoNome('Lavanderia')).toBe('AREA_DE_SERVICO');
    expect(usoDoNome('Circulação')).toBe('CIRCULACAO');
    expect(usoDoNome('Hall íntimo')).toBe('CIRCULACAO');
    expect(usoDoNome('Garagem')).toBe('GARAGEM');
    expect(usoDoNome('Varanda gourmet')).toBe('VARANDA');
    expect(usoDoNome('Escritório')).toBe('ESCRITORIO');
    expect(usoDoNome('Despensa')).toBe('DEPOSITO');
    expect(usoDoNome('Ambiente 3')).toBeNull();
    expect(usoDoNome('')).toBeNull();
    for (const u of USOS_DO_AMBIENTE) {
      expect(FICHA_DO_USO[u].rotulo.length).toBeGreaterThan(0);
      expect(['BANHEIRO', 'COZINHA_SERVICO', 'VARANDA', 'SALA_DORMITORIO', 'OUTRO']).toContain(FICHA_DO_USO[u].tipoNbr5410);
      if (u !== 'OUTRO') expect(usoDoNome(FICHA_DO_USO[u].rotulo)).toBe(u);
    }
  });
});
