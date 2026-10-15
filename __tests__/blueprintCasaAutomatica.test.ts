/**
 * Casa automática F3 (14/10/2026): o orquestrador `planejarCasa` — implantação → arquitetura
 * (E6.2, várias sementes) → conferência — num lote só, e a trava `conferirPlanoDaCasa`.
 * Plano: `docs/planos/2026-10-14-casa-automatica.md`.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, pointInPolygon, snapshotHash, type BlueprintModel, type Command, type Point } from '../utils/blueprintKernel';
import { medirTerreno, type Recuos } from '../utils/blueprintTerreno';
import { ZONA_DA_MASSA_VAZIA, type ZonaDaMassa } from '../utils/blueprintMassa';
import { conferirPlanoDaCasa, HIPOTESES_DA_ESTRUTURA_DA_CASA_PADRAO, motivoParaNaoGerar, planejarCasa, type EntradaDaCasa } from '../utils/blueprintCasaAutomatica';
import { PROGRAMA_CURTO_PADRAO } from '../utils/blueprintPrograma';
import { HIPOTESES_DO_TELHADO_PADRAO } from '../utils/blueprintTelhadoAutomatico';
import { HIPOTESES_DAS_ANCORAS_PADRAO } from '../utils/blueprintAncorasDaCasa';
import { HIPOTESES_HIDRO_PADRAO } from '../utils/blueprintMemorialHidro';
import { planejarCalhas } from '../utils/blueprintCalhas';
import { HIPOTESES_PLUVIAIS_PADRAO } from '../utils/blueprintPluvial';

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

  it('as etapas na ordem: implantação, arquitetura, estrutura (pilares → vigas → lajes → fundações → eixos), conferência', () => {
    expect(plano.etapas.map((e) => [e.id, e.situacao])).toEqual([
      ['IMPLANTACAO', 'CALCULOU'],
      ['ARQUITETURA', 'LANCOU'],
      ['PILARES', 'LANCOU'],
      ['VIGAS', 'LANCOU'],
      ['LAJES', 'LANCOU'],
      ['FUNDACOES', 'LANCOU'],
      ['EIXOS', 'LANCOU'],
      ['TELHADO', 'LANCOU'],
      ['ANCORAS', 'LANCOU'],
      ['CONFERENCIA', 'CALCULOU'],
    ]);
    expect(plano.comandos.slice(0, 3).map((c) => c.type)).toEqual(['AddWalls', 'AddOpenings', 'PlaceSpaceLabels']);
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
    expect(p.etapas.map((e) => e.situacao)).toEqual(Array(10).fill('NAO_RODOU'));
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

describe('planejarCasa — F4: a estrutura no mesmo lote', () => {
  const dseg = (a: Point, b: Point, q: Point) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy));
  };
  const pecas = (m: BlueprintModel, kind: string) => m.structures.filter((s) => s.kind === kind);

  it.each([0, 30])('lote a %i°: todo pilar sobre parede; um bloco e uma estaca por pilar; laje por ambiente; baldrame', (graus) => {
    const m = lote(graus);
    const L = m.levels[0].id;
    const p = planejarCasa(m, entrada(m));
    const ws = p.resultado.walls.filter((w) => w.levelId === L);
    const pilares = pecas(p.resultado, 'PILAR');
    expect(pilares.length).toBeGreaterThanOrEqual(4);
    for (const x of pilares) expect(ws.some((w) => dseg(w.a, w.b, x.pontos[0]) <= w.thicknessMm / 2 + 10)).toBe(true);
    expect(pecas(p.resultado, 'BLOCO_COROAMENTO').length).toBe(pilares.length);
    expect(pecas(p.resultado, 'ESTACA').length).toBe(pilares.length); // 1 estaca por bloco (padrão)
    expect(pecas(p.resultado, 'LAJE').length).toBe(p.resultado.spaces.filter((s) => s.levelId === L).length);
    expect(pecas(p.resultado, 'VIGA').length).toBeGreaterThan(0);
    expect(pecas(p.resultado, 'VIGA_FUNDACAO').length).toBeGreaterThan(0);
    expect(p.resumo.estrutura.pilares).toBe(pilares.length);
    // pulado (pilar quase duplicado) é VERIFICACAO; falta de solução da estrutura, nenhuma
    expect(p.pendencias.filter((x) => x.grupo === 'SEM_SOLUCAO' && /^(Pilares|Vigas|Lajes|Fundações)/.test(x.texto))).toEqual([]);
    expect(conferirPlanoDaCasa(m, p)).toEqual({ ok: true });
  });

  it('os eixos vêm DEPOIS dos pilares: nenhum pilar em cruzamento de eixo solto (antes: 52 pilares, 2 dentro de ambiente)', () => {
    const m = lote();
    const p = planejarCasa(m, entrada(m));
    expect(p.resumo.estrutura.eixos).toBeGreaterThan(0);
    expect(p.resumo.estrutura.pilares).toBeLessThanOrEqual(40);
  });

  it('lote girado: os eixos não rodam e dizem por quê (paredes oblíquas ao desenho)', () => {
    const m = lote(30);
    const e = planejarCasa(m, entrada(m)).etapas.find((x) => x.id === 'EIXOS')!;
    expect(e.situacao).toBe('NADA_A_FAZER');
    expect(e.nota).toMatch(/oblíqua/);
  });

  it('estrutura desligada nas hipóteses: as cinco etapas NAO_EXIGIDA e o lote é só a arquitetura', () => {
    const m = lote();
    const p = planejarCasa(m, entrada(m), { estrutura: { ...HIPOTESES_DA_ESTRUTURA_DA_CASA_PADRAO, lancar: false } });
    expect(p.etapas.filter((e) => ['PILARES', 'VIGAS', 'LAJES', 'FUNDACOES', 'EIXOS'].includes(e.id)).map((e) => e.situacao)).toEqual(Array(5).fill('NAO_EXIGIDA'));
    expect(p.comandos.slice(0, 4).map((c) => c.type)).toEqual(['AddWalls', 'AddOpenings', 'PlaceSpaceLabels', 'AddRoofByExtrusion']);
    expect(p.comandos.some((c) => c.type === 'AddStructural')).toBe(false);
  });
});

describe('planejarCasa — F5: o telhado', () => {
  it.each([0, 30])('lote a %i°: duas águas cobrindo a casa com beiral; a pluvial acha o beiral e lança calhas', (graus) => {
    const m = lote(graus);
    const L = m.levels[0].id;
    const p = planejarCasa(m, entrada(m));
    const aguas = (p.resultado.roofs ?? []).filter((a) => a.levelId === L);
    expect(aguas).toHaveLength(2);
    expect(p.resumo.telhado?.aguas).toBe(2);
    // toda ponta de parede da casa fica DENTRO da projeção da cobertura
    const naCobertura = (q: Point) =>
      aguas.some((a) => {
        let d = false;
        const r = a.pontos;
        for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i].y > q.y) !== (r[j].y > q.y) && q.x < ((r[j].x - r[i].x) * (q.y - r[i].y)) / (r[j].y - r[i].y) + r[i].x) d = !d;
        return d;
      });
    for (const w of p.resultado.walls.filter((x) => x.levelId === L)) for (const q of [w.a, w.b]) expect(naCobertura(q)).toBe(true);
    expect(conferirPlanoDaCasa(m, p)).toEqual({ ok: true });
    // O critério da F5: a pluvial enxerga o beiral (sem o "desenhe o telhado") e põe calha.
    const calhas = planejarCalhas(p.resultado, { ...HIPOTESES_PLUVIAIS_PADRAO, intensidadeMmH: 150 });
    expect(calhas.motivo).toBeNull();
    expect(calhas.calhas.length).toBeGreaterThan(0);
  });

  it('telhado desligado: a etapa NAO_EXIGIDA e nenhuma água', () => {
    const m = lote();
    const p = planejarCasa(m, entrada(m), { telhado: { ...HIPOTESES_DO_TELHADO_PADRAO, lancar: false } });
    expect(p.etapas.find((e) => e.id === 'TELHADO')?.situacao).toBe('NAO_EXIGIDA');
    expect(p.resultado.roofs ?? []).toHaveLength(0);
    expect(p.resumo.telhado).toBeNull();
  });
});

describe('planejarCasa — F6: as peças-âncora', () => {
  it.each([0, 30])("lote a %i°: caixa d'água sobre um banheiro, caixa de gordura fora da casa, as 2 vagas na garagem", (graus) => {
    const m = lote(graus);
    const L = m.levels[0].id;
    const p = planejarCasa(m, entrada(m));
    expect(p.etapas.find((e) => e.id === 'ANCORAS')?.situacao).toBe('LANCOU');
    const ts = p.resultado.terminais.filter((t) => t.levelId === L);
    const caixa = ts.find((t) => t.tipoHidraulico === 'RESERVATORIO')!;
    expect(caixa.volumeL).toBeGreaterThan(0);
    expect(p.resultado.spaces.some((s) => /banh/i.test(s.name ?? '') && pointInPolygon(s.ring, caixa.at))).toBe(true);
    const cg = ts.find((t) => t.tipoHidraulico === 'CAIXA_GORDURA')!;
    expect(p.resultado.spaces.filter((s) => s.levelId === L).some((s) => pointInPolygon(s.ring, cg.at))).toBe(false);
    // as vagas pedidas (2) dentro da garagem
    const garagem = p.resultado.spaces.find((s) => /garagem/i.test(s.name ?? ''))!;
    const vagas = p.resultado.vagas.filter((v) => v.levelId === L);
    expect(vagas).toHaveLength(2);
    for (const v of vagas) expect(pointInPolygon(garagem.ring, v.at)).toBe(true);
    expect(conferirPlanoDaCasa(m, p)).toEqual({ ok: true });
  });

  it('âncoras desligadas: a etapa NAO_EXIGIDA e nenhuma peça hidráulica nem vaga', () => {
    const m = lote();
    const p = planejarCasa(m, entrada(m), { ancoras: { ...HIPOTESES_DAS_ANCORAS_PADRAO, lancar: false } });
    expect(p.etapas.find((e) => e.id === 'ANCORAS')?.situacao).toBe('NAO_EXIGIDA');
    expect(p.resultado.terminais).toHaveLength(0);
    expect(p.resultado.vagas).toHaveLength(0);
  });

  it('as premissas hidro do estudo entram: mais per capita, caixa maior', () => {
    const m = lote();
    const padrao = planejarCasa(m, entrada(m)).resumo.ancoras!.caixaDaguaL!;
    const mais = planejarCasa(m, entrada(m, { hidro: { ...HIPOTESES_HIDRO_PADRAO, reservatorio: { ...HIPOTESES_HIDRO_PADRAO.reservatorio, diasDeReserva: 2 } } })).resumo.ancoras!.caixaDaguaL!;
    expect(mais).toBeGreaterThan(padrao);
  });
});

describe('planejarCasa — F6b: cozinha com janela na casa estreita', () => {
  // Antes (F6): no lote de 12 m, com a garagem em fila tomando a lateral, a cozinha ia para o miolo — sem janela,
  // e sem parede externa para o aquecedor. Frente em colunas (o recozimento escolhe) e o peso da falta de luz
  // natural acima da preferência de a sala dar para a rua.
  it.each([0, 30])('lote a %i°: a cozinha tem parede externa e o aquecedor foi lançado', (graus) => {
    const m = lote(graus);
    const p = planejarCasa(m, entrada(m));
    expect(p.pendencias.filter((x) => /Cozinha exige/.test(x.texto))).toEqual([]);
    expect(p.resumo.ancoras?.aquecedor).toBe(true);
    expect(p.resumo.regrasVioladas).toBe(0);
  });
});

