/**
 * SINALIZAÇÃO DE EMERGÊNCIA E KITS (01/10/2026, E7.2 do roadmap de incêndio).
 *
 *  - PLACA DE EQUIPAMENTO: extintor, hidrante, mangotinho e recalque pedem a
 *    placa deles (`Terminal.alvoId` aponta o equipamento). Equipamento sem
 *    placa e placa cujo equipamento sumiu (o kernel limpa o alvo) são
 *    conferidos.
 *  - PLACA DE ROTA: ao longo das rotas de fuga da E6.3, em cada MUDANÇA DE
 *    DIREÇÃO (a seta aponta o trecho seguinte — `rotacaoGraus`) e na SAÍDA
 *    (a placa "saída" sobre a porta da descarga).
 *  - KIT: o equipamento e a placa dele num lote só (`comPlacas`): os ids que o
 *    lote vai criar são PREVISTOS aplicando-o numa cópia, e a previsão é
 *    conferida — o molde de `conferirPlano`.
 *
 * ⚠️ NORMA (CONFERIR NA NBR 13434 e na IT de sinalização do CBMMG): os códigos
 * das placas e as alturas de instalação foram transcritos de memória.
 */
import { applyBatch, pointInPolygon, type BlueprintModel, type Command, type ObjectId, type Point, type Terminal } from './blueprintKernel';
import type { PercursoDeFuga } from './blueprintRotaDeFuga';

export const FONTE_SINALIZACAO = 'NBR 13434 e IT de sinalização do CBMMG — CONFERIR (transcrito de memória)';

export interface PlacaDoCatalogo {
  nome: string;
  categoria: 'EQUIPAMENTO' | 'ORIENTACAO';
}
/** CONFERIR NA NBR 13434-2. */
export const CATALOGO_DE_PLACAS: Record<string, PlacaDoCatalogo> = {
  E5: { nome: 'Extintor portátil', categoria: 'EQUIPAMENTO' },
  E7: { nome: 'Mangotinho', categoria: 'EQUIPAMENTO' },
  E8: { nome: 'Abrigo de mangueira e hidrante', categoria: 'EQUIPAMENTO' },
  E9: { nome: 'Hidrante de recalque', categoria: 'EQUIPAMENTO' },
  S3: { nome: 'Rota de saída (seta)', categoria: 'ORIENTACAO' },
  S12: { nome: 'Saída de emergência', categoria: 'ORIENTACAO' },
};

/** A placa de cada equipamento. */
export const PLACA_DO_EQUIPAMENTO: Partial<Record<NonNullable<Terminal['tipoHidraulico']>, string>> = {
  EXTINTOR: 'E5',
  HIDRANTE_SIMPLES: 'E8',
  HIDRANTE_DUPLO: 'E8',
  MANGOTINHO: 'E7',
  HIDRANTE_RECALQUE: 'E9',
};

/** Alturas de instalação, mm — CONFERIR NA IT. */
export const COTA_DA_PLACA_DE_EQUIPAMENTO_MM = 1800;
export const COTA_DA_PLACA_DE_SAIDA_MM = 2200;
/** Duas placas de rota a menos disto são a mesma. */
const RAIO_DA_MESMA_PLACA_MM = 1500;
/** Mudança de direção que pede placa, graus. */
const CURVA_MINIMA_GRAUS = 30;

const ehPlaca = (t: Terminal) => t.disciplina === 'INCENDIO' && t.tipoHidraulico === 'PLACA';

export interface PontoDeSinalizacao {
  levelId: ObjectId;
  at: Point;
  codigo: 'S3' | 'S12';
  /** A direção da seta (graus, anti-horário, 0 = +x). */
  rotacaoGraus: number;
  /** Já há placa de orientação aqui. */
  coberto: boolean;
}

export interface AnaliseDeSinalizacao {
  equipamentosSemPlaca: ObjectId[];
  /** Placas de equipamento sem alvo (o equipamento sumiu) — e as sem código. */
  placasOrfas: ObjectId[];
  placasSemCodigo: ObjectId[];
  pontosDaRota: PontoDeSinalizacao[];
  fonte: string;
}

const graus = (a: Point, b: Point) => ((Math.round((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI) % 360) + 360) % 360;
const d2 = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

/** Os pontos de sinalização de rota: as mudanças de direção e a saída de cada rota, sem repetir. */
export function pontosDeSinalizacaoDaRota(percurso: PercursoDeFuga, descargaLevelId: ObjectId | null): Omit<PontoDeSinalizacao, 'coberto'>[] {
  const pontos: Omit<PontoDeSinalizacao, 'coberto'>[] = [];
  const somar = (p: Omit<PontoDeSinalizacao, 'coberto'>) => {
    if (!pontos.some((q) => q.levelId === p.levelId && d2(q.at, p.at) < RAIO_DA_MESMA_PLACA_MM)) pontos.push(p);
  };
  for (const a of percurso.ambientes) {
    a.rota.forEach((r, ir) => {
      const ps = r.pontos;
      for (let i = 1; i < ps.length - 1; i++) {
        const antes = graus(ps[i - 1], ps[i]);
        const depois = graus(ps[i], ps[i + 1]);
        const giro = Math.abs((((depois - antes) % 360) + 540) % 360 - 180);
        if (d2(ps[i - 1], ps[i]) < 1 || d2(ps[i], ps[i + 1]) < 1 || giro < CURVA_MINIMA_GRAUS) continue;
        somar({ levelId: r.levelId, at: { x: Math.round(ps[i].x), y: Math.round(ps[i].y) }, codigo: 'S3', rotacaoGraus: depois });
      }
      // A saída: o fim da última rota, no pavimento de descarga.
      if (ir === a.rota.length - 1 && r.levelId === descargaLevelId && ps.length >= 2) {
        const fim = ps[ps.length - 1];
        somar({ levelId: r.levelId, at: { x: Math.round(fim.x), y: Math.round(fim.y) }, codigo: 'S12', rotacaoGraus: graus(ps[ps.length - 2], fim) });
      }
    });
  }
  return pontos;
}

export function analisarSinalizacao(model: BlueprintModel, percurso: PercursoDeFuga | null, descargaLevelId: ObjectId | null): AnaliseDeSinalizacao {
  const terminais = model.terminais ?? [];
  const placas = terminais.filter(ehPlaca);
  const sinalizados = new Set(placas.map((p) => p.alvoId).filter((x): x is ObjectId => !!x));
  const equipamentosSemPlaca = terminais.filter((t) => t.disciplina === 'INCENDIO' && t.tipoHidraulico && PLACA_DO_EQUIPAMENTO[t.tipoHidraulico] && !sinalizados.has(t.id)).map((t) => t.id);
  const placasOrfas = placas.filter((p) => p.codigoPlaca && CATALOGO_DE_PLACAS[p.codigoPlaca]?.categoria === 'EQUIPAMENTO' && !p.alvoId).map((p) => p.id);
  const placasSemCodigo = placas.filter((p) => !p.codigoPlaca).map((p) => p.id);
  const orientacao = placas.filter((p) => p.codigoPlaca && CATALOGO_DE_PLACAS[p.codigoPlaca]?.categoria === 'ORIENTACAO');
  const pontosDaRota = (percurso ? pontosDeSinalizacaoDaRota(percurso, descargaLevelId) : []).map((p) => ({
    ...p,
    coberto: orientacao.some((q) => q.levelId === p.levelId && d2(q.at, p.at) < RAIO_DA_MESMA_PLACA_MM),
  }));
  return { equipamentosSemPlaca, placasOrfas, placasSemCodigo, pontosDaRota, fonte: FONTE_SINALIZACAO };
}

/** Quanto a placa do equipamento fica ao lado dele, em planta, mm. */
const AFASTAMENTO_DA_PLACA_MM = 400;

/**
 * Onde a placa do equipamento se desenha: 40 cm ao lado dele, para dentro do
 * ambiente (a primeira direção que cai dentro, com 15 cm de folga das paredes).
 * ⚠️ No mesmo ponto, o retângulo da placa escondia o símbolo do equipamento e
 * os números se sobrepunham (EXT-1 sobre PL-2) — o harness `sinalizacao` pegou.
 */
function posicaoDaPlaca(model: BlueprintModel | null, t: Pick<Terminal, 'levelId' | 'at'>): Point {
  if (!model) return { ...t.at };
  const s = model.spaces.find((x) => x.levelId === t.levelId && pointInPolygon(x.ring, t.at));
  if (!s) return { ...t.at };
  for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const n = Math.hypot(dx, dy);
    const q = { x: Math.round(t.at.x + (dx / n) * AFASTAMENTO_DA_PLACA_MM), y: Math.round(t.at.y + (dy / n) * AFASTAMENTO_DA_PLACA_MM) };
    if (pointInPolygon(s.ring, q) && folgaDaBorda(s.ring, q) >= 150) return q;
  }
  return { ...t.at };
}

function folgaDaBorda(anel: Point[], p: Point): number {
  let d = Infinity;
  for (let i = 0; i < anel.length; i++) {
    const a = anel[i];
    const b = anel[(i + 1) % anel.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const c2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / c2));
    d = Math.min(d, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return d;
}

/** O comando da placa de um equipamento (o kit), ao lado dele. */
export function placaDoEquipamento(t: Pick<Terminal, 'id' | 'levelId' | 'at' | 'tipoHidraulico'>, model: BlueprintModel | null = null): Command | null {
  const codigo = t.tipoHidraulico ? PLACA_DO_EQUIPAMENTO[t.tipoHidraulico] : undefined;
  if (!codigo) return null;
  return { type: 'AddTerminal', levelId: t.levelId, disciplina: 'INCENDIO', tipo: 'PLACA', tipoHidraulico: 'PLACA', at: posicaoDaPlaca(model, t), cotaMm: COTA_DA_PLACA_DE_EQUIPAMENTO_MM, codigoPlaca: codigo, alvoId: t.id } as Command;
}

/** A proposta: a placa de cada equipamento sem placa e as placas de rota que faltam — um lote. */
export function proporSinalizacao(model: BlueprintModel, a: AnaliseDeSinalizacao): Command[] {
  const porId = new Map((model.terminais ?? []).map((t) => [t.id, t]));
  const equipamentos = a.equipamentosSemPlaca.map((id) => placaDoEquipamento(porId.get(id)!, model)).filter((c): c is Command => !!c);
  const rota = a.pontosDaRota
    .filter((p) => !p.coberto)
    .map(
      (p) =>
        ({
          type: 'AddTerminal',
          levelId: p.levelId,
          disciplina: 'INCENDIO',
          tipo: 'PLACA',
          tipoHidraulico: 'PLACA',
          at: { ...p.at },
          cotaMm: p.codigo === 'S12' ? COTA_DA_PLACA_DE_SAIDA_MM : COTA_DA_PLACA_DE_EQUIPAMENTO_MM,
          codigoPlaca: p.codigo,
          rotacaoGraus: p.rotacaoGraus,
        }) as Command,
    );
  return [...equipamentos, ...rota];
}

/**
 * O KIT: os comandos de equipamentos + a placa de cada um, num lote só. Os ids
 * que o lote cria são PREVISTOS aplicando-o numa cópia; a previsão é
 * conferida aplicando o lote inteiro (placa → equipamento certo). Se não
 * confere, devolve só os equipamentos (sem placa é melhor que placa errada).
 */
export function comPlacas(model: BlueprintModel, comandos: Command[]): Command[] {
  if (!comandos.length) return comandos;
  const r = applyBatch(model, comandos);
  const antes = new Set((model.terminais ?? []).map((t) => t.id));
  const criados = (r.model.terminais ?? []).filter((t) => !antes.has(t.id));
  const placas = criados.map((t) => placaDoEquipamento(t, r.model)).filter((c): c is Command => !!c);
  if (!placas.length) return comandos;
  const tudo = [...comandos, ...placas];
  try {
    const conferido = applyBatch(model, tudo).model;
    const ok = criados.every((e) => !PLACA_DO_EQUIPAMENTO[e.tipoHidraulico!] || (conferido.terminais ?? []).some((p) => p.alvoId === e.id && p.tipoHidraulico === 'PLACA'));
    return ok ? tudo : comandos;
  } catch {
    return comandos;
  }
}
