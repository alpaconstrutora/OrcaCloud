/**
 * E7.1 — TRATAMENTO INDIVIDUAL: AS UNIDADES (29/09/2026, NBR 7229/13969): o
 * tanque séptico, o filtro anaeróbio e o sumidouro no kernel (cota do tubo,
 * corpo), o lançamento em fila a partir da caixa de inspeção e o esgoto que
 * passa a terminar no sumidouro.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  canonicalPayload,
  conexoesDerivadas,
  emptyModel,
  extensaoVerticalDaCaixa,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  point,
  type BlueprintModel,
} from '../utils/blueprintKernel';
import { ROTULO_DO_TRATAMENTO, planejarTratamento, temTratamentoIndividual } from '../utils/blueprintTratamento';
import { esgotoTrechoATrecho, fontesDeEsgoto, trechosDeEsgotoSemDestino } from '../utils/blueprintEsgotoAutomatico';
import { marcasDeVerificacao } from '../utils/blueprintVerificacaoRede';
import { verificacoesHidro } from '../utils/blueprintHidroExecutivo';
import { HIPOTESES_HIDRO_PADRAO } from '../utils/blueprintMemorialHidro';
import { corpoDaCaixa3D } from '../utils/blueprintIsometrico';
import { hipotesesHidroDaColuna } from '../hooks/useBlueprintHidro';
import { sobrado } from './fixtures/sobradoHidro';

const RESP = { nome: 'Ana', titulo: 'Eng', conselho: 'CREA' as const, registro: '1', artNumero: '2', artData: '2026-09-29' };
const base = () => sobrado(true, { cotaDaCaixaMm: 4500, ventilacao: true });
const lancar = (m: BlueprintModel, comFiltro = true) => applyBatch(m, planejarTratamento(m, { comFiltro }).comandos).model;

describe('E7.1 — as unidades no kernel', () => {
  it('só no esgoto; a cota é a do tubo: a tampa 40 cm acima, o fundo pela altura', () => {
    const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const l = m.levels[0].id;
    expect(() => applyCommand(m, { type: 'AddTerminal', levelId: l, disciplina: 'PLUVIAL', tipo: 'TS', at: point(0, 0), cotaMm: -800, tipoHidraulico: 'TANQUE_SEPTICO' })).toThrow();
    const com = applyCommand(m, { type: 'AddTerminal', levelId: l, disciplina: 'ESGOTO', tipo: 'TS', at: point(0, 0), cotaMm: -800, tipoHidraulico: 'TANQUE_SEPTICO', larguraMm: 2000, profundidadeMm: 1000, alturaMm: 2000 }).model;
    const ts = com.terminais![0];
    expect(ts).toMatchObject({ larguraMm: 2000, profundidadeMm: 1000, alturaMm: 2000 });
    expect(extensaoVerticalDaCaixa(ts)).toEqual({ fundoMm: -2400, topoMm: -400 });
    // Ida e volta pelo canônico com as medidas.
    expect(modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(com))).terminais![0]).toMatchObject({ tipoHidraulico: 'TANQUE_SEPTICO', larguraMm: 2000, alturaMm: 2000 });
  });

  it('o sumidouro e o filtro são cilindros no 3D; o tanque, prisma', () => {
    const m = lancar(base());
    const t = (tipo: string) => m.terminais!.find((x) => x.tipoHidraulico === tipo)!;
    expect(corpoDaCaixa3D(t('SUMIDOURO'), 0)!.forma).toBe('CILINDRO');
    expect(corpoDaCaixa3D(t('FILTRO_ANAEROBIO'), 0)!.forma).toBe('CILINDRO');
    expect(corpoDaCaixa3D(t('TANQUE_SEPTICO'), 0)!.forma).toBe('PRISMA');
  });
});

describe('E7.1 — o lançamento', () => {
  it('sobrado (CI em 6,0; −1,5): tanque, filtro e sumidouro em fila para +x, folgas de 1,0/1,0/1,5 m, tubo a 1 %', () => {
    const p = planejarTratamento(base());
    expect(p.motivo).toBeNull();
    expect(p.unidades.map((u) => [u.tipo, u.at.x, u.at.y, u.cotaMm])).toEqual([
      // CI 600 → face a 300; tanque 2,40 m: centro em 300 + 1000 + 1200 = 2500.
      ['TANQUE_SEPTICO', 8500, -1500, -725],
      ['FILTRO_ANAEROBIO', 11450, -1500, -755],
      ['SUMIDOURO', 14450, -1500, -785],
    ]);
    // O tanque deitado no eixo x: largura (x) = comprimento 2,40 m.
    expect(p.comandos.find((c) => c.type === 'AddTerminal' && c.tipoHidraulico === 'TANQUE_SEPTICO')).toMatchObject({ larguraMm: 2400, profundidadeMm: 1200, alturaMm: 1800, sugerida: true });
    expect(p.comandos.filter((c) => c.type === 'AddTrecho')).toHaveLength(3);
  });

  it('sem filtro: tanque e sumidouro', () => {
    expect(planejarTratamento(base(), { comFiltro: false }).unidades.map((u) => u.tipo)).toEqual(['TANQUE_SEPTICO', 'SUMIDOURO']);
  });

  it('os motivos: com ligação à rede pública não se aplica; sem caixa de inspeção, nada a partir', () => {
    expect(planejarTratamento(sobrado(true, { ligacao: true })).motivo).toMatch(/ligação à rede pública/);
    const vazio = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
    expect(planejarTratamento(vazio).motivo).toMatch(/^Coloque a caixa de inspeção/);
  });

  it('relançar troca as sugeridas; com uma unidade confirmada, não relança', () => {
    const m = lancar(base());
    expect(planejarTratamento(m).apagados).toBe(3);
    const ts = m.terminais!.find((x) => x.tipoHidraulico === 'TANQUE_SEPTICO')!;
    const confirmado = applyCommand(m, { type: 'SetTerminalProps', terminalId: ts.id, sugerida: false }).model;
    expect(planejarTratamento(confirmado).motivo).toMatch(/unidades confirmadas/);
  });
});

describe('E7.1 — o esgoto termina no sumidouro', () => {
  it('a árvore do esgoto parte do sumidouro; nada sem destino, nada solto, nada em contrafluxo', () => {
    const m = lancar(base());
    const su = m.terminais!.find((x) => x.tipoHidraulico === 'SUMIDOURO')!;
    const calc = esgotoTrechoATrecho(m);
    expect(calc.filter((c) => c.rotulo === ROTULO_DO_TRATAMENTO).map((c) => [c.caixaId, c.uhc, c.papel])).toEqual([
      [su.id, 20, 'SUBCOLETOR'],
      [su.id, 20, 'SUBCOLETOR'],
      [su.id, 20, 'SUBCOLETOR'],
    ]);
    expect(trechosDeEsgotoSemDestino(m)).toEqual([]);
    // Nenhuma ponta solta nos tubos do tratamento (as do esgoto são só as saídas da ventilação, de propósito).
    const tratamento = new Set(m.trechos!.filter((t) => t.rotulo === ROTULO_DO_TRATAMENTO).map((t) => t.id));
    expect(conexoesDerivadas(m).pontasAbertas.filter((p) => tratamento.has(p.trechoId))).toEqual([]);
    expect(marcasDeVerificacao(m).filter((x) => x.disciplina === 'ESGOTO')).toEqual([]);
    // As unidades não são fontes de esgoto.
    expect(fontesDeEsgoto(m).some((f) => ['TANQUE_SEPTICO', 'FILTRO_ANAEROBIO', 'SUMIDOURO'].includes(f.tipoHidraulico!))).toBe(false);
  });

  it('com tratamento, a conferência não pede o coletor até a rede pública', () => {
    const m = lancar(base());
    expect(temTratamentoIndividual(m)).toBe(true);
    const itens = verificacoesHidro(m, HIPOTESES_HIDRO_PADRAO, RESP).verificacoes.map((v) => v.item);
    expect(itens).not.toContain('Coletor predial até a rede pública');
    expect(verificacoesHidro(base(), HIPOTESES_HIDRO_PADRAO, RESP).verificacoes.map((v) => v.item)).toContain('Coletor predial até a rede pública');
  });

  it('premissa do estudo: com filtro por padrão; o gravado volta', () => {
    expect(hipotesesHidroDaColuna({}).tratamento).toEqual({ comFiltro: true });
    expect(hipotesesHidroDaColuna({ tratamento: { comFiltro: false } }).tratamento).toEqual({ comFiltro: false });
  });
});
