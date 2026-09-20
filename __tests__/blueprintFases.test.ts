/**
 * Fases de reforma (20/09/2026, E10.2, kernel 0.46.0): `SetFase` em parede,
 * abertura, estrutura e componente; NOVO = ausência (canônico não emite; hash
 * de desenho novo não muda); ida e volta pelo payload; invariante; cópias de
 * grupo levam a fase; quantitativos contam só o NOVO e separam demolição e
 * existente; medidas `DEMOLICAO_*` do orçamento; filtro de vista e resumo.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, canonicalPayload, computeQuantities, emptyModel, FASES_DE_REFORMA, faseDe, KERNEL_VERSION, modelFromCanonicalPayload, parseCanonicalPayload, point, POLITICA_PADRAO, snapshotHash, type Command } from '../utils/blueprintKernel';
import { gerarLancamentos, MEDIDAS, type MapeamentoOrcamento, type MapeamentoResolvido } from '../utils/blueprintBudget';
import { SinapiType, type SinapiItem } from '../types/budget';
import { contagemPorFase, faseDaSelecao, fasePorId, idsOcultosPelaFase, resumirFases } from '../utils/blueprintFases';

function casa() {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  m = applyBatch(m, [w(0, 0, 8000, 0), w(8000, 0, 8000, 4000), w(8000, 4000, 0, 4000), w(0, 4000, 0, 0), w(4000, 0, 4000, 4000)]).model;
  const meio = m.walls.find((x) => x.a.x === 4000 && x.b.x === 4000)!;
  const sul = m.walls.find((x) => x.a.y === 0 && x.b.y === 0)!;
  m = applyBatch(m, [
    { type: 'AddOpening', wallId: sul.id, kind: 'door', offsetMm: 1000, widthMm: 800, heightMm: 2100, sillMm: 0 },
    { type: 'AddOpening', wallId: meio.id, kind: 'door', offsetMm: 1500, widthMm: 800, heightMm: 2100, sillMm: 0 },
    { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [point(0, 0)], larguraMm: 200, profundidadeMm: 200, alturaMm: 2800, baseMm: 0 } as Command,
    { type: 'AddComponente', levelId: t, tipoId: 'SOFA', at: point(2000, 2000), rotacaoGraus: 0 } as Command,
  ]).model;
  return { m, t, meio: m.walls.find((x) => x.a.x === 4000 && x.b.x === 4000)!, sul: m.walls.find((x) => x.a.y === 0 && x.b.y === 0)! };
}

describe('fases de reforma (E10.2)', () => {
  it('kernel 0.46.0; NOVO é a ausência: marcar NOVO/null não muda o payload nem o hash; EXISTENTE/DEMOLIR entram no canônico e voltam; invariante recusa valor inventado', () => {
    expect(KERNEL_VERSION >= 'blueprint-kernel-ts-0.46.0').toBe(true);
    expect(FASES_DE_REFORMA).toEqual(['EXISTENTE', 'DEMOLIR', 'NOVO']);
    const { m, meio, sul } = casa();
    const hash0 = snapshotHash(m);
    const semMudanca = applyCommand(m, { type: 'SetFase', ids: [meio.id], fase: 'NOVO' }).model;
    expect(snapshotHash(semMudanca)).toBe(hash0);
    expect(canonicalPayload(semMudanca)).not.toMatch(/"fase"/);
    const porta = m.openings.find((o) => o.wallId === meio.id)!;
    const pilar = m.structures![0];
    const sofa = m.componentes![0];
    const marcado = applyBatch(m, [
      { type: 'SetFase', ids: [meio.id, porta.id], fase: 'DEMOLIR' },
      { type: 'SetFase', ids: [sul.id, pilar.id, sofa.id], fase: 'EXISTENTE' },
    ]).model;
    expect(snapshotHash(marcado)).not.toBe(hash0);
    expect(faseDe(marcado.walls.find((x) => x.id === meio.id)!)).toBe('DEMOLIR');
    expect(faseDe(marcado.openings.find((o) => o.id === porta.id)!)).toBe('DEMOLIR');
    expect(faseDe(marcado.structures![0])).toBe('EXISTENTE');
    expect(faseDe(marcado.componentes![0])).toBe('EXISTENTE');
    const payload = canonicalPayload(marcado);
    expect((payload.match(/"fase":"DEMOLIR"/g) ?? []).length).toBe(2);
    expect((payload.match(/"fase":"EXISTENTE"/g) ?? []).length).toBe(3);
    const relido = modelFromCanonicalPayload(parseCanonicalPayload(payload));
    expect(snapshotHash(relido)).toBe(snapshotHash(marcado));
    expect(relido.walls.filter((x) => x.fase === 'DEMOLIR')).toHaveLength(1);
    // Voltar a NOVO apaga a chave.
    const limpo = applyCommand(marcado, { type: 'SetFase', ids: [meio.id, porta.id, sul.id, pilar.id, sofa.id], fase: null }).model;
    expect(snapshotHash(limpo)).toBe(hash0);
    expect(() => applyCommand(m, { type: 'SetFase', ids: [meio.id], fase: 'REFORMAR' as never })).toThrow(/BAD_PHASE|inválida/);
    expect(() => applyCommand(m, { type: 'SetFase', ids: ['wal_9999'], fase: 'DEMOLIR' })).toThrow(/não existe/);
  });

  it('quantitativos: os totais de construção contam só o NOVO; demolição e existente saem à parte; cada linha diz a fase; versão quant-1.13.0', () => {
    const { m, meio, sul } = casa();
    const porta = m.openings.find((o) => o.wallId === meio.id)!;
    const marcado = applyBatch(m, [
      { type: 'SetFase', ids: [meio.id, porta.id], fase: 'DEMOLIR' },
      { type: 'SetFase', ids: [sul.id], fase: 'EXISTENTE' },
    ]).model;
    const antes = computeQuantities(m, POLITICA_PADRAO, KERNEL_VERSION);
    const depois = computeQuantities(marcado, POLITICA_PADRAO, KERNEL_VERSION);
    expect(depois.policy.version).toBe('quant-1.13.0');
    expect(depois.paredes).toHaveLength(5); // a lista continua inteira…
    expect(depois.paredes.map((p) => p.fase).sort()).toEqual(['DEMOLIR', 'EXISTENTE', 'NOVO', 'NOVO', 'NOVO']);
    // …mas os totais só têm as 3 novas.
    const novas = depois.paredes.filter((p) => p.fase === 'NOVO');
    expect(depois.totais.volumeAlvenariaM3).toBeCloseTo(novas.reduce((s, p) => s + p.volumeM3, 0), 6);
    expect(depois.totais.volumeAlvenariaM3).toBeLessThan(antes.totais.volumeAlvenariaM3);
    expect(depois.totais.portas).toBe(1); // só a porta da parede do meio foi marcada; a da parede sul continua NOVA (a fase da abertura é dela, não da parede)
    expect(depois.totais.demolicao).toMatchObject({ paredes: 1, aberturas: 1, estruturas: 0 });
    expect(depois.totais.demolicao.volumeAlvenariaM3).toBeCloseTo(depois.paredes.find((p) => p.fase === 'DEMOLIR')!.volumeM3, 6);
    expect(depois.totais.existente).toMatchObject({ paredes: 1, aberturas: 0 });
    expect(depois.totais.existente.comprimentoParedeM).toBeCloseTo(8, 6);
    // Sem fase marcada, demolição e existente são zero e o resto é igual ao de antes.
    expect(antes.totais.demolicao.paredes + antes.totais.existente.paredes).toBe(0);
  });

  it('orçamento: medidas DEMOLICAO_* (escopo DEMOLICAO) lançam só o que está A DEMOLIR; sem demolição, nada', () => {
    const { m, meio } = casa();
    const porta = m.openings.find((o) => o.wallId === meio.id)!;
    const marcado = applyBatch(m, [{ type: 'SetFase', ids: [meio.id, porta.id, m.structures![0].id], fase: 'DEMOLIR' }]).model;
    const q = computeQuantities(marcado, POLITICA_PADRAO, KERNEL_VERSION);
    const ids = MEDIDAS.filter((d) => d.escopo === 'DEMOLICAO').map((d) => d.id);
    expect(ids).toEqual(['DEMOLICAO_AREA_PAREDE', 'DEMOLICAO_VOLUME_ALVENARIA', 'DEMOLICAO_ABERTURAS', 'DEMOLICAO_VOLUME_CONCRETO']);
    const item = (code: string, unit: string): SinapiItem => ({ code, description: `Item ${code}`, unit, price: 50, type: SinapiType.COMPOSITION } as SinapiItem);
    const mapa = (medida: string, item_code: string): MapeamentoOrcamento => ({ id: `m-${medida}`, organization_id: 'org', medida, item_code, phase: 'Demolição', budget_group: 'Demolição', agrupamento: 'TOTAL', filtro_ambiente: [], active: true });
    const resolvidos: MapeamentoResolvido[] = [
      { mapeamento: mapa('DEMOLICAO_VOLUME_ALVENARIA', 'D1'), item: item('D1', 'M3') },
      { mapeamento: mapa('DEMOLICAO_ABERTURAS', 'D2'), item: item('D2', 'UN') },
      { mapeamento: mapa('DEMOLICAO_VOLUME_CONCRETO', 'D3'), item: item('D3', 'M3') },
      { mapeamento: mapa('DEMOLICAO_AREA_PAREDE', 'D4'), item: item('D4', 'M2') },
    ];
    const ctx = { studyId: 'estudo-1', studyName: 'Reforma', snapshotId: 'snap-1', snapshotHash: 'abcdef0123456789', revision: 1 };
    const r = gerarLancamentos(q, resolvidos, ctx);
    const paredeDemolida = q.paredes.find((p) => p.fase === 'DEMOLIR')!;
    const porCodigo = (c: string) => r.entries.filter((e) => e.itemCode === c || (e as unknown as { item_code?: string }).item_code === c || JSON.stringify(e).includes(`"${c}"`));
    expect(porCodigo('D1').reduce((s, e) => s + e.quantity, 0)).toBeCloseTo(paredeDemolida.volumeM3, 4);
    expect(porCodigo('D4').reduce((s, e) => s + e.quantity, 0)).toBeCloseTo(paredeDemolida.areaFaceLiquidaM2, 4);
    expect(porCodigo('D2').reduce((s, e) => s + e.quantity, 0)).toBe(1);
    expect(porCodigo('D3').reduce((s, e) => s + e.quantity, 0)).toBeCloseTo(q.estruturas[0].volumeConcretoM3, 4);
    // Sem nada a demolir: nenhum lançamento de demolição.
    const r0 = gerarLancamentos(computeQuantities(m, POLITICA_PADRAO, KERNEL_VERSION), resolvidos, ctx);
    expect(r0.entries.filter((e) => JSON.stringify(e).match(/"D[1-4]"/))).toEqual([]);
  });

  it('vista: filtro esconde por fase (antes = sem novo; depois = sem demolir; demolição = só demolir); fasePorId só lista o que não é novo; a seleção mista não tem fase; resumo em frases', () => {
    const { m, meio, sul } = casa();
    const porta = m.openings.find((o) => o.wallId === meio.id)!;
    const marcado = applyBatch(m, [
      { type: 'SetFase', ids: [meio.id, porta.id], fase: 'DEMOLIR' },
      { type: 'SetFase', ids: [sul.id], fase: 'EXISTENTE' },
    ]).model;
    expect(idsOcultosPelaFase(marcado, 'TUDO').size).toBe(0);
    const antes = idsOcultosPelaFase(marcado, 'ANTES');
    expect(antes.has(meio.id) || antes.has(sul.id)).toBe(false);
    expect(antes.size).toBe(3 + 1 + 1 + 1); // 3 paredes novas + porta nova + pilar + sofá
    const depois = idsOcultosPelaFase(marcado, 'DEPOIS');
    expect([...depois].sort()).toEqual([meio.id, porta.id].sort());
    const demolicao = idsOcultosPelaFase(marcado, 'DEMOLICAO');
    expect(demolicao.has(meio.id)).toBe(false);
    expect(demolicao.has(sul.id)).toBe(true);
    expect([...fasePorId(marcado).entries()].sort()).toEqual([[meio.id, 'DEMOLIR'], [porta.id, 'DEMOLIR'], [sul.id, 'EXISTENTE']].sort());
    expect(contagemPorFase(marcado)).toEqual({ EXISTENTE: 1, DEMOLIR: 2, NOVO: 6 });
    expect(faseDaSelecao(marcado, [meio.id, porta.id])).toEqual({ ids: [meio.id, porta.id], fase: 'DEMOLIR' });
    expect(faseDaSelecao(marcado, [meio.id, sul.id]).fase).toBeNull();
    expect(faseDaSelecao(marcado, ['spc_lvl_0001_0001']).ids).toEqual([]); // ambiente não tem fase
    const r = resumirFases(computeQuantities(marcado, POLITICA_PADRAO, KERNEL_VERSION));
    expect(r.demolicao).toMatch(/^1 parede\(s\) · .* m³ de alvenaria · 1 esquadria\(s\) a remover$/);
    expect(r.existente).toMatch(/1 parede\(s\) existentes ficam \(8,00 m\)/);
    expect(r.novo).toMatch(/^3 parede\(s\) novas/);
    expect(resumirFases(computeQuantities(m, POLITICA_PADRAO, KERNEL_VERSION)).demolicao).toBe('Nada a demolir.');
  });
});
