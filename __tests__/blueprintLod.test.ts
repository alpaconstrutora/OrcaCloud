/**
 * LOD (21/09/2026, backlog P2): nível derivado por família com o requisito
 * do próximo nível por extenso; quadro contra o alvo (limitado ao teto);
 * pendências ordenadas; IFC leva LevelOfDevelopment só quando pedido.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../utils/blueprintKernel';
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

    // Estrutura: rótulo → 300 e é o teto (350 não é avaliado).
    const pilar = m2.structures![0];
    m2 = applyCommand(m2, { type: 'SetStructuralProps', structuralId: pilar.id, rotulo: 'P1' } as Command).model;
    expect(lodDosElementos(m2).find((e) => e.familia === 'estrutura')).toMatchObject({ lod: 300, falta: [], rotulo: 'Pilar P1' });
    expect(FICHA_DA_FAMILIA_LOD.estrutura.teto).toBe(300);

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

  it('quadro contra o alvo (limitado ao teto), pendências piores primeiro, resumo; IFC leva LevelOfDevelopment só quando pedido', () => {
    const { m, frente } = casa();
    const m2 = applyCommand(m, { type: 'SetWallLayers', wallId: frente.id, camadas: [{ espessuraMm: 150, itemCode: 'X', descricao: 'Bloco', funcao: 'VEDACAO' }] } as Command).model;
    const el = lodDosElementos(m2);
    const q = quadroDeLod(el);
    const paredes = q.find((l) => l.familia === 'parede')!;
    expect(paredes).toMatchObject({ pecas: 4, alvo: 300, teto: 350, noAlvo: 1, pct: 25, minimo: 200 });
    expect(paredes.porNivel).toMatchObject({ 200: 3, 350: 1 });
    // Alvo acima do teto conta contra o teto: estrutura com rótulo bate alvo 350 porque o teto é 300.
    const m3 = applyCommand(m2, { type: 'SetStructuralProps', structuralId: m2.structures![0].id, rotulo: 'P1' } as Command).model;
    const q3 = quadroDeLod(lodDosElementos(m3), { ...ALVO_DE_LOD_PADRAO, estrutura: 350 });
    expect(q3.find((l) => l.familia === 'estrutura')).toMatchObject({ noAlvo: 1, pct: 100 });
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
