/**
 * O MOTOR DO PRÉDIO AUTOMÁTICO (PA2 do plano docs/planos/2026-11-12-predio-automatico.md, 13/11/2026): do bloco ao
 * pavimento tipo com as cópias vivas, a planta das unidades e o tipo levando as instalações — numa prévia, num lote só.
 * O lote tem de dar o MESMO desenho dos dois botões de antes do painel do bloco ("Montar neste estudo" + "Gerar a planta
 * das unidades") mais a marca do tipo.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, ModelHistory, pavimentosDoNucleo, pointInPolygon, point, snapshotHash, type BlueprintModel, type Command, type Point } from '../utils/blueprintKernel';
import { entradaDoQuadro } from '../utils/blueprintEntradaDeEnergia';
import { fazerChave } from '../utils/blueprintGrafoDeRede';
import { HIPOTESES_PRESSAO_PADRAO, pressoesDaOrigem } from '../utils/blueprintPressaoDaRede';
import { diametroDeForchheimerMm } from '../utils/blueprintRecalque';
import { FICHA_DO_MATERIAL } from '../utils/blueprintHidraulicaPressao';
import { unidadeNoPavimento } from '../utils/blueprintUnidadesDoPredio';
import { modelosDoCatalogo } from '../utils/blueprintSelecaoClimatizacao';
import { SEMENTES_DE_TIPOS } from '../utils/blueprintCatalogoDeTipos';
import { HIPOTESES_CLIMATIZACAO_PADRAO } from '../utils/blueprintClimatizacao';
import { MATERIAIS_SEMENTE } from '../utils/blueprintMateriais';

/** O catálogo semente e o clima do marco da casa — o que o editor passa ao prédio (PA5b). */
const CLIMATIZACAO = {
  hip: { ...HIPOTESES_CLIMATIZACAO_PADRAO, clima: { cidade: null, tbsExternaC: 34, tbuExternaC: 25, altitudeM: 0 } },
  modelos: modelosDoCatalogo(SEMENTES_DE_TIPOS.map((s, i) => ({ id: `t${i}`, nome: s.nome, familia: s.propriedades.familia, active: true, propriedades: s.propriedades }))),
  carga: { materiais: MATERIAIS_SEMENTE.map((m, i) => ({ ...m, id: `m${i}`, organizationId: 'o', active: true, createdAt: '', updatedAt: '' })), cidadeDoContexto: null },
};
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
const SO_O_TIPO = { terreo: false, cobertura: false, estrutura: false, eletrica: false, agua: false };

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

// PA4: o R8 com a estrutura leva uns 3 s por plano — e o teste da trava gera, reaplica e confere o hash.
describe('prédio automático — o motor (PA2)', { timeout: 60_000 }, () => {
  it('as etapas rodam na ordem e o lote dá o mesmo prédio dos dois botões do painel do bloco, com o tipo levando as instalações', () => {
    const p = { ...pedidoDoR4(), hip: SO_O_TIPO };
    const avisos: string[] = [];
    const plano = planejarPredioDoPedido(p, { aoConcluirEtapa: (e, i, total) => avisos.push(`${i}/${total} ${e.id}`) });
    expect(plano.etapas.map((e) => e.id)).toEqual(ORDEM_DAS_ETAPAS_DO_PREDIO);
    expect(avisos).toEqual(ORDEM_DAS_ETAPAS_DO_PREDIO.map((id, i) => `${i + 1}/${ORDEM_DAS_ETAPAS_DO_PREDIO.length} ${id}`));
    expect(plano.etapas.map((e) => `${e.id}:${e.situacao}`)).toEqual(['PAVIMENTO_TIPO:LANCOU', 'TERREO:NAO_EXIGIDA', 'ESTRUTURA:NAO_EXIGIDA', 'FUNDACOES:NAO_EXIGIDA', 'PLANTAS:LANCOU', 'COBERTURA:NAO_EXIGIDA', 'RESERVATORIOS:NAO_EXIGIDA', 'ELETRICA:NAO_EXIGIDA', 'CLIMATIZACAO:NAO_EXIGIDA', 'ELETRODUTOS:NAO_EXIGIDA', 'LOUCAS:NAO_EXIGIDA', 'AGUA_FRIA:NAO_EXIGIDA', 'INSTALACOES_NO_TIPO:LANCOU', 'PRESSAO_DA_AGUA:NAO_EXIGIDA', 'CONFERENCIA:CALCULOU']);
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
    // Sem a estrutura, a cobertura lança a laje dela (com a estrutura, a laje é a do teto do último andar — PA4).
    const plano = planejarPredioDoPedido({ ...pedidoDoR4(), hip: { estrutura: false } });
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
    // PA6: o superior leva também a reserva técnica de incêndio (por gravidade).
    const rti = plano.resumo.agua!.rtiL ?? 0;
    expect(caixas.map((t) => `${t.papelReservatorio}@${nivel(t.levelId)}:${t.volumeL}/${t.volumeRtiL ?? 0}`).sort()).toEqual([`INFERIOR@Torre · 1º pav (térreo):${res.inferiorL}/0`, `SUPERIOR@Torre · cobertura:${res.superiorL! + rti}/${rti}`]);
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

  // ── PA4 (14/11/2026): a estrutura e as fundações ─────────────────────────────────────────────────────────────────

  it('a estrutura: pilares, vigas e lajes no tipo, iguais em cada cópia, e a MESMA malha no térreo (pilares em prumada)', () => {
    const plano = planejarPredioDoPedido(pedidoDoR8());
    const r = plano.resultado;
    const e = plano.resumo.estrutura!;
    expect(e.pilares).toBeGreaterThan(0);
    expect(e.vigas).toBeGreaterThan(0);
    expect(e.lajes).toBeGreaterThan(0);
    const conta = (levelId: string, kind: string) => r.structures.filter((s) => s.levelId === levelId && s.kind === kind).length;
    const andares = [plano.tipoLevelId, ...r.levels.filter((l) => l.tipoDeId === plano.tipoLevelId).map((l) => l.id)];
    for (const id of andares) expect([conta(id, 'PILAR'), conta(id, 'VIGA'), conta(id, 'LAJE')]).toEqual([e.pilares, e.vigas, e.lajes]);
    const terreo = r.levels.find((l) => l.name === 'Torre · 1º pav (térreo)')!;
    const chave = (s: { pontos: Point[] }) => s.pontos.map((q) => `${q.x},${q.y}`).join(';');
    const doTipo = new Set(r.structures.filter((s) => s.levelId === plano.tipoLevelId && s.kind === 'PILAR').map(chave));
    const doTerreo = r.structures.filter((s) => s.levelId === terreo.id && s.kind === 'PILAR').map(chave);
    expect(doTerreo).toHaveLength(e.pilares);
    expect(doTerreo.every((k) => doTipo.has(k))).toBe(true);
    // A laje do último andar é a da cobertura: nenhuma outra no pavimento da cobertura.
    const cobertura = r.levels.find((l) => l.name === 'Torre · cobertura')!;
    expect(conta(cobertura.id, 'LAJE')).toBe(0);
    expect(r.eixos.length).toBe(e.eixos);
  });

  it('a estrutura roda antes das plantas e não as muda: os mesmos cômodos com e sem ela', () => {
    const com = planejarPredioDoPedido(pedidoDoR4());
    const sem = planejarPredioDoPedido({ ...pedidoDoR4(), hip: { estrutura: false } });
    expect(com.resumo.plantas).toEqual(sem.resumo.plantas);
  });

  it('as fundações: um bloco sob cada pilar do térreo, e a pendência de que o prédio exige cálculo', () => {
    const plano = planejarPredioDoPedido(pedidoDoR4());
    const r = plano.resultado;
    const terreo = r.levels.find((l) => l.name === 'Torre · 1º pav (térreo)')!;
    expect(plano.resumo.estrutura!.blocos).toBe(plano.resumo.estrutura!.pilares);
    expect(r.structures.filter((s) => s.levelId === terreo.id && s.kind === 'BLOCO_COROAMENTO')).toHaveLength(plano.resumo.estrutura!.pilares);
    expect(plano.pendencias.some((x) => x.grupo === 'VERIFICACAO' && /exige cálculo com a sondagem \(NBR 6122\)/.test(x.texto))).toBe(true);
    // Sem o térreo, o pavimento que assenta no chão fica para o projetista — e a fundação com ele.
    const semTerreo = planejarPredioDoPedido({ ...pedidoDoR4(), hip: { terreo: false } });
    expect(semTerreo.etapas.find((x) => x.id === 'FUNDACOES')!.situacao).toBe('NAO_EXIGIDA');
    expect(semTerreo.resultado.structures.some((s) => s.kind === 'BLOCO_COROAMENTO')).toBe(false);
  });

  it('desligada nas hipóteses: nenhuma peça de estrutura nem fundação', () => {
    const plano = planejarPredioDoPedido({ ...pedidoDoR4(), hip: { estrutura: false } });
    expect(plano.etapas.find((x) => x.id === 'ESTRUTURA')!.situacao).toBe('NAO_EXIGIDA');
    expect(plano.resumo.estrutura).toBeNull();
    expect(plano.resultado.structures.filter((s) => s.kind !== 'LAJE')).toHaveLength(0);
  });

  // ── PA5a (14/11/2026): a elétrica coletiva ───────────────────────────────────────────────────────────────────────

  it('a elétrica: um QD por unidade em cada andar (filho do QGBT do térreo), um medidor por unidade de cada andar — as unidades medidas são as atendidas', () => {
    const plano = planejarPredioDoPedido(pedidoDoR8());
    const r = plano.resultado;
    const e = plano.resumo.eletrica!;
    const andares = [plano.tipoLevelId, ...r.levels.filter((l) => l.tipoDeId === plano.tipoLevelId).map((l) => l.id)];
    const qgbt = r.quadros.find((q) => q.tipo === 'QGBT')!;
    expect(r.levels.find((l) => l.id === qgbt.levelId)!.name).toBe('Torre · 1º pav (térreo)');
    const qs = r.quadros.find((q) => q.nome === 'QS — serviço')!;
    for (const L of andares) {
      const qds = r.quadros.filter((q) => q.levelId === L && q.unidadeId);
      expect(qds).toHaveLength(plano.resumo.unidadesPorAndar);
      expect(qds.every((q) => q.quadroPaiId === qgbt.id)).toBe(true);
      // E o quadro de serviço DO ANDAR (circulações), filho do QS — cada andar com os seus circuitos.
      expect(r.quadros.filter((q) => q.levelId === L && !q.unidadeId && q.quadroPaiId === qs.id)).toHaveLength(1);
    }
    expect(e.unidadesAtendidas).toBe(plano.resumo.unidades);
    expect(e.unidadesMedidas).toBe(plano.resumo.unidades);
    // Um por unidade de cada andar e o do condomínio.
    expect(e.medidores).toBe(plano.resumo.unidades + 1);
    const entrada = entradaDoQuadro(r, qgbt.id)!;
    expect([...entrada.unidadesMedidas].sort()).toEqual([...entrada.unidadesAtendidas].sort());
    // A NBR 5410 sem falta NA INSTALAÇÃO; a da ENTRADA (o padrão de entrada é hipótese, sem fonte normativa) fica: 35
    // unidades passam do padrão de baixa tensão — vira a pendência da média tensão (não é defeito do desenho).
    expect(entrada.categoria).toBeNull();
    expect(plano.pendencias.some((x) => x.grupo === 'NAO_DECIDIDO' && /MÉDIA tensão/.test(x.texto))).toBe(true);
    expect(plano.pendencias.filter((x) => x.grupo === 'VERIFICACAO' && /^Elétrica \((?!ENTRADA)/.test(x.texto))).toEqual([]);
  });

  it('no R4 (6 unidades) a elétrica sai sem falta da NBR 5410 na instalação, e numa categoria do padrão de baixa tensão', () => {
    const plano = planejarPredioDoPedido(pedidoDoR4());
    expect(plano.resumo.eletrica!.categoria).not.toBeNull();
    expect(plano.pendencias.filter((x) => x.grupo === 'VERIFICACAO' && /^Elétrica \((?!ENTRADA)/.test(x.texto))).toEqual([]);
  });

  it('os circuitos de cada QD só levam pontos da unidade dele (dentro da fatia dela na divisão do pavimento)', () => {
    const p = pedidoDoR8();
    const plano = planejarPredioDoPedido(p);
    const r = plano.resultado;
    const b = p.original.blocos![0];
    const pb = p.entrada.doBloco!;
    const ord = ordinalDoTipo(p.original, b);
    const piso = pb.pisos.find((x) => x.ordinal === ord)!;
    const d = dividirPavimentoDoBloco({ bloco: b, produto: MEDIO, porTipologia: piso.porTipologia, nucleoM2: pb.nucleo.m2, elevadores: pb.nucleo.elevadores, ordinalDoTipo: ord, rotacaoNorteDeg: null, direcaoDaRua: direcaoDaRua(p.original) });
    if (!d.ok) throw new Error(d.motivo);
    let conferidos = 0;
    for (const u of d.divisao.unidades) {
      const q = r.quadros.find((x) => x.levelId === plano.tipoLevelId && x.nome === `QD ${u.numero}`)!;
      const circuitos = new Set(r.circuitos.filter((c) => c.quadroId === q.id).map((c) => c.id));
      const pontos = r.terminais.filter((t) => t.levelId === plano.tipoLevelId && t.circuitoId && circuitos.has(t.circuitoId));
      expect(pontos.length).toBeGreaterThan(0);
      expect(pontos.filter((t) => !pointInPolygon(u.anel as Point[], t.at)).map((t) => t.id)).toEqual([]);
      conferidos += pontos.length;
    }
    expect(conferidos).toBeGreaterThan(50);
  });

  it('pular a re-derivação das cópias quando o comando não toca o tipo não muda nada: uma sincronização forçada no fim deixa o mesmo modelo', () => {
    const plano = planejarPredioDoPedido(pedidoDoR4());
    const tipo = plano.resultado.levels.find((l) => l.id === plano.tipoLevelId)!;
    const forcado = applyCommand(plano.resultado, { type: 'SetLevelProps', levelId: tipo.id, name: tipo.name }).model;
    expect(snapshotHash(forcado)).toBe(snapshotHash(plano.resultado));
    expect(plano.hashDoResultado).toBe(snapshotHash(plano.resultado));
  });

  it('o lançamento sem reaplicar: o histórico empilha o resultado previsto só sobre a base de onde ele saiu', () => {
    const p = pedidoDoR4();
    const plano = planejarPredioDoPedido(p);
    const h = new ModelHistory(p.original);
    const r = h.applyPrecomputed(plano.hashDoOriginal, { model: plano.resultado, diff: { created: plano.criados, updated: [], deleted: [], ancestry: {} }, hash: plano.hashDoResultado });
    expect(r.diff.created).toEqual(plano.criados);
    expect(snapshotHash(h.current)).toBe(plano.hashDoResultado);
    h.undo();
    expect(snapshotHash(h.current)).toBe(plano.hashDoOriginal);
    const mexido = new ModelHistory(applyCommand(p.original, { type: 'AddWall', levelId: p.original.levels[0].id, a: point(1000, 1000), b: point(3000, 1000), thicknessMm: 140, heightMm: 2800 }).model);
    expect(() => mexido.applyPrecomputed(plano.hashDoOriginal, { model: plano.resultado, diff: { created: plano.criados, updated: [], deleted: [], ancestry: {} }, hash: plano.hashDoResultado })).toThrow(/mudou desde a prévia/);
  });

  // ── PA5b (14/11/2026): a climatização no QD da unidade, os eletrodutos e a prumada ─────────────────────────────────

  it('a climatização: splits no tipo, cada ponto de ar no QD da unidade dele; cada andar copiado repete; nenhuma pendência falsa nas cópias', () => {
    const p = pedidoDoR8();
    const plano = planejarPredioDoPedido({ ...p, entrada: { ...p.entrada, climatizacao: CLIMATIZACAO } });
    const r = plano.resultado;
    const splits = plano.resumo.eletrica!.splits!;
    expect(splits).toBeGreaterThan(0);
    const b = p.original.blocos![0];
    const pb = p.entrada.doBloco!;
    const ord = ordinalDoTipo(p.original, b);
    const piso = pb.pisos.find((x) => x.ordinal === ord)!;
    const d = dividirPavimentoDoBloco({ bloco: b, produto: MEDIO, porTipologia: piso.porTipologia, nucleoM2: pb.nucleo.m2, elevadores: pb.nucleo.elevadores, ordinalDoTipo: ord, rotacaoNorteDeg: null, direcaoDaRua: direcaoDaRua(p.original) });
    if (!d.ok) throw new Error(d.motivo);
    const ar = r.terminais.filter((t) => t.levelId === plano.tipoLevelId && t.tipoEletrico === 'AR_CONDICIONADO');
    expect(ar).toHaveLength(splits);
    for (const t of ar) {
      const q = r.quadros.find((x) => x.id === r.circuitos.find((c) => c.id === t.circuitoId)?.quadroId)!;
      const u = d.divisao.unidades.find((x) => pointInPolygon(x.anel as Point[], t.at));
      if (u) expect(q.nome).toBe(`QD ${u.numero}`);
      else expect(q.nome).toMatch(/^QD \d+$/);
    }
    for (const c of r.levels.filter((l) => l.tipoDeId === plano.tipoLevelId)) expect(r.terminais.filter((t) => t.levelId === c.id && t.tipoEletrico === 'AR_CONDICIONADO')).toHaveLength(splits);
    expect(plano.pendencias.filter((x) => /Climatização/.test(x.texto) && /sem equipamento|Exaustão mecânica/.test(x.texto))).toEqual([]);
  });

  it('os eletrodutos dos QDs no tipo (as cópias repetem) e a prumada vertical no shaft do térreo ao último andar', () => {
    const plano = planejarPredioDoPedido(pedidoDoR4());
    const r = plano.resultado;
    const e = plano.resumo.eletrica!;
    expect(e.eletrodutos).toBeGreaterThan(0);
    const copias = r.levels.filter((l) => l.tipoDeId === plano.tipoLevelId);
    const eletrodutosDo = (L: string) => r.trechos.filter((t) => t.levelId === L && t.disciplina === 'ELETRICA' && !/^Prumada/.test(t.rotulo ?? '')).length;
    for (const c of copias) expect(eletrodutosDo(c.id)).toBe(eletrodutosDo(plano.tipoLevelId));
    const prumada = r.trechos.filter((t) => t.rotulo === 'Prumada elétrica — alimentadores dos QDs');
    const terreo = r.levels.find((l) => l.name === 'Torre · 1º pav (térreo)')!;
    expect(prumada.map((t) => t.levelId).sort()).toEqual([terreo.id, plano.tipoLevelId, ...copias.map((c) => c.id)].sort());
    expect(prumada.every((t) => t.a.x === t.b.x && t.a.y === t.b.y && t.cotaAMm === 0 && t.cotaBMm === 3000)).toBe(true);
    expect(new Set(prumada.map((t) => `${t.a.x},${t.a.y}`)).size).toBe(1);
  });

  it('as condensadoras não se empilham (o técnico mais perto, 0,9 m entre elas) — e o prédio sai igual gerado duas vezes', () => {
    const p = pedidoDoR4();
    const pedido = { ...p, entrada: { ...p.entrada, climatizacao: CLIMATIZACAO } };
    const a = planejarPredioDoPedido(pedido);
    const conds = a.resultado.terminais.filter((t) => t.levelId === a.tipoLevelId && t.tipoHidraulico === 'CONDENSADORA_SPLIT');
    expect(conds.length).toBeGreaterThan(0);
    for (const [i, c] of conds.entries()) for (const o of conds.slice(i + 1)) expect(Math.hypot(c.at.x - o.at.x, c.at.y - o.at.y)).toBeGreaterThanOrEqual(900);
    // Peças idênticas no mesmo lugar deixavam o canônico desempatar pelo uid (aleatório): o hash mudava a cada geração.
    expect(snapshotHash(planejarPredioDoPedido(pedido).resultado)).toBe(snapshotHash(a.resultado));
  });

  it('sem o catálogo de evaporadoras, a climatização não roda e a pendência diz o que falta', () => {
    const plano = planejarPredioDoPedido(pedidoDoR4());
    expect(plano.etapas.find((x) => x.id === 'CLIMATIZACAO')!.situacao).toBe('NAO_RODOU');
    expect(plano.resumo.eletrica!.splits).toBe(0);
    expect(plano.pendencias.some((x) => x.grupo === 'PREMISSA' && /catálogo de evaporadoras/.test(x.texto))).toBe(true);
  });
});

// PA6: o R8 com a água fria leva uns 13 s — um plano só para o bloco inteiro.
describe('prédio automático — a água fria (PA6)', { timeout: 120_000 }, () => {
  let cache: ReturnType<typeof planejarPredioDoPedido> | null = null;
  const r8 = () => (cache ??= planejarPredioDoPedido(pedidoDoR8()));

  it('um hidrômetro por unidade no tipo, cada um com a sua unidade; as cópias repetem — e cada unidade do prédio tem o seu', () => {
    const plano = r8();
    const m = plano.resultado;
    const agua = plano.resumo.agua!;
    expect(plano.etapas.filter((e) => ['LOUCAS', 'AGUA_FRIA', 'INSTALACOES_NO_TIPO', 'PRESSAO_DA_AGUA'].includes(e.id)).map((e) => `${e.id}:${e.situacao}`)).toEqual(['LOUCAS:LANCOU', 'AGUA_FRIA:LANCOU', 'INSTALACOES_NO_TIPO:LANCOU', 'PRESSAO_DA_AGUA:LANCOU']);
    expect(agua.hidrometros).toBe(plano.resumo.unidadesPorAndar);
    expect(agua.unidadesMedidas).toBe(plano.resumo.unidades);
    const hidrometros = m.terminais.filter((t) => t.tipoHidraulico === 'HIDROMETRO' && t.unidadeId);
    const doTipo = hidrometros.filter((t) => t.levelId === plano.tipoLevelId);
    expect(new Set(doTipo.map((t) => t.unidadeId)).size).toBe(agua.hidrometros);
    // Cada andar com unidades tem os seus, e cada hidrômetro mede uma unidade DIFERENTE do prédio (a derivada do andar).
    const andares = m.levels.filter((l) => l.id === plano.tipoLevelId || l.tipoDeId === plano.tipoLevelId);
    for (const l of andares) expect(hidrometros.filter((t) => t.levelId === l.id)).toHaveLength(agua.hidrometros);
    const chaves = hidrometros.map((t) => unidadeNoPavimento(m, t.unidadeId!, t.levelId)?.chave);
    expect(chaves.every(Boolean)).toBe(true);
    expect(new Set(chaves).size).toBe(plano.resumo.unidades);
    // O hidrômetro geral fica na frente do lote (o cavalete), sem unidade.
    expect(m.terminais.filter((t) => t.tipoHidraulico === 'HIDROMETRO' && !t.unidadeId)).toHaveLength(1);
  });

  it('a água de cada unidade só passa pelo hidrômetro dela: sem os ramais dos hidrômetros, cada rede tem os pontos de UMA unidade', () => {
    const plano = r8();
    const m = plano.resultado;
    const tipo = plano.tipoLevelId;
    const chave = fazerChave(m.levels);
    const hidrometros = m.terminais.filter((t) => t.levelId === tipo && t.tipoHidraulico === 'HIDROMETRO' && t.unidadeId);
    const af = m.trechos.filter((t) => t.levelId === tipo && t.disciplina === 'AGUA_FRIA' && !t.rotulo?.startsWith('Re'));
    // O ramal do hidrômetro: o trecho horizontal sob ele.
    const sob = (h: (typeof hidrometros)[number]) => af.find((t) => t.cotaAMm === h.cotaMm && t.cotaBMm === h.cotaMm && Math.abs((t.b.x - t.a.x) * (h.at.y - t.a.y) - (t.b.y - t.a.y) * (h.at.x - t.a.x)) / Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y) <= 1.5)!;
    const ramais = new Set(hidrometros.map((h) => sob(h).id));
    expect(ramais.size).toBe(hidrometros.length);
    const pai = new Map<string, string>();
    const raiz = (a: string): string => (pai.get(a) === a ? a : raiz(pai.get(a)!));
    const une = (a: string, b: string) => {
      for (const x of [a, b]) if (!pai.has(x)) pai.set(x, x);
      pai.set(raiz(a), raiz(b));
    };
    for (const t of af.filter((t) => !ramais.has(t.id))) une(chave(tipo, t.a.x, t.a.y, t.cotaAMm), chave(tipo, t.b.x, t.b.y, t.cotaBMm));
    const unidadeDe = new Map<string, Set<string>>();
    let pontos = 0;
    for (const t of m.terminais.filter((t) => t.levelId === tipo && t.disciplina === 'AGUA_FRIA' && t.tipoHidraulico && !['HIDROMETRO', 'VRP'].includes(t.tipoHidraulico))) {
      const no = chave(tipo, t.at.x, t.at.y, t.cotaMm);
      if (!pai.has(no)) continue;
      pontos++;
      // A unidade do ponto: a da etiqueta do cômodo dele.
      const label = m.labels.filter((l) => l.levelId === tipo).sort((a, b) => Math.hypot(a.at.x - t.at.x, a.at.y - t.at.y) - Math.hypot(b.at.x - t.at.x, b.at.y - t.at.y))[0];
      const u = m.unidades.find((x) => x.etiquetaUids.includes(label.uid));
      const r0 = raiz(no);
      unidadeDe.set(r0, (unidadeDe.get(r0) ?? new Set()).add(u?.numero ?? '?'));
    }
    expect(pontos).toBeGreaterThan(plano.resumo.unidadesPorAndar * 4);
    for (const s of unidadeDe.values()) expect(s.size).toBe(1);
    expect(unidadeDe.size).toBe(plano.resumo.unidadesPorAndar);
  });

  it('a pressão do prédio inteiro: nenhum ponto abaixo da mínima nem acima de 400 kPa; o último andar pede o pressurizador', () => {
    const plano = r8();
    const m = plano.resultado;
    const agua = plano.resumo.agua!;
    expect(agua.pressurizador).toBe(true);
    expect(agua.vrp).toBe(false);
    expect([agua.insuficientes, agua.excessivas, agua.naoAvaliados]).toEqual([0, 0, 0]);
    const superior = m.terminais.find((t) => t.papelReservatorio === 'SUPERIOR')!;
    const hidrometro = plano.pendencias.find((x) => /^Hidrômetros das unidades: vazão máxima de (\d+)/.test(x.texto))!;
    const qMax = Number(/vazão máxima de (\d+)/.exec(hidrometro.texto)![1]);
    const r = pressoesDaOrigem(m, superior, { ...HIPOTESES_PRESSAO_PADRAO, qMaxDoHidrometroM3h: qMax });
    expect(r.trechosDoAnel).toEqual([]);
    // Os pontos de todos os andares (o tipo e as cópias) estão na rede do superior.
    const doTipo = r.pontos.filter((p) => p.levelId === plano.tipoLevelId).length;
    expect(doTipo).toBeGreaterThan(0);
    expect(r.pontos.length).toBe(doTipo * plano.resumo.pavimentos);
    expect(r.pontos.every((p) => p.estado === 'OK')).toBe(true);
    expect(Math.round(Math.min(...r.pontos.map((p) => p.disponivelKpa!)))).toBe(agua.dinamicaMinKpa);
    expect(Math.round(Math.max(...r.pontos.map((p) => p.estaticaKpa!)))).toBe(agua.estaticaMaxKpa);
    expect(new Set(r.pontos.map((p) => p.levelId)).size).toBe(plano.resumo.pavimentos);
  });

  it('o volume dos reservatórios bate com a conta à mão: 2 pessoas por dormitório × 200 L × 1 dia, 60 % no inferior, e a reserva de incêndio da IT 17 no superior', () => {
    const plano = r8();
    const m = plano.resultado;
    // À mão: os dormitórios (e suítes) de TODOS os andares — o tipo e as cópias.
    const andares = new Set(m.levels.filter((l) => l.id === plano.tipoLevelId || l.tipoDeId === plano.tipoLevelId).map((l) => l.id));
    const dormitorios = m.spaces.filter((s) => andares.has(s.levelId) && /^(dormit|su[ií]te)/i.test(s.name ?? '') && !/banheiro/i.test(s.name ?? '')).length;
    const total = dormitorios * 2 * 200;
    expect(plano.resumo.reservacao!.totalL).toBe(total);
    const inferior = Math.round(total * 0.6);
    // A reserva de incêndio: A-2 (coluna 1 da Tabela 4 da IT 17), pela área total — o bloco de 30 × 16 m em 8 andares
    // (o tipo, as 6 cópias e o térreo) dá 3.840 m², na faixa de 3.001 a 6.000 m²: 12 m³ (tipo 2, hidrante).
    expect(plano.resumo.agua!.rtiL).toBe(12_000);
    const caixa = (papel: string) => m.terminais.find((t) => t.papelReservatorio === papel)!;
    expect(caixa('INFERIOR').volumeL).toBe(inferior);
    expect(caixa('SUPERIOR').volumeL).toBe(total - inferior + 12_000);
    expect(caixa('SUPERIOR').volumeRtiL).toBe(12_000);
    // O recalque: o consumo diário em 6 h, DN pela fórmula de Forchheimer (o primeiro de PVC com diâmetro interno ≥ D).
    const q = total / (6 * 3600);
    const d = diametroDeForchheimerMm(q, 6);
    expect(d).toBeCloseTo(1.3 * Math.sqrt(q / 1000) * Math.pow(6 / 24, 0.25) * 1000, 6);
    const dn = FICHA_DO_MATERIAL.PVC_SOLDAVEL.diametros.find((x) => x.internoMm >= d)!.dn;
    expect(plano.resumo.agua!.recalque!.dnMm).toBe(dn);
    const recalque = m.trechos.filter((t) => t.rotulo === 'Recalque');
    expect(recalque.every((t) => t.bitolaMm === dn)).toBe(true);
    // A prumada do recalque sobe por todos os pavimentos, do térreo à cobertura (o tipo leva, as cópias repetem).
    expect(new Set(recalque.map((t) => t.levelId)).size).toBe(plano.resumo.pavimentosLancados);
  });

  it('a coluna no shaft passa por todos os andares e o barrilete a liga ao superior; a trava confere o plano', () => {
    const plano = r8();
    const m = plano.resultado;
    const coluna = m.trechos.filter((t) => t.rotulo === 'Coluna de água fria');
    // Dois trechos por andar com unidades (até o ramal do andar e até o teto) — no tipo e em cada cópia.
    expect(coluna).toHaveLength(2 * plano.resumo.pavimentos);
    expect(new Set(coluna.map((t) => `${t.a.x},${t.a.y}`)).size).toBe(1);
    const shaft = m.nucleos.find((n) => n.tipo === 'SHAFT')!;
    expect(pointInPolygon(shaft.ring as Point[], coluna[0].a as Point)).toBe(true);
    expect(m.trechos.filter((t) => t.rotulo === 'Barrilete').length).toBeGreaterThan(0);
    const p = pedidoDoR8();
    expect(conferirPlanoDoPredio(p.original, plano, p.entrada)).toEqual({ ok: true });
  });
});
