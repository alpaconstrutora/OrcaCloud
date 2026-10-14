/**
 * Unidades do prédio (13/10/2026, Fase 3 do plano
 * `docs/planos/2026-10-13-areas-nbr12721-na-planta.md`): as unidades do
 * pavimento tipo replicadas, DERIVADAS, em cada cópia viva — sem elas o
 * Quadro IV-B da NBR 12721 sai com um andar só.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { numeroNoAndar, unidadesDoPredio } from '../utils/blueprintUnidadesDoPredio';

/** Térreo (cota 0) + pavimento tipo "1º" (cota 3000) com 4 apartamentos de 6 × 6 m sobre um hall de 24 × 2 m. */
function predio(numeros = ['101', '102', '103', '104']) {
  let m = applyBatch(emptyModel(), [
    { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 },
    { type: 'AddLevel', name: '1º', elevationMm: 3000, defaultHeightMm: 3000 },
  ]).model;
  const tipo = m.levels.find((l) => l.name === '1º')!.id;
  const w = (ax: number, ay: number, bx: number, by: number, e: number): Command => ({ type: 'AddWall', levelId: tipo, a: point(ax, ay), b: point(bx, by), thicknessMm: e, heightMm: 3000 });
  m = applyBatch(m, [
    w(0, 0, 24000, 0, 200), w(24000, 0, 24000, 8000, 200), w(24000, 8000, 0, 8000, 200), w(0, 8000, 0, 0, 200),
    w(0, 6000, 24000, 6000, 150), w(6000, 0, 6000, 6000, 150), w(12000, 0, 12000, 6000, 150), w(18000, 0, 18000, 6000, 150),
  ]).model;
  // Pela MENOR x do anel: o canto (6000, 0) é das duas salas vizinhas.
  const sala = (x: number) => m.spaces.find((s) => s.levelId === tipo && s.areaMm2 === 36_000_000 && Math.min(...s.ring.map((p) => p.x)) === x)!.id;
  const hall = m.spaces.find((s) => s.levelId === tipo && s.areaMm2 === 48_000_000)!.id;
  m = applyBatch(m, [
    ...numeros.map((n, i) => ({ type: 'NameSpace', spaceId: sala(i * 6000), name: `Sala ${n}` }) as Command),
    { type: 'NameSpace', spaceId: hall, name: 'Hall' },
  ]).model;
  m = applyBatch(m, numeros.map((n) => ({ type: 'AddUnidade', numero: n, labelIds: [m.labels.find((l) => l.name === `Sala ${n}`)!.id] }) as Command)).model;
  return { m, tipo };
}

function comCopias(m: BlueprintModel, tipo: string, n: number) {
  return applyBatch(
    m,
    Array.from({ length: n }, (_, i) => ({ type: 'AddLevel', name: `${i + 2}º`, elevationMm: 3000 * (i + 2), defaultHeightMm: 3000, tipoDeId: tipo }) as Command),
  ).model;
}

describe('numeração por andar', () => {
  it('"andar + posição": 101 no 1º → 501 no 5º; T01 é o térreo; o que não segue o padrão devolve null', () => {
    expect(numeroNoAndar('101', 2, 6)).toBe('501');
    expect(numeroNoAndar('1203', 13, 2)).toBe('103');
    expect(numeroNoAndar('101', 2, 1)).toBe('T01');
    expect(numeroNoAndar('T02', 1, 3)).toBe('202');
    expect(numeroNoAndar('Apto A', 2, 3)).toBeNull();
    expect(numeroNoAndar('11', 2, 3)).toBeNull(); // "1" + "1": posição precisa de 2 dígitos
  });
});

describe('unidades do prédio', () => {
  it('tipo com 4 unidades e 10 cópias = 44 unidades, números únicos, a mesma área da origem', () => {
    const { m, tipo } = predio();
    const x = comCopias(m, tipo, 10);
    const { unidades, avisos } = unidadesDoPredio(x);
    expect(avisos).toEqual([]);
    expect(unidades).toHaveLength(44);
    expect(new Set(unidades.map((u) => u.numero)).size).toBe(44);
    expect(unidades.filter((u) => u.derivada)).toHaveLength(40);
    expect(unidades.map((u) => u.numero)).toEqual(expect.arrayContaining(['101', '104', '201', '1101', '1104']));
    const origem = unidades.find((u) => u.numero === '102')!;
    for (const u of unidades.filter((d) => d.origem.uid === origem.origem.uid)) {
      expect(u.medida.areaPrivativaMm2).toBe(origem.medida.areaPrivativaMm2);
    }
    // A chave da derivada é estável: uid da origem + uid do pavimento.
    const d = unidades.find((u) => u.numero === '502')!;
    expect(d.chave).toBe(`${origem.origem.uid}:${x.levels.find((l) => l.id === d.levelId)!.uid}`);
  });

  it('na cópia a parede entre dois apartamentos sai GEMINADA (as derivadas vizinhas estão presentes na medição)', () => {
    const { m, tipo } = predio();
    const { unidades } = unidadesDoPredio(comCopias(m, tipo, 1));
    const u202 = unidades.find((u) => u.numero === '202')!;
    expect(u202.medida.paredes.filter((p) => p.lado === 'GEMINADA')).toHaveLength(2);
    expect(u202.medida.geminadaCom).toHaveLength(2);
  });

  it('renomear a origem propaga; apagar uma cópia some com as unidades dela', () => {
    const { m, tipo } = predio();
    let x = comCopias(m, tipo, 3);
    x = applyCommand(x, { type: 'SetUnidadeProps', unidadeId: x.unidades.find((u) => u.numero === '101')!.id, numero: '105' }).model;
    const numeros = unidadesDoPredio(x).unidades.map((u) => u.numero);
    expect(numeros).toEqual(expect.arrayContaining(['105', '205', '305', '405']));
    expect(numeros).not.toContain('201');
    const terceiro = x.levels.find((l) => l.name === '3º')!.id;
    const semUma = applyCommand(x, { type: 'RemoveLevel', levelId: terceiro }).model;
    const r = unidadesDoPredio(semUma).unidades;
    expect(r).toHaveLength(12);
    expect(r.some((u) => u.levelId === terceiro)).toBe(false);
  });

  it('número fora do padrão é numerado pelo pavimento, com aviso; a outra regra não avisa', () => {
    const { m, tipo } = predio(['Apto A', 'Apto B', 'Apto C', 'Apto D']);
    const x = comCopias(m, tipo, 1);
    const padrao = unidadesDoPredio(x);
    expect(padrao.unidades.map((u) => u.numero)).toContain('2º · Apto A');
    expect(padrao.avisos.some((a) => a.includes('Apto A') && a.includes('andar + posição'))).toBe(true);
    const outra = unidadesDoPredio(x, { regra: 'PAVIMENTO_E_NUMERO' });
    expect(outra.avisos).toEqual([]);
    expect(outra.unidades).toHaveLength(8);
  });

  it('unidade que atravessa pavimentos num tipo com cópia não é replicada (aviso); estudo sem cópia não muda nada', () => {
    const { m, tipo } = predio();
    const terreo = m.levels.find((l) => l.name === 'Térreo')!.id;
    const comDeclarado = applyCommand(m, { type: 'AddAmbienteDeclarado', levelId: terreo, nome: 'Depósito', areaMm2: 4_000_000, unidadeId: m.unidades.find((u) => u.numero === '101')!.id }).model;
    const r = unidadesDoPredio(comCopias(comDeclarado, tipo, 2));
    expect(r.unidades).toHaveLength(4 + 3 * 2);
    expect(r.avisos.some((a) => a.includes('101') && a.includes('atravessa'))).toBe(true);
    expect(r.unidades.find((u) => u.numero === '101')!.declaradoUids).toHaveLength(1);

    const semCopia = unidadesDoPredio(m);
    expect(semCopia.unidades.map((u) => u.numero)).toEqual(['101', '102', '103', '104']);
    expect(semCopia.unidades.every((u) => !u.derivada && u.chave === u.origem.uid)).toBe(true);
  });
});
