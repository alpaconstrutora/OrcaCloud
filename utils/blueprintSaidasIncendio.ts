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
 * NORMA: desde a D1.2 (01/10/2026), a IT 08 do CBMMG (`blueprintIncendioSaidasMG.ts`) —
 * população e capacidade por DIVISÃO (Tabela 4, área sem sanitários/escadas/corredores — nota E),
 * mínimo de UP (5.4.2.1), luz das portas (5.5.4.3), tipo de escada e número de saídas (Tabela 6).
 */
import { pointInPolygon, type BlueprintModel, type Escada, type ObjectId, type ProtecaoDaEscada, type Space, type Wall } from './blueprintKernel';
import { usoDoNome } from './blueprintPrograma';
import { construirGrafoEspacial, ehCorredor } from './blueprintGrafoEspacial';
import {
  FONTE_IT08_MG,
  UNIDADE_DE_PASSAGEM_MM,
  linhaDaTabela4,
  luzDaPortaMm,
  minimoDeUnidades,
  numeroDispensavelPelaNotaF,
  saidasDaTabela6,
  type CaracteristicaConstrutiva,
} from './blueprintIncendioSaidasMG';

export const FONTE_SAIDAS = `${FONTE_IT08_MG}, Tabelas 4 e 6`;
export { UNIDADE_DE_PASSAGEM_MM };

// ─── Premissas ───────────────────────────────────────────────────────────────

export interface HipotesesDeSaidas {
  /** Pessoas por dormitório — IT 08, Tabela 4: 2 (grupo A e H-2). */
  pessoasPorDormitorio: number;
  /** Declarado vence a tabela da divisão. `null` = da tabela. */
  areaPorPessoaM2: number | null;
  /** E6.3: o percurso máximo até a saída, m — declarado vence a tabela (`null`). */
  percursoMaximoM: number | null;
  /** D1.2: características construtivas (IT 08, Tabela 3) — `null` = não declarada (a Tabela 5 usa X, o pior). */
  construtiva: CaracteristicaConstrutiva | null;
  /** D1.2: rotas sem leiaute definido em planta (salão aberto) — Tabela 5 −30% (5.5.2.3). */
  semLeiaute: boolean;
  /** D1.2: a edificação tem controle de fumaça — Tabela 5 +50% (nota b). */
  controleDeFumaca: boolean;
}
export const HIPOTESES_SAIDAS_PADRAO: HipotesesDeSaidas = { pessoasPorDormitorio: 2, areaPorPessoaM2: null, percursoMaximoM: null, construtiva: null, semLeiaute: false, controleDeFumaca: false };

export function hipotesesDeSaidasDaColuna(raw: unknown): HipotesesDeSaidas {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pos = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : null);
  return {
    pessoasPorDormitorio: pos(r.pessoasPorDormitorio) ?? HIPOTESES_SAIDAS_PADRAO.pessoasPorDormitorio,
    areaPorPessoaM2: pos(r.areaPorPessoaM2),
    percursoMaximoM: pos(r.percursoMaximoM),
    construtiva: r.construtiva === 'X' || r.construtiva === 'Y' || r.construtiva === 'Z' ? r.construtiva : null,
    semLeiaute: r.semLeiaute === true,
    controleDeFumaca: r.controleDeFumaca === true,
  };
}

// ─── Unidades de passagem ────────────────────────────────────────────────────

export type TipoDeSaida = 'acesso' | 'escada' | 'porta';

/** Sem a capacidade na Tabela 4 ("+": M-5, M-8): a mais restritiva da tabela, até a norma específica. */
const CAPACIDADE_MAIS_RESTRITIVA = { acesso: 30, escada: 22, porta: 30 };

/**
 * IT 08: N = ⌈P ÷ C⌉ (5.4.1.2), C da Tabela 4 pela DIVISÃO; mínimo de UP em acesso e escada pela
 * 5.4.2.1 (2, ou 3 na H-2/H-3); a largura é N × 0,55 m — na PORTA, a luz da 5.5.4.3 (0,80 m p/ 1 UP).
 */
export function larguraExigida(pessoas: number, divisao: string | null, tipo: TipoDeSaida): { unidades: number; larguraMm: number } {
  const c = (linhaDaTabela4(divisao)?.capacidade ?? CAPACIDADE_MAIS_RESTRITIVA)[tipo];
  const minimo = tipo === 'porta' ? 1 : minimoDeUnidades(divisao);
  const unidades = Math.max(minimo, Math.ceil(pessoas / c - 1e-9));
  return { unidades, larguraMm: tipo === 'porta' ? luzDaPortaMm(unidades) : unidades * UNIDADE_DE_PASSAGEM_MM };
}

/** Nota E da Tabela 4: a "área" é a do pavimento sem sanitários, escadas, rampas e corredores. */
const FORA_DA_AREA = /sanit|banh|lavabo|wc|escada|rampa|corredor|circula|hall|antec/i;
function entraNaArea(s: Space): boolean {
  const u = usoDoNome(s.name);
  if (u === 'BANHEIRO' || u === 'LAVABO' || u === 'CIRCULACAO') return false;
  if (FORA_DA_AREA.test(s.name ?? '')) return false;
  return !(u === null && ehCorredor(s));
}

// ─── A análise ───────────────────────────────────────────────────────────────

export interface PopulacaoDoPavimento {
  levelId: ObjectId;
  nome: string;
  pessoas: number;
  /** Como foi contada. */
  origem: 'DORMITORIOS' | 'AREA' | 'VAGAS';
  /** Dormitórios contados, a área usada (m²) ou as vagas. */
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
  /** D1.2: o número de saídas da Tabela 6 da IT 08 — `atende: null` = dispensável pela nota F se o resto atende. */
  numeroDeSaidas: { exigidas: number; desenhadas: number; oQue: string; atende: boolean | null; motivo: string } | null;
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
 * A proteção exigida da escada: IT 08, Tabela 6, pela DIVISÃO e pela altura (a da classificação:
 * piso de descarga → último pavimento ocupado). `null` = a tabela não dá tipo ("-" não se aplica,
 * "+" norma específica, divisão fora dela) — com o motivo.
 */
export function protecaoExigida(divisao: string | null, alturaM: number): { protecao: ProtecaoDaEscada | null; numero: number | null; motivo: string } {
  const fmt = (x: number) => x.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  const t = saidasDaTabela6(divisao, alturaM);
  if (!t) return { protecao: null, numero: null, motivo: divisao ? `a divisão ${divisao} não consta na Tabela 6 da IT 08` : 'sem a divisão da edificação' };
  const base = `${divisao}, altura ${fmt(alturaM)} m (${t.faixa})`;
  if (t.celula === 'NAO_SE_APLICA') return { protecao: null, numero: null, motivo: `${base}: a Tabela 6 diz "não se aplica"` };
  if (t.celula === 'NORMA_ESPECIFICA') return { protecao: null, numero: null, motivo: `${base}: consultar norma específica (Tabela 6, "+")` };
  return { protecao: t.celula.tipo, numero: t.celula.numero, motivo: `${base}: ${t.celula.numero} saída(s), escada ${t.celula.tipo ?? '—'} (${FONTE_IT08_MG}, Tabela 6)` };
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
  // IT 08, Tabela 4: a regra de população da divisão (sem divisão: a do grupo A, por dormitório).
  const t4 = linhaDaTabela4(divisao);
  if (divisao && !t4) pendencias.push(`a divisão ${divisao} não consta na Tabela 4 da IT 08 — declare a área por pessoa`);
  if (t4 && !t4.capacidade) pendencias.push(`${divisao}: a capacidade da unidade de passagem é de norma específica (Tabela 4, "+") — usada a mais restritiva da tabela`);
  const regra = t4?.populacao ?? { tipo: 'DORMITORIO' as const, pessoasPorDormitorio: 2, m2PorPessoaNoAlojamento: null };
  const declarada = hip.areaPorPessoaM2;
  if (regra.tipo === 'ESPECIFICA' && declarada == null) pendencias.push(`${divisao}: a população é de norma específica (Tabela 4, "+") — declare a área por pessoa; usado 1 m²/pessoa até lá`);
  if (regra.tipo === 'LEITO' && declarada == null) pendencias.push(`${divisao}: 1,5 pessoa por leito + 1 por 7 m² de ambulatório — o desenho não conta leitos; usados 1,5 por quarto e 1 por 7 m² no resto`);

  const ehDormitorio = (s: Space) => {
    const u = usoDoNome(s.name);
    return u === 'DORMITORIO' || u === 'SUITE' || /quarto|enfermaria/i.test(s.name ?? '');
  };
  // Nota D: alojamento = dormitório coletivo com mais de 10 m².
  const ehAlojamento = (s: Space) => /alojamento/i.test(s.name ?? '') && s.areaMm2 > 10e6;
  const areaM2 = (xs: readonly Space[]) => xs.reduce((t, s) => t + s.areaMm2, 0) / 1e6;
  const populacao: PopulacaoDoPavimento[] = model.levels.map((l) => {
    const espacos = model.spaces.filter((s) => s.levelId === l.id);
    const util = espacos.filter(entraNaArea);
    const pop = (pessoas: number, origem: PopulacaoDoPavimento['origem'], base: number): PopulacaoDoPavimento => ({ levelId: l.id, nome: l.name, pessoas: Math.ceil(pessoas - 1e-9), origem, base });
    if (declarada != null || regra.tipo === 'ESPECIFICA') return pop(areaM2(util) / (declarada ?? 1), 'AREA', areaM2(util));
    switch (regra.tipo) {
      case 'DORMITORIO': {
        const alojamentos = regra.m2PorPessoaNoAlojamento ? espacos.filter(ehAlojamento) : [];
        const dorm = espacos.filter((s) => ehDormitorio(s) && !alojamentos.includes(s)).length;
        // Nota C: em apartamentos de até dois dormitórios a SALA conta como dormitório. O desenho não
        // separa os apartamentos: com até 2 dormitórios por sala no pavimento, as salas entram.
        const salas = espacos.filter((s) => usoDoNome(s.name) === 'SALA').length;
        const contadas = dorm + (salas > 0 && dorm <= 2 * salas ? salas : 0);
        const doAlojamento = regra.m2PorPessoaNoAlojamento ? areaM2(alojamentos) / regra.m2PorPessoaNoAlojamento : 0;
        return pop(contadas * hip.pessoasPorDormitorio + doAlojamento, 'DORMITORIOS', contadas);
      }
      case 'AREA': {
        const aulas = regra.soSalaDeAula ? util.filter((s) => /aula|classe|sala de estudo/i.test(s.name ?? '')) : util;
        // Sem "sala de aula" nomeada: toda a área (a favor da segurança).
        const base = regra.soSalaDeAula && aulas.length === 0 ? util : aulas;
        return pop(areaM2(base) / regra.m2PorPessoa, 'AREA', areaM2(base));
      }
      case 'VAGAS': {
        const vagas = (model.vagas ?? []).filter((v) => v.levelId === l.id).length;
        return pop(vagas / regra.vagasPorPessoa, 'VAGAS', vagas);
      }
      case 'LEITO': {
        const leitos = espacos.filter(ehDormitorio);
        return pop(leitos.length * regra.pessoasPorLeito + areaM2(util.filter((s) => !leitos.includes(s))) / regra.m2PorPessoaNoAmbulatorio, 'AREA', areaM2(util));
      }
    }
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
    const ex = larguraExigida(pior.pessoas, divisao, 'escada');
    itens.push({ tipo: 'ESCADA', alvoId: e.id, rotulo: e.rotulo || `Escada ${i + 1}`, pessoas: pior.pessoas, pavimentoCritico: pior.nome, unidades: ex.unidades, exigidaMm: ex.larguraMm, desenhadaMm: e.larguraMm, atende: e.larguraMm >= ex.larguraMm });
  });

  // Corredores: a população do pavimento deles.
  for (const s of model.spaces) {
    const u = usoDoNome(s.name);
    if (u !== 'CIRCULACAO' && !(u === null && ehCorredor(s))) continue;
    const p = pessoasDe.get(s.levelId);
    if (!p) continue;
    const ex = larguraExigida(p.pessoas, divisao, 'acesso');
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
      const ex = larguraExigida(pior.pessoas, divisao, 'porta');
      if (g0.saidas.length === 0) pendencias.push(`o pavimento de descarga (${descarga.name}) não tem porta para o exterior`);
      itens.push({ tipo: 'DESCARGA', alvoId: descarga.id, rotulo: `Saídas para o exterior (${descarga.name})`, pessoas: pior.pessoas, pavimentoCritico: pior.nome, unidades: ex.unidades, exigidaMm: ex.larguraMm, desenhadaMm: largura, atende: largura >= ex.larguraMm });
    }
  }
  if ((model.stairs ?? []).length === 0 && model.levels.length > 1) pendencias.push('o prédio tem mais de um pavimento e nenhuma escada desenhada');

  // E6.2: a proteção de cada escada, e as portas da caixa dela quando a caixa tem de ser fechada.
  const protecao: ProtecaoConferida[] = (model.stairs ?? []).map((e, i) => {
    const ex = alturaM != null ? protecaoExigida(divisao, alturaM) : null;
    const declarada = e.protecao ?? null;
    const atende = ex?.protecao && declarada ? NIVEL_DA_PROTECAO[declarada] >= NIVEL_DA_PROTECAO[ex.protecao] : null;
    let portasSemCortaFogo: ObjectId[] = [];
    let semCaixa = false;
    if (ex?.protecao && ex.protecao !== 'NE') {
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
      motivo: ex ? ex.motivo : 'sem a altura da edificação',
      declarada,
      atende,
      portasSemCortaFogo,
      semCaixa,
    };
  });
  // D1.2: o NÚMERO de saídas da Tabela 6 — escadas (com mais de um pavimento) ou portas para fora.
  let numeroDeSaidas: AnaliseDeSaidas['numeroDeSaidas'] = null;
  if (alturaM != null) {
    const ex = protecaoExigida(divisao, alturaM);
    if (ex.numero != null) {
      const comEscada = model.levels.length > 1;
      const desenhadas = comEscada ? (model.stairs ?? []).length : descarga ? construirGrafoEspacial(model, descarga.id).saidas.length : 0;
      const dispensavel = numeroDispensavelPelaNotaF(divisao, alturaM);
      numeroDeSaidas = {
        exigidas: ex.numero,
        desenhadas,
        oQue: comEscada ? 'escadas' : 'saídas para o exterior',
        atende: desenhadas >= ex.numero ? true : dispensavel ? null : false,
        motivo:
          desenhadas >= ex.numero || !dispensavel
            ? ex.motivo
            : `${ex.motivo} — a nota F dispensa o número (até 36 m, fora de F-6/H-2/H-3) se a distância (Tabela 5) e as UP (Tabela 4) atendem`,
      };
    }
  }
  return { grupo, populacao, itens, protecao, numeroDeSaidas, pendencias, fonte: FONTE_SAIDAS };
}
