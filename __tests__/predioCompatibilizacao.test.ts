/**
 * PA10b do prédio automático (16/11/2026): a PRUMADA atravessando a laje é PASSAGEM (`passagensNaLaje`), não conflito —
 * e o relatório de compatibilização (`compatibilizarPredio`) separa conflito, encosto, passagem e furo.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, conflitosDoModelo, emptyModel, passagensNaLaje, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { furosPrevistos } from '../utils/blueprintFurosPrevistos';
import { compatibilizarPredio } from '../utils/blueprintPredioAutomatico';

/** Um pavimento de 2,80 m com a laje de 10 cm por cima (de -1 a 7 m × -3 a 3 m) e um shaft de 40 × 40 cm em (5 m, 2 m). */
function andar(trechos: Command[] = []): BlueprintModel {
  let m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }]).model;
  const L = m.levels[0].id;
  m = applyBatch(m, [
    { type: 'AddStructural', levelId: L, kind: 'LAJE', pontos: [point(-1000, -3000), point(7000, -3000), point(7000, 3000), point(-1000, 3000)], alturaMm: 100, baseMm: 2800 },
    { type: 'AddNucleo', levelId: L, tipo: 'SHAFT', ring: [point(4800, 1800), point(5200, 1800), point(5200, 2200), point(4800, 2200)], rotulo: 'Shaft' },
  ] as Command[]).model;
  return trechos.length ? applyBatch(m, trechos.map((t) => ({ ...t, levelId: L }) as Command)).model : m;
}
const prumada = (disciplina: string, x: number, y: number, de: number, ate: number, bitolaMm = 50): Command =>
  ({ type: 'AddTrecho', levelId: '', disciplina, a: point(x, y), b: point(x, y), cotaAMm: de, cotaBMm: ate, bitolaMm }) as Command;

describe('passagens na laje (PA10b)', () => {
  it('a prumada que atravessa a laje é FURO, não conflito; a que termina dentro dela é EMBUTIDO; no shaft, noNucleo', () => {
    const m = andar([prumada('ESGOTO', 1000, 0, 3200, 0, 100), prumada('ELETRICA', 2000, 0, 2850, 2300, 25), prumada('AGUA_FRIA', 5000, 2000, 3200, 0, 32)]);
    expect(conflitosDoModelo(m).filter((c) => c.classe === 'ESTRUTURA')).toEqual([]);
    const ps = passagensNaLaje(m);
    const de = (d: string) => ps.find((p) => p.disciplina === d)!;
    expect(ps).toHaveLength(3);
    expect(de('ESGOTO')).toMatchObject({ tipo: 'FURO', noNucleo: false, at: { x: 1000, y: 0 } });
    expect(de('ESGOTO').diametroMm).toBeGreaterThanOrEqual(100);
    expect(de('ELETRICA')).toMatchObject({ tipo: 'EMBUTIDO', noNucleo: false });
    expect(de('AGUA_FRIA')).toMatchObject({ tipo: 'FURO', noNucleo: true });
  });

  it('o tubo rente à borda (eixo fora, a menos de um raio) também passa; longe dela, não', () => {
    const m = andar([prumada('PLUVIAL', 7040, 0, 3200, 0, 100), prumada('PLUVIAL', 7300, 0, 3200, 0, 100)]);
    expect(passagensNaLaje(m).map((p) => p.at.x)).toEqual([7040]);
  });

  it('o trecho que corre DENTRO da laje (horizontal) continua conflito', () => {
    const m = andar([{ type: 'AddTrecho', levelId: '', disciplina: 'ELETRICA', a: point(0, 0), b: point(3000, 0), cotaAMm: 2850, cotaBMm: 2850, bitolaMm: 25 } as Command]);
    expect(conflitosDoModelo(m).filter((c) => c.classe === 'ESTRUTURA')).toHaveLength(1);
    expect(passagensNaLaje(m)).toEqual([]);
  });

  it('os furos previstos seguem listando a passagem na laje (a casa não muda)', () => {
    const m = andar([prumada('ESGOTO', 1000, 0, 3200, 0, 100)]);
    expect(furosPrevistos(m).filter((f) => f.tipoDaPeca === 'LAJE')).toHaveLength(1);
  });
});

describe('relatório de compatibilização (PA10b)', () => {
  it('separa conflito, encosto, passagem e furo — e só o furo próprio vai à lista do calculista', () => {
    const m = andar([
      prumada('ESGOTO', 1000, 0, 3200, 0, 100),
      prumada('AGUA_FRIA', 5000, 2000, 3200, 0, 32),
      prumada('ELETRICA', 2000, 0, 2850, 2300, 25),
      // Duas redes que se cruzam (eixos a 1 cm) e duas de mesma disciplina lado a lado (não é par: só disciplinas diferentes).
      { type: 'AddTrecho', levelId: '', disciplina: 'AGUA_FRIA', a: point(0, 1000), b: point(3000, 1000), cotaAMm: 2500, cotaBMm: 2500, bitolaMm: 25 } as Command,
      { type: 'AddTrecho', levelId: '', disciplina: 'ESGOTO', a: point(1500, 0), b: point(1500, 2000), cotaAMm: 2510, cotaBMm: 2510, bitolaMm: 100 } as Command,
      { type: 'AddTrecho', levelId: '', disciplina: 'ELETRICA', a: point(0, -1000), b: point(3000, -1000), cotaAMm: 2500, cotaBMm: 2500, bitolaMm: 25 } as Command,
      { type: 'AddTrecho', levelId: '', disciplina: 'ELETRICA', a: point(0, -1026), b: point(3000, -1026), cotaAMm: 2500, cotaBMm: 2500, bitolaMm: 25 } as Command,
    ]);
    const r = compatibilizarPredio(m);
    expect(r.conflitos.REDE).toBe(1);
    expect(r.encostos).toBe(0);
    expect(r.passagens).toEqual({ furos: 1, noNucleo: 1, embutidas: 1 });
    expect(r.furos.emLaje).toBe(1);
    expect(r.furos.lista.map((f) => f.disciplina)).toEqual(['ESGOTO']);
    const conflito = r.pendencias.find((p) => p.grupo === 'CONFLITO')!;
    expect(conflito.texto).toContain('1 encontro(s) entre redes (os tubos se tocam ou se cruzam)');
    expect(conflito.texto).toContain('água fria × esgoto 1');
    expect(conflito.locais?.[0].ids).toHaveLength(2);
    expect(r.pendencias.some((p) => p.texto.startsWith('Furos previstos para o calculista: 0 em viga'))).toBe(true);
  });
});
