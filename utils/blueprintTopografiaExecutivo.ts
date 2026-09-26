/**
 * PROJETO EXECUTIVO com ART (fase 17 da topografia).
 *
 * ─── O QUE O SOFTWARE FAZ, E O QUE NÃO FAZ ──────────────────────────────────
 *
 * Nenhum programa emite projeto executivo: quem emite é o responsável
 * técnico, com registro no conselho (CREA/CAU) e a ART/RRT recolhida. O que
 * mora aqui é o FLUXO de emissão que um escritório faz na última folha:
 *
 * 1. o responsável se identifica (nome, conselho, registro, número e data da
 *    ART);
 * 2. entram os dados que o pré-dimensionamento não tinha — a SONDAGEM (furos,
 *    NSPT, tipo de solo) e o NÍVEL D'ÁGUA;
 * 3. as verificações são REFEITAS com os fatores de segurança de norma e com
 *    a água no solo (empuxo hidrostático + solo submerso), não com os de
 *    manual do pré-dimensionamento; a drenagem é reverificada para o tempo
 *    de retorno executivo;
 * 4. só com tudo atendido o projeto é EMITIDO: o registro fica imutável,
 *    amarrado ao hash da topografia e das premissas — mudou o terreno ou o
 *    platô, a emissão deixa de valer e a tela diz.
 *
 * Referências (os números que a tela e o memorial citam):
 * - NBR 8036 (sondagens): número mínimo de furos por área projetada.
 * - NBR 11682 (estabilidade de encostas): FS ≥ 1,5 para alto nível de
 *   segurança; lances e banquetas.
 * - NBR 16903 / DNIT (muros de arrimo): tombamento ≥ 2,0 (gravidade) e ≥ 1,5
 *   (flexão), deslizamento ≥ 1,5, capacidade de carga com FS 3.
 * - Drenagem urbana: tempo de retorno de 25 anos para a rede executiva
 *   (a microdrenagem preliminar usa 10).
 * - Correlação NSPT × tensão admissível (Teixeira, 1996): σadm ≈ 20·N kPa,
 *   5 ≤ N ≤ 20 — indicativa; o ensaio manda.
 *
 * Puro: números entram, verificações e texto saem.
 */

import { sha256, stableStringify } from './blueprintKernel';
import type { DimensionamentoDoMuro, DimensionamentoHidraulico, ParametrosEstruturais, ParametrosHidraulicos } from './blueprintTopografiaDimensionamento';
import { estabilidadeGlobal } from './blueprintTopografiaDimensionamento';
import type { InclinacaoDoPlato, ParametrosDeTerraplenagem } from './blueprintTopografiaAnalises';

// ── Tipos ─────────────────────────────────────────────────────────────────

export type Conselho = 'CREA' | 'CAU';

export interface ResponsavelTecnico {
  nome: string;
  /** "Engenheiro Civil", "Engenheira Geotécnica", "Arquiteta e Urbanista"… */
  titulo: string;
  conselho: Conselho;
  /** Número de registro no conselho (CREA-SP 5069…, CAU A12345-6). */
  registro: string;
  /** Número da ART (CREA) ou RRT (CAU). */
  artNumero: string;
  /** Data de recolhimento, ISO (AAAA-MM-DD). */
  artData: string;
}

export type TipoDeSolo = 'ARGILA' | 'SILTE' | 'AREIA' | 'ROCHA' | 'ATERRO';

export interface Sondagem {
  /** Furos executados no terreno. */
  furos: number;
  /** NSPT médio na cota de apoio das fundações/muros; `null` = não informado. */
  nsptMedio: number | null;
  tipoDeSolo: TipoDeSolo | null;
  /** Nível d'água: encontrado ou não; profundidade abaixo do terreno, em m. */
  nivelDagua: { informado: boolean; encontrado: boolean; profundidadeM: number | null };
  /** Empresa/laudo de referência. */
  laudo: string;
}

export const RESPONSAVEL_VAZIO: ResponsavelTecnico = { nome: '', titulo: 'Engenheiro(a) Civil', conselho: 'CREA', registro: '', artNumero: '', artData: '' };

export const SONDAGEM_VAZIA: Sondagem = {
  furos: 0,
  nsptMedio: null,
  tipoDeSolo: null,
  nivelDagua: { informado: false, encontrado: false, profundidadeM: null },
  laudo: '',
};

/** Os fatores de norma do projeto executivo (não os de manual do pré-dimensionamento). */
export const EXECUTIVO_PADRAO = {
  tempoDeRetornoAnos: 25,
  fsDeslizamentoMin: 1.5,
  fsTombamentoMin: { GRAVIDADE: 2.0, FLEXAO: 1.5 } as const,
  fsGlobalMin: 1.5,
  /** Tensão máxima na base ≤ σadm (que já embute FS 3 sobre a ruptura). */
  fsCapacidadeDeCarga: 3,
  /** Correlação σadm ≈ k · NSPT (kPa). */
  kNspt: 20,
  /** Lance máximo de talude sem banqueta, m (NBR 11682: prática de 8 m). */
  lanceMaximoM: 8,
  /** Talude de aterro 1:h com h ≥ 1,5 sem estudo específico. */
  taludeAterroHMin: 1.5,
  taludeCorteHMin: 1.0,
  pesoDaAguaKNm3: 10,
} as const;

export interface VerificacaoExecutiva {
  /** Grupo para a tela agrupar: RESPONSAVEL, SONDAGEM, MURO, DRENAGEM, TALUDE. */
  grupo: 'RESPONSAVEL' | 'SONDAGEM' | 'MURO' | 'DRENAGEM' | 'TALUDE';
  item: string;
  norma: string;
  exigido: string;
  obtido: string;
  atende: boolean;
}

export interface EntradaDoExecutivo {
  responsavel: ResponsavelTecnico;
  sondagem: Sondagem;
  /** Área do lote em m² — para o número mínimo de furos. */
  areaDoLoteM2: number;
  estrutura: ParametrosEstruturais;
  hidraulica: ParametrosHidraulicos;
  terraplenagem: ParametrosDeTerraplenagem;
  /** Do pré-dimensionamento (fatores de manual, sem água). */
  muros: DimensionamentoDoMuro[];
  /** Drenagem já redimensionada para o tempo de retorno executivo. */
  drenagemExecutiva: DimensionamentoHidraulico[];
  /** Altura máxima de talude do platô (corte ou aterro), m; `null` sem platô. */
  alturaMaxDeTaludeM: number | null;
}

export interface MuroExecutivo {
  aresta: number;
  tipo: 'GRAVIDADE' | 'FLEXAO';
  alturaM: number;
  /** Água acima da base do muro, m (0 = seca). */
  alturaDaAguaM: number;
  empuxoSecoKNm: number;
  empuxoComAguaKNm: number;
  fsTombamento: number;
  fsDeslizamento: number;
  fsGlobal: number;
  tensaoMaxKPa: number;
  atende: boolean;
}

export interface ResultadoDoExecutivo {
  verificacoes: VerificacaoExecutiva[];
  muros: MuroExecutivo[];
  /** Todas as verificações atendem — a emissão é permitida. */
  podeEmitir: boolean;
  /** As que não atendem, em texto, para a tela e o memorial. */
  pendencias: string[];
}

// ── Regras ────────────────────────────────────────────────────────────────

/**
 * NBR 8036: até 200 m², 2 furos; até 400 m², 3; de 400 a 1.200 m², 1 furo a
 * cada 200 m²; de 1.200 a 2.400 m², 1 a cada 400 m²; acima, a critério
 * (aqui: 1 a cada 600 m²). Nunca menos de 2.
 */
export function furosMinimosNbr8036(areaM2: number): number {
  const a = Math.max(0, areaM2);
  if (a <= 200) return 2;
  if (a <= 400) return 3;
  if (a <= 1200) return Math.max(3, Math.ceil(a / 200));
  if (a <= 2400) return Math.max(6, Math.ceil(a / 400));
  return Math.max(6, Math.ceil(a / 600));
}

/**
 * Empuxo ativo de Rankine com água a `hw` acima da base: acima do lençol o
 * solo natural (γ), abaixo o submerso (γ' = γ − γw) mais a pressão
 * hidrostática inteira (a água não tem Ka). Devolve a resultante e o momento
 * na base.
 */
export function empuxoRankineComAgua(
  H: number,
  gammaKNm3: number,
  phiGraus: number,
  qKNm2: number,
  hwM: number,
): { EaKNm: number; MoKNmPorM: number } {
  const phi = (Math.max(5, Math.min(45, phiGraus)) * Math.PI) / 180;
  const Ka = Math.tan(Math.PI / 4 - phi / 2) ** 2;
  const gamma = Math.max(10, gammaKNm3);
  const gw = EXECUTIVO_PADRAO.pesoDaAguaKNm3;
  const hw = Math.max(0, Math.min(H, hwM));
  const hs = H - hw; // altura seca, no topo
  // Sobrecarga: retângulo Ka·q·H com braço H/2.
  const Eq = Ka * Math.max(0, qKNm2) * H;
  const Mq = Eq * (H / 2);
  // Solo seco: triângulo até hs, apoiado sobre a parte submersa (braço hw + hs/3).
  const Es = 0.5 * Ka * gamma * hs * hs;
  const Ms = Es * (hw + hs / 3);
  // Abaixo do lençol: retângulo Ka·γ·hs·hw (braço hw/2) + triângulo Ka·γ'·hw² / 2 (braço hw/3) + água γw·hw² / 2 (braço hw/3).
  const Er = Ka * gamma * hs * hw;
  const Mr = Er * (hw / 2);
  const Esub = 0.5 * Ka * Math.max(1, gamma - gw) * hw * hw;
  const Msub = Esub * (hw / 3);
  const Ew = 0.5 * gw * hw * hw;
  const Mw = Ew * (hw / 3);
  return { EaKNm: Eq + Es + Er + Esub + Ew, MoKNmPorM: Mq + Ms + Mr + Msub + Mw };
}

const fmt = (v: number, casas = 2) => (Number.isFinite(v) ? v.toFixed(casas).replace('.', ',') : '∞');

function responsavelCompleto(r: ResponsavelTecnico): { ok: boolean; faltas: string[] } {
  const faltas: string[] = [];
  if (r.nome.trim().length < 3) faltas.push('nome');
  if (!/^\d{4,}/.test(r.registro.replace(/[^\dA-Za-z]/g, ''))) faltas.push('registro no conselho');
  if (r.artNumero.replace(/\D/g, '').length < 8) faltas.push(`número da ${r.conselho === 'CAU' ? 'RRT' : 'ART'} (≥ 8 dígitos)`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.artData)) faltas.push('data de recolhimento');
  return { ok: faltas.length === 0, faltas };
}

/** Refaz as verificações com os fatores de norma, a sondagem e a água. */
export function verificacoesExecutivas(e: EntradaDoExecutivo): ResultadoDoExecutivo {
  const v: VerificacaoExecutiva[] = [];
  const P = EXECUTIVO_PADRAO;

  // Responsável técnico.
  const resp = responsavelCompleto(e.responsavel);
  v.push({
    grupo: 'RESPONSAVEL',
    item: 'Responsável técnico com registro e ART/RRT',
    norma: 'Lei 6.496/77 (ART) · Res. CAU 91/2014 (RRT)',
    exigido: 'nome, registro, número e data',
    obtido: resp.ok ? `${e.responsavel.nome} — ${e.responsavel.conselho} ${e.responsavel.registro} · ${e.responsavel.conselho === 'CAU' ? 'RRT' : 'ART'} ${e.responsavel.artNumero}` : `falta: ${resp.faltas.join(', ')}`,
    atende: resp.ok,
  });

  // Sondagem.
  const furosMin = furosMinimosNbr8036(e.areaDoLoteM2);
  v.push({
    grupo: 'SONDAGEM',
    item: 'Número de furos de sondagem',
    norma: 'NBR 8036',
    exigido: `≥ ${furosMin} para ${fmt(e.areaDoLoteM2, 0)} m²`,
    obtido: `${e.sondagem.furos}`,
    atende: e.sondagem.furos >= furosMin,
  });
  v.push({
    grupo: 'SONDAGEM',
    item: 'Nível d’água informado',
    norma: 'NBR 8036 / NBR 6484',
    exigido: 'encontrado (profundidade) ou não encontrado',
    obtido: !e.sondagem.nivelDagua.informado
      ? 'não informado'
      : e.sondagem.nivelDagua.encontrado
        ? `a ${fmt(e.sondagem.nivelDagua.profundidadeM ?? 0)} m do terreno`
        : 'não encontrado',
    atende: e.sondagem.nivelDagua.informado && (!e.sondagem.nivelDagua.encontrado || (e.sondagem.nivelDagua.profundidadeM !== null && e.sondagem.nivelDagua.profundidadeM >= 0)),
  });
  const temMuro = e.muros.length > 0;
  if (temMuro) {
    const nspt = e.sondagem.nsptMedio;
    const sigmaPeloNspt = nspt !== null ? P.kNspt * Math.max(0, nspt) : null;
    v.push({
      grupo: 'SONDAGEM',
      item: 'Tensão admissível compatível com o NSPT',
      norma: 'correlação σadm ≈ 20·N (Teixeira, 1996)',
      exigido: nspt === null ? 'NSPT informado' : `σadm ≤ ${fmt(sigmaPeloNspt!, 0)} kPa (N = ${fmt(nspt, 0)})`,
      obtido: `${fmt(e.estrutura.tensaoAdmissivelKPa, 0)} kPa`,
      atende: nspt !== null && e.estrutura.tensaoAdmissivelKPa <= sigmaPeloNspt! + 1e-9,
    });
  }

  // Muros: refeitos com a água. O pré-dimensionamento não expõe W e xW, mas
  // a resistência não muda com a água: FS escala pela razão dos empuxos.
  const muros: MuroExecutivo[] = [];
  const profundidadeDaAgua = e.sondagem.nivelDagua.informado && e.sondagem.nivelDagua.encontrado ? (e.sondagem.nivelDagua.profundidadeM ?? Infinity) : Infinity;
  for (const m of e.muros) {
    const H = m.alturaM;
    // A base do muro fica a H abaixo do topo do terrapleno; água acima dela = H − profundidade.
    const hw = Math.max(0, Math.min(H, H - profundidadeDaAgua));
    const seco = empuxoRankineComAgua(H, e.estrutura.pesoDoSoloKNm3, e.estrutura.anguloDeAtritoGraus, e.estrutura.sobrecargaKNm2, 0);
    const comAgua = empuxoRankineComAgua(H, e.estrutura.pesoDoSoloKNm3, e.estrutura.anguloDeAtritoGraus, e.estrutura.sobrecargaKNm2, hw);
    const razaoE = seco.EaKNm > 0 ? seco.EaKNm / comAgua.EaKNm : 1;
    const razaoM = seco.MoKNmPorM > 0 ? seco.MoKNmPorM / comAgua.MoKNmPorM : 1;
    const fsD = m.fsDeslizamento * razaoE;
    const fsT = m.fsTombamento * razaoM;
    // Global com água: solo submerso em toda a massa (conservador) quando a água chega à base.
    const gamma = Math.max(10, e.estrutura.pesoDoSoloKNm3);
    const gamaMuro = m.tipo === 'GRAVIDADE' ? Math.max(15, e.estrutura.pesoDoCiclopicoKNm3) : Math.max(15, e.estrutura.pesoDoConcretoKNm3);
    const phi = (Math.max(5, Math.min(45, e.estrutura.anguloDeAtritoGraus)) * Math.PI) / 180;
    const fsGlobal =
      hw > 0
        ? estabilidadeGlobal(H, m.baseM, e.estrutura.embutimentoM, Math.max(1, gamma - P.pesoDaAguaKNm3), gamaMuro, phi, Math.max(0, e.estrutura.coesaoKPa), e.estrutura.sobrecargaKNm2)
        : m.fsGlobal;
    const fsTmin = P.fsTombamentoMin[m.tipo];
    const okT = fsT >= fsTmin;
    const okD = fsD >= P.fsDeslizamentoMin;
    const okG = !Number.isFinite(fsGlobal) || fsGlobal >= P.fsGlobalMin;
    const okS = m.tensaoMaxKPa <= Math.max(50, e.estrutura.tensaoAdmissivelKPa);
    muros.push({
      aresta: m.aresta,
      tipo: m.tipo,
      alturaM: H,
      alturaDaAguaM: hw,
      empuxoSecoKNm: seco.EaKNm,
      empuxoComAguaKNm: comAgua.EaKNm,
      fsTombamento: fsT,
      fsDeslizamento: fsD,
      fsGlobal,
      tensaoMaxKPa: m.tensaoMaxKPa,
      atende: okT && okD && okG && okS,
    });
    const rot = `Muro ${m.aresta + 1} (${m.tipo === 'GRAVIDADE' ? 'gravidade' : 'flexão'}, H ${fmt(H)} m${hw > 0 ? `, água a ${fmt(hw)} m da base` : ''})`;
    v.push({ grupo: 'MURO', item: `${rot}: tombamento`, norma: 'NBR 16903', exigido: `FS ≥ ${fmt(fsTmin, 1)}`, obtido: fmt(fsT), atende: okT });
    v.push({ grupo: 'MURO', item: `${rot}: deslizamento`, norma: 'NBR 16903', exigido: `FS ≥ ${fmt(P.fsDeslizamentoMin, 1)}`, obtido: fmt(fsD), atende: okD });
    v.push({ grupo: 'MURO', item: `${rot}: estabilidade global${hw > 0 ? ' (solo submerso)' : ''}`, norma: 'NBR 11682', exigido: `FS ≥ ${fmt(P.fsGlobalMin, 1)}`, obtido: fmt(fsGlobal), atende: okG });
    v.push({ grupo: 'MURO', item: `${rot}: tensão na base`, norma: `NBR 6122 (σadm com FS ${P.fsCapacidadeDeCarga})`, exigido: `≤ ${fmt(e.estrutura.tensaoAdmissivelKPa, 0)} kPa`, obtido: `${fmt(m.tensaoMaxKPa, 0)} kPa`, atende: okS });
  }

  // Drenagem para o tempo de retorno executivo.
  for (const d of e.drenagemExecutiva) {
    v.push({
      grupo: 'DRENAGEM',
      item: `Linha ${d.id.slice(0, 8)}: seção para T = ${P.tempoDeRetornoAnos} anos`,
      norma: 'Método Racional + Manning',
      exigido: `Q ${fmt(d.vazaoM3s * 1000, 0)} L/s levada, v entre 0,6 e 5 m/s`,
      obtido: d.secao ? `${d.secao.rotulo} · ${fmt(d.ocupacao * 100, 0)} % · ${fmt(d.velocidadeMs)} m/s` : 'sem seção no catálogo',
      atende: d.atende,
    });
  }

  // Taludes do platô.
  if (e.alturaMaxDeTaludeM !== null && e.alturaMaxDeTaludeM > 0.05) {
    const lance = e.terraplenagem.alturaDoLanceM ?? 6;
    v.push({ grupo: 'TALUDE', item: 'Lance máximo entre banquetas', norma: 'NBR 11682', exigido: `≤ ${fmt(P.lanceMaximoM, 0)} m`, obtido: `${fmt(lance, 1)} m`, atende: lance <= P.lanceMaximoM });
    v.push({ grupo: 'TALUDE', item: 'Talude de aterro 1:h', norma: 'NBR 11682', exigido: `h ≥ ${fmt(P.taludeAterroHMin, 1)}`, obtido: `h = ${fmt(e.terraplenagem.taludeAterroH, 2)}`, atende: e.terraplenagem.taludeAterroH >= P.taludeAterroHMin });
    v.push({ grupo: 'TALUDE', item: 'Talude de corte 1:h', norma: 'NBR 11682', exigido: `h ≥ ${fmt(P.taludeCorteHMin, 1)}`, obtido: `h = ${fmt(e.terraplenagem.taludeCorteH, 2)}`, atende: e.terraplenagem.taludeCorteH >= P.taludeCorteHMin });
  }

  const pendencias = v.filter((x) => !x.atende).map((x) => `${x.item}: exigido ${x.exigido}, obtido ${x.obtido}`);
  return { verificacoes: v, muros, podeEmitir: pendencias.length === 0, pendencias };
}

// ── Emissão ───────────────────────────────────────────────────────────────

/** O que a emissão fica amarrada: mudou qualquer um destes, a emissão não vale mais. */
export function hashDaBaseExecutiva(base: {
  topografiaHash: string;
  terraplenagem: ParametrosDeTerraplenagem;
  estrutura: ParametrosEstruturais;
  hidraulica: ParametrosHidraulicos;
  cotaPlatoM: number | null;
  basePlato: string;
  sondagem: Sondagem;
  /** C1: só entra no hash quando existe — as emissões anteriores (platô horizontal) continuam valendo. */
  inclinacao?: InclinacaoDoPlato | null;
}): string {
  const { inclinacao, ...resto } = base;
  return sha256(stableStringify(inclinacao ? { ...resto, inclinacao } : resto));
}

export interface EmissaoExecutiva {
  artNumero: string;
  responsavel: string;
  conselho: Conselho;
  registro: string;
  emitidoEm: string;
}

/** O aviso que substitui o "pré-dimensionamento / não substitui" nas exportações de uma versão emitida. */
export function avisoExecutivo(em: EmissaoExecutiva): string {
  const data = em.emitidoEm.slice(0, 10).split('-').reverse().join('/');
  return `Projeto executivo — ${em.conselho === 'CAU' ? 'RRT' : 'ART'} nº ${em.artNumero} · responsável técnico ${em.responsavel} (${em.conselho} ${em.registro}) · emitido em ${data}.`;
}

/** O memorial de cálculo, em linhas (título, seções, itens) — quem monta o PDF só quebra e pagina. */
export function memorialExecutivo(
  e: EntradaDoExecutivo,
  r: ResultadoDoExecutivo,
  ctx: { nomeDoEstudo: string; topografiaVersao: number; topografiaHash: string; fonte: string; emitidoEm: string; hashDaBase: string },
): string[] {
  const L: string[] = [];
  const data = ctx.emitidoEm.slice(0, 10).split('-').reverse().join('/');
  L.push(`# Memorial de cálculo — projeto executivo de terraplenagem, drenagem e contenção`);
  L.push(`${ctx.nomeDoEstudo} · emitido em ${data}`);
  L.push('');
  L.push('## 1. Responsável técnico');
  L.push(`${e.responsavel.nome}, ${e.responsavel.titulo} — ${e.responsavel.conselho} ${e.responsavel.registro}`);
  L.push(`${e.responsavel.conselho === 'CAU' ? 'RRT' : 'ART'} nº ${e.responsavel.artNumero}, recolhida em ${e.responsavel.artData.split('-').reverse().join('/')}`);
  L.push('');
  L.push('## 2. Base do projeto');
  L.push(`Topografia: versão v${ctx.topografiaVersao}, fonte ${ctx.fonte}, hash ${ctx.topografiaHash.slice(0, 16)}.`);
  L.push(`Platô: base ${e.terraplenagem ? '' : ''}talude de corte 1:${fmt(e.terraplenagem.taludeCorteH)}, aterro 1:${fmt(e.terraplenagem.taludeAterroH)}, lance ${fmt(e.terraplenagem.alturaDoLanceM ?? 6, 1)} m, banqueta ${fmt(e.terraplenagem.larguraDaBanquetaM ?? 2, 1)} m.`);
  L.push(`Hash da base (topografia + premissas + sondagem): ${ctx.hashDaBase.slice(0, 16)}. Alterada a base, este memorial deixa de valer.`);
  L.push('');
  L.push('## 3. Sondagem e água');
  L.push(`Furos: ${e.sondagem.furos} (mínimo NBR 8036 para ${fmt(e.areaDoLoteM2, 0)} m²: ${furosMinimosNbr8036(e.areaDoLoteM2)}). NSPT médio: ${e.sondagem.nsptMedio === null ? 'não informado' : fmt(e.sondagem.nsptMedio, 0)}. Solo: ${e.sondagem.tipoDeSolo ?? 'não informado'}.`);
  L.push(
    `Nível d’água: ${!e.sondagem.nivelDagua.informado ? 'não informado' : e.sondagem.nivelDagua.encontrado ? `a ${fmt(e.sondagem.nivelDagua.profundidadeM ?? 0)} m do terreno` : 'não encontrado'}.${e.sondagem.laudo ? ` Laudo: ${e.sondagem.laudo}.` : ''}`,
  );
  L.push('');
  L.push('## 4. Hipóteses');
  L.push(`Solo: γ = ${fmt(e.estrutura.pesoDoSoloKNm3, 1)} kN/m³, φ = ${fmt(e.estrutura.anguloDeAtritoGraus, 0)}°, c = ${fmt(e.estrutura.coesaoKPa, 0)} kPa, σadm = ${fmt(e.estrutura.tensaoAdmissivelKPa, 0)} kPa; sobrecarga ${fmt(e.estrutura.sobrecargaKNm2, 0)} kN/m²; embutimento ${fmt(e.estrutura.embutimentoM)} m.`);
  L.push(`Chuva: T = ${EXECUTIVO_PADRAO.tempoDeRetornoAnos} anos, IDF i = ${fmt(e.hidraulica.idf.k, 1)}·T^${fmt(e.hidraulica.idf.a, 3)}/(t + ${fmt(e.hidraulica.idf.b, 0)})^${fmt(e.hidraulica.idf.c, 3)}, C = ${fmt(e.hidraulica.coeficienteDeEscoamento)}, Manning n = ${fmt(e.hidraulica.manningN, 3)}, lâmina ≤ ${fmt(e.hidraulica.laminaMax * 100, 0)} %.`);
  L.push('');
  if (r.muros.length > 0) {
    L.push('## 5. Muros de arrimo (Rankine com água; NBR 16903 / NBR 11682 / NBR 6122)');
    for (const m of r.muros) {
      L.push(
        `Muro ${m.aresta + 1} — ${m.tipo === 'GRAVIDADE' ? 'gravidade' : 'flexão'}, H = ${fmt(m.alturaM)} m, água a ${fmt(m.alturaDaAguaM)} m da base. Empuxo seco ${fmt(m.empuxoSecoKNm, 1)} kN/m, com água ${fmt(m.empuxoComAguaKNm, 1)} kN/m. FS tombamento ${fmt(m.fsTombamento)}, deslizamento ${fmt(m.fsDeslizamento)}, global ${fmt(m.fsGlobal)}; tensão na base ${fmt(m.tensaoMaxKPa, 0)} kPa. ${m.atende ? 'ATENDE.' : 'NÃO ATENDE.'}`,
      );
    }
    L.push('');
  }
  if (e.drenagemExecutiva.length > 0) {
    L.push(`## 6. Drenagem (Método Racional, T = ${EXECUTIVO_PADRAO.tempoDeRetornoAnos} anos; Manning)`);
    for (const d of e.drenagemExecutiva) {
      L.push(
        `Linha ${d.id.slice(0, 8)}: A = ${fmt(d.areaContribuinteM2, 0)} m², tc = ${fmt(d.tempoDeConcentracaoMin, 1)} min, i = ${fmt(d.intensidadeMmH, 0)} mm/h, Q = ${fmt(d.vazaoM3s * 1000, 1)} L/s, I = ${fmt(d.declividadeP)} %, seção ${d.secao?.rotulo ?? '—'} (${fmt(d.ocupacao * 100, 0)} %, ${fmt(d.velocidadeMs)} m/s). ${d.atende ? 'ATENDE.' : 'NÃO ATENDE.'}`,
      );
    }
    L.push('');
  }
  L.push('## 7. Verificações');
  for (const x of r.verificacoes) L.push(`${x.atende ? '[✓]' : '[✗]'} ${x.item} — ${x.norma} — exigido ${x.exigido}; obtido ${x.obtido}.`);
  L.push('');
  L.push('## 8. Declaração');
  L.push(
    `As verificações acima foram refeitas com os fatores de segurança de norma e com o nível d’água informado, sobre a topografia v${ctx.topografiaVersao} e as premissas de platô, drenagem e contenção registradas no estudo. A responsabilidade técnica pelo projeto é do profissional identificado no item 1, nos termos da ${e.responsavel.conselho === 'CAU' ? 'RRT' : 'ART'} citada. O programa organiza o cálculo e o registro; não substitui o profissional.`,
  );
  return L;
}
