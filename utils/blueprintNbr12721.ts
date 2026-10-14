/**
 * ÁREAS NBR 12721 A PARTIR DO ESTUDO DA PLANTA (13/10/2026, Fase 4 do plano
 * `docs/planos/2026-10-13-areas-nbr12721-na-planta.md`).
 *
 * `entradaDoEstudo(model, hipoteses)` monta a `EntradaNbr12721` do motor puro
 * (`utils/nbr12721/quadros.ts`) a partir do que o estudo já tem — desenho,
 * etiquetas classificadas, unidades do prédio inteiro (Fase 3), vagas e
 * ambientes declarados. Nada aqui é gravado.
 *
 * ─── A SOMA FECHA COM A ÁREA CONSTRUÍDA ────────────────────────────────────
 *
 * O ambiente desenhado é medido pelo EIXO das paredes. A privativa da NBR 12721
 * é o eixo mais a metade das paredes externas da unidade — essa metade entra
 * como um espaço próprio da unidade ("Paredes externas — 101"). O que sobra
 * da área construída do pavimento (paredes internas, metade externa dos
 * comuns) entra como "Paredes e circulação — <pavimento>", comum proporcional
 * coberto de padrão. Assim o Quadro I de cada pavimento fecha com a área
 * construída, sem número escondido.
 *
 * ─── O QUE NÃO FOI CLASSIFICADO RECEBE A SUGESTÃO, E A TELA DIZ ────────────
 *
 * Etiqueta sem `nbr12721` entra com `classificacaoSugerida` (varanda → coberta
 * de padrão diferente; nada acima num pavimento que tem pavimento acima →
 * descoberta; ambiente fora de unidade → comum proporcional). Cada uma volta
 * na lista `aClassificar`, para a tela pedir a confirmação.
 *
 * ─── A VAGA NÃO CONTA DUAS VEZES ───────────────────────────────────────────
 *
 * A vaga desenhada fica DENTRO de um ambiente (a garagem). Quando ela é
 * acessório vinculado de uma unidade, a área dela sai do ambiente que a
 * contém e entra como acessório, com a cobertura daquele ambiente.
 */
import {
  pointInPolygon,
  uidDaCopia,
  type AcessorioDaUnidade,
  type BlueprintModel,
  type ClassificacaoNbr12721,
  type Command,
  type CoberturaNbr12721,
  type ElementUid,
  type EscopoNbr12721,
  type Level,
  type ObjectId,
  type SpaceLabel,
} from './blueprintKernel';
import { areaConstruidaMm2 } from './blueprintKernel/quantities';
import { exposicaoDoNivel } from './blueprintExposicaoTermica';
import { uidDoPavimentoTipo } from './blueprintPavimentoTipoDaMassa';
import { HIPOTESES_DE_NUMERACAO_PADRAO, unidadesDoPredio, type HipotesesDeNumeracao, type UnidadeDoPredio } from './blueprintUnidadesDoPredio';
import type { EntradaNbr12721, EspacoNbr, SaidaNbr12721 } from './nbr12721/tipos';
import { calcularNbr12721, VERSAO_DO_MOTOR_NBR12721 } from './nbr12721/quadros';
import { sha256, stableStringify } from './blueprintKernel/hash';

// ── hipóteses do estudo (tabela `blueprint_study_nbr12721`) ──────────────────

/** Rateio de um comum NÃO proporcional a uma unidade do prédio (pela chave da Fase 3). */
export interface AlocacaoDoEstudo {
  /** uid da etiqueta ou do ambiente declarado comum. */
  alvoUid: ElementUid;
  /** `UnidadeDoPredio.chave`. */
  unidadeChave: string;
  areaM2: number | null;
  percentual: number | null;
}

export interface HipotesesNbr12721 {
  /**
   * Coeficiente usado quando o ambiente fora do padrão não diz o seu. `null` =
   * não há padrão: o ambiente sem coeficiente vira pendência (MOTOR_007). A
   * norma não fixa esses números — quem fixa é o responsável técnico.
   */
  coeficientesPadrao: { DIFERENTE: number | null; DESCOBERTA: number | null };
  /** Escopo do comum proporcional que não diz o seu. */
  escopoPadrao: EscopoNbr12721;
  /** Área da vaga vinculada em mm²; `null` = largura × comprimento desenhados. */
  areaDaVagaMm2: number | null;
  numeracao: HipotesesDeNumeracao;
  alocacoes: AlocacaoDoEstudo[];
}

export const HIPOTESES_NBR12721_PADRAO: HipotesesNbr12721 = {
  coeficientesPadrao: { DIFERENTE: null, DESCOBERTA: null },
  escopoPadrao: 'GLOBAL',
  areaDaVagaMm2: null,
  numeracao: HIPOTESES_DE_NUMERACAO_PADRAO,
  alocacoes: [],
};

const coeficienteOuNulo = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 10 ? v : null);

/** A coluna JSONB → hipóteses válidas. Chave estranha cai no padrão, nunca quebra a tela. */
export function hipotesesNbr12721DaColuna(json: unknown): HipotesesNbr12721 {
  const o = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const coef = (o.coeficientesPadrao && typeof o.coeficientesPadrao === 'object' ? o.coeficientesPadrao : {}) as Record<string, unknown>;
  const num = (o.numeracao && typeof o.numeracao === 'object' ? o.numeracao : {}) as Record<string, unknown>;
  const alocacoes = Array.isArray(o.alocacoes) ? o.alocacoes : [];
  return {
    coeficientesPadrao: { DIFERENTE: coeficienteOuNulo(coef.DIFERENTE), DESCOBERTA: coeficienteOuNulo(coef.DESCOBERTA) },
    escopoPadrao: o.escopoPadrao === 'BLOCO' ? 'BLOCO' : 'GLOBAL',
    areaDaVagaMm2: typeof o.areaDaVagaMm2 === 'number' && Number.isInteger(o.areaDaVagaMm2) && o.areaDaVagaMm2 > 0 ? o.areaDaVagaMm2 : null,
    numeracao: { regra: num.regra === 'PAVIMENTO_E_NUMERO' ? 'PAVIMENTO_E_NUMERO' : 'ANDAR_E_POSICAO' },
    alocacoes: alocacoes
      .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
      .map((a) => ({
        alvoUid: String(a.alvoUid ?? ''),
        unidadeChave: String(a.unidadeChave ?? ''),
        areaM2: typeof a.areaM2 === 'number' && a.areaM2 > 0 ? a.areaM2 : null,
        percentual: typeof a.percentual === 'number' && a.percentual > 0 && a.percentual <= 1 ? a.percentual : null,
      }))
      .filter((a) => a.alvoUid && a.unidadeChave && (a.areaM2 !== null || a.percentual !== null)),
  };
}

// ── sugestão de classificação ────────────────────────────────────────────────

/**
 * O que a Planta já sabe dizer sobre o ambiente, para a tela oferecer — nunca
 * gravado sozinho. Por etiqueta.
 */
export function classificacaoSugerida(model: BlueprintModel): Map<ElementUid, ClassificacaoNbr12721> {
  const daUnidade = new Set<ElementUid>();
  for (const u of model.unidades ?? []) for (const uid of u.etiquetaUids) daUnidade.add(uid);
  // As cópias vivas das etiquetas de unidade também são privativas (Fase 3).
  for (const copia of model.levels.filter((l) => l.tipoDeId !== undefined)) {
    for (const uid of [...daUnidade]) daUnidade.add(uidDaCopia(copia.uid, uid));
  }
  const acessorio = new Set<ElementUid>();
  for (const u of model.unidades ?? []) for (const a of u.acessorios ?? []) acessorio.add(a.uid);

  const descobertos = new Set<ObjectId>();
  for (const l of model.levels) {
    for (const e of exposicaoDoNivel(model, l.id)) if (e.teto.tipo === 'EXTERIOR') descobertos.add(e.spaceId);
  }
  const out = new Map<ElementUid, ClassificacaoNbr12721>();
  for (const label of model.labels ?? []) {
    const espaco = model.spaces.find((s) => s.labelUid === label.uid);
    const cobertura: CoberturaNbr12721 = espaco && descobertos.has(espaco.id) ? 'DESCOBERTA' : label.tipoDeAmbiente === 'VARANDA' ? 'DIFERENTE' : 'PADRAO';
    const privativo = daUnidade.has(label.uid) || acessorio.has(label.uid);
    out.set(label.uid, privativo ? { cobertura } : { cobertura, divisao: 'PROPORCIONAL' });
  }
  return out;
}

// ── a lista de classificação (tela) ─────────────────────────────────────────

/** Um ambiente que a tela de Áreas classifica: etiqueta desenhada ou ambiente declarado. */
export interface AmbienteParaClassificar {
  /** `etq:<id>` ou `dcl:<id>` — chave da linha e da seleção. */
  chave: string;
  tipo: 'ETIQUETA' | 'DECLARADO';
  /** id do kernel (labelId ou declaradoId). */
  id: ObjectId;
  uid: ElementUid;
  nome: string;
  levelId: ObjectId;
  pavimento: string;
  areaMm2: number;
  /** Número da unidade dona; `null` = comum (ou acessório). */
  unidade: string | null;
  /** Acessório vinculado de alguma unidade. */
  acessorioDe: string | null;
  classificacao: ClassificacaoNbr12721 | null;
  sugerida: ClassificacaoNbr12721;
  /** Quantos andares copiados repetem este ambiente (as cópias seguem a classificação daqui). */
  copias: number;
}

/**
 * As linhas da classificação. As etiquetas dos ANDARES COPIADOS ficam de fora:
 * a sincronização do pavimento tipo as reescreve a partir da origem, então
 * classificá-las direto seria desfeito na próxima edição — a classificação do
 * tipo vale para todas as cópias (e a coluna "Cópias" diz quantas).
 */
export function ambientesParaClassificar(model: BlueprintModel): AmbienteParaClassificar[] {
  const sugestoes = classificacaoSugerida(model);
  const nivel = new Map(model.levels.map((l) => [l.id, l] as const));
  const copias = new Map<ObjectId, number>();
  for (const l of model.levels) if (l.tipoDeId !== undefined) copias.set(l.tipoDeId, (copias.get(l.tipoDeId) ?? 0) + 1);
  const dona = new Map<ElementUid, string>();
  for (const u of model.unidades ?? []) for (const uid of u.etiquetaUids) dona.set(uid, u.numero);
  // Acessório de unidade de andar copiado (0.101.0): o número é o da DERIVADA ("201"), não o da origem.
  const numeroPorChave = new Map(unidadesDoPredio(model).unidades.map((u) => [u.chave, u.numero] as const));
  const acessorio = new Map<ElementUid, string>();
  for (const u of model.unidades ?? []) {
    for (const a of u.acessorios ?? []) acessorio.set(a.uid, (a.levelUid ? numeroPorChave.get(`${u.uid}:${a.levelUid}`) : undefined) ?? u.numero);
  }
  const numeroPorUid = new Map((model.unidades ?? []).map((u) => [u.uid, u.numero] as const));

  const linhas: AmbienteParaClassificar[] = [];
  for (const l of model.labels ?? []) {
    const n = nivel.get(l.levelId);
    if (!n || n.tipoDeId !== undefined) continue;
    const espaco = model.spaces.find((s) => s.labelUid === l.uid);
    linhas.push({
      chave: `etq:${l.id}`,
      tipo: 'ETIQUETA',
      id: l.id,
      uid: l.uid,
      nome: l.name,
      levelId: l.levelId,
      pavimento: n.name,
      areaMm2: espaco?.areaMm2 ?? 0,
      unidade: dona.get(l.uid) ?? null,
      acessorioDe: acessorio.get(l.uid) ?? null,
      classificacao: l.nbr12721 ?? null,
      sugerida: sugestoes.get(l.uid) ?? { cobertura: 'PADRAO' },
      copias: copias.get(l.levelId) ?? 0,
    });
  }
  for (const a of model.ambientesDeclarados ?? []) {
    const n = nivel.get(a.levelId);
    const unidade = a.unidadeUid ? (numeroPorUid.get(a.unidadeUid) ?? null) : null;
    linhas.push({
      chave: `dcl:${a.id}`,
      tipo: 'DECLARADO',
      id: a.id,
      uid: a.uid,
      nome: a.nome,
      levelId: a.levelId,
      pavimento: n?.name ?? '?',
      areaMm2: a.areaMm2,
      unidade,
      acessorioDe: acessorio.get(a.uid) ?? null,
      classificacao: a.nbr12721 ?? null,
      sugerida: unidade || acessorio.has(a.uid) ? { cobertura: 'PADRAO' } : { cobertura: 'PADRAO', divisao: 'PROPORCIONAL' },
      copias: n ? (copias.get(n.id) ?? 0) : 0,
    });
  }
  return linhas;
}

// ── acessórios (tela) ───────────────────────────────────────────────────────

/** Uma vaga, depósito ou área que pode ser acessório vinculado de uma unidade do prédio. */
export interface AcessorioParaVincular {
  /** uid da vaga, da etiqueta ou do ambiente declarado. */
  uid: ElementUid;
  tipo: 'VAGA' | 'AMBIENTE' | 'DECLARADO';
  nome: string;
  pavimento: string;
  areaMm2: number;
  /** `UnidadeDoPredio.chave` da dona; `null` = sem dona (fica dentro do ambiente que o contém / comum). */
  donaChave: string | null;
  donaNumero: string | null;
  afetaPrivativa: boolean;
  afetaCoeficiente: boolean;
}

/**
 * Os candidatos a acessório: toda vaga, todo ambiente declarado sem dona e
 * toda etiqueta que não é privativa de unidade (fora dos andares copiados —
 * a cópia segue o tipo). A dona pode ser qualquer unidade do PRÉDIO, inclusive
 * a de andar copiado (0.101.0).
 */
export function acessoriosParaVincular(model: BlueprintModel, hip: HipotesesNbr12721 = HIPOTESES_NBR12721_PADRAO): { linhas: AcessorioParaVincular[]; unidades: UnidadeDoPredio[] } {
  const { unidades } = unidadesDoPredio(model, hip.numeracao);
  const numeroPorChave = new Map(unidades.map((u) => [u.chave, u.numero] as const));
  const dona = new Map<ElementUid, { chave: string; afetaPrivativa: boolean; afetaCoeficiente: boolean }>();
  for (const u of model.unidades ?? []) {
    for (const a of u.acessorios ?? []) dona.set(a.uid, { chave: a.levelUid ? `${u.uid}:${a.levelUid}` : u.uid, afetaPrivativa: a.afetaPrivativa, afetaCoeficiente: a.afetaCoeficiente });
  }
  const privativa = new Set<ElementUid>();
  for (const u of unidades) for (const uid of u.etiquetaUids) privativa.add(uid);
  const nivel = new Map(model.levels.map((l) => [l.id, l] as const));
  const linha = (uid: ElementUid, tipo: AcessorioParaVincular['tipo'], nome: string, levelId: ObjectId, areaMm2: number): AcessorioParaVincular => {
    const d = dona.get(uid);
    return {
      uid,
      tipo,
      nome,
      pavimento: nivel.get(levelId)?.name ?? '?',
      areaMm2,
      donaChave: d?.chave ?? null,
      donaNumero: d ? (numeroPorChave.get(d.chave) ?? null) : null,
      afetaPrivativa: d?.afetaPrivativa ?? true,
      afetaCoeficiente: d?.afetaCoeficiente ?? true,
    };
  };
  const linhas: AcessorioParaVincular[] = [];
  for (const v of model.vagas ?? []) linhas.push(linha(v.uid, 'VAGA', `Vaga ${v.numero ?? ''}`.trim(), v.levelId, hip.areaDaVagaMm2 ?? v.larguraMm * v.comprimentoMm));
  for (const a of model.ambientesDeclarados ?? []) if (!a.unidadeUid) linhas.push(linha(a.uid, 'DECLARADO', a.nome, a.levelId, a.areaMm2));
  for (const l of model.labels ?? []) {
    if (privativa.has(l.uid) || nivel.get(l.levelId)?.tipoDeId !== undefined) continue;
    const espaco = model.spaces.find((s) => s.labelUid === l.uid);
    linhas.push(linha(l.uid, 'AMBIENTE', l.name, l.levelId, espaco?.areaMm2 ?? 0));
  }
  return { linhas, unidades };
}

/**
 * Os comandos que fazem `acessorioUid` passar a ser da unidade `donaChave`
 * (`null` = de ninguém): tira da dona anterior e põe na nova — que, se for de
 * andar copiado, é a ORIGEM com o `levelUid` daquele andar. Um lote só.
 */
export function comandosDoAcessorio(
  model: BlueprintModel,
  acessorioUid: ElementUid,
  donaChave: string | null,
  flags: { afetaPrivativa: boolean; afetaCoeficiente: boolean },
): Command[] {
  const separar = (chave: string) => {
    const [origemUid, levelUid] = chave.split(':');
    return { origem: (model.unidades ?? []).find((u) => u.uid === origemUid), levelUid: levelUid || undefined };
  };
  const novas = new Map<ObjectId, AcessorioDaUnidade[]>();
  const listaDe = (u: { id: ObjectId; acessorios?: AcessorioDaUnidade[] }) => novas.get(u.id) ?? (u.acessorios ?? []).map((a) => ({ ...a }));
  for (const u of model.unidades ?? []) {
    if ((u.acessorios ?? []).some((a) => a.uid === acessorioUid)) novas.set(u.id, listaDe(u).filter((a) => a.uid !== acessorioUid));
  }
  if (donaChave) {
    const { origem, levelUid } = separar(donaChave);
    if (!origem) throw new Error(`Unidade inexistente: ${donaChave}`);
    novas.set(origem.id, [...listaDe(origem), { uid: acessorioUid, ...flags, ...(levelUid ? { levelUid } : {}) }]);
  }
  return [...novas].map(([unidadeId, acessorios]) => ({ type: 'SetAcessoriosDaUnidade', unidadeId, acessorios }) as Command);
}

// ── planilha de ambientes declarados ────────────────────────────────────────

/** As colunas que a importação lê — e que o modelo de planilha da tela traz no cabeçalho. */
export const COLUNAS_DA_PLANILHA_DE_DECLARADOS = ['Pavimento', 'Ambiente', 'Área (m²)', 'Unidade', 'Cobertura', 'Coeficiente', 'Divisão'] as const;

const semAcento = (t: unknown) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

/**
 * Linhas da planilha → comandos `AddAmbienteDeclarado`. Pavimento casa pelo NOME
 * e unidade pelo NÚMERO (sem caixa nem acento); o que não casa vira erro DA
 * LINHA, nunca palpite. Área em m² com vírgula ou ponto. Cobertura: "padrão",
 * "diferente" ou "descoberta" (vazio = padrão); divisão (só sem unidade):
 * "proporcional" ou "não proporcional".
 */
export function comandosDaPlanilhaDeDeclarados(model: BlueprintModel, linhas: Record<string, unknown>[]): { comandos: Command[]; erros: string[] } {
  const comandos: Command[] = [];
  const erros: string[] = [];
  const nivelPorNome = new Map(model.levels.map((l) => [semAcento(l.name), l.id] as const));
  const unidadePorNumero = new Map((model.unidades ?? []).map((u) => [semAcento(u.numero), u.id] as const));
  const campo = (l: Record<string, unknown>, nome: string) => {
    const chave = Object.keys(l).find((k) => semAcento(k) === semAcento(nome));
    return chave === undefined ? undefined : l[chave];
  };
  linhas.forEach((l, i) => {
    const n = i + 2; // linha 1 é o cabeçalho
    const nome = String(campo(l, 'Ambiente') ?? '').trim();
    if (!nome && !campo(l, 'Área (m²)') && !campo(l, 'Pavimento')) return; // linha em branco
    const nivel = nivelPorNome.get(semAcento(campo(l, 'Pavimento')));
    const areaTexto = String(campo(l, 'Área (m²)') ?? '').replace(/\./g, (m, off, s: string) => (s.includes(',') ? '' : m)).replace(',', '.');
    const area = Number(areaTexto);
    const unidadeTexto = String(campo(l, 'Unidade') ?? '').trim();
    const unidadeId = unidadeTexto ? unidadePorNumero.get(semAcento(unidadeTexto)) : null;
    const cob = semAcento(campo(l, 'Cobertura'));
    const cobertura: CoberturaNbr12721 | null = !cob || cob.startsWith('padr') ? 'PADRAO' : cob.startsWith('dif') ? 'DIFERENTE' : cob.startsWith('desc') ? 'DESCOBERTA' : null;
    const coefTexto = String(campo(l, 'Coeficiente') ?? '').trim();
    const coeficiente = coefTexto ? Number(coefTexto.replace(',', '.')) : null;
    const div = semAcento(campo(l, 'Divisão'));
    const divisao = !div || div.startsWith('prop') ? 'PROPORCIONAL' : div.startsWith('nao') || div.startsWith('não') ? 'NAO_PROPORCIONAL' : null;
    const problemas: string[] = [];
    if (!nome) problemas.push('sem nome do ambiente');
    if (!nivel) problemas.push(`pavimento "${String(campo(l, 'Pavimento') ?? '')}" não existe no estudo`);
    if (!(Number.isFinite(area) && area > 0)) problemas.push(`área "${String(campo(l, 'Área (m²)') ?? '')}" inválida`);
    if (unidadeTexto && !unidadeId) problemas.push(`unidade "${unidadeTexto}" não existe no estudo`);
    if (!cobertura) problemas.push(`cobertura "${String(campo(l, 'Cobertura'))}" desconhecida (padrão, diferente ou descoberta)`);
    if (coeficiente !== null && !(Number.isFinite(coeficiente) && coeficiente > 0 && coeficiente <= 10)) problemas.push(`coeficiente "${coefTexto}" fora de (0, 10]`);
    if (!unidadeId && !divisao) problemas.push(`divisão "${String(campo(l, 'Divisão'))}" desconhecida (proporcional ou não proporcional)`);
    if (problemas.length) {
      erros.push(`Linha ${n}: ${problemas.join('; ')}.`);
      return;
    }
    comandos.push({
      type: 'AddAmbienteDeclarado',
      levelId: nivel!,
      nome,
      areaMm2: Math.round(area * 1_000_000),
      ...(unidadeId ? { unidadeId } : {}),
      nbr12721: {
        cobertura: cobertura!,
        ...(coeficiente !== null ? { coeficiente } : {}),
        ...(unidadeId ? {} : { divisao: divisao! }),
      },
    });
  });
  return { comandos, erros };
}

// ── congelamento na versão publicada (Fase 7) ───────────────────────────────

export interface QuadroCongelado {
  entrada: EntradaNbr12721;
  saida: SaidaNbr12721;
  /** sha256 da saída em JSON estável — é o que a aprovação cita. */
  hash: string;
  versaoMotor: string;
  /**
   * Código da unidade no motor ↔ chave da unidade do prédio ↔ número (Fase 9):
   * é por aqui que a fração ("101 [2]") volta à unidade certa do Empreendimento.
   * Fora do hash — o hash é dos quadros, e é ele que as aprovações citam.
   */
  unidades: UnidadeCongelada[];
}

export interface UnidadeCongelada {
  codigo: string;
  /** `UnidadeDoPredio.chave` — "<uid>" ou "<uid>:<levelUid>" do andar copiado. */
  chave: string;
  numero: string;
}

/**
 * O que vai para `blueprint_snapshot_nbr12721` ao publicar. `null` quando o
 * estudo não tem unidade nem ambiente declarado: não há quadro de incorporação
 * a congelar (uma casa térrea sem unidades não ganha linha vazia).
 */
export function congelamentoNbr12721(model: BlueprintModel, hip: HipotesesNbr12721): QuadroCongelado | null {
  if (!(model.unidades ?? []).length && !(model.ambientesDeclarados ?? []).length) return null;
  const { entrada, chavePorCodigo } = entradaDoEstudo(model, hip);
  const saida = calcularNbr12721(entrada);
  const numeroPorChave = new Map(unidadesDoPredio(model, hip.numeracao).unidades.map((u) => [u.chave, u.numero] as const));
  const unidades = [...chavePorCodigo].map(([codigo, chave]) => ({ codigo, chave, numero: numeroPorChave.get(chave) ?? codigo }));
  return { entrada, saida, hash: sha256(stableStringify(saida)), versaoMotor: VERSAO_DO_MOTOR_NBR12721, unidades };
}

// ── a entrada do motor ───────────────────────────────────────────────────────

export interface EntradaDoEstudo {
  entrada: EntradaNbr12721;
  /** Código da unidade no motor → chave da unidade do prédio (para devolver a fração). */
  chavePorCodigo: Map<string, string>;
  /** Nomes dos ambientes que entraram pela sugestão — a tela pede confirmação. */
  aClassificar: string[];
  avisos: string[];
}

const GERAL = 'GERAL';
const mm2 = (v: number) => v / 1_000_000;

export function entradaDoEstudo(model: BlueprintModel, hip: HipotesesNbr12721 = HIPOTESES_NBR12721_PADRAO): EntradaDoEstudo {
  const avisos: string[] = [];
  const aClassificar: string[] = [];
  const predio = unidadesDoPredio(model, hip.numeracao);
  avisos.push(...predio.avisos);

  // ── blocos: o pavimento tipo de um Bloco de massa e as cópias dele; o resto é "Geral".
  const blocoDoNivel = new Map<ObjectId, string>();
  for (const b of model.blocos ?? []) {
    const tipo = model.levels.find((l) => l.uid === uidDoPavimentoTipo(b));
    if (!tipo) continue;
    blocoDoNivel.set(tipo.id, b.uid);
    for (const l of model.levels) if (l.tipoDeId === tipo.id) blocoDoNivel.set(l.id, b.uid);
  }
  const bloco = (levelId: ObjectId) => blocoDoNivel.get(levelId) ?? GERAL;
  const niveisPorCota = [...model.levels].sort((a, b) => a.elevationMm - b.elevationMm);
  const usados = new Set(niveisPorCota.map((l) => bloco(l.id)));
  const blocos = [
    ...(model.blocos ?? []).filter((b) => usados.has(b.uid)).map((b, i) => ({ codigo: b.uid, nome: b.nome, ordem: i + 1 })),
    ...(usados.has(GERAL) ? [{ codigo: GERAL, nome: 'Edificação', ordem: (model.blocos ?? []).length + 1 }] : []),
  ];
  const pavimentos = niveisPorCota.map((l, i) => ({ codigo: l.id, bloco: bloco(l.id), nome: l.name, ordem: i + 1 }));

  // ── unidades do prédio, com código único (o número; repetido ganha sufixo — Fase 3 já avisou).
  const codigoPorChave = new Map<string, string>();
  const vistos = new Map<string, number>();
  const unidadesNbr = predio.unidades.map((u) => {
    const n = (vistos.get(u.numero) ?? 0) + 1;
    vistos.set(u.numero, n);
    const codigo = n === 1 ? u.numero : `${u.numero} [${n}]`;
    codigoPorChave.set(u.chave, codigo);
    const nivel = u.levelId ?? u.medida.levelIds[0] ?? null;
    return { codigo, bloco: nivel ? bloco(nivel) : GERAL, autonoma: true, ativa: true };
  });
  const donaDaEtiqueta = new Map<ElementUid, UnidadeDoPredio>();
  for (const u of predio.unidades) for (const uid of u.etiquetaUids) donaDaEtiqueta.set(uid, u);

  // Acessórios vinculados: da unidade de origem, ou (0.101.0, `levelUid`) da derivada do andar copiado.
  const acessorioDe = new Map<ElementUid, { unidade: string; afetaPrivativa: boolean; afetaCoeficiente: boolean }>();
  for (const u of model.unidades ?? []) {
    for (const a of u.acessorios ?? []) {
      const unidade = codigoPorChave.get(a.levelUid ? `${u.uid}:${a.levelUid}` : u.uid);
      if (!unidade) {
        avisos.push(`Acessório da unidade ${u.numero} num andar copiado em que ela não existe — ignorado.`);
        continue;
      }
      acessorioDe.set(a.uid, { unidade, afetaPrivativa: a.afetaPrivativa, afetaCoeficiente: a.afetaCoeficiente });
    }
  }

  const sugestoes = classificacaoSugerida(model);
  const espacos: EspacoNbr[] = [];
  const copia = new Set(model.levels.filter((l) => l.tipoDeId !== undefined).map((l) => l.id));
  const efetiva = (nome: string, propria: ClassificacaoNbr12721 | undefined, sugerida: ClassificacaoNbr12721 | undefined, privativo: boolean, levelId?: ObjectId): ClassificacaoNbr12721 => {
    if (propria) return propria;
    // A etiqueta do andar COPIADO segue a do tipo: listá-la contaria o mesmo ambiente N vezes.
    if (!(levelId && copia.has(levelId))) aClassificar.push(nome);
    return sugerida ?? (privativo ? { cobertura: 'PADRAO' } : { cobertura: 'PADRAO', divisao: 'PROPORCIONAL' });
  };
  const coeficiente = (c: ClassificacaoNbr12721) => c.coeficiente ?? (c.cobertura === 'PADRAO' ? null : hip.coeficientesPadrao[c.cobertura]);
  const espaco = (
    codigo: string,
    nome: string,
    levelId: ObjectId,
    areaMm2: number,
    c: ClassificacaoNbr12721,
    dona: string | null,
    acessorio: boolean,
  ): EspacoNbr => {
    const privativo = dona !== null || acessorio;
    return {
      codigo,
      nome,
      bloco: bloco(levelId),
      pavimento: levelId,
      unidade: acessorio ? null : dona,
      uso: privativo ? 'PRIVATIVO' : 'COMUM',
      natureza: privativo ? (c.natureza === 'ACESSORIA' ? 'ACESSORIA' : 'PRINCIPAL') : null,
      cobertura: c.cobertura,
      divisao: privativo ? null : (c.divisao ?? null),
      contabilizacao: acessorio ? 'ACESSORIO_VINCULADO' : privativo ? 'UNIDADE' : 'COMUM',
      areaRealM2: mm2(areaMm2),
      coeficiente: coeficiente(c),
    };
  };
  const escopos: EntradaNbr12721['escopos'] = [];
  const escopoDe = (e: EspacoNbr, c: ClassificacaoNbr12721) => {
    if (e.uso !== 'COMUM' || e.divisao !== 'PROPORCIONAL') return;
    const escopo = c.escopo ?? hip.escopoPadrao;
    escopos.push({ espaco: e.codigo, escopo, bloco: escopo === 'BLOCO' ? e.bloco : null });
  };

  // ── vagas vinculadas: saem do ambiente que as contém.
  const labelPorUid = new Map((model.labels ?? []).map((l) => [l.uid, l] as const));
  const descontoDoAmbiente = new Map<ObjectId, number>();
  const vagasVinculadas: { uid: ElementUid; levelId: ObjectId; areaMm2: number; c: ClassificacaoNbr12721 }[] = [];
  for (const v of model.vagas ?? []) {
    if (!acessorioDe.has(v.uid)) continue;
    const area = hip.areaDaVagaMm2 ?? v.larguraMm * v.comprimentoMm;
    const dentro = model.spaces.find((s) => s.levelId === v.levelId && pointInPolygon(s.ring, v.at));
    let c: ClassificacaoNbr12721 = { cobertura: 'DIFERENTE' };
    if (dentro) {
      descontoDoAmbiente.set(dentro.id, (descontoDoAmbiente.get(dentro.id) ?? 0) + area);
      const lbl = dentro.labelUid ? labelPorUid.get(dentro.labelUid) : undefined;
      c = (lbl?.nbr12721 ?? (lbl ? sugestoes.get(lbl.uid) : undefined) ?? c);
      c = { cobertura: c.cobertura, ...(c.coeficiente != null ? { coeficiente: c.coeficiente } : {}) };
    } else {
      avisos.push(`Vaga ${v.numero ?? v.id} vinculada fora de qualquer ambiente: entrou como coberta de padrão diferente.`);
    }
    vagasVinculadas.push({ uid: v.uid, levelId: v.levelId, areaMm2: area, c });
  }

  // ── ambientes desenhados.
  const somaPorNivel = new Map<ObjectId, number>();
  const somar = (levelId: ObjectId, a: number) => somaPorNivel.set(levelId, (somaPorNivel.get(levelId) ?? 0) + a);
  for (const s of model.spaces) {
    const label: SpaceLabel | undefined = s.labelUid ? labelPorUid.get(s.labelUid) : undefined;
    const nome = label?.name ?? 'Ambiente sem nome';
    const dona = s.labelUid ? donaDaEtiqueta.get(s.labelUid) : undefined;
    const vinculo = s.labelUid ? acessorioDe.get(s.labelUid) : undefined;
    const c = efetiva(`${nome} (${model.levels.find((l) => l.id === s.levelId)?.name ?? ''})`, label?.nbr12721, label ? sugestoes.get(label.uid) : undefined, !!dona || !!vinculo, s.levelId);
    const desconto = descontoDoAmbiente.get(s.id) ?? 0;
    somar(s.levelId, s.areaMm2);
    const area = s.areaMm2 - desconto;
    if (area <= 0) {
      if (desconto > 0) avisos.push(`${nome}: as vagas vinculadas ocupam o ambiente inteiro — ele não entra.`);
      continue;
    }
    const e = espaco(s.labelUid ?? `amb:${s.id}`, nome, s.levelId, area, c, dona ? codigoPorChave.get(dona.chave)! : null, !!vinculo);
    espacos.push(e);
    escopoDe(e, c);
  }
  for (const v of vagasVinculadas) {
    espacos.push(espaco(`vaga:${v.uid}`, `Vaga ${model.vagas.find((x) => x.uid === v.uid)?.numero ?? ''}`.trim(), v.levelId, v.areaMm2, v.c, null, true));
  }

  // ── metade das paredes externas de cada unidade, por pavimento.
  const paredePorId = new Map(model.walls.map((w) => [w.id, w]));
  for (const u of predio.unidades) {
    const porNivel = new Map<ObjectId, number>();
    for (const p of u.medida.paredes) {
      if (p.lado !== 'EXTERNA') continue;
      const w = paredePorId.get(p.wallId);
      if (!w) continue;
      porNivel.set(w.levelId, (porNivel.get(w.levelId) ?? 0) + (p.comprimentoMm * p.espessuraMm) / 2);
    }
    for (const [levelId, area] of porNivel) {
      const a = Math.round(area);
      if (a <= 0) continue;
      somar(levelId, a);
      espacos.push(espaco(`paredes:${u.chave}:${levelId}`, `Paredes externas — ${u.numero}`, levelId, a, { cobertura: 'PADRAO' }, codigoPorChave.get(u.chave)!, false));
    }
  }

  // ── ambientes declarados (e as cópias deles nos andares copiados do tipo).
  const copiasDe = new Map<ObjectId, Level[]>();
  for (const l of model.levels) if (l.tipoDeId !== undefined) copiasDe.set(l.tipoDeId, [...(copiasDe.get(l.tipoDeId) ?? []), l]);
  const derivadaNoAndar = (origemUid: ElementUid, levelId: ObjectId) =>
    predio.unidades.find((u) => u.derivada && u.origem.uid === origemUid && u.levelId === levelId);
  for (const a of model.ambientesDeclarados ?? []) {
    const origem = a.unidadeUid ? predio.unidades.find((u) => !u.derivada && u.origem.uid === a.unidadeUid) : undefined;
    const vinculo = acessorioDe.get(a.uid);
    const c = efetiva(a.nome, a.nbr12721, undefined, !!origem || !!vinculo);
    const e = espaco(`dcl:${a.uid}`, a.nome, a.levelId, a.areaMm2, c, origem ? codigoPorChave.get(origem.chave)! : null, !!vinculo);
    espacos.push(e);
    escopoDe(e, c);
    for (const copia of copiasDe.get(a.levelId) ?? []) {
      // Acessório vinculado é de UMA unidade: não se replica.
      if (vinculo) continue;
      const dona = origem ? derivadaNoAndar(origem.origem.uid, copia.id) : undefined;
      const ec = espaco(`dcl:${a.uid}:${copia.uid}`, a.nome, copia.id, a.areaMm2, c, dona ? codigoPorChave.get(dona.chave)! : null, false);
      espacos.push(ec);
      escopoDe(ec, c);
    }
  }

  // ── o resto da área construída de cada pavimento.
  for (const l of model.levels) {
    if (!model.walls.some((w) => w.levelId === l.id)) continue;
    const resto = Math.round(areaConstruidaMm2(model, l) - (somaPorNivel.get(l.id) ?? 0));
    if (resto < 0) {
      avisos.push(`${l.name}: os ambientes somam ${(mm2(-resto)).toFixed(2)} m² além da área construída — confira o desenho.`);
      continue;
    }
    if (resto < 1_000) continue; // menos de 0,001 m²: arredondamento, não parede
    const e = espaco(`resto:${l.id}`, `Paredes e circulação — ${l.name}`, l.id, resto, { cobertura: 'PADRAO', divisao: 'PROPORCIONAL' }, null, false);
    espacos.push(e);
    escopoDe(e, { cobertura: 'PADRAO', divisao: 'PROPORCIONAL' });
  }

  // ── vínculos e alocações.
  const codigos = new Set(espacos.map((e) => e.codigo));
  const vinculos: EntradaNbr12721['vinculos'] = [];
  for (const [uid, v] of acessorioDe) {
    const codigo = codigos.has(uid) ? uid : codigos.has(`vaga:${uid}`) ? `vaga:${uid}` : codigos.has(`dcl:${uid}`) ? `dcl:${uid}` : null;
    if (codigo) vinculos.push({ unidade: v.unidade, espaco: codigo, afetaPrivativa: v.afetaPrivativa, afetaCoeficiente: v.afetaCoeficiente });
  }
  const alocacoes: EntradaNbr12721['alocacoes'] = [];
  for (const a of hip.alocacoes) {
    const espacoCodigo = codigos.has(a.alvoUid) ? a.alvoUid : codigos.has(`dcl:${a.alvoUid}`) ? `dcl:${a.alvoUid}` : null;
    const unidade = codigoPorChave.get(a.unidadeChave);
    if (!espacoCodigo || !unidade) {
      avisos.push('Rateio não proporcional que aponta para ambiente ou unidade que não existe mais — ignorado.');
      continue;
    }
    alocacoes.push({ espaco: espacoCodigo, unidade, areaRealM2: a.areaM2, areaEquivalenteM2: null, percentual: a.percentual });
  }
  const rateados = new Set(alocacoes.map((a) => a.espaco));
  for (const e of espacos) {
    if (e.uso === 'COMUM' && e.divisao === 'NAO_PROPORCIONAL' && !rateados.has(e.codigo)) {
      avisos.push(`${e.nome}: comum não proporcional sem rateio — entra no Quadro I e não é distribuído a nenhuma unidade.`);
    }
  }

  const chavePorCodigo = new Map([...codigoPorChave].map(([chave, codigo]) => [codigo, chave] as const));
  return {
    entrada: { blocos, pavimentos, unidades: unidadesNbr, espacos, vinculos, alocacoes, escopos },
    chavePorCodigo,
    aClassificar,
    avisos,
  };
}
