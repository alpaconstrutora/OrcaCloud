/**
 * Casa automática F3 (14/10/2026): o orquestrador `planejarCasa` — implantação → arquitetura
 * (E6.2, várias sementes) → conferência — num lote só, e a trava `conferirPlanoDaCasa`.
 * Plano: `docs/planos/2026-10-14-casa-automatica.md`.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, snapshotHash, type BlueprintModel, type Command, type Point } from '../utils/blueprintKernel';
import { medirTerreno, type Recuos } from '../utils/blueprintTerreno';
import { ZONA_DA_MASSA_VAZIA, type ZonaDaMassa } from '../utils/blueprintMassa';
import { conferirPlanoDaCasa, motivoParaNaoGerar, planejarCasa, type EntradaDaCasa } from '../utils/blueprintCasaAutomatica';
import { PROGRAMA_CURTO_PADRAO } from '../utils/blueprintPrograma';

type Papel = 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA';

/** Lote 12 × 30 m, frente ao sul (ou ao norte), girado de `graus` em torno da origem. */
function lote(graus = 0, frenteAoNorte = false): BlueprintModel {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const levelId = base.levels[0].id;
  const c = Math.cos((graus * Math.PI) / 180);
  const s = Math.sin((graus * Math.PI) / 180);
  const g = (x: number, y: number): Point => (graus === 0 ? point(x, y) : point(Math.round(x * c - y * s), Math.round(x * s + y * c)));
  const d = (a: Point, b: Point, papel: Papel): Command => ({ type: 'AddBoundary', levelId, a, b, kind: 'TERRENO', papel });
  const [sul, norte]: Papel[] = frenteAoNorte ? ['FUNDOS', 'FRENTE'] : ['FRENTE', 'FUNDOS'];
  const [leste, oeste]: Papel[] = frenteAoNorte ? ['LATERAL_ESQUERDA', 'LATERAL_DIREITA'] : ['LATERAL_DIREITA', 'LATERAL_ESQUERDA'];
  return applyBatch(base, [d(g(0, 0), g(12000, 0), sul), d(g(12000, 0), g(12000, 30000), leste), d(g(12000, 30000), g(0, 30000), norte), d(g(0, 30000), g(0, 0), oeste)]).model;
}

const RECUOS: Recuos = { FRENTE: 3000, FUNDOS: 3000, LATERAL_DIREITA: 1500, LATERAL_ESQUERDA: 1500 };
const ZONA: ZonaDaMassa = { ...ZONA_DA_MASSA_VAZIA, taxaOcupacaoMaxPct: 60, coeficienteMax: 1.2, taxaPermeabilidadeMinPct: 20, gabaritoPavimentos: 2 };

function entrada(m: BlueprintModel, mudanca: Partial<EntradaDaCasa> = {}): EntradaDaCasa {
  return {
    levelId: m.levels[0].id,
    ctx: { terreno: medirTerreno(m.boundaries), limites: m.boundaries, recuosBase: RECUOS, zona: ZONA },
    curto: PROGRAMA_CURTO_PADRAO,
    rotacaoNorteDeg: null,
    latitudeGraus: -19.9,
    ...mudanca,
  };
}

const nomeados = (m: BlueprintModel, levelId: string) => m.spaces.filter((s) => s.levelId === levelId && (s.name ?? '').trim()).length;

describe('planejarCasa — lote 12 × 30, frente ao sul', () => {
  const m = lote();
  const plano = planejarCasa(m, entrada(m));
  const L = m.levels[0].id;

  it('três etapas: implantação calculada, arquitetura lançada, conferência calculada', () => {
    expect(plano.etapas.map((e) => [e.id, e.situacao])).toEqual([
      ['IMPLANTACAO', 'CALCULOU'],
      ['ARQUITETURA', 'LANCOU'],
      ['CONFERENCIA', 'CALCULOU'],
    ]);
    expect(plano.comandos.map((c) => c.type)).toEqual(['AddWalls', 'AddOpenings', 'PlaceSpaceLabels']);
    expect(plano.semente).not.toBeNull();
    expect(plano.escolha).toMatch(/semente \d+ de 8/);
  });

  it('a trava: reaplicado no original dá os mesmos ids e o mesmo modelo; o lote e as divisas ficam', () => {
    expect(conferirPlanoDaCasa(m, plano)).toEqual({ ok: true });
    const r = applyBatch(m, plano.comandos);
    expect(r.diff.created).toEqual(plano.criados);
    expect(snapshotHash(r.model)).toBe(snapshotHash(plano.resultado));
    expect(plano.resultado.boundaries).toEqual(m.boundaries);
  });

  it('a casa fica dentro do envelope dos recuos e dentro da TO', () => {
    const ws = plano.resultado.walls.filter((w) => w.levelId === L);
    const xs = ws.flatMap((w) => [w.a.x, w.b.x]);
    const ys = ws.flatMap((w) => [w.a.y, w.b.y]);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(1500);
    expect(Math.max(...xs)).toBeLessThanOrEqual(10500);
    expect(Math.min(...ys)).toBe(3000);
    expect(Math.max(...ys)).toBeLessThanOrEqual(27000);
    expect(plano.resumo.areaConstruidaM2!).toBeLessThanOrEqual(360 * 0.6);
    expect(plano.implantacao?.limitante).toBe('PROGRAMA');
  });

  it('todos os ambientes do programa nomeados no desenho; nenhuma regra de lote violada', () => {
    expect(plano.resumo.ambientesAtendidos).toBe(plano.resumo.ambientesPedidos);
    expect(nomeados(plano.resultado, L)).toBeGreaterThanOrEqual(plano.resumo.ambientesPedidos);
    expect(plano.pendencias.filter((p) => /Legislação: (Taxa de ocupação|Coeficiente)/.test(p.texto))).toEqual([]);
  });

  it('determinístico: a mesma entrada dá o mesmo lote', () => {
    expect(JSON.stringify(planejarCasa(m, entrada(m)).comandos)).toBe(JSON.stringify(plano.comandos));
  });

  it('depois de lançada, não gera de novo no mesmo pavimento — e diz por quê', () => {
    expect(motivoParaNaoGerar(plano.resultado, L)).toMatch(/já tem paredes/);
    const segundo = planejarCasa(plano.resultado, entrada(plano.resultado));
    expect(segundo.comandos).toEqual([]);
    expect(segundo.etapas.find((e) => e.id === 'ARQUITETURA')?.situacao).toBe('NAO_RODOU');
  });

  it('o desenho mudou depois da prévia: a trava recusa', () => {
    const outro = applyCommand(m, { type: 'AddWall', levelId: L, a: point(0, 31000), b: point(5000, 31000), thicknessMm: 150, heightMm: 2800 }).model;
    const r = conferirPlanoDaCasa(outro, plano);
    expect(r.ok).toBe(false);
  });
});

describe('planejarCasa — o que falta vira motivo, nunca exceção', () => {
  it('sem FRENTE: a implantação não roda e o plano sai vazio com o motivo', () => {
    const m = lote();
    const semFrente = { ...m, boundaries: m.boundaries.map((b) => ({ ...b, papel: b.papel === 'FRENTE' ? null : b.papel })) };
    const p = planejarCasa(semFrente, entrada(semFrente));
    expect(p.comandos).toEqual([]);
    expect(p.etapas[0]).toMatchObject({ id: 'IMPLANTACAO', situacao: 'NAO_RODOU' });
    expect(p.etapas[0].nota).toMatch(/FRENTE/);
    expect(p.etapas.map((e) => e.situacao)).toEqual(['NAO_RODOU', 'NAO_RODOU', 'NAO_RODOU']);
  });

  it('pavimento inexistente', () => {
    const m = lote();
    const p = planejarCasa(m, entrada(m, { levelId: 'nao-existe' }));
    expect(p.comandos).toEqual([]);
    expect(p.etapas[0].nota).toMatch(/Abra um pavimento/);
  });

  it('o formulário corrigido aparece como pendência de premissa', () => {
    const m = lote();
    const p = planejarCasa(m, entrada(m, { curto: { ...PROGRAMA_CURTO_PADRAO, banheiros: 1 } }));
    expect(p.pendencias.some((x) => x.grupo === 'PREMISSA' && /Banheiros: 1 → 2/.test(x.texto))).toBe(true);
  });
});

describe('planejarCasa — o quadro da frente', () => {
  const referencia = (() => {
    const m = lote();
    return planejarCasa(m, entrada(m));
  })();

  it('frente ao NORTE: a mesma casa girada 180° (exata), encostada no recuo de cima', () => {
    const m = lote(0, true);
    const p = planejarCasa(m, entrada(m));
    const L = m.levels[0].id;
    expect(p.etapas[1].situacao).toBe('LANCOU');
    const ys = p.resultado.walls.filter((w) => w.levelId === L).flatMap((w) => [w.a.y, w.b.y]);
    expect(Math.max(...ys)).toBe(27000);
    expect(p.resumo.ambientesAtendidos).toBe(referencia.resumo.ambientesAtendidos);
    expect(conferirPlanoDaCasa(m, p)).toEqual({ ok: true });
  });

  it('lote GIRADO 30°: as junções em T sobrevivem ao arredondamento e nenhuma abertura se perde', () => {
    const m = lote(30);
    const p = planejarCasa(m, entrada(m));
    const L = m.levels[0].id;
    expect(p.implantacao?.alinhadaAoDesenho).toBe(false);
    expect(p.etapas[1].situacao).toBe('LANCOU');
    // o norte do desenho cai noutro lado da casa: a semente escolhida pode mudar — os ambientes, não
    expect(nomeados(p.resultado, L)).toBe(nomeados(referencia.resultado, referencia.levelId));
    expect(p.resumo.ambientesAtendidos).toBe(referencia.resumo.ambientesAtendidos);
    const pedidas = p.comandos.flatMap((c) => (c.type === 'AddOpenings' ? c.openings : [])).length;
    expect(p.resultado.openings.length).toBe(pedidas);
    expect(conferirPlanoDaCasa(m, p)).toEqual({ ok: true });
  });

  it('lote GIRADO 30° com o norte girado junto: a MESMA planta da casa reta (a transformação é fiel)', () => {
    const m = lote(30);
    // norte = (sen θ, cos θ); o lote girou 30° no sentido anti-horário → o norte também: θ = −30°
    const p = planejarCasa(m, entrada(m, { rotacaoNorteDeg: -30 }), { sementes: [1] });
    const reto = (() => {
      const r = lote();
      return planejarCasa(r, entrada(r), { sementes: [1] });
    })();
    expect(p.semente).toBe(reto.semente);
    expect(p.resultado.walls.length).toBe(reto.resultado.walls.length);
    expect(p.resultado.openings.length).toBe(reto.resultado.openings.length);
    expect(p.resultado.openings.map((o) => [o.kind, o.widthMm]).sort()).toEqual(reto.resultado.openings.map((o) => [o.kind, o.widthMm]).sort());
    const L = m.levels[0].id;
    const nomes = (x: BlueprintModel, l: string) => x.spaces.filter((s) => s.levelId === l && s.name).map((s) => s.name).sort();
    expect(nomes(p.resultado, L)).toEqual(nomes(reto.resultado, reto.levelId));
    // a área de cada ambiente bate até o arredondamento ao mm (e as pontas de 3 mm)
    const areas = (x: BlueprintModel, l: string) => Object.fromEntries(x.spaces.filter((s) => s.levelId === l && s.name).map((s) => [s.name, s.areaMm2 / 1e6]));
    const ag = areas(p.resultado, L);
    for (const [nome, a] of Object.entries(areas(reto.resultado, reto.levelId))) expect(Math.abs(ag[nome] - a)).toBeLessThan(0.05);
  });

  // Sem as pontas de ALEM_MM, a sonda de 14/10 fundiu os 12 ambientes em 4 (17°), 1 (30°) e 8 (45°).
  it.each([17, 45])('lote GIRADO %i°: nenhum ambiente se funde', (graus) => {
    const m = lote(graus);
    const p = planejarCasa(m, entrada(m), { sementes: [1] });
    expect(p.etapas[1].situacao).toBe('LANCOU');
    expect(nomeados(p.resultado, m.levels[0].id)).toBe(nomeados(referencia.resultado, referencia.levelId));
    expect(p.resumo.ambientesAtendidos).toBe(p.resumo.ambientesPedidos);
  });
});
