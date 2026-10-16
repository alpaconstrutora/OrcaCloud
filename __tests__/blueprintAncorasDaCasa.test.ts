/**
 * Casa automática F6 (15/10/2026): as peças-âncora (`comandosDasAncoras`) — caixa d'água, aquecedor, caixa de
 * gordura e vagas. Plano: `docs/planos/2026-10-14-casa-automatica.md`.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, pointInPolygon, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { comandosDasAncoras, HIPOTESES_DAS_ANCORAS_PADRAO, type ContextoDasAncoras } from '../utils/blueprintAncorasDaCasa';

/**
 * Casinha de 9,00 × 3,00 m (eixos) com quatro ambientes lado a lado, todos com as fachadas da frente (y = 0) e
 * dos fundos (y = 3000): Cozinha 0–3, Área de serviço 3–5, Banheiro 5–7, Dormitório 7–9 m.
 */
function casinha(): { m: BlueprintModel; L: string } {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const L = base.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: L, a: point(ax, ay), b: point(bx, by), thicknessMm: 200, heightMm: 2800 });
  let m = applyBatch(base, [w(0, 0, 9000, 0), w(9000, 0, 9000, 3000), w(9000, 3000, 0, 3000), w(0, 3000, 0, 0), w(3000, 0, 3000, 3000), w(5000, 0, 5000, 3000), w(7000, 0, 7000, 3000)]).model;
  const nome = (x: number, n: string): Command => ({ type: 'NameSpace', spaceId: m.spaces.find((s) => pointInPolygon(s.ring, point(x, 1500)))!.id, name: n });
  m = applyBatch(m, [nome(1500, 'Cozinha'), nome(4000, 'Área de serviço'), nome(6000, 'Banheiro'), nome(8000, 'Dormitório')]).model;
  return { m, L };
}

const ctxDe = (L: string, mudanca: Partial<ContextoDasAncoras> = {}): ContextoDasAncoras => ({
  levelId: L,
  padrao: 'R1-N',
  topoMm: 2900,
  espessuraExternaMm: 200,
  vagas: 0,
  garagemCoberta: true,
  quadro: { ex: { x: 1, y: 0 }, ey: { x: 0, y: 1 } },
  retanguloLocal: { x0: 0, y0: 0, x1: 9000, y1: 3000 },
  anelDoLote: [point(-5000, -5000), point(14000, -5000), point(14000, 8000), point(-5000, 8000)],
  ...mudanca,
});

describe('comandosDasAncoras', () => {
  it("caixa d'água sobre o banheiro, acima da laje, com o volume da reservação (2 pessoas × 200 L)", () => {
    const { m, L } = casinha();
    const r = comandosDasAncoras(m, ctxDe(L));
    const depois = applyBatch(m, r.comandos).model;
    const caixa = depois.terminais.find((t) => t.tipoHidraulico === 'RESERVATORIO')!;
    expect(caixa.disciplina).toBe('AGUA_FRIA');
    expect(caixa.papelReservatorio).toBe('SUPERIOR');
    expect(caixa.cotaMm).toBe(2900 + HIPOTESES_DAS_ANCORAS_PADRAO.caixaAcimaDaLajeMm);
    expect(pointInPolygon(depois.spaces.find((s) => s.name === 'Banheiro')!.ring, caixa.at)).toBe(true);
    expect(r.resumo.caixaDaguaL).toBeGreaterThanOrEqual(400); // 1 dormitório × 2 pessoas × 200 L/dia, comercial acima
    expect(caixa.sugerida).toBe(true);
  });

  it('aquecedor (R1-N): fria (consumo) e quente (origem) lado a lado, a 15 cm, na parede externa do serviço', () => {
    // F14b (16/10/2026): no MESMO ponto, as duas descidas convergiam e se cruzavam a 1,60 m; agora como o misturador.
    const { m, L } = casinha();
    const r = comandosDasAncoras(m, ctxDe(L));
    const depois = applyBatch(m, r.comandos).model;
    const aq = depois.terminais.filter((t) => t.tipoHidraulico === 'AQUECEDOR');
    expect(aq.map((t) => t.disciplina).sort()).toEqual(['AGUA_FRIA', 'AGUA_QUENTE']);
    expect(Math.hypot(aq[0].at.x - aq[1].at.x, aq[0].at.y - aq[1].at.y)).toBe(HIPOTESES_DAS_ANCORAS_PADRAO.aquecedorFriaQuenteMm);
    for (const t of aq) {
      expect(pointInPolygon(depois.spaces.find((s) => s.name === 'Área de serviço')!.ring, t.at)).toBe(true);
      // encostado numa fachada: a menos de meia parede + 150 mm + folga de y = 0 ou y = 3000
      expect(Math.min(Math.abs(t.at.y - 0), Math.abs(t.at.y - 3000))).toBeLessThanOrEqual(100 + 150 + 1);
    }
    expect(r.resumo.aquecedor).toBe(true);
  });

  it('aquecedor fora da janela: com o vão no meio da fachada, vai para o lado dele (a folga cai até caber) e diz a quanto ficou', () => {
    // F14b: no meio do lado, o aquecedor caía diante da janela da área de serviço e a água descia pelo vão.
    const { m: m0, L } = casinha();
    const frente = m0.walls.find((w) => w.a.y === 0 && w.b.y === 0)!;
    const fundos = m0.walls.find((w) => w.a.y === 3000 && w.b.y === 3000)!;
    const janela = (wallId: string, offsetMm: number): Command => ({ type: 'AddOpening', wallId, kind: 'window', offsetMm, widthMm: 800, heightMm: 1200, sillMm: 1000 });
    const m = applyBatch(m0, [janela(frente.id, 3600), janela(fundos.id, 4600)]).model;
    const r = comandosDasAncoras(m, ctxDe(L));
    const aq = applyBatch(m, r.comandos).model.terminais.filter((t) => t.tipoHidraulico === 'AQUECEDOR');
    expect(aq).toHaveLength(2);
    // As duas janelas vão de x = 3,60 a 4,40 m: nenhum dos dois terminais diante delas.
    for (const t of aq) expect(t.at.x <= 3600 - 150 || t.at.x >= 4400 + 150).toBe(true);
    expect(r.pendencias.join(' ')).toMatch(/Aquecedor na Área de serviço: a 0,20 m do vão \(pedido: 0,40 m\)/);
  });

  it('R1-B: chuveiro elétrico — sem aquecedor, e dito', () => {
    const { m, L } = casinha();
    const r = comandosDasAncoras(m, ctxDe(L, { padrao: 'R1-B' }));
    expect(r.comandos.some((c) => c.type === 'AddTerminal' && c.tipoHidraulico === 'AQUECEDOR')).toBe(false);
    expect(r.resumo.chuveiroEletrico).toBe(true);
    expect(r.notas.join(' ')).toMatch(/chuveiro elétrico/);
  });

  it('caixa de gordura do lado de FORA da cozinha, no lote, na cota da ficha', () => {
    const { m, L } = casinha();
    const r = comandosDasAncoras(m, ctxDe(L));
    const depois = applyBatch(m, r.comandos).model;
    const cg = depois.terminais.find((t) => t.tipoHidraulico === 'CAIXA_GORDURA')!;
    expect(cg.disciplina).toBe('ESGOTO');
    expect(cg.cotaMm).toBe(-400);
    expect(depois.spaces.some((s) => pointInPolygon(s.ring, cg.at))).toBe(false);
    expect(cg.at.x).toBeGreaterThan(0);
    expect(cg.at.x).toBeLessThan(3000);
  });

  it('caixa de gordura fora do lote: não põe, e diz', () => {
    const { m, L } = casinha();
    const r = comandosDasAncoras(m, ctxDe(L, { anelDoLote: [point(-100, -100), point(9100, -100), point(9100, 3100), point(-100, 3100)] }));
    expect(r.resumo.caixaDeGordura).toBe(false);
    expect(r.pendencias.join(' ')).toMatch(/fora do lote/);
  });

  it('o que já está desenhado fica: não duplica caixa, aquecedor nem caixa de gordura', () => {
    const { m, L } = casinha();
    const uma = applyBatch(m, comandosDasAncoras(m, ctxDe(L)).comandos).model;
    const deNovo = comandosDasAncoras(uma, ctxDe(L));
    expect(deNovo.comandos.filter((c) => c.type === 'AddTerminal')).toEqual([]);
    expect(deNovo.notas.join(' ')).toMatch(/já desenhada/);
  });

  it('vagas descobertas no recuo de frente: cabem se o recuo tem o comprimento da vaga', () => {
    const { m, L } = casinha();
    // casa em y 6–9 m, lote começando em y = 0: 6 m de recuo de frente − meia parede
    const desloc = applyBatch(m, []).model;
    const r = comandosDasAncoras(desloc, ctxDe(L, { vagas: 2, garagemCoberta: false, retanguloLocal: { x0: 0, y0: 6000, x1: 9000, y1: 9000 }, anelDoLote: [point(0, 0), point(9000, 0), point(9000, 30000), point(0, 30000)] }));
    expect(r.resumo.vagas).toBe(2);
    const raso = comandosDasAncoras(desloc, ctxDe(L, { vagas: 2, garagemCoberta: false, retanguloLocal: { x0: 0, y0: 3000, x1: 9000, y1: 6000 }, anelDoLote: [point(0, 0), point(9000, 0), point(9000, 30000), point(0, 30000)] }));
    expect(raso.resumo.vagas).toBe(0);
    expect(raso.pendencias.join(' ')).toMatch(/não couberam/);
  });
});

describe('F17 da casa automática: o aquecedor não fica diante da janela', () => {
  it('fachadas do serviço tomadas por janela: vai para uma parede INTERNA dele (fora do vão), dito — não diante da janela', () => {
    const { m: m0, L } = casinha();
    // Sem cozinha (o aquecedor iria para ela): só a área de serviço é candidata.
    const cozinha = m0.spaces.find((s) => s.name === 'Cozinha')!;
    const frente = m0.walls.find((w) => w.a.y === 0 && w.b.y === 0)!;
    const fundos = m0.walls.find((w) => w.a.y === 3000 && w.b.y === 3000)!;
    // As duas fachadas do serviço (x = 3 a 5 m) quase inteiras de janela: de 3,15 a 4,85 m.
    const m = applyBatch(m0, [
      { type: 'NameSpace', spaceId: cozinha.id, name: 'Sala' },
      { type: 'AddOpening', wallId: frente.id, kind: 'window', offsetMm: 3150, widthMm: 1700, heightMm: 1200, sillMm: 1000 },
      { type: 'AddOpening', wallId: fundos.id, kind: 'window', offsetMm: 9000 - 4850, widthMm: 1700, heightMm: 1200, sillMm: 1000 },
    ]).model;
    const r = comandosDasAncoras(m, ctxDe(L));
    const aq = applyBatch(m, r.comandos).model.terminais.filter((t) => t.tipoHidraulico === 'AQUECEDOR');
    expect(aq).toHaveLength(2);
    for (const t of aq) {
      // Numa parede interna do serviço (x = 3 ou 5 m), a meia parede + a folga da face — e fora das janelas.
      expect(Math.min(Math.abs(t.at.x - 3000), Math.abs(t.at.x - 5000)), JSON.stringify(t.at)).toBeLessThanOrEqual(100 + 150 + 1);
      expect(t.at.y > 0 && t.at.y < 3000).toBe(true);
    }
    expect(r.pendencias.join(' ')).toMatch(/Aquecedor na Área de serviço: .* ficou numa parede interna/);
    expect(r.pendencias.join(' ')).not.toMatch(/diante do vão/);
  });
});
