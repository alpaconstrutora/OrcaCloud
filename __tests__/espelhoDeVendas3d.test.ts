/**
 * ESPELHO DE VENDAS 3D (09/11/2026): a torre do Empreendimento em prismas — um por unidade, empilhados por andar e
 * com o status da venda — para os Portais do Corretor e do Investidor. O contorno é o do Bloco da Planta quando a
 * torre o tem; sem ele, um retângulo esquemático tirado do cadastro. Puro.
 * Plano: docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 */
import { describe, expect, it } from 'vitest';
import { HIPOTESES_PADRAO_DO_ESPELHO, contagemPorStatus, montarCenaDoEspelho, type TorreDoEspelho } from '../utils/espelhoDeVendas3d';
import { arranjarAndar, arrumarUnidades } from '../utils/blueprintUnidadesNoPavimento';
import type { EmpreendimentoFloor } from '../types/empreendimento';

type Ponto = { x: number; y: number };
const area = (anel: Ponto[]) => Math.abs(anel.reduce((s, p, i) => { const q = anel[(i + 1) % anel.length]; return s + p.x * q.y - q.x * p.y; }, 0) / 2) / 1e6;
const caixa = (anel: Ponto[]) => ({ minX: Math.min(...anel.map((p) => p.x)), maxX: Math.max(...anel.map((p) => p.x)), minY: Math.min(...anel.map((p) => p.y)), maxY: Math.max(...anel.map((p) => p.y)) });

/** `n` unidades no andar, numeradas "<andar><k>" (101, 102…), todas com a mesma área. */
const andar = (torre: string, n: number, quantas: number, m2: number | null = 80, status = 'DISPONIVEL') =>
  Array.from({ length: quantas }, (_, k) => ({
    id: `${torre}-${n}-${k + 1}`,
    name: `${n}0${k + 1}`,
    floor: n,
    floor_tipo: null,
    private_area: m2 ?? undefined,
    status: status as never,
    sort_order: k,
  }));

/** Torre de 3 andares (térreo + 2), 4 unidades de 80 m² por andar: 320 m² por andar. */
const torre = (id: string, extra: Partial<TorreDoEspelho> = {}): TorreDoEspelho => ({
  id,
  name: `Torre ${id}`,
  sort_order: 0,
  units: [...andar(id, 0, 4), ...andar(id, 1, 4), ...andar(id, 2, 4)],
  ...extra,
});

const pav = (extra: Partial<EmpreendimentoFloor>): EmpreendimentoFloor => ({
  id: 'f',
  tower_id: 'A',
  name: '',
  tipo: 'TIPO',
  floor_number: 0,
  repeat_count: 1,
  sort_order: 0,
  created_at: '',
  updated_at: '',
  ...extra,
});

/** Torre A do Garden: 11 × 16 m, fora da origem (como no desenho). */
const CONTORNO = [{ x: 50000, y: 20000 }, { x: 61000, y: 20000 }, { x: 61000, y: 36000 }, { x: 50000, y: 36000 }];

describe('montarCenaDoEspelho — os prismas', () => {
  it('um prisma por unidade, com a torre, o andar e o rótulo dela', () => {
    const cena = montarCenaDoEspelho({ torres: [torre('A')] });
    const deUnidade = cena.prismas.filter((p) => p.unitId);
    expect(deUnidade).toHaveLength(12);
    expect(new Set(deUnidade.map((p) => p.unitId)).size).toBe(12);
    const p = deUnidade.find((x) => x.unitId === 'A-1-2')!;
    expect(p).toMatchObject({ torreId: 'A', torre: 'Torre A', andar: 1, rotulo: '102', abaixoDoSolo: false });
    expect(cena.torres).toEqual([expect.objectContaining({ torreId: 'A', origem: 'ESQUEMATICA', unidades: 12, pisos: 3 })]);
  });

  it('as fatias de um andar somam o contorno e nenhuma passa da metade (não se sobrepõem)', () => {
    const cena = montarCenaDoEspelho({ torres: [torre('A')] });
    const doAndar = cena.prismas.filter((p) => p.andar === 1);
    const areas = doAndar.map((p) => area(p.anel));
    expect(areas.reduce((s, a) => s + a, 0)).toBeCloseTo(320, 0);
    for (const a of areas) expect(a).toBeLessThan(320 / 2);
  });

  it('térreo é o andar 0, na elevação 0; cada andar começa onde o de baixo termina', () => {
    const cena = montarCenaDoEspelho({ torres: [torre('A', { pe_direito_padrao_m: 2.8 })] });
    const faixa = (n: number) => { const p = cena.prismas.find((x) => x.andar === n)!; return [p.baseMm, p.topoMm]; };
    expect(faixa(0)).toEqual([0, 2800]);
    expect(faixa(1)).toEqual([2800, 5600]);
    expect(faixa(2)).toEqual([5600, 8400]);
  });

  it('sem pé-direito no cadastro, o piso tem os 3,00 m com que o Empreendimento calcula a elevação', () => {
    const cena = montarCenaDoEspelho({ torres: [torre('A')] });
    expect(cena.prismas.find((p) => p.andar === 1)).toMatchObject({ baseMm: 3000, topoMm: 6000 });
    expect(cena.prismas.find((p) => p.andar === 2)).toMatchObject({ baseMm: 6000, topoMm: 9000 });
  });

  it('elevação digitada no pavimento vale no lugar do cálculo', () => {
    const pavimentos = [
      pav({ id: 'f0', floor_number: 0, tipo: 'TERREO', name: 'Térreo', pe_direito_m: 3 }),
      pav({ id: 'f1', floor_number: 1, repeat_count: 2, name: 'Tipo', pe_direito_m: 3, elevacao_m: 4.5, sort_order: 1 }),
    ];
    const cena = montarCenaDoEspelho({ torres: [torre('A')], pavimentosPorTorre: new Map([['A', pavimentos]]) });
    expect(cena.prismas.find((p) => p.andar === 0)).toMatchObject({ baseMm: 0, topoMm: 4500, nomeDoAndar: 'Térreo' });
    expect(cena.prismas.find((p) => p.andar === 1)).toMatchObject({ baseMm: 4500, topoMm: 7500, nomeDoAndar: 'Tipo 1' });
  });

  it('subsolo fica abaixo do solo, e andar sem unidade vira um prisma neutro do contorno inteiro', () => {
    const t = torre('A', { units: [...andar('A', -1, 1, null), ...andar('A', 1, 4)] });
    const cena = montarCenaDoEspelho({ torres: [t] });
    expect(cena.prismas.find((p) => p.andar === -1)).toMatchObject({ baseMm: -3000, topoMm: 0, abaixoDoSolo: true });
    const terreo = cena.prismas.filter((p) => p.andar === 0);
    expect(terreo).toHaveLength(1);
    expect(terreo[0]).toMatchObject({ unitId: null, rotulo: null, status: null });
    expect(area(terreo[0].anel)).toBeCloseTo(320, 0);
  });
});

describe('montarCenaDoEspelho — o contorno', () => {
  it('sem contorno: retângulo esquemático com a área do maior andar, na proporção da hipótese', () => {
    const cena = montarCenaDoEspelho({ torres: [torre('A')] });
    const c = cena.torres[0].caixa;
    const [larg, prof] = [c.maxX - c.minX, c.maxY - c.minY];
    expect((larg * prof) / 1e6).toBeCloseTo(320, 0);
    expect(larg / prof).toBeCloseTo(HIPOTESES_PADRAO_DO_ESPELHO.proporcaoDoRetangulo, 2);
  });

  it('sem área privativa em nenhuma unidade: a área padrão da hipótese por unidade', () => {
    const t = torre('A', { units: andar('A', 0, 2, null) });
    const c = montarCenaDoEspelho({ torres: [t], hipoteses: { areaPadraoDaUnidadeM2: 50 } }).torres[0].caixa;
    expect(((c.maxX - c.minX) * (c.maxY - c.minY)) / 1e6).toBeCloseTo(100, 0);
  });

  it('com contorno da Planta: as fatias são as mesmas do editor (arrumarUnidades + arranjarAndar)', () => {
    const t = torre('A', { contorno: { anel: CONTORNO, frenteParaFora: { x: 0, y: -1 }, rotacaoNorteDeg: 0 } });
    const cena = montarCenaDoEspelho({ torres: [t] });
    expect(cena.torres[0].origem).toBe('PLANTA');
    const unidades = andar('A', 1, 4).map((u) => ({ nome: u.name, posicao: null, orientacao: null, vaga: null }));
    const arrumadas = arrumarUnidades(unidades, 'AUTOMATICA', { frenteParaFora: { x: 0, y: -1 }, rotacaoNorteDeg: 0 });
    const esperado = arranjarAndar(CONTORNO, [80, 80, 80, 80], arrumadas).fatias;
    const doAndar = cena.prismas.filter((p) => p.andar === 1);
    expect(doAndar.map((p) => p.anel)).toEqual(esperado);
    expect(doAndar.map((p) => p.rotulo)).toEqual(arrumadas.unidades.map((u) => u.nome));
  });

  it('todas as torres com contorno: valem as coordenadas da Planta', () => {
    const outro = CONTORNO.map((p) => ({ x: p.x + 30000, y: p.y }));
    const cena = montarCenaDoEspelho({ torres: [torre('A', { contorno: { anel: CONTORNO } }), torre('B', { sort_order: 1, contorno: { anel: outro } })] });
    expect(cena.torres.map((t) => t.caixa.minX)).toEqual([50000, 80000]);
    expect(cena.torres[0].caixa.minY).toBe(20000);
  });

  it('alguma torre sem contorno: a da Planta fica onde o desenho a pôs; a esquemática vai ao lado, sem sobrepor', () => {
    const cena = montarCenaDoEspelho({ torres: [torre('A', { contorno: { anel: CONTORNO } }), torre('B', { sort_order: 1 })] });
    const [a, b] = cena.torres;
    expect(a.origem).toBe('PLANTA');
    expect(b.origem).toBe('ESQUEMATICA');
    expect(a.caixa).toMatchObject({ minX: 50000, minY: 20000, maxX: 61000, maxY: 36000 });
    expect(b.caixa.minX).toBe(61000 + HIPOTESES_PADRAO_DO_ESPELHO.afastamentoEntreTorresMm);
    expect(b.caixa.minY).toBe(20000);
    // Os prismas acompanham a torre.
    const xsDeB = cena.prismas.filter((p) => p.torreId === 'B').map((p) => caixa(p.anel).minX);
    expect(Math.min(...xsDeB)).toBe(b.caixa.minX);
  });

  // 10/11/2026, Portal do Investidor do Garden Cambuhy: a obra trazia Torre A e Torre B com o contorno da Planta
  // (encostadas, uma atrás da outra) e a "Lote" de OUTRO empreendimento ligado à mesma obra, sem contorno. Bastava
  // ela para TODAS irem lado a lado — as duas torres do projeto saíam separadas, e o desenho não batia com a Planta.
  it('duas da Planta e uma esquemática: as da Planta mantêm a posição uma em relação à outra; a esquemática fica fora delas', () => {
    const anelA = [{ x: 2281, y: 6342 }, { x: 15781, y: 6342 }, { x: 15781, y: 32342 }, { x: 2281, y: 32342 }];
    const anelB = anelA.map((p) => ({ x: p.x, y: p.y + 26000 }));
    const cena = montarCenaDoEspelho({
      torres: [torre('L', { name: 'Lote', sort_order: -1 }), torre('A', { contorno: { anel: anelA } }), torre('B', { sort_order: 1, contorno: { anel: anelB } })],
    });
    const porId = Object.fromEntries(cena.torres.map((t) => [t.torreId, t]));
    expect(porId.A.caixa).toMatchObject({ minX: 2281, minY: 6342, maxX: 15781, maxY: 32342 });
    expect(porId.B.caixa).toMatchObject({ minX: 2281, minY: 32342, maxX: 15781, maxY: 58342 });
    expect(porId.L.origem).toBe('ESQUEMATICA');
    // Fora da caixa do grupo da Planta, à direita, com o afastamento da hipótese.
    expect(porId.L.caixa.minX).toBe(15781 + HIPOTESES_PADRAO_DO_ESPELHO.afastamentoEntreTorresMm);
    expect(porId.L.caixa.minY).toBe(6342);
  });

  it('a distância declarada entre as duas torres vale no lugar do afastamento padrão', () => {
    const cena = montarCenaDoEspelho({
      torres: [torre('A'), torre('B', { sort_order: 1 })],
      distancias: [{ torre_a: 'A', torre_b: 'B', distancia_m: 25 }],
    });
    const [a, b] = cena.torres;
    expect(b.caixa.minX - a.caixa.maxX).toBe(25000);
  });

  it('contorno inválido (menos de 3 pontos) cai no esquemático, com aviso', () => {
    const cena = montarCenaDoEspelho({ torres: [torre('A', { contorno: { anel: CONTORNO.slice(0, 2) } })] });
    expect(cena.torres[0].origem).toBe('ESQUEMATICA');
    expect(cena.avisos.join(' ')).toMatch(/contorno/i);
  });
});

describe('montarCenaDoEspelho — o status', () => {
  it('sem mapa, o status é o do cadastro pela regra única da venda', () => {
    const t = torre('A', { units: [...andar('A', 0, 1, 80, 'VENDIDO'), ...andar('A', 1, 1, 80, 'RESERVADO'), ...andar('A', 2, 1, 80, 'PERMUTADO'), ...andar('A', 3, 1, 80, 'DISPONIVEL')] });
    const cena = montarCenaDoEspelho({ torres: [t] });
    expect(cena.prismas.map((p) => p.status)).toEqual(['sold', 'reserved', 'exchanged', 'available']);
  });

  it('o mapa por unidade vence o cadastro (é a negociação que diz)', () => {
    const cena = montarCenaDoEspelho({ torres: [torre('A')], statusPorUnidade: new Map([['A-1-2', 'sold'], ['A-2-1', 'reserved']]) });
    expect(cena.prismas.find((p) => p.unitId === 'A-1-2')!.status).toBe('sold');
    expect(cena.prismas.find((p) => p.unitId === 'A-2-1')!.status).toBe('reserved');
    expect(contagemPorStatus(cena.prismas)).toEqual({ sold: 1, reserved: 1, available: 10, exchanged: 0, other: 0 });
  });
});

describe('montarCenaDoEspelho — o que fica de fora', () => {
  it('unidade oculta ocupa o seu lugar na torre, mas sai neutra: sem id, sem nome, sem status', () => {
    const cena = montarCenaDoEspelho({ torres: [torre('A')], unidadesOcultas: new Set(['A-1-2']) });
    const doAndar = cena.prismas.filter((p) => p.andar === 1);
    expect(doAndar).toHaveLength(4);
    expect(doAndar.filter((p) => p.unitId).map((p) => p.unitId).sort()).toEqual(['A-1-1', 'A-1-3', 'A-1-4']);
    expect(doAndar.find((p) => !p.unitId)).toMatchObject({ rotulo: null, status: null });
    // As outras não se alargam para o lugar dela.
    for (const p of doAndar) expect(area(p.anel)).toBeCloseTo(80, 0);
    expect(contagemPorStatus(cena.prismas).available).toBe(11);
    expect(cena.torres[0].unidades).toBe(11);
  });

  it('quadra de loteamento não é torre', () => {
    const cena = montarCenaDoEspelho({ torres: [torre('A'), torre('Q', { blueprint_quadra_uid: 'q1' })] });
    expect(cena.torres.map((t) => t.torreId)).toEqual(['A']);
  });

  it('torre sem pavimentos nem unidades não entra na cena, e o aviso diz por quê', () => {
    const cena = montarCenaDoEspelho({ torres: [torre('A', { units: [] })] });
    expect(cena.prismas).toEqual([]);
    expect(cena.torres).toEqual([]);
    expect(cena.avisos.join(' ')).toMatch(/sem pavimentos/);
  });

  it('a caixa da cena envolve todas as torres, do subsolo ao topo', () => {
    const t = torre('A', { units: [...andar('A', -1, 1), ...andar('A', 0, 4)] });
    const cena = montarCenaDoEspelho({ torres: [t, torre('B', { sort_order: 1 })] });
    expect(cena.caixa).toMatchObject({ minX: 0, baseMm: -3000, topoMm: 9000 });
    expect(cena.caixa.maxX).toBe(Math.max(...cena.torres.map((x) => x.caixa.maxX)));
  });
});
