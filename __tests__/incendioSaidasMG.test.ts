/**
 * D1.2 (plano `2026-10-01-incendio-backlog-pos-roadmap.md`) — saídas pela IT 08 do CBMMG. A
 * transcrição feita pela imagem das pp. 34–38 (`docs/normas/incendio-mg/it08-tabelas.txt`) é a
 * fonte: o teste a relê e confere as Tabelas 4, 5 e 6 do código. Depois, a população, as larguras,
 * a escada e o percurso até o local seguro.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { TABELA_4_IT08, TABELA_5_IT08, TABELA_6_IT08, limiteDaTabela5, linhaDaTabela4, luzDaPortaMm, saidasDaTabela6 } from '../utils/blueprintIncendioSaidasMG';
import { HIPOTESES_SAIDAS_PADRAO as HS, analisarSaidas, larguraExigida, protecaoExigida } from '../utils/blueprintSaidasIncendio';
import { percursoDeFuga } from '../utils/blueprintRotaDeFuga';

const texto = readFileSync(join(__dirname, '..', 'docs', 'normas', 'incendio-mg', 'it08-tabelas.txt'), 'utf-8').split(/\r?\n/);
const linhas = (p: string) => texto.filter((l) => l.startsWith(`${p} `)).map((l) => l.slice(p.length + 1).split('|').map((x) => x.trim()));

describe('D1.2 · as tabelas da IT 08 batem com a transcrição', () => {
  it('Tabela 4: divisões, regra de população (m² por pessoa) e capacidades', () => {
    const t = linhas('T4');
    expect(t).toHaveLength(TABELA_4_IT08.length);
    t.forEach((c, i) => {
      const l = TABELA_4_IT08[i];
      expect(l.divisoes, c[0]).toEqual(c[0].split(/,\s*/));
      const cap = c.slice(2).map((x) => (x === '+' ? null : Number(x)));
      expect(l.capacidade ? [l.capacidade.acesso, l.capacidade.escada, l.capacidade.porta] : [null, null, null], c[0]).toEqual(cap);
      const p = l.populacao;
      if (p.tipo === 'AREA') {
        const m = /(Uma|Duas) pessoas? por ([\d,]+)?\s*m²/.exec(c[1])!;
        const m2 = m[2] ? Number(m[2].replace(',', '.')) : 1;
        expect(p.m2PorPessoa, c[0]).toBeCloseTo(m2 / (m[1] === 'Duas' ? 2 : 1), 9);
      } else if (p.tipo === 'DORMITORIO') expect(c[1]).toMatch(/Duas pessoas por dormitório/);
      else if (p.tipo === 'VAGAS') expect(c[1]).toMatch(/por 40 vagas/);
      else if (p.tipo === 'LEITO') expect(c[1]).toMatch(/pessoa e meia por leito/);
      else expect(c[1]).toMatch(/^\+/);
    });
  });

  it('Tabela 5: as 8 linhas, valor a valor', () => {
    const t = linhas('T5');
    const chave = (c: string[]) => (c[0] === 'Z' ? (c[1].startsWith('C,') ? 'Z1' : 'Z2') : c[0]);
    expect(t).toHaveLength(8);
    for (const c of t) {
      const valores = c.slice(3).flatMap((x) => x.split(/\s+/).map(Number));
      expect(TABELA_5_IT08[chave(c)][c[2] === 'Térreo' ? 'terreo' : 'demais'], c.join('|')).toEqual(valores);
    }
  });

  it('Tabela 6: cada divisão, as 4 faixas de altura', () => {
    const t = linhas('T6');
    expect(t).toHaveLength(Object.keys(TABELA_6_IT08).length);
    for (const c of t) {
      const celulas = TABELA_6_IT08[c[0]].map((x) => (x === 'NAO_SE_APLICA' ? '- -' : x === 'NORMA_ESPECIFICA' ? '+ +' : `${x.numero} ${x.tipo ?? '-'}`));
      expect(celulas, c[0]).toEqual(c.slice(1));
    }
  });
});

describe('D1.2 · larguras pela Tabela 4 e pelo texto', () => {
  it('a capacidade é da DIVISÃO: a escada do comércio é 60 por UP (não 75)', () => {
    expect(larguraExigida(200, 'C-2', 'escada')).toEqual({ unidades: 4, larguraMm: 2200 });
    expect(larguraExigida(100, 'A-2', 'escada')).toEqual({ unidades: 3, larguraMm: 1650 });
  });

  it('a porta tem a luz da 5.5.4.3: 0,80 m para 1 UP, 1,0 m para 2 (não 0,55 m por UP)', () => {
    expect(larguraExigida(8, 'A-2', 'porta')).toEqual({ unidades: 1, larguraMm: 800 });
    expect(larguraExigida(150, 'A-2', 'porta')).toEqual({ unidades: 2, larguraMm: 1000 });
    expect(luzDaPortaMm(5)).toBe(2750);
  });

  it('H-2 e H-3: no mínimo 3 UP (1,65 m) em escada e acesso — 5.4.2.1 b', () => {
    expect(larguraExigida(5, 'H-2', 'escada')).toEqual({ unidades: 3, larguraMm: 1650 });
    expect(larguraExigida(5, 'H-1', 'escada')).toEqual({ unidades: 2, larguraMm: 1100 });
  });

  it('Tabela 4: H-1 é 1 por 7 m² com 60/45/100 — não a capacidade da H-3', () => {
    expect(linhaDaTabela4('H-1')).toMatchObject({ populacao: { m2PorPessoa: 7 }, capacidade: { acesso: 60, escada: 45, porta: 100 } });
  });
});

/** Um pavimento térreo: sala de 10×6 m, banheiro de 2×6 m e corredor de 12×2 m, uma porta para fora. */
function pavimento(nomes: [string, string, string]): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
  const l = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: l, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 3000 }) as Command;
  m = applyBatch(m, [w(0, 0, 12000, 0), w(12000, 0, 12000, 8000), w(12000, 8000, 0, 8000), w(0, 8000, 0, 0), w(0, 2000, 12000, 2000), w(10000, 2000, 10000, 8000)]).model;
  const porta = (wallId: string, off: number): Command => ({ type: 'AddOpening', wallId, kind: 'door', offsetMm: off, widthMm: 900, heightMm: 2100, sillMm: 0 }) as Command;
  const meio = m.walls.find((x) => x.a.y === 2000 && x.b.y === 2000)!;
  m = applyBatch(m, [porta(meio.id, 4000), porta(meio.id, 10500), porta(m.walls.find((x) => x.a.x === 0 && x.b.x === 0)!.id, 6500)]).model;
  return applyBatch(m, m.spaces.map((s) => ({ type: 'NameSpace', spaceId: s.id, name: s.ring.every((p) => p.y <= 2000) ? nomes[2] : Math.min(...s.ring.map((p) => p.x)) >= 10000 ? nomes[1] : nomes[0] }) as Command)).model;
}

describe('D1.2 · a população pela Tabela 4', () => {
  it('nota E: a área do comércio sai sem o banheiro e o corredor — 60 m² ÷ 3 = 20 pessoas', () => {
    const a = analisarSaidas(pavimento(['Loja', 'Banheiro', 'Corredor']), 'C-1', HS);
    expect(a.populacao[0]).toMatchObject({ pessoas: 20, origem: 'AREA' });
    expect(a.populacao[0].base).toBeCloseTo(60, 0);
  });

  it('nota C: com até 2 dormitórios por sala, a sala conta como dormitório', () => {
    const a = analisarSaidas(pavimento(['Sala', 'Dormitório', 'Corredor']), 'A-2', HS);
    expect(a.populacao[0]).toMatchObject({ pessoas: 4, origem: 'DORMITORIOS', base: 2 });
  });
});

describe('D1.2 · a escada e o número de saídas pela Tabela 6', () => {
  it('a proteção vai pela divisão: C-3 a 20 m é PF; C-1 a 20 m é EP; G-1 a 20 m é NE', () => {
    expect(protecaoExigida('C-3', 20)).toMatchObject({ protecao: 'PF', numero: 2 });
    expect(protecaoExigida('C-1', 20)).toMatchObject({ protecao: 'EP', numero: 1 });
    expect(protecaoExigida('G-1', 20)).toMatchObject({ protecao: 'NE', numero: 1 });
    expect(protecaoExigida('F-4', 20)).toMatchObject({ protecao: null, motivo: expect.stringMatching(/norma específica/) });
    expect(saidasDaTabela6('D-3', 40)?.celula).toEqual({ numero: 1, tipo: 'PF' });
  });

  it('o número de saídas: F-6 térreo pede 2; com 1 só, falta (a nota F não vale na F-6)', () => {
    const a = analisarSaidas(pavimento(['Salão', 'Banheiro', 'Corredor']), 'F-6', HS, null, 0);
    expect(a.numeroDeSaidas).toMatchObject({ exigidas: 2, desenhadas: 1, atende: false });
    const b = analisarSaidas(pavimento(['Salão', 'Banheiro', 'Corredor']), 'F-5', HS, null, 0);
    expect(b.numeroDeSaidas).toMatchObject({ exigidas: 2, desenhadas: 1, atende: null, motivo: expect.stringMatching(/nota F/) });
  });
});

describe('D1.2 · o percurso pela Tabela 5, até o local seguro', () => {
  it('a tabela: X demais andares, saída única, sem nada = 25 m; Z (A) térreo, mais de uma, com tudo = 120 m; −30% sem leiaute', () => {
    const base = { divisao: 'A-2', construtiva: 'X' as const, semLeiaute: false, controleDeFumaca: false };
    const s = { terreo: false, maisDeUmaSaida: false, deteccao: false, chuveiros: false, edificacaoTerrea: false };
    expect(limiteDaTabela5(base, s).limiteM).toBe(25);
    expect(limiteDaTabela5({ ...base, construtiva: 'Z' }, { ...s, terreo: true, maisDeUmaSaida: true, deteccao: true, chuveiros: true }).limiteM).toBe(120);
    expect(limiteDaTabela5({ ...base, construtiva: 'Z', divisao: 'C-1' }, { ...s, terreo: true, maisDeUmaSaida: true, deteccao: true, chuveiros: true }).limiteM).toBe(110);
    expect(limiteDaTabela5({ ...base, semLeiaute: true }, s).limiteM).toBe(17.5);
    expect(limiteDaTabela5({ ...base, construtiva: null }, s).motivo).toMatch(/não declarado — usado X/);
    expect(limiteDaTabela5(base, { ...s, edificacaoTerrea: true, terreo: true }).limiteM).toBe(45); // térrea: no mínimo Y
  });

  it('no sobrado, o hall de cima termina NA ESCADA (local seguro), não na rua — e o limite é o dos demais andares', () => {
    let m = emptyModel();
    for (let i = 0; i < 2; i++) m = applyCommand(m, { type: 'AddLevel', name: i === 0 ? 'Térreo' : '1º', elevationMm: 3000 * i, defaultHeightMm: 3000 }).model;
    const w = (l: string, ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: l, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 3000 }) as Command;
    m.levels.forEach((lv, i) => {
      m = applyBatch(m, [w(lv.id, 0, 0, 10000, 0), w(lv.id, 10000, 0, 10000, 10000), w(lv.id, 10000, 10000, 0, 10000), w(lv.id, 0, 10000, 0, 0)]).model;
      if (i === 0) m = applyCommand(m, { type: 'AddOpening', wallId: m.walls.find((x) => x.levelId === lv.id && x.a.y === 0 && x.b.y === 0)!.id, kind: 'door', offsetMm: 500, widthMm: 900, heightMm: 2100, sillMm: 0 } as Command).model;
      if (i === 0) m = applyCommand(m, { type: 'AddEscada', levelId: lv.id, pontos: [point(9000, 5000), point(9000, 9000)], larguraMm: 1200, rotulo: 'E1' } as Command).model;
    });
    m = applyBatch(m, m.spaces.map((s) => ({ type: 'NameSpace', spaceId: s.id, name: 'Hall' }) as Command)).model;
    const crit = { divisao: 'D-1', construtiva: 'Z' as const, semLeiaute: false, controleDeFumaca: false };
    const p = percursoDeFuga(m, 'D', m.levels[0].id, null, crit);
    const cima = p.ambientes.find((a) => a.levelId === m.levels[1].id)!;
    expect(cima.caminhamentoM!).toBeLessThan(cima.distanciaM!); // a rota desenhada segue até a rua; a distância da IT para na escada
    expect(cima.limiteM).toBe(50); // Z (D), demais andares, saída única, sem detecção nem chuveiros
    expect(cima.motivoDoLimite).toMatch(/demais andares/);
    const terreo = p.ambientes.find((a) => a.levelId === m.levels[0].id)!;
    expect(terreo.limiteM).toBe(65);
    expect(p.fonte).toMatch(/IT 08/);
  });
});
