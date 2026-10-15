/**
 * Casa automática F3 (14/10/2026): o orquestrador `planejarCasa` — implantação → arquitetura
 * (E6.2, várias sementes) → conferência — num lote só, e a trava `conferirPlanoDaCasa`.
 * Plano: `docs/planos/2026-10-14-casa-automatica.md`.
 */
import { describe, expect, it, vi } from 'vitest';
import { applyBatch, applyCommand, conflitosDoModelo, emptyModel, furosDaEscada, point, pointInPolygon, snapshotHash, type BlueprintModel, type Command, type Point } from '../utils/blueprintKernel';
import { ROTULO_DO_ALIMENTADOR } from '../utils/blueprintAlimentador';
import { medirTerreno, type Recuos } from '../utils/blueprintTerreno';
import { ZONA_DA_MASSA_VAZIA, type ZonaDaMassa } from '../utils/blueprintMassa';
import { conferirPlanoDaCasa, HIPOTESES_DA_ELETRICA_DA_CASA_PADRAO, HIPOTESES_DA_PRESSAO_DA_CASA_PADRAO, HIPOTESES_DA_ESTRUTURA_DA_CASA_PADRAO, motivoParaNaoGerar, planejarCasa, type EntradaDaCasa } from '../utils/blueprintCasaAutomatica';
import { prumadasPeloMeioDoComodo } from '../utils/blueprintSobrado';
import { pressoesDoModelo } from '../utils/blueprintPressaoDaRede';
import { PROGRAMA_CURTO_PADRAO } from '../utils/blueprintPrograma';
import { HIPOTESES_DO_TELHADO_PADRAO } from '../utils/blueprintTelhadoAutomatico';
import { HIPOTESES_DAS_ANCORAS_PADRAO } from '../utils/blueprintAncorasDaCasa';
import { HIPOTESES_HIDRO_PADRAO } from '../utils/blueprintMemorialHidro';
import { planejarCalhas } from '../utils/blueprintCalhas';
import { HIPOTESES_PLUVIAIS_PADRAO } from '../utils/blueprintPluvial';
import { modelosDoCatalogo } from '../utils/blueprintSelecaoClimatizacao';
import { SEMENTES_DE_TIPOS } from '../utils/blueprintCatalogoDeTipos';
import { HIPOTESES_CLIMATIZACAO_PADRAO } from '../utils/blueprintClimatizacao';
import { pontosElegiveis } from '../utils/blueprintCircuitosAutomaticos';

// Cada teste aqui gera a CASA INTEIRA (arquitetura → estrutura → telhado → louças → água, esgoto e pluvial):
// ~0,5–0,8 s nesta máquina, e a CI, disputando CPU com a suíte toda, chegou a passar dos 5 s do padrão
// (15/10/2026, run 38725612771). O limite é do arquivo, não um teste lento escondido.
vi.setConfig({ testTimeout: 30_000 });

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
      ['MOBILIARIO', 'LANCOU'],
      ['LOUCAS', 'LANCOU'],
      ['PONTOS_HIDRAULICOS', 'LANCOU'],
      ['AGUA', 'LANCOU'],
      ['ESGOTO', 'LANCOU'],
      ['PLUVIAL', 'NAO_RODOU'], // sem a intensidade de chuva nas premissas do estudo (a casa de 190 m² passa de 100 m²)
      ['PONTOS_ELETRICOS', 'LANCOU'],
      ['QUADRO', 'LANCOU'],
      ['CIRCUITOS', 'LANCOU'],
      ['CLIMATIZACAO', 'NAO_RODOU'], // sem o catálogo de evaporadoras na entrada
      ['DR_DPS', 'LANCOU'],
      ['ELETRODUTOS', 'LANCOU'],
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
    expect(p.etapas.map((e) => e.situacao)).toEqual(Array(22).fill('NAO_RODOU'));
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
    expect(p.resultado.terminais.filter((x) => ['RESERVATORIO', 'AQUECEDOR', 'CAIXA_GORDURA'].includes(x.tipoHidraulico ?? ''))).toHaveLength(0);
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

describe('planejarCasa — F7: mobiliário, louças e pontos', () => {
  const porAmbiente = (p: ReturnType<typeof planejarCasa>, L: string, re: RegExp) =>
    p.resultado.spaces
      .filter((s) => s.levelId === L && re.test(s.name ?? ''))
      .map((s) => ({ nome: s.name, chaves: p.resultado.terminais.filter((t) => t.levelId === L && t.tipoHidraulico && pointInPolygon(s.ring, t.at)).map((t) => `${t.tipoHidraulico}:${t.disciplina}`) }));

  it.each([0, 30])('lote a %i°: cada ambiente molhado com o kit completo e sem duplicata; tudo sugerido', (graus) => {
    const m = lote(graus);
    const L = m.levels[0].id;
    const p = planejarCasa(m, entrada(m));
    expect(p.resumo.mobiliario.pecas).toBeGreaterThan(10);
    for (const b of porAmbiente(p, L, /^banheiro/i)) {
      for (const k of ['VASO_SANITARIO:AGUA_FRIA', 'VASO_SANITARIO:ESGOTO', 'LAVATORIO:AGUA_FRIA', 'LAVATORIO:AGUA_QUENTE', 'LAVATORIO:ESGOTO', 'CHUVEIRO:AGUA_FRIA', 'CHUVEIRO:AGUA_QUENTE', 'CAIXA_SIFONADA:ESGOTO']) expect(b.chaves).toContain(k);
      expect(new Set(b.chaves).size).toBe(b.chaves.length); // nenhum (tipo, disciplina) duas vezes
    }
    const [coz] = porAmbiente(p, L, /^cozinha/i);
    for (const k of ['PIA_COZINHA:AGUA_FRIA', 'PIA_COZINHA:AGUA_QUENTE', 'PIA_COZINHA:ESGOTO']) expect(coz.chaves).toContain(k);
    const [serv] = porAmbiente(p, L, /servi/i);
    for (const k of ['TANQUE:AGUA_FRIA', 'TANQUE:ESGOTO', 'MAQUINA_LAVAR:AGUA_FRIA', 'MAQUINA_LAVAR:ESGOTO']) expect(serv.chaves).toContain(k);
    expect(p.resultado.terminais.filter((t) => t.tipoHidraulico).every((t) => t.sugerida)).toBe(true);
    expect(p.resultado.componentes.every((c) => c.sugerido)).toBe(true);
    expect(conferirPlanoDaCasa(m, p)).toEqual({ ok: true });
  });

  it('R1-B (chuveiro elétrico): nenhum ponto de água quente — não há rede para ligá-los', () => {
    const m = lote();
    const p = planejarCasa(m, entrada(m, { curto: { ...PROGRAMA_CURTO_PADRAO, padrao: 'R1-B' } }));
    expect(p.resultado.terminais.filter((t) => t.disciplina === 'AGUA_QUENTE')).toEqual([]);
    expect(p.resultado.terminais.some((t) => t.tipoHidraulico === 'CHUVEIRO' && t.disciplina === 'AGUA_FRIA')).toBe(true);
  });
});


describe('planejarCasa — F8: água, esgoto e pluvial encadeados', () => {
  const comChuva = (destino: 'REDE_PUBLICA' | 'TRATAMENTO' = 'REDE_PUBLICA') => ({
    ...HIPOTESES_HIDRO_PADRAO,
    esgoto: { ...HIPOTESES_HIDRO_PADRAO.esgoto, destino },
    pluvial: { ...HIPOTESES_HIDRO_PADRAO.pluvial, intensidadeMmH: 150 },
  });
  const situacao = (p: ReturnType<typeof planejarCasa>, id: string) => p.etapas.find((e) => e.id === id)?.situacao;
  const tipos = (p: ReturnType<typeof planejarCasa>) => new Set(p.resultado.terminais.map((t) => t.tipoHidraulico));

  it.each([0, 30])('lote a %i°, com a intensidade de chuva: as três redes lançadas, ligadas, compatíveis com a estrutura e com a trava aprovando', (graus) => {
    const m = lote(graus);
    const p = planejarCasa(m, entrada(m, { hidro: comChuva() }));
    expect([situacao(p, 'AGUA'), situacao(p, 'ESGOTO'), situacao(p, 'PLUVIAL')]).toEqual(['LANCOU', 'LANCOU', 'LANCOU']);
    const h = p.resumo.hidraulica;
    expect(h.agua.tubos).toBeGreaterThan(0);
    expect(h.esgoto.tubos).toBeGreaterThan(0);
    expect(h.pluvial.tubos).toBeGreaterThan(0);
    expect(h.esgoto.destino).toBe('REDE_PUBLICA');
    // A rede sai LIGADA e COMPATÍVEL (F8b): a verificação de rede do app sem marca nenhuma — nem ponta
    // aberta, nem trecho sem destino, nem tubo atravessando pilar ou cruzando viga, nem desconector sem
    // ventilação.
    expect(h.verificacao).toEqual({ erros: 0, avisos: 0, porTipo: {} });
    // (F9: as redes que passam por porta ou janela são OUTRA pendência — `resumo.aberturas` —, compatibilização à parte.)
    expect(p.pendencias.filter((x) => /^Rede de /.test(x.texto) && !/porta ou janela/.test(x.texto))).toEqual([]);
    expect(tipos(p).has('HIDROMETRO')).toBe(true);
    expect(tipos(p).has('LIGACAO_ESGOTO')).toBe(true);
    // Tudo proposta do sistema — inclusive o ponto que a água encostou na parede.
    expect(p.resultado.terminais.filter((t) => t.tipoHidraulico).every((t) => t.sugerida)).toBe(true);
    expect(conferirPlanoDaCasa(m, p)).toEqual({ ok: true });
  });

  it('sem rede pública: tanque séptico, filtro e sumidouro no lugar da ligação', () => {
    const m = lote();
    const p = planejarCasa(m, entrada(m, { hidro: comChuva('TRATAMENTO') }));
    expect(situacao(p, 'ESGOTO')).toBe('LANCOU');
    expect(p.resumo.hidraulica.esgoto.destino).toBe('TRATAMENTO');
    for (const t of ['TANQUE_SEPTICO', 'FILTRO_ANAEROBIO', 'SUMIDOURO']) expect(tipos(p).has(t as never)).toBe(true);
    expect(tipos(p).has('LIGACAO_ESGOTO')).toBe(false);
    expect(conferirPlanoDaCasa(m, p)).toEqual({ ok: true });
  });

  it('sem a intensidade de chuva: a pluvial não roda e vira premissa — água e esgoto seguem', () => {
    const m = lote();
    const p = planejarCasa(m, entrada(m));
    expect(situacao(p, 'PLUVIAL')).toBe('NAO_RODOU');
    expect(p.pendencias.some((x) => x.grupo === 'PREMISSA' && /^Águas pluviais/.test(x.texto))).toBe(true);
    expect([situacao(p, 'AGUA'), situacao(p, 'ESGOTO')]).toEqual(['LANCOU', 'LANCOU']);
  });

  it('desligada nas hipóteses: nenhuma rede, etapas NAO_EXIGIDA', () => {
    const m = lote();
    const p = planejarCasa(m, entrada(m, { hidro: comChuva() }), { hidraulica: { lancar: false } });
    expect([situacao(p, 'AGUA'), situacao(p, 'ESGOTO'), situacao(p, 'PLUVIAL')]).toEqual(['NAO_EXIGIDA', 'NAO_EXIGIDA', 'NAO_EXIGIDA']);
    expect((p.resultado.trechos ?? []).filter((t) => ['AGUA_FRIA', 'AGUA_QUENTE', 'ESGOTO', 'PLUVIAL'].includes(t.disciplina))).toEqual([]);
  });
});

describe('planejarCasa — F8c: o alimentador enterrado fora do baldrame', () => {
  it.each([0, 30])('lote a %i°: o alimentador só ATRAVESSA baldrame (nenhum pedaço correndo dentro dele) e não toca pilar', (graus) => {
    const m = lote(graus);
    const p = planejarCasa(m, entrada(m, { hidro: { ...HIPOTESES_HIDRO_PADRAO, pluvial: { ...HIPOTESES_HIDRO_PADRAO.pluvial, intensidadeMmH: 150 } } }));
    const r = p.resultado;
    const alimentador = (r.trechos ?? []).filter((t) => t.rotulo === ROTULO_DO_ALIMENTADOR);
    expect(alimentador.length).toBeGreaterThan(0);
    const peca = new Map(r.structures.map((x) => [x.id, x]));
    const encontros = conflitosDoModelo({ ...r, trechos: alimentador }).filter((c) => c.classe === 'ESTRUTURA' && c.comprimentoDentroMm > 0);
    expect(encontros.filter((c) => peca.get(c.outroId)!.kind === 'PILAR')).toEqual([]);
    const noBaldrame = encontros.filter((c) => peca.get(c.outroId)!.kind === 'VIGA_FUNDACAO');
    expect(noBaldrame.length).toBeGreaterThan(0); // a casa fica entre a rua e a caixa: o tubo atravessa
    // Uma travessia: no máximo a largura do baldrame, com folga para o ângulo.
    for (const c of noBaldrame) expect(c.comprimentoDentroMm).toBeLessThanOrEqual(peca.get(c.outroId)!.larguraMm * 1.2);
    expect(p.resumo.hidraulica.verificacao).toEqual({ erros: 0, avisos: 0, porTipo: {} });
    expect(conferirPlanoDaCasa(m, p)).toEqual({ ok: true });
  });
});

describe('planejarCasa — F9: elétrica e climatização', () => {
  // O catálogo semente (8 hi-wall, 9k–60k BTU/h) e o clima declarado — as premissas que o estudo traria.
  const modelos = modelosDoCatalogo(SEMENTES_DE_TIPOS.map((s, i) => ({ id: `t${i}`, nome: s.nome, familia: s.propriedades.familia, active: true, propriedades: s.propriedades })));
  const comAr = (m: BlueprintModel, mudanca: Partial<EntradaDaCasa> = {}) =>
    entrada(m, {
      hidro: { ...HIPOTESES_HIDRO_PADRAO, pluvial: { ...HIPOTESES_HIDRO_PADRAO.pluvial, intensidadeMmH: 150 } },
      modelosDeClimatizacao: modelos,
      climatizacao: { ...HIPOTESES_CLIMATIZACAO_PADRAO, clima: { cidade: null, tbsExternaC: 34, tbuExternaC: 25, altitudeM: 0 } },
      ...mudanca,
    });
  const ELETRICAS = ['PONTOS_ELETRICOS', 'QUADRO', 'CIRCUITOS', 'CLIMATIZACAO', 'DR_DPS', 'ELETRODUTOS'];
  const situacoes = (p: ReturnType<typeof planejarCasa>) => ELETRICAS.map((id) => p.etapas.find((e) => e.id === id)?.situacao);

  it.each([0, 30])('lote a %i°: tudo lançado, a NBR 5410 sem falta, todo ponto de carga com circuito, um split por ambiente climatizável, nada na estrutura', (graus) => {
    const m = lote(graus);
    const L = m.levels[0].id;
    const p = planejarCasa(m, comAr(m));
    const r = p.resultado;
    expect(situacoes(p)).toEqual(Array(6).fill('LANCOU'));
    const e = p.resumo.eletrica;
    expect(e.conferencia.faltas).toBe(0);
    expect(e.quadro).toBe('QDC');
    expect(e.dps).toBe(true);
    expect(e.drs).toBeGreaterThan(0);
    expect(e.entrada).not.toBeNull();
    // A entrada de serviço e o medidor, ligados ao quadro, na frente do lote.
    const qdc = (r.quadros ?? [])[0];
    expect((r.terminais ?? []).filter((t) => t.quadroId === qdc.id).map((t) => t.tipoEletrico).sort()).toEqual(['ENTRADA_SERVICO', 'MEDIDOR']);
    // Nenhum ponto que o planejador de circuitos liga ficou solto (os splits inclusive).
    expect(pontosElegiveis(r, L)).toEqual([]);
    // Sala, suíte e os 2 dormitórios.
    expect(p.resumo.climatizacao.equipamentos).toBe(4);
    expect(p.resumo.climatizacao.verificacao).toEqual({ erros: 0, avisos: 0, porTipo: {} });
    // Eletroduto, linha e dreno do ar: só a LAJE (a descida da luz de teto, a passagem prevista) — nenhum pilar, viga.
    const peca = new Map(r.structures.map((x) => [x.id, x]));
    const novas = (r.trechos ?? []).filter((t) => ['ELETRICA', 'FRIGORIGENA', 'DRENO_AC'].includes(t.disciplina));
    const naEstrutura = conflitosDoModelo({ ...r, trechos: novas }).filter((c) => c.classe === 'ESTRUTURA' && c.comprimentoDentroMm > 0);
    expect(naEstrutura.filter((c) => peca.get(c.outroId)!.kind !== 'LAJE')).toEqual([]);
    expect(conferirPlanoDaCasa(m, p)).toEqual({ ok: true });
  });

  it('sem o catálogo de evaporadoras: a climatização não roda e diz o porquê; a elétrica lança', () => {
    const m = lote();
    const p = planejarCasa(m, comAr(m, { modelosDeClimatizacao: [] }));
    expect(situacoes(p)).toEqual(['LANCOU', 'LANCOU', 'LANCOU', 'NAO_RODOU', 'LANCOU', 'LANCOU']);
    expect(p.pendencias.some((x) => x.grupo === 'PREMISSA' && /Climatização: sem catálogo de evaporadoras/.test(x.texto))).toBe(true);
    expect(p.resumo.eletrica.conferencia.faltas).toBe(0);
  });

  it('R1-B: o chuveiro elétrico é ligação direta de 5.500 W no ponto do chuveiro, com circuito próprio e DR', () => {
    const m = lote();
    const p = planejarCasa(m, comAr(m, { curto: { ...PROGRAMA_CURTO_PADRAO, padrao: 'R1-B' } }));
    const r = p.resultado;
    const chuveiros = (r.terminais ?? []).filter((t) => t.tipoHidraulico === 'CHUVEIRO' && t.disciplina === 'AGUA_FRIA');
    const diretas = (r.terminais ?? []).filter((t) => t.tipoEletrico === 'LIGACAO_DIRETA');
    expect(diretas.length).toBe(chuveiros.length);
    expect(diretas.length).toBeGreaterThan(0);
    for (const d of diretas) {
      expect(d.potenciaW).toBe(5500);
      expect(chuveiros.some((c) => c.at.x === d.at.x && c.at.y === d.at.y)).toBe(true);
      expect(d.circuitoId).toBeTruthy();
      // Circuito só dele.
      expect((r.terminais ?? []).filter((t) => t.circuitoId === d.circuitoId)).toHaveLength(1);
      expect((r.quadros ?? [])[0].drs?.some((dr) => (dr.circuitoIds ?? []).includes(d.circuitoId!))).toBe(true);
    }
    expect(p.resumo.eletrica.conferencia.faltas).toBe(0);
  });

  it('elétrica desligada: as seis etapas NAO_EXIGIDA e nenhum ponto elétrico', () => {
    const m = lote();
    const p = planejarCasa(m, comAr(m), { eletrica: { lancar: false, areaPorLuminariaM2: null, chuveiroEletricoVA: 5500, medidor: true } });
    expect(situacoes(p)).toEqual(Array(6).fill('NAO_EXIGIDA'));
    expect((p.resultado.terminais ?? []).filter((t) => t.disciplina === 'ELETRICA')).toEqual([]);
  });
});


describe('planejarCasa — F12a: o sobrado (arquitetura dos dois pavimentos e a escada)', () => {
  const m = lote();
  const plano = planejarCasa(m, entrada(m), { pavimentos: 2 });
  const T = m.levels[0].id;
  const r = plano.resultado;
  const S = plano.sobrado?.nivelSuperiorId ?? '';

  it('o pavimento superior nasce no mesmo lote, um andar acima (pé-direito + laje)', () => {
    expect(plano.sobrado).not.toBeNull();
    expect(r.levels).toHaveLength(2);
    expect(r.levels.find((l) => l.id === S)?.elevationMm).toBe(2800 + 100);
    expect(r.walls.filter((w) => w.levelId === T).length).toBeGreaterThan(10);
    expect(r.walls.filter((w) => w.levelId === S).length).toBeGreaterThan(10);
  });

  it('a escada em U liga os dois: degraus confortáveis (Blondel), sem aviso', () => {
    expect(r.stairs).toHaveLength(1);
    const e = plano.sobrado!.escada;
    expect(e.degraus).toBeGreaterThanOrEqual(16);
    expect(e.espelhoMm).toBeLessThanOrEqual(185);
    expect(e.pisoMm).toBeGreaterThanOrEqual(280);
    expect(e.blondelMm).toBeGreaterThanOrEqual(630);
    expect(e.blondelMm).toBeLessThanOrEqual(650);
    expect(plano.pendencias.filter((p) => p.texto.startsWith('Escada:') && p.grupo === 'SEM_SOLUCAO')).toEqual([]);
  });

  it('o núcleo abre para um ambiente no térreo e para o corredor em cima', () => {
    expect(plano.sobrado!.portas.terreo).not.toBeNull();
    expect(plano.sobrado!.portas.superior).toMatch(/circula/i);
    for (const L of [T, S]) expect(r.spaces.some((s) => s.levelId === L && s.name === 'Escada')).toBe(true);
  });

  it('o programa inteiro atendido nos dois pavimentos: social e serviço embaixo, íntimo em cima', () => {
    expect(plano.resumo.ambientesAtendidos).toBe(plano.resumo.ambientesPedidos);
    const nomes = (L: string) => r.spaces.filter((s) => s.levelId === L).map((s) => s.name ?? '');
    expect(nomes(T).some((n) => /sala/i.test(n))).toBe(true);
    expect(nomes(T).some((n) => /dormit|su[ií]te/i.test(n))).toBe(false);
    expect(nomes(S).filter((n) => /dormit|su[ií]te/i.test(n)).length).toBeGreaterThanOrEqual(3);
    expect(plano.resumo.regrasVioladas).toBe(0);
  });

  it('o superior não tem porta para a rua', () => {
    const anel = plano.implantacao!.anelNoMundo;
    const naFachada = (a: Point, b: Point) => anel.some((p, i) => {
      const q = anel[(i + 1) % anel.length];
      const col = (x: Point) => Math.abs((q.x - p.x) * (x.y - p.y) - (q.y - p.y) * (x.x - p.x)) / Math.hypot(q.x - p.x, q.y - p.y) < 5;
      return col(a) && col(b);
    });
    const externas = new Set(r.walls.filter((w) => w.levelId === S && naFachada(w.a, w.b)).map((w) => w.id));
    expect(externas.size).toBeGreaterThan(0);
    expect(r.openings.filter((o) => externas.has(o.wallId) && (o.kind === 'door' || o.kind === 'sliding'))).toEqual([]);
  });

  it('TO pela projeção, CA pela soma dos pavimentos — dentro da zona', () => {
    const i = plano.implantacao!;
    expect(i.pavimentos).toBe(2);
    expect(i.medidas.toPct).toBeLessThanOrEqual(60);
    expect(i.medidas.coeficiente).toBeCloseTo((2 * i.medidas.projecaoM2) / i.medidas.loteM2, 1);
    expect(i.medidas.coeficiente).toBeLessThanOrEqual(1.2);
    expect(plano.etapas.find((e) => e.id === 'IMPLANTACAO')!.nota).toMatch(/2 pavimentos/);
  });

  it('todas as etapas rodam como na térrea do mesmo lote (F12c: as instalações também)', () => {
    const terrea = planejarCasa(m, entrada(m));
    expect(plano.etapas.map((e) => [e.id, e.situacao])).toEqual(terrea.etapas.map((e) => [e.id, e.situacao]));
    expect(plano.pendencias.some((p) => /^Sobrado:/.test(p.texto))).toBe(false);
  });

  it('a trava: reaplicado no original dá os mesmos ids e o mesmo modelo — o pavimento de cima incluso', () => {
    expect(conferirPlanoDaCasa(m, plano)).toEqual({ ok: true });
    expect(snapshotHash(applyBatch(m, plano.comandos).model)).toBe(snapshotHash(r));
  });

  it('lote GIRADO 30°: o sobrado sai igual (dois pavimentos, escada, trava ok)', () => {
    const g = lote(30);
    const p = planejarCasa(g, entrada(g), { pavimentos: 2 });
    expect(p.sobrado).not.toBeNull();
    expect(p.resultado.stairs).toHaveLength(1);
    expect(p.resumo.ambientesAtendidos).toBe(p.resumo.ambientesPedidos);
    expect(conferirPlanoDaCasa(g, p)).toEqual({ ok: true });
  });

  it('zona que só permite um pavimento: a implantação diz por quê e nada é lançado', () => {
    const p = planejarCasa(m, entrada(m, { ctx: { ...entrada(m).ctx, zona: { ...ZONA, gabaritoPavimentos: 1 } } }), { pavimentos: 2 });
    expect(p.comandos).toEqual([]);
    expect(p.etapas[0]).toMatchObject({ id: 'IMPLANTACAO', situacao: 'NAO_RODOU' });
    expect(p.etapas[0].nota).toMatch(/1 pavimento.*térrea/);
  });
});

describe('planejarCasa — F12b: a estrutura e o telhado do sobrado', () => {
  const m = lote();
  const plano = planejarCasa(m, entrada(m), { pavimentos: 2 });
  const T = m.levels[0].id;
  const r = plano.resultado;
  const S = plano.sobrado!.nivelSuperiorId;
  const pecas = (L: string, kind: string) => (r.structures ?? []).filter((x) => x.levelId === L && x.kind === kind);
  const dist = (p: Point, a: Point, b: Point) => {
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L;
    return { t, L, d: Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / L };
  };
  const noCorpo = (p: Point, a: Point, b: Point, meia: number) => {
    const x = dist(p, a, b);
    return x.t >= -meia && x.t <= x.L + meia && x.d <= meia + 5;
  };

  it('todo pilar sobre uma parede do próprio pavimento', () => {
    for (const L of [T, S]) {
      for (const pil of pecas(L, 'PILAR')) expect(r.walls.some((w) => w.levelId === L && noCorpo(pil.pontos[0], w.a, w.b, w.thicknessMm / 2))).toBe(true);
    }
  });

  it('pilar do superior é PRUMADA: tem pilar embaixo no mesmo ponto, ou nasce numa viga do térreo', () => {
    const vigasT = pecas(T, 'VIGA');
    for (const pil of pecas(S, 'PILAR')) {
      const at = pil.pontos[0];
      const emPrumada = pecas(T, 'PILAR').some((x) => Math.hypot(x.pontos[0].x - at.x, x.pontos[0].y - at.y) <= Math.max(pil.larguraMm, pil.profundidadeMm) / 2);
      const naViga = vigasT.some((v) => noCorpo(at, v.pontos[0], v.pontos[1], v.larguraMm / 2 + Math.max(pil.larguraMm, pil.profundidadeMm) / 2));
      expect(emPrumada || naViga).toBe(true);
    }
    expect(pecas(S, 'PILAR').length).toBeGreaterThan(10);
  });

  it('toda parede do superior tem embaixo uma parede ou uma viga do térreo (as vigas de transição)', () => {
    const apoios = [...r.walls.filter((w) => w.levelId === T).map((w) => ({ a: w.a, b: w.b, meia: w.thicknessMm / 2 })), ...pecas(T, 'VIGA').map((v) => ({ a: v.pontos[0], b: v.pontos[1], meia: v.larguraMm / 2 }))];
    let soltoMm = 0;
    for (const w of r.walls.filter((x) => x.levelId === S)) {
      const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
      const n = Math.max(1, Math.round(L / 100));
      for (let k = 0; k < n; k++) {
        const p = { x: w.a.x + ((w.b.x - w.a.x) * (k + 0.5)) / n, y: w.a.y + ((w.b.y - w.a.y) * (k + 0.5)) / n };
        if (!apoios.some((x) => noCorpo(p, x.a, x.b, x.meia))) soltoMm += L / n;
      }
    }
    // Só as pontas: a viga de transição para na face da parede do térreo que a apoia.
    expect(soltoMm).toBeLessThan(1500);
    expect(plano.pendencias.some((p) => p.grupo === 'CONFERIR' && /viga\(s\) de transição/.test(p.texto))).toBe(true);
  });

  it('a laje do térreo é o piso de cima e tem o FURO da escada; fundação só no térreo, e uma por pilar do térreo', () => {
    expect(pecas(T, 'LAJE').length).toBeGreaterThan(0);
    expect(pecas(S, 'LAJE').length).toBeGreaterThan(0);
    const furos = furosDaEscada(r);
    expect(furos).toHaveLength(1);
    expect(pecas(T, 'LAJE').some((l) => l.id === furos[0].structuralId)).toBe(true);
    expect(furos[0].areaMm2 / 1e6).toBeGreaterThan(4);
    const fundacoes = (r.structures ?? []).filter((x) => ['BLOCO', 'SAPATA', 'ESTACA', 'BALDRAME'].includes(x.kind));
    expect(fundacoes.length).toBeGreaterThan(0);
    expect(fundacoes.every((x) => x.levelId === T)).toBe(true);
    expect(plano.resumo.estrutura.blocos).toBe(pecas(T, 'PILAR').length);
  });

  it('o telhado fica sobre o superior; corrimãos nos lances e guarda-corpo na borda do furo', () => {
    expect(r.roofs.filter((x) => x.levelId === S).length).toBeGreaterThan(0);
    expect(r.roofs.filter((x) => x.levelId === T)).toEqual([]);
    const g = r.guardaCorpos ?? [];
    expect(g.filter((x) => x.levelId === T && x.tipo === 'CORRIMAO')).toHaveLength(4);
    expect(g.filter((x) => x.levelId === S && x.tipo === 'GUARDA_CORPO')).toHaveLength(1);
  });

  it('pilar do superior que fica fora cai sobre porta ou janela do térreo — nunca no meio de um cômodo (há viga de transição)', () => {
    expect(plano.pendencias.filter((p) => /meio de um cômodo/.test(p.texto))).toEqual([]);
    const fora = plano.pendencias.filter((p) => /Pilares: .*porta ou janela/.test(p.texto));
    expect(fora.length).toBeLessThanOrEqual(1);
  });

  it('a estrutura e a arquitetura sozinhas: nenhum conflito; a trava confere o lote inteiro', () => {
    const so = planejarCasa(m, entrada(m), { pavimentos: 2, hidraulica: { lancar: false }, eletrica: { ...HIPOTESES_DA_ELETRICA_DA_CASA_PADRAO, lancar: false } });
    expect(conflitosDoModelo(so.resultado)).toEqual([]);
    expect(conferirPlanoDaCasa(m, plano)).toEqual({ ok: true });
  });

  it('estrutura desligada: só a arquitetura e o telhado (sem laje, direto na parede)', () => {
    const p = planejarCasa(m, entrada(m), { pavimentos: 2, estrutura: { ...HIPOTESES_DA_ESTRUTURA_DA_CASA_PADRAO, lancar: false } });
    expect(p.etapas.filter((e) => ['PILARES', 'VIGAS', 'LAJES', 'FUNDACOES', 'EIXOS'].includes(e.id)).every((e) => e.situacao === 'NAO_EXIGIDA')).toBe(true);
    expect(p.resultado.structures ?? []).toEqual([]);
    expect(p.etapas.find((e) => e.id === 'TELHADO')!.situacao).toBe('LANCOU');
  });
});

describe('planejarCasa — F12c: as instalações do sobrado', () => {
  const m = lote();
  const comChuva = { hidro: { ...HIPOTESES_HIDRO_PADRAO, pluvial: { ...HIPOTESES_PLUVIAIS_PADRAO, intensidadeMmH: 150 } } };
  const plano = planejarCasa(m, entrada(m, comChuva), { pavimentos: 2 });
  const T = m.levels[0].id;
  const r = plano.resultado;
  const S = plano.sobrado!.nivelSuperiorId;
  const ts = (L: string) => (r.terminais ?? []).filter((t) => t.levelId === L);

  it("a caixa d'água fica em cima, acima da laje do superior; aquecedor, caixa de gordura e vagas, embaixo", () => {
    const caixa = (r.terminais ?? []).filter((t) => t.tipoHidraulico === 'RESERVATORIO');
    expect(caixa).toHaveLength(1);
    expect(caixa[0].levelId).toBe(S);
    expect(caixa[0].cotaMm).toBeGreaterThan(2800 + 100);
    expect(ts(T).some((t) => t.tipoHidraulico === 'AQUECEDOR')).toBe(true);
    expect(ts(T).some((t) => t.tipoHidraulico === 'CAIXA_GORDURA')).toBe(true);
    expect((r.vagas ?? []).every((v) => v.levelId === T)).toBe(true);
    expect((r.vagas ?? []).length).toBe(2);
  });

  it('louças e pontos nos dois pavimentos; água, esgoto e pluvial lançados, nenhuma ponta aberta', () => {
    for (const L of [T, S]) expect(ts(L).filter((t) => t.disciplina === 'ESGOTO').length).toBeGreaterThan(0);
    for (const id of ['AGUA', 'ESGOTO', 'PLUVIAL']) expect(plano.etapas.find((e) => e.id === id)!.situacao).toBe('LANCOU');
    expect(plano.resumo.hidraulica.verificacao.erros).toBe(0);
  });

  it('o SHAFT junto do banheiro de cima leva o tubo de queda: ele não desce pelo meio de um cômodo do térreo', () => {
    const shafts = (r.nucleos ?? []).filter((n) => n.tipo === 'SHAFT');
    expect(shafts.length).toBeGreaterThan(0);
    for (const n of shafts) expect([n.levelId, n.ateLevelId]).toEqual([T, S]);
    const tq = (r.trechos ?? []).filter((t) => t.levelId === T && t.rotulo === 'TQ' && t.a.x === t.b.x && t.a.y === t.b.y);
    expect(tq.length).toBeGreaterThan(0);
    for (const t of tq) expect(shafts.some((n) => pointInPolygon(n.ring, t.a))).toBe(true);
    expect(plano.etapas.find((e) => e.id === 'ANCORAS')!.nota).toMatch(/shaft/);
  });

  it('nenhuma prumada pelo meio de cômodo de outro pavimento — nem a ventilação, que agora sobe na parede', () => {
    expect(prumadasPeloMeioDoComodo(r)).toEqual([]);
    expect(plano.pendencias.some((p) => /^Prumada pelo meio do cômodo/.test(p.texto))).toBe(false);
  });

  it('um quadro, no térreo, numa parede com parede em cima; circuitos nos dois pavimentos e todo ponto com potência ligado', () => {
    expect(r.quadros ?? []).toHaveLength(1);
    const q = r.quadros![0];
    expect(q.levelId).toBe(T);
    const naParede = (L: string) => r.walls.some((w) => {
      if (w.levelId !== L) return false;
      const L2 = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
      const t = ((q.at.x - w.a.x) * (w.b.x - w.a.x) + (q.at.y - w.a.y) * (w.b.y - w.a.y)) / L2;
      return t >= -1 && t <= L2 + 1 && Math.abs((q.at.x - w.a.x) * (w.b.y - w.a.y) - (q.at.y - w.a.y) * (w.b.x - w.a.x)) / L2 <= w.thicknessMm / 2 + 5;
    });
    expect(naParede(T) && naParede(S)).toBe(true);
    expect(plano.etapas.find((e) => e.id === 'CIRCUITOS')!.nota).toMatch(/no térreo, \d+ no superior/);
    const comPotencia = (r.terminais ?? []).filter((t) => t.disciplina === 'ELETRICA' && (t.potenciaW ?? 0) > 0);
    expect(comPotencia.some((t) => t.levelId === S)).toBe(true);
    expect(comPotencia.every((t) => t.circuitoId)).toBe(true);
  });

  it('R1-B: os chuveiros elétricos dos banheiros de cima são ligação direta, com circuito', () => {
    const p = planejarCasa(m, entrada(m, { curto: { ...PROGRAMA_CURTO_PADRAO, padrao: 'R1-B' } }), { pavimentos: 2 });
    const lig = (p.resultado.terminais ?? []).filter((t) => t.tipoEletrico === 'LIGACAO_DIRETA');
    const chuveiros = (p.resultado.terminais ?? []).filter((t) => t.tipoHidraulico === 'CHUVEIRO' && t.disciplina === 'AGUA_FRIA');
    expect(lig.length).toBe(chuveiros.length);
    expect(lig.length).toBeGreaterThan(0);
    expect(lig.every((t) => t.levelId === S && t.circuitoId)).toBe(true);
  });

  it('a trava confere o lote inteiro (dois pavimentos, estrutura e instalações)', () => {
    expect(conferirPlanoDaCasa(m, plano)).toEqual({ ok: true });
  });
});

describe('planejarCasa — F12c: a climatização do sobrado', () => {
  const modelos = modelosDoCatalogo(SEMENTES_DE_TIPOS.map((s, i) => ({ id: `t${i}`, nome: s.nome, familia: s.propriedades.familia, active: true, propriedades: s.propriedades })));
  const m = lote();
  const p = planejarCasa(
    m,
    entrada(m, {
      hidro: { ...HIPOTESES_HIDRO_PADRAO, pluvial: { ...HIPOTESES_HIDRO_PADRAO.pluvial, intensidadeMmH: 150 } },
      modelosDeClimatizacao: modelos,
      climatizacao: { ...HIPOTESES_CLIMATIZACAO_PADRAO, clima: { cidade: null, tbsExternaC: 34, tbuExternaC: 25, altitudeM: 0 } },
    }),
    { pavimentos: 2 },
  );
  const r = p.resultado;
  const T = m.levels[0].id;
  const S = p.sobrado!.nivelSuperiorId;

  it('as seis etapas elétricas lançadas, a NBR 5410 sem falta e nenhum ponto solto em nenhum pavimento', () => {
    expect(['PONTOS_ELETRICOS', 'QUADRO', 'CIRCUITOS', 'CLIMATIZACAO', 'DR_DPS', 'ELETRODUTOS'].map((id) => p.etapas.find((e) => e.id === id)?.situacao)).toEqual(Array(6).fill('LANCOU'));
    expect(p.resumo.eletrica.conferencia.faltas).toBe(0);
    expect(pontosElegiveis(r, T)).toEqual([]);
    expect(pontosElegiveis(r, S)).toEqual([]);
  });

  it('um split por ambiente climatizável — a sala embaixo; a suíte e os dois dormitórios em cima — e a rede de ar sem erro', () => {
    expect(p.resumo.climatizacao.equipamentos).toBe(4);
    const splits = (r.terminais ?? []).filter((t) => t.tipoEletrico === 'AR_CONDICIONADO');
    expect(splits.filter((t) => t.levelId === T)).toHaveLength(1);
    expect(splits.filter((t) => t.levelId === S)).toHaveLength(3);
    expect(p.resumo.climatizacao.verificacao.erros).toBe(0);
    expect(conferirPlanoDaCasa(m, p)).toEqual({ ok: true });
  });
});

describe('planejarCasa — a pressão nos pontos fica DITA (15/10/2026)', () => {
  it.each([1, 2] as const)('%i pavimento(s): cada rede com ponto abaixo do mínimo vira uma pendência, com a contagem do cálculo do app', (pavimentos) => {
    const m = lote();
    const p = planejarCasa(m, entrada(m), { pavimentos });
    const porRede = pressoesDoModelo(p.resultado).map((r) => ({ d: r.disciplina, n: r.pontos.filter((x) => x.estado === 'INSUFICIENTE' && x.disponivelKpa != null).length }));
    for (const { d, n } of porRede) {
      const rotulo = d === 'AGUA_QUENTE' ? 'água quente' : 'água fria';
      const pend = p.pendencias.filter((x) => x.texto.startsWith(`Pressão da ${rotulo}:`));
      expect(pend).toHaveLength(n > 0 ? 1 : 0);
      if (n > 0) {
        expect(pend[0].grupo).toBe('VERIFICACAO');
        expect(pend[0].texto.startsWith(`Pressão da ${rotulo}: ${n} ponto(s) abaixo do mínimo`)).toBe(true);
        expect(pend[0].texto).toMatch(/eleve a caixa .* ou preveja um pressurizador/);
      }
      expect(p.resumo.hidraulica.pressaoInsuficiente[d === 'AGUA_QUENTE' ? 'quente' : 'fria']).toBe(n);
    }
  });
});

describe('planejarCasa — F13: a pressão por caso (caixa elevada ou pressurizador)', () => {
  const m = lote();
  const pressoesOk = (r: BlueprintModel) => pressoesDoModelo(r).every((x) => x.pontos.every((p) => p.estado !== 'INSUFICIENTE'));

  it.each([1, 2] as const)('%i pavimento(s), padrão (até 2 m): o déficit passa do limite — pressurizador na saída da caixa, com ponto elétrico e circuito; nenhum ponto abaixo do mínimo', (pavimentos) => {
    const p = planejarCasa(m, entrada(m), { pavimentos });
    const r = p.resultado;
    const caixa = r.terminais.find((t) => t.tipoHidraulico === 'RESERVATORIO')!;
    const bombas = r.terminais.filter((t) => t.tipoHidraulico === 'BOMBA');
    expect(bombas).toHaveLength(1);
    expect(bombas[0].levelId).toBe(caixa.levelId);
    expect(Math.hypot(bombas[0].at.x - caixa.at.x, bombas[0].at.y - caixa.at.y)).toBeLessThanOrEqual(600);
    const lig = r.terminais.filter((t) => t.disciplina === 'ELETRICA' && t.rotulo === 'Pressurizador');
    expect(lig).toHaveLength(1);
    expect(lig[0]).toMatchObject({ tipoEletrico: 'LIGACAO_DIRETA', potenciaW: HIPOTESES_DA_PRESSAO_DA_CASA_PADRAO.potenciaDoPressurizadorW });
    expect(lig[0].circuitoId).toBeTruthy();
    expect(pressoesOk(r)).toBe(true);
    expect(p.resumo.hidraulica.pressaoInsuficiente).toEqual({ fria: 0, quente: 0 });
    expect(p.pendencias.some((x) => x.grupo === 'CONFERIR' && /^Pressão: faltavam .* pressurizador na saída da caixa/.test(x.texto))).toBe(true);
    expect(p.etapas.find((e) => e.id === 'AGUA')!.nota).toMatch(/pressurizador/);
    expect(conferirPlanoDaCasa(m, p)).toEqual({ ok: true });
  });

  it('com espaço para a torre (até 10 m): a caixa sobe o que precisa, sem bomba; nenhum ponto abaixo do mínimo', () => {
    const p = planejarCasa(m, entrada(m), { pressao: { ...HIPOTESES_DA_PRESSAO_DA_CASA_PADRAO, caixaElevadaAteMm: 10000 } });
    const r = p.resultado;
    expect(r.terminais.filter((t) => t.tipoHidraulico === 'BOMBA')).toEqual([]);
    const caixa = r.terminais.find((t) => t.tipoHidraulico === 'RESERVATORIO')!;
    expect(caixa.cotaMm).toBeGreaterThan(3200);
    expect(caixa.cotaMm).toBeLessThanOrEqual(3200 + 10000);
    expect(pressoesOk(r)).toBe(true);
    expect(p.pendencias.some((x) => x.grupo === 'CONFERIR' && /^Pressão: a caixa d'água subiu/.test(x.texto))).toBe(true);
    expect(conferirPlanoDaCasa(m, p)).toEqual({ ok: true });
  });

  it('desligado: nada muda na caixa, sem bomba — e a pendência de pressão diz o que falta', () => {
    const p = planejarCasa(m, entrada(m), { pressao: { ...HIPOTESES_DA_PRESSAO_DA_CASA_PADRAO, resolver: false } });
    expect(p.resultado.terminais.filter((t) => t.tipoHidraulico === 'BOMBA')).toEqual([]);
    expect(p.pendencias.some((x) => x.grupo === 'VERIFICACAO' && /^Pressão da água quente: \d+ ponto/.test(x.texto))).toBe(true);
  });
});
