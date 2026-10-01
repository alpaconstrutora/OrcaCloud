/**
 * INCÊNDIO E4.2 (01/10/2026): curva da bomba × curva do sistema — ponto de
 * projeto, ponto de operação, 150 %, shutoff, NPSH e a seleção entre as
 * bombas cadastradas.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command, type PontoDaCurvaDaBomba } from '../utils/blueprintKernel';
import { HIPOTESES_HIDRAULICAS_INCENDIO_PADRAO as HIP, calculoDeIncendio } from '../utils/blueprintCalculoIncendio';
import { conferenciaDeIncendio } from '../utils/blueprintConferenciaIncendio';
import {
  HIPOTESES_BOMBEAMENTO_PADRAO as HB,
  PV_MCA,
  alturaDaBombaM,
  analisarBomba,
  bombasQueAtendem,
  curvaDoSistema,
  patmMca,
} from '../utils/blueprintBombeamentoIncendio';

const curva = (pts: [number, number][]): PontoDaCurvaDaBomba[] => pts.map(([q, h]) => ({ vazaoLmin: q, alturaMm: h * 1000 }));
/** Forte: ~70 m no shutoff, ~55 m a 600 L/min. Fraca: 30 m no shutoff. */
const FORTE = curva([[0, 70], [600, 55], [1200, 30]]);
const FRACA = curva([[0, 30], [600, 22], [1200, 10]]);

/** O galpão da E2: bomba a 0,30 m, dois hidrantes (5 m e 30 m). */
function galpao(c: PontoDaCurvaDaBomba[] | null, caixa = false): BlueprintModel {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const l = m.levels[0].id;
  const t = (ax: number, ca: number, bx: number, cb: number): Command => ({ type: 'AddTrecho', levelId: l, disciplina: 'INCENDIO', a: point(ax, 0), b: point(bx, 0), cotaAMm: ca, cotaBMm: cb, bitolaMm: 65 }) as Command;
  const p = (tipo: string, x: number, cota: number, extra: Record<string, unknown> = {}): Command => ({ type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo, at: point(x, 0), cotaMm: cota, tipoHidraulico: tipo, ...extra }) as Command;
  return applyBatch(m, [
    p('BOMBA_INCENDIO', 0, 300, c ? { curvaBomba: c, npshrMm: 4000 } : {}),
    t(0, 300, 0, 2600), t(0, 2600, 5000, 2600), t(5000, 2600, 30000, 2600), t(5000, 2600, 5000, 1300), t(30000, 2600, 30000, 1300),
    p('HIDRANTE_SIMPLES', 5000, 1300), p('HIDRANTE_SIMPLES', 30000, 1300),
    ...(caixa ? [{ type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo: 'CX', at: point(-3000, 0), cotaMm: 2500, tipoHidraulico: 'RESERVATORIO', volumeL: 20000 } as Command] : []),
  ]).model;
}

describe('E4.2 · a curva da bomba', () => {
  it('interpola em linha reta e não extrapola', () => {
    expect(alturaDaBombaM(FORTE, 300)).toBeCloseTo(62.5, 9);
    expect(alturaDaBombaM(FORTE, 1200)).toBeCloseTo(30, 9);
    expect(alturaDaBombaM(FORTE, 1500)).toBeNull();
  });

  it('a curva do sistema SOBE: mais carga, mais vazão', () => {
    const m = galpao(null);
    const c = calculoDeIncendio(m, HIP);
    const pts = curvaDoSistema(m, HIP, c.abertos, 80);
    for (let i = 1; i < pts.length; i++) expect(pts[i].vazaoLmin).toBeGreaterThanOrEqual(pts[i - 1].vazaoLmin);
    // Carga zero com o hidrante acima da bomba: nada sai — e nada ENTRA pelo esguicho (retenção).
    expect(Math.abs(pts[0].vazaoLmin)).toBeLessThan(0.05);
  });
});

describe('E4.2 · ponto de operação e análise', () => {
  it('⚠️ PRONTO QUANDO: a bomba forte atende o projeto, e o ponto de operação fica à DIREITA dele (mais vazão, os hidrantes atendem)', () => {
    const m = galpao(FORTE);
    const c = calculoDeIncendio(m, HIP);
    const a = analisarBomba(m, HIP, HB, c)!;
    expect(a.temCurva).toBe(true);
    expect(a.atendeProjeto).toBe(true);
    expect(a.operacao!.vazaoLmin).toBeGreaterThan(a.projeto!.vazaoLmin);
    expect(a.operacao!.atende).toBe(true);
    // No ponto de operação a carga da bomba e a da rede são a mesma.
    expect(alturaDaBombaM(FORTE, a.operacao!.vazaoLmin)!).toBeCloseTo(a.operacao!.alturaM, 1);
  });

  it('a bomba fraca NÃO atende: a curva passa por baixo do projeto, e no ponto de operação os hidrantes não atendem', () => {
    const m = galpao(FRACA);
    const a = analisarBomba(m, HIP, HB, calculoDeIncendio(m, HIP))!;
    expect(a.atendeProjeto).toBe(false);
    expect(a.operacao!.atende).toBe(false);
  });

  it('sem curva declarada: a análise diz que não tem curva e não inventa ponto de operação', () => {
    const m = galpao(null);
    const a = analisarBomba(m, HIP, HB, calculoDeIncendio(m, HIP))!;
    expect(a.temCurva).toBe(false);
    expect(a.atendeProjeto).toBeNull();
    expect(a.operacao).toBeNull();
  });

  it('150 %: a forte dá ≥ 65 % da carga de projeto a 1,5× a vazão; shutoff leva a estática ao hidrante mais baixo', () => {
    const m = galpao(FORTE);
    const c = calculoDeIncendio(m, HIP);
    const a = analisarBomba(m, HIP, HB, c)!;
    expect(a.cento50!.minimoM).toBeCloseTo(c.cargaNecessariaM! * 0.65, 9);
    expect(a.cento50!.atende).toBe(true);
    // Shutoff 70 m; bomba a 0,30 m e hidrante a 1,30 m: (70 − 1) · 9,807 ≈ 677 kPa < 1000.
    expect(a.shutoff!.estaticaMaximaKpa).toBeCloseTo((70 - 1) * 9.80665, 6);
    expect(a.shutoff!.atende).toBe(true);
  });

  it('NPSH: sem caixa, só Patm − pv − perda; com a caixa 2,2 m acima da bomba, a bomba afogada ganha esses 2,2 m', () => {
    const sem = analisarBomba(galpao(FORTE), HIP, HB, calculoDeIncendio(galpao(FORTE), HIP))!;
    expect(sem.npsh!.disponivelM).toBeCloseTo(patmMca(0) - PV_MCA - HB.perdaNaSuccaoM, 9);
    expect(sem.npsh!.nivelDaSuccao).toBe('COTA_DA_BOMBA');
    const m = galpao(FORTE, true);
    const com = analisarBomba(m, HIP, HB, calculoDeIncendio(m, HIP))!;
    expect(com.npsh!.disponivelM - sem.npsh!.disponivelM).toBeCloseTo(2.2, 6);
    expect(com.npsh!.requeridoM).toBe(4);
    expect(com.npsh!.atende).toBe(true);
    // A 850 m de altitude (BH), a atmosfera dá ~1 m a menos.
    expect(patmMca(850)).toBeCloseTo(9.31, 2);
  });
});

describe('E4.2 · seleção entre as cadastradas', () => {
  it('só as que atendem, da que tem menos folga para a que tem mais', () => {
    const projeto = { vazaoLmin: 600, alturaM: 40 };
    const r = bombasQueAtendem(
      [
        { id: 'a', nome: 'Grande', curva: curva([[0, 90], [600, 80], [1200, 50]]) },
        { id: 'b', nome: 'Justa', curva: curva([[0, 55], [600, 45], [1200, 20]]) },
        { id: 'c', nome: 'Fraca', curva: FRACA },
        { id: 'd', nome: 'Curta', curva: curva([[0, 90], [300, 80], [500, 60]]) },
      ],
      projeto,
    );
    expect(r.map((x) => x.candidata.nome)).toEqual(['Justa', 'Grande']);
    expect(r[0].folgaM).toBeCloseTo(5, 9);
  });
});

describe('E4.2 · conferência da bomba', () => {
  it('forte: o projeto ATENDE; fraca: FALTA; sem curva: NÃO AVALIADO', () => {
    const estado = (cv: PontoDaCurvaDaBomba[] | null) => {
      const m = galpao(cv);
      const c = calculoDeIncendio(m, HIP);
      return conferenciaDeIncendio(m, c, HIP, analisarBomba(m, HIP, HB, c)).find((i) => i.item === 'Bomba atende o ponto de projeto')!.estado;
    };
    expect(estado(FORTE)).toBe('ATENDE');
    expect(estado(FRACA)).toBe('FALTA');
    expect(estado(null)).toBe('NAO_AVALIADO');
  });
});

