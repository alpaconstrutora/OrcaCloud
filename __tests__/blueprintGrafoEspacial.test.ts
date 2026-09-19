/**
 * Grafo espacial (19/09/2026, E4.2): adjacência por parede e por porta, saída,
 * percursos pelos centros das portas com a largura útil mínima, circulação %,
 * fachadas com orientação (norte do desenho) e janelas, corredor pela forma,
 * e o Dijkstra com predecessor do grafo de rede.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import {
  azimuteDaDirecao,
  circulacaoDoModelo,
  construirGrafoEspacial,
  descreverFachadas,
  ehCorredor,
  larguraUtilDaAbertura,
  percursoAteASaida,
  percursoEntre,
  pontoCardeal,
  resumirGrafo,
  vizinhosDe,
} from '../utils/blueprintGrafoEspacial';
import { menorCaminhoEntre } from '../utils/blueprintGrafoDeRede';

/**
 * Casa 8 × 6 m: Sala à esquerda (4 × 6), Cozinha (4 × 3) e Dormitório (4 × 3) à
 * direita. Porta de entrada na sala (parede de baixo), sala ↔ cozinha (0,80) e
 * sala ↔ dormitório (0,70, estreita) na parede x = 4000; janela do dormitório
 * na parede da direita.
 */
function casa(): { m: BlueprintModel; t: string; ids: Record<string, string> } {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  m = applyBatch(m, [w(0, 0, 8000, 0), w(8000, 0, 8000, 6000), w(8000, 6000, 0, 6000), w(0, 6000, 0, 0), w(4000, 0, 4000, 6000), w(4000, 3000, 8000, 3000)]).model;
  const sala = m.spaces.find((s) => s.ring.some((p) => p.x === 0))!;
  const coz = m.spaces.find((s) => s.ring.every((p) => p.x >= 4000) && s.ring.every((p) => p.y <= 3000))!;
  const dorm = m.spaces.find((s) => s.ring.every((p) => p.x >= 4000) && s.ring.every((p) => p.y >= 3000))!;
  const baixo = m.walls.find((x) => x.a.y === 0 && x.b.y === 0)!;
  const meio = m.walls.find((x) => x.a.x === 4000 && x.b.x === 4000)!;
  const direita = m.walls.find((x) => x.a.x === 8000 && x.b.x === 8000)!;
  m = applyBatch(m, [
    { type: 'NameSpace', spaceId: sala.id, name: 'Sala', tipoDeAmbiente: 'SALA_DORMITORIO' },
    { type: 'NameSpace', spaceId: coz.id, name: 'Cozinha', tipoDeAmbiente: 'COZINHA_SERVICO' },
    { type: 'NameSpace', spaceId: dorm.id, name: 'Dormitório 1', tipoDeAmbiente: 'SALA_DORMITORIO' },
    { type: 'AddOpening', wallId: baixo.id, kind: 'door', offsetMm: 1000, widthMm: 900, heightMm: 2100, sillMm: 0 },
    { type: 'AddOpening', wallId: meio.id, kind: 'door', offsetMm: 1000, widthMm: 800, heightMm: 2100, sillMm: 0 },
    { type: 'AddOpening', wallId: meio.id, kind: 'door', offsetMm: 4000, widthMm: 700, heightMm: 2100, sillMm: 0 },
    { type: 'AddOpening', wallId: direita.id, kind: 'window', offsetMm: 4000, widthMm: 1200, heightMm: 1200, sillMm: 1000 },
  ]).model;
  const sala2 = m.spaces.find((s) => s.name === 'Sala')!;
  const coz2 = m.spaces.find((s) => s.name === 'Cozinha')!;
  const dorm2 = m.spaces.find((s) => s.name === 'Dormitório 1')!;
  return { m, t, ids: { sala: sala2.id, coz: coz2.id, dorm: dorm2.id, baixo: baixo.id, meio: meio.id, direita: direita.id } };
}

describe('grafo espacial', () => {
  it('adjacência por parede e por porta, saída, vizinhos, fachadas com orientação e janelas, largura útil', () => {
    const { m, t, ids } = casa();
    const g = construirGrafoEspacial(m, t);
    expect(g.nos.map((n) => n.rotulo).sort()).toEqual(['Cozinha', 'Dormitório 1', 'Sala']);
    expect(g.nos.map((n) => n.uso).sort()).toEqual(['COZINHA', 'DORMITORIO', 'SALA']);
    // Paredes divididas: sala|coz (3 m), sala|dorm (3 m), coz|dorm (4 m).
    const paredes = g.arestas.filter((a) => a.tipo === 'PAREDE');
    expect(paredes.map((a) => a.comprimentoMm).sort((x, y) => x - y)).toEqual([3000, 3000, 4000]);
    // Portas: entrada (sala ↔ exterior), sala ↔ coz, sala ↔ dorm.
    const portas = g.arestas.filter((a) => a.tipo === 'PORTA');
    expect(portas).toHaveLength(3);
    expect(g.saidas).toHaveLength(1);
    expect(g.saidas[0]).toMatchObject({ de: ids.sala, para: null, comprimentoMm: 900, larguraUtilMm: 900, ponto: { x: 1450, y: 0 } });
    const salaDorm = portas.find((p) => (p.de === ids.sala && p.para === ids.dorm) || (p.de === ids.dorm && p.para === ids.sala))!;
    expect(salaDorm.larguraUtilMm).toBe(700);
    expect(larguraUtilDaAbertura({ kind: 'passage', widthMm: 700 })).toBe(700);
    // Vizinhos da sala: cozinha (parede + porta), dormitório (parede + porta) e o exterior (porta).
    const viz = vizinhosDe(g, ids.sala);
    expect(viz.map((v) => [v.no?.rotulo ?? 'exterior', v.arestas.map((a) => a.tipo).sort().join('+')])).toEqual([
      ['Cozinha', 'PAREDE+PORTA'],
      ['Dormitório 1', 'PAREDE+PORTA'],
      ['exterior', 'PORTA'],
    ]);
    // Cozinha e dormitório dividem parede mas não porta; o exterior não aparece para quem não tem porta para fora.
    expect(vizinhosDe(g, ids.coz).map((v) => [v.no?.rotulo ?? 'exterior', v.arestas.map((a) => a.tipo).sort().join('+')])).toEqual([
      ['Dormitório 1', 'PAREDE'],
      ['Sala', 'PAREDE+PORTA'],
    ]);
    // Fachadas (sem georreferência: +Y é o norte). Dormitório: leste (janela) e norte.
    const dorm = g.nos.find((n) => n.spaceId === ids.dorm)!;
    expect(dorm.fachadas.map((f) => [f.orientacao, f.comprimentoMm, f.aberturas.length]).sort()).toEqual([
      ['L', 3000, 1],
      ['N', 4000, 0],
    ]);
    expect(dorm.fachadas.find((f) => f.orientacao === 'L')!.aberturas[0]).toMatchObject({ kind: 'window', widthMm: 1200 });
    expect(descreverFachadas(dorm.fachadas)).toBe('N 4,00 m · L 3,00 m (1 jan.)');
    const sala = g.nos.find((n) => n.spaceId === ids.sala)!;
    expect(sala.fachadas.map((f) => f.orientacao).sort()).toEqual(['N', 'O', 'S']);
    expect(sala.fachadas.find((f) => f.orientacao === 'S')!.aberturas.map((a) => a.kind)).toEqual(['door']);
    expect(sala.portas).toBe(3);
    expect(g.nos.every((n) => !n.ilhado)).toBe(true);
    expect(sala.centro).toEqual({ x: 2000, y: 3000 });
  });

  it('percursos pelos centros das portas: cozinha → dormitório passa pela sala; até a saída; ilhado sem caminho; resumo', () => {
    const { m, t, ids } = casa();
    const g = construirGrafoEspacial(m, t);
    // Cozinha (6000,1500) → porta (4000,1400) → porta (4000,4350) → dormitório (6000,4500).
    const p = percursoEntre(g, ids.coz, ids.dorm)!;
    expect(p.ambientes).toEqual([ids.coz, ids.sala, ids.dorm]);
    expect(p.portas).toHaveLength(2);
    expect(p.mm).toBe(Math.round(Math.hypot(2000, 100)) + Math.round(2950) + Math.round(Math.hypot(2000, 150)));
    expect(p.larguraUtilMinMm).toBe(700);
    // Até a saída: dormitório → porta estreita → porta de entrada (1450, 0) → exterior.
    const s = percursoAteASaida(g, ids.dorm)!;
    expect(s.ambientes).toEqual([ids.dorm, ids.sala, null]);
    expect(s.mm).toBe(Math.round(Math.hypot(2000, 150)) + Math.round(Math.hypot(2550, 4350)));
    expect(percursoAteASaida(g, ids.sala)!.mm).toBe(Math.round(Math.hypot(550, 3000)));
    expect(percursoEntre(g, ids.sala, ids.sala)).toMatchObject({ mm: 0, portas: [] });
    // Resumo: 3 portas, 1 saída, 1 porta estreita (0,70 < 0,80), percurso mais longo é do dormitório.
    const r = resumirGrafo(g);
    expect(r).toMatchObject({ ambientes: 3, portas: 3, passagens: 0, paredesDivididas: 3, saidas: 1, circulacaoPct: 0 });
    expect(r.ilhados).toEqual([]);
    expect(r.semFachada).toEqual([]);
    expect(r.portasEstreitas.map((a) => a.comprimentoMm)).toEqual([700]);
    expect(r.percursoMaisLongo!.no.spaceId).toBe(ids.dorm);
    // Fecha a porta do dormitório (apaga): ele fica ilhado e sem percurso.
    const salaDorm = g.arestas.find((a) => a.tipo === 'PORTA' && a.comprimentoMm === 700)!;
    const semPorta = applyCommand(m, { type: 'DeleteOpening', openingId: salaDorm.openingId! }).model;
    const g2 = construirGrafoEspacial(semPorta, t);
    expect(g2.nos.find((n) => n.spaceId === ids.dorm)!.ilhado).toBe(true);
    expect(percursoAteASaida(g2, ids.dorm)).toBeNull();
    expect(resumirGrafo(g2).ilhados.map((n) => n.rotulo)).toEqual(['Dormitório 1']);
  });

  it('circulação pelo nome e pela forma; orientação com o norte girado; Dijkstra com predecessor', () => {
    const { m, t, ids } = casa();
    // "Hall" é circulação pelo nome: 24 de 48 m² → 50 %.
    const comHall = applyCommand(m, { type: 'NameSpace', spaceId: ids.sala, name: 'Hall' }).model;
    const g = construirGrafoEspacial(comHall, t);
    expect(g.nos.find((n) => n.spaceId === ids.sala)!.circulacao).toBe(true);
    expect(g.circulacaoPct).toBe(50);
    expect(circulacaoDoModelo(comHall)).toMatchObject({ pct: 50, areaUtilMm2: 48_000_000 });
    // Corredor pela forma: 1,2 × 5 m sem nome. A sala 4 × 6 não é.
    const corredor = { ring: [point(0, 0), point(1200, 0), point(1200, 5000), point(0, 5000)], holes: [] } as unknown as Parameters<typeof ehCorredor>[0];
    expect(ehCorredor(corredor)).toBe(true);
    expect(ehCorredor(m.spaces.find((s) => s.id === ids.sala)!)).toBe(false);
    // Norte girado 90° (o +Y do desenho aponta para oeste; o norte é +X): a parede da direita vira norte.
    const girado: BlueprintModel = { ...m, georreferencia: { latitude: -23.5, longitude: -46.6, rotacaoNorteDeg: 90 } };
    const gg = construirGrafoEspacial(girado, t);
    expect(gg.norteGraus).toBe(90);
    expect(gg.nos.find((n) => n.spaceId === ids.dorm)!.fachadas.map((f) => f.orientacao).sort()).toEqual(['N', 'O']);
    expect(azimuteDaDirecao({ x: 1, y: 0 }, 90)).toBe(0);
    expect(azimuteDaDirecao({ x: 0, y: 1 }, null)).toBe(0);
    expect(azimuteDaDirecao({ x: 1, y: 0 }, null)).toBe(90);
    expect(azimuteDaDirecao({ x: 0, y: -1 }, 0)).toBe(180);
    expect(azimuteDaDirecao({ x: 1, y: 1 }, 0)).toBe(45);
    expect(pontoCardeal(44)).toBe('NE');
    expect(pontoCardeal(350)).toBe('N');
    expect(pontoCardeal(210)).toBe('SO');
    // Dijkstra com predecessor: A→B 10, B→C 10, A→C 25 → A→C vai por B (20).
    const ar = [
      { ref: { novo: 0 }, de: 'A', para: 'B', mm: 10 },
      { ref: { novo: 1 }, de: 'B', para: 'C', mm: 10 },
      { ref: { novo: 2 }, de: 'A', para: 'C', mm: 25 },
    ];
    expect(menorCaminhoEntre('A', 'C', ar)).toEqual({ mm: 20, nos: ['A', 'B', 'C'], arestas: [0, 1] });
    expect(menorCaminhoEntre('A', 'Z', ar)).toBeNull();
    expect(menorCaminhoEntre('A', 'A', ar)).toEqual({ mm: 0, nos: ['A'], arestas: [] });
  });
});
