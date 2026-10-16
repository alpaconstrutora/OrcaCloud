/**
 * Mobiliário mínimo e circulação livre (19/09/2026, E6.3): kit por uso, peças
 * dentro do retângulo interno sem sobrepor faixas de uso nem o giro da porta,
 * armário e cabeceira fora da janela, "não coube" declarado, e a verificação
 * de circulação por grade (0,90 / 1,20; largura livre; peça fora da rota).
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { comandosDeMobiliario, comandosDeMobiliarioComPontos, KIT_POR_USO, mobiliarDoAmbiente, mobiliarNivel, resumirMobiliario } from '../utils/blueprintMobiliario';

/** Um cômodo isolado `w × d` (eixo), paredes de 150, porta na parede sul e janela opcional na norte. */
function comodo(nome: string, w: number, d: number, porta = true, janelaNorte = true): { m: BlueprintModel; spaceId: string } {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  const wall = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  m = applyBatch(m, [wall(0, 0, w, 0), wall(w, 0, w, d), wall(w, d, 0, d), wall(0, d, 0, 0)]).model;
  const s = m.spaces[0];
  const sul = m.walls.find((x) => x.a.y === 0 && x.b.y === 0)!;
  const norte = m.walls.find((x) => x.a.y === d && x.b.y === d)!;
  const cmds: Command[] = [{ type: 'NameSpace', spaceId: s.id, name: nome }];
  if (porta) cmds.push({ type: 'AddOpening', wallId: sul.id, kind: 'door', offsetMm: 200, widthMm: 800, heightMm: 2100, sillMm: 0 });
  if (janelaNorte) cmds.push({ type: 'AddOpening', wallId: norte.id, kind: 'window', offsetMm: Math.round(w / 2) - 600, widthMm: 1200, heightMm: 1200, sillMm: 1000 });
  m = applyBatch(m, cmds).model;
  return { m, spaceId: m.spaces[0].id };
}

const sobrepoe = (a: { x0: number; y0: number; x1: number; y1: number }, b: { x0: number; y0: number; x1: number; y1: number }) => a.x0 < b.x1 - 1 && b.x0 < a.x1 - 1 && a.y0 < b.y1 - 1 && b.y0 < a.y1 - 1;

describe('mobiliário mínimo', () => {
  it('dormitório 3,50 × 4,00: cama, armário e criado cabem; cama com cabeceira fora da janela, armário fora da janela e da porta; nada sobrepõe; circulação de 0,90 passa', () => {
    const { m, spaceId } = comodo('Dormitório 1', 3500, 4000);
    const r = mobiliarDoAmbiente(m, m.spaces.find((s) => s.id === spaceId)!);
    expect(r.uso).toBe('DORMITORIO');
    expect(r.interno).toEqual({ x0: 75, y0: 75, x1: 3425, y1: 3925 });
    expect(r.pecas.map((p) => p.peca.tipo)).toEqual(['CAMA_CASAL', 'ARMARIO', 'CRIADO']);
    expect(r.naoCouberam).toEqual([]);
    const cama = r.pecas.find((p) => p.peca.tipo === 'CAMA_CASAL')!;
    const armario = r.pecas.find((p) => p.peca.tipo === 'ARMARIO')!;
    // Janela ao norte e porta ao sul: cabeceira e armário nos lados cegos (O/L).
    expect(['O', 'L']).toContain(cama.lado);
    expect(['O', 'L']).toContain(armario.lado);
    expect(cama.lado).not.toBe(armario.lado);
    // Tudo dentro do retângulo interno e sem sobreposição de peça com faixa de uso alheia.
    for (const p of r.pecas) {
      expect(p.ret.x0).toBeGreaterThanOrEqual(r.interno!.x0 - 1);
      expect(p.ret.x1).toBeLessThanOrEqual(r.interno!.x1 + 1);
      for (const q of r.pecas) if (q !== p) expect(sobrepoe(p.ret, q.comUso)).toBe(false);
    }
    // O giro da porta (200..1000 em x, 900 para dentro) fica livre.
    const giro = { x0: 200, y0: 75, x1: 1000, y1: 975 };
    for (const p of r.pecas) expect(sobrepoe(p.ret, giro)).toBe(false);
    expect(r.circulacao.ok90).toBe(true);
    expect(r.circulacao.larguraLivreMm).toBeGreaterThanOrEqual(900);
    expect(r.circulacao.semPorta).toBe(false);
  });

  it('dormitório estreito 2,40 × 3,20: o armário não cabe (declarado) ou a circulação cai abaixo de 0,90; cozinha e banheiro têm kits; ambiente sem nome não tem kit; resumo', () => {
    const estreito = comodo('Quarto', 2400, 3200);
    const r = mobiliarDoAmbiente(estreito.m, estreito.m.spaces[0]);
    expect(r.pecas.some((p) => p.peca.tipo === 'CAMA_CASAL')).toBe(true);
    // 2,25 m internos: cama 1,40 + 0,60 de uso de um lado + armário 0,60 não fecham com 0,90 de passagem.
    expect(r.naoCouberam.length > 0 || !r.circulacao.ok90).toBe(true);
    const coz = comodo('Cozinha', 3000, 3000, true, false);
    const rc = mobiliarDoAmbiente(coz.m, coz.m.spaces[0]);
    expect(rc.pecas.map((p) => p.peca.tipo)).toEqual(expect.arrayContaining(['BANCADA', 'GELADEIRA', 'FOGAO']));
    const banho = comodo('Banho', 1600, 2600, true, false);
    const rb = mobiliarDoAmbiente(banho.m, banho.m.spaces[0]);
    expect(rb.pecas.map((p) => p.peca.tipo)).toEqual(expect.arrayContaining(['BOX', 'VASO', 'LAVATORIO']));
    const anon = comodo('', 3000, 3000);
    expect(mobiliarDoAmbiente(anon.m, anon.m.spaces[0]).pecas).toEqual([]);
    // Sem porta: mede do centro e avisa.
    const semPorta = comodo('Sala', 4000, 4000, false, false);
    expect(mobiliarDoAmbiente(semPorta.m, semPorta.m.spaces[0]).circulacao.semPorta).toBe(true);
    // Resumo do nível.
    const lista = mobiliarNivel(coz.m, null);
    const res = resumirMobiliario(lista);
    expect(res).toMatchObject({ ambientes: 1, comKit: 1, pecas: 3, naoCouberam: 0 });
    expect(Object.keys(KIT_POR_USO)).toEqual(expect.arrayContaining(['DORMITORIO', 'SALA', 'COZINHA', 'BANHEIRO']));
  });
});

describe('aceitar o mobiliário COM os pontos das louças (casa automática F7, 15/10/2026)', () => {
  it('banheiro 2,20 × 2,40: as louças aceitas lançam a água e o esgoto delas, sugeridos, no mesmo lote', () => {
    const { m } = comodo('Banheiro', 2200, 2400);
    const t = m.levels[0].id;
    const lista = mobiliarNivel(m, t);
    const soPecas = comandosDeMobiliario(lista, t, m);
    const comPontos = comandosDeMobiliarioComPontos(lista, t, m);
    // antes: só as peças (a louça sem ponto); agora, as peças e os pontos
    expect(soPecas.every((c) => c.type === 'AddComponente')).toBe(true);
    const pontos = comPontos.filter((c) => c.type === 'AddTerminal');
    expect(comPontos.length).toBe(soPecas.length + pontos.length);
    const depois = applyBatch(m, comPontos).model;
    const tipos = new Set(depois.terminais.map((x) => `${x.tipoHidraulico}:${x.disciplina}`));
    expect(tipos).toContain('VASO_SANITARIO:ESGOTO');
    expect(tipos).toContain('VASO_SANITARIO:AGUA_FRIA');
    expect(tipos).toContain('LAVATORIO:ESGOTO');
    expect(depois.terminais.every((x) => x.sugerida)).toBe(true);
    // aceitar de novo não duplica nem peça nem ponto
    expect(comandosDeMobiliarioComPontos(mobiliarNivel(depois, t), t, depois)).toEqual([]);
  });

  it('o USO da etiqueta vale antes do nome: "Sanitário B" com uso BANHEIRO recebe o kit do banheiro', () => {
    const { m, spaceId } = comodo('Sanitário B', 2200, 2400);
    const t = m.levels[0].id;
    const comUso = applyBatch(m, [{ type: 'NameSpace', spaceId, name: 'Cômodo 7', uso: 'BANHEIRO' } as Command]).model;
    const r = mobiliarDoAmbiente(comUso, comUso.spaces.find((s) => s.levelId === t)!);
    expect(r.uso).toBe('BANHEIRO');
  });
});


describe('F16 da casa automática: louça diante da porta', () => {
  /** Banheiro 2,40 × 2,00 (eixo), porta ao sul, janela ao norte — girado de `graus` em torno da origem, ao mm (como a casa). */
  function banheiro(graus: number): BlueprintModel {
    const c = Math.cos((graus * Math.PI) / 180);
    const s = Math.sin((graus * Math.PI) / 180);
    const g = (x: number, y: number) => point(Math.round(x * c - y * s), Math.round(x * s + y * c));
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const t = m.levels[0].id;
    const wall = (a: ReturnType<typeof g>, b: ReturnType<typeof g>): Command => ({ type: 'AddWall', levelId: t, a, b, thicknessMm: 150, heightMm: 2800 });
    m = applyBatch(m, [wall(g(0, 0), g(2400, 0)), wall(g(2400, 0), g(2400, 2000)), wall(g(2400, 2000), g(0, 2000)), wall(g(0, 2000), g(0, 0))]).model;
    const sul = m.walls[0];
    const norte = m.walls[2];
    return applyBatch(m, [
      { type: 'NameSpace', spaceId: m.spaces[0].id, name: 'Banheiro social' },
      { type: 'AddOpening', wallId: sul.id, kind: 'door', offsetMm: 800, widthMm: 800, heightMm: 2100, sillMm: 0 },
      { type: 'AddOpening', wallId: norte.id, kind: 'window', offsetMm: 900, widthMm: 600, heightMm: 600, sillMm: 1600 },
    ]).model;
  }

  it('cômodo girado 30°: o mesmo mobiliário do cômodo reto, girado — peças a meia parede do eixo, fora do giro da porta, e o componente gira junto', () => {
    const reto = mobiliarDoAmbiente(banheiro(0), banheiro(0).spaces[0]);
    const m30 = banheiro(30);
    const girado = mobiliarDoAmbiente(m30, m30.spaces[0]);
    expect(reto.giro).toBeNull();
    expect(girado.giro?.graus).toBeCloseTo(30, 1);
    expect(girado.pecas.map((p) => p.peca.tipo)).toEqual(reto.pecas.map((p) => p.peca.tipo));
    expect(reto.pecas.length).toBe(3);
    // Equivariância: cada canto da peça do cômodo girado é o canto da peça reta girado de 30° (± o arredondamento ao mm).
    const c = Math.cos(Math.PI / 6);
    const s = Math.sin(Math.PI / 6);
    reto.pecas.forEach((p, i) =>
      p.contorno.forEach((q, j) => {
        const r = girado.pecas[i].contorno[j];
        expect(Math.hypot(r.x - (q.x * c - q.y * s), r.y - (q.x * s + q.y * c)), `${p.peca.tipo} canto ${j}`).toBeLessThan(3);
      }),
    );
    // No cômodo reto: nenhuma peça no giro da porta (800..1600 em x, 0,90 m para dentro) e todas a meia parede do eixo.
    const giro = { x0: 800, y0: 75, x1: 1600, y1: 975 };
    for (const p of reto.pecas) {
      expect(sobrepoe(p.ret, giro), p.peca.tipo).toBe(false);
      expect(Math.min(p.ret.x0, p.ret.y0)).toBeGreaterThanOrEqual(74);
    }
    // O componente: centro girado e rotação 30 (ou 120, encostado em O/L).
    const cmds = comandosDeMobiliario([girado], m30.levels[0].id, m30) as Extract<Command, { type: 'AddComponente' }>[];
    expect(cmds.map((x) => x.rotacaoGraus).every((r) => r === 30 || r === 120)).toBe(true);
  });

  it('cômodo em L (retângulo interno pela grade): a porta no lado que a grade encolhe é vista, e nenhuma louça fica diante dela', () => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const t = m.levels[0].id;
    const wall = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
    // L: 2,40 × 2,14 sem o canto nordeste (0,60 × 0,74). O lado norte (y = 2140) não cai na grade de 100 mm.
    m = applyBatch(m, [wall(0, 0, 2400, 0), wall(2400, 0, 2400, 1400), wall(2400, 1400, 1800, 1400), wall(1800, 1400, 1800, 2140), wall(1800, 2140, 0, 2140), wall(0, 2140, 0, 0)]).model;
    const norte = m.walls.find((w) => w.a.y === 2140 && w.b.y === 2140)!;
    m = applyBatch(m, [
      { type: 'NameSpace', spaceId: m.spaces[0].id, name: 'Banheiro social' },
      { type: 'AddOpening', wallId: norte.id, kind: 'door', offsetMm: 700, widthMm: 800, heightMm: 2100, sillMm: 0 },
    ]).model;
    const r = mobiliarDoAmbiente(m, m.spaces[0]);
    // A porta vai de x = 1100 a 300 (a parede corre de 1800 para 0); o giro desce 0,90 m da face norte.
    expect(r.interno!.y1).toBeLessThan(2140 - 75 - 50);
    const giro = { x0: 300, y0: r.interno!.y1 - 900, x1: 1100, y1: r.interno!.y1 };
    expect(r.pecas.length).toBeGreaterThan(0);
    for (const p of r.pecas) expect(sobrepoe(p.ret, giro), p.peca.tipo).toBe(false);
  });
});
