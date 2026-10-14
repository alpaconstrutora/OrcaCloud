/**
 * ÁREAS NBR 12721 — o motor dos Quadros I, II e IV-B (13/10/2026, Fase 1 do
 * plano `docs/planos/2026-10-13-areas-nbr12721-na-planta.md`).
 *
 * Função pura: `calcularNbr12721(entrada)` não lê banco, não muta a entrada e
 * devolve sempre a mesma saída para a mesma entrada (era o caso 8 do QA antigo,
 * "recálculo determinístico", que aqui vira propriedade da função).
 *
 * ─── REPRODUZ O SQL, DE PROPÓSITO ──────────────────────────────────────────
 *
 * Cada passo abaixo é a tradução de um trecho de `calculate_area_version` /
 * `validate_area_version` como estavam no banco em 13/10/2026 (md5 nas
 * fixtures), inclusive onde o SQL não fecha a conta do prédio. Mudar uma regra
 * aqui faz a testemunha (`__tests__/nbr12721Quadros.test.ts`) acusar — e é
 * para acusar: mudança de regra de cálculo de documento de cartório é decisão
 * registrada no plano, nunca efeito colateral.
 *
 * O que este motor ACRESCENTA ao SQL, sem mudar nenhum número dos quadros:
 *   - milésimos fechados em exatamente 1000 pelo maior resto (`milesimos`);
 *   - avisos FECH_* dizendo onde e por que o prédio não fecha (a testemunha
 *     mostrou unidade inativa/não autônoma, acessório fora do coeficiente e
 *     equivalente informado à mão abrindo diferença entre os quadros).
 */
import type {
  CoberturaNbr,
  EntradaNbr12721,
  EspacoNbr,
  FracaoIdeal,
  LinhaQuadroI,
  LinhaQuadroII,
  LinhaQuadroIVB,
  Pendencia,
  SaidaNbr12721,
  UnidadeNbr,
} from './tipos';

/**
 * A versão do motor — vai junto do quadro congelado na versão publicada
 * (`blueprint_snapshot_nbr12721.versao_motor`). Subir quando uma regra de
 * cálculo mudar: quadro aprovado com uma versão não pode ser recalculado por
 * outra sem dizer.
 */
export const VERSAO_DO_MOTOR_NBR12721 = 'nbr12721-ts-1.0.0';

/** Casas dos milésimos fechados (0,0001 ‰). */
export const CASAS_DOS_MILESIMOS = 4;

/** A tolerância das somas de coeficiente e fração — a do SQL desde a migration `20261231000012`. */
const TOLERANCIA_DA_SOMA = 1e-9;

/** Diferença de área (m²) a partir da qual um fechamento é reportado. */
const TOLERANCIA_DE_AREA = 1e-6;

/**
 * `round(numeric, casas)` do Postgres: meio para longe do zero. O
 * `toPrecision(15)` tira o ruído binário antes (0,1 + 0,2 vira 0,3 de novo),
 * senão um empate exato como 2,0000005 cairia do lado errado.
 */
export function arredondar(v: number, casas: number): number {
  const f = 10 ** casas;
  const x = Number((Math.abs(v) * f).toPrecision(15));
  return (Math.sign(v) * Math.round(x)) / f;
}

const r6 = (v: number) => arredondar(v, 6);
const foraDoPadrao = (c: CoberturaNbr) => c !== 'PADRAO';
const somar = <T>(lista: T[], f: (x: T) => number) => lista.reduce((s, x) => s + f(x), 0);
/** O `COALESCE` do SQL: o primeiro que não é nulo. */
const primeiro = (...v: (number | null | undefined)[]) => {
  for (const x of v) if (x !== null && x !== undefined && !Number.isNaN(x)) return x;
  return null;
};
/** Ordem do `ORDER BY code` do SQL. */
const porCodigo = (a: string, b: string) => a.localeCompare(b, 'pt-BR');

// ── integridade ─────────────────────────────────────────────────────────────

/**
 * Referência a bloco/pavimento/unidade/espaço inexistente é DEFEITO DO
 * ADAPTADOR, não pendência do usuário — no SQL era chave estrangeira. Falha alto.
 */
function exigirIntegridade(e: EntradaNbr12721): void {
  const blocos = new Set(e.blocos.map((b) => b.codigo));
  const pavimentos = new Set(e.pavimentos.map((p) => p.codigo));
  const unidades = new Set(e.unidades.map((u) => u.codigo));
  const espacos = new Set(e.espacos.map((s) => s.codigo));
  const exigir = (ok: boolean, msg: string) => {
    if (!ok) throw new Error(`Entrada NBR 12721 inconsistente: ${msg}`);
  };
  const unico = (lista: string[], o: string) => exigir(new Set(lista).size === lista.length, `${o} com código repetido`);
  unico(e.blocos.map((b) => b.codigo), 'bloco');
  unico(e.pavimentos.map((p) => p.codigo), 'pavimento');
  unico(e.unidades.map((u) => u.codigo), 'unidade');
  unico(e.espacos.map((s) => s.codigo), 'espaço');
  for (const p of e.pavimentos) exigir(blocos.has(p.bloco), `pavimento ${p.codigo} em bloco inexistente ${p.bloco}`);
  for (const u of e.unidades) exigir(blocos.has(u.bloco), `unidade ${u.codigo} em bloco inexistente ${u.bloco}`);
  for (const s of e.espacos) {
    exigir(blocos.has(s.bloco), `espaço ${s.codigo} em bloco inexistente ${s.bloco}`);
    exigir(pavimentos.has(s.pavimento), `espaço ${s.codigo} em pavimento inexistente ${s.pavimento}`);
    exigir(s.unidade === null || unidades.has(s.unidade), `espaço ${s.codigo} em unidade inexistente ${s.unidade}`);
  }
  for (const v of e.vinculos) {
    exigir(unidades.has(v.unidade) && espacos.has(v.espaco), `vínculo ${v.unidade} → ${v.espaco} cita item inexistente`);
  }
  for (const a of e.alocacoes) {
    exigir(unidades.has(a.unidade) && espacos.has(a.espaco), `alocação ${a.espaco} → ${a.unidade} cita item inexistente`);
  }
  for (const d of e.escopos) {
    exigir(espacos.has(d.espaco), `escopo cita espaço inexistente ${d.espaco}`);
    exigir(d.bloco === null || blocos.has(d.bloco), `escopo cita bloco inexistente ${d.bloco}`);
  }
}

// ── validação (validate_area_version) ───────────────────────────────────────

function pendencia(codigo: Pendencia['codigo'], mensagem: string, itens: string[], bloqueante = true): Pendencia {
  return { codigo, mensagem, bloqueante, itens };
}

/** As pendências que IMPEDEM o cálculo, na ordem em que o SQL as acusava. */
export function validarNbr12721(e: EntradaNbr12721): Pendencia[] {
  exigirIntegridade(e);
  const out: Pendencia[] = [];
  const se = (codigo: Pendencia['codigo'], mensagem: string, itens: string[]) => {
    if (itens.length) out.push(pendencia(codigo, mensagem, itens));
  };
  const cod = (lista: EspacoNbr[]) => lista.map((s) => s.codigo);
  const vinculados = new Set(e.vinculos.map((v) => v.espaco));

  se('MOTOR_006', 'Ambiente com área real menor ou igual a zero', cod(e.espacos.filter((s) => !(s.areaRealM2 > 0))));
  se('MOTOR_007', 'Área fora do padrão sem coeficiente', cod(e.espacos.filter((s) => foraDoPadrao(s.cobertura) && s.coeficiente === null)));
  se('MOTOR_012', 'Área comum sem tipo de divisão', cod(e.espacos.filter((s) => s.uso === 'COMUM' && s.divisao === null)));
  se(
    'MOTOR_011',
    'Área privativa sem unidade',
    cod(e.espacos.filter((s) => s.uso === 'PRIVATIVO' && s.contabilizacao === 'UNIDADE' && s.unidade === null)),
  );
  se(
    'ACC_VAL_001',
    'Acessório vinculado não pode ter unidade própria',
    cod(e.espacos.filter((s) => s.contabilizacao === 'ACESSORIO_VINCULADO' && s.unidade !== null)),
  );
  se(
    'ACC_VAL_003',
    'Acessório vinculado sem vínculo contábil',
    cod(e.espacos.filter((s) => s.contabilizacao === 'ACESSORIO_VINCULADO' && !vinculados.has(s.codigo))),
  );
  se(
    'ACC_VAL_003',
    'Espaço acessório contado pela unidade E pelo vínculo',
    cod(e.espacos.filter((s) => s.unidade !== null && vinculados.has(s.codigo))),
  );
  const comEscopo = new Set(e.escopos.map((d) => d.espaco));
  se(
    'COM_PROP_VAL_001',
    'Área comum proporcional sem escopo de distribuição',
    cod(e.espacos.filter((s) => s.uso === 'COMUM' && s.divisao === 'PROPORCIONAL' && !comEscopo.has(s.codigo))),
  );
  se(
    'COM_PROP_VAL_002',
    'Escopo por bloco sem bloco',
    e.escopos.filter((d) => d.escopo === 'BLOCO' && d.bloco === null).map((d) => d.espaco),
  );
  se(
    'QII_VAL_001',
    'Unidade sem código',
    e.unidades.filter((u) => u.ativa && u.autonoma && u.codigo.trim() === '').map((u) => u.codigo),
  );
  return out;
}

// ── cálculo (calculate_area_version) ────────────────────────────────────────

/** Equivalente de um espaço: o SQL grava `round(real × coalesce(coef, 1), 6)` antes de tudo. */
const equivalente = (s: EspacoNbr) => r6(s.areaRealM2 * (s.coeficiente ?? 1));
const coeficiente = (s: EspacoNbr) => s.coeficiente ?? 1;

function quadroI(e: EntradaNbr12721): LinhaQuadroI[] {
  const ordemDoBloco = new Map(e.blocos.map((b) => [b.codigo, b.ordem]));
  const pavimentos = [...e.pavimentos].sort(
    (a, b) => a.ordem - b.ordem || (ordemDoBloco.get(a.bloco)! - ordemDoBloco.get(b.bloco)!) || porCodigo(a.codigo, b.codigo),
  );
  return pavimentos.map((p) => {
    // TODO espaço do pavimento entra — inclusive de unidade inativa ou não
    // autônoma e o acessório vinculado fora do coeficiente. É por isso que o
    // Quadro I pode ser maior que a soma das unidades (FECH_*).
    const doPav = e.espacos.filter((s) => s.pavimento === p.codigo);
    const soma = (f: (s: EspacoNbr) => boolean, eq = false) =>
      somar(doPav.filter(f), (s) => (eq ? equivalente(s) : s.areaRealM2));
    const priv = (s: EspacoNbr) => s.uso === 'PRIVATIVO';
    const naoProp = (s: EspacoNbr) => s.uso === 'COMUM' && s.divisao === 'NAO_PROPORCIONAL';
    const prop = (s: EspacoNbr) => s.uso === 'COMUM' && s.divisao === 'PROPORCIONAL';
    const padrao = (s: EspacoNbr) => s.cobertura === 'PADRAO';
    const fora = (s: EspacoNbr) => foraDoPadrao(s.cobertura);
    const q02 = soma((s) => priv(s) && padrao(s));
    const q03 = soma((s) => priv(s) && fora(s));
    const q04 = soma((s) => priv(s) && fora(s), true);
    const q07 = soma((s) => naoProp(s) && padrao(s));
    const q08 = soma((s) => naoProp(s) && fora(s));
    const q09 = soma((s) => naoProp(s) && fora(s), true);
    const q12 = soma((s) => prop(s) && padrao(s));
    const q13 = soma((s) => prop(s) && fora(s));
    const q14 = soma((s) => prop(s) && fora(s), true);
    return {
      bloco: p.bloco,
      pavimento: p.codigo,
      row_order: p.ordem,
      floor_label: p.nome,
      qi_02_private_covered_standard_raw: r6(q02),
      qi_03_private_nonstandard_or_uncovered_raw: r6(q03),
      qi_04_private_equivalent_raw: r6(q04),
      qi_05_private_real_total_raw: r6(q02 + q03),
      qi_06_private_equivalent_total_raw: r6(q02 + q04),
      qi_07_common_nonprop_covered_standard_raw: r6(q07),
      qi_08_common_nonprop_nonstandard_or_uncovered_raw: r6(q08),
      qi_09_common_nonprop_equivalent_raw: r6(q09),
      qi_10_common_nonprop_real_total_raw: r6(q07 + q08),
      qi_11_common_nonprop_equivalent_total_raw: r6(q07 + q09),
      qi_12_common_prop_covered_standard_raw: r6(q12),
      qi_13_common_prop_nonstandard_or_uncovered_raw: r6(q13),
      qi_14_common_prop_equivalent_raw: r6(q14),
      qi_15_common_prop_real_total_raw: r6(q12 + q13),
      qi_16_common_prop_equivalent_total_raw: r6(q12 + q14),
      qi_17_floor_real_total_raw: r6(q02 + q03 + q07 + q08 + q12 + q13),
      qi_18_floor_equivalent_total_raw: r6(q02 + q04 + q07 + q09 + q12 + q14),
    };
  });
}

/** As unidades dos Quadros II e IV-B: ativas e autônomas. */
const unidadesDosQuadros = (e: EntradaNbr12721): UnidadeNbr[] =>
  e.unidades.filter((u) => u.ativa && u.autonoma).sort((a, b) => porCodigo(a.codigo, b.codigo));

function quadroII(e: EntradaNbr12721): LinhaQuadroII[] {
  const unidades = unidadesDosQuadros(e);
  const espaco = new Map(e.espacos.map((s) => [s.codigo, s]));

  const base = unidades.map((u) => {
    // private_spaces: os do próprio dono + os acessórios vinculados que afetam o coeficiente.
    const diretos = e.espacos.filter((s) => s.unidade === u.codigo && s.uso === 'PRIVATIVO' && s.contabilizacao === 'UNIDADE');
    const vinculados = e.vinculos
      .filter((v) => v.unidade === u.codigo && v.afetaCoeficiente)
      .map((v) => espaco.get(v.espaco)!)
      .filter((s) => s.uso === 'PRIVATIVO' && s.contabilizacao === 'ACESSORIO_VINCULADO');
    const priv = [...diretos, ...vinculados];
    const q20 = somar(priv.filter((s) => !foraDoPadrao(s.cobertura)), (s) => s.areaRealM2);
    const q21 = somar(priv.filter((s) => foraDoPadrao(s.cobertura)), (s) => s.areaRealM2);
    const q22 = somar(priv.filter((s) => foraDoPadrao(s.cobertura)), equivalente);

    // nonprop: o SQL junta a alocação ao espaço SEM filtrar uso/divisão, e o
    // COALESCE cai para o valor seguinte quando o anterior é nulo — um termo
    // todo nulo some da soma (SUM ignora nulo).
    let q25 = 0;
    let q26 = 0;
    let q27 = 0;
    for (const a of e.alocacoes.filter((x) => x.unidade === u.codigo)) {
      const cs = espaco.get(a.espaco)!;
      const real = primeiro(a.areaRealM2, a.percentual === null ? null : cs.areaRealM2 * a.percentual);
      if (!foraDoPadrao(cs.cobertura)) q25 += real ?? 0;
      else {
        q26 += real ?? 0;
        const eq = primeiro(
          a.areaEquivalenteM2,
          a.areaRealM2 === null ? null : a.areaRealM2 * coeficiente(cs),
          a.percentual === null ? null : equivalente(cs) * a.percentual,
        );
        q27 += eq ?? 0;
      }
    }
    return {
      u,
      q20, q21, q22,
      q23: q20 + q21,
      q24: q20 + q22,
      q25, q26, q27,
      q28: q25 + q26,
      q29: q25 + q27,
      q30: q20 + q22 + q25 + q27,
    };
  });

  // Denominadores: o prédio todo e cada bloco; zero vira 1 (NULLIF … , 1).
  const denGlobal = somar(base, (b) => b.q30) || 1;
  const denBloco = new Map<string, number>();
  for (const b of base) denBloco.set(b.u.bloco, (denBloco.get(b.u.bloco) ?? 0) + b.q30);
  for (const [k, v] of denBloco) denBloco.set(k, v || 1);

  return base.map((b, i) => {
    let q32 = 0;
    let q33 = 0;
    let q34 = 0;
    // prop_alloc: escopos globais e os do bloco da unidade, sobre comuns proporcionais.
    for (const d of e.escopos) {
      if (!(d.escopo === 'GLOBAL' || d.bloco === b.u.bloco)) continue;
      const cs = espaco.get(d.espaco)!;
      if (cs.uso !== 'COMUM' || cs.divisao !== 'PROPORCIONAL') continue;
      const parte = d.escopo === 'GLOBAL' ? b.q30 / denGlobal : d.bloco === b.u.bloco ? b.q30 / denBloco.get(b.u.bloco)! : 0;
      if (!foraDoPadrao(cs.cobertura)) q32 += cs.areaRealM2 * parte;
      else {
        q33 += cs.areaRealM2 * parte;
        q34 += equivalente(cs) * parte;
      }
    }
    return {
      unidade: b.u.codigo,
      row_order: i + 1,
      unit_label: b.u.codigo,
      qii_20_private_covered_standard_raw: r6(b.q20),
      qii_21_private_nonstandard_or_uncovered_raw: r6(b.q21),
      qii_22_private_equivalent_raw: r6(b.q22),
      qii_23_private_real_total_raw: r6(b.q23),
      qii_24_private_equivalent_total_raw: r6(b.q24),
      qii_25_common_nonprop_covered_standard_raw: r6(b.q25),
      qii_26_common_nonprop_nonstandard_or_uncovered_raw: r6(b.q26),
      qii_27_common_nonprop_equivalent_raw: r6(b.q27),
      qii_28_common_nonprop_real_total_raw: r6(b.q28),
      qii_29_common_nonprop_equivalent_total_raw: r6(b.q29),
      qii_30_nonprop_equivalent_total_raw: r6(b.q30),
      qii_31_proportionality_coefficient_raw: arredondar(b.q30 / denGlobal, 12),
      qii_32_common_prop_covered_standard_raw: r6(q32),
      qii_33_common_prop_nonstandard_or_uncovered_raw: r6(q33),
      qii_34_common_prop_equivalent_raw: r6(q34),
      qii_35_common_prop_real_total_raw: r6(q32 + q33),
      qii_36_common_prop_equivalent_total_raw: r6(q32 + q34),
      qii_37_unit_real_total_raw: r6(b.q23 + b.q28 + q32 + q33),
      qii_38_unit_equivalent_total_raw: r6(b.q30 + q32 + q34),
    };
  });
}

/**
 * Milésimos que somam EXATAMENTE 1000: cada unidade recebe o piso da sua cota
 * e as sobras vão, uma a uma, aos maiores restos (empate: ordem do código).
 * O SQL só arredondava — 1000,00000001 nos casos 04, 11, 13 e 14.
 */
export function milesimosPeloMaiorResto(coeficientes: number[], casas = CASAS_DOS_MILESIMOS): number[] {
  const soma = somar(coeficientes, (c) => c);
  if (!(soma > 0)) return coeficientes.map(() => 0);
  const total = 1000 * 10 ** casas;
  const cotas = coeficientes.map((c) => (c / soma) * total);
  const pisos = cotas.map((c) => Math.floor(Number(c.toPrecision(15))));
  let sobra = total - somar(pisos, (p) => p);
  const ordem = cotas.map((c, i) => ({ i, resto: c - pisos[i] })).sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (const { i } of ordem) {
    if (sobra <= 0) break;
    pisos[i] += 1;
    sobra -= 1;
  }
  return pisos.map((p) => p / 10 ** casas);
}

function fracoesDe(qii: LinhaQuadroII[]): FracaoIdeal[] {
  const coefs = qii.map((l) => l.qii_31_proportionality_coefficient_raw);
  const fechados = milesimosPeloMaiorResto(coefs);
  return qii.map((l, i) => ({
    unidade: l.unidade,
    source_coefficient: l.qii_31_proportionality_coefficient_raw,
    fraction_decimal_raw: l.qii_31_proportionality_coefficient_raw,
    fraction_percent_raw: arredondar(l.qii_31_proportionality_coefficient_raw * 100, 10),
    fraction_thousandths_raw: arredondar(l.qii_31_proportionality_coefficient_raw * 1000, 8),
    milesimos: fechados[i],
  }));
}

function quadroIVB(e: EntradaNbr12721, qii: LinhaQuadroII[], fracoes: FracaoIdeal[]): LinhaQuadroIVB[] {
  const espaco = new Map(e.espacos.map((s) => [s.codigo, s]));
  return qii.map((q, i) => {
    const diretos = e.espacos.filter((s) => s.unidade === q.unidade && s.uso === 'PRIVATIVO' && s.contabilizacao === 'UNIDADE');
    const principal = somar(diretos.filter((s) => s.natureza === 'PRINCIPAL'), (s) => s.areaRealM2);
    const acessoria = somar(diretos.filter((s) => s.natureza === 'ACESSORIA'), (s) => s.areaRealM2);
    // linked_accessories: o SQL não filtra o uso aqui, só a contabilização.
    const vinculada = somar(
      e.vinculos
        .filter((v) => v.unidade === q.unidade && v.afetaPrivativa)
        .map((v) => espaco.get(v.espaco)!)
        .filter((s) => s.contabilizacao === 'ACESSORIO_VINCULADO'),
      (s) => s.areaRealM2,
    );
    // O comum do IV-B vem das colunas JÁ ARREDONDADAS do Quadro II.
    const comum = q.qii_28_common_nonprop_real_total_raw + q.qii_35_common_prop_real_total_raw;
    const f = fracoes[i];
    return {
      unidade: q.unidade,
      row_order: q.row_order,
      unit_label: q.unit_label,
      qivb_b_private_main_area_raw: r6(principal),
      qivb_c_private_accessory_area_raw: r6(acessoria + vinculada),
      qivb_d_private_total_area_raw: r6(principal + acessoria + vinculada),
      qivb_e_common_area_raw: r6(comum),
      qivb_f_real_total_area_raw: r6(principal + acessoria + vinculada + comum),
      qivb_g_proportionality_coefficient_raw: q.qii_31_proportionality_coefficient_raw,
      fraction_decimal_raw: f.fraction_decimal_raw,
      fraction_percent_raw: f.fraction_percent_raw,
      fraction_thousandths_raw: f.fraction_thousandths_raw,
    };
  });
}

// ── fechamentos (o que o SQL não dizia) ─────────────────────────────────────

const m2 = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m²`;

function fechamentos(e: EntradaNbr12721, qi: LinhaQuadroI[], qii: LinhaQuadroII[], ivb: LinhaQuadroIVB[]): Pendencia[] {
  const out: Pendencia[] = [];
  const aviso = (codigo: Pendencia['codigo'], mensagem: string, itens: string[]) =>
    out.push(pendencia(codigo, mensagem, itens, false));

  const fora = e.unidades.filter((u) => !(u.ativa && u.autonoma));
  const comArea = fora
    .map((u) => ({ u, area: somar(e.espacos.filter((s) => s.unidade === u.codigo), (s) => s.areaRealM2) }))
    .filter((x) => x.area > TOLERANCIA_DE_AREA);
  if (comArea.length) {
    aviso(
      'FECH_001',
      `Área de unidade inativa ou não autônoma entra no Quadro I e não é distribuída a nenhuma unidade (${comArea
        .map((x) => `${x.u.codigo}: ${m2(x.area)}`)
        .join('; ')}). Se é área de uso comum, classifique como comum.`,
      comArea.map((x) => x.u.codigo),
    );
  }

  const assimetricos = e.vinculos.filter((v) => v.afetaPrivativa !== v.afetaCoeficiente);
  if (assimetricos.length) {
    aviso(
      'FECH_002',
      'Acessório vinculado que entra na privativa e não no coeficiente (ou o contrário): o Quadro II e o IV-B deixam de fechar.',
      assimetricos.map((v) => v.espaco),
    );
  }

  const espaco = new Map(e.espacos.map((s) => [s.codigo, s]));
  const informados = e.alocacoes.filter((a) => {
    if (a.areaEquivalenteM2 === null || a.areaRealM2 === null) return false;
    const cs = espaco.get(a.espaco)!;
    return Math.abs(a.areaEquivalenteM2 - a.areaRealM2 * coeficiente(cs)) > TOLERANCIA_DE_AREA;
  });
  if (informados.length) {
    aviso(
      'FECH_003',
      'Equivalente informado à mão diferente de real × coeficiente: o Quadro I e o II deixam de fechar no equivalente.',
      informados.map((a) => `${a.espaco} → ${a.unidade}`),
    );
  }

  // E a conta do prédio — reportada sempre que não fecha, com ou sem causa conhecida.
  const total = {
    qi17: somar(qi, (l) => l.qi_17_floor_real_total_raw),
    qi18: somar(qi, (l) => l.qi_18_floor_equivalent_total_raw),
    qii37: somar(qii, (l) => l.qii_37_unit_real_total_raw),
    qii38: somar(qii, (l) => l.qii_38_unit_equivalent_total_raw),
    ivbF: somar(ivb, (l) => l.qivb_f_real_total_area_raw),
  };
  const dif: string[] = [];
  if (Math.abs(total.qi17 - total.qii37) > TOLERANCIA_DE_AREA) dif.push(`real do prédio ${m2(total.qi17)} × Σ unidades no Quadro II ${m2(total.qii37)}`);
  if (Math.abs(total.qii37 - total.ivbF) > TOLERANCIA_DE_AREA) dif.push(`Quadro II ${m2(total.qii37)} × Quadro IV-B ${m2(total.ivbF)}`);
  if (Math.abs(total.qi18 - total.qii38) > TOLERANCIA_DE_AREA) dif.push(`equivalente do prédio ${m2(total.qi18)} × Σ unidades ${m2(total.qii38)}`);
  if (dif.length) aviso('FECH_001', `Os quadros não fecham: ${dif.join('; ')}.`, []);
  return out;
}

// ── entrada principal ───────────────────────────────────────────────────────

export function calcularNbr12721(e: EntradaNbr12721): SaidaNbr12721 {
  const bloqueios = validarNbr12721(e);
  if (bloqueios.length) {
    return { status: 'failed', pendencias: bloqueios, quadroI: [], quadroII: [], quadroIVB: [], fracoes: [] };
  }
  const qi = quadroI(e);
  const qii = quadroII(e);
  const fracoes = fracoesDe(qii);
  const ivb = quadroIVB(e, qii, fracoes);

  // A revalidação do SQL depois do cálculo: as somas de coeficiente e fração.
  const pos: Pendencia[] = [];
  const somaCoef = somar(qii, (l) => l.qii_31_proportionality_coefficient_raw);
  if (somaCoef !== 0 && Math.abs(somaCoef - 1) > TOLERANCIA_DA_SOMA) {
    pos.push(pendencia('QII_VAL_006', `Soma dos coeficientes diferente de 1 (${somaCoef})`, []));
  }
  const somaFrac = somar(fracoes, (f) => f.fraction_decimal_raw);
  if (somaFrac !== 0 && Math.abs(somaFrac - 1) > TOLERANCIA_DA_SOMA) {
    pos.push(pendencia('FRAC_VAL_002', `Soma das frações decimais diferente de 1 (${somaFrac})`, []));
  }

  return {
    status: pos.length ? 'failed' : 'success',
    pendencias: [...pos, ...fechamentos(e, qi, qii, ivb)],
    quadroI: qi,
    quadroII: qii,
    quadroIVB: ivb,
    fracoes,
  };
}
