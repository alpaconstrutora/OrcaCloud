/**
 * CARGA TÉRMICA POR AMBIENTE (04/10/2026, E2 do roadmap de climatização —
 * `docs/planos/2026-10-04-climatizacao-benchmark-altoqi-e-roadmap.md`).
 *
 * DERIVAÇÃO PURA: lê o desenho (pela exposição da E1.3), as premissas do
 * estudo (E0: clima, conforto, por ambiente, e as hipóteses do motor) e a
 * biblioteca de materiais (λ), e devolve, por ambiente climatizado, cada
 * parcela em W, a sensível, a latente e a total (W e BTU/h). Nada é gravado;
 * mover uma parede muda o número.
 *
 * ─── O método, parcela a parcela (método simplificado de pico de verão) ─────
 *  - PAREDE EXTERNA / COBERTURA / LAJE EXPOSTA: U·A·ΔTeq, ΔTeq = (TBS − Tint) +
 *    acréscimo solar (temperatura sol-ar simplificada: um acréscimo em K, pesado
 *    pela orientação na parede). U das camadas com λ (NBR 15220) ou a hipótese.
 *  - PAREDE / LAJE para ambiente NÃO climatizado: U·A·ΔT·fração; para
 *    climatizado: zero. PISO sobre o solo: zero (hipótese declarada).
 *  - VIDRO: condução U·A·ΔT + insolação A·FS·Fsomb·I(orientação), com a
 *    irradiância de pico por orientação da `IRRADIANCIA_POR_ORIENTACAO`.
 *  - PESSOAS: n × (sensível, latente) por atividade. ILUMINAÇÃO e EQUIPAMENTOS:
 *    W × fator de uso. FONTE EXTRA: como declarada.
 *  - INFILTRAÇÃO: n trocas/h × volume; sensível 0,34·V·n·ΔT; latente pela
 *    diferença de umidade absoluta (psicrometria: TBS/TBU externos e
 *    setpoint/UR internos, pressão pela altitude).
 *
 * ─── O que é tabela de memória (CONFERIR NA NORMA) ──────────────────────────
 * `CALOR_POR_ATIVIDADE`, `IRRADIANCIA_POR_ORIENTACAO`, `PESO_SOLAR_DA_ORIENTACAO`
 * e os padrões de `HipotesesDoMotor`. Cada parcela que usou um deles sai com
 * `origem: 'HIPOTESE'`; a que usou só o declarado sai `'DECLARADA'`. A tela e o
 * memorial dizem CONFERIR enquanto houver hipótese.
 */
import type { BlueprintModel, ObjectId, CamadaParede } from './blueprintKernel';
import { acabamentosDoAmbiente, fatorDeSombreamento } from './blueprintKernel';
import { desempenhoTermico, type Material } from './blueprintMateriais';
import type { PontoCardeal } from './blueprintGrafoEspacial';
import { condicoesExternas, type CondicoesExternas, type HipotesesClimatizacao } from './blueprintClimatizacao';
import { premissasDoAmbiente, type Atividade, type PremissasDoAmbiente } from './blueprintClimatizacaoAmbientes';
import { exposicaoDoNivel, type ExposicaoDoAmbiente, type FaceVerticalDoAmbiente } from './blueprintExposicaoTermica';

export const W_PARA_BTUH = 3.412142;

/** Calor por pessoa, W (sensível, latente), por atividade. ⚠️ Memória — CONFERIR (NBR 16401-1 / ASHRAE). */
export const CALOR_POR_ATIVIDADE: Record<Atividade, { sensivelW: number; latenteW: number }> = {
  SENTADO_REPOUSO: { sensivelW: 65, latenteW: 35 },
  SENTADO_TRABALHO_LEVE: { sensivelW: 70, latenteW: 45 },
  EM_PE_LEVE: { sensivelW: 75, latenteW: 55 },
  MODERADA: { sensivelW: 80, latenteW: 80 },
  PESADA: { sensivelW: 170, latenteW: 255 },
};

/** Irradiância solar de pico de verão sobre o vidro, W/m², por orientação da fachada (hemisfério sul). ⚠️ Memória — CONFERIR (NBR 16655-3). */
export const IRRADIANCIA_POR_ORIENTACAO: Record<PontoCardeal, number> = { N: 150, NE: 300, L: 450, SE: 350, S: 120, SO: 350, O: 450, NO: 300 };

/** Peso do acréscimo solar da parede por orientação (1 = a mais exposta, oeste). ⚠️ Memória — CONFERIR. */
export const PESO_SOLAR_DA_ORIENTACAO: Record<PontoCardeal, number> = { N: 0.7, NE: 0.6, L: 0.6, SE: 0.5, S: 0.3, SO: 0.7, O: 1, NO: 0.9 };

export type OrigemDaParcela = 'DECLARADA' | 'HIPOTESE' | 'NAO_AVALIADA';

export interface Parcela {
  /** Sensível, W. */
  sensivelW: number;
  /** Latente, W. */
  latenteW: number;
  origem: OrigemDaParcela;
  /** Como saiu o número, para o memorial e o tooltip. */
  memoria: string;
}

export interface FaceCalculada {
  wallId: ObjectId;
  descricao: string;
  areaLiquidaM2: number;
  uWm2K: number | null;
  deltaTeqK: number;
  parcela: Parcela;
}

export interface VaoCalculado {
  openingId: ObjectId;
  descricao: string;
  areaM2: number;
  conducao: Parcela;
  insolacao: Parcela;
}

export interface CargaDoAmbiente {
  spaceId: ObjectId;
  levelId: ObjectId;
  labelUid: string | null;
  nome: string;
  climatizado: boolean;
  areaPisoM2: number;
  volumeM3: number;
  temperaturaInternaC: number;
  premissas: PremissasDoAmbiente;
  exposicao: ExposicaoDoAmbiente;
  paredes: FaceCalculada[];
  vaos: VaoCalculado[];
  teto: Parcela;
  piso: Parcela;
  pessoas: Parcela;
  iluminacao: Parcela;
  equipamentos: Parcela;
  fonteExtra: Parcela;
  infiltracao: Parcela;
  sensivelW: number;
  latenteW: number;
  totalW: number;
  totalBtuH: number;
  /** W por m² de piso — a conferência rápida do projetista. */
  wPorM2: number;
  /** Alguma parcela usou hipótese ou tabela de memória. */
  conferir: boolean;
  /** O que não foi avaliado, em frases. */
  pendencias: string[];
}

export interface CargaTermicaDoNivel {
  levelId: ObjectId;
  condicoes: CondicoesExternas;
  /** ΔT externo (TBS − setpoint do estudo), K; `null` sem TBS. */
  deltaTExternoK: number | null;
  ambientes: CargaDoAmbiente[];
  /** Soma dos climatizados. */
  totalSensivelW: number;
  totalLatenteW: number;
  totalW: number;
  totalBtuH: number;
  conferir: boolean;
}

export interface ContextoDaCarga {
  materiais?: readonly Material[];
  /** A cidade do contexto urbanístico, para `condicoesExternas`. */
  cidadeDoContexto?: string | null;
}

const r0 = (x: number) => Math.round(x);
const r2 = (x: number) => Math.round(x * 100) / 100;
const zero = (memoria: string, origem: OrigemDaParcela = 'DECLARADA'): Parcela => ({ sensivelW: 0, latenteW: 0, origem, memoria });

// ─── Psicrometria mínima (umidade absoluta a partir de TBS/TBU ou TBS/UR) ─────

/** Pressão de saturação do vapor, Pa (Magnus-Tetens). */
export function pressaoDeSaturacaoPa(tC: number): number {
  return 610.94 * Math.exp((17.625 * tC) / (tC + 243.04));
}
/** Pressão atmosférica pela altitude, Pa (atmosfera padrão). */
export function pressaoAtmosfericaPa(altitudeM: number): number {
  return 101325 * Math.pow(1 - 2.25577e-5 * Math.max(0, altitudeM), 5.2559);
}
/** Umidade absoluta, kg de vapor por kg de ar seco, a partir de TBS e TBU. */
export function umidadeAbsolutaPorTbu(tbsC: number, tbuC: number, pAtmPa: number): number {
  const pv = Math.max(0, pressaoDeSaturacaoPa(tbuC) - pAtmPa * 0.000662 * (tbsC - tbuC));
  return (0.622 * pv) / Math.max(1, pAtmPa - pv);
}
/** Umidade absoluta a partir de TBS e umidade relativa (%). */
export function umidadeAbsolutaPorUr(tbsC: number, urPct: number, pAtmPa: number): number {
  const pv = (urPct / 100) * pressaoDeSaturacaoPa(tbsC);
  return (0.622 * pv) / Math.max(1, pAtmPa - pv);
}

// ─── O motor ─────────────────────────────────────────────────────────────────

function uDe(camadas: CamadaParede[] | null, porCodigo: Map<string, Material>, rsi: number, rse: number, padrao: number, oque: string): { u: number; origem: OrigemDaParcela; memoria: string } {
  if (camadas && camadas.length) {
    const d = desempenhoTermico(camadas, porCodigo, rsi, rse);
    if (d.transmitanciaWm2K != null) return { u: d.transmitanciaWm2K, origem: 'DECLARADA', memoria: `U ${r2(d.transmitanciaWm2K)} das camadas` };
    return { u: padrao, origem: 'HIPOTESE', memoria: `U ${r2(padrao)} típico (${oque} com ${d.camadasSemLambda.length} camada(s) sem λ)` };
  }
  return { u: padrao, origem: 'HIPOTESE', memoria: `U ${r2(padrao)} típico (${oque} sem camadas)` };
}

export function cargaTermicaDoNivel(model: BlueprintModel, hip: HipotesesClimatizacao, levelId: ObjectId, ctx: ContextoDaCarga = {}): CargaTermicaDoNivel {
  const condicoes = condicoesExternas(hip.clima, { georreferencia: model.georreferencia ?? null, cidadeDoContexto: ctx.cidadeDoContexto ?? null });
  const porCodigo = new Map((ctx.materiais ?? []).map((m) => [m.codigo, m]));
  const exposicao = exposicaoDoNivel(model, levelId);
  const nivel = model.levels.find((l) => l.id === levelId);
  const tInt = hip.conforto.temperaturaInternaC;
  const tbs = condicoes.tbsC.valor;
  const deltaTExternoK = tbs != null ? r2(tbs - tInt) : null;
  const motor = hip.motor;

  // "Climatizado?" de qualquer ambiente (os vizinhos), pela chave que a exposição dá.
  const premissasPorSpace = new Map<ObjectId, PremissasDoAmbiente>();
  for (const e of exposicao) {
    const s = model.spaces.find((x) => x.id === e.spaceId)!;
    premissasPorSpace.set(e.spaceId, premissasDoAmbiente(e.labelUid ? hip.ambientes[e.labelUid] : undefined, { nome: e.nome, areaPisoM2: e.areaPisoM2, peDireitoMm: e.peDireitoMm, acabamentos: acabamentosDoAmbiente(model, s), temperaturaDoEstudoC: tInt }));
  }
  const climatizadoPorUid = (uid: string | null, nome: string): boolean | null => {
    if (!uid) return null;
    const p = premissasDoAmbiente(hip.ambientes[uid], { nome, areaPisoM2: 1, peDireitoMm: 2800, temperaturaDoEstudoC: tInt });
    return p.climatizado.valor;
  };

  const ambientes: CargaDoAmbiente[] = exposicao.map((e) => {
    const p = premissasPorSpace.get(e.spaceId)!;
    const pendencias: string[] = [...e.pendencias];
    const tAmb = p.temperaturaInternaC.valor;
    const dT = tbs != null ? tbs - tAmb : null;
    if (dT == null) pendencias.push('Sem temperatura externa de projeto: condução e infiltração não avaliadas.');

    // Fração do ΔT para o vizinho: climatizado → 0; não climatizado → fração; desconhecido → fração, dito.
    const fracaoDoVizinho = (uid: string | null, nome: string): { f: number; nota: string } => {
      const c = climatizadoPorUid(uid, nome);
      if (c === true) return { f: 0, nota: `${nome} climatizado` };
      if (c === false) return { f: motor.fracaoDeltaTNaoClimatizado, nota: `${nome} não climatizado (${motor.fracaoDeltaTNaoClimatizado} ΔT)` };
      return { f: motor.fracaoDeltaTNaoClimatizado, nota: `${nome} sem etiqueta — tratado como não climatizado` };
    };

    // ── Paredes.
    const paredes: FaceCalculada[] = e.faces.map((f: FaceVerticalDoAmbiente) => {
      const u = uDe(f.camadas, porCodigo, 0.13, 0.04, motor.uParedePadraoWm2K, 'parede');
      let deltaTeq = 0;
      let memoria = '';
      let origem: OrigemDaParcela = u.origem;
      if (dT == null) {
        return { wallId: f.wallId, descricao: f.externa ? `parede ${f.orientacao ?? '?'}` : `parede p/ ${f.vizinho?.nome ?? '?'}`, areaLiquidaM2: f.areaLiquidaM2, uWm2K: u.u, deltaTeqK: 0, parcela: zero('sem TBS', 'NAO_AVALIADA') };
      }
      if (f.externa === true && f.orientacao) {
        const acr = motor.acrescimoSolarParedeK * PESO_SOLAR_DA_ORIENTACAO[f.orientacao];
        deltaTeq = dT + acr;
        memoria = `${u.memoria} × ${r2(f.areaLiquidaM2)} m² × (ΔT ${r2(dT)} + sol ${r2(acr)} K, ${f.orientacao})`;
        origem = 'HIPOTESE'; // o acréscimo solar é sempre hipótese
      } else if (f.externa === false && f.vizinho) {
        const v = fracaoDoVizinho(f.vizinho.labelUid, f.vizinho.nome);
        deltaTeq = dT * v.f;
        memoria = `${u.memoria} × ${r2(f.areaLiquidaM2)} m² × ΔT ${r2(deltaTeq)} K (${v.nota})`;
        if (v.f > 0) origem = 'HIPOTESE';
      } else {
        deltaTeq = dT;
        memoria = `${u.memoria} × ${r2(f.areaLiquidaM2)} m² × ΔT ${r2(dT)} K (parede sem lado definido, tratada como externa sem sol)`;
        origem = 'HIPOTESE';
      }
      const q = u.u * f.areaLiquidaM2 * deltaTeq;
      return { wallId: f.wallId, descricao: f.externa ? `parede ${f.orientacao ?? '?'}` : `parede p/ ${f.vizinho?.nome ?? '?'}`, areaLiquidaM2: f.areaLiquidaM2, uWm2K: u.u, deltaTeqK: r2(deltaTeq), parcela: { sensivelW: r0(q), latenteW: 0, origem, memoria } };
    });

    // ── Vãos nas faces externas: vidro (condução + insolação) e porta (condução).
    const vaos: VaoCalculado[] = [];
    for (const f of e.faces) {
      if (f.externa !== true || !f.orientacao) continue;
      for (const v of f.vaos) {
        if (v.kind === 'passage') continue;
        const ehVidro = v.kind === 'window' || v.kind === 'sliding';
        if (dT == null) {
          vaos.push({ openingId: v.openingId, descricao: `${ehVidro ? 'janela' : 'porta'} ${f.orientacao}`, areaM2: v.areaM2, conducao: zero('sem TBS', 'NAO_AVALIADA'), insolacao: zero('sem TBS', 'NAO_AVALIADA') });
          continue;
        }
        if (!ehVidro) {
          vaos.push({ openingId: v.openingId, descricao: `porta ${f.orientacao}`, areaM2: v.areaM2, conducao: { sensivelW: r0(motor.uPortaPadraoWm2K * v.areaM2 * dT), latenteW: 0, origem: 'HIPOTESE', memoria: `U ${motor.uPortaPadraoWm2K} típico × ${v.areaM2} m² × ΔT ${r2(dT)}` }, insolacao: zero('porta opaca') });
          continue;
        }
        const u = v.vidro?.uWm2K ?? motor.uVidroPadraoWm2K;
        const fs = v.vidro?.fatorSolar ?? motor.fatorSolarPadrao;
        const fsomb = v.vidro ? fatorDeSombreamento(v.vidro) : 1;
        const irr = IRRADIANCIA_POR_ORIENTACAO[f.orientacao];
        const declarado = !!(v.vidro?.uWm2K != null && v.vidro?.fatorSolar != null);
        vaos.push({
          openingId: v.openingId,
          descricao: `janela ${f.orientacao}`,
          areaM2: v.areaM2,
          conducao: { sensivelW: r0(u * v.areaM2 * dT), latenteW: 0, origem: v.vidro?.uWm2K != null ? 'DECLARADA' : 'HIPOTESE', memoria: `U ${r2(u)}${v.vidro?.uWm2K != null ? '' : ' típico'} × ${v.areaM2} m² × ΔT ${r2(dT)}` },
          // A irradiância é tabela de memória: a insolação é sempre hipótese, mesmo com vidro declarado.
          insolacao: { sensivelW: r0(v.areaM2 * fs * fsomb * irr), latenteW: 0, origem: 'HIPOTESE', memoria: `${v.areaM2} m² × FS ${r2(fs)}${declarado ? '' : ' típico'} × sombreamento ${r2(fsomb)}${v.vidro ? '' : ' (sem proteção declarada)'} × ${irr} W/m² (${f.orientacao})` },
        });
      }
    }

    // ── Teto.
    let teto: Parcela;
    if (dT == null) teto = zero('sem TBS', 'NAO_AVALIADA');
    else if (e.teto.tipo === 'COBERTURA') {
      const u = uDe(e.teto.camadas, porCodigo, 0.17, 0.04, motor.uCoberturaPadraoWm2K, 'cobertura');
      const dTeq = dT + motor.acrescimoSolarCoberturaK;
      teto = { sensivelW: r0(u.u * e.areaPisoM2 * dTeq), latenteW: 0, origem: 'HIPOTESE', memoria: `${u.memoria} × ${e.areaPisoM2} m² × (ΔT ${r2(dT)} + sol ${motor.acrescimoSolarCoberturaK} K)` };
    } else if (e.teto.tipo === 'LAJE_EXPOSTA' || e.teto.tipo === 'EXTERIOR') {
      const u = uDe(e.teto.camadas, porCodigo, 0.17, 0.04, motor.uLajePadraoWm2K, 'laje');
      const acr = e.teto.tipo === 'LAJE_EXPOSTA' ? motor.acrescimoSolarCoberturaK : 0;
      teto = { sensivelW: r0(u.u * e.areaPisoM2 * (dT + acr)), latenteW: 0, origem: 'HIPOTESE', memoria: `${u.memoria} × ${e.areaPisoM2} m² × (ΔT ${r2(dT)}${acr ? ` + sol ${acr} K` : ''})` };
    } else {
      // AMBIENTE acima.
      const v = fracaoDoVizinho(e.teto.vizinho?.labelUid ?? null, e.teto.vizinho?.nome ?? 'ambiente acima');
      if (v.f === 0) teto = zero(v.nota);
      else {
        const u = uDe(e.teto.camadas, porCodigo, 0.17, 0.04, motor.uLajePadraoWm2K, 'laje');
        teto = { sensivelW: r0(u.u * e.areaPisoM2 * dT * v.f), latenteW: 0, origem: 'HIPOTESE', memoria: `${u.memoria} × ${e.areaPisoM2} m² × ΔT ${r2(dT * v.f)} K (${v.nota})` };
      }
    }

    // ── Piso.
    let piso: Parcela;
    if (dT == null) piso = zero('sem TBS', 'NAO_AVALIADA');
    else if (e.piso.tipo === 'SOLO') piso = zero('sobre o solo: ganho desprezado (hipótese)', 'HIPOTESE');
    else if (e.piso.tipo === 'EXTERIOR') {
      const u = uDe(e.piso.camadas, porCodigo, 0.17, 0.04, motor.uLajePadraoWm2K, 'laje');
      piso = { sensivelW: r0(u.u * e.areaPisoM2 * dT), latenteW: 0, origem: 'HIPOTESE', memoria: `${u.memoria} × ${e.areaPisoM2} m² × ΔT ${r2(dT)} (pilotis)` };
    } else {
      const v = fracaoDoVizinho(e.piso.vizinho?.labelUid ?? null, e.piso.vizinho?.nome ?? 'ambiente abaixo');
      if (v.f === 0) piso = zero(v.nota);
      else {
        const u = uDe(e.piso.camadas, porCodigo, 0.17, 0.04, motor.uLajePadraoWm2K, 'laje');
        piso = { sensivelW: r0(u.u * e.areaPisoM2 * dT * v.f), latenteW: 0, origem: 'HIPOTESE', memoria: `${u.memoria} × ${e.areaPisoM2} m² × ΔT ${r2(dT * v.f)} K (${v.nota})` };
      }
    }

    // ── Cargas internas.
    const cal = CALOR_POR_ATIVIDADE[p.atividade.valor];
    const pessoas: Parcela = { sensivelW: r0(p.pessoas.valor * cal.sensivelW), latenteW: r0(p.pessoas.valor * cal.latenteW), origem: 'HIPOTESE', memoria: `${p.pessoas.valor} × (${cal.sensivelW} + ${cal.latenteW}) W, ${p.atividade.valor.toLowerCase().replace(/_/g, ' ')}` };
    const iluminacao: Parcela = { sensivelW: r0(p.iluminacaoW * motor.fatorDeUsoInterno), latenteW: 0, origem: p.iluminacaoWm2.origem === 'DECLARADA' && motor.fatorDeUsoInterno === 1 ? 'DECLARADA' : 'HIPOTESE', memoria: `${p.iluminacaoW} W × uso ${motor.fatorDeUsoInterno}` };
    const equipamentos: Parcela = { sensivelW: r0(p.equipamentosW.valor * motor.fatorDeUsoInterno), latenteW: 0, origem: p.equipamentosW.origem === 'DECLARADA' && motor.fatorDeUsoInterno === 1 ? 'DECLARADA' : 'HIPOTESE', memoria: `${p.equipamentosW.valor} W × uso ${motor.fatorDeUsoInterno}` };
    const fonteExtra: Parcela = { sensivelW: r0(p.fonteSensivelW), latenteW: r0(p.fonteLatenteW), origem: 'DECLARADA', memoria: p.fonteSensivelW || p.fonteLatenteW ? 'declarada' : 'nenhuma' };

    // ── Infiltração.
    let infiltracao: Parcela;
    if (dT == null) infiltracao = zero('sem TBS', 'NAO_AVALIADA');
    else {
      const n = motor.trocasDeArPorHora;
      const sens = 0.34 * p.volumeM3 * n * dT;
      let lat = 0;
      let nota = '';
      if (condicoes.tbuC.valor != null) {
        const pAtm = pressaoAtmosfericaPa(condicoes.altitudeM.valor ?? 0);
        const wExt = umidadeAbsolutaPorTbu(tbs!, condicoes.tbuC.valor, pAtm);
        const wInt = umidadeAbsolutaPorUr(tAmb, hip.conforto.umidadeRelativaPct, pAtm);
        lat = Math.max(0, 833 * p.volumeM3 * n * (wExt - wInt));
        nota = ` · latente ${r0(lat)} W (Δw ${r2((wExt - wInt) * 1000)} g/kg)`;
      } else pendencias.push('Sem TBU externa: parcela latente da infiltração não avaliada.');
      infiltracao = { sensivelW: r0(sens), latenteW: r0(lat), origem: 'HIPOTESE', memoria: `${n} trocas/h × ${p.volumeM3} m³ × ΔT ${r2(dT)}${nota}` };
    }

    const climatizado = p.climatizado.valor;
    const parcelas = [...paredes.map((x) => x.parcela), ...vaos.flatMap((v) => [v.conducao, v.insolacao]), teto, piso, pessoas, iluminacao, equipamentos, fonteExtra, infiltracao];
    const sensivelW = climatizado ? parcelas.reduce((s, x) => s + x.sensivelW, 0) : 0;
    const latenteW = climatizado ? parcelas.reduce((s, x) => s + x.latenteW, 0) : 0;
    const totalW = sensivelW + latenteW;
    const conferir = p.conferir || parcelas.some((x) => x.origem === 'HIPOTESE');
    if (!climatizado) pendencias.length = 0;
    return {
      spaceId: e.spaceId,
      levelId: e.levelId,
      labelUid: e.labelUid,
      nome: e.nome,
      climatizado,
      areaPisoM2: e.areaPisoM2,
      volumeM3: p.volumeM3,
      temperaturaInternaC: tAmb,
      premissas: p,
      exposicao: e,
      paredes,
      vaos,
      teto,
      piso,
      pessoas,
      iluminacao,
      equipamentos,
      fonteExtra,
      infiltracao,
      sensivelW,
      latenteW,
      totalW,
      totalBtuH: r0(totalW * W_PARA_BTUH),
      wPorM2: e.areaPisoM2 > 0 ? r0(totalW / e.areaPisoM2) : 0,
      conferir,
      pendencias,
    };
  });

  const clim = ambientes.filter((a) => a.climatizado);
  const totalSensivelW = clim.reduce((s, a) => s + a.sensivelW, 0);
  const totalLatenteW = clim.reduce((s, a) => s + a.latenteW, 0);
  void nivel;
  return {
    levelId,
    condicoes,
    deltaTExternoK,
    ambientes,
    totalSensivelW,
    totalLatenteW,
    totalW: totalSensivelW + totalLatenteW,
    totalBtuH: r0((totalSensivelW + totalLatenteW) * W_PARA_BTUH),
    conferir: clim.some((a) => a.conferir) || condicoes.conferir,
  };
}

/**
 * MAPA DE CALOR (E2.3): a cor do ambiente pela densidade de carga, W/m² — azul
 * claro até 40, amarelo em ~120, vermelho de 200 para cima. Não climatizado =
 * cinza claro. É só a cor; o número está na tabela.
 */
export function corDaDensidade(wPorM2: number | null, climatizado = true): string {
  if (!climatizado || wPorM2 == null) return '#e2e8f0';
  const t = Math.max(0, Math.min(1, (wPorM2 - 40) / 160));
  // Matiz de 210° (azul) a 0° (vermelho), saturação suave para o traço continuar legível.
  const h = Math.round(210 - 210 * t);
  return `hsl(${h} 70% 82%)`;
}

export function coresDaCarga(n: CargaTermicaDoNivel): Map<ObjectId, string> {
  return new Map(n.ambientes.map((a) => [a.spaceId, corDaDensidade(a.wPorM2, a.climatizado)]));
}

/** A carga de todos os pavimentos, para o resumo do estudo e o memorial. */
export function cargaTermicaDoEstudo(model: BlueprintModel, hip: HipotesesClimatizacao, ctx: ContextoDaCarga = {}): CargaTermicaDoNivel[] {
  return [...model.levels].sort((a, b) => a.elevationMm - b.elevationMm).map((l) => cargaTermicaDoNivel(model, hip, l.id, ctx));
}
