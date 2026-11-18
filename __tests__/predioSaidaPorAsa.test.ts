/**
 * PA23 do prédio automático (18/11/2026, pedido "Resolva a pendência"): uma SAÍDA DE ESGOTO POR ASA. No bloco em asas, o
 * desvio dos tubos de queda pelos corredores do térreo até a saída única da rua era longo (no RL ~52 m a 1 %) e chegava a
 * 1,87 m do piso. Agora a asa sem a saída da rua desce na fachada dela, para a caixa de inspeção dela, e um subcoletor
 * enterrado por fora do prédio (a 1 m da fachada, caixa em cada canto e a cada 25 m) a leva à caixa da rua. A água sob
 * pressão que cruza o desvio na mesma altura passa por cima dele. O RL tem a prova no marco do prédio.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, conflitosDoModelo, emptyModel, point, pointInPolygon, type BlueprintModel, type Command, type Point } from '../utils/blueprintKernel';
import { fazerChave } from '../utils/blueprintGrafoDeRede';
import { divisasDoLote, medirTerreno, RECUOS_ZERO } from '../utils/blueprintTerreno';
import { medirMassa, ZONA_DA_MASSA_VAZIA } from '../utils/blueprintMassa';
import { distribuirProduto, produtoSemente } from '../utils/blueprintProduto';
import { planejarPredioDoPedido, type PedidoDoPredio } from '../utils/blueprintPredioAutomatico';
import { ROTULO_DO_DESVIO, ROTULO_DO_SUBCOLETOR_DO_PREDIO } from '../utils/predioAutomatico/esgoto';
import { FOLGA_POR_CIMA_DO_DESVIO_MM, redesPorCimaDoDesvio } from '../utils/predioAutomatico/desvios';

const MEDIO = produtoSemente('RESIDENCIAL_MEDIO');
/** Um L com a asa de baixo voltada para a rua (ao sul) e a outra subindo para os fundos — o RL do marco, mais curto. */
const BLOCO_EM_L = [point(5000, 5000), point(40000, 5000), point(40000, 21000), point(21000, 21000), point(21000, 40000), point(5000, 40000)];

function pedidoEmL(): PedidoDoPredio {
  const [w, d] = [50000, 50000];
  let m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }]).model;
  const t = m.levels[0].id;
  const div = (ax: number, ay: number, bx: number, by: number, papel: 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA'): Command => ({ type: 'AddBoundary', levelId: t, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO', papel });
  m = applyBatch(m, [
    div(0, 0, w, 0, 'FRENTE'), div(w, 0, w, d, 'LATERAL_DIREITA'), div(w, d, 0, d, 'FUNDOS'), div(0, d, 0, 0, 'LATERAL_ESQUERDA'),
    { type: 'AddBloco', levelId: t, nome: 'Torre', pontos: BLOCO_EM_L, pavimentos: 4 },
  ]).model;
  const massa = medirMassa(m, { terreno: medirTerreno(divisasDoLote(m.boundaries)), limites: m.boundaries, recuosBase: RECUOS_ZERO, zona: ZONA_DA_MASSA_VAZIA });
  const doBloco = distribuirProduto(m, massa, MEDIO).blocos.find((x) => x.blocoId === m.blocos![0].id) ?? null;
  // Só o que o esgoto do térreo precisa (a água lança as louças; a estrutura, os pilares de que a saída foge).
  return { original: m, entrada: { blocoId: m.blocos![0].id, produto: MEDIO, doBloco, rotacaoNorteDeg: null }, hip: { eletrica: false, climatizacao: false, pluvial: false, incendio: false } };
}

describe('PA23 — uma saída de esgoto por asa', { timeout: 180_000 }, () => {
  let cache: ReturnType<typeof planejarPredioDoPedido> | null = null;
  const emL = () => (cache ??= planejarPredioDoPedido(pedidoEmL()));
  const terreoDe = (m: BlueprintModel) => m.levels.find((l) => /térreo/.test(l.name) && /Torre/.test(l.name))!;

  it('a asa sem a saída da rua desce na fachada dela, para a caixa dela fora do bloco; a da rua continua no meio do lado da rua', () => {
    const m = emL().resultado;
    const T = terreoDe(m).id;
    // As saídas: a descida do desvio por dentro da fachada até sob o piso.
    const descidas = m.trechos.filter((t) => t.levelId === T && t.rotulo === ROTULO_DO_DESVIO && t.a.x === t.b.x && t.a.y === t.b.y && Math.min(t.cotaAMm, t.cotaBMm) === -600);
    expect(descidas).toHaveLength(2);
    const [daRua, daAsa] = [...descidas].sort((a, b) => a.a.y - b.a.y);
    expect(daRua.a).toEqual({ x: 22500, y: 5300 });
    // A da asa de cima: entre os fundos e o nó do L (y > 21 m), rente a uma das fachadas compridas dela.
    expect(daAsa.a.y).toBeGreaterThan(21000);
    expect([5300, 20700]).toContain(daAsa.a.x);
    // Cada saída com a caixa de inspeção 1 m fora da fachada.
    const caixas = m.terminais.filter((t) => t.levelId === T && t.tipoHidraulico === 'CAIXA_INSPECAO');
    for (const d of descidas) expect(caixas.some((c) => Math.hypot(c.at.x - d.a.x, c.at.y - d.a.y) === 1300)).toBe(true);
    expect(caixas.every((c) => !pointInPolygon(BLOCO_EM_L, c.at as Point))).toBe(true);
    expect(emL().pendencias.some((p) => /em 2 saídas — a da rua e uma por asa/.test(p.texto))).toBe(true);
  });

  it('o subcoletor enterrado contorna o prédio por fora, nos eixos, descendo 1 %, com caixa em cada canto e no máximo a cada 25 m', () => {
    const m = emL().resultado;
    const T = terreoDe(m).id;
    const sub = m.trechos.filter((t) => t.levelId === T && t.rotulo === ROTULO_DO_SUBCOLETOR_DO_PREDIO);
    const emPlanta = sub.filter((t) => t.a.x !== t.b.x || t.a.y !== t.b.y);
    expect(emPlanta.length).toBeGreaterThan(1);
    const caixas = m.terminais.filter((t) => t.levelId === T && t.tipoHidraulico === 'CAIXA_INSPECAO');
    const temCaixa = (p: { x: number; y: number }) => caixas.some((c) => c.at.x === p.x && c.at.y === p.y);
    for (const t of emPlanta) {
      const L = Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y);
      expect(t.a.x === t.b.x || t.a.y === t.b.y).toBe(true);
      expect(L).toBeLessThanOrEqual(25000);
      expect(t.cotaAMm - t.cotaBMm).toBeGreaterThanOrEqual(Math.floor(L / 100) - 1);
      expect(t.cotaBMm).toBeLessThan(0);
      for (const p of [t.a, t.b, { x: (t.a.x + t.b.x) / 2, y: (t.a.y + t.b.y) / 2 }]) expect(pointInPolygon(BLOCO_EM_L, p as Point)).toBe(false);
      // Cada ponta do subcoletor é uma caixa de inspeção (a da asa, um canto, uma intermediária ou a da rua).
      expect(temCaixa(t.a) && temCaixa(t.b)).toBe(true);
    }
    expect(emL().pendencias.some((p) => /subcoletor enterrado por fora do prédio/.test(p.texto))).toBe(true);
  });

  it('toda louça de todo andar chega à ligação na rede pública — pelas duas saídas — e o desvio fica acima da verga das portas', () => {
    const plano = emL();
    const m = plano.resultado;
    const chave = fazerChave(m.levels);
    const pai = new Map<string, string>();
    const raiz = (a: string): string => (pai.get(a) === a ? a : raiz(pai.get(a)!));
    const une = (a: string, b: string) => {
      for (const x of [a, b]) if (!pai.has(x)) pai.set(x, x);
      pai.set(raiz(a), raiz(b));
    };
    for (const t of m.trechos.filter((t) => t.disciplina === 'ESGOTO')) une(chave(t.levelId, t.a.x, t.a.y, t.cotaAMm), chave(t.levelId, t.b.x, t.b.y, t.cotaBMm));
    const ligacao = m.terminais.filter((t) => t.tipoHidraulico === 'LIGACAO_ESGOTO');
    expect(ligacao).toHaveLength(1);
    const kLig = raiz(chave(ligacao[0].levelId, ligacao[0].at.x, ligacao[0].at.y, ligacao[0].cotaMm));
    const fontes = m.terminais.filter((t) => t.disciplina === 'ESGOTO' && !['CAIXA_INSPECAO', 'LIGACAO_ESGOTO'].includes(t.tipoHidraulico ?? ''));
    expect(fontes.length).toBeGreaterThan(0);
    const fora = fontes.filter((f) => {
      const k = chave(f.levelId, f.at.x, f.at.y, f.cotaMm);
      return !pai.has(k) || raiz(k) !== kLig;
    });
    expect(fora.map((f) => `${f.tipoHidraulico}@${m.levels.find((l) => l.id === f.levelId)!.name}`)).toEqual([]);
    const T = terreoDe(m).id;
    const suspensos = m.trechos.filter((t) => t.levelId === T && t.rotulo === ROTULO_DO_DESVIO && (t.a.x !== t.b.x || t.a.y !== t.b.y) && Math.min(t.cotaAMm, t.cotaBMm) > 0);
    expect(Math.min(...suspensos.map((t) => Math.min(t.cotaAMm, t.cotaBMm)))).toBeGreaterThan(2100);
    expect(plano.resumo.esgoto!.coletor!.porGravidade).toBe(true);
  });
});

describe('PA23 — a rede sob pressão passa por cima do desvio', () => {
  /** O térreo com um lance do desvio a ~2,28 m e o recalque cruzando-o na mesma altura (e outro, já por cima). */
  function cruzamento(extras: (t: string) => Command[] = () => []) {
    let m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }]).model;
    const t = m.levels[0].id;
    m = applyBatch(m, [
      { type: 'AddTrecho', levelId: t, disciplina: 'ESGOTO', a: point(0, 0), b: point(4000, 0), cotaAMm: 2300, cotaBMm: 2260, bitolaMm: 150, rotulo: ROTULO_DO_DESVIO, sugerido: true } as Command,
      { type: 'AddTrecho', levelId: t, disciplina: 'AGUA_FRIA', a: point(2000, -2000), b: point(2000, 2000), cotaAMm: 2350, cotaBMm: 2350, bitolaMm: 75, rotulo: 'Recalque', sugerido: true } as Command,
      ...extras(t),
    ]).model;
    return { m, t };
  }
  const redeComDesvio = (m: BlueprintModel) => conflitosDoModelo(m).filter((c) => c.classe === 'REDE');

  it('o recalque que cruza o desvio a 2,35 m sobe por cima dele no cruzamento, com a folga, e volta; as pontas e o resto do trecho não mudam', () => {
    const { m, t } = cruzamento();
    expect(redeComDesvio(m).length).toBe(1);
    const r = redesPorCimaDoDesvio(m, t, ROTULO_DO_DESVIO);
    expect(r.trechos).toBe(1);
    const depois = applyBatch(m, r.comandos).model;
    expect(redeComDesvio(depois)).toEqual([]);
    const agua = depois.trechos.filter((x) => x.disciplina === 'AGUA_FRIA');
    expect(agua.every((x) => x.rotulo === 'Recalque' && x.bitolaMm === 75)).toBe(true);
    const pontas = agua.flatMap((x) => [`${x.a.x},${x.a.y},${x.cotaAMm}`, `${x.b.x},${x.b.y},${x.cotaBMm}`]);
    expect(pontas).toContain('2000,-2000,2350');
    expect(pontas).toContain('2000,2000,2350');
    // O pulo: acima do desvio (eixo a 2,28 m no cruzamento) com os dois raios e a folga.
    const topo = Math.max(...agua.map((x) => Math.max(x.cotaAMm, x.cotaBMm)));
    expect(topo).toBeGreaterThanOrEqual(2280 + 75 + 37.5 + FOLGA_POR_CIMA_DO_DESVIO_MM);
    expect(topo).toBeLessThan(2600);
  });

  it('a rede que já passa longe do desvio, o cruzamento colado na ponta do trecho e o desvio de outro rótulo não mudam nada', () => {
    const longe = cruzamento((t) => [{ type: 'AddTrecho', levelId: t, disciplina: 'AGUA_FRIA', a: point(3000, -2000), b: point(3000, 2000), cotaAMm: 2600, cotaBMm: 2600, bitolaMm: 75 } as Command]);
    expect(redesPorCimaDoDesvio(longe.m, longe.t, ROTULO_DO_DESVIO).trechos).toBe(1);
    const naPonta = cruzamento((t) => [{ type: 'AddTrecho', levelId: t, disciplina: 'AGUA_FRIA', a: point(3500, -50), b: point(3500, 3000), cotaAMm: 2270, cotaBMm: 2270, bitolaMm: 25 } as Command]);
    expect(redesPorCimaDoDesvio(naPonta.m, naPonta.t, ROTULO_DO_DESVIO).trechos).toBe(1);
    expect(redesPorCimaDoDesvio(longe.m, longe.t, 'Outro rótulo').trechos).toBe(0);
  });
});
