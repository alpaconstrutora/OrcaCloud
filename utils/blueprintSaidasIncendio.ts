/**
 * SAÍDAS DE EMERGÊNCIA — população e largura (01/10/2026, E6.1 do roadmap de
 * incêndio; vai além do AltoQi).
 *
 * Por pavimento: a POPULAÇÃO (residencial = pessoas por dormitório; demais =
 * área ÷ m² por pessoa da divisão), as UNIDADES DE PASSAGEM (N = ⌈P ÷ C⌉, com C
 * a capacidade da unidade por divisão e por tipo — acesso, escada, porta) e a
 * LARGURA exigida (N × 0,55 m, mínimo de 2 unidades nos acessos e escadas).
 * Contra o desenho:
 *  - cada ESCADA, pela população do pavimento mais populoso que desce por ela
 *    (a largura não soma andares — dimensiona o pior);
 *  - cada CORREDOR (circulação), pela população do pavimento dele;
 *  - as SAÍDAS para o exterior do pavimento de DESCARGA, pela maior população
 *    entre ele e os de cima (todos saem por ali).
 * Tudo derivado; as premissas são do estudo.
 *
 * ⚠️ NORMA (CONFERIR NA IT de saídas de emergência do CBMMG, que segue a NBR
 * 9077): as tabelas de população e de capacidade da unidade de passagem abaixo
 * foram transcritas de memória.
 */
import { pointInPolygon, type BlueprintModel, type Escada, type ObjectId, type ProtecaoDaEscada, type Space, type Wall } from './blueprintKernel';
import { usoDoNome } from './blueprintPrograma';
import { construirGrafoEspacial, ehCorredor } from './blueprintGrafoEspacial';

export const FONTE_SAIDAS = 'IT de saídas de emergência do CBMMG / NBR 9077 — CONFERIR NA IT (transcrito de memória)';
/** A unidade de passagem, mm. */
export const UNIDADE_DE_PASSAGEM_MM = 550;
/** Mínimo de unidades nos acessos e nas escadas (1,10 m). */
export const MINIMO_DE_UNIDADES = 2;

/** População por grupo: m² por pessoa (`null` = por dormitório). CONFERIR NA IT. */
const M2_POR_PESSOA: Record<string, number | null> = { A: null, B: 15, C: 5, D: 7, E: 1.5, F: 1, G: 40, H: 7, I: 10, J: 30, L: 30, M: 30 };
/** Capacidade da unidade de passagem (pessoas) por grupo: acesso/descarga, escada/rampa, porta. CONFERIR NA IT. */
const CAPACIDADE: Record<string, { acesso: number; escada: number; porta: number }> = {
  A: { acesso: 60, escada: 45, porta: 100 },
  B: { acesso: 60, escada: 45, porta: 100 },
  C: { acesso: 100, escada: 75, porta: 100 },
  D: { acesso: 100, escada: 75, porta: 100 },
  E: { acesso: 100, escada: 75, porta: 100 },
  F: { acesso: 100, escada: 75, porta: 100 },
  G: { acesso: 100, escada: 60, porta: 100 },
  H: { acesso: 30, escada: 22, porta: 30 },
  I: { acesso: 100, escada: 60, porta: 100 },
  J: { acesso: 100, escada: 60, porta: 100 },
  L: { acesso: 100, escada: 60, porta: 100 },
  M: { acesso: 100, escada: 60, porta: 100 },
};

// ─── Premissas ───────────────────────────────────────────────────────────────

export interface HipotesesDeSaidas {
  /** Residencial (grupo A): pessoas por dormitório — CONFERIR NA IT. */
  pessoasPorDormitorio: number;
  /** Declarado vence a tabela da divisão. `null` = da tabela. */
  areaPorPessoaM2: number | null;
  /** E6.3: o percurso máximo até a saída, m — declarado vence a tabela (`null`). */
  percursoMaximoM: number | null;
}
export const HIPOTESES_SAIDAS_PADRAO: HipotesesDeSaidas = { pessoasPorDormitorio: 2, areaPorPessoaM2: null, percursoMaximoM: null };

export function hipotesesDeSaidasDaColuna(raw: unknown): HipotesesDeSaidas {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pos = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : null);
  return { pessoasPorDormitorio: pos(r.pessoasPorDormitorio) ?? HIPOTESES_SAIDAS_PADRAO.pessoasPorDormitorio, areaPorPessoaM2: pos(r.areaPorPessoaM2), percursoMaximoM: pos(r.percursoMaximoM) };
}

// ─── Unidades de passagem ────────────────────────────────────────────────────

export type TipoDeSaida = 'acesso' | 'escada' | 'porta';

/** N = ⌈P ÷ C⌉ (mínimo 2 em acesso e escada, 1 em porta) e a largura N × 0,55 m. */
export function larguraExigida(pessoas: number, grupo: string, tipo: TipoDeSaida): { unidades: number; larguraMm: number } {
  const c = (CAPACIDADE[grupo] ?? CAPACIDADE.A)[tipo];
  const minimo = tipo === 'porta' ? 1 : MINIMO_DE_UNIDADES;
  const unidades = Math.max(minimo, Math.ceil(pessoas / c - 1e-9));
  return { unidades, larguraMm: unidades * UNIDADE_DE_PASSAGEM_MM };
}

// ─── A análise ───────────────────────────────────────────────────────────────

export interface PopulacaoDoPavimento {
  levelId: ObjectId;
  nome: string;
  pessoas: number;
  /** Como foi contada. */
  origem: 'DORMITORIOS' | 'AREA';
  /** Dormitórios contados, ou a área usada (m²). */
  base: number;
}

export interface ItemDeSaida {
  tipo: 'ESCADA' | 'CORREDOR' | 'DESCARGA';
  /** O que conferir: a escada, o corredor (ambiente), ou o pavimento de descarga. */
  alvoId: ObjectId;
  rotulo: string;
  pessoas: number;
  /** De qual pavimento veio a população que dimensiona. */
  pavimentoCritico: string;
  unidades: number;
  exigidaMm: number;
  desenhadaMm: number;
  atende: boolean;
}

/** E6.2: a proteção da escada — exigida pela altura × declarada, e as portas da caixa sem corta-fogo. */
export interface ProtecaoConferida {
  escadaId: ObjectId;
  rotulo: string;
  exigida: ProtecaoDaEscada | null;
  motivo: string;
  declarada: ProtecaoDaEscada | null;
  /** `null` = não avaliada (sem altura, ou proteção não declarada). */
  atende: boolean | null;
  /** EP/PF/pressurizada exigida: as portas da caixa da escada que não são corta-fogo. */
  portasSemCortaFogo: ObjectId[];
  /** A escada não está dentro de um ambiente fechado (a caixa) em algum pavimento que serve. */
  semCaixa: boolean;
}

export interface AnaliseDeSaidas {
  grupo: string | null;
  populacao: PopulacaoDoPavimento[];
  itens: ItemDeSaida[];
  /** E6.2: uma linha por escada. */
  protecao: ProtecaoConferida[];
  /** O que faltou para analisar. */
  pendencias: string[];
  fonte: string;
}

/**
 * A largura LIVRE de um corredor: a menor dimensão do retângulo envolvente
 * menos meia espessura de cada parede dos dois lados compridos.
 *
 * ⚠️ O contorno do ambiente passa pelo EIXO das paredes: o corredor de 1,20 m
 * entre eixos com paredes de 15 cm tem 1,05 m livres. Medir eixo a eixo
 * aprovava o que a norma reprova — o teste do pavimento-tipo pegou. Vale para
 * corredor alinhado aos eixos x/y (o caso de projeto); parede inclinada no lado
 * comprido não desconta.
 */
function larguraDoCorredor(s: Space, paredes: readonly Wall[]): number {
  const xs = s.ring.map((p) => p.x);
  const ys = s.ring.map((p) => p.y);
  const lx = Math.max(...xs) - Math.min(...xs);
  const ly = Math.max(...ys) - Math.min(...ys);
  const aoLongoDeX = lx >= ly;
  const lado = (c: number) => {
    const w = paredes.find((p) => (aoLongoDeX ? p.a.y === c && p.b.y === c : p.a.x === c && p.b.x === c));
    return w ? w.thicknessMm / 2 : 0;
  };
  const [c0, c1] = aoLongoDeX ? [Math.min(...ys), Math.max(...ys)] : [Math.min(...xs), Math.max(...xs)];
  return Math.min(lx, ly) - lado(c0) - lado(c1);
}

/** Os pavimentos que a escada serve, de baixo para cima (partida → chegada). */
function pavimentosDaEscada(model: BlueprintModel, e: Escada): ObjectId[] {
  const niveis = [...model.levels].sort((a, b) => a.elevationMm - b.elevationMm || a.id.localeCompare(b.id));
  const i = niveis.findIndex((l) => l.id === e.levelId);
  if (i < 0) return [];
  const j = e.ateLevelId ? niveis.findIndex((l) => l.id === e.ateLevelId) : i + 1;
  return niveis.slice(i, Math.max(i, Math.min(j, niveis.length - 1)) + 1).map((l) => l.id);
}

// ─── Proteção da escada (E6.2) ───────────────────────────────────────────────

/** Até onde um ambiente sem "escada" no nome ainda é a caixa da escada, mm² (40 m²). */
const AREA_MAXIMA_DA_CAIXA_MM2 = 40e6;

/** Ordem de proteção: pressurizada vale como à prova de fumaça. */
export const NIVEL_DA_PROTECAO: Record<ProtecaoDaEscada, number> = { NE: 0, EP: 1, PF: 2, PRESSURIZADA: 2 };
export const ROTULO_DA_PROTECAO: Record<ProtecaoDaEscada, string> = { NE: 'Não enclausurada', EP: 'Enclausurada protegida', PF: 'À prova de fumaça', PRESSURIZADA: 'Pressurizada' };

/**
 * A proteção exigida pela altura da edificação (a da E0: piso de descarga →
 * último pavimento ocupado). Até 12 m não enclausurada, até 30 m enclausurada
 * protegida, acima à prova de fumaça; na saúde (H) os degraus caem para 6 e
 * 12 m. CONFERIR NA IT (transcrito de memória; a tabela real varia por divisão).
 */
export function protecaoExigida(grupo: string | null, alturaM: number): { protecao: ProtecaoDaEscada; motivo: string } {
  const [a, b] = grupo === 'H' ? [6, 12] : [12, 30];
  const fmt = (x: number) => x.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  if (alturaM <= a) return { protecao: 'NE', motivo: `altura ${fmt(alturaM)} m ≤ ${a} m` };
  if (alturaM <= b) return { protecao: 'EP', motivo: `altura ${fmt(alturaM)} m entre ${a} e ${b} m` };
  return { protecao: 'PF', motivo: `altura ${fmt(alturaM)} m > ${b} m` };
}

export function analisarSaidas(
  model: BlueprintModel,
  divisao: string | null,
  hip: HipotesesDeSaidas,
  pisoDeDescargaLevelId: string | null = null,
  /** E6.2: a altura da edificação para incêndio (a da classificação); `null` = proteção não avaliada. */
  alturaM: number | null = null,
): AnaliseDeSaidas {
  const grupo = divisao?.trim().charAt(0).toUpperCase() || null;
  const pendencias: string[] = [];
  if (!grupo) pendencias.push('sem a divisão da edificação — declare-a na classificação (a população e a capacidade dependem dela)');
  const g = grupo ?? 'A';
  const m2 = hip.areaPorPessoaM2 ?? M2_POR_PESSOA[g] ?? null;

  const populacao: PopulacaoDoPavimento[] = model.levels.map((l) => {
    const espacos = model.spaces.filter((s) => s.levelId === l.id);
    if (m2 == null) {
      const dorm = espacos.filter((s) => {
        const u = usoDoNome(s.name);
        return u === 'DORMITORIO' || u === 'SUITE';
      }).length;
      return { levelId: l.id, nome: l.name, pessoas: dorm * hip.pessoasPorDormitorio, origem: 'DORMITORIOS' as const, base: dorm };
    }
    const area = espacos.reduce((t, s) => t + s.areaMm2, 0) / 1e6;
    return { levelId: l.id, nome: l.name, pessoas: Math.ceil(area / m2 - 1e-9), origem: 'AREA' as const, base: area };
  });
  const pessoasDe = new Map(populacao.map((p) => [p.levelId, p]));
  const itens: ItemDeSaida[] = [];

  // Escadas: a população do pior pavimento que DESCE por ela (os de cima da partida).
  (model.stairs ?? []).forEach((e, i) => {
    const servidos = pavimentosDaEscada(model, e);
    const acima = servidos.slice(1);
    const candidatos = (acima.length ? acima : servidos).map((id) => pessoasDe.get(id)!).filter(Boolean);
    if (!candidatos.length) return;
    const pior = candidatos.reduce((a, b) => (b.pessoas > a.pessoas ? b : a));
    const ex = larguraExigida(pior.pessoas, g, 'escada');
    itens.push({ tipo: 'ESCADA', alvoId: e.id, rotulo: e.rotulo || `Escada ${i + 1}`, pessoas: pior.pessoas, pavimentoCritico: pior.nome, unidades: ex.unidades, exigidaMm: ex.larguraMm, desenhadaMm: e.larguraMm, atende: e.larguraMm >= ex.larguraMm });
  });

  // Corredores: a população do pavimento deles.
  for (const s of model.spaces) {
    const u = usoDoNome(s.name);
    if (u !== 'CIRCULACAO' && !(u === null && ehCorredor(s))) continue;
    const p = pessoasDe.get(s.levelId);
    if (!p) continue;
    const ex = larguraExigida(p.pessoas, g, 'acesso');
    const largura = larguraDoCorredor(s, model.walls.filter((w) => w.levelId === s.levelId));
    itens.push({ tipo: 'CORREDOR', alvoId: s.id, rotulo: `${s.name || 'Corredor'} (${p.nome})`, pessoas: p.pessoas, pavimentoCritico: p.nome, unidades: ex.unidades, exigidaMm: ex.larguraMm, desenhadaMm: Math.round(largura), atende: largura >= ex.larguraMm });
  }

  // Descarga: a soma das portas para o exterior, pela maior população entre ela e os de cima.
  // O de descarga: o declarado, senão o de cota mais próxima de zero (a regra de `pavimentoDeDescarga`,
  // repetida aqui porque a classificação importa as premissas DESTE arquivo — o import de volta faria ciclo).
  const ordenados = [...model.levels].sort((a, b) => a.elevationMm - b.elevationMm || a.id.localeCompare(b.id));
  const descarga =
    ordenados.find((l) => l.id === pisoDeDescargaLevelId) ??
    ordenados.reduce<(typeof ordenados)[number] | null>((melhor, l) => (!melhor || Math.abs(l.elevationMm) < Math.abs(melhor.elevationMm) ? l : melhor), null);
  if (descarga) {
    const g0 = construirGrafoEspacial(model, descarga.id);
    const largura = g0.saidas.reduce((t, a) => t + (a.larguraUtilMm ?? a.comprimentoMm), 0);
    const daqui = populacao.filter((p) => (model.levels.find((l) => l.id === p.levelId)?.elevationMm ?? 0) >= descarga.elevationMm);
    if (daqui.length) {
      const pior = daqui.reduce((a, b) => (b.pessoas > a.pessoas ? b : a));
      const ex = larguraExigida(pior.pessoas, g, 'porta');
      if (g0.saidas.length === 0) pendencias.push(`o pavimento de descarga (${descarga.name}) não tem porta para o exterior`);
      itens.push({ tipo: 'DESCARGA', alvoId: descarga.id, rotulo: `Saídas para o exterior (${descarga.name})`, pessoas: pior.pessoas, pavimentoCritico: pior.nome, unidades: ex.unidades, exigidaMm: ex.larguraMm, desenhadaMm: largura, atende: largura >= ex.larguraMm });
    }
  }
  if ((model.stairs ?? []).length === 0 && model.levels.length > 1) pendencias.push('o prédio tem mais de um pavimento e nenhuma escada desenhada');

  // E6.2: a proteção de cada escada, e as portas da caixa dela quando a caixa tem de ser fechada.
  const protecao: ProtecaoConferida[] = (model.stairs ?? []).map((e, i) => {
    const ex = alturaM != null ? protecaoExigida(grupo, alturaM) : null;
    const declarada = e.protecao ?? null;
    const atende = ex && declarada ? NIVEL_DA_PROTECAO[declarada] >= NIVEL_DA_PROTECAO[ex.protecao] : null;
    let portasSemCortaFogo: ObjectId[] = [];
    let semCaixa = false;
    if (ex && ex.protecao !== 'NE') {
      for (const levelId of pavimentosDaEscada(model, e)) {
        // A CAIXA é o ambiente fechado PRÓPRIO da escada: "escada"/"caixa" no nome, ou pequeno (até 40 m²).
        // ⚠️ Não basta conter a escada: solta num salão, o salão inteiro virava "a caixa" e a porta da
        // rua era cobrada como corta-fogo — o harness `saidas-incendio` pegou.
        const caixa = model.spaces.find((s) => s.levelId === levelId && pointInPolygon(s.ring, e.pontos[0]) && (/escada|caixa/i.test(s.name ?? '') || s.areaMm2 <= AREA_MAXIMA_DA_CAIXA_MM2));
        if (!caixa) {
          semCaixa = true;
          continue;
        }
        const g = construirGrafoEspacial(model, levelId);
        const daCaixa = g.arestas.filter((a) => a.openingId && (a.de === caixa.id || a.para === caixa.id));
        for (const a of daCaixa) {
          const o = model.openings.find((x) => x.id === a.openingId);
          if (o && !o.emergencia?.includes('CORTA_FOGO') && !portasSemCortaFogo.includes(o.id)) portasSemCortaFogo.push(o.id);
        }
      }
    }
    return {
      escadaId: e.id,
      rotulo: e.rotulo || `Escada ${i + 1}`,
      exigida: ex?.protecao ?? null,
      motivo: ex ? `${ex.motivo} — CONFERIR NA IT` : 'sem a altura da edificação',
      declarada,
      atende,
      portasSemCortaFogo,
      semCaixa,
    };
  });
  return { grupo, populacao, itens, protecao, pendencias, fonte: FONTE_SAIDAS };
}
