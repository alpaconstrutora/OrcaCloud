/**
 * O MOTOR DO PRÉDIO AUTOMÁTICO (PA2 do plano docs/planos/2026-11-12-predio-automatico.md, 13/11/2026): do bloco ao
 * pavimento tipo com as cópias vivas, a planta das unidades e o tipo levando as instalações — numa prévia, num lote só.
 * O lote tem de dar o MESMO desenho dos dois botões de antes do painel do bloco ("Montar neste estudo" + "Gerar a planta
 * das unidades") mais a marca do tipo.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, pavimentosDoNucleo, pointInPolygon, point, snapshotHash, type BlueprintModel, type Command, type Point } from '../utils/blueprintKernel';
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
  NOME_DA_COBERTURA,
  ORDEM_DAS_ETAPAS_DO_PREDIO,
  planejarPredioDoPedido,
  SALA_BOMBAS,
  SALA_COMUM,
  SALA_HALL,
  SALA_MEDICAO,
  SALA_MEDICAO_E_BOMBAS,
  type PedidoDoPredio,
} from '../utils/blueprintPredioAutomatico';

const MEDIO = produtoSemente('RESIDENCIAL_MEDIO');

/** Um prédio do marco: lote (largura × profundidade) com a rua ao sul e o bloco — só o bloco, nada montado. */
function pedidoDo(lote: [number, number], pontos: Point[], pavimentos: number, uso: 'RESIDENCIAL' | 'GARAGEM' = 'RESIDENCIAL'): PedidoDoPredio {
  const [w, d] = lote;
  let m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }]).model;
  const t = m.levels[0].id;
  const div = (ax: number, ay: number, bx: number, by: number, papel: 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA'): Command => ({ type: 'AddBoundary', levelId: t, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO', papel });
  m = applyBatch(m, [
    div(0, 0, w, 0, 'FRENTE'), div(w, 0, w, d, 'LATERAL_DIREITA'), div(w, d, 0, d, 'FUNDOS'), div(0, d, 0, 0, 'LATERAL_ESQUERDA'),
    { type: 'AddBloco', levelId: t, nome: 'Torre', pontos, pavimentos, ...(uso === 'GARAGEM' ? { uso } : {}) },
  ]).model;
  const massa = medirMassa(m, { terreno: medirTerreno(divisasDoLote(m.boundaries)), limites: m.boundaries, recuosBase: RECUOS_ZERO, zona: ZONA_DA_MASSA_VAZIA });
  const doBloco = distribuirProduto(m, massa, MEDIO).blocos[0] ?? null;
  return { original: m, entrada: { blocoId: m.blocos![0].id, produto: MEDIO, doBloco, rotacaoNorteDeg: null }, hip: {} };
}
/** O R4 do marco (lote 30 × 40, bloco 20 × 12, 4 pavimentos: 2 unidades por andar, sem elevador). */
const pedidoDoR4 = (uso: 'RESIDENCIAL' | 'GARAGEM' = 'RESIDENCIAL') => pedidoDo([30000, 40000], [point(5000, 15000), point(25000, 15000), point(25000, 27000), point(5000, 27000)], 4, uso);
/** O R8 do marco (lote 40 × 60, bloco 30 × 16, 8 pavimentos: 5 unidades por andar, um elevador). */
const pedidoDoR8 = () => pedidoDo([40000, 60000], [point(5000, 20000), point(35000, 20000), point(35000, 36000), point(5000, 36000)], 8);
/** O caminho da PA2 (sem térreo nem cobertura) — o que o teste de equivalência compara com os botões de antes. */
const SO_O_TIPO = { terreo: false, cobertura: false };

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
    const p = { ...pedidoDoR4(), hip: SO_O_TIPO };
    const avisos: string[] = [];
    const plano = planejarPredioDoPedido(p, { aoConcluirEtapa: (e, i, total) => avisos.push(`${i}/${total} ${e.id}`) });
    expect(plano.etapas.map((e) => e.id)).toEqual(ORDEM_DAS_ETAPAS_DO_PREDIO);
    expect(avisos).toEqual(ORDEM_DAS_ETAPAS_DO_PREDIO.map((id, i) => `${i + 1}/${ORDEM_DAS_ETAPAS_DO_PREDIO.length} ${id}`));
    expect(plano.etapas.map((e) => `${e.id}:${e.situacao}`)).toEqual(['PAVIMENTO_TIPO:LANCOU', 'TERREO:NAO_EXIGIDA', 'PLANTAS:LANCOU', 'COBERTURA:NAO_EXIGIDA', 'RESERVATORIOS:NAO_EXIGIDA', 'INSTALACOES_NO_TIPO:LANCOU', 'CONFERENCIA:CALCULOU']);
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
    const p = { ...pedidoDoR4(), hip: { ...SO_O_TIPO, plantas: false } };
    const plano = planejarPredioDoPedido(p);
    expect(plano.etapas.find((e) => e.id === 'PLANTAS')!.situacao).toBe('NAO_EXIGIDA');
    expect(plano.resumo.plantas).toBeNull();
    const comPlantas = planejarPredioDoPedido({ ...pedidoDoR4(), hip: SO_O_TIPO });
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
    expect(assinaturaDoPedidoDoPredio({ ...p, hip: { alturaDaPlatibandaMm: 1200 } })).not.toBe(a);
    expect(assinaturaDoPedidoDoPredio({ ...p, entrada: { ...p.entrada, rotacaoNorteDeg: 15 } })).not.toBe(a);
  });

  // ── PA3 (14/11/2026): o térreo, a cobertura e os reservatórios ─────────────────────────────────────────────────────

  it('o térreo: pavimento próprio na cota do bloco, as fatias viram salas do condomínio e a porta de entrada olha para a rua', () => {
    const plano = planejarPredioDoPedido(pedidoDoR8());
    const r = plano.resultado;
    const terreo = r.levels.find((l) => l.name === 'Torre · 1º pav (térreo)')!;
    expect(terreo.elevationMm).toBe(0);
    expect(terreo.tipoDeId).toBeUndefined();
    expect(plano.resumo.terreo!.salas).toEqual([SALA_HALL, SALA_MEDICAO, SALA_BOMBAS, SALA_COMUM, SALA_COMUM]);
    const nomes = r.labels.filter((l) => l.levelId === terreo.id).map((l) => l.name);
    expect(nomes).toEqual(expect.arrayContaining([SALA_HALL, SALA_MEDICAO, SALA_BOMBAS, 'Circulação']));
    // Nenhuma unidade no térreo, nem o interior delas: só o esqueleto da montagem.
    const daUnidade = new Set((r.unidades ?? []).flatMap((u) => u.etiquetaUids));
    expect(r.labels.filter((l) => l.levelId === terreo.id && daUnidade.has(l.uid))).toHaveLength(0);
    expect(r.walls.filter((w) => w.levelId === terreo.id).length).toBeLessThan(r.walls.filter((w) => w.levelId === plano.tipoLevelId).length);
    // A porta de entrada: na fachada do hall voltada para a rua (ao sul, y menor que o do hall).
    expect(plano.resumo.terreo!.acesso).toBe(true);
    const rotuloDoHall = r.labels.find((l) => l.levelId === terreo.id && l.name === SALA_HALL)!;
    const hall = r.spaces.find((s) => s.levelId === terreo.id && pointInPolygon(s.ring, rotuloDoHall.at))!;
    const yHall = hall.ring.reduce((s, p) => s + p.y, 0) / hall.ring.length;
    const entrada = r.openings.find((o) => o.widthMm === 1200 && r.walls.find((w) => w.id === o.wallId)?.levelId === terreo.id)!;
    const parede = r.walls.find((w) => w.id === entrada.wallId)!;
    expect((parede.a.y + parede.b.y) / 2).toBeLessThan(yHall);
  });

  it('o núcleo passa a partir do térreo: um elevador até o último andar com unidades (casa de máquinas sobre a cobertura) e o shaft até a cobertura', () => {
    const plano = planejarPredioDoPedido(pedidoDoR8());
    const r = plano.resultado;
    const terreo = r.levels.find((l) => l.name === 'Torre · 1º pav (térreo)')!;
    const cobertura = r.levels.find((l) => l.name === 'Torre · cobertura')!;
    // Nenhum núcleo no tipo nem nas cópias: um por peça, desde o térreo.
    expect(r.nucleos.every((n) => n.levelId === terreo.id)).toBe(true);
    const elevador = r.nucleos.find((n) => n.tipo === 'ELEVADOR')!;
    const shaft = r.nucleos.find((n) => n.tipo === 'SHAFT')!;
    expect(pavimentosDoNucleo(r, elevador).at(-1)!.elevationMm).toBe(cobertura.elevationMm - 3000);
    expect(elevador.pocoMm).toBeGreaterThan(0);
    expect(pavimentosDoNucleo(r, shaft).at(-1)!.id).toBe(cobertura.id);
    // A escada ganha o lance do térreo.
    expect(r.stairs.filter((e) => e.levelId === terreo.id)).toHaveLength(1);
  });

  it('a cobertura: sobre o último andar, com a laje, a platibanda na linha da fachada e a área técnica nomeada', () => {
    const plano = planejarPredioDoPedido(pedidoDoR4());
    const r = plano.resultado;
    const cobertura = r.levels.find((l) => l.name === 'Torre · cobertura')!;
    expect(cobertura.elevationMm).toBe(12000);
    expect(plano.resumo.cobertura).toEqual({ cotaM: 12 });
    expect(r.structures.filter((x) => x.levelId === cobertura.id && x.kind === 'LAJE')).toHaveLength(1);
    const platibanda = r.walls.filter((w) => w.levelId === cobertura.id);
    expect(platibanda.length).toBeGreaterThanOrEqual(4);
    expect(platibanda.every((w) => w.heightMm === 1100)).toBe(true);
    expect(r.labels.filter((l) => l.levelId === cobertura.id).map((l) => l.name)).toEqual([NOME_DA_COBERTURA]);
    expect(plano.resumo.pavimentosLancados).toBe(plano.resumo.pavimentos + 2);
  });

  it('os reservatórios: o volume pela população de todos os andares, 60 % no inferior (casa de bombas) e o resto no superior (cobertura)', () => {
    const plano = planejarPredioDoPedido(pedidoDoR4());
    const r = plano.resultado;
    const res = plano.resumo.reservacao!;
    expect(res.pessoas).toBeGreaterThan(0);
    expect(res.totalL).toBe(res.pessoas * 200);
    expect(res.inferiorL).toBe(Math.round(res.totalL * 0.6));
    expect(res.inferiorL! + res.superiorL!).toBe(res.totalL);
    const caixas = r.terminais.filter((t) => t.tipoHidraulico === 'RESERVATORIO');
    const nivel = (id: string) => r.levels.find((l) => l.id === id)!.name;
    expect(caixas.map((t) => `${t.papelReservatorio}@${nivel(t.levelId)}:${t.volumeL}`).sort()).toEqual([`INFERIOR@Torre · 1º pav (térreo):${res.inferiorL}`, `SUPERIOR@Torre · cobertura:${res.superiorL}`]);
    // Com 2 fatias, medição e bombas dividem a segunda sala — e o inferior vai nela.
    expect(plano.resumo.terreo!.salas).toEqual([SALA_HALL, SALA_MEDICAO_E_BOMBAS]);
  });

  it('desligados nas hipóteses: sem térreo o núcleo fica no tipo (o elevador para no último andar se há cobertura); sem os dois, nenhum reservatório', () => {
    const semTerreo = planejarPredioDoPedido({ ...pedidoDoR8(), hip: { terreo: false } });
    const r = semTerreo.resultado;
    expect(semTerreo.etapas.find((e) => e.id === 'TERREO')!.situacao).toBe('NAO_EXIGIDA');
    expect(r.levels.some((l) => l.name.endsWith('(térreo)'))).toBe(false);
    const elevador = r.nucleos.find((n) => n.tipo === 'ELEVADOR' && n.levelId === semTerreo.tipoLevelId)!;
    const cobertura = r.levels.find((l) => l.name === 'Torre · cobertura')!;
    expect(pavimentosDoNucleo(r, elevador).at(-1)!.elevationMm).toBe(cobertura.elevationMm - 3000);
    // Sem térreo, o superior leva o volume inteiro.
    expect(semTerreo.resumo.reservacao!.inferiorL).toBeNull();
    expect(semTerreo.resumo.reservacao!.superiorL).toBe(semTerreo.resumo.reservacao!.totalL);
    const nada = planejarPredioDoPedido({ ...pedidoDoR4(), hip: SO_O_TIPO });
    expect(nada.etapas.find((e) => e.id === 'RESERVATORIOS')!.situacao).toBe('NAO_EXIGIDA');
    expect(nada.resultado.terminais.filter((t) => t.tipoHidraulico === 'RESERVATORIO')).toHaveLength(0);
  });

  it('com térreo e cobertura o lote continua um só: reaplicado, os mesmos ids e o mesmo modelo', () => {
    const p = pedidoDoR8();
    const plano = planejarPredioDoPedido(p);
    expect(applyBatch(p.original, plano.comandos).diff.created).toEqual(plano.criados);
    expect(conferirPlanoDoPredio(p.original, plano, p.entrada)).toEqual({ ok: true });
  });
});
