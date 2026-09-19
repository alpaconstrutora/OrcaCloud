/**
 * Insolação e ventilação (19/09/2026, E5.1): posição do sol (declinação, altura,
 * azimute nos dois hemisférios), direção no desenho com o norte girado, horas
 * de sol por fachada e por ambiente (só fachadas com janela), sombra do
 * entorno, ventilação cruzada e a ponte com as regras.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { construirGrafoEspacial } from '../utils/blueprintGrafoEspacial';
import {
  analisarInsolacao,
  DATAS_DE_REFERENCIA,
  declinacaoSolarGraus,
  diaDoAno,
  direcaoDoSol,
  horasDeSolNaFachada,
  insolacaoParaRegras,
  posicaoSolar,
  prismasDoEntorno,
  resumirInsolacao,
  sombreado,
  ventilacaoCruzada,
} from '../utils/blueprintInsolacao';
import { avaliarRegras, REGRAS_SEMENTE } from '../utils/blueprintRegras';

/** Casa 8 × 6 (E4.2): Sala com janela a oeste e porta ao sul; Dormitório com janela a leste; Cozinha cega. */
function casa(): { m: BlueprintModel; t: string } {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  m = applyBatch(m, [w(0, 0, 8000, 0), w(8000, 0, 8000, 6000), w(8000, 6000, 0, 6000), w(0, 6000, 0, 0), w(4000, 0, 4000, 6000), w(4000, 3000, 8000, 3000)]).model;
  const sala = m.spaces.find((s) => s.ring.some((p) => p.x === 0))!;
  const coz = m.spaces.find((s) => s.ring.every((p) => p.x >= 4000) && s.ring.every((p) => p.y <= 3000))!;
  const dorm = m.spaces.find((s) => s.ring.every((p) => p.x >= 4000) && s.ring.every((p) => p.y >= 3000))!;
  const baixo = m.walls.find((x) => x.a.y === 0 && x.b.y === 0)!;
  const esquerda = m.walls.find((x) => x.a.x === 0 && x.b.x === 0)!;
  const meio = m.walls.find((x) => x.a.x === 4000 && x.b.x === 4000)!;
  const direita = m.walls.find((x) => x.a.x === 8000 && x.b.x === 8000)!;
  m = applyBatch(m, [
    { type: 'NameSpace', spaceId: sala.id, name: 'Sala', tipoDeAmbiente: 'SALA_DORMITORIO' },
    { type: 'NameSpace', spaceId: coz.id, name: 'Cozinha', tipoDeAmbiente: 'COZINHA_SERVICO' },
    { type: 'NameSpace', spaceId: dorm.id, name: 'Dormitório', tipoDeAmbiente: 'SALA_DORMITORIO' },
    { type: 'AddOpening', wallId: baixo.id, kind: 'door', offsetMm: 1000, widthMm: 900, heightMm: 2100, sillMm: 0 },
    { type: 'AddOpening', wallId: esquerda.id, kind: 'window', offsetMm: 2000, widthMm: 1500, heightMm: 1200, sillMm: 1000 },
    { type: 'AddOpening', wallId: meio.id, kind: 'door', offsetMm: 1000, widthMm: 800, heightMm: 2100, sillMm: 0 },
    { type: 'AddOpening', wallId: meio.id, kind: 'door', offsetMm: 4000, widthMm: 700, heightMm: 2100, sillMm: 0 },
    { type: 'AddOpening', wallId: direita.id, kind: 'window', offsetMm: 4000, widthMm: 1200, heightMm: 1200, sillMm: 1000 },
  ]).model;
  return { m, t };
}

describe('insolação', () => {
  it('posição do sol: declinação, meio-dia ao norte no inverno de São Paulo, quase a pino no verão, nascente a leste; direção no desenho segue o norte girado', () => {
    expect(declinacaoSolarGraus(DATAS_DE_REFERENCIA.INVERNO.dia)).toBeCloseTo(23.45, 1);
    expect(declinacaoSolarGraus(DATAS_DE_REFERENCIA.VERAO.dia)).toBeCloseTo(-23.45, 1);
    expect(Math.abs(declinacaoSolarGraus(DATAS_DE_REFERENCIA.EQUINOCIO.dia))).toBeLessThan(1);
    expect(diaDoAno('2026-06-21')).toBe(172);
    expect(diaDoAno('2026-12-21')).toBe(355);
    // São Paulo (−23,5°), 21/06, meio-dia solar: altura ≈ 43°, sol ao NORTE.
    const inverno = posicaoSolar(-23.5, 172, 12);
    expect(inverno.alturaGraus).toBeCloseTo(43.1, 0);
    expect(inverno.azimuteGraus).toBeCloseTo(0, 0);
    // 21/12: quase a pino (≈ 90°).
    expect(posicaoSolar(-23.5, 355, 12).alturaGraus).toBeGreaterThan(89);
    // Equinócio, 6 h solar: no horizonte, a LESTE (≈ 90°); 18 h: a OESTE (≈ 270°).
    expect(Math.abs(posicaoSolar(-23.5, 80, 6).alturaGraus)).toBeLessThan(1);
    expect(posicaoSolar(-23.5, 80, 6).azimuteGraus).toBeCloseTo(90, 0);
    expect(posicaoSolar(-23.5, 80, 18).azimuteGraus).toBeCloseTo(270, 0);
    // Meia-noite: abaixo do horizonte.
    expect(posicaoSolar(-23.5, 172, 0).acimaDoHorizonte).toBe(false);
    // Hemisfério norte (Lisboa, 38,7°): meio-dia de inverno (21/12) ao SUL.
    expect(posicaoSolar(38.7, 355, 12).azimuteGraus).toBeCloseTo(180, 0);
    expect(posicaoSolar(38.7, 355, 12).alturaGraus).toBeCloseTo(27.9, 0);
    // Direção no desenho: sol ao norte, sem giro → +Y; com o norte girado 90° (norte = +X) → +X.
    const aoNorte = { alturaGraus: 45, azimuteGraus: 0, acimaDoHorizonte: true };
    const d0 = direcaoDoSol(aoNorte, null);
    expect(d0.x).toBeCloseTo(0, 6);
    expect(d0.y).toBeCloseTo(Math.SQRT1_2, 6);
    expect(d0.z).toBeCloseTo(Math.SQRT1_2, 6);
    const d90 = direcaoDoSol(aoNorte, 90);
    expect(d90.x).toBeCloseTo(Math.SQRT1_2, 6);
    expect(d90.y).toBeCloseTo(0, 6);
    // Sol a leste (az 90) sem giro → +X.
    expect(direcaoDoSol({ alturaGraus: 0, azimuteGraus: 90, acimaDoHorizonte: true }, null).x).toBeCloseTo(1, 6);
  });

  it('horas por fachada e por ambiente: norte pega o dia inteiro no inverno, sul nada; o ambiente só conta as fachadas com janela; o entorno faz sombra; ventilação cruzada', () => {
    const { m, t } = casa();
    const g = construirGrafoEspacial(m, t);
    const sala = g.nos.find((n) => n.rotulo === 'Sala')!;
    const dorm = g.nos.find((n) => n.rotulo === 'Dormitório')!;
    const o = { latitudeGraus: -23.5, rotacaoNorteDeg: null, prismas: [], pisoMm: 0 };
    const norteDaSala = sala.fachadas.find((f) => f.orientacao === 'N')!;
    const sulDaSala = sala.fachadas.find((f) => f.orientacao === 'S')!;
    const oesteDaSala = sala.fachadas.find((f) => f.orientacao === 'O')!;
    const lesteDoDorm = dorm.fachadas.find((f) => f.orientacao === 'L')!;
    const hN = horasDeSolNaFachada(norteDaSala, 172, o);
    expect(hN).toBeGreaterThan(9); // o sol de inverno anda todo pelo norte
    expect(hN).toBeLessThan(11);
    expect(horasDeSolNaFachada(sulDaSala, 172, o)).toBe(0);
    expect(horasDeSolNaFachada(sulDaSala, 355, o)).toBeGreaterThan(3); // verão: manhã cedo e fim de tarde
    const hO = horasDeSolNaFachada(oesteDaSala, 172, o);
    const hL = horasDeSolNaFachada(lesteDoDorm, 172, o);
    expect(hO).toBeGreaterThan(3);
    expect(hL).toBeGreaterThan(3);
    expect(Math.abs(hO - hL)).toBeLessThanOrEqual(0.5); // simétricos em torno do meio-dia solar
    // Por ambiente: a sala tem janela só a OESTE → as horas do ambiente são as da fachada oeste, não as do norte.
    const analise = analisarInsolacao(g, o, { dia: 172, horaSolar: 9 });
    const aSala = analise.find((a) => a.rotulo === 'Sala')!;
    const aDorm = analise.find((a) => a.rotulo === 'Dormitório')!;
    const aCoz = analise.find((a) => a.rotulo === 'Cozinha')!;
    expect(aSala.horas.INVERNO).toBe(hO);
    expect(aDorm.horas.INVERNO).toBe(hL);
    expect(aCoz.temJanela).toBe(false);
    expect(aCoz.horas.INVERNO).toBe(0);
    expect(aCoz.agora).toBe('SEM_JANELA');
    // Às 9 h solar de inverno o sol está a nordeste: entra no dormitório (leste), não na sala (oeste).
    expect(aDorm.agora).toBe('SOL');
    expect(aSala.agora).toBe('SOMBRA');
    expect(analisarInsolacao(g, o, { dia: 172, horaSolar: 15 }).find((a) => a.rotulo === 'Sala')!.agora).toBe('SOL');
    expect(analisarInsolacao(g, o, { dia: 172, horaSolar: 22 }).find((a) => a.rotulo === 'Sala')!.agora).toBe('NOITE');
    // Ventilação cruzada: sala tem janela a O e porta ao S (ortogonais) → cruzada; dormitório só a L → não; cozinha sem abertura.
    expect(aSala.ventilacao).toMatchObject({ cruzada: true, motivo: 'aberturas em S e O' });
    expect(aDorm.ventilacao).toMatchObject({ cruzada: false, motivo: 'abertura só na fachada L' });
    expect(aCoz.ventilacao.motivo).toBe('sem abertura para fora');
    expect(ventilacaoCruzada(sala).orientacoes.sort()).toEqual(['O', 'S']);
    // Entorno: um prédio de 15 m colado a LESTE (o lote é a própria casa com uma margem) tira o sol da manhã do dormitório.
    const lote = [point(-1000, -1000), point(9000, -1000), point(9000, 7000), point(-1000, 7000)];
    const limites = [
      { id: 'b1', uid: 'u1', levelId: t, kind: 'TERRENO' as const, a: point(-1000, -1000), b: point(9000, -1000), papel: 'FRENTE' as const },
      { id: 'b2', uid: 'u2', levelId: t, kind: 'TERRENO' as const, a: point(9000, -1000), b: point(9000, 7000), papel: 'LATERAL_DIREITA' as const },
    ];
    const prismas = prismasDoEntorno([{ id: 'v1', lado: 'LATERAL_DIREITA', alturaM: 15, afastamentoM: 0, profundidadeM: 12 }], limites, lote);
    expect(prismas).toHaveLength(1);
    expect(prismas[0].anel.every((p) => p.x >= 9000)).toBe(true); // do lado de FORA do lote
    expect(prismas[0].alturaMm).toBe(15000);
    // Raio para o leste e baixo (20°): bloqueado; a 80° ainda bate no prédio (15 m a 1 m de distância = 86°); a 87° passa por cima.
    expect(sombreado({ x: 8000, y: 4500, zMm: 1200 }, { x: 0.94, y: 0, z: 0.34 }, prismas)).toBe(true);
    expect(sombreado({ x: 8000, y: 4500, zMm: 1200 }, { x: 0.17, y: 0, z: 0.98 }, prismas)).toBe(true);
    expect(sombreado({ x: 8000, y: 4500, zMm: 1200 }, { x: 0.05, y: 0, z: 0.9987 }, prismas)).toBe(false);
    expect(sombreado({ x: 8000, y: 4500, zMm: 1200 }, { x: -0.94, y: 0, z: 0.34 }, prismas)).toBe(false); // para oeste: nada lá
    const comEntorno = analisarInsolacao(g, { ...o, prismas }, { dia: 172, horaSolar: 9 });
    const dormSombreado = comEntorno.find((a) => a.rotulo === 'Dormitório')!;
    expect(dormSombreado.horas.INVERNO).toBeLessThan(aDorm.horas.INVERNO);
    expect(dormSombreado.agora).toBe('SOMBRA');
    expect(comEntorno.find((a) => a.rotulo === 'Sala')!.horas.INVERNO).toBe(aSala.horas.INVERNO); // a sala (oeste) não muda
    // Resumo e regras.
    const r = resumirInsolacao(analise, 2);
    expect(r).toMatchObject({ ambientes: 3, comJanela: 2, comVentilacaoCruzada: 1 });
    expect(r.semSolNoInverno).toEqual([]);
    expect(r.semVentilacaoCruzada.map((a) => a.rotulo)).toEqual(['Dormitório']);
    const regras = REGRAS_SEMENTE.filter((x) => x.id === 'sem-amb-insolacao' || x.id === 'sem-amb-ventilacao-cruzada');
    const res = avaliarRegras(m, regras, { insolacaoPorAmbiente: insolacaoParaRegras(analise), zona: { insolacaoMinimaH: 2 } });
    const de = (id: string, alvo: string) => res.find((x) => x.regraId === id && x.alvoRotulo === alvo)!;
    expect(de('sem-amb-insolacao', 'Sala').estado).toBe('CONFORME');
    expect(de('sem-amb-insolacao', 'Dormitório').estado).toBe('CONFORME');
    expect(de('sem-amb-insolacao', 'Cozinha')).toBeUndefined(); // não é SALA_DORMITORIO
    expect(de('sem-amb-ventilacao-cruzada', 'Dormitório').estado).toBe('VIOLADA');
    expect(de('sem-amb-ventilacao-cruzada', 'Sala').estado).toBe('CONFORME');
    // Sem mínimo na zona: não avaliada, nomeando o dado.
    const semZona = avaliarRegras(m, regras.filter((x) => x.id === 'sem-amb-insolacao'), { insolacaoPorAmbiente: insolacaoParaRegras(analise) });
    expect(semZona.every((x) => x.estado === 'NAO_AVALIADA' && /insolacao_minima/.test(x.motivo ?? ''))).toBe(true);
  });
});
