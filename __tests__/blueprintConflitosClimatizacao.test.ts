/**
 * CLIMATIZAÇÃO E10.2 (07/10/2026): a compatibilização da climatização — o
 * ENVELOPE do trecho (isolamento; a linha com os DOIS tubos), o trecho × a CAIXA
 * de um equipamento a que ele não se liga, e o falso conflito da linha × dreno
 * que nascem no mesmo nó (a evaporadora) — sem esconder o encontro real mais
 * adiante. "Pronto quando": uma cena de N conflitos e N não-conflitos.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, conflitosDoModelo, distanciaEntreEixos3D, emptyModel, envelopeDoTrecho, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { volumesDasPecasDeClimatizacao } from '../utils/blueprintRede';
import { marcasDeVerificacao } from '../utils/blueprintVerificacaoRede';

function nivel() {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  return { m, t: m.levels[0].id };
}
const tr = (t: string, disciplina: string, a: [number, number], b: [number, number], ca: number, cb: number, bitola: number, extra: Record<string, unknown> = {}): Command =>
  ({ type: 'AddTrecho', levelId: t, disciplina, a: point(...a), b: point(...b), cotaAMm: ca, cotaBMm: cb, bitolaMm: bitola, ...extra }) as Command;
const peca = (t: string, disciplina: string, tipo: string, x: number, y: number, cota: number, extra: Record<string, unknown> = {}): Command =>
  ({ type: 'AddTerminal', levelId: t, disciplina, tipo, tipoHidraulico: tipo, at: point(x, y), cotaMm: cota, ...extra }) as Command;
const conflitos = (m: BlueprintModel) => conflitosDoModelo(m, { pecas: volumesDasPecasDeClimatizacao(m) });
const doTipo = (m: BlueprintModel, classe: string) => conflitos(m).filter((c) => c.classe === classe);

describe('climatização E10.2 · o envelope', () => {
  it('a linha são dois tubos: Ø6/10 isol. 9 ocupa 2 × 14 + 5 = 33 mm de cada lado em planta e 14 mm na vertical; o duto soma o isolamento', () => {
    expect(envelopeDoTrecho({ disciplina: 'FRIGORIGENA', bitolaMm: 6, bitolaSuccaoMm: 10, isolamentoMm: 9 })).toEqual({ raioPlantaMm: 33, raioVerticalMm: 14 });
    expect(envelopeDoTrecho({ disciplina: 'MECANICA', bitolaMm: 400, alturaDutoMm: 250, isolamentoMm: 25 })).toEqual({ raioPlantaMm: 225, raioVerticalMm: 150 });
    expect(envelopeDoTrecho({ disciplina: 'AGUA_FRIA', bitolaMm: 25 })).toEqual({ raioPlantaMm: 12.5, raioVerticalMm: 12.5 });
  });

  it('⚠️ pilar a 25 mm do eixo da linha: o tubo de líquido sozinho (3 mm) passava; o par isolado (33 mm) pega', () => {
    const { m, t } = nivel();
    // Pilar 200 × 200 centrado em (0, 125): a face está a 25 mm do eixo y = 0.
    const base = applyCommand(m, { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [point(0, 125)], larguraMm: 200, profundidadeMm: 200, alturaMm: 2800, baseMm: 0 } as Command).model;
    const sem = applyCommand(base, tr(t, 'FRIGORIGENA', [-2000, 0], [2000, 0], 2500, 2500, 6)).model;
    const com = applyCommand(base, tr(t, 'FRIGORIGENA', [-2000, 0], [2000, 0], 2500, 2500, 6, { bitolaSuccaoMm: 10, isolamentoMm: 9 })).model;
    expect(doTipo(sem, 'ESTRUTURA')).toEqual([]);
    expect(doTipo(com, 'ESTRUTURA')).toHaveLength(1);
  });
});

describe('climatização E10.2 · ⚠️ PRONTO QUANDO: a cena de N conflitos e N não-conflitos', () => {
  /**
   * NÃO-conflitos: (1) linha e dreno que nascem na evaporadora; (2) o duto que termina no
   * difusor; (3) o duto 30 cm abaixo da viga, com o envelope livre; (4) a linha que nasce
   * na condensadora (a ligação dela).
   * Conflitos: (A) a linha que ATRAVESSA a caixa de outra condensadora; (B) o dreno que
   * atravessa a viga; (C) o duto que cruza a linha longe de qualquer peça; (D) linha e dreno
   * que nascem juntos e se CRUZAM de novo 2 m adiante.
   */
  function cena() {
    const { m, t } = nivel();
    const comPecas = applyBatch(m, [
      peca(t, 'FRIGORIGENA', 'EVAPORADORA_HI_WALL', 0, 0, 2200),
      peca(t, 'FRIGORIGENA', 'CONDENSADORA_SPLIT', 4000, 0, 2200),
      // A condensadora "do vizinho", no caminho da linha A.
      peca(t, 'FRIGORIGENA', 'CONDENSADORA_SPLIT', 10000, 5000, 2200),
      peca(t, 'MECANICA', 'DIFUSOR', 6000, -4000, 2600),
      { type: 'AddStructural', levelId: t, kind: 'VIGA', pontos: [point(15000, -6000), point(15000, 6000)], larguraMm: 150, profundidadeMm: 400, alturaMm: 400, baseMm: 2400 } as Command,
    ]).model;
    return applyBatch(comPecas, [
      // (1) e (4): linha da evaporadora à condensadora; dreno da evaporadora para baixo e para o lado.
      tr(t, 'FRIGORIGENA', [0, 0], [4000, 0], 2200, 2200, 6, { bitolaSuccaoMm: 10, isolamentoMm: 9 }),
      tr(t, 'DRENO_AC', [0, 0], [0, 2000], 2200, 2180, 25),
      // (2) o duto que termina no difusor; (3) o duto 30 cm abaixo do fundo da viga.
      tr(t, 'MECANICA', [6000, -6000], [6000, -4000], 2600, 2600, 300, { alturaDutoMm: 200 }),
      tr(t, 'MECANICA', [14000, -5000], [16000, -5000], 2000, 2000, 300, { alturaDutoMm: 200 }),
      // (A) a linha que passa pela condensadora do vizinho.
      tr(t, 'FRIGORIGENA', [8000, 5000], [12000, 5000], 2200, 2200, 6, { bitolaSuccaoMm: 10, isolamentoMm: 9 }),
      // (B) o dreno que atravessa a viga.
      tr(t, 'DRENO_AC', [14000, 3000], [16000, 3000], 2600, 2580, 25),
      // (C) o duto que cruza a linha (A) longe de qualquer peça, na mesma cota.
      tr(t, 'MECANICA', [9000, 3000], [9000, 7000], 2200, 2200, 300, { alturaDutoMm: 200 }),
      // (D) nascem juntos em (20000, 0) e se cruzam de novo em x = 22000.
      tr(t, 'FRIGORIGENA', [20000, 0], [24000, 0], 2200, 2200, 6, { bitolaSuccaoMm: 10 }),
      tr(t, 'DRENO_AC', [20000, 0], [22000, 1000], 2200, 2200, 25),
      tr(t, 'DRENO_AC', [22000, 1000], [22000, -1000], 2200, 2200, 25),
    ]).model;
  }
  const trecho = (m: BlueprintModel, disc: string, x: number, y: number) => m.trechos!.find((t) => t.disciplina === disc && t.a.x === x && t.a.y === y)!;

  it('os NÃO-conflitos ficam de fora', () => {
    const m = cena();
    const todos = conflitos(m);
    const par = (a: string, b: string) => todos.some((c) => (c.trechoId === a && c.outroId === b) || (c.trechoId === b && c.outroId === a));
    const linha = trecho(m, 'FRIGORIGENA', 0, 0);
    const dreno = trecho(m, 'DRENO_AC', 0, 0);
    // (1) Sem a regra do nó comum, o par acusaria: os eixos se tocam no nó.
    expect(distanciaEntreEixos3D({ x: 0, y: 0, z: 2200 }, { x: 4000, y: 0, z: 2200 }, { x: 0, y: 0, z: 2200 }, { x: 0, y: 2000, z: 2180 })).toBe(0);
    expect(par(linha.id, dreno.id)).toBe(false);
    // (2) e (4): ninguém conflita com a peça a que se liga.
    expect(todos.filter((c) => c.classe === 'EQUIPAMENTO' && (c.trechoId === linha.id || c.trechoId === trecho(m, 'MECANICA', 6000, -6000).id))).toEqual([]);
    // (3) o duto abaixo da viga: o fundo a 2400, o topo do duto a 2100.
    expect(todos.filter((c) => c.trechoId === trecho(m, 'MECANICA', 14000, -5000).id)).toEqual([]);
  });

  it('os conflitos aparecem, cada um na classe dele', () => {
    const m = cena();
    const todos = conflitos(m);
    const linhaA = trecho(m, 'FRIGORIGENA', 8000, 5000);
    const vizinha = m.terminais!.find((t) => t.tipoHidraulico === 'CONDENSADORA_SPLIT' && t.at.x === 10000)!;
    // (A)
    expect(todos.filter((c) => c.classe === 'EQUIPAMENTO').map((c) => [c.trechoId, c.outroId])).toEqual([[linhaA.id, vizinha.id]]);
    expect(todos.find((c) => c.classe === 'EQUIPAMENTO')!.comprimentoDentroMm).toBeGreaterThan(0);
    // (B)
    expect(todos.filter((c) => c.classe === 'ESTRUTURA').map((c) => c.trechoId)).toEqual([trecho(m, 'DRENO_AC', 14000, 3000).id]);
    // (C) e (D): duas REDE — o duto × a linha A, e o dreno que volta a cruzar a linha 2 m depois do nó.
    const rede = todos.filter((c) => c.classe === 'REDE');
    const temPar = (a: string, b: string) => rede.some((c) => (c.trechoId === a && c.outroId === b) || (c.trechoId === b && c.outroId === a));
    expect(temPar(linhaA.id, trecho(m, 'MECANICA', 9000, 3000).id)).toBe(true);
    expect(temPar(trecho(m, 'FRIGORIGENA', 20000, 0).id, trecho(m, 'DRENO_AC', 22000, 1000).id)).toBe(true);
    expect(rede).toHaveLength(2);
  });

  it('sem as caixas (quem não passa as peças), nada de EQUIPAMENTO — o resto igual', () => {
    const m = cena();
    expect(conflitosDoModelo(m).some((c) => c.classe === 'EQUIPAMENTO')).toBe(false);
    expect(conflitosDoModelo(m).filter((c) => c.classe !== 'EQUIPAMENTO')).toEqual(conflitos(m).filter((c) => c.classe !== 'EQUIPAMENTO'));
  });
});

describe('climatização E10.2 · a marca no desenho', () => {
  it('o duto que cruza a viga ganha a marca "cruza viga" (antes só aparecia no relatório)', () => {
    const { m, t } = nivel();
    const base = applyCommand(m, { type: 'AddStructural', levelId: t, kind: 'VIGA', pontos: [point(0, -2000), point(0, 2000)], larguraMm: 150, profundidadeMm: 400, alturaMm: 400, baseMm: 2400 } as Command).model;
    const com = applyCommand(base, tr(t, 'MECANICA', [-2000, 0], [2000, 0], 2500, 2500, 300, { alturaDutoMm: 200 })).model;
    expect(marcasDeVerificacao(com).some((x) => x.tipo === 'CRUZA_VIGA' && x.disciplina === 'MECANICA')).toBe(true);
  });
});
