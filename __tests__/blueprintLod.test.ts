/**
 * LOD (21/09/2026, backlog P2): nível derivado por família com o requisito
 * do próximo nível por extenso; quadro contra o alvo (limitado ao teto);
 * pendências ordenadas; IFC leva LevelOfDevelopment só quando pedido.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, computeQuantities, emptyModel, KERNEL_VERSION, point, POLITICA_PADRAO, type Command } from '../utils/blueprintKernel';
import { armaduraDoModelo, HIPOTESES_ARMADURA_PADRAO, type HipotesesDeArmadura } from '../utils/blueprintArmadura';
import { gerarIfc } from '../utils/blueprintIfc';
import { ALVO_DE_LOD_PADRAO, FICHA_DA_FAMILIA_LOD, lodDosElementos, lodPorUid, pendenciasDeLod, quadroDeLod, resumoDeLod } from '../utils/blueprintLod';

function casa() {
  const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
  const t = nivel.model.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  let m = applyBatch(nivel.model, [w(0, 0, 4000, 0), w(4000, 0, 4000, 3000), w(4000, 3000, 0, 3000), w(0, 3000, 0, 0)]).model;
  const frente = m.walls.find((x) => x.a.y === 0 && x.b.y === 0)!;
  m = applyCommand(m, { type: 'AddOpening', wallId: frente.id, kind: 'door', offsetMm: 1000, widthMm: 900, heightMm: 2100, sillMm: 0 } as Command).model;
  m = applyCommand(m, { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [point(2000, 1500)], larguraMm: 300, profundidadeMm: 300, alturaMm: 2800, baseMm: 0 } as Command).model;
  m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'Tomada', at: point(1000, 150), cotaMm: 300 } as Command).model;
  return { m, t, frente };
}

describe('LOD derivado', () => {
  it('cada família nasce em 200 com o que falta por extenso; sobe conforme o que se declara; teto por família', () => {
    const { m, frente } = casa();
    const el = lodDosElementos(m);
    const por = (f: string) => el.filter((e) => e.familia === f);
    expect(por('parede').every((e) => e.lod === 200)).toBe(true);
    expect(por('parede')[0].falta[0]).toMatch(/composição em camadas/);
    expect(por('abertura')[0]).toMatchObject({ lod: 200, falta: ['atribuir uma esquadria (tipo) ao vão'] });
    expect(por('estrutura')[0]).toMatchObject({ lod: 200 });
    expect(por('estrutura')[0].falta[0]).toMatch(/rótulo/);
    expect(por('terminal')[0].lod).toBe(200);
    expect(por('terminal')[0].falta[0]).toMatch(/classificar o ponto elétrico/);
    expect(por('ambiente')[0]).toMatchObject({ lod: 200 });
    expect(por('ambiente')[0].falta).toEqual(['nomear o ambiente', 'classificar o tipo de ambiente (NBR 5410)']);

    // Parede com camadas → 300; com item em toda camada → 350.
    let m2 = applyCommand(m, { type: 'SetWallLayers', wallId: frente.id, camadas: [{ espessuraMm: 150, itemCode: '', descricao: 'Bloco', funcao: 'VEDACAO' }] } as Command).model;
    let p = lodDosElementos(m2).find((e) => e.familia === 'parede' && e.id === frente.id)!;
    expect(p.lod).toBe(300);
    expect(p.falta[0]).toMatch(/item de catálogo em 1 camada\(s\): Bloco/);
    m2 = applyCommand(m2, { type: 'SetWallLayers', wallId: frente.id, camadas: [{ espessuraMm: 150, itemCode: 'INT-BLOCO-CER-14', descricao: 'Bloco', funcao: 'VEDACAO' }] } as Command).model;
    p = lodDosElementos(m2).find((e) => e.familia === 'parede' && e.id === frente.id)!;
    expect(p).toMatchObject({ lod: 350, falta: [] });

    // Estrutura: rótulo → 300; sem contexto de armadura para aí (a falta diz o que declarar); o teto agora é 400 (P2.30).
    const pilar = m2.structures![0];
    m2 = applyCommand(m2, { type: 'SetStructuralProps', structuralId: pilar.id, rotulo: 'P1' } as Command).model;
    expect(lodDosElementos(m2).find((e) => e.familia === 'estrutura')).toMatchObject({ lod: 300, rotulo: 'Pilar P1' });
    expect(lodDosElementos(m2).find((e) => e.familia === 'estrutura')!.falta[0]).toMatch(/declarar a armadura da peça/);
    expect(FICHA_DA_FAMILIA_LOD.estrutura.teto).toBe(400);

    // Terminal: tipo fechado → 300; circuito → 350.
    const tom = m2.terminais![0];
    m2 = applyCommand(m2, { type: 'SetTerminalProps', terminalId: tom.id, tipoEletrico: 'TUG' } as Command).model;
    expect(lodDosElementos(m2).find((e) => e.familia === 'terminal')).toMatchObject({ lod: 300, falta: ['ligar o ponto a um circuito'] });

    // Ambiente: nome + tipo → 300; acabamentos → 350.
    const sala = m2.spaces[0];
    m2 = applyCommand(m2, { type: 'NameSpace', spaceId: sala.id, name: 'Sala', tipoDeAmbiente: 'SALA_DORMITORIO' }).model;
    expect(lodDosElementos(m2).find((e) => e.familia === 'ambiente')).toMatchObject({ lod: 300, rotulo: 'Sala' });
    m2 = applyCommand(m2, { type: 'NameSpace', spaceId: sala.id, name: 'Sala', acabamentos: { rodape: null } }).model;
    expect(lodDosElementos(m2).find((e) => e.familia === 'ambiente')).toMatchObject({ lod: 350, falta: [] });
  });

  it('ESTRUTURA 350/400 pela armadura por peça (P2.30): manual = 350; completa e sem avisos = 400; viga exige a superior; IFC leva o nível com o contexto', () => {
    const { m, t } = casa();
    let m2 = applyCommand(m, { type: 'SetStructuralProps', structuralId: m.structures![0].id, rotulo: 'P1' } as Command).model;
    m2 = applyCommand(m2, { type: 'AddStructural', levelId: t, kind: 'VIGA', pontos: [point(0, 1500), point(4000, 1500)], larguraMm: 150, profundidadeMm: 0, alturaMm: 400, baseMm: 2400, rotulo: 'V1' } as Command).model;
    const pilar = m2.structures![0];
    const viga = m2.structures![1];
    const quant = computeQuantities(m2, POLITICA_PADRAO, KERNEL_VERSION);
    const contexto = (hip: HipotesesDeArmadura) => ({ armaduraPorUid: new Map(armaduraDoModelo(m2, quant, hip).pecas.map((p) => [p.uid, p])), manualPorUid: hip.porPeca ?? {} });
    const lodDe = (hip: HipotesesDeArmadura, uid: string) => lodDosElementos(m2, null, contexto(hip)).find((e) => e.familia === 'estrutura' && e.uid === uid)!;
    // Sem manual: esquema/taxa → 300.
    expect(lodDe(HIPOTESES_ARMADURA_PADRAO, pilar.uid).lod).toBe(300);
    // Pilar com armadura manual (4 Ø 12,5 + estribo 6,3 c/15): 350 se houver aviso, 400 se não.
    const hipPilar: HipotesesDeArmadura = { ...HIPOTESES_ARMADURA_PADRAO, porPeca: { [pilar.uid]: { nLongitudinal: 4, bitolaLongitudinalMm: 12.5, bitolaTransversalMm: 6.3, espacamentoTransversalCm: 15 } } };
    const armPilar = armaduraDoModelo(m2, quant, hipPilar).pecas.find((p) => p.uid === pilar.uid)!;
    expect(armPilar.origem).toBe('MANUAL');
    const lp = lodDe(hipPilar, pilar.uid);
    expect(lp.lod).toBe(armPilar.avisos.length === 0 ? 400 : 350);
    // Pilar subarmado de propósito (2 Ø 5): abaixo do mínimo → aviso → 350 com o aviso na falta.
    const hipFraco: HipotesesDeArmadura = { ...HIPOTESES_ARMADURA_PADRAO, porPeca: { [pilar.uid]: { nLongitudinal: 2, bitolaLongitudinalMm: 5, bitolaTransversalMm: 5, espacamentoTransversalCm: 30 } } };
    const lf = lodDe(hipFraco, pilar.uid);
    expect(lf.lod).toBe(350);
    expect(lf.falta.join(' ')).toMatch(/avisos da armadura/);
    // Viga manual só com a inferior: 350, falta a superior; com a superior declarada: 400.
    const hipVigaInf: HipotesesDeArmadura = { ...HIPOTESES_ARMADURA_PADRAO, porPeca: { [viga.uid]: { nLongitudinal: 3, bitolaLongitudinalMm: 12.5, bitolaTransversalMm: 6.3, espacamentoTransversalCm: 15 } } };
    const lv = lodDe(hipVigaInf, viga.uid);
    expect(lv.lod).toBe(350);
    expect(lv.falta.join(' ')).toMatch(/armadura superior/);
    const hipVigaOk: HipotesesDeArmadura = { ...HIPOTESES_ARMADURA_PADRAO, porPeca: { [viga.uid]: { nLongitudinal: 3, bitolaLongitudinalMm: 12.5, nSuperior: 2, bitolaSuperiorMm: 10, bitolaTransversalMm: 6.3, espacamentoTransversalCm: 15 } } };
    const armViga = armaduraDoModelo(m2, quant, hipVigaOk).pecas.find((p) => p.uid === viga.uid)!;
    expect(lodDe(hipVigaOk, viga.uid).lod).toBe(armViga.avisos.length === 0 ? 400 : 350);
    // Quadro com alvo 400 e a coluna 400; IFC leva o nível quando o contexto vai.
    const q = quadroDeLod(lodDosElementos(m2, null, contexto(hipVigaOk)), { ...ALVO_DE_LOD_PADRAO, estrutura: 400 });
    expect(q.find((l) => l.familia === 'estrutura')!.porNivel[400] + q.find((l) => l.familia === 'estrutura')!.porNivel[350]).toBeGreaterThanOrEqual(1);
    const ifc = gerarIfc(m2, { titulo: 'Casa', revisao: 1, hash: 'h', lodPorUid: lodPorUid(m2, contexto(hipVigaOk)) });
    expect(ifc).toMatch(/IFCPROPERTYSINGLEVALUE\('LevelOfDevelopment',\$,IFCINTEGER\((350|400)\),\$\)/);
  });

  it('quadro contra o alvo (limitado ao teto), pendências piores primeiro, resumo; IFC leva LevelOfDevelopment só quando pedido', () => {
    const { m, frente } = casa();
    const m2 = applyCommand(m, { type: 'SetWallLayers', wallId: frente.id, camadas: [{ espessuraMm: 150, itemCode: 'X', descricao: 'Bloco', funcao: 'VEDACAO' }] } as Command).model;
    const el = lodDosElementos(m2);
    const q = quadroDeLod(el);
    const paredes = q.find((l) => l.familia === 'parede')!;
    expect(paredes).toMatchObject({ pecas: 4, alvo: 300, teto: 350, noAlvo: 1, pct: 25, minimo: 200 });
    expect(paredes.porNivel).toMatchObject({ 200: 3, 350: 1 });
    // P2.30: o teto da estrutura passou a 400 — com rótulo e sem armadura declarada a peça fica em 300, e alvo 350 já cobra a armadura.
    const m3 = applyCommand(m2, { type: 'SetStructuralProps', structuralId: m2.structures![0].id, rotulo: 'P1' } as Command).model;
    const q3 = quadroDeLod(lodDosElementos(m3), { ...ALVO_DE_LOD_PADRAO, estrutura: 350 });
    expect(q3.find((l) => l.familia === 'estrutura')).toMatchObject({ noAlvo: 0, pct: 0, teto: 400 });
    // Alvo acima do teto conta contra o teto: parede (teto 350) com alvo 400 → a de 350 conta como no alvo.
    const q4 = quadroDeLod(el, { ...ALVO_DE_LOD_PADRAO, parede: 400 });
    expect(q4.find((l) => l.familia === 'parede')).toMatchObject({ noAlvo: 1 });
    // Com alvo 200 em tudo, nada pende; com 350 nas paredes, 3 pendem.
    const tudo200 = Object.fromEntries(Object.keys(ALVO_DE_LOD_PADRAO).map((k) => [k, 200])) as typeof ALVO_DE_LOD_PADRAO;
    expect(pendenciasDeLod(el, tudo200)).toEqual([]);
    const pend = pendenciasDeLod(el, { ...ALVO_DE_LOD_PADRAO, parede: 350 });
    expect(pend.filter((e) => e.familia === 'parede')).toHaveLength(3);
    expect(pend[0].lod).toBe(200);
    expect(resumoDeLod(el)).toMatchObject({ minimo: 200, pecas: el.length });

    // IFC: sem `lodPorUid` o arquivo não muda; com ele, o Pset traz o nível.
    const o = { titulo: 'Casa', revisao: 1, hash: 'h' };
    const semLod = gerarIfc(m2, o);
    expect(semLod).not.toContain('LevelOfDevelopment');
    const comLod = gerarIfc(m2, { ...o, lodPorUid: lodPorUid(m2) });
    expect(comLod).toContain("IFCPROPERTYSINGLEVALUE('LevelOfDevelopment',$,IFCINTEGER(350),$)");
    expect(comLod).toContain("IFCPROPERTYSINGLEVALUE('LevelOfDevelopment',$,IFCINTEGER(200),$)");
  });
});
