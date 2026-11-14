/**
 * O MOTOR DO PRÉDIO AUTOMÁTICO (PA2 do plano docs/planos/2026-11-12-predio-automatico.md, 13/11/2026): do bloco ao
 * pavimento tipo com as cópias vivas, a planta das unidades e o tipo levando as instalações — numa prévia, num lote só.
 * O lote tem de dar o MESMO desenho dos dois botões de antes do painel do bloco ("Montar neste estudo" + "Gerar a planta
 * das unidades") mais a marca do tipo.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, snapshotHash, type BlueprintModel, type Command, type Point } from '../utils/blueprintKernel';
import { divisasDoLote, medirTerreno, RECUOS_ZERO } from '../utils/blueprintTerreno';
import { medirMassa, ZONA_DA_MASSA_VAZIA } from '../utils/blueprintMassa';
import { distribuirProduto, produtoSemente } from '../utils/blueprintProduto';
import { direcaoDaRua, ordinalDoTipo } from '../utils/blueprintPavimentoTipoDaMassa';
import { dividirPavimentoDoBloco, montarPavimentoTipoDoBloco } from '../utils/blueprintPavimentoOrtogonal';
import { plantasDasUnidades } from '../utils/blueprintPlantaDaUnidade';
import {
  assinaturaDoPedidoDoPredio,
  conferirPlanoDoPredio,
  motivoParaNaoGerarPredio,
  ORDEM_DAS_ETAPAS_DO_PREDIO,
  planejarPredioDoPedido,
  type PedidoDoPredio,
} from '../utils/blueprintPredioAutomatico';

const MEDIO = produtoSemente('RESIDENCIAL_MEDIO');

/** O R4 do marco do prédio (lote 30 × 40, rua ao sul, bloco 20 × 12 com 4 pavimentos) — só o bloco, nada montado. */
function pedidoDoR4(uso: 'RESIDENCIAL' | 'GARAGEM' = 'RESIDENCIAL'): PedidoDoPredio {
  let m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }]).model;
  const t = m.levels[0].id;
  const div = (ax: number, ay: number, bx: number, by: number, papel: 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA'): Command => ({ type: 'AddBoundary', levelId: t, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO', papel });
  const pontos: Point[] = [point(5000, 15000), point(25000, 15000), point(25000, 27000), point(5000, 27000)];
  m = applyBatch(m, [
    div(0, 0, 30000, 0, 'FRENTE'), div(30000, 0, 30000, 40000, 'LATERAL_DIREITA'), div(30000, 40000, 0, 40000, 'FUNDOS'), div(0, 40000, 0, 0, 'LATERAL_ESQUERDA'),
    { type: 'AddBloco', levelId: t, nome: 'Torre', pontos, pavimentos: 4, ...(uso === 'GARAGEM' ? { uso } : {}) },
  ]).model;
  const massa = medirMassa(m, { terreno: medirTerreno(divisasDoLote(m.boundaries)), limites: m.boundaries, recuosBase: RECUOS_ZERO, zona: ZONA_DA_MASSA_VAZIA });
  const doBloco = distribuirProduto(m, massa, MEDIO).blocos[0] ?? null;
  return { original: m, entrada: { blocoId: m.blocos![0].id, produto: MEDIO, doBloco, rotacaoNorteDeg: null }, hip: {} };
}

/** O caminho de antes: "Montar neste estudo" e depois "Gerar a planta das unidades", dois lotes. */
function peloPainelDoBloco(p: PedidoDoPredio): BlueprintModel {
  const m = p.original;
  const b = m.blocos![0];
  const pb = p.entrada.doBloco!;
  const ord = ordinalDoTipo(m, b);
  const piso = pb.pisos.find((x) => x.ordinal === ord)!;
  const r = dividirPavimentoDoBloco({ bloco: b, produto: MEDIO, porTipologia: piso.porTipologia, nucleoM2: pb.nucleo.m2, elevadores: pb.nucleo.elevadores, ordinalDoTipo: ord, rotacaoNorteDeg: null, direcaoDaRua: direcaoDaRua(m) });
  if (!r.ok) throw new Error(r.motivo);
  const mont = montarPavimentoTipoDoBloco(m, b, r.divisao);
  const pl = plantasDasUnidades(mont.model, b, MEDIO);
  return applyCommand(pl.model, { type: 'SetLevelProps', levelId: mont.tipoLevelId, copiaInstalacoes: true }).model;
}

describe('prédio automático — o motor (PA2)', () => {
  it('as etapas rodam na ordem e o lote dá o mesmo prédio dos dois botões do painel do bloco, com o tipo levando as instalações', () => {
    const p = pedidoDoR4();
    const avisos: string[] = [];
    const plano = planejarPredioDoPedido(p, { aoConcluirEtapa: (e, i, total) => avisos.push(`${i}/${total} ${e.id}`) });
    expect(plano.etapas.map((e) => e.id)).toEqual(ORDEM_DAS_ETAPAS_DO_PREDIO);
    expect(avisos).toEqual(ORDEM_DAS_ETAPAS_DO_PREDIO.map((id, i) => `${i + 1}/4 ${id}`));
    expect(plano.etapas.slice(0, 3).map((e) => e.situacao)).toEqual(['LANCOU', 'LANCOU', 'LANCOU']);
    expect(snapshotHash(plano.resultado)).toBe(snapshotHash(peloPainelDoBloco(p)));
    const tipo = plano.resultado.levels.find((l) => l.id === plano.tipoLevelId)!;
    expect(tipo.copiaInstalacoes).toBe(true);
    // Um lote: reaplicado no original, os mesmos ids e o mesmo modelo.
    const r = applyBatch(p.original, plano.comandos);
    expect(r.diff.created).toEqual(plano.criados);
    expect(conferirPlanoDoPredio(p.original, plano, p.entrada)).toEqual({ ok: true });
  });

  it('o resumo conta o prédio inteiro: unidades por andar × pavimentos com unidade (o tipo e as cópias)', () => {
    const plano = planejarPredioDoPedido(pedidoDoR4());
    const { resumo } = plano;
    const copias = plano.resultado.levels.filter((l) => l.tipoDeId === plano.tipoLevelId).length;
    expect(resumo.copias).toBe(copias);
    expect(resumo.pavimentos).toBe(copias + 1);
    expect(resumo.unidadesPorAndar).toBeGreaterThan(0);
    expect(resumo.unidades).toBe(resumo.unidadesPorAndar * resumo.pavimentos);
    expect(resumo.plantas!.unidades).toBe(resumo.unidadesPorAndar);
    expect(resumo.plantas!.comodos).toBeGreaterThan(resumo.unidadesPorAndar);
  });

  it('sem plantas nas hipóteses, as unidades saem só com o perímetro (o "Montar neste estudo" de antes)', () => {
    const p = { ...pedidoDoR4(), hip: { plantas: false } };
    const plano = planejarPredioDoPedido(p);
    expect(plano.etapas.find((e) => e.id === 'PLANTAS')!.situacao).toBe('NAO_EXIGIDA');
    expect(plano.resumo.plantas).toBeNull();
    const comPlantas = planejarPredioDoPedido(pedidoDoR4());
    expect(plano.resultado.walls.length).toBeLessThan(comPlantas.resultado.walls.length);
  });

  it('é determinístico: o mesmo pedido dá o mesmo plano', () => {
    const a = planejarPredioDoPedido(pedidoDoR4());
    const b = planejarPredioDoPedido(pedidoDoR4());
    expect(snapshotHash(a.resultado)).toBe(snapshotHash(b.resultado));
    expect(a.criados).toEqual(b.criados);
  });

  it('a trava recusa o lote quando o desenho mudou depois da prévia, e quando o tipo já foi montado', () => {
    const p = pedidoDoR4();
    const plano = planejarPredioDoPedido(p);
    const mexido = applyCommand(p.original, { type: 'AddWall', levelId: p.original.levels[0].id, a: point(1000, 1000), b: point(3000, 1000), thicknessMm: 140, heightMm: 2800 }).model;
    const r = conferirPlanoDoPredio(mexido, plano, p.entrada);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.motivo).toMatch(/mudou desde a prévia/);
    const depois = conferirPlanoDoPredio(plano.resultado, plano, p.entrada);
    expect(!depois.ok && depois.motivo).toMatch(/já montado/);
  });

  it('não gera sem unidade: garagem, sem produto, bloco que sumiu', () => {
    const g = pedidoDoR4('GARAGEM');
    expect(motivoParaNaoGerarPredio(g.original, g.entrada)).toMatch(/sem unidade/);
    const p = pedidoDoR4();
    expect(motivoParaNaoGerarPredio(p.original, { ...p.entrada, doBloco: null })).toMatch(/Defina o produto/);
    expect(motivoParaNaoGerarPredio(p.original, { ...p.entrada, blocoId: 'blc_9999' })).toMatch(/não está mais/);
    expect(() => planejarPredioDoPedido({ ...p, entrada: { ...p.entrada, doBloco: null } })).toThrow(/Defina o produto/);
  });

  it('a assinatura muda com as hipóteses e o produto, não com o desenho', () => {
    const p = pedidoDoR4();
    const a = assinaturaDoPedidoDoPredio(p);
    expect(assinaturaDoPedidoDoPredio({ ...p, original: emptyModel() })).toBe(a);
    expect(assinaturaDoPedidoDoPredio({ ...p, hip: { plantas: false } })).not.toBe(a);
    expect(assinaturaDoPedidoDoPredio({ ...p, entrada: { ...p.entrada, rotacaoNorteDeg: 15 } })).not.toBe(a);
  });
});
