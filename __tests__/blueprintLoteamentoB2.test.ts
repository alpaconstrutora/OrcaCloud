/**
 * LOTEAMENTO B2 — subdivisão automática da quadra e conferência da Lei 6.766.
 *
 * O que estes casos travam, e por quê:
 *
 *  - a subdivisão é DETERMINÍSTICA (lotear duas vezes dá o mesmo desenho) e não
 *    grava nada: é proposta até alguém aceitar;
 *  - a sobra é DECLARADA. Fatiar 60 m em lotes de 12 m fecha; em lotes de 16 m
 *    sobram 12 m, e uma sobra silenciosa pareceria defeito;
 *  - o percentual de áreas públicas só REPROVA quando alguém informou o mínimo.
 *    A Lei 6.766 não fixa mais os 35% que se cita de cabeça desde a Lei
 *    9.785/99 — reprovar por um número federal inexistente reprovaria projeto
 *    correto.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, type BlueprintModel } from '../utils/blueprintKernel';
import {
  subdividirQuadra,
  conferirLoteamento,
  resumoDaConferencia,
  SUBDIVISAO_PADRAO,
  REGRAS_PADRAO_DO_LOTEAMENTO,
  AREA_MINIMA_LEI_6766_M2,
  TESTADA_MINIMA_LEI_6766_MM,
  areaEmM2,
} from '../utils/blueprintLoteamento';

function base(): BlueprintModel {
  return applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
}

/** Quadra 60 × 30 m, com a rua ao sul. A frente é a aresta 0 (de y=0). */
function comQuadra(): BlueprintModel {
  const m = base();
  const levelId = m.levels[0].id;
  return applyBatch(m, [
    {
      type: 'AddQuadra',
      levelId,
      nome: 'A',
      pontos: [
        { x: 0, y: 0 },
        { x: 60000, y: 0 },
        { x: 60000, y: 30000 },
        { x: 0, y: 30000 },
      ],
    },
    { type: 'AddVia', levelId, nome: 'Rua 1', eixo: [{ x: -20000, y: -6000 }, { x: 80000, y: -6000 }], larguraMm: 12000, calcadaMm: 2000 },
  ]).model;
}

describe('subdivisão automática da quadra', () => {
  it('60 m de frente em lotes de 12 m dá 5 lotes de 360 m², sem sobra', () => {
    const m = comQuadra();
    const proposta = subdividirQuadra(m.quadras[0], { ...SUBDIVISAO_PADRAO, testadaMm: 12000, profundidadeMm: 30000 });

    expect(proposta.lotes).toHaveLength(5);
    expect(proposta.lotes.every((l) => l.areaM2 === 360)).toBe(true);
    expect(proposta.lotes.every((l) => l.testadaM === 12)).toBe(true);
    expect(proposta.sobraM2).toBe(0);
    expect(proposta.aviso).toBeNull();
  });

  it('a sobra é DECLARADA quando a testada não fecha na frente', () => {
    const m = comQuadra();
    // 60 / 16 = 3 lotes e sobram 12 m.
    const proposta = subdividirQuadra(m.quadras[0], { ...SUBDIVISAO_PADRAO, testadaMm: 16000, profundidadeMm: 30000 });

    expect(proposta.lotes).toHaveLength(3);
    expect(proposta.sobraM2).toBeCloseTo(360, 1); // 12 m × 30 m
    expect(proposta.aviso).toMatch(/12,00 m de testada/);
  });

  it('profundidade menor que a quadra deixa o fundo não loteado, e diz', () => {
    const m = comQuadra();
    const proposta = subdividirQuadra(m.quadras[0], { ...SUBDIVISAO_PADRAO, testadaMm: 12000, profundidadeMm: 20000 });

    expect(proposta.lotes).toHaveLength(5);
    expect(proposta.lotes.every((l) => l.areaM2 === 240)).toBe(true);
    expect(proposta.aviso).toMatch(/10,00 m de profundidade/);
  });

  it('duas fileiras só nascem quando a segunda cabe INTEIRA', () => {
    const m = comQuadra();
    // 15 m + 15 m cabem nos 30 m da quadra: 10 lotes.
    const cabe = subdividirQuadra(m.quadras[0], { ...SUBDIVISAO_PADRAO, testadaMm: 12000, profundidadeMm: 15000, duasFileiras: true });
    expect(cabe.lotes).toHaveLength(10);
    expect(cabe.lotes.filter((l) => l.fileira === 1)).toHaveLength(5);

    // 20 m + 20 m não cabem: fica só a primeira fileira, e a sobra é declarada.
    const naoCabe = subdividirQuadra(m.quadras[0], { ...SUBDIVISAO_PADRAO, testadaMm: 12000, profundidadeMm: 20000, duasFileiras: true });
    expect(naoCabe.lotes).toHaveLength(5);
    expect(naoCabe.aviso).toMatch(/profundidade/);
  });

  it('sem profundidade declarada, o lote vai até o outro lado da quadra', () => {
    const m = comQuadra();
    const proposta = subdividirQuadra(m.quadras[0], { ...SUBDIVISAO_PADRAO, testadaMm: 12000, profundidadeMm: null });
    expect(proposta.lotes.every((l) => l.areaM2 === 360)).toBe(true);
    expect(proposta.aviso).toBeNull();
  });

  it('é determinística: lotear duas vezes dá exatamente o mesmo desenho', () => {
    const m = comQuadra();
    const uma = subdividirQuadra(m.quadras[0], SUBDIVISAO_PADRAO);
    const outra = subdividirQuadra(m.quadras[0], SUBDIVISAO_PADRAO);
    expect(uma).toEqual(outra);
  });

  it('recusa com explicação quando a frente é menor que a testada', () => {
    const m = comQuadra();
    const proposta = subdividirQuadra(m.quadras[0], { ...SUBDIVISAO_PADRAO, testadaMm: 90000 });
    expect(proposta.lotes).toHaveLength(0);
    expect(proposta.aviso).toMatch(/menos que a testada/);
  });

  it('a frente escolhida manda: fatiar pelo lado leste dá lotes deitados', () => {
    const m = comQuadra();
    // Aresta 1 vai de (60000,0) a (60000,30000) — 30 m de frente, lotes de 12 m: 2.
    const proposta = subdividirQuadra(m.quadras[0], { ...SUBDIVISAO_PADRAO, testadaMm: 12000, profundidadeMm: 30000, frenteIndex: 1 });
    expect(proposta.lotes).toHaveLength(2);
    // Cada lote nasce encostado na aresta leste.
    expect(proposta.lotes[0].pontos.some((p) => p.x === 60000)).toBe(true);
  });

  it('a proposta NÃO grava: o modelo continua sem lotes', () => {
    const m = comQuadra();
    subdividirQuadra(m.quadras[0], SUBDIVISAO_PADRAO);
    expect(m.lotes).toHaveLength(0);
  });
});

describe('conferência da Lei 6.766', () => {
  /** Lança na quadra os lotes de uma proposta. */
  function lotear(m: BlueprintModel, testadaMm: number, profundidadeMm: number | null): BlueprintModel {
    const proposta = subdividirQuadra(m.quadras[0], { ...SUBDIVISAO_PADRAO, testadaMm, profundidadeMm });
    return applyBatch(
      m,
      proposta.lotes.map((l, i) => ({
        type: 'AddLote' as const,
        levelId: m.levels[0].id,
        quadraId: m.quadras[0].id,
        numero: String(i + 1),
        pontos: l.pontos,
      })),
    ).model;
  }

  it('loteamento regular não acusa erro nenhum', () => {
    const m = lotear(comQuadra(), 12000, 30000);
    const avisos = conferirLoteamento(m, REGRAS_PADRAO_DO_LOTEAMENTO, 1800 * 1e6);
    expect(resumoDaConferencia(avisos).erros).toBe(0);
  });

  it('acusa lote menor que o mínimo, e some ao corrigir', () => {
    // 12 m × 8 m = 96 m², abaixo dos 125 m² da Lei 6.766.
    const pequenos = lotear(comQuadra(), 12000, 8000);
    const avisos = conferirLoteamento(pequenos, REGRAS_PADRAO_DO_LOTEAMENTO, 1800 * 1e6);
    const porArea = avisos.filter((a) => a.regra === 'area_minima');
    expect(porArea).toHaveLength(5);
    expect(porArea[0].gravidade).toBe('ERRO');
    expect(porArea[0].texto).toMatch(/96,00 m² < mínimo 125,00 m²/);

    const corrigidos = lotear(comQuadra(), 12000, 30000);
    expect(conferirLoteamento(corrigidos, REGRAS_PADRAO_DO_LOTEAMENTO, 1800 * 1e6).filter((a) => a.regra === 'area_minima')).toHaveLength(0);
  });

  it('acusa testada menor que a mínima', () => {
    // 4 m de testada: abaixo dos 5 m do art. 4º, II.
    const m = lotear(comQuadra(), 4000, 30000);
    const avisos = conferirLoteamento(m, REGRAS_PADRAO_DO_LOTEAMENTO, 1800 * 1e6);
    const porTestada = avisos.filter((a) => a.regra === 'testada_minima');
    expect(porTestada.length).toBeGreaterThan(0);
    expect(porTestada[0].texto).toMatch(/4,00 m < mínima 5,00 m/);
  });

  it('acusa o lote encravado', () => {
    const m = base();
    const levelId = m.levels[0].id;
    const semVia = applyBatch(m, [
      { type: 'AddLote', levelId, numero: '1', pontos: [{ x: 0, y: 0 }, { x: 20000, y: 0 }, { x: 20000, y: 20000 }, { x: 0, y: 20000 }] },
    ]).model;
    const avisos = conferirLoteamento(semVia, REGRAS_PADRAO_DO_LOTEAMENTO, null);
    expect(avisos.some((a) => a.regra === 'encravado' && a.gravidade === 'ERRO')).toBe(true);
  });

  it('acusa número repetido DENTRO da quadra, e não entre quadras', () => {
    const m = comQuadra();
    const levelId = m.levels[0].id;
    const repetido = applyBatch(m, [
      { type: 'AddLote', levelId, quadraId: m.quadras[0].id, numero: '1', pontos: [{ x: 0, y: 0 }, { x: 12000, y: 0 }, { x: 12000, y: 30000 }, { x: 0, y: 30000 }] },
      { type: 'AddLote', levelId, quadraId: m.quadras[0].id, numero: '1', pontos: [{ x: 12000, y: 0 }, { x: 24000, y: 0 }, { x: 24000, y: 30000 }, { x: 12000, y: 30000 }] },
    ]).model;
    const avisos = conferirLoteamento(repetido, REGRAS_PADRAO_DO_LOTEAMENTO, null);
    expect(avisos.filter((a) => a.regra === 'numero_repetido')).toHaveLength(1);

    // Duas quadras, cada uma com o lote 1: normal, não acusa.
    const duas = applyBatch(comQuadra(), [
      { type: 'AddQuadra', levelId, nome: 'B', pontos: [{ x: 80000, y: 0 }, { x: 140000, y: 0 }, { x: 140000, y: 30000 }, { x: 80000, y: 30000 }] },
    ]).model;
    const comLotes = applyBatch(duas, [
      { type: 'AddLote', levelId, quadraId: duas.quadras.find((q) => q.nome === 'A')?.id ?? null, numero: '1', pontos: [{ x: 0, y: 0 }, { x: 12000, y: 0 }, { x: 12000, y: 30000 }, { x: 0, y: 30000 }] },
      { type: 'AddLote', levelId, quadraId: duas.quadras.find((q) => q.nome === 'B')?.id ?? null, numero: '1', pontos: [{ x: 80000, y: 0 }, { x: 92000, y: 0 }, { x: 92000, y: 30000 }, { x: 80000, y: 30000 }] },
    ]).model;
    expect(conferirLoteamento(comLotes, REGRAS_PADRAO_DO_LOTEAMENTO, null).filter((a) => a.regra === 'numero_repetido')).toHaveLength(0);
  });

  it('áreas públicas: INFORMA sem mínimo declarado, REPROVA com mínimo', () => {
    const m = lotear(comQuadra(), 12000, 30000);
    // Sem mínimo: a Lei 6.766 não fixa percentual desde a Lei 9.785/99.
    const semMinimo = conferirLoteamento(m, REGRAS_PADRAO_DO_LOTEAMENTO, 1800 * 1e6).find((a) => a.regra === 'areas_publicas');
    expect(semMinimo?.gravidade).toBe('OK');
    expect(semMinimo?.texto).toMatch(/lei municipal é que fixa/i);

    // ⚠️ Sobre a gleba de 1.800 m² a rua sozinha já dá 66% — a quadra do teste é
    // pequena perto da via. Para medir a REPROVAÇÃO é preciso uma gleba de
    // tamanho real: 10.000 m², onde os mesmos 1.200 m² de rua dão 12%.
    const comMinimo = conferirLoteamento(m, { ...REGRAS_PADRAO_DO_LOTEAMENTO, areasPublicasMinPct: 35 }, 10000 * 1e6).find((a) => a.regra === 'areas_publicas');
    expect(comMinimo?.gravidade).toBe('ERRO');
    expect(comMinimo?.texto).toMatch(/< mínimo 35,00%/);

    // E aprova quando as áreas públicas alcançam o mínimo.
    const folgado = conferirLoteamento(m, { ...REGRAS_PADRAO_DO_LOTEAMENTO, areasPublicasMinPct: 10 }, 10000 * 1e6).find((a) => a.regra === 'areas_publicas');
    expect(folgado?.gravidade).toBe('OK');
  });

  it('os pisos da Lei 6.766 são os do art. 4º, II', () => {
    expect(AREA_MINIMA_LEI_6766_M2).toBe(125);
    expect(TESTADA_MINIMA_LEI_6766_MM).toBe(5000);
    expect(areaEmM2([{ x: 0, y: 0 }, { x: 12000, y: 0 }, { x: 12000, y: 30000 }, { x: 0, y: 30000 }])).toBe(360);
  });
});
