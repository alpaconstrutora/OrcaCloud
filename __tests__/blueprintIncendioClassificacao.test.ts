/**
 * Incêndio E0.2/E0.3 (30/09/2026): classificação da edificação e medidas
 * exigidas no preset MG. As tabelas são RASCUNHO (sem o texto do CBMMG): o que
 * se prova aqui é a mecânica — declarado vence sugerido, altura pela descarga,
 * e regra não transcrita dá SEM_TABELA, nunca um palpite.
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
  it('sobrado de uma unidade: A-1 sugerida, altura 2,90 m (tipo II)', () => {
    const c = classificarEdificacao(predio({ andares: 2, nome: 'Quarto', unidades: 1 }), hip());
    expect(c.divisao).toMatchObject({ valor: 'A-1', origem: 'SUGERIDA' });
    expect(c.altura).toMatchObject({ valorM: 2.9, origem: 'DERIVADA', descarga: 'Térreo', ultimo: '1º pavimento' });
    expect(c.tipoPorAltura.tipo).toBe('II');
    expect(c.carga).toMatchObject({ valorMJm2: 300, origem: 'TABELA', nivel: 'BAIXA' });
  });

  it('8 pavimentos com 16 unidades: A-2, altura 20,3 m (tipo IV); o barrilete não conta', () => {
    const c = classificarEdificacao(predio({ andares: 8, nome: 'Dormitório', unidades: 16, extraNivel: 'Barrilete' }), hip());
    expect(c.divisao.valor).toBe('A-2');
    expect(c.altura.valorM).toBeCloseTo(7 * 2.9, 9);
    expect(c.altura.ultimo).toBe('7º pavimento');
    expect(c.tipoPorAltura.tipo).toBe('IV');
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

  it('faixas de altura nos limites', () => {
    expect(tipoPorAltura(0).tipo).toBe('I');
    expect(tipoPorAltura(6).tipo).toBe('II');
    expect(tipoPorAltura(6.01).tipo).toBe('III');
    expect(tipoPorAltura(30).tipo).toBe('V');
    expect(tipoPorAltura(31).tipo).toBe('VI');
  });
});

describe('exigências (preset MG, rascunho)', () => {
  const estado = (e: ReturnType<typeof exigenciasDaEdificacao>, id: string) => e.medidas.find((m) => m.medida === id)!.estado;

  it('A-1: tudo dispensado, em rascunho', () => {
    const e = exigenciasDaEdificacao(classificarEdificacao(predio({ andares: 2, nome: 'Quarto', unidades: 1 }), hip()));
    expect(e.medidas.every((m) => m.estado === 'DISPENSADA' && m.rascunho)).toBe(true);
    expect(e.temRascunho).toBe(true);
  });

  it('A-2 pequeno: saídas, sinalização e extintores exigidos; hidrante sem tabela (não "dispensado")', () => {
    const e = exigenciasDaEdificacao(classificarEdificacao(predio({ andares: 2, nome: 'Sala', unidades: 2 }), hip()));
    expect(estado(e, 'EXTINTORES')).toBe('EXIGIDA');
    expect(estado(e, 'SAIDAS_EMERGENCIA')).toBe('EXIGIDA');
    expect(estado(e, 'HIDRANTES')).toBe('SEM_TABELA');
    expect(estado(e, 'ALARME')).toBe('SEM_TABELA');
  });

  it('A-2 acima de 12 m: hidrantes e iluminação exigidos; alarme continua sem tabela', () => {
    const e = exigenciasDaEdificacao(classificarEdificacao(predio({ andares: 6, nome: 'Sala', unidades: 12 }), hip()));
    expect(estado(e, 'HIDRANTES')).toBe('EXIGIDA');
    expect(estado(e, 'ILUMINACAO_EMERGENCIA')).toBe('EXIGIDA');
    expect(estado(e, 'ALARME')).toBe('SEM_TABELA');
    expect(e.medidas.find((m) => m.medida === 'HIDRANTES')!.motivo).toContain('altura > 12 m');
  });

  it('A-2 acima de 750 m² em um pavimento: hidrantes exigidos pela área', () => {
    const e = exigenciasDaEdificacao(classificarEdificacao(predio({ andares: 1, ladoMm: 30000, nome: 'Sala', unidades: 2 }), hip()));
    expect(estado(e, 'HIDRANTES')).toBe('EXIGIDA');
  });

  it('preset sem tabela e divisão fora do grupo A: tudo SEM_TABELA com o motivo', () => {
    const m = predio({ andares: 2, nome: 'Sala', unidades: 2 });
    const sp = exigenciasDaEdificacao(classificarEdificacao(m, hip({ preset: 'SP_CBPMESP' })));
    expect(sp.temTabela).toBe(false);
    expect(sp.medidas.every((x) => x.estado === 'SEM_TABELA' && x.motivo.includes('São Paulo'))).toBe(true);
    const c2 = exigenciasDaEdificacao(classificarEdificacao(m, hip({ divisao: 'C-2' })));
    expect(c2.medidas.every((x) => x.estado === 'SEM_TABELA')).toBe(true);
    expect(c2.temRascunho).toBe(false);
  });
});
