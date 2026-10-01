/**
 * Incêndio E0.2/E0.3 (30/09/2026): classificação da edificação e medidas
 * exigidas no preset MG. A mecânica (declarado vence sugerido, altura pela descarga,
 * preset sem tabela dá SEM_TABELA) e, desde a D1 (01/10/2026), as exigências pelo
 * TEXTO da IT 01 do CBMMG — a tabela célula a célula está em `incendioExigenciasMG.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, recomputeSpaces, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import {
  HIPOTESES_INCENDIO_PADRAO,
  classificarEdificacao,
  exigenciasDaEdificacao,
  hipotesesIncendioDaColuna,
  normalizarDivisao,
  tipoPorAltura,
  type HipotesesDeClassificacao,
} from '../utils/blueprintIncendioClassificacao';

/** N pavimentos de pé-direito 2,90 m, cada um uma caixa de `lado` mm com o nome dado; `unidades` unidades cadastradas. */
function predio(opts: { andares: number; ladoMm?: number; nome?: string; unidades?: number; extraNivel?: string }): BlueprintModel {
  const lado = opts.ladoMm ?? 6000;
  let m = emptyModel();
  for (let i = 0; i < opts.andares; i++) m = applyCommand(m, { type: 'AddLevel', name: i === 0 ? 'Térreo' : `${i}º pavimento`, elevationMm: i * 2900, defaultHeightMm: 2800 }).model;
  if (opts.extraNivel) m = applyCommand(m, { type: 'AddLevel', name: opts.extraNivel, elevationMm: opts.andares * 2900, defaultHeightMm: 2800 }).model;
  const cmds: Command[] = [];
  for (const l of m.levels) {
    for (const [ax, ay, bx, by] of [[0, 0, lado, 0], [lado, 0, lado, lado], [lado, lado, 0, lado], [0, lado, 0, 0]]) {
      cmds.push({ type: 'AddWall', levelId: l.id, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 } as Command);
    }
  }
  m = recomputeSpaces(applyBatch(m, cmds).model);
  for (const s of m.spaces) m = applyCommand(m, { type: 'NameSpace', spaceId: s.id, name: opts.nome ?? 'Sala' } as Command).model;
  for (let u = 0; u < (opts.unidades ?? 0); u++) m = applyCommand(m, { type: 'AddUnidade', numero: String(101 + u) } as Command).model;
  return m;
}

const hip = (h: Partial<HipotesesDeClassificacao> = {}): HipotesesDeClassificacao => ({ ...HIPOTESES_INCENDIO_PADRAO.classificacao, ...h });

describe('premissas gravadas', () => {
  it('coluna vazia = padrão MG; tipo errado vira padrão; divisão é normalizada', () => {
    expect(hipotesesIncendioDaColuna(null)).toEqual(HIPOTESES_INCENDIO_PADRAO);
    const h = hipotesesIncendioDaColuna({ classificacao: { preset: 'XX', divisao: ' a2 ', alturaDeclaradaM: 'alto', cargaDeclaradaMJm2: -5, pisoDeDescargaLevelId: 7 } });
    expect(h.classificacao).toEqual({ preset: 'MG_CBMMG', divisao: 'A-2', alturaDeclaradaM: null, pisoDeDescargaLevelId: null, cargaDeclaradaMJm2: null });
    expect(normalizarDivisao('Z-2')).toBeNull();
    expect(normalizarDivisao('c-12')).toBe('C-12');
  });
});

describe('classificação', () => {
  it('sobrado de uma unidade: A-1 sugerida, altura 2,90 m (tipo I — IT 08, Tabela 1)', () => {
    const c = classificarEdificacao(predio({ andares: 2, nome: 'Quarto', unidades: 1 }), hip());
    expect(c.divisao).toMatchObject({ valor: 'A-1', origem: 'SUGERIDA' });
    expect(c.altura).toMatchObject({ valorM: 2.9, origem: 'DERIVADA', descarga: 'Térreo', ultimo: '1º pavimento' });
    expect(c.tipoPorAltura.tipo).toBe('I');
    expect(c.carga).toMatchObject({ valorMJm2: 300, origem: 'TABELA', nivel: 'BAIXA' });
  });

  it('8 pavimentos com 16 unidades: A-2, altura 20,3 m (tipo II); o barrilete não conta', () => {
    const c = classificarEdificacao(predio({ andares: 8, nome: 'Dormitório', unidades: 16, extraNivel: 'Barrilete' }), hip());
    expect(c.divisao.valor).toBe('A-2');
    expect(c.altura.valorM).toBeCloseTo(7 * 2.9, 9);
    expect(c.altura.ultimo).toBe('7º pavimento');
    expect(c.tipoPorAltura.tipo).toBe('II');
    expect(c.pavimentos).toBe(9);
  });

  it('a descarga declarada muda a altura (entrada pelo 1º pavimento)', () => {
    const m = predio({ andares: 3, nome: 'Sala', unidades: 2 });
    const c = classificarEdificacao(m, hip({ pisoDeDescargaLevelId: m.levels[1].id }));
    expect(c.altura.valorM).toBeCloseTo(2.9, 9);
  });

  it('declarado vence o sugerido; ambiente sem nome residencial pede a divisão', () => {
    expect(classificarEdificacao(predio({ andares: 1, nome: 'Loja' }), hip()).divisao).toMatchObject({ valor: null, origem: 'SEM' });
    const c = classificarEdificacao(predio({ andares: 1, nome: 'Loja' }), hip({ divisao: 'C-2', alturaDeclaradaM: 4 }));
    expect(c.divisao).toMatchObject({ valor: 'C-2', origem: 'DECLARADA' });
    expect(c.grupo?.nome).toBe('Comercial');
    expect(c.altura).toMatchObject({ valorM: 4, origem: 'DECLARADA' });
    expect(c.carga.valorMJm2).toBeNull();
    expect(c.pendencias.join(' ')).toContain('C-2');
  });

  it('faixas de altura nos limites (IT 08, Tabela 1)', () => {
    expect(tipoPorAltura(0).tipo).toBe('I');
    expect(tipoPorAltura(12).tipo).toBe('I');
    expect(tipoPorAltura(12.01).tipo).toBe('II');
    expect(tipoPorAltura(30).tipo).toBe('II');
    expect(tipoPorAltura(31).tipo).toBe('III');
    expect(tipoPorAltura(55).tipo).toBe('IV');
  });
});

describe('exigências (preset MG — IT 01 do CBMMG)', () => {
  const estado = (e: ReturnType<typeof exigenciasDaEdificacao>, id: string) => e.medidas.find((m) => m.medida === id)!.estado;

  it('A-1: tudo dispensado (A.4.1 a), sem rascunho', () => {
    const e = exigenciasDaEdificacao(classificarEdificacao(predio({ andares: 2, nome: 'Quarto', unidades: 1 }), hip()));
    expect(e.medidas.every((m) => m.estado === 'DISPENSADA' && !m.rascunho)).toBe(true);
    expect(e.temRascunho).toBe(false);
  });

  it('A-2 pequeno: saídas, sinalização e extintores exigidos; hidrante dispensado até 1.200 m² (nota 3); alarme não assinalado', () => {
    const e = exigenciasDaEdificacao(classificarEdificacao(predio({ andares: 2, nome: 'Sala', unidades: 2 }), hip()));
    expect(estado(e, 'EXTINTORES')).toBe('EXIGIDA');
    expect(estado(e, 'SAIDAS_EMERGENCIA')).toBe('EXIGIDA');
    expect(estado(e, 'HIDRANTES')).toBe('DISPENSADA');
    expect(estado(e, 'ALARME')).toBe('DISPENSADA');
  });

  it('A-2 acima de 12 m: hidrantes e iluminação exigidos; alarme só acima de 30 m', () => {
    const e = exigenciasDaEdificacao(classificarEdificacao(predio({ andares: 6, nome: 'Sala', unidades: 12 }), hip()));
    expect(estado(e, 'HIDRANTES')).toBe('EXIGIDA');
    expect(estado(e, 'ILUMINACAO_EMERGENCIA')).toBe('EXIGIDA');
    expect(estado(e, 'ALARME')).toBe('DISPENSADA');
    expect(e.medidas.find((m) => m.medida === 'HIDRANTES')!.motivo).toContain('12 < H ≤ 30 m');
  });

  it('A-2 térreo: hidrantes exigidos só acima de 1.200 m² (Tabela 1, nota 3)', () => {
    const grande = exigenciasDaEdificacao(classificarEdificacao(predio({ andares: 1, ladoMm: 36000, nome: 'Sala', unidades: 2 }), hip()));
    expect(grande.medidas.find((m) => m.medida === 'HIDRANTES')).toMatchObject({ estado: 'EXIGIDA', fonte: expect.stringContaining('Tabela 1, nota 3') });
    const medio = exigenciasDaEdificacao(classificarEdificacao(predio({ andares: 1, ladoMm: 30000, nome: 'Sala', unidades: 2 }), hip()));
    expect(estado(medio, 'HIDRANTES')).toBe('DISPENSADA');
  });

  it('preset sem tabela: tudo SEM_TABELA com o motivo; a C-2 tem tabela desde a D1', () => {
    const m = predio({ andares: 2, nome: 'Sala', unidades: 2 });
    const sp = exigenciasDaEdificacao(classificarEdificacao(m, hip({ preset: 'SP_CBPMESP' })));
    expect(sp.temTabela).toBe(false);
    expect(sp.medidas.every((x) => x.estado === 'SEM_TABELA' && x.motivo.includes('São Paulo'))).toBe(true);
    const c2 = exigenciasDaEdificacao(classificarEdificacao(m, hip({ divisao: 'C-2' })));
    expect(c2.medidas.some((x) => x.estado === 'SEM_TABELA')).toBe(false);
    expect(c2.medidas.find((x) => x.medida === 'EXTINTORES')!.fonte).toContain('Tabela 3');
    expect(c2.temRascunho).toBe(false);
  });
});
