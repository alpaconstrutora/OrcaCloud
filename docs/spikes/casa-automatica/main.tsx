/**
 * Harness da "Casa automática" (plano `docs/planos/2026-10-14-casa-automatica.md`).
 *
 * O lote de prova — 12 × 30 m, quatro divisas TERRENO com papel (FRENTE ao sul), girado de
 * `?graus=N` — no `BlueprintCanvas` REAL, sem Supabase. F3: `planejarCasa` roda aqui sobre o
 * lote com a zona fictícia do plano (TO 60 %, CA 1,2, permeabilidade 20 %, recuos 3/1,5/1,5/3 m),
 * o RESULTADO é desenhado (enquadrado) e o essencial do plano vai para `window.__estado`, que o
 * `medir.mjs` confere (exit ≠ 0 reprova).
 *
 * Abrir em: /docs/spikes/casa-automatica/index.html[?graus=30][&pavimentos=2][&ver=superior] no servidor de dev.
 * F12d: `pavimentos=2` gera o SOBRADO; `ver=superior` desenha o pavimento de cima.
 */

import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import { conflitosDoModelo, applyBatch, applyCommand, emptyModel, point, pointInPolygon, type BlueprintModel, type Command, type Point } from '../../../utils/blueprintKernel';
import { ROTULO_DO_ALIMENTADOR } from '../../../utils/blueprintAlimentador';
import { medirTerreno } from '../../../utils/blueprintTerreno';
import { ZONA_DA_MASSA_VAZIA } from '../../../utils/blueprintMassa';
import { conferirPlanoDaCasa, planejarCasa } from '../../../utils/blueprintCasaAutomatica';
import { PROGRAMA_CURTO_PADRAO } from '../../../utils/blueprintPrograma';
import { planejarCalhas } from '../../../utils/blueprintCalhas';
import { HIPOTESES_PLUVIAIS_PADRAO } from '../../../utils/blueprintPluvial';
import { HIPOTESES_HIDRO_PADRAO } from '../../../utils/blueprintMemorialHidro';
import { modelosDoCatalogo } from '../../../utils/blueprintSelecaoClimatizacao';
import { SEMENTES_DE_TIPOS } from '../../../utils/blueprintCatalogoDeTipos';
import { HIPOTESES_CLIMATIZACAO_PADRAO } from '../../../utils/blueprintClimatizacao';
import { pontosElegiveis } from '../../../utils/blueprintCircuitosAutomaticos';
import { prumadasPeloMeioDoComodo } from '../../../utils/blueprintSobrado';

declare global {
  interface Window {
    __estado: {
      graus: number;
      divisas: number;
      frente: number;
      plano: {
        etapas: { id: string; situacao: string; nota: string | null }[];
        comandos: number;
        ambientesPedidos: number;
        ambientesAtendidos: number;
        ambientesNomeados: number;
        aberturasPedidas: number;
        aberturasCriadas: number;
        toPct: number | null;
        toMaxPct: number;
        regrasVioladas: number;
        conferido: boolean;
        pendencias: string[];
        estrutura: { eixos: number; pilares: number; vigas: number; lajes: number; blocos: number; estacas: number; baldrames: number };
        pilaresForaDeParede: number;
        ambientesNoPavimento: number;
        telhado: { aguas: number; paredesCobertas: boolean; calhas: number; motivoDaPluvial: string | null };
        ancoras: { caixaDaguaL: number | null; caixaDeGordura: boolean; aquecedor: boolean; vagas: number; vagasNaGaragem: number; vagasPedidas: number };
        kits: { ambiente: string; faltam: string[]; duplicados: number }[];
        pecasDeMobiliario: number;
        hidraulica: { agua: number; esgoto: number; pluvial: number; porTipo: Record<string, number> };
        alimentadorNoBaldrame: { maiorMm: number; larguraMm: number; travessias: number };
        eletrica: { faltas: number; regras: string[]; soltos: number; circuitos: number; splits: number; marcasDoAr: Record<string, number>; entrada: string | null };
        errosDeRede: number;
        pressaoInsuficiente: { fria: number; quente: number };
        pressurizador: boolean;
        /** F14b: o forro e os encontros entre as quatro redes que correm nele (eletroduto, linha, quente, fria). */
        forro: { comodos: number; peDireitoLivreMinimoMm: number | null; encontros: number } | null;
        /** F14c: os furos previstos para o calculista e a laje rebaixada sob os banheiros de cima. */
        furos: { emViga: number; dispensa: number; verificar: number; emBaldrame: number; emLaje: number } | null;
        rebaixo: { lajes: number; esgotoForaMm: number };
        /** F14d: a linha do ar e o dreno lado a lado. */
        ar: { drenoEmVao: number; linhaComDreno: number; drenoJuntoDaLinhaPct: number };
      } | null;
      /** F12d: o sobrado (null na térrea). */
      sobrado: {
        niveis: number;
        elevacaoDoSuperior: number;
        escada: { degraus: number; espelhoMm: number; pisoMm: number; avisos: number };
        portas: { terreo: string | null; superior: string | null };
        ambientesNomeados: { terreo: number; superior: number };
        pilaresSemPrumada: number;
        furos: number;
        shafts: number;
        tqForaDoShaft: number;
        caixaNoSuperior: boolean;
        telhadoNoSuperior: boolean;
        quadroNoTerreo: boolean;
        soltosPorNivel: { terreo: number; superior: number };
        splitsPorNivel: { terreo: number; superior: number };
        prumadasPeloMeio: string[];
      } | null;
    };
  }
}

const FRENTE_MM = 12000;
const FUNDO_MM = 30000;
const TO_MAX = 60;
const params = new URLSearchParams(location.search);
const graus = Number(params.get('graus') ?? '0') || 0;
const pavimentos: 1 | 2 = params.get('pavimentos') === '2' ? 2 : 1;
const verSuperior = params.get('ver') === 'superior';

function loteDeProva(): BlueprintModel {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const levelId = base.levels[0].id;
  const c = Math.cos((graus * Math.PI) / 180);
  const s = Math.sin((graus * Math.PI) / 180);
  const g = (x: number, y: number): Point => (graus === 0 ? point(x, y) : point(Math.round(x * c - y * s), Math.round(x * s + y * c)));
  const d = (a: Point, b: Point, papel: 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA'): Command => ({ type: 'AddBoundary', levelId, a, b, kind: 'TERRENO', papel });
  return applyBatch(base, [
    d(g(0, 0), g(FRENTE_MM, 0), 'FRENTE'),
    d(g(FRENTE_MM, 0), g(FRENTE_MM, FUNDO_MM), 'LATERAL_DIREITA'),
    d(g(FRENTE_MM, FUNDO_MM), g(0, FUNDO_MM), 'FUNDOS'),
    d(g(0, FUNDO_MM), g(0, 0), 'LATERAL_ESQUERDA'),
  ]).model;
}

const lote = loteDeProva();
const levelId = lote.levels[0].id;
const plano = planejarCasa(lote, {
  levelId,
  ctx: {
    terreno: medirTerreno(lote.boundaries),
    limites: lote.boundaries,
    recuosBase: { FRENTE: 3000, FUNDOS: 3000, LATERAL_DIREITA: 1500, LATERAL_ESQUERDA: 1500 },
    zona: { ...ZONA_DA_MASSA_VAZIA, taxaOcupacaoMaxPct: TO_MAX, coeficienteMax: 1.2, taxaPermeabilidadeMinPct: 20, gabaritoPavimentos: 2 },
  },
  curto: PROGRAMA_CURTO_PADRAO,
  rotacaoNorteDeg: null,
  latitudeGraus: -19.9,
  // F8: a intensidade de chuva das premissas (150 mm/h) — sem ela a pluvial não roda.
  hidro: { ...HIPOTESES_HIDRO_PADRAO, pluvial: { ...HIPOTESES_HIDRO_PADRAO.pluvial, intensidadeMmH: 150 } },
  // F9: o catálogo semente de evaporadoras e o clima declarado (as premissas que o estudo traria).
  modelosDeClimatizacao: modelosDoCatalogo(SEMENTES_DE_TIPOS.map((s, i) => ({ id: `t${i}`, nome: s.nome, familia: s.propriedades.familia, active: true, propriedades: s.propriedades }))),
  climatizacao: { ...HIPOTESES_CLIMATIZACAO_PADRAO, clima: { cidade: null, tbsExternaC: 34, tbuExternaC: 25, altitudeM: 0 } },
}, { pavimentos });
const model = plano.resultado;
const superiorId = plano.sobrado?.nivelSuperiorId ?? null;
const nivelVisto = verSuperior && superiorId ? superiorId : levelId;

/** F12d: o que o sobrado tem de próprio, nos dois pavimentos. */
function sobradoDoModelo(m: BlueprintModel) {
  if (!plano.sobrado || !superiorId) return null;
  const S = superiorId;
  const T = levelId;
  const pil = (L: string) => m.structures.filter((x) => x.kind === 'PILAR' && x.levelId === L);
  const vigasT = m.structures.filter((x) => x.kind === 'VIGA' && x.levelId === T);
  const perto = (a: Point, b: Point, mm: number) => Math.hypot(a.x - b.x, a.y - b.y) <= mm;
  const naViga = (q: Point) =>
    vigasT.some((v) => {
      const [a, b] = v.pontos;
      const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const t = ((q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y)) / L;
      return t >= -300 && t <= L + 300 && Math.abs((q.x - a.x) * (b.y - a.y) - (q.y - a.y) * (b.x - a.x)) / L <= v.larguraMm / 2 + 300;
    });
  const shafts = (m.nucleos ?? []).filter((n) => n.tipo === 'SHAFT');
  const tq = m.trechos.filter((t) => t.levelId === T && t.rotulo === 'TQ' && t.a.x === t.b.x && t.a.y === t.b.y);
  const caixa = m.terminais.find((t) => t.tipoHidraulico === 'RESERVATORIO');
  const splits = (L: string) => m.terminais.filter((t) => t.levelId === L && t.tipoEletrico === 'AR_CONDICIONADO').length;
  const nomeados = (L: string) => m.spaces.filter((s) => s.levelId === L && (s.name ?? '').trim()).length;
  const furos = (() => {
    // o furo da escada é derivado: a escada sobre a laje do térreo
    const e = m.stairs[0];
    return e ? m.structures.filter((x) => x.kind === 'LAJE' && x.levelId === T && e.pontos.some((q) => pointInPolygon(x.pontos, q))).length : 0;
  })();
  return {
    niveis: m.levels.length,
    elevacaoDoSuperior: m.levels.find((l) => l.id === S)?.elevationMm ?? 0,
    escada: { degraus: plano.sobrado.escada.degraus, espelhoMm: plano.sobrado.escada.espelhoMm, pisoMm: plano.sobrado.escada.pisoMm, avisos: plano.pendencias.filter((p) => p.grupo === 'VERIFICACAO' && /^Escada:/.test(p.texto)).length },
    portas: plano.sobrado.portas,
    ambientesNomeados: { terreo: nomeados(T), superior: nomeados(S) },
    pilaresSemPrumada: pil(S).filter((x) => !pil(T).some((y) => perto(x.pontos[0], y.pontos[0], 200)) && !naViga(x.pontos[0])).length,
    furos,
    shafts: shafts.length,
    tqForaDoShaft: tq.filter((t) => !shafts.some((n) => pointInPolygon(n.ring, t.a))).length,
    caixaNoSuperior: caixa?.levelId === S,
    telhadoNoSuperior: m.roofs.length > 0 && m.roofs.every((r) => r.levelId === S),
    quadroNoTerreo: (m.quadros ?? []).length === 1 && m.quadros[0].levelId === T,
    soltosPorNivel: { terreo: pontosElegiveis(m, T).length, superior: pontosElegiveis(m, S).length },
    splitsPorNivel: { terreo: splits(T), superior: splits(S) },
    prumadasPeloMeio: prumadasPeloMeioDoComodo(m).map((x) => `${x.rotulo ?? x.disciplina} em ${x.comodo} (${x.nivel})`),
  };
}

/** F8c: os encontros do alimentador com o baldrame — o maior pedaço dentro dele e a largura do baldrame. */
function alimentadorNoBaldrame(m: BlueprintModel) {
  const peca = new Map(m.structures.map((x) => [x.id, x]));
  const enc = conflitosDoModelo({ ...m, trechos: (m.trechos ?? []).filter((t) => t.rotulo === ROTULO_DO_ALIMENTADOR) })
    .filter((c) => c.classe === 'ESTRUTURA' && c.comprimentoDentroMm > 0 && peca.get(c.outroId)?.kind === 'VIGA_FUNDACAO');
  return {
    maiorMm: Math.round(Math.max(0, ...enc.map((c) => c.comprimentoDentroMm))),
    larguraMm: Math.max(0, ...enc.map((c) => peca.get(c.outroId)!.larguraMm)),
    travessias: enc.length,
  };
}

/** F7: em cada ambiente molhado, o que falta do kit hidráulico e quantos (tipo, disciplina) aparecem duas vezes. */
function kitsDoModelo(m: BlueprintModel) {
  const KIT: [RegExp, string[]][] = [
    [/^banheiro/i, ['VASO_SANITARIO:AGUA_FRIA', 'VASO_SANITARIO:ESGOTO', 'LAVATORIO:AGUA_FRIA', 'LAVATORIO:ESGOTO', 'CHUVEIRO:AGUA_FRIA', 'CAIXA_SIFONADA:ESGOTO']],
    [/^cozinha/i, ['PIA_COZINHA:AGUA_FRIA', 'PIA_COZINHA:ESGOTO']],
    [/servi/i, ['TANQUE:AGUA_FRIA', 'TANQUE:ESGOTO', 'MAQUINA_LAVAR:AGUA_FRIA', 'MAQUINA_LAVAR:ESGOTO']],
  ];
  return m.spaces
    .filter((s) => s.levelId === levelId)
    .flatMap((s) => {
      const k = KIT.find(([re]) => re.test(s.name ?? ''));
      if (!k) return [];
      const chaves = m.terminais.filter((t) => t.levelId === levelId && t.tipoHidraulico && pointInPolygon(s.ring, t.at)).map((t) => `${t.tipoHidraulico}:${t.disciplina}`);
      return [{ ambiente: s.name ?? '', faltam: k[1].filter((x) => !chaves.includes(x)), duplicados: chaves.length - new Set(chaves).size }];
    });
}

/** F5: as águas, se cobrem todas as pontas de parede, e o que a pluvial faz com elas (intensidade de 150 mm/h). */
function telhadoDoModelo(m: BlueprintModel) {
  const aguas = (m.roofs ?? []).filter((a) => a.levelId === levelId);
  const dentro = (q: Point) =>
    aguas.some((a) => {
      let d = false;
      const r = a.pontos;
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i].y > q.y) !== (r[j].y > q.y) && q.x < ((r[j].x - r[i].x) * (q.y - r[i].y)) / (r[j].y - r[i].y) + r[i].x) d = !d;
      return d;
    });
  const paredesCobertas = m.walls.filter((w) => w.levelId === levelId).every((w) => dentro(w.a) && dentro(w.b));
  const calhas = planejarCalhas(m, { ...HIPOTESES_PLUVIAIS_PADRAO, intensidadeMmH: 150 });
  return { aguas: aguas.length, paredesCobertas, calhas: calhas.calhas.length, motivoDaPluvial: calhas.motivo };
}

/** F4: pilar cujo centro não está sobre parede nenhuma (meia espessura + 10 mm). */
function pilaresForaDeParede(m: BlueprintModel): number {
  const ws = m.walls.filter((w) => w.levelId === levelId);
  const dseg = (a: Point, b: Point, q: Point) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy));
  };
  return m.structures.filter((x) => x.kind === 'PILAR' && !ws.some((w) => dseg(w.a, w.b, x.pontos[0]) <= w.thicknessMm / 2 + 10)).length;
}
const loteM2 = (FRENTE_MM * FUNDO_MM) / 1e6;
window.__estado = {
  graus,
  divisas: model.boundaries.filter((b) => b.kind === 'TERRENO').length,
  frente: model.boundaries.filter((b) => b.papel === 'FRENTE').length,
  plano: {
    etapas: plano.etapas.map((e) => ({ id: e.id, situacao: e.situacao, nota: e.nota })),
    comandos: plano.comandos.length,
    ambientesPedidos: plano.resumo.ambientesPedidos,
    ambientesAtendidos: plano.resumo.ambientesAtendidos,
    ambientesNomeados: model.spaces.filter((s) => s.levelId === levelId && (s.name ?? '').trim()).length,
    aberturasPedidas: plano.comandos.flatMap((c) => (c.type === 'AddOpenings' ? c.openings : [])).length,
    aberturasCriadas: model.openings.length,
    toPct: plano.resumo.areaConstruidaM2 == null ? null : Math.round((plano.resumo.areaConstruidaM2 / loteM2) * 1000) / 10,
    toMaxPct: TO_MAX,
    regrasVioladas: plano.resumo.regrasVioladas,
    conferido: conferirPlanoDaCasa(lote, plano).ok,
    pendencias: plano.pendencias.map((p) => `${p.grupo}: ${p.texto}`),
    estrutura: plano.resumo.estrutura,
    pilaresForaDeParede: pilaresForaDeParede(model),
    ambientesNoPavimento: model.spaces.filter((s) => s.levelId === levelId).length,
    telhado: telhadoDoModelo(model),
    ancoras: {
      caixaDaguaL: plano.resumo.ancoras?.caixaDaguaL ?? null,
      caixaDeGordura: plano.resumo.ancoras?.caixaDeGordura ?? false,
      aquecedor: plano.resumo.ancoras?.aquecedor ?? false,
      vagas: model.vagas.filter((v) => v.levelId === levelId).length,
      vagasNaGaragem: (() => {
        const g = model.spaces.find((x) => /garagem/i.test(x.name ?? ''));
        return g ? model.vagas.filter((v) => pointInPolygon(g.ring, v.at)).length : 0;
      })(),
      vagasPedidas: PROGRAMA_CURTO_PADRAO.vagas,
    },
    kits: kitsDoModelo(model),
    pecasDeMobiliario: plano.resumo.mobiliario.pecas,
    hidraulica: {
      agua: plano.resumo.hidraulica.agua.tubos,
      esgoto: plano.resumo.hidraulica.esgoto.tubos,
      pluvial: plano.resumo.hidraulica.pluvial.tubos,
      porTipo: plano.resumo.hidraulica.verificacao.porTipo,
    },
    alimentadorNoBaldrame: alimentadorNoBaldrame(model),
    eletrica: {
      faltas: plano.resumo.eletrica.conferencia.faltas,
      regras: Object.entries(plano.resumo.eletrica.conferencia.porRegra).filter(([, v]) => v.faltas > 0).map(([k]) => k),
      soltos: pontosElegiveis(model, levelId).length,
      circuitos: plano.resumo.eletrica.circuitos,
      splits: plano.resumo.climatizacao.equipamentos,
      marcasDoAr: plano.resumo.climatizacao.verificacao.porTipo,
      entrada: plano.resumo.eletrica.entrada ? `${plano.resumo.eletrica.entrada.categoria} ${plano.resumo.eletrica.entrada.ligacao} ${plano.resumo.eletrica.entrada.demandaKva} kVA` : null,
    },
    errosDeRede: plano.resumo.hidraulica.verificacao.erros + plano.resumo.climatizacao.verificacao.erros,
    pressaoInsuficiente: plano.resumo.hidraulica.pressaoInsuficiente,
    pressurizador: model.terminais.some((t) => t.tipoHidraulico === 'BOMBA'),
    forro: plano.resumo.forro ? { ...plano.resumo.forro, encontros: encontrosNoForro(model) } : null,
    furos: plano.resumo.furos ? { emViga: plano.resumo.furos.emViga, dispensa: plano.resumo.furos.dispensa, verificar: plano.resumo.furos.verificar, emBaldrame: plano.resumo.furos.emBaldrame, emLaje: plano.resumo.furos.emLaje } : null,
    rebaixo: rebaixoDoModelo(model),
    ar: arDoModelo(model),
  },
  sobrado: sobradoDoModelo(model),
};
document.getElementById('dump')!.textContent = [
  `graus ${graus} · ${pavimentos === 2 ? `sobrado (vendo o ${verSuperior ? 'superior' : 'térreo'})` : 'térrea'} · semente ${plano.semente}`,
  ...plano.etapas.map((e) => `${e.id} ${e.situacao}${e.nota ? ` — ${e.nota}` : ''}`),
  ...plano.pendencias.map((p) => `· ${p.grupo}: ${p.texto}`),
].join('\n');

/**
 * F14c ("laje rebaixada"): as peças de laje rebaixadas e quanto do esgoto de cima corre sob o piso FORA delas (no forro
 * de baixo) — a parte dentro de um shaft conta como dentro, e a ponta que entra nele pela quina também (o eixo a até
 * 5 cm da face: o raio do tubo e a folga).
 */
function pertoDoAnel(anel: readonly Point[], q: Point, mm: number): boolean {
  return anel.some((a, i) => {
    const b = anel[(i + 1) % anel.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L2 = dx * dx + dy * dy;
    const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / L2));
    return Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy)) <= mm;
  });
}

function rebaixoDoModelo(m: BlueprintModel): { lajes: number; esgotoForaMm: number } {
  const niveis = [...m.levels].sort((a, b) => a.elevationMm - b.elevationMm);
  let lajes = 0;
  let fora = 0;
  for (let i = 1; i < niveis.length; i++) {
    const baixo = niveis[i - 1];
    const reb = m.structures.filter((s) => s.kind === 'LAJE' && s.levelId === baixo.id && s.baseMm < baixo.defaultHeightMm - 1).map((s) => s.pontos as Point[]);
    lajes += reb.length;
    for (const t of m.trechos ?? []) {
      if (t.levelId !== niveis[i].id || t.disciplina !== 'ESGOTO' || Math.max(t.cotaAMm, t.cotaBMm) >= 0) continue;
      const L = Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y);
      const n = Math.max(1, Math.ceil(L / 50));
      for (let k = 0; k <= n; k++) {
        const q = { x: t.a.x + ((t.b.x - t.a.x) * k) / n, y: t.a.y + ((t.b.y - t.a.y) * k) / n } as Point;
        if (!reb.some((g) => pointInPolygon(g, q)) && !m.nucleos.some((x) => x.tipo === 'SHAFT' && (pointInPolygon(x.ring, q) || pertoDoAnel(x.ring, q, 50)))) fora += L / (n + 1);
      }
    }
  }
  return { lajes, esgotoForaMm: Math.round(fora) };
}

/**
 * F14d ("Evaporadora na parede externa"): o dreno do ar nos vãos, os encontros entre a linha e o dreno, e quanto do
 * dreno corre a até 30 cm da linha (lado a lado).
 */
function arDoModelo(m: BlueprintModel): { drenoEmVao: number; linhaComDreno: number; drenoJuntoDaLinhaPct: number } {
  const porId = new Map((m.trechos ?? []).map((t) => [t.id, t]));
  let drenoEmVao = 0;
  let linhaComDreno = 0;
  for (const c of conflitosDoModelo(m)) {
    const a = porId.get(c.trechoId);
    if (c.classe === 'ABERTURA' && a?.disciplina === 'DRENO_AC') drenoEmVao++;
    if (c.classe === 'REDE') {
      const par = [a?.disciplina, porId.get(c.outroId)?.disciplina].sort().join('×');
      if (par === 'DRENO_AC×FRIGORIGENA') linhaComDreno++;
    }
  }
  const linha = (m.trechos ?? []).filter((t) => t.disciplina === 'FRIGORIGENA');
  const dseg = (p: Point, a: Point, b: Point) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L2 = dx * dx + dy * dy;
    const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  };
  let junto = 0;
  let total = 0;
  for (const t of (m.trechos ?? []).filter((x) => x.disciplina === 'DRENO_AC')) {
    const n = Math.max(1, Math.ceil(Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y) / 100));
    for (let k = 0; k <= n; k++) {
      const q = { x: t.a.x + ((t.b.x - t.a.x) * k) / n, y: t.a.y + ((t.b.y - t.a.y) * k) / n } as Point;
      total++;
      if (linha.some((l) => l.levelId === t.levelId && dseg(q, l.a, l.b) <= 300)) junto++;
    }
  }
  return { drenoEmVao, linhaComDreno, drenoJuntoDaLinhaPct: total ? Math.round((junto / total) * 100) : 100 };
}

/** F14b: os encontros (REDE × REDE) entre as quatro redes que correm nas faixas do forro. */
function encontrosNoForro(m: BlueprintModel): number {
  const redes = new Set(['AGUA_FRIA', 'AGUA_QUENTE', 'ELETRICA', 'FRIGORIGENA']);
  const porId = new Map((m.trechos ?? []).map((t) => [t.id, t]));
  return conflitosDoModelo(m).filter((c) => c.classe === 'REDE' && redes.has(porId.get(c.trechoId)?.disciplina ?? '') && redes.has(porId.get(c.outroId)?.disciplina ?? '')).length;
}

function App() {
  // Enquadra depois da 1ª medida do container (a vista inicial não centraliza o desenho).
  const [navegacao, setNavegacao] = useState<{ seq: number; acao: 'ENQUADRAR' } | undefined>(undefined);
  useEffect(() => {
    const t = setTimeout(() => setNavegacao({ seq: 1, acao: 'ENQUADRAR' }), 150);
    return () => clearTimeout(t);
  }, []);
  return (
    <div id="tela">
      <div>
        <BlueprintCanvas
          model={model}
          tool="selecionar"
          levelId={nivelVisto}
          selectedIds={[]}
          onSelecionar={() => {}}
          onAddWall={() => null}
          onAddOpening={() => {}}
          onDelete={() => {}}
          larguraAberturaMm={900}
          espessuraMm={150}
          passoGradeMm={100}
          navegacao={navegacao}
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById('raiz')!).render(<App />);
