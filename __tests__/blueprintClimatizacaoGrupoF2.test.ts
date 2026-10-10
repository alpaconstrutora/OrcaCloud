/**
 * CLIMATIZAÇÃO — grupo F, bloco "em seguida" (10/10/2026):
 *  - F11 os problemas de dimensionamento marcados no desenho;
 *  - F8  o corte com a linha em par (com isolamento) e com os equipamentos;
 *  - F9  o IFC de referência cortado na planta 2D;
 *  - F15 editar as propriedades numéricas de um tipo do catálogo (regras puras;
 *        a tela tem o teste de componente próprio).
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { HIPOTESES_CLIMATIZACAO_PADRAO } from '../utils/blueprintClimatizacao';
import { marcasDaClimatizacao, temClimatizacao } from '../utils/blueprintMarcasClimatizacao';
import type { RedeDeAr } from '../utils/blueprintRedeDeAr';
import { projetarCorte } from '../utils/blueprintCorte';
import { ALTURA_DO_CORTE_DA_PLANTA_MM, lerReferencias, matrizDaReferencia, referenciaNova, secaoHorizontalDaMalha } from '../utils/blueprintReferenciaExterna';
import { gerarIfc } from '../utils/blueprintIfc';
import { aplicarCamposAoTipo, camposEditaveisDoTipo } from '../utils/blueprintCatalogoDeTipos';
import type { PropriedadesDoTipo } from '../utils/blueprintTipos';

const hip = HIPOTESES_CLIMATIZACAO_PADRAO;
const terminais = (m: BlueprintModel) => m.terminais ?? [];

/** A casa 6 × 4 m (paredes de 150 mm), um pavimento. */
function casa() {
  const a = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = a.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  return { m: applyBatch(a, [w(0, 0, 6000, 0), w(6000, 0, 6000, 4000), w(6000, 4000, 0, 4000), w(0, 4000, 0, 0)]).model, t };
}

describe('F11 · as marcas da climatização no desenho', () => {
  it('sem climatização no desenho, nada é calculado', () => {
    const { m } = casa();
    expect(temClimatizacao(m)).toBe(false);
    expect(marcasDaClimatizacao(m, hip)).toEqual([]);
  });

  it('evaporadora sem linha, dreno fino, exaustor sem duto e a rede de ar calculada viram marcas no lugar', () => {
    const { m, t } = casa();
    let x = applyBatch(m, [
      { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'EV', tipoHidraulico: 'EVAPORADORA_HI_WALL', at: point(3000, 3815), cotaMm: 2200, capacidadeBtuH: 60000 } as Command,
      { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'CD', tipoHidraulico: 'CONDENSADORA_SPLIT', at: point(-700, 2000), cotaMm: 850 } as Command,
      { type: 'AddTerminal', levelId: t, disciplina: 'DRENO_AC', tipo: 'Ponto de dreno', tipoHidraulico: 'PONTO_DRENO', at: point(3000, 1000), cotaMm: 0 } as Command,
      { type: 'AddTrecho', levelId: t, disciplina: 'DRENO_AC', a: point(3000, 3815), b: point(3000, 1000), cotaAMm: 2200, cotaBMm: 0, bitolaMm: 20 } as Command,
      { type: 'AddTerminal', levelId: t, disciplina: 'MECANICA', tipo: 'Exaustor', tipoHidraulico: 'EXAUSTOR_AR', at: point(5000, 3000), cotaMm: 2300 } as Command,
    ]).model;
    const ev = terminais(x).find((y) => y.tipoHidraulico === 'EVAPORADORA_HI_WALL')!;
    const cd = terminais(x).find((y) => y.tipoHidraulico === 'CONDENSADORA_SPLIT')!;
    x = applyCommand(x, { type: 'SetTerminalProps', terminalId: ev.id, condensadoraId: cd.id }).model;
    // 60.000 BTU/h × 1 L/h por mil = 60 L/h pede DN 32; o dreno tem 20.
    const marcas = marcasDaClimatizacao(x, { ...hip, linha: { ...hip.linha, condensadoLhPorKbtu: 1 } });
    const porTipo = Object.fromEntries(marcas.map((k) => [k.tipo, k]));
    expect(porTipo.CLIMA_SEM_LINHA).toMatchObject({ severidade: 'AVISO', alvoId: ev.id, at: { x: 3000, y: 3815 } });
    expect(porTipo.CLIMA_DN_DRENO).toMatchObject({ severidade: 'ERRO', texto: expect.stringMatching(/^DN 20 < 32/), at: { x: 3000, y: 2408 } });
    expect(porTipo.CLIMA_SEM_SIFAO).toMatchObject({ severidade: 'AVISO', alvoId: ev.id });
    expect(porTipo.CLIMA_EXAUSTOR_SEM_DUTO).toMatchObject({ severidade: 'AVISO', at: { x: 5000, y: 3000 } });
    // A rede de ar, quando quem chama a tem calculada (a gaveta aberta).
    const trechoId = (x.trechos ?? [])[0].id;
    const rede = { raiz: ev, terminais: [], trechos: [{ trechoId, vazaoM3h: 900, terminais: 2, secao: { bitolaMm: 200, alturaDutoMm: 250 }, velocidadeMs: 9.4, atritoPa: 3, proposta: { bitolaMm: 300, alturaDutoMm: 250 }, velocidadeAlta: true }], vazaoTotalM3h: 900, perdaCriticaPa: 210, pressaoDisponivelPa: 150, atende: false, semVazao: [] } as unknown as RedeDeAr;
    const comRede = marcasDaClimatizacao(x, hip, [rede]);
    expect(comRede.find((k) => k.tipo === 'CLIMA_VELOCIDADE_DUTO')).toMatchObject({ severidade: 'AVISO', texto: '9,4 m/s' });
    expect(comRede.find((k) => k.tipo === 'CLIMA_PRESSAO_DUTO')).toMatchObject({ severidade: 'ERRO', texto: 'caminho crítico 210 Pa > 150 Pa' });
    // Ordem estável e filtro por pavimento.
    expect(marcasDaClimatizacao(x, hip, [], 'outro')).toEqual([]);
  });
});

describe('F8 · o corte da climatização', () => {
  /** Corte horizontal em y = 2000 olhando para +y: u = x. */
  const cortar = (m: BlueprintModel) => {
    const r = applyCommand(m, { type: 'AddCorte', a: point(-1000, 2000), b: point(7000, 2000) });
    return projetarCorte(r.model, { corte: r.model.sections[0] });
  };

  it('a linha frigorígena cortada são DOIS tubos lado a lado, com o isolamento no raio', () => {
    const { m, t } = casa();
    const x = applyCommand(m, { type: 'AddTrecho', levelId: t, disciplina: 'FRIGORIGENA', a: point(3000, 0), b: point(3000, 4000), cotaAMm: 2500, cotaBMm: 2500, bitolaMm: 6, bitolaSuccaoMm: 10, isolamentoMm: 9 } as Command).model;
    const tubos = cortar(x).cortados.filter((c) => c.disciplina === 'FRIGORIGENA');
    expect(tubos).toHaveLength(2);
    const caixa = (c: (typeof tubos)[number]) => ({ uMin: Math.min(...c.pontos.map((p) => p.u)), uMax: Math.max(...c.pontos.map((p) => p.u)), vMin: Math.min(...c.pontos.map((p) => p.v)), vMax: Math.max(...c.pontos.map((p) => p.v)) });
    // Raios do envelope 12 (líquido) e 14 (sucção), centros a ±19 mm do eixo.
    expect(tubos.map(caixa).sort((a, b) => a.uMin - b.uMin)).toEqual([
      { uMin: 2967, uMax: 2995, vMin: 2486, vMax: 2514 },
      { uMin: 3007, uMax: 3031, vMin: 2488, vMax: 2512 },
    ]);
  });

  it('o dreno isolado cortado conta o isolamento; o tubo sem isolamento, só o raio', () => {
    const { m, t } = casa();
    const x = applyBatch(m, [
      { type: 'AddTrecho', levelId: t, disciplina: 'DRENO_AC', a: point(1000, 0), b: point(1000, 4000), cotaAMm: 2400, cotaBMm: 2300, bitolaMm: 25, isolamentoMm: 10 } as Command,
      { type: 'AddTrecho', levelId: t, disciplina: 'AGUA_FRIA', a: point(2000, 0), b: point(2000, 4000), cotaAMm: 600, cotaBMm: 600, bitolaMm: 25 } as Command,
    ]).model;
    const largura = (d: string) => {
      const c = cortar(x).cortados.find((k) => k.disciplina === d)!;
      return Math.max(...c.pontos.map((p) => p.u)) - Math.min(...c.pontos.map((p) => p.u));
    };
    expect(largura('DRENO_AC')).toBe(45);
    expect(largura('AGUA_FRIA')).toBe(25);
  });

  it('o equipamento atrás do plano entra no corte, com a caixa vista no plano e a cota do centro', () => {
    const { m, t } = casa();
    const x = applyBatch(m, [
      { type: 'AddTerminal', levelId: t, disciplina: 'FRIGORIGENA', tipo: 'EV', tipoHidraulico: 'EVAPORADORA_HI_WALL', at: point(1500, 3815), cotaMm: 2200, larguraMm: 900, profundidadeMm: 220, alturaMm: 300 } as Command,
      // Na frente do plano (y < 2000, olhando para +y): fica de fora.
      { type: 'AddTerminal', levelId: t, disciplina: 'MECANICA', tipo: 'Difusor', tipoHidraulico: 'DIFUSOR', at: point(4000, 500), cotaMm: 2600 } as Command,
    ]).model;
    const pecas = cortar(x).pecasDeClimatizacao ?? [];
    expect(pecas).toEqual([expect.objectContaining({ tipo: 'EVAPORADORA_HI_WALL', disciplina: 'FRIGORIGENA', u: 1500, v: 2200, larguraMm: 900, alturaMm: 300 })]);
    // Girada 90°, o que se vê no plano é a profundidade.
    const girada = applyCommand(x, { type: 'SetTerminalProps', terminalId: terminais(x)[0].id, rotacaoGraus: 90 } as Command).model;
    expect(cortar(girada).pecasDeClimatizacao?.[0].larguraMm).toBe(220);
  });
});

describe('F9 · o IFC de referência na planta 2D', () => {
  it('o corte horizontal de uma caixa de 1 m dá o contorno dela, em mm de planta (Z do viewer = y da planta)', () => {
    // Um cubo de 1 m (x 0..1, y 0..3 de altura, z 2..3), doze triângulos.
    const v = [
      [0, 0, 2], [1, 0, 2], [1, 3, 2], [0, 3, 2],
      [0, 0, 3], [1, 0, 3], [1, 3, 3], [0, 3, 3],
    ].flat();
    const f = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 3, 2, 6, 3, 6, 7, 0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2];
    const segs = secaoHorizontalDaMalha(v, f, 1.2);
    expect(segs.length).toBeGreaterThanOrEqual(4);
    const xs = segs.flatMap((s) => [s.a.x, s.b.x]);
    const ys = segs.flatMap((s) => [s.a.y, s.b.y]);
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([0, 1000, 2000, 3000]);
    // Acima do cubo, nada.
    expect(secaoHorizontalDaMalha(v, f, 3.5)).toEqual([]);
  });

  it('a altura do corte é da referência, com o padrão para o que foi gravado antes', () => {
    expect(ALTURA_DO_CORTE_DA_PLANTA_MM).toBe(1200);
    const [r] = lerReferencias([{ ...referenciaNova({ id: 'a', nome: 'A', storagePath: 'x/a.ifc' }) }]);
    expect(r.alturaDoCorteMm).toBe(1200);
    expect(lerReferencias([{ ...r, alturaDoCorteMm: 900 }])[0].alturaDoCorteMm).toBe(900);
    expect(lerReferencias([{ ...r, alturaDoCorteMm: -5 }])[0].alturaDoCorteMm).toBe(0);
  });

  it('um IFC real (a casa exportada pela Planta) cortado a 1,20 m dá as paredes onde elas estão', async () => {
    const { m } = casa();
    const ifc = gerarIfc(m, { titulo: 'Casa', revisao: 1, hash: 'f'.repeat(64), data: new Date('2026-10-10T12:00:00Z') });
    const { usarCaminhoDoWasm, secaoDoIfc } = await import('../services/ifcViewerService');
    usarCaminhoDoWasm('');
    const bytes = new TextEncoder().encode(ifc).buffer as ArrayBuffer;
    const { segmentos } = await secaoDoIfc(bytes, matrizDaReferencia(referenciaNova({ id: 'a', nome: 'A', storagePath: 'x' })), 1.2);
    expect(segmentos.length).toBeGreaterThan(8);
    const xs = segmentos.flatMap((s) => [s.a.x, s.b.x]);
    const ys = segmentos.flatMap((s) => [s.a.y, s.b.y]);
    // O corpo das paredes vai de −75 a 6075 em x e de −75 a 4075 em y (o avanço de canto).
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-80);
    expect(Math.max(...xs)).toBeLessThanOrEqual(6080);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(-80);
    expect(Math.max(...ys)).toBeLessThanOrEqual(4080);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(6000);
    // Deslocada 10 m em x, a mesma planta cai 10 m adiante.
    const desl = await secaoDoIfc(bytes, matrizDaReferencia({ deslocamentoXMm: 10000, deslocamentoYMm: 0, cotaMm: 0, rotacaoDeg: 0 }), 1.2);
    expect(Math.min(...desl.segmentos.flatMap((s) => [s.a.x, s.b.x]))).toBeGreaterThanOrEqual(9920);
  });
});

describe('F15 · editar as propriedades numéricas do tipo', () => {
  const tipo = { familia: 'TERMINAL', disciplina: 'FRIGORIGENA', tipo: 'Split 12', tipoHidraulico: 'EVAPORADORA_HI_WALL', capacidadeBtuH: 12000, potenciaW: 1100, larguraMm: 900, profundidadeMm: 220, alturaMm: 300, cotaMm: 2200 } as unknown as PropriedadesDoTipo;

  it('os campos numéricos com rótulo; texto e família ficam de fora', () => {
    const campos = camposEditaveisDoTipo(tipo);
    expect(campos.map((c) => c.chave).sort()).toEqual(['alturaMm', 'capacidadeBtuH', 'cotaMm', 'larguraMm', 'potenciaW', 'profundidadeMm']);
    expect(campos.find((c) => c.chave === 'capacidadeBtuH')).toEqual({ chave: 'capacidadeBtuH', rotulo: 'Capacidade (BTU/h)', valor: 12000 });
  });

  it('grava os números (com vírgula); recusa vazio, texto e negativo, dizendo o campo', () => {
    const r = aplicarCamposAoTipo(tipo, { capacidadeBtuH: '18000', potenciaW: '1650,5', tipo: 'não muda' });
    expect(r).toEqual({ propriedades: { ...(tipo as object), capacidadeBtuH: 18000, potenciaW: 1650.5 } });
    expect(aplicarCamposAoTipo(tipo, { capacidadeBtuH: '' })).toEqual({ erro: 'Capacidade (BTU/h): informe um número.' });
    expect(aplicarCamposAoTipo(tipo, { larguraMm: 'abc' })).toEqual({ erro: 'Largura (mm): informe um número.' });
    expect(aplicarCamposAoTipo(tipo, { alturaMm: '-1' })).toEqual({ erro: 'Altura (mm): não pode ser negativo.' });
  });
});
