/**
 * Casa automática F3 (14/10/2026): o orquestrador `planejarCasa` — implantação → arquitetura
 * (E6.2, várias sementes) → conferência — num lote só, e a trava `conferirPlanoDaCasa`.
 * Plano: `docs/planos/2026-10-14-casa-automatica.md`.
 */
import { describe, expect, it, vi } from 'vitest';
import { applyBatch, applyCommand, conflitosDoModelo, emptyModel, furosDaEscada, medirEscada, point, pointInPolygon, snapshotHash, type BlueprintModel, type Command, type Point } from '../utils/blueprintKernel';
import { ROTULO_DO_ALIMENTADOR } from '../utils/blueprintAlimentador';
import { medirTerreno, type Recuos } from '../utils/blueprintTerreno';
import { ZONA_DA_MASSA_VAZIA, type ZonaDaMassa } from '../utils/blueprintMassa';
import { forroDaAguaDaCasa, forroDaCasaCompleto, forroEletricoDaCasa, conferirPlanoDaCasa, problemasDoPlano, HIPOTESES_DO_FORRO_DA_CASA_PADRAO, rebaixoDoForroMm, HIPOTESES_DA_ELETRICA_DA_CASA_PADRAO, HIPOTESES_DA_PRESSAO_DA_CASA_PADRAO, HIPOTESES_DA_ESTRUTURA_DA_CASA_PADRAO, motivoParaNaoGerar, planejarCasa, type EntradaDaCasa } from '../utils/blueprintCasaAutomatica';
import { prumadasPeloMeioDoComodo } from '../utils/blueprintSobrado';
import { amostradorDaGrade, type GradeDeElevacao } from '../utils/blueprintTopografia';
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
import { HIPOTESES_DO_MURO_DA_CASA_PADRAO } from '../utils/blueprintMuroDaCasa';
import { furosPrevistos } from '../utils/blueprintFurosPrevistos';
import { registroDe } from '../utils/blueprintRegistroDeLancamento';
import {
  MOTIVO_REDE_NO_FORRO_SEM_REGISTRO,
  botaoDeLancarEletrodutos,
  comandosDeRefazerEletrodutos,
  diferencasDoEletroduto,
  hipotesesDoQuadro,
  motivoParaNaoRelancar,
  planejarEletrodutosPorQuadro,
  redesARefazer,
} from '../utils/blueprintEscolhasDoEletroduto';
import { PREMISSAS_DA_CASA_PADRAO, hipotesesDasPremissas } from '../utils/blueprintPremissasDaCasa';
import { HIPOTESES_ELETRODUTO_PADRAO } from '../utils/blueprintEletrodutos';
import { REGRA_DE_CAIXAS_PADRAO } from '../utils/blueprintCaixasDePassagem';
import { HIPOTESES_PADRAO as HIPOTESES_ELETRICAS_PADRAO } from '../utils/blueprintEletricaDimensionamento';
import { MOTIVO_AGUA_NO_FORRO_SEM_REGISTRO, comandosDeRefazerAgua, diferencasDaAgua, diferencasDoPluvial, motivoParaNaoRelancarAgua } from '../utils/blueprintEscolhasDaAguaEPluvial';
import { planejarAguaCompleta } from '../utils/blueprintAguaCompleta';

// Cada teste aqui gera a CASA INTEIRA (arquitetura → estrutura → telhado → louças → água, esgoto e pluvial):
// ~0,5–0,8 s nesta máquina, e a CI, disputando CPU com a suíte toda, chegou a passar dos 5 s do padrão
// (15/10/2026, run 38725612771). O limite é do arquivo, não um teste lento escondido.
// 18/10/2026: com as redes, a climatização e o forro, uma dúzia de casas leva 15–30 s na CI, e um runner lento (run
// 39102863222: transform, import e setup 1,8× mais lentos que no run anterior, em código não tocado) passou o F9 de
// 30 s — antes, 15,6 s. Os mais pesados seguem com prazo próprio (240 s).
vi.setConfig({ testTimeout: 120_000 });

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

/** F14b: a verificação de rede sem erro e sem aviso além da travessia de viga no forro (furo a aprovar — a F14c lista). */
const semMarcaAlemDoFuro = (v: { erros: number; porTipo: Record<string, number> }) => {
  expect(v.erros).toBe(0);
  expect(Object.keys(v.porTipo).filter((k) => k !== 'CRUZA_VIGA')).toEqual([]);
};

const nomeados = (m: BlueprintModel, levelId: string) => m.spaces.filter((s) => s.levelId === levelId && (s.name ?? '').trim()).length;

describe('planejarCasa — lote 12 × 30, frente ao sul', () => {
  const m = lote();
  const plano = planejarCasa(m, entrada(m));
  const L = m.levels[0].id;

  it('as etapas na ordem: implantação, arquitetura, estrutura (pilares → vigas → lajes → fundações → eixos), conferência', () => {
    expect(plano.etapas.map((e) => [e.id, e.situacao])).toEqual([
      ['IMPLANTACAO', 'CALCULOU'],
      ['ARQUITETURA', 'LANCOU'],
      ['MURO', 'LANCOU'],
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
      ['FORRO', 'LANCOU'],
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
    // F26: + a etapa MURO.
    expect(p.etapas.map((e) => e.situacao)).toEqual(Array(24).fill('NAO_RODOU'));
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
    // F26: o muro, os portões e as calçadas entram logo depois da arquitetura — fora da conta.
    expect(p.comandos.filter((c) => c.type !== 'AddMuro' && c.type !== 'AddSubRegiao').slice(0, 4).map((c) => c.type)).toEqual(['AddWalls', 'AddOpenings', 'PlaceSpaceLabels', 'AddRoofByExtrusion']);
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
    // A rede sai LIGADA e COMPATÍVEL (F8b): a verificação de rede do app sem marca — nem ponta aberta, nem trecho sem
    // destino, nem tubo atravessando pilar, nem desconector sem ventilação. F14b ("manter 2,80 m, furar vigas"): a
    // travessia de viga no forro é o único aviso aceito — FURO A APROVAR (CRUZA_VIGA), a lista da F14c.
    semMarcaAlemDoFuro(h.verificacao);
    // (F9: as redes que passam por porta ou janela são OUTRA pendência — `resumo.aberturas` —, compatibilização à parte.)
    // F14b: a travessia de viga é furo a aprovar (pendência CONFERIR que a F14c transforma na lista do calculista).
    expect(p.pendencias.filter((x) => /^Rede de /.test(x.texto) && !/porta ou janela|furo a aprovar/.test(x.texto))).toEqual([]);
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
  }, 120_000);

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
  it.each([0, 30])('lote a %i°: o alimentador não entra em baldrame nem toca pilar — F17: sobe pela fachada, ao lado do baldrame', (graus) => {
    const m = lote(graus);
    const p = planejarCasa(m, entrada(m, { hidro: { ...HIPOTESES_HIDRO_PADRAO, pluvial: { ...HIPOTESES_HIDRO_PADRAO.pluvial, intensidadeMmH: 150 } } }));
    const r = p.resultado;
    const alimentador = (r.trechos ?? []).filter((t) => t.rotulo === ROTULO_DO_ALIMENTADOR);
    expect(alimentador.length).toBeGreaterThan(0);
    const peca = new Map(r.structures.map((x) => [x.id, x]));
    const encontros = conflitosDoModelo({ ...r, trechos: alimentador }).filter((c) => c.classe === 'ESTRUTURA' && c.comprimentoDentroMm > 0);
    expect(encontros.filter((c) => peca.get(c.outroId)!.kind === 'PILAR')).toEqual([]);
    // F17 ("sobe pela fachada"): enterrado só até a parede da frente — o pé fica ao lado do baldrame dela e entra na
    // parede acima dele (F8c). Antes ele corria por baixo da casa e ATRAVESSAVA o baldrame (e cruzava o esgoto).
    expect(encontros.filter((c) => peca.get(c.outroId)!.kind === 'VIGA_FUNDACAO')).toEqual([]);
    const enterrado = alimentador.filter((t) => t.cotaAMm < 0 && t.cotaBMm < 0 && (t.a.x !== t.b.x || t.a.y !== t.b.y));
    expect(enterrado.length).toBeGreaterThan(0);
    const contorno = r.spaces.filter((s) => s.levelId === r.levels[0].id).map((s) => s.ring);
    for (const t of enterrado) expect(contorno.some((g) => pointInPolygon(g, t.a) || pointInPolygon(g, t.b)), JSON.stringify(t)).toBe(false);
    semMarcaAlemDoFuro(p.resumo.hidraulica.verificacao);
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

  it.each([0, 30])('lote a %i°: tudo lançado, a NBR 5410 sem falta, todo ponto de carga com circuito, um split por ambiente climatizável; na estrutura, só a viga atravessada (furo a aprovar)', (graus) => {
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
    semMarcaAlemDoFuro(p.resumo.climatizacao.verificacao);
    // Eletroduto, linha e dreno do ar: nenhum pilar; a viga só ATRAVESSADA (F14b: a travessia no forro e a subida do
    // quadro — furo a aprovar), nunca correndo por dentro dela. A laje é a passagem prevista.
    const peca = new Map(r.structures.map((x) => [x.id, x]));
    const novas = (r.trechos ?? []).filter((t) => ['ELETRICA', 'FRIGORIGENA', 'DRENO_AC'].includes(t.disciplina));
    const naEstrutura = conflitosDoModelo({ ...r, trechos: novas }).filter((c) => c.classe === 'ESTRUTURA' && c.comprimentoDentroMm > 0);
    expect(naEstrutura.filter((c) => peca.get(c.outroId)!.kind === 'PILAR')).toEqual([]);
    for (const c of naEstrutura.filter((x) => peca.get(x.outroId)!.kind === 'VIGA')) {
      const v = peca.get(c.outroId)!;
      // Atravessar é passar de lado a lado (a largura) ou subir por ela (a altura) — no quadro, os dois, em "L".
      expect(c.comprimentoDentroMm).toBeLessThanOrEqual((v.larguraMm + v.alturaMm) * 1.2);
    }
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
      // F18: AO LADO da saída d'água (o afastamento lateral dos pontos, 15 cm) — no mesmo ponto, a água e o eletroduto
      // desciam juntos na parede e se cruzavam.
      expect(chuveiros.some((c) => Math.hypot(c.at.x - d.at.x, c.at.y - d.at.y) <= 150 + 1), JSON.stringify(d.at)).toBe(true);
      expect(d.circuitoId).toBeTruthy();
      // Circuito só dele.
      expect((r.terminais ?? []).filter((t) => t.circuitoId === d.circuitoId)).toHaveLength(1);
      expect((r.quadros ?? [])[0].drs?.some((dr) => (dr.circuitoIds ?? []).includes(d.circuitoId!))).toBe(true);
    }
    expect(p.resumo.eletrica.conferencia.faltas).toBe(0);
  });

  // F2 do plano 2026-10-24-relancar-quando-escolha-muda.md (24/10/2026): a casa usa a preferência do usuário de caixas
  // de passagem (padrão "pela luz do teto", sem caixas) — antes forçava a hipótese do planejador, com caixas — e o lote
  // registra com que escolhas os eletrodutos foram lançados (o painel avisa quando as de lá diferem).
  it('⚠️ F2: com a preferência padrão a casa não insere caixa de passagem e registra o lançamento; com "CAIXAS", registra CAIXAS', () => {
    const m = lote();
    const p = planejarCasa(m, comAr(m));
    const r = p.resultado;
    expect(p.etapas.find((e) => e.id === 'ELETRODUTOS')?.situacao).toBe('LANCOU');
    expect((r.terminais ?? []).filter((t) => t.tipoEletrico === 'CAIXA_PASSAGEM')).toEqual([]);
    const qdc = (r.quadros ?? [])[0];
    // F3 (24/10/2026): a água e o pluvial também registram — um registro por motor.
    expect(p.comandos.flatMap((c) => (c.type === 'RegistrarLancamento' ? [c.motor] : [])).sort()).toEqual(['AGUA', 'ELETRODUTOS', 'PLUVIAL']);
    expect(registroDe(r, 'ELETRODUTOS', qdc.id)?.escolhas).toMatchObject({ caixasDePassagem: 'PELA_LUZ', encaminhamento: 'PELA_LUZ_DO_AMBIENTE' });
    // Correção 2: com o painel dos eletrodutos no PADRÃO (o do editor: sem caixas), a casa recém-gerada não acende o aviso.
    // Painel fora do padrão (outra bitola, rota pela parede…) acende — diferença real.
    expect(diferencasDoEletroduto(r, qdc.id, { ...HIPOTESES_ELETRODUTO_PADRAO, caixas: null }, HIPOTESES_ELETRICAS_PADRAO)).toEqual([]);
    expect(diferencasDoEletroduto(r, qdc.id, { ...HIPOTESES_ELETRODUTO_PADRAO, caixas: null, bitolaMm: 32 }, HIPOTESES_ELETRICAS_PADRAO).map((d) => d.item)).toEqual(['bitolaMm']);
    expect(conferirPlanoDaCasa(m, p)).toEqual({ ok: true });

    const comCaixas = planejarCasa(m, comAr(m, { caixasDePassagem: 'CAIXAS' }));
    expect(registroDe(comCaixas.resultado, 'ELETRODUTOS', (comCaixas.resultado.quadros ?? [])[0].id)?.escolhas.caixasDePassagem).toBe('CAIXAS');
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

describe('planejarCasa — F27-D: a casa de 3 pavimentos (implantação, arquitetura, estrutura e instalações)', () => {
  const m = lote();
  const z3 = (gabaritoPavimentos: number | null, gabaritoAlturaMaxM: number | null = null) => entrada(m, { ctx: { ...entrada(m).ctx, zona: { ...ZONA, gabaritoPavimentos, gabaritoAlturaMaxM, coeficienteMax: null } } });
  const alto = { ...PROGRAMA_CURTO_PADRAO, dormitorios: 4, suites: 2, banheiros: 3, padrao: 'R1-A' as const };
  // F27-D5: com o terraço, a projeção passa de 100 m² — a intensidade da chuva tem de ser informada (NBR 10844, 5.1.4).
  const chuva = { ...HIPOTESES_HIDRO_PADRAO, pluvial: { ...HIPOTESES_HIDRO_PADRAO.pluvial, intensidadeMmH: 150 } };
  const plano = planejarCasa(m, { ...z3(3), curto: alto, hidro: chuva }, { pavimentos: 3 });
  const r = plano.resultado;

  it('se implanta em 3 (o CA contando três andares)', () => {
    expect(plano.etapas[0]).toMatchObject({ id: 'IMPLANTACAO', situacao: 'CALCULOU' });
    expect(plano.implantacao?.pavimentos).toBe(3);
    const md = plano.implantacao!.medidas;
    expect(md.coeficiente).toBeCloseTo(Math.round(((md.projecaoM2 * 3) / md.loteM2) * 100) / 100, 2);
  });

  it('a arquitetura sai em três níveis empilhados, com duas escadas no mesmo núcleo', () => {
    expect(plano.etapas.find((e) => e.id === 'ARQUITETURA')).toMatchObject({ situacao: 'LANCOU' });
    expect(r.levels).toHaveLength(3);
    const [t, p1, p2] = [...r.levels].sort((a, b) => a.elevationMm - b.elevationMm);
    expect(p2.elevationMm - p1.elevationMm).toBe(p1.elevationMm - t.elevationMm);
    expect(r.stairs.map((e) => e.levelId).sort()).toEqual([t.id, p1.id].sort());
    expect(r.stairs[0].pontos).toEqual(r.stairs[1].pontos);

  });

  it('o 2º recuado dentro do 1º (recuado ou não — F27 item 5.3), com o terraço; o núcleo abre para o corredor nos três', () => {
    const seg = plano.sobrado!.segundo!;
    const rl = plano.implantacao!.retanguloLocal;
    const casa = plano.sobrado!.primeiro?.retangulo ?? rl;
    type R = { x0: number; y0: number; x1: number; y1: number };
    const dentro = (a: R, b: R) => a.x0 >= b.x0 && a.x1 <= b.x1 && a.y0 >= b.y0 && a.y1 <= b.y1;
    expect(dentro(casa, rl)).toBe(true);
    // O 2º anda até o corredor cair no patamar da escada (nunca encolhe): dentro do 1º, não necessariamente nos fundos.
    expect(dentro(seg.retangulo, casa)).toBe(true);
    expect(seg.retangulo.y0).toBeGreaterThan(casa.y0);
    expect(seg.terracoM2).toBeGreaterThan(0);
    expect(plano.sobrado!.portas.superior).toMatch(/Circula/);
    expect(seg.porta).toMatch(/Circula/);
    const s2 = r.spaces.filter((x) => x.levelId === seg.nivelId).map((x) => x.name);
    expect(s2).toEqual(expect.arrayContaining(['Escritório']));
    expect(s2.some((n) => /^Suíte/.test(n))).toBe(true);
  });

  it('a estrutura em prumada: todo pilar do 2º desce ao 1º e ao térreo (ou nasce em viga de transição); vigas, lajes e telhado no 2º', () => {
    for (const id of ['PILARES', 'VIGAS', 'LAJES', 'FUNDACOES', 'TELHADO']) expect(plano.etapas.find((e) => e.id === id)?.situacao).toBe('LANCOU');
    const [t, p1, p2] = [...r.levels].sort((a, b) => a.elevationMm - b.elevationMm);
    const pilares = (l: string) => r.structures.filter((x) => x.levelId === l && x.kind === 'PILAR');
    const vigaEm = (l: string, at: { x: number; y: number }) =>
      r.structures.some((v) => v.levelId === l && v.kind === 'VIGA' && v.pontos.length === 2 && Math.abs((v.pontos[1].x - v.pontos[0].x) * (at.y - v.pontos[0].y) - (v.pontos[1].y - v.pontos[0].y) * (at.x - v.pontos[0].x)) / (Math.hypot(v.pontos[1].x - v.pontos[0].x, v.pontos[1].y - v.pontos[0].y) || 1) < v.larguraMm);
    const embaixo = (l: string, at: { x: number; y: number }) => pilares(l).some((x) => Math.hypot(x.pontos[0].x - at.x, x.pontos[0].y - at.y) < 300);
    expect(pilares(p2.id).length).toBeGreaterThan(0);
    for (const x of pilares(p2.id)) {
      const at = x.pontos[0];
      expect(embaixo(p1.id, at) || vigaEm(p1.id, at)).toBe(true);
      if (embaixo(p1.id, at)) expect(embaixo(t.id, at) || vigaEm(t.id, at)).toBe(true);
    }
    for (const k of ['VIGA', 'LAJE'] as const) expect(r.structures.some((x) => x.levelId === p2.id && x.kind === k)).toBe(true);
    expect((r.roofs ?? []).every((x) => x.levelId === p2.id)).toBe(true);
    expect((r.roofs ?? []).length).toBeGreaterThan(0);
  });

  it('o guarda-corpo do furo da escada só no 2º — no 1º o lance que sobe sai da borda do furo de baixo', () => {
    const [, p1, p2] = [...r.levels].sort((a, b) => a.elevationMm - b.elevationMm);
    const doFuro = (r.guardaCorpos ?? []).filter((g) => /guarda-corpo do furo/.test(g.rotulo ?? ''));
    expect(doFuro.map((g) => g.levelId)).toEqual([p2.id]);
    expect(doFuro.some((g) => g.levelId === p1.id)).toBe(false);
  });

  it('as instalações nos três: todas as etapas rodam; o banheiro do 2º com shaft que desce ao térreo atravessando o 1º; a laje do 1º rebaixada sob ele', () => {
    const [t, p1, p2] = [...r.levels].sort((a, b) => a.elevationMm - b.elevationMm);
    // Sem catálogo de evaporadoras no lote de teste, a climatização não roda (dito); o resto, todo.
    expect(plano.etapas.filter((e) => e.situacao === 'NAO_RODOU' && e.id !== 'CLIMATIZACAO').map((e) => `${e.id}: ${e.nota}`)).toEqual([]);
    const ate2 = (r.nucleos ?? []).filter((n) => n.tipo === 'SHAFT' && n.levelId === t.id && n.ateLevelId === p2.id);
    expect(ate2.length).toBeGreaterThan(0);
    const banheirosDo2 = r.spaces.filter((sp) => sp.levelId === p2.id && /^Banheiro/.test(sp.name ?? ''));
    for (const b of banheirosDo2) expect((r.terminais ?? []).some((x) => x.levelId === p2.id && x.disciplina === 'ESGOTO' && pointInPolygon(b.ring, x.at))).toBe(true);
    expect(plano.etapas.find((e) => e.id === 'LAJES')?.nota).toMatch(/a do 1º sob [1-9]/);
    expect(new Set(r.structures.filter((x) => x.levelId === p1.id && x.kind === 'LAJE').map((x) => x.baseMm)).size).toBeGreaterThan(1);
    for (const L of [t.id, p1.id, p2.id]) expect((r.terminais ?? []).some((x) => x.levelId === L && x.disciplina === 'ELETRICA')).toBe(true);
  });

  it('F27-D5: o terraço — guarda-corpo no contorno dele, no piso do 2º; o 2º com porta para o terraço', () => {
    const [, , p2] = [...r.levels].sort((a, b) => a.elevationMm - b.elevationMm);
    // F27 item 5.3: "Terraço do 1º · …" é o do terraço do 1º (no piso do 1º); o do 2º é "Terraço · …".
    const doTerraco = (r.guardaCorpos ?? []).filter((g) => /^Terraço ·/.test(g.rotulo ?? ''));
    expect(doTerraco.length).toBeGreaterThan(0);
    expect(doTerraco.every((g) => g.levelId === p2.id && g.pontos.length >= 2)).toBe(true);
    // Uma porta (ou de correr) do 2º em parede que não fica na borda da casa: a que dá para o terraço.
    const seg = plano.sobrado!.segundo!;
    const rl = plano.implantacao!.retanguloLocal;
    expect(seg.terracoM2).toBeGreaterThan(0);
    // As externas do 2º (200 mm) na borda da casa perdem a porta (`semPortaDeEntrada`): a porta que sobra numa externa
    // dá para o terraço. A do núcleo é de parede de 150 mm.
    const externasDo2 = new Set(r.walls.filter((w) => w.levelId === p2.id && w.thicknessMm >= 200).map((w) => w.id));
    const portas = r.openings.filter((o) => externasDo2.has(o.wallId) && (o.kind === 'door' || o.kind === 'sliding'));
    expect(portas.length).toBeGreaterThan(0);
    expect(rl.x1 - rl.x0).toBeGreaterThan(seg.retangulo.x1 - seg.retangulo.x0 - 1);
  });

  /** O maior dormitório (ou suíte) do 1º, m² livres. */
  const maiorDormitorioDoPrimeiro = (x: BlueprintModel) => {
    const [, p1] = [...x.levels].sort((a, b) => a.elevationMm - b.elevationMm);
    return Math.max(...x.spaces.filter((s) => s.levelId === p1.id && /Dormit|Suíte/.test(s.name ?? '')).map((s) => s.areaMm2 / 1e6));
  };

  it('F27 item 5.3 ("recuar o 1º também"): o 1º recuado, com o terraço dele — guarda-corpo no piso do 1º; os dormitórios do tamanho do programa', () => {
    expect(plano.decisoes.some((d) => /o 1º recuado em/.test(d))).toBe(true);
    const [, p1] = [...r.levels].sort((a, b) => a.elevationMm - b.elevationMm);
    const doTerraco = (r.guardaCorpos ?? []).filter((g) => /^Terraço do 1º/.test(g.rotulo ?? ''));
    expect(doTerraco.length).toBeGreaterThan(0);
    expect(doTerraco.every((g) => g.levelId === p1.id)).toBe(true);
    // Com a pegada do térreo, 27 a 28 m².
    expect(maiorDormitorioDoPrimeiro(r)).toBeLessThan(25);
  });

  it('S4: no 2º do R1-A, o escritório vai ao lado da suíte (acima da largura mínima) — e as redes sem encontro nem ponta aberta', () => {
    // Sozinho na faixa da frente, o escritório tinha a largura toda e a profundidade da área: 7,40 × 1,70 m (mín. 2,20).
    const p2 = [...r.levels].sort((a, b) => a.elevationMm - b.elevationMm)[2];
    const esc = r.spaces.find((x) => x.levelId === p2.id && x.name === 'Escritório')!;
    const [xs, ys] = [esc.ring.map((q) => q.x), esc.ring.map((q) => q.y)];
    expect(Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))).toBeGreaterThanOrEqual(2200);
    // A planta nova expunha: o shaft de baixo (térreo → 1º) reaproveitado sem chegar ao 2º — o esgoto descia por outro,
    // fora da laje rebaixada, e cruzava o eletroduto do forro do 1º (agora o shaft sobe até o 2º); e o toco da quente que
    // ia e voltava pelo barrilete (agora podado).
    const porId = new Map((r.trechos ?? []).map((t) => [t.id, t]));
    const encontros = conflitosDoModelo(r).filter((c) => c.classe === 'REDE' && porId.has(c.trechoId) && porId.has(c.outroId)).map((c) => `${porId.get(c.trechoId)!.disciplina} × ${porId.get(c.outroId)!.disciplina}`);
    expect(encontros).toEqual([]);
    expect(plano.pendencias.filter((x) => /ponta\(s\) aberta/.test(x.texto)).map((x) => x.texto)).toEqual([]);
  });

  it('F27 item 5.3: 12 × 30 com o programa padrão — os dormitórios do 1º deixam de ter 41 m²', () => {
    const p = planejarCasa(m, { ...z3(3), hidro: chuva }, { pavimentos: 3 });
    expect(p.etapas.find((x) => x.id === 'ARQUITETURA')?.situacao).toBe('LANCOU');
    expect(conferirPlanoDaCasa(m, p)).toEqual({ ok: true });
    expect(maiorDormitorioDoPrimeiro(p.resultado)).toBeLessThan(25);
  });

  it('o programa inteiro no desenho e a trava: reaplicado no original, o mesmo modelo', () => {
    expect(plano.resumo.ambientesAtendidos).toBe(plano.resumo.ambientesPedidos);
    expect(conferirPlanoDaCasa(m, plano)).toEqual({ ok: true });
    expect(snapshotHash(applyBatch(m, plano.comandos).model)).toBe(snapshotHash(r));
  });

  /** As redes que atravessam pilar: `disciplina × rótulo do pilar`. */
  const redesNoPilar = (x: BlueprintModel) => {
    const est = new Map(x.structures.map((s) => [s.id, s]));
    const porId = new Map((x.trechos ?? []).map((t) => [t.id, t]));
    return conflitosDoModelo(x)
      .filter((c) => c.classe === 'ESTRUTURA' && porId.has(c.trechoId) && est.get(c.outroId)?.kind === 'PILAR' && ((c as { comprimentoDentroMm?: number }).comprimentoDentroMm ?? 0) > 0)
      .map((c) => `${porId.get(c.trechoId)!.disciplina} × ${est.get(c.outroId)!.rotulo}`);
  };

  it('F27 item 5: nenhuma rede atravessa pilar — o interruptor não nasce na face dele; a fria que sai do shaft não corre na parede por ele', () => {
    expect(redesNoPilar(r)).toEqual([]);
  });

  /** A casa de 3 no lote 10 × 30 com o programa `curto`. */
  const tresNoLote10 = (curto: Partial<typeof PROGRAMA_CURTO_PADRAO>) => {
    const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const L = base.levels[0].id;
    const d = (a: Point, b: Point, papel: Papel): Command => ({ type: 'AddBoundary', levelId: L, a, b, kind: 'TERRENO', papel });
    const m10 = applyBatch(base, [d(point(0, 0), point(10000, 0), 'FRENTE'), d(point(10000, 0), point(10000, 30000), 'LATERAL_DIREITA'), d(point(10000, 30000), point(0, 30000), 'FUNDOS'), d(point(0, 30000), point(0, 0), 'LATERAL_ESQUERDA')]).model;
    const e = entrada(m10, { ctx: { ...entrada(m10).ctx, zona: { ...ZONA, gabaritoPavimentos: 3, coeficienteMax: null } } });
    return planejarCasa(m10, { ...e, curto: { ...PROGRAMA_CURTO_PADRAO, ...curto }, hidro: chuva }, { pavimentos: 3 });
  };

  it('F27 item 5: 10 × 30, 4 dorm. — nem o eletroduto do 2º (o nó do forro do outro lado da parede) nem o condutor do terraço (o pé no afastamento)', () => {
    const p = tresNoLote10({ dormitorios: 4, suites: 1, banheiros: 3, vagas: 2 });
    expect(p.etapas.find((x) => x.id === 'ARQUITETURA')?.situacao).toBe('LANCOU');
    expect(redesNoPilar(p.resultado)).toEqual([]);
    // F27 item 5 ("mover o lavabo"): o núcleo espremia o lavabo do térreo (0,65 m, 1,33 m²) — ele vai para a outra ponta.
    const T = [...p.resultado.levels].sort((a, b) => a.elevationMm - b.elevationMm)[0].id;
    const lavabo = p.resultado.spaces.find((x) => x.levelId === T && x.name === 'Lavabo')!;
    expect(lavabo.areaMm2 / 1e6).toBeGreaterThanOrEqual(1.5);
    expect(p.decisoes.some((d) => /o lavabo foi para a outra ponta/.test(d))).toBe(true);
    // S5 (20/10/2026): e a porta dele abre para a cozinha, não para a área de serviço (trocado de ponta com o serviço, o
    // lado dele na cozinha tinha 1,05 m — a porta não cabia — e a busca o abria pelo serviço).
    const ladosDaPorta = (o: (typeof p.resultado.openings)[number]) => {
      const w = p.resultado.walls.find((x) => x.id === o.wallId)!;
      const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
      const u = { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L };
      const c = { x: w.a.x + u.x * (o.offsetMm + o.widthMm / 2), y: w.a.y + u.y * (o.offsetMm + o.widthMm / 2) };
      return [1, -1].map((sg) => p.resultado.spaces.find((x) => x.levelId === w.levelId && pointInPolygon(x.ring, point(c.x - u.y * 300 * sg, c.y + u.x * 300 * sg)))?.name ?? null);
    };
    const portasDoLavabo = p.resultado.openings.filter((o) => o.kind === 'door').map(ladosDaPorta).filter((l) => l.includes('Lavabo'));
    expect(portasDoLavabo.map((l) => l.find((n) => n !== 'Lavabo'))).toEqual(['Cozinha']);
    // Pendência antiga (21/10/2026): a porta cozinha ↔ serviço caía na parede que vira a lateral do núcleo da escada e
    // passava a abrir para ela — a relação obrigatória ficava sem porta direta (SEM_SOLUCAO). Ela anda para além do núcleo.
    const portas = p.resultado.openings.filter((o) => o.kind === 'door').map(ladosDaPorta);
    expect(portas.some((l) => l.includes('Cozinha') && l.includes('Área de serviço'))).toBe(true);
    expect(p.pendencias.filter((x) => /sem porta|porta direta/i.test(x.texto)).map((x) => x.texto)).toEqual([]);
    // E nenhum encontro de rede: com o lavabo mais fundo, a caixa de inspeção (na reta do vaso dele até a frente) caía a
    // 2 cm do alimentador, e o coletor corria colado nele até a rua — a caixa se afasta da água enterrada.
    const porIdS5 = new Map((p.resultado.trechos ?? []).map((t) => [t.id, t]));
    const encontrosS5 = conflitosDoModelo(p.resultado).filter((c) => c.classe === 'REDE' && porIdS5.has(c.trechoId) && porIdS5.has(c.outroId)).map((c) => `${porIdS5.get(c.trechoId)!.disciplina} × ${porIdS5.get(c.outroId)!.disciplina}`);
    expect(encontrosS5).toEqual([]);
    // F27 item 5.3b: o 1º recua também no lote de 10 m (com 4 voltas atrás do patamar não alinhava: dormitórios de 26,6 m²).
    expect(p.decisoes.some((d) => /o 1º recuado em/.test(d))).toBe(true);
    expect(maiorDormitorioDoPrimeiro(p.resultado)).toBeLessThan(25);
  });

  it('F27 item 5: 10 × 30, 2 dorm. — o ramal sob o piso contorna a coluna que atravessa o piso (a quente que sobe do térreo, o alimentador): nenhum encontro de rede', () => {
    const p = tresNoLote10({ dormitorios: 2, suites: 1, banheiros: 2, vagas: 1 });
    expect(p.etapas.find((x) => x.id === 'ARQUITETURA')?.situacao).toBe('LANCOU');
    const porId = new Map((p.resultado.trechos ?? []).map((t) => [t.id, t]));
    const encontros = conflitosDoModelo(p.resultado)
      .filter((c) => c.classe === 'REDE' && porId.has(c.trechoId) && porId.has(c.outroId))
      .map((c) => `${porId.get(c.trechoId)!.disciplina} × ${porId.get(c.outroId)!.disciplina}`);
    expect(encontros).toEqual([]);
    // S3 (20/10/2026): o 2º (a suíte, maior que o programa do 1º) enchia o 1º recuado e não alinhava ao patamar — o 1º
    // ficava com a pegada do térreo e o dormitório com 52,9 m². Agora o 1º recua em volta do 2º.
    expect(p.decisoes.some((d) => /o 1º recuado em .* em volta do 2º/.test(d))).toBe(true);
    expect(maiorDormitorioDoPrimeiro(p.resultado)).toBeLessThan(25);
    // E o quadro não nasce no cruzamento com a fachada do 1º recuado (dentro da porta do térreo, a prumada pela janela de cima).
    const noVao = conflitosDoModelo(p.resultado).filter((c) => c.classe === 'ABERTURA' && porId.has(c.trechoId) && ((c as { comprimentoDentroMm?: number }).comprimentoDentroMm ?? 0) > 0);
    expect(noVao.map((c) => porId.get(c.trechoId)!.disciplina)).toEqual([]);
  });

  it('a zona que só deixa 2 pavimentos (ou a altura de 2) recusa a de 3 e aponta o sobrado', () => {
    for (const e of [z3(2), z3(null, 6)]) {
      const p = planejarCasa(m, e, { pavimentos: 3 });
      expect(p.etapas[0]).toMatchObject({ id: 'IMPLANTACAO', situacao: 'NAO_RODOU' });
      expect(p.etapas[0].nota).toMatch(/3 pavimentos.*gere o sobrado/);
    }
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

describe('planejarCasa — F14a: as faixas das redes na parede e no shaft', () => {
  const verticais = (r: BlueprintModel) => (r.trechos ?? []).filter((t) => t.a.x === t.b.x && t.a.y === t.b.y && Math.abs(t.cotaAMm - t.cotaBMm) > 0);
  it.each([1, 2] as const)('%i pavimento(s): nenhuma prumada de disciplinas diferentes no mesmo ponto; a fria e a quente de cada louça lado a lado', (pavimentos) => {
    const m = lote();
    const r = planejarCasa(m, entrada(m), { pavimentos }).resultado;
    // no mesmo ponto em planta E sobrepostas em altura (a caixa sobre a laje e a luz do teto embaixo dela não contam)
    const vs = verticais(r);
    const juntas = vs.flatMap((t, i) =>
      vs.slice(i + 1).filter((u) => u.disciplina !== t.disciplina && u.levelId === t.levelId && u.a.x === t.a.x && u.a.y === t.a.y && Math.min(Math.max(t.cotaAMm, t.cotaBMm), Math.max(u.cotaAMm, u.cotaBMm)) > Math.max(Math.min(t.cotaAMm, t.cotaBMm), Math.min(u.cotaAMm, u.cotaBMm))).map((u) => `${t.disciplina}×${u.disciplina}@${t.a.x},${t.a.y}`),
    );
    expect(juntas).toEqual([]);
    // as louças com fria e quente: os dois pontos a 15 cm
    const quentes = (r.terminais ?? []).filter((t) => t.disciplina === 'AGUA_QUENTE' && t.tipoHidraulico !== 'AQUECEDOR');
    expect(quentes.length).toBeGreaterThan(0);
    for (const q of quentes) {
      const fria = (r.terminais ?? []).filter((t) => t.disciplina === 'AGUA_FRIA' && t.tipoHidraulico === q.tipoHidraulico && t.levelId === q.levelId).sort((a, b) => Math.hypot(a.at.x - q.at.x, a.at.y - q.at.y) - Math.hypot(b.at.x - q.at.x, b.at.y - q.at.y))[0];
      expect(Math.hypot(fria.at.x - q.at.x, fria.at.y - q.at.y)).toBeGreaterThan(100);
    }
  });

  it('térrea: nenhum encontro entre a água e o esgoto vertical (a ventilação e o tubo de queda na faixa do esgoto)', () => {
    const m = lote();
    const r = planejarCasa(m, entrada(m)).resultado;
    const porId = new Map((r.trechos ?? []).map((t) => [t.id, t]));
    const agua = new Set(['AGUA_FRIA', 'AGUA_QUENTE']);
    const encontros = conflitosDoModelo(r).filter((c) => {
      if (c.classe !== 'REDE') return false;
      const a = porId.get(c.trechoId)!;
      const b = porId.get(c.outroId)!;
      const esg = a.disciplina === 'ESGOTO' ? a : b.disciplina === 'ESGOTO' ? b : null;
      const ag = agua.has(a.disciplina) ? a : agua.has(b.disciplina) ? b : null;
      return !!esg && !!ag && esg.a.x === esg.b.x && esg.a.y === esg.b.y;
    });
    expect(encontros).toEqual([]);
  });
});

describe('planejarCasa — F14b: o forro e as redes nas faixas do plenum ("forro com faixas", "manter 2,80 m, furar vigas")', () => {
  const modelos = modelosDoCatalogo(SEMENTES_DE_TIPOS.map((s, i) => ({ id: `t${i}`, nome: s.nome, familia: s.propriedades.familia, active: true, propriedades: s.propriedades })));
  const comAr = (m: BlueprintModel) =>
    entrada(m, {
      hidro: { ...HIPOTESES_HIDRO_PADRAO, pluvial: { ...HIPOTESES_HIDRO_PADRAO.pluvial, intensidadeMmH: 150 } },
      modelosDeClimatizacao: modelos,
      climatizacao: { ...HIPOTESES_CLIMATIZACAO_PADRAO, clima: { cidade: null, tbsExternaC: 34, tbuExternaC: 25, altitudeM: 0 } },
    });
  const planos = new Map<number, ReturnType<typeof planejarCasa>>();
  const casa = (pavimentos: 1 | 2) => {
    if (!planos.has(pavimentos)) {
      const m = lote();
      planos.set(pavimentos, planejarCasa(m, comAr(m), { pavimentos }));
    }
    return planos.get(pavimentos)!;
  };
  /** As quatro redes que correm no forro, cada uma na sua faixa (o esgoto suspenso do sobrado fica para a F14c). */
  const REDES_DO_FORRO = new Set(['AGUA_FRIA', 'AGUA_QUENTE', 'ELETRICA', 'FRIGORIGENA']);
  const F = HIPOTESES_DO_FORRO_DA_CASA_PADRAO;
  const FAIXA: Record<string, number> = { ELETRICA: F.eletrica.abaixoDoTetoMm, FRIGORIGENA: F.frigorigena.abaixoDoTetoMm, AGUA_QUENTE: F.aguaQuente.abaixoDoTetoMm, AGUA_FRIA: F.aguaFria.abaixoDoTetoMm };
  const comNome = (r: BlueprintModel) => r.spaces.filter((s) => (s.name ?? '').trim() && !/escada/i.test(s.name ?? ''));
  const etiqueta = (r: BlueprintModel, s: BlueprintModel['spaces'][number]) => r.labels.find((l) => l.levelId === s.levelId && pointInPolygon(s.ring, l.at));

  it.each([1, 2] as const)('%i pavimento(s): forro em todo cômodo com nome (menos a escada), no rebaixo das faixas, com o pé-direito livre do uso; a luz na face dele', (pavimentos) => {
    const p = casa(pavimentos);
    const r = p.resultado;
    expect(p.etapas.find((e) => e.id === 'FORRO')?.situacao).toBe('LANCOU');
    const rebaixo = rebaixoDoForroMm(F);
    for (const s of comNome(r)) expect(etiqueta(r, s)?.acabamentos?.forro?.rebaixoMm, s.name).toBe(rebaixo);
    expect(p.resumo.forro?.comodos).toBe(comNome(r).length);
    expect(p.resumo.forro!.peDireitoLivreMinimoMm!).toBeGreaterThanOrEqual(F.peDireitoLivrePermanenciaMm);
    expect(p.pendencias.some((x) => /pé-direito livre abaixo do mínimo/.test(x.texto))).toBe(false);
    const luzes = (r.terminais ?? []).filter((t) => t.tipoEletrico === 'ILUMINACAO_TETO');
    expect(luzes.length).toBeGreaterThan(0);
    for (const t of luzes) {
      const s = comNome(r).find((x) => x.levelId === t.levelId && pointInPolygon(x.ring, t.at));
      if (!s) continue;
      const forro = etiqueta(r, s)!.acabamentos!.forro!;
      const teto = r.levels.find((l) => l.id === t.levelId)!.defaultHeightMm;
      expect(t.cotaMm, s.name).toBe(teto - forro.rebaixoMm - forro.camadas.reduce((n, c) => n + c.espessuraMm, 0));
    }
  });

  it.each([1, 2] as const)('%i pavimento(s): nenhum encontro entre eletroduto, linha do ar, água quente e fria — e o horizontal de cada uma, no forro, na cota da faixa dela', (pavimentos) => {
    const r = casa(pavimentos).resultado;
    const porId = new Map((r.trechos ?? []).map((t) => [t.id, t]));
    const encontros = conflitosDoModelo(r)
      .filter((c) => c.classe === 'REDE' && REDES_DO_FORRO.has(porId.get(c.trechoId)!.disciplina) && REDES_DO_FORRO.has(porId.get(c.outroId)!.disciplina))
      .map((c) => `${porId.get(c.trechoId)!.disciplina}×${porId.get(c.outroId)!.disciplina}`);
    expect(encontros).toEqual([]);
    // Acima da face do forro e abaixo da laje, o horizontal de cada rede só corre na faixa dela.
    const foraDaFaixa = (r.trechos ?? []).filter((t) => {
      if (!REDES_DO_FORRO.has(t.disciplina) || t.cotaAMm !== t.cotaBMm || (t.a.x === t.b.x && t.a.y === t.b.y)) return false;
      const teto = r.levels.find((l) => l.id === t.levelId)!.defaultHeightMm;
      const faceDoForro = teto - rebaixoDoForroMm(F) - 14;
      return t.cotaAMm > faceDoForro && t.cotaAMm < teto && t.cotaAMm !== teto - FAIXA[t.disciplina];
    });
    expect(foraDaFaixa.map((t) => `${t.disciplina}@${t.cotaAMm}`)).toEqual([]);
    const temNaFaixa = (d: string) => (r.trechos ?? []).some((t) => t.disciplina === d && t.cotaAMm === t.cotaBMm && t.cotaAMm === 2800 - FAIXA[d]);
    // F14d: a linha do ar sai direto pela parede externa, na cota da evaporadora — só a que não tem essa saída corre no forro.
    const evaporadoras = (r.terminais ?? []).filter((t) => (t.tipoHidraulico ?? '').startsWith('EVAPORADORA'));
    const saiPelaParede = evaporadoras.length > 0 && evaporadoras.every((e) => (r.trechos ?? []).some((t) => t.disciplina === 'FRIGORIGENA' && t.cotaAMm === e.cotaMm && t.cotaBMm === e.cotaMm && [t.a, t.b].some((q) => q.x === e.at.x && q.y === e.at.y)));
    for (const d of REDES_DO_FORRO) expect(temNaFaixa(d) || (d === 'FRIGORIGENA' && saiPelaParede), d).toBe(true);
  });

  // Forro, luz × luz pelas travessias (24/10/2026, correções 1 e 2 — `docs/planos/2026-10-24-forro-luz-pelas-travessias.md`):
  // a elétrica sem anel, todo trecho com circuito, e os furos elétricos "verificar" no máximo os medidos depois da régua
  // única do apoio (térrea 7, sobrado 39; antes, 10 e 44).
  it.each([[1, 7], [2, 39]] as const)('%i pavimento(s): eletroduto sem anel, todo trecho com circuito, e no máximo %i furos elétricos a verificar', (pavimentos, maxVerificar) => {
    const r = casa(pavimentos).resultado;
    const el = (r.trechos ?? []).filter((t) => t.disciplina === 'ELETRICA');
    expect(el.filter((t) => (t.circuitoIds ?? []).length === 0).map((t) => t.id)).toEqual([]);
    const no = (t: (typeof el)[number], q: Point, z: number) => `${t.levelId}|${q.x},${q.y},${z}`;
    const pai = new Map<string, string>();
    const raiz = (k: string): string => {
      let x = k;
      while (pai.get(x) !== x) x = pai.get(x)!;
      return x;
    };
    let aneis = 0;
    for (const t of el) {
      const [ka, kb] = [no(t, t.a, t.cotaAMm), no(t, t.b, t.cotaBMm)];
      for (const k of [ka, kb]) if (!pai.has(k)) pai.set(k, k);
      if (raiz(ka) === raiz(kb)) aneis++;
      else pai.set(raiz(ka), raiz(kb));
    }
    expect(aneis).toBe(0);
    const verificar = furosPrevistos(r).filter((f) => f.disciplina === 'ELETRICA' && f.dispensa === false).length;
    expect(verificar).toBeLessThanOrEqual(maxVerificar);
  });

  // F2, correção 1 (24/10/2026): relançar os eletrodutos pelo painel (que não conhece o forro) refazia a rede da casa
  // na cota do teto/sob a viga — abaixo da face do forro. A faixa vem agora do registro do lançamento.
  it('⚠️ F2 correção 1: trocar as caixas e refazer pelo painel mantém a elétrica NA FAIXA do forro, sem conflito novo; sem registro, não relança', () => {
    const r = casa(1).resultado;
    const q = (r.quadros ?? [])[0].id;
    expect(registroDe(r, 'ELETRODUTOS', q)?.escolhas).toMatchObject({ forroAbaixoDoTetoMm: F.eletrica.abaixoDoTetoMm });
    const horizontais = (m: BlueprintModel) =>
      (m.trechos ?? []).filter((t) => t.disciplina === 'ELETRICA' && t.cotaAMm === t.cotaBMm && !(t.a.x === t.b.x && t.a.y === t.b.y));
    const conflitosDaEletrica = (m: BlueprintModel) => {
      const porId = new Map((m.trechos ?? []).map((t) => [t.id, t]));
      return conflitosDoModelo(m)
        .filter((c) => c.classe === 'REDE')
        .map((c) => [porId.get(c.trechoId)!.disciplina, porId.get(c.outroId)!.disciplina].sort().join('×'))
        .filter((par) => par.includes('ELETRICA') && /AGUA|FRIGORIGENA/.test(par));
    };
    // O usuário liga as caixas; o painel não tem `noForro`.
    const painel = { ...HIPOTESES_ELETRODUTO_PADRAO, caixas: REGRA_DE_CAIXAS_PADRAO };
    const lote = comandosDeRefazerEletrodutos(r, [q], painel, HIPOTESES_ELETRICAS_PADRAO);
    expect(lote.some((c) => c.type === 'AddTrecho')).toBe(true);
    const depois = applyBatch(r, lote).model;
    expect(registroDe(depois, 'ELETRODUTOS', q)?.escolhas).toMatchObject({ caixasDePassagem: 'CAIXAS', forroAbaixoDoTetoMm: F.eletrica.abaixoDoTetoMm });
    const faixa = 2800 - F.eletrica.abaixoDoTetoMm;
    const cotasAntes = new Set(horizontais(r).map((t) => t.cotaAMm));
    expect(horizontais(depois).filter((t) => t.cotaAMm === faixa).length).toBeGreaterThan(0);
    // Nenhum horizontal elétrico numa cota que a rede da casa não tinha (a do painel: o teto, ou sob a viga).
    expect([...new Set(horizontais(depois).map((t) => t.cotaAMm))].filter((c) => !cotasAntes.has(c))).toEqual([]);
    const faceDoForro = 2800 - rebaixoDoForroMm(F) - 14;
    expect(horizontais(depois).filter((t) => t.cotaAMm > faceDoForro && t.cotaAMm < 2800 && t.cotaAMm !== faixa).map((t) => t.cotaAMm)).toEqual([]);
    expect(conflitosDaEletrica(depois)).toEqual(conflitosDaEletrica(r));

    // A rede no forro SEM registro (a casa de antes): não relança pelo painel.
    const antiga = applyCommand(r, { type: 'ApagarRegistroDeLancamento', motor: 'ELETRODUTOS', alvoId: q }).model;
    expect(motivoParaNaoRelancar(antiga, q)).toBe(MOTIVO_REDE_NO_FORRO_SEM_REGISTRO);
    expect(comandosDeRefazerEletrodutos(antiga, [q], painel, HIPOTESES_ELETRICAS_PADRAO)).toEqual([]);
  });

  // Correção 3 (24/10/2026, pedido literal: "então verifique pois alterei e não ficou disponível para relançamento"):
  // a rede antiga no forro (sem registro) relança pelas PREMISSAS da casa do estudo — o forro elétrico vem de
  // `forroEletricoDaCasa`, a mesma conta com que a casa lança. Sem as premissas, o bloqueio continua, com o motivo.
  it('⚠️ correção 3: rede antiga no forro (registro apagado) relança pelas premissas da casa — botão ligado, horizontais na faixa, registro com o forro', () => {
    const r = casa(1).resultado;
    const q = (r.quadros ?? [])[0].id;
    const antiga = applyCommand(r, { type: 'ApagarRegistroDeLancamento', motor: 'ELETRODUTOS', alvoId: q }).model;
    const horizontais = (m: BlueprintModel) =>
      (m.trechos ?? []).filter((t) => t.disciplina === 'ELETRICA' && t.cotaAMm === t.cotaBMm && !(t.a.x === t.b.x && t.a.y === t.b.y));
    const forroDaCasa = forroEletricoDaCasa(hipotesesDasPremissas(PREMISSAS_DA_CASA_PADRAO));
    expect(forroDaCasa).toEqual({ faixa: F.eletrica, folgaSobAVigaMm: F.folgaSobAVigaMm });
    // Forro desligado nas premissas: nada a usar.
    expect(forroEletricoDaCasa(hipotesesDasPremissas({ ...PREMISSAS_DA_CASA_PADRAO, forro: { ...PREMISSAS_DA_CASA_PADRAO.forro, lancar: false } }))).toBeNull();
    const painel = { ...HIPOTESES_ELETRODUTO_PADRAO, caixas: REGRA_DE_CAIXAS_PADRAO };

    // Sem as premissas: bloqueado como antes.
    const planosSem = planejarEletrodutosPorQuadro(antiga, painel, HIPOTESES_ELETRICAS_PADRAO);
    expect(botaoDeLancarEletrodutos(antiga, planosSem)).toMatchObject({ motivo: MOTIVO_REDE_NO_FORRO_SEM_REGISTRO, quadros: [] });

    // Com as premissas: relança, ligado e sem motivo.
    expect(motivoParaNaoRelancar(antiga, q, forroDaCasa)).toBeNull();
    expect(hipotesesDoQuadro(antiga, q, painel, forroDaCasa).noForro).toEqual(forroDaCasa);
    const planos = planejarEletrodutosPorQuadro(antiga, painel, HIPOTESES_ELETRICAS_PADRAO, forroDaCasa);
    const botao = botaoDeLancarEletrodutos(antiga, planos, forroDaCasa);
    expect(botao).toMatchObject({ modo: 'RELANCAR', motivo: null, quadros: [q] });
    expect(redesARefazer(antiga, [q], { hip: painel, hipEletricas: HIPOTESES_ELETRICAS_PADRAO, forroDaCasa }).map((x) => x.quadroId)).toEqual([q]);

    const lote = comandosDeRefazerEletrodutos(antiga, botao.quadros, painel, HIPOTESES_ELETRICAS_PADRAO, forroDaCasa);
    expect(lote.some((c) => c.type === 'AddTrecho')).toBe(true);
    const depois = applyBatch(antiga, lote).model;
    const faixa = 2800 - F.eletrica.abaixoDoTetoMm;
    expect(horizontais(depois).filter((t) => t.cotaAMm === faixa).length).toBeGreaterThan(0);
    // Todo horizontal elétrico no PLENO (acima da face do forro) fica na faixa — nenhum desce para a cota do painel. Os
    // que correm na parede abaixo do forro (até o ponto, `saidaDoRebaixoPelaParede`) são os mesmos da casa de origem.
    const faceDoForro = 2800 - rebaixoDoForroMm(F) - 14;
    expect(horizontais(depois).filter((t) => t.cotaAMm > faceDoForro && t.cotaAMm !== faixa).map((t) => t.cotaAMm)).toEqual([]);
    const cotasDaCasa = new Set(horizontais(r).map((t) => t.cotaAMm));
    expect([...new Set(horizontais(depois).map((t) => t.cotaAMm))].filter((c) => !cotasDaCasa.has(c))).toEqual([]);
    // O lote grava o registro COM o forro — a partir daí vale o registro, sem precisar das premissas.
    expect(registroDe(depois, 'ELETRODUTOS', q)?.escolhas).toMatchObject({
      caixasDePassagem: 'CAIXAS',
      forroAbaixoDoTetoMm: F.eletrica.abaixoDoTetoMm,
      forroAfastamentoDaFaceMm: F.eletrica.afastamentoDaFaceMm,
      forroFolgaSobAVigaMm: F.folgaSobAVigaMm,
    });
    expect(motivoParaNaoRelancar(depois, q)).toBeNull();
    expect(hipotesesDoQuadro(depois, q, painel).noForro).toEqual(forroDaCasa);
  });

  // F3 do relançar (24/10/2026): a água da casa corre no forro (`agua.noForro`), que a gaveta da água não conhece. O
  // registro guarda as faixas (sem rótulo) e o Refazer pelo editor as devolve — a água continua no forro.
  it('⚠️ F3: trocar uma premissa da água e refazer pelo editor mantém a água NA FAIXA do forro; sem registro, não relança', () => {
    const r = casa(1).resultado;
    const estudo = { ...HIPOTESES_HIDRO_PADRAO, pluvial: { ...HIPOTESES_HIDRO_PADRAO.pluvial, intensidadeMmH: 150 } };
    expect(registroDe(r, 'AGUA', null)?.escolhas).toMatchObject({ forroFriaAbaixoDoTetoMm: F.aguaFria.abaixoDoTetoMm, forroQuenteAbaixoDoTetoMm: F.aguaQuente.abaixoDoTetoMm, subidaDoAlimentador: 'FACHADA' });
    expect(registroDe(r, 'PLUVIAL', null)).not.toBeNull();
    // Com o estudo de sempre, nada mudou: sem aviso em nenhum dos dois.
    expect(diferencasDaAgua(r, estudo)).toEqual([]);
    expect(diferencasDoPluvial(r, estudo.pluvial)).toEqual([]);

    const faceDoForro = 2800 - rebaixoDoForroMm(F) - 14;
    const horizontaisNoForro = (m: BlueprintModel) =>
      (m.trechos ?? []).filter(
        (t) => (t.disciplina === 'AGUA_FRIA' || t.disciplina === 'AGUA_QUENTE') && t.cotaAMm === t.cotaBMm && !(t.a.x === t.b.x && t.a.y === t.b.y) && t.cotaAMm > faceDoForro && t.cotaAMm < 2800,
      );
    const naFaixa = (t: { disciplina: string; cotaAMm: number }) => t.cotaAMm === 2800 - FAIXA[t.disciplina];
    expect(horizontaisNoForro(r).length).toBeGreaterThan(0);

    // O usuário muda a velocidade no estudo e refaz pela gaveta.
    const outra = { ...estudo, agua: { ...estudo.agua, velocidadeMaxMs: 2.5 } };
    const { comandos } = comandosDeRefazerAgua(r, outra, null);
    expect(comandos.some((c) => c.type === 'AddTrecho')).toBe(true);
    const depois = applyBatch(r, comandos).model;
    expect(registroDe(depois, 'AGUA', null)?.escolhas).toMatchObject({ velocidadeMaxMs: 2.5, forroFriaAbaixoDoTetoMm: F.aguaFria.abaixoDoTetoMm });
    expect(diferencasDaAgua(depois, outra)).toEqual([]);
    expect(horizontaisNoForro(depois).filter(naFaixa).length).toBeGreaterThan(0);
    expect(horizontaisNoForro(depois).filter((t) => !naFaixa(t)).map((t) => `${t.disciplina}@${t.cotaAMm}`)).toEqual([]);
    // Prova de sensibilidade: com as premissas do estudo PURAS (sem o forro do registro), a água sairia da faixa.
    const apagar = comandos.filter((c) => c.type === 'DeleteTrecho' || c.type === 'DeleteTerminal');
    const semForro = applyBatch(applyBatch(r, apagar).model, planejarAguaCompleta(applyBatch(r, apagar).model, outra, null).comandos).model;
    expect(horizontaisNoForro(semForro).filter(naFaixa).length).toBe(0);

    // A água no forro SEM registro (a casa de antes), sem o forro da casa: não relança pela gaveta.
    const antiga = applyCommand(r, { type: 'ApagarRegistroDeLancamento', motor: 'AGUA', alvoId: null }).model;
    expect(motivoParaNaoRelancarAgua(antiga, outra)).toBe(MOTIVO_AGUA_NO_FORRO_SEM_REGISTRO);
    expect(comandosDeRefazerAgua(antiga, outra, null).comandos).toEqual([]);

    // Correção 1 (relato na planta "Garden"): COM o forro da casa (as premissas do estudo, pela mesma função da casa), relança
    // — e a água refeita volta à faixa do forro, com o forro no registro.
    const forroDaCasa = forroDaAguaDaCasa(forroDaCasaCompleto());
    expect(forroDaCasa).not.toBeNull();
    const comCasa = { ...outra, forroDaCasa };
    expect(motivoParaNaoRelancarAgua(antiga, comCasa)).toBeNull();
    const refeita = applyBatch(antiga, comandosDeRefazerAgua(antiga, comCasa, null).comandos).model;
    expect(registroDe(refeita, 'AGUA', null)?.escolhas).toMatchObject({ velocidadeMaxMs: 2.5, forroFriaAbaixoDoTetoMm: F.aguaFria.abaixoDoTetoMm });
    expect(horizontaisNoForro(refeita).filter(naFaixa).length).toBeGreaterThan(0);
    expect(horizontaisNoForro(refeita).filter((t) => !naFaixa(t)).map((t) => `${t.disciplina}@${t.cotaAMm}`)).toEqual([]);
  });

  it('térrea: nenhuma dessas redes em vão de porta ou janela (o aquecedor ao lado da janela; o dreno do ar é a F14d)', () => {
    const r = casa(1).resultado;
    const porId = new Map((r.trechos ?? []).map((t) => [t.id, t]));
    const noVao = conflitosDoModelo(r).filter((c) => c.classe === 'ABERTURA' && REDES_DO_FORRO.has(porId.get(c.trechoId)!.disciplina));
    expect(noVao.map((c) => porId.get(c.trechoId)!.disciplina)).toEqual([]);
  });

  it('desligado (`forro.lancar: false`): como até a F14a — sem forro, a luz no teto, o ramal 10 cm sob a viga', () => {
    const m = lote();
    const p = planejarCasa(m, comAr(m), { forro: { ...F, lancar: false } });
    const r = p.resultado;
    expect(p.etapas.find((e) => e.id === 'FORRO')?.situacao).toBe('NAO_EXIGIDA');
    expect(p.resumo.forro).toBeNull();
    expect(r.labels.some((l) => l.acabamentos?.forro)).toBe(false);
    expect((r.terminais ?? []).filter((t) => t.tipoEletrico === 'ILUMINACAO_TETO').every((t) => t.cotaMm === 2800)).toBe(true);
    expect((r.trechos ?? []).some((t) => t.disciplina === 'AGUA_FRIA' && t.cotaAMm === 2200 && t.cotaBMm === 2200)).toBe(true);
  });
});

/**
 * F21 (17/10/2026): a casa no lote 14 × 28 R1-A tinha um "Ambiente N" de 5 cm² — duas paredes desalinhadas em 5 cm, uma
 * de cada lado de uma terceira (luz sem interruptor, laje < 0,5 m², luz dentro do pilar). O gerador alinha as bordas.
 */
describe('F21 — nenhuma sobra de cômodo (lote 14 × 28, R1-A)', () => {
  it('todo cômodo do resultado tem nome', () => {
    const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const levelId = base.levels[0].id;
    const d = (a: Point, b: Point, papel: Papel): Command => ({ type: 'AddBoundary', levelId, a, b, kind: 'TERRENO', papel });
    const m = applyBatch(base, [d(point(0, 0), point(14000, 0), 'FRENTE'), d(point(14000, 0), point(14000, 28000), 'LATERAL_DIREITA'), d(point(14000, 28000), point(0, 28000), 'FUNDOS'), d(point(0, 28000), point(0, 0), 'LATERAL_ESQUERDA')]).model;
    const plano = planejarCasa(m, entrada(m, { curto: { ...PROGRAMA_CURTO_PADRAO, padrao: 'R1-A' } }));
    expect(plano.resultado.spaces.filter((s) => !(s.name ?? '').trim()).map((s) => s.ring)).toEqual([]);
    expect(plano.pendencias.filter((p) => /Ambiente \d+|menos de 0,5 m²/.test(p.texto)).map((p) => p.texto)).toEqual([]);
  });
});

/**
 * F22 (17/10/2026): com a garagem num canto da frente, a varanda de entrada é uma COLUNA na profundidade da linha da rua —
 * encosta na rua e na sala, atrás. No treemap ela ficava na 1ª linha e o serviço atrás dela: "Varanda de entrada × Sala —
 * deviam ter porta direta" em 4 das 8 casas (lote 15 × 25 entre elas).
 */
describe('F22 — a varanda de entrada encosta na sala (lote 15 × 25)', () => {
  it('relação obrigatória varanda × sala cumprida; a varanda na rua; sem pendência "sem solução"', () => {
    const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const levelId = base.levels[0].id;
    const d = (a: Point, b: Point, papel: Papel): Command => ({ type: 'AddBoundary', levelId, a, b, kind: 'TERRENO', papel });
    const m = applyBatch(base, [d(point(0, 0), point(15000, 0), 'FRENTE'), d(point(15000, 0), point(15000, 25000), 'LATERAL_DIREITA'), d(point(15000, 25000), point(0, 25000), 'FUNDOS'), d(point(0, 25000), point(0, 0), 'LATERAL_ESQUERDA')]).model;
    const plano = planejarCasa(m, entrada(m));
    expect(plano.pendencias.filter((p) => /Varanda de entrada × Sala/.test(p.texto)).map((p) => p.texto)).toEqual([]);
    expect(plano.pendencias.filter((p) => p.grupo === 'SEM_SOLUCAO').map((p) => p.texto)).toEqual([]);
    const varanda = plano.resultado.spaces.find((s) => /Varanda/.test(s.name ?? ''))!;
    expect(Math.min(...varanda.ring.map((p) => p.y))).toBeLessThanOrEqual(3100);
  });
});

/**
 * F22 (decisão do usuário, 17/10/2026: "opção Automático"): pavimentos 'AUTOMATICO' gera a térrea e, se ela não comporta o
 * programa (medida mínima de ambiente violada ou acima da TO), o sobrado — e fica com o de menos problemas. Com "Térrea"
 * escolhida, fica a térrea e a pendência diz que o sobrado resolve.
 */
describe('F22 — pavimentos automático', () => {
  const lote10x30 = () => {
    const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const levelId = base.levels[0].id;
    const d = (a: Point, b: Point, papel: Papel): Command => ({ type: 'AddBoundary', levelId, a, b, kind: 'TERRENO', papel });
    return applyBatch(base, [d(point(0, 0), point(10000, 0), 'FRENTE'), d(point(10000, 0), point(10000, 30000), 'LATERAL_DIREITA'), d(point(10000, 30000), point(0, 30000), 'FUNDOS'), d(point(0, 30000), point(0, 0), 'LATERAL_ESQUERDA')]).model;
  };
  const quatro = { ...PROGRAMA_CURTO_PADRAO, dormitorios: 4, suites: 1, banheiros: 3, vagas: 2 };

  it('4 dormitórios num lote de 10 m: a térrea não comporta → compara com o sobrado e fica com o de MENOS problemas, dito', () => {
    const m = lote10x30();
    const p = planejarCasa(m, entrada(m, { curto: quatro }), { pavimentos: 'AUTOMATICO' });
    const terrea = planejarCasa(m, entrada(m, { curto: quatro }), { pavimentos: 1 });
    const sobrado = planejarCasa(m, entrada(m, { curto: quatro }), { pavimentos: 2 });
    expect(p.pendencias.some((x) => /^Pavimentos automático: (sobrado|térrea) — /.test(x.texto) && /não compor/.test(x.texto))).toBe(true);
    const fica = problemasDoPlano(sobrado) < problemasDoPlano(terrea) ? 'sobrado' : 'térrea';
    expect(p.sobrado ? 'sobrado' : 'térrea').toBe(fica);
    // Quatro casas inteiras (a automática faz térrea e sobrado; e as duas de conferência). S1 (20/10/2026): o contorno
    // da laje rebaixada alonga a água do sobrado e a pressão simula uma vez mais (o pressurizador e a caixa subindo) —
    // 101 s no CI antes, acima de 120 depois.
  }, 240_000);

  it('F27 — o sobrado no lote de 10 m: a varanda (na rua) encosta na sala; os encontros de rede viram pendência', () => {
    // A garagem em fila toma a linha da rua (10 m de fundo): a faixa ao lado dela é a entrada — a sala logo atrás da
    // varanda. Antes, a sala ia para a linha de trás, a 2 portas da varanda (SEM_SOLUCAO).
    const m = lote10x30();
    const p = planejarCasa(m, entrada(m, { curto: quatro }), { pavimentos: 2 });
    expect(p.pendencias.filter((x) => /Varanda de entrada × Sala/.test(x.texto)).map((x) => x.texto)).toEqual([]);
    // Todo encontro rede × rede da conferência está nas pendências (o Automático pesa só o que está nelas).
    const porId = new Map((p.resultado.trechos ?? []).map((t) => [t.id, t]));
    const encontros = conflitosDoModelo(p.resultado).filter((c) => c.classe === 'REDE' && porId.has(c.trechoId) && porId.has(c.outroId)).length;
    const ditos = p.pendencias.filter((x) => x.grupo === 'CONFLITO' && /^Redes: \d+ encontro/.test(x.texto)).reduce((n, x) => n + Number(/^Redes: (\d+)/.exec(x.texto)![1]), 0);
    expect(ditos).toBe(encontros);
  }, 240_000);

  it('item 6: o sobrado no lote de 10 m, 4 dorm. — nenhum encontro de rede (o ponto sob a laje rebaixada chega pela parede)', () => {
    const m = lote10x30();
    const p = planejarCasa(m, entrada(m, { curto: quatro }), { pavimentos: 2 });
    const porId = new Map((p.resultado.trechos ?? []).map((t) => [t.id, t]));
    const encontros = conflitosDoModelo(p.resultado)
      .filter((c) => c.classe === 'REDE' && porId.has(c.trechoId) && porId.has(c.outroId))
      .map((c) => `${porId.get(c.trechoId)!.disciplina} × ${porId.get(c.outroId)!.disciplina}`);
    expect(encontros).toEqual([]);
    // S2 (20/10/2026): nenhuma rede atravessando pilar (a quente ia em diagonal pelo pilar junto do shaft).
    const est = new Map(p.resultado.structures.map((x) => [x.id, x]));
    const noPilar = conflitosDoModelo(p.resultado).filter((c) => c.classe === 'ESTRUTURA' && porId.has(c.trechoId) && est.get(c.outroId)?.kind === 'PILAR' && ((c as { comprimentoDentroMm?: number }).comprimentoDentroMm ?? 0) > 0);
    expect(noPilar.map((c) => porId.get(c.trechoId)!.disciplina)).toEqual([]);
    // S1 (20/10/2026): nenhum tubo horizontal na faixa do forro DENTRO da laje rebaixada (a base dela abaixo do tubo).
    const sobRebaixo = (p.resultado.trechos ?? []).filter((t) => {
      if (t.a.x === t.b.x && t.a.y === t.b.y) return false;
      const nv = p.resultado.levels.find((l) => l.id === t.levelId)!;
      return p.resultado.structures.some((x) => x.kind === 'LAJE' && x.levelId === t.levelId && x.baseMm < nv.defaultHeightMm - 1 && Math.min(t.cotaAMm, t.cotaBMm) + t.bitolaMm / 2 > x.baseMm && [0.25, 0.5, 0.75].some((f) => pointInPolygon(x.pontos as Point[], { x: t.a.x + (t.b.x - t.a.x) * f, y: t.a.y + (t.b.y - t.a.y) * f } as Point)));
    });
    expect(sobRebaixo.map((t) => `${t.disciplina} ${t.a.x},${t.a.y}→${t.b.x},${t.b.y}@${t.cotaAMm}`)).toEqual([]);
  }, 240_000);

  it('a mesma casa com "Térrea" escolhida: fica térrea, e a pendência diz que o sobrado resolve', () => {
    const m = lote10x30();
    const p = planejarCasa(m, entrada(m, { curto: quatro }), { pavimentos: 1 });
    expect(p.sobrado).toBeNull();
    expect(p.pendencias.some((x) => /^Pavimentos: a térrea não comporta o programa .* "Sobrado"/.test(x.texto))).toBe(true);
  });

  it('o programa padrão no lote de 12 × 30: cabe na térrea — fica térrea', () => {
    const m = lote();
    const p = planejarCasa(m, entrada(m), { pavimentos: 'AUTOMATICO' });
    expect(p.sobrado).toBeNull();
    expect(p.decisoes).toContain('Pavimentos automático: térrea (o programa cabe nela).');
  });
});

/**
 * F22 (parte 3, 17/10/2026): no lote 12 × 30, com a garagem em fila, a área de serviço caía no miolo da frente em colunas
 * — sem parede externa para o aquecedor. Depois do arranjo, ela troca de caixa com o banheiro que tem a fachada e encosta
 * na cozinha (o banheiro sem janela ganha exaustor, F21).
 */
describe('F22 — a área de serviço com fachada e junto da cozinha (lote 12 × 30)', () => {
  it('nenhuma pendência de serviço sem lado externo; o serviço encosta na cozinha e numa fachada', () => {
    const m = lote();
    const plano = planejarCasa(m, entrada(m));
    expect(plano.pendencias.filter((p) => /Área de serviço exige ventilação e ficou sem lado externo/.test(p.texto)).map((p) => p.texto)).toEqual([]);
    expect(plano.pendencias.filter((p) => /Cozinha × Área de serviço/.test(p.texto)).map((p) => p.texto)).toEqual([]);
  });
});

/**
 * F23 (17/10/2026) — a estrutura das casas de referência: o nó a menos de uma seção de outro pilar é atendido por ele
 * (CONFERIR, não VERIFICACAO) e a janela grande do R1-A sai em folhas, deixando lugar ao pilar intermediário.
 */
describe('F23 — estrutura: pilar vizinho e pilar entre aberturas', () => {
  const lote = (w: number, dd: number) => {
    const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const levelId = base.levels[0].id;
    const d = (a: Point, b: Point, papel: Papel): Command => ({ type: 'AddBoundary', levelId, a, b, kind: 'TERRENO', papel });
    return applyBatch(base, [d(point(0, 0), point(w, 0), 'FRENTE'), d(point(w, 0), point(w, dd), 'LATERAL_DIREITA'), d(point(w, dd), point(0, dd), 'FUNDOS'), d(point(0, dd), point(0, 0), 'LATERAL_ESQUERDA')]).model;
  };

  it('15 × 30, 4 dormitórios: o encontro colado em outro pilar é para conferir — o vizinho atende os dois', () => {
    const m = lote(15000, 30000);
    const p = planejarCasa(m, entrada(m, { curto: { ...PROGRAMA_CURTO_PADRAO, dormitorios: 4, suites: 1, banheiros: 3, vagas: 2 } }), { pavimentos: 1 });
    const colados = p.pendencias.filter((x) => /a menos de uma seção de outro pilar/.test(x.texto));
    expect(colados.length).toBeGreaterThan(0);
    expect(colados.map((x) => x.grupo)).toEqual(colados.map(() => 'CONFERIR'));
    expect(colados.every((x) => /o pilar vizinho atende os dois encontros/.test(x.texto))).toBe(true);
  }, 120_000);

  it('14 × 28 R1-A: nenhum intermediário "sem posição livre entre aberturas" (a janela de 5 m vira folhas)', () => {
    const m = lote(14000, 28000);
    const p = planejarCasa(m, entrada(m, { curto: { ...PROGRAMA_CURTO_PADRAO, padrao: 'R1-A' } }), { pavimentos: 1 });
    expect(p.pendencias.filter((x) => /sem posição livre entre aberturas/.test(x.texto)).map((x) => x.texto)).toEqual([]);
  }, 120_000);
});

/**
 * F24 (decisões do usuário, 17/10/2026): a vaga descoberta no recuo curto ("Automático": a casa recua quando a
 * profundidade deixa) e a casa em L ("só quando o retângulo não comporta" — fica a de menos problemas).
 */
describe('F24 — vagas descobertas e casa em L', () => {
  const modelos = modelosDoCatalogo(SEMENTES_DE_TIPOS.map((s, i) => ({ id: `t${i}`, nome: s.nome, familia: s.propriedades.familia, active: true, propriedades: s.propriedades })));
  const comAr = (m: BlueprintModel, mudanca: Partial<EntradaDaCasa> = {}) =>
    entrada(m, {
      hidro: { ...HIPOTESES_HIDRO_PADRAO, pluvial: { ...HIPOTESES_HIDRO_PADRAO.pluvial, intensidadeMmH: 150 } },
      modelosDeClimatizacao: modelos,
      climatizacao: { ...HIPOTESES_CLIMATIZACAO_PADRAO, clima: { cidade: null, tbsExternaC: 34, tbuExternaC: 25, altitudeM: 0 } },
      ...mudanca,
    });
  const conflitos = (r: BlueprintModel, classe: string) => {
    const porId = new Map((r.trechos ?? []).map((t) => [t.id, t]));
    return conflitosDoModelo(r).filter((c) => c.classe === classe && porId.has(c.trechoId)).map((c) => `${porId.get(c.trechoId)!.disciplina} × ${c.outroId}`);
  };

  it('12 × 30 sem garagem: as 2 vagas na frente da casa (que recua); nenhum tubo em porta ou janela (o dreno com bomba passa acima delas)', () => {
    const m = lote();
    const p = planejarCasa(m, comAr(m, { curto: { ...PROGRAMA_CURTO_PADRAO, garagemCoberta: false } }), { pavimentos: 1 });
    const r = p.resultado;
    expect(r.vagas ?? []).toHaveLength(2);
    const y0 = p.implantacao!.retanguloLocal.y0;
    expect(y0).toBeGreaterThan(3000);
    for (const v of r.vagas ?? []) expect(v.at.y + 2500).toBeLessThanOrEqual(y0);
    expect(p.pendencias.filter((x) => /não couberam/.test(x.texto)).map((x) => x.texto)).toEqual([]);
    expect(p.decisoes.some((d) => /^Vagas descobertas: .*a casa recua/.test(d))).toBe(true);
    expect(conflitos(r, 'ABERTURA')).toEqual([]);
    // F24 parte 2: a varanda de entrada na rua, a entrada por ela e a sala com a janela de 1/6; nenhum tubo × tubo
    expect(p.pendencias.filter((x) => /Iluminação natural.*Sala/.test(x.texto)).map((x) => x.texto)).toEqual([]);
    expect(conflitos(r, 'REDE')).toEqual([]);
  }, 120_000);

  it('lote em L, 4 dormitórios R1-A: a casa sai em L e alcança o programa; o anexo coberto; nenhum equipamento dentro de parede; nenhuma calha dentro da casa', () => {
    const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const levelId = base.levels[0].id;
    const v: [number, number, Papel][] = [[0, 0, 'FRENTE'], [20000, 0, 'LATERAL_DIREITA'], [20000, 15000, 'LATERAL_DIREITA'], [10000, 15000, 'LATERAL_DIREITA'], [10000, 30000, 'FUNDOS'], [0, 30000, 'LATERAL_ESQUERDA']];
    const m = applyBatch(base, v.map(([x, y, papel], i): Command => ({ type: 'AddBoundary', levelId, a: point(x, y), b: point(v[(i + 1) % v.length][0], v[(i + 1) % v.length][1]), kind: 'TERRENO', papel }))).model;
    const p = planejarCasa(m, comAr(m, { curto: { ...PROGRAMA_CURTO_PADRAO, dormitorios: 4, suites: 1, banheiros: 3, vagas: 2, padrao: 'R1-A' } }), { pavimentos: 1 });
    expect(p.decisoes.some((d) => /^Forma da casa: em L/.test(d))).toBe(true);
    expect(p.implantacao?.contornoLocal).not.toBeNull();
    expect(p.implantacao!.medidas.projecaoM2).toBeGreaterThanOrEqual(p.implantacao!.medidas.projecaoPedidaM2 - 0.5);
    expect(p.pendencias.filter((x) => /sem cobertura/.test(x.texto)).map((x) => x.texto)).toEqual([]);
    expect((p.resultado.roofs ?? []).length).toBeGreaterThanOrEqual(3); // duas águas do principal + a do anexo
    expect(p.pendencias.filter((x) => /equipamento x parede/.test(x.texto)).map((x) => x.texto)).toEqual([]);
    const calhas = (p.resultado.trechos ?? []).filter((t) => t.rotulo === 'Calha');
    const casa = p.resultado.spaces.filter((s) => s.levelId === levelId);
    for (const c of calhas) for (const q of [c.a, c.b, { x: (c.a.x + c.b.x) / 2, y: (c.a.y + c.b.y) / 2 }]) expect(casa.some((s) => pointInPolygon(s.ring, point(q.x, q.y))), JSON.stringify(c)).toBe(false);
    // F24 parte 2: as rotas enterradas por fora e longe dos pilares; a evaporadora fora do pilar saliente
    expect(p.pendencias.filter((x) => x.grupo === 'CONFLITO' || /atravessando pilar|rente ao esgoto/.test(x.texto)).map((x) => x.texto)).toEqual([]);
    expect(conflitos(p.resultado, 'REDE')).toEqual([]);
  }, 240_000);

  it.each([
    ['L de frente larga, 3 dormitórios', [[0, 0, 'FRENTE'], [20000, 0, 'LATERAL_DIREITA'], [20000, 15000, 'LATERAL_DIREITA'], [10000, 15000, 'LATERAL_DIREITA'], [10000, 30000, 'FUNDOS'], [0, 30000, 'LATERAL_ESQUERDA']]],
    ['L de fundo largo, 3 dormitórios', [[0, 0, 'FRENTE'], [10000, 0, 'LATERAL_DIREITA'], [10000, 15000, 'LATERAL_DIREITA'], [20000, 15000, 'LATERAL_DIREITA'], [20000, 30000, 'FUNDOS'], [0, 30000, 'LATERAL_ESQUERDA']]],
  ] as [string, [number, number, Papel][]][])('%s (retângulo): o esgoto não passa por pilar; o pluvial por fora, longe do esgoto e do alimentador', (_, v) => {
    const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const levelId = base.levels[0].id;
    const m = applyBatch(base, v.map(([x, y, papel], i): Command => ({ type: 'AddBoundary', levelId, a: point(x, y), b: point(v[(i + 1) % v.length][0], v[(i + 1) % v.length][1]), kind: 'TERRENO', papel }))).model;
    const p = planejarCasa(m, comAr(m), { pavimentos: 1 });
    expect(p.pendencias.filter((x) => /atravessando pilar|rente ao esgoto|POR BAIXO de/.test(x.texto)).map((x) => x.texto)).toEqual([]);
    expect(conflitos(p.resultado, 'REDE')).toEqual([]);
  }, 240_000);
});

describe('F27 — o serviço com fachada na casa larga e rasa', () => {
  it.each([
    ['L de frente larga, 3 dormitórios', [[0, 0, 'FRENTE'], [20000, 0, 'LATERAL_DIREITA'], [20000, 15000, 'LATERAL_DIREITA'], [10000, 15000, 'LATERAL_DIREITA'], [10000, 30000, 'FUNDOS'], [0, 30000, 'LATERAL_ESQUERDA']]],
    ['L de fundo largo, 3 dormitórios', [[0, 0, 'FRENTE'], [10000, 0, 'LATERAL_DIREITA'], [10000, 15000, 'LATERAL_DIREITA'], [20000, 15000, 'LATERAL_DIREITA'], [20000, 30000, 'FUNDOS'], [0, 30000, 'LATERAL_ESQUERDA']]],
  ] as [string, [number, number, Papel][]][])('%s: a área de serviço na fachada lateral, embaixo da cozinha — nenhum cômodo sem o lado externo que pede', (_, v) => {
    // Antes: a faixa ao lado da garagem em duas linhas, e o serviço no miolo da de trás (só a ponta dela tem fachada).
    const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const levelId = base.levels[0].id;
    const m = applyBatch(base, v.map(([x, y, papel], i): Command => ({ type: 'AddBoundary', levelId, a: point(x, y), b: point(v[(i + 1) % v.length][0], v[(i + 1) % v.length][1]), kind: 'TERRENO', papel }))).model;
    // Com o catálogo de climatização: o lavabo que fica no miolo ganha o exaustor (F21) — vira CONFERIR, não "sem lado".
    const modelos = modelosDoCatalogo(SEMENTES_DE_TIPOS.map((s2, i) => ({ id: `t${i}`, nome: s2.nome, familia: s2.propriedades.familia, active: true, propriedades: s2.propriedades })));
    const p = planejarCasa(
      m,
      entrada(m, { modelosDeClimatizacao: modelos, climatizacao: { ...HIPOTESES_CLIMATIZACAO_PADRAO, clima: { cidade: null, tbsExternaC: 34, tbuExternaC: 25, altitudeM: 0 } } }),
      { pavimentos: 1 },
    );
    expect(p.pendencias.filter((x) => /ficou sem lado externo/.test(x.texto)).map((x) => x.texto)).toEqual([]);
    // E a área de serviço tem parede externa (o aquecedor a gás, a roupa).
    expect(p.pendencias.some((x) => /^Arquitetura: Área de serviço/.test(x.texto))).toBe(false);
    expect(conferirPlanoDaCasa(m, p)).toEqual({ ok: true });
  }, 240_000);
});

/**
 * F25 (decisão do usuário, 16/10/2026: "platô único"): no terreno inclinado a casa assenta no platô da cota de equilíbrio
 * sob a projeção — o térreo sobe (ou desce) com ele, talude ou muro nas bordas, e a entrada da calçada ao piso.
 */
describe('F25 — terreno inclinado: o platô único', () => {
  const modelos = modelosDoCatalogo(SEMENTES_DE_TIPOS.map((s, i) => ({ id: `t${i}`, nome: s.nome, familia: s.propriedades.familia, active: true, propriedades: s.propriedades })));
  /** 10 % (ou `pct`) subindo da frente (100 m) para os fundos, a grade cobrindo o lote com folga. */
  const rampa = (pct = 10): GradeDeElevacao => {
    const esp = 500;
    const origem = point(-5000, -5000);
    const colunas = 45;
    const linhas = 81;
    const cotasM: number[] = [];
    for (let l = 0; l < linhas; l++) for (let c = 0; c < colunas; c++) cotasM.push(100 + (pct / 100) * ((origem.y + l * esp) / 1000));
    return { origem, espacamentoMm: esp, colunas, linhas, cotasM };
  };
  const comTerreno = (m: BlueprintModel, pct = 10): EntradaDaCasa => {
    const grade = rampa(pct);
    return entrada(m, {
      hidro: { ...HIPOTESES_HIDRO_PADRAO, pluvial: { ...HIPOTESES_HIDRO_PADRAO.pluvial, intensidadeMmH: 150 } },
      modelosDeClimatizacao: modelos,
      climatizacao: { ...HIPOTESES_CLIMATIZACAO_PADRAO, clima: { cidade: null, tbsExternaC: 34, tbuExternaC: 25, altitudeM: 0 } },
      leitorDoTerreno: { cotaEmM: amostradorDaGrade(grade), cotaZeroM: 100 },
      gradeDoTerreno: grade,
    });
  };
  const encontrosDeRede = (r: BlueprintModel) => {
    const porId = new Map((r.trechos ?? []).map((t) => [t.id, t]));
    return conflitosDoModelo(r).filter((c) => c.classe === 'REDE' && porId.has(c.trechoId)).map((c) => `${porId.get(c.trechoId)!.disciplina} × ${c.outroId}`);
  };

  it('térrea: o térreo assenta no platô (primeiro comando do lote), volumes e bordas no resumo, a entrada dita; nenhum tubo × tubo; a trava aprova', () => {
    const m = lote();
    const p = planejarCasa(m, comTerreno(m), { pavimentos: 1 });
    const t = p.resumo.terraplenagem!;
    expect(t).not.toBeNull();
    expect(p.etapas.find((e) => e.id === 'TERRAPLENAGEM')?.situacao).toBe('LANCOU');
    expect(p.comandos[0]).toMatchObject({ type: 'SetLevelProps', elevationMm: t.elevacaoDoTerreoMm });
    expect(t.elevacaoDoTerreoMm).toBeGreaterThan(500);
    expect(p.resultado.levels[0].elevationMm).toBe(t.elevacaoDoTerreoMm);
    expect(t.corteM3).toBeGreaterThan(0);
    expect(t.aterroM3).toBeGreaterThan(0);
    expect(p.pendencias.some((x) => /^Terraplenagem: a entrada sobe .*, lançada diante da porta de entrada\.$/.test(x.texto))).toBe(true);
    // A escada de acesso (kernel 0.103.0, decisão do usuário 18/10/2026: "escada partindo do terreno"): da calçada ao
    // térreo, os degraus que o platô calculou, terminando na face da fachada; nenhum conflito dela.
    // A escada de PEDESTRE (a rampa da garagem — F26 — também parte da calçada, mas é veicular).
    const acesso = p.resultado.stairs.filter((e) => e.desdeCotaMm != null && !e.veicular);
    expect(acesso).toHaveLength(1);
    expect(acesso[0]).toMatchObject({ levelId: p.levelId, tipo: 'ESCADA', rotulo: 'Acesso', desdeCotaMm: t.entrada.cotaDaCalcadaMm });
    expect(medirEscada(p.resultado, acesso[0]).desnivelMm).toBe(t.elevacaoDoTerreoMm - t.entrada.cotaDaCalcadaMm!);
    expect(medirEscada(p.resultado, acesso[0]).degraus).toBe(t.entrada.degraus);
    expect(acesso[0].pontos[0].y).toBeLessThan(acesso[0].pontos[1].y); // da rua (frente ao sul, y baixo) para a porta
    expect(conflitosDoModelo(p.resultado).filter((c) => (c as { pecaId?: string }).pecaId === acesso[0].id || c.trechoId === acesso[0].id || c.outroId === acesso[0].id)).toEqual([]);
    expect(furosDaEscada(p.resultado).filter((f) => f.escadaId === acesso[0].id)).toEqual([]);
    expect(p.pendencias.filter((x) => /^Terraplenagem: muro/.test(x.texto)).every((x) => /na borda (da frente|dos fundos|da esquerda|da direita)/.test(x.texto))).toBe(true);
    expect(encontrosDeRede(p.resultado)).toEqual([]);
    expect(p.pendencias.filter((x) => /rente ao esgoto/.test(x.texto)).map((x) => x.texto)).toEqual([]);
    expect(conferirPlanoDaCasa(m, p)).toEqual({ ok: true });
  }, 240_000);

  it('sobrado: o superior fica um andar acima do térreo NOVO', () => {
    const m = lote();
    const p = planejarCasa(m, comTerreno(m), { pavimentos: 2 });
    const [t, s] = [...p.resultado.levels].sort((a, b) => a.elevationMm - b.elevationMm);
    expect(t.elevationMm).toBe(p.resumo.terraplenagem!.elevacaoDoTerreoMm);
    expect(s.elevationMm - t.elevationMm).toBeGreaterThanOrEqual(2800);
    // A escada interna liga os dois pavimentos; a de acesso, a calçada ao térreo.
    expect(p.resultado.stairs.filter((e) => e.desdeCotaMm == null && e.levelId === t.id)).toHaveLength(1);
    expect(p.resultado.stairs.filter((e) => e.desdeCotaMm != null && !e.veicular).map((e) => e.levelId)).toEqual([t.id]);
  }, 240_000);

  it('terreno de 20 %: a escada não cabe no recuo de frente — nenhuma escada de acesso, e a pendência diz', () => {
    const m = lote();
    const p = planejarCasa(m, comTerreno(m, 20), { pavimentos: 1 });
    expect(p.resumo.terraplenagem!.entrada.cabe).toBe(false);
    expect(p.resultado.stairs.filter((e) => e.desdeCotaMm != null && !e.veicular)).toEqual([]);
    expect(p.pendencias.some((x) => x.grupo === 'VERIFICACAO' && /^Terraplenagem: a entrada sobe .*não cabe no recuo de frente; desenhe o acesso à mão\.$/.test(x.texto))).toBe(true);
    expect(conferirPlanoDaCasa(m, p)).toEqual({ ok: true });
  }, 240_000);

  it('sem a topografia: nenhuma etapa de terraplenagem e o térreo na cota zero (como antes)', () => {
    const m = lote();
    const p = planejarCasa(m, entrada(m), { pavimentos: 1 });
    expect(p.etapas.some((e) => e.id === 'TERRAPLENAGEM')).toBe(false);
    expect(p.resumo.terraplenagem).toBeNull();
    expect(p.resultado.levels[0].elevationMm).toBe(0);
  });

  // F26 (decisão do usuário, 18/10/2026: "Automático: rampa, recuando a casa"): a garagem no platô e a rampa de veículos.
  it('F26 — terreno de 10 %: a casa recua até a rampa da garagem caber; a rampa (veicular) sai da rua à garagem', () => {
    const m = lote();
    const p = planejarCasa(m, comTerreno(m), { pavimentos: 1 });
    const t = p.resumo.terraplenagem!;
    const rampa = p.resultado.stairs.filter((e) => e.veicular);
    expect(rampa).toHaveLength(1);
    expect(rampa[0]).toMatchObject({ tipo: 'RAMPA', rotulo: 'Rampa da garagem', levelId: p.levelId });
    const med = medirEscada(p.resultado, rampa[0]);
    expect(med.desnivelMm).toBe(t.elevacaoDoTerreoMm - rampa[0].desdeCotaMm!);
    expect(med.inclinacaoPct).toBeLessThanOrEqual(20 + 1e-6);
    expect(med.avisos).toEqual([]);
    // A casa saiu do recuo de 3 m da zona: a rampa pede mais de 10 m da frente à fachada.
    expect(p.implantacao!.retanguloLocal.y0).toBeGreaterThan(10000);
    expect(p.decisoes.some((d) => /^Garagem: a rampa de veículos pede .* a casa recua/.test(d))).toBe(true);
    expect(conflitosDoModelo(p.resultado).filter((c) => (c as { pecaId?: string }).pecaId === rampa[0].id)).toEqual([]);
    expect(conferirPlanoDaCasa(m, p)).toEqual({ ok: true });
  }, 240_000);

  it('F26 — terreno de 25 % (mais íngreme que a rampa): a casa não recua à toa; nenhuma rampa, e a pendência diz', () => {
    const m = lote();
    const p = planejarCasa(m, comTerreno(m, 25), { pavimentos: 1 });
    expect(p.implantacao!.retanguloLocal.y0).toBe(3000);
    expect(p.resultado.stairs.filter((e) => e.veicular)).toEqual([]);
    expect(p.pendencias.some((x) => x.grupo === 'VERIFICACAO' && /^Garagem: a rampa de veículos sobe .* entre o muro e a fachada/.test(x.texto))).toBe(true);
    expect(conferirPlanoDaCasa(m, p)).toEqual({ ok: true });
  }, 240_000);
});

/**
 * F26 (decisões do usuário, 16/10/2026: "muro + portão + calçada"; 18/10/2026: "família nova no kernel"): o muro do lote,
 * os portões e as calçadas — e o jardim, que é a permeabilidade desenhada.
 */
describe('F26 — muro, portões e calçadas', () => {
  it('o muro na divisa, os dois portões, as calçadas e o jardim; a taxa de permeabilidade desenhada passa', () => {
    const m = lote();
    const p = planejarCasa(m, entrada(m), { pavimentos: 1 });
    expect(p.etapas.find((e) => e.id === 'MURO')?.situacao).toBe('LANCOU');
    const muros = p.resultado.muros ?? [];
    expect(muros.map((x) => [x.rotulo, x.tipo])).toEqual([
      ['Muro da frente', 'MURETA_COM_GRADE'],
      ['Muro de divisa', 'ALVENARIA'],
    ]);
    expect(muros[0].portoes.map((g) => g.tipo).sort()).toEqual(['GARAGEM', 'PEDESTRE']);
    const regioes = p.resultado.subRegioes ?? [];
    expect(regioes.some((r) => r.nome === 'Acesso da garagem')).toBe(true);
    expect(regioes.some((r) => r.nome === 'Calçada da entrada')).toBe(true);
    expect(regioes.filter((r) => r.nome === 'Jardim').every((r) => r.material === 'GRAMA')).toBe(true);
    expect(p.resumo.muro!.jardimM2).toBeGreaterThan(150);
    // Sem o jardim, a permeabilidade desenhada seria só a das calçadas (zero) e a regra da zona acusaria em falso.
    expect(p.pendencias.filter((x) => /Taxa de permeabilidade|permeabilidade cai/.test(x.texto)).map((x) => x.texto)).toEqual([]);
    expect(conferirPlanoDaCasa(m, p)).toEqual({ ok: true });
  }, 240_000);

  it('desligado nas hipóteses: a etapa NAO_EXIGIDA, nenhum muro nem sub-região', () => {
    const m = lote();
    const p = planejarCasa(m, entrada(m), { pavimentos: 1, muro: { ...HIPOTESES_DO_MURO_DA_CASA_PADRAO, lancar: false } });
    expect(p.etapas.find((e) => e.id === 'MURO')?.situacao).toBe('NAO_EXIGIDA');
    expect(p.resultado.muros ?? []).toEqual([]);
    expect(p.resultado.subRegioes ?? []).toEqual([]);
  }, 240_000);
});

describe('item 9 — R1-B: cozinha e serviço juntos, com os mínimos (decisões do usuário, 19/10/2026)', () => {
  it('15 × 30, 3 dorm. R1-B: o serviço fica na frente com a cozinha (porta direta) e a casa alarga só o necessário para os mínimos', () => {
    const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const L = base.levels[0].id;
    const d = (a: Point, b: Point, papel: Papel): Command => ({ type: 'AddBoundary', levelId: L, a, b, kind: 'TERRENO', papel });
    const m = applyBatch(base, [d(point(0, 0), point(15000, 0), 'FRENTE'), d(point(15000, 0), point(15000, 30000), 'LATERAL_DIREITA'), d(point(15000, 30000), point(0, 30000), 'FUNDOS'), d(point(0, 30000), point(0, 0), 'LATERAL_ESQUERDA')]).model;
    const p = planejarCasa(m, entrada(m, { curto: { ...PROGRAMA_CURTO_PADRAO, dormitorios: 3, suites: 1, banheiros: 2, vagas: 2, padrao: 'R1-B' } }), { pavimentos: 1 });
    expect(p.pendencias.filter((x) => /Cozinha × Área de serviço/.test(x.texto)).map((x) => x.texto)).toEqual([]);
    expect(p.pendencias.filter((x) => /^Legislação: .*largura mínima/.test(x.texto)).map((x) => x.texto)).toEqual([]);
    expect(p.pendencias.filter((x) => x.grupo === 'SEM_SOLUCAO').map((x) => x.texto)).toEqual([]);
  }, 600_000);
});
