/**
 * INCÊNDIO — classificação da edificação e medidas exigidas (30/09/2026, roadmap
 * `docs/planos/2026-09-29-incendio-benchmark-altoqi-e-roadmap.md`, E0.2/E0.3).
 *
 * O "motor 1" da proposta do usuário: ocupação + altura + área + carga de
 * incêndio → as MEDIDAS DE SEGURANÇA que o Corpo de Bombeiros exige. Puro: lê
 * o desenho e as premissas do estudo, não grava nada.
 *
 * ⚠️ NORMA. O preset é o de MINAS GERAIS, escolhido pelo usuário. Desde a D1 (01/10/2026)
 * vem do TEXTO das ITs do CBMMG fornecido pelo usuário, conferido página a página:
 *  - as exigências: IT 01 (10ª ed., Portaria 84/2026), Anexo A, Tabelas 1 a 18
 *    (`blueprintIncendioTabelasMG.ts` + `blueprintIncendioExigenciasMG.ts`);
 *  - os tipos por altura: IT 08, Tabela 1; o risco pela carga: IT 09, item 5.10;
 *    a carga do grupo A: IT 09, Tabela A.1.
 *  - onde o texto não cobre (divisão fora das tabelas, Tabela 17 sem grade, G-3 acima de
 *    12 m), o resultado é `SEM_TABELA` — nunca "exigida" nem "dispensada" por palpite;
 *  - onde a nota depende do que o desenho não sabe (população, condomínio com arruamento
 *    interno), o resultado é `CONDICIONAL`, com a condição escrita;
 *  - `rascunho: true` sobra só para o que vier de memória (nenhuma linha de MG hoje).
 *
 * A ALTURA aqui é a do regulamento de incêndio: do piso do pavimento de
 * DESCARGA ao piso do último pavimento ocupado. Não é a `altura` das regras de
 * zoneamento (`blueprintRegras.ts`, topo do pavimento mais alto) — outra coisa,
 * por isso o nome `alturaParaIncendioM`.
 */
import { areaConstruidaMm2, type BlueprintModel, type Level } from './blueprintKernel';
import { usoDoNome } from './blueprintPrograma';
import { HIPOTESES_HIDRAULICAS_INCENDIO_PADRAO, hipotesesHidraulicasDaColuna, type HipotesesHidraulicasDeIncendio } from './blueprintCalculoIncendio';
import { HIPOTESES_REDE_DE_HIDRANTES_PADRAO, hipotesesDaRedeDaColuna, type HipotesesDaRedeDeHidrantes } from './blueprintRedeDeHidrantes';
import { HIPOTESES_BOMBEAMENTO_PADRAO, hipotesesDoBombeamentoDaColuna, type HipotesesDoBombeamento } from './blueprintBombeamentoIncendio';
import { HIPOTESES_SPRINKLERS_PADRAO, hipotesesDeSprinklersDaColuna, type HipotesesDeSprinklers } from './blueprintSprinklersIncendio';
import { HIPOTESES_SAIDAS_PADRAO, hipotesesDeSaidasDaColuna, type HipotesesDeSaidas } from './blueprintSaidasIncendio';
import { HIPOTESES_EXTINTORES_PADRAO, hipotesesDeExtintoresDaColuna, type HipotesesDeExtintores } from './blueprintExtintores';
import { HIPOTESES_ILUMINACAO_PADRAO, hipotesesDeIluminacaoDaColuna, type HipotesesDeIluminacao } from './blueprintIluminacaoEmergencia';
import { exigenciaMG } from './blueprintIncendioExigenciasMG';
import { FONTE_IT01_MG } from './blueprintIncendioTabelasMG';

// ─── Presets de Corpo de Bombeiros ───────────────────────────────────────────

export const PRESETS_DE_BOMBEIROS = ['MG_CBMMG', 'SP_CBPMESP', 'BA_CBMBA', 'PR_CBMPR', 'MT_CBMMT', 'RJ_CBMERJ'] as const;
export type PresetDeBombeiros = (typeof PRESETS_DE_BOMBEIROS)[number];

export const ROTULO_DO_PRESET: Record<PresetDeBombeiros, string> = {
  MG_CBMMG: 'Minas Gerais — CBMMG',
  SP_CBPMESP: 'São Paulo — CBPMESP',
  BA_CBMBA: 'Bahia — CBMBA',
  PR_CBMPR: 'Paraná — CBMPR',
  MT_CBMMT: 'Mato Grosso — CBMMT',
  RJ_CBMERJ: 'Rio de Janeiro — CBMERJ',
};

/** Só MG tem tabela (D1: texto do CBMMG). Os outros existem com nome e sem números — decisão do usuário (30/09/2026). */
export const PRESETS_COM_TABELA: readonly PresetDeBombeiros[] = ['MG_CBMMG'];

export const FONTE_MG = FONTE_IT01_MG;

// ─── Ocupação ────────────────────────────────────────────────────────────────

/** Os grupos de ocupação — os títulos das Tabelas 1 a 18 do Anexo A da IT 01 do CBMMG. */
export const GRUPOS_DE_OCUPACAO = [
  { grupo: 'A', nome: 'Residencial' },
  { grupo: 'B', nome: 'Serviço de hospedagem' },
  { grupo: 'C', nome: 'Comercial' },
  { grupo: 'D', nome: 'Serviço profissional' },
  { grupo: 'E', nome: 'Educacional e cultura física' },
  { grupo: 'F', nome: 'Local de reunião de público' },
  { grupo: 'G', nome: 'Serviço automotivo e assemelhados' },
  { grupo: 'H', nome: 'Serviço de saúde e institucional' },
  { grupo: 'I', nome: 'Indústria' },
  { grupo: 'J', nome: 'Depósito' },
  { grupo: 'L', nome: 'Explosivos' },
  { grupo: 'M', nome: 'Especial' },
] as const;

/**
 * As divisões com a carga de incêndio específica (MJ/m²) transcrita da IT 09, Tabela A.1:
 * só o grupo A — casas (A-1), edifícios de apartamentos (A-2), alojamentos, internatos e
 * pensionatos (A-3), todos 300 MJ/m². As demais divisões podem ser DECLARADAS ("C-2"), mas a
 * carga delas tem de ser declarada também (a Tabela A.1 vai por ATIVIDADE, não por divisão).
 */
export const DIVISOES_TRANSCRITAS: Record<string, { nome: string; cargaMJm2: number }> = {
  'A-1': { nome: 'Habitação unifamiliar', cargaMJm2: 300 },
  'A-2': { nome: 'Habitação multifamiliar', cargaMJm2: 300 },
  'A-3': { nome: 'Habitação coletiva', cargaMJm2: 300 },
};

const DIVISAO_VALIDA = /^[A-M]-\d{1,2}$/;

/** A divisão normalizada ("a2" → "A-2"), ou `null` se não parece uma divisão. */
export function normalizarDivisao(texto: string | null | undefined): string | null {
  const t = (texto ?? '').trim().toUpperCase().replace(/\s+/g, '');
  const m = /^([A-M])-?(\d{1,2})$/.exec(t);
  if (!m) return null;
  const d = `${m[1]}-${Number(m[2])}`;
  return DIVISAO_VALIDA.test(d) ? d : null;
}

// ─── Faixas de altura e níveis de carga ──────────────────────────────────────

/** Tipo da edificação pela altura (m) — IT 08 do CBMMG, Tabela 1 (as mesmas faixas das colunas da IT 01). */
export const FAIXAS_DE_ALTURA = [
  { tipo: 'I', nome: 'Edificação baixa', ateM: 12 },
  { tipo: 'II', nome: 'Edificação de média altura', ateM: 30 },
  { tipo: 'III', nome: 'Edificação mediamente alta', ateM: 54 },
  { tipo: 'IV', nome: 'Edificação alta', ateM: Infinity },
] as const;
export type TipoPorAltura = (typeof FAIXAS_DE_ALTURA)[number]['tipo'];

export function tipoPorAltura(alturaM: number): (typeof FAIXAS_DE_ALTURA)[number] {
  return FAIXAS_DE_ALTURA.find((f) => alturaM <= f.ateM + 1e-9) ?? FAIXAS_DE_ALTURA[FAIXAS_DE_ALTURA.length - 1];
}

/** Nível de risco pela carga de incêndio (MJ/m²) — IT 09 do CBMMG, item 5.10. */
export type NivelDeCarga = 'BAIXA' | 'MEDIA' | 'ALTA';
export function nivelDeCarga(q: number): NivelDeCarga {
  return q <= 300 ? 'BAIXA' : q <= 1200 ? 'MEDIA' : 'ALTA';
}

// ─── Premissas do estudo ─────────────────────────────────────────────────────

export interface HipotesesDeClassificacao {
  preset: PresetDeBombeiros;
  /** Divisão DECLARADA ("A-2"). `null` = usar a sugerida pelos ambientes. */
  divisao: string | null;
  /** Altura declarada (m). `null` = derivada dos pavimentos. */
  alturaDeclaradaM: number | null;
  /** O pavimento de DESCARGA. `null` = o de cota mais próxima de zero. */
  pisoDeDescargaLevelId: string | null;
  /** Carga de incêndio declarada (MJ/m²). `null` = a da tabela da divisão. */
  cargaDeclaradaMJm2: number | null;
}

/** As premissas de incêndio do estudo (`blueprint_study_incendio.hipoteses`). Cresce por grupo a cada etapa. */
export interface HipotesesIncendio {
  classificacao: HipotesesDeClassificacao;
  /** E2.3 (30/09/2026): fórmula, simultaneidade, vazões/pressões mínimas, mangueira, limites. */
  hidraulica: HipotesesHidraulicasDeIncendio;
  /** E3.1 (30/09/2026): cota do ramal, raio da coluna e DN de partida da rede automática. */
  rede: HipotesesDaRedeDeHidrantes;
  /** E4.2 (01/10/2026): altitude e perda na sucção, para o NPSH disponível. */
  bombeamento: HipotesesDoBombeamento;
  /** E5.1 (01/10/2026): risco e, se declarados, densidade, área de operação e área por sprinkler. */
  sprinklers: HipotesesDeSprinklers;
  /** E6.1 (01/10/2026): pessoas por dormitório e m² por pessoa declarados. */
  saidas: HipotesesDeSaidas;
  /** E7.1 (01/10/2026): distância máxima declarada e o extintor da proposta. */
  extintores: HipotesesDeExtintores;
  /** E7.3 (01/10/2026): o espaçamento máximo declarado das luminárias de emergência. */
  iluminacao: HipotesesDeIluminacao;
}

export const HIPOTESES_INCENDIO_PADRAO: HipotesesIncendio = {
  classificacao: { preset: 'MG_CBMMG', divisao: null, alturaDeclaradaM: null, pisoDeDescargaLevelId: null, cargaDeclaradaMJm2: null },
  hidraulica: HIPOTESES_HIDRAULICAS_INCENDIO_PADRAO,
  rede: HIPOTESES_REDE_DE_HIDRANTES_PADRAO,
  bombeamento: HIPOTESES_BOMBEAMENTO_PADRAO,
  sprinklers: HIPOTESES_SPRINKLERS_PADRAO,
  saidas: HIPOTESES_SAIDAS_PADRAO,
  extintores: HIPOTESES_EXTINTORES_PADRAO,
  iluminacao: HIPOTESES_ILUMINACAO_PADRAO,
};

const numeroOuNulo = (x: unknown, min: number): number | null => (typeof x === 'number' && Number.isFinite(x) && x >= min ? x : null);

/** O JSON gravado, completado com o padrão. Valor de tipo errado vira o padrão; nada estranho passa. */
export function hipotesesIncendioDaColuna(raw: unknown): HipotesesIncendio {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const c = (r.classificacao && typeof r.classificacao === 'object' ? r.classificacao : {}) as Record<string, unknown>;
  const padrao = HIPOTESES_INCENDIO_PADRAO.classificacao;
  return {
    classificacao: {
      preset: (PRESETS_DE_BOMBEIROS as readonly unknown[]).includes(c.preset) ? (c.preset as PresetDeBombeiros) : padrao.preset,
      divisao: typeof c.divisao === 'string' ? normalizarDivisao(c.divisao) : null,
      alturaDeclaradaM: numeroOuNulo(c.alturaDeclaradaM, 0),
      pisoDeDescargaLevelId: typeof c.pisoDeDescargaLevelId === 'string' && c.pisoDeDescargaLevelId ? c.pisoDeDescargaLevelId : null,
      cargaDeclaradaMJm2: numeroOuNulo(c.cargaDeclaradaMJm2, 0),
    },
    hidraulica: hipotesesHidraulicasDaColuna(r.hidraulica),
    rede: hipotesesDaRedeDaColuna(r.rede),
    bombeamento: hipotesesDoBombeamentoDaColuna(r.bombeamento),
    sprinklers: hipotesesDeSprinklersDaColuna(r.sprinklers),
    saidas: hipotesesDeSaidasDaColuna(r.saidas),
    extintores: hipotesesDeExtintoresDaColuna(r.extintores),
    iluminacao: hipotesesDeIluminacaoDaColuna(r.iluminacao),
  };
}

// ─── Classificação ───────────────────────────────────────────────────────────

export type Origem = 'DECLARADA' | 'SUGERIDA' | 'DERIVADA' | 'TABELA' | 'SEM';

export interface ClassificacaoDaEdificacao {
  preset: PresetDeBombeiros;
  divisao: { valor: string | null; origem: Origem; motivo: string };
  grupo: { grupo: string; nome: string } | null;
  altura: { valorM: number; origem: Origem; descarga: string | null; ultimo: string | null };
  tipoPorAltura: (typeof FAIXAS_DE_ALTURA)[number];
  areaTotalM2: number;
  areaPorPavimento: { levelId: string; nome: string; areaM2: number }[];
  pavimentos: number;
  unidades: number;
  carga: { valorMJm2: number | null; origem: Origem; nivel: NivelDeCarga | null };
  /** O que falta para a classificação fechar, em frases. */
  pendencias: string[];
}

/** Pavimento que não conta como "ocupado" para a altura: barrilete, casa de máquinas, ático, telhado… */
const PAVIMENTO_TECNICO = /barrilete|casa\s+de\s+m[aá]quinas|reservat[oó]rio|[aá]tico|telhado|cobertura\s+t[eé]cnica|caixa\s+d/i;

/** Usos que dizem "residencial" (`blueprintPrograma`). */
const USOS_RESIDENCIAIS = new Set(['SALA', 'COZINHA', 'DORMITORIO', 'SUITE', 'BANHEIRO', 'LAVABO', 'AREA_DE_SERVICO', 'VARANDA']);

function niveisOrdenados(model: BlueprintModel): Level[] {
  return [...model.levels].sort((a, b) => a.elevationMm - b.elevationMm || a.id.localeCompare(b.id));
}

/** O pavimento de descarga: o declarado, senão o de cota mais próxima de zero (empate: o mais baixo). */
export function pavimentoDeDescarga(model: BlueprintModel, declaradoId: string | null): Level | null {
  const niveis = niveisOrdenados(model);
  const declarado = declaradoId ? niveis.find((l) => l.id === declaradoId) : undefined;
  if (declarado) return declarado;
  return niveis.reduce<Level | null>((melhor, l) => (!melhor || Math.abs(l.elevationMm) < Math.abs(melhor.elevationMm) ? l : melhor), null);
}

/** O último pavimento OCUPADO: o mais alto que tem ambiente e não é técnico pelo nome. */
export function ultimoPavimentoOcupado(model: BlueprintModel): Level | null {
  const comAmbiente = new Set(model.spaces.map((s) => s.levelId));
  const ocupados = niveisOrdenados(model).filter((l) => comAmbiente.has(l.id) && !PAVIMENTO_TECNICO.test(l.name));
  return ocupados[ocupados.length - 1] ?? null;
}

/** A divisão que os ambientes sugerem: residencial → A-2 com 2+ unidades, A-1 sem. `null` se nada residencial. */
export function divisaoSugerida(model: BlueprintModel): { divisao: string | null; motivo: string } {
  const residenciais = model.spaces.filter((s) => {
    const u = usoDoNome(s.name);
    return u != null && USOS_RESIDENCIAIS.has(u);
  }).length;
  if (residenciais === 0) return { divisao: null, motivo: 'nenhum ambiente com nome residencial — declare a divisão' };
  const unidades = model.unidades?.length ?? 0;
  if (unidades >= 2) return { divisao: 'A-2', motivo: `${residenciais} ambiente(s) residenciais e ${unidades} unidades` };
  return { divisao: 'A-1', motivo: `${residenciais} ambiente(s) residenciais e ${unidades === 1 ? '1 unidade' : 'nenhuma unidade cadastrada'}` };
}

export function classificarEdificacao(model: BlueprintModel, hip: HipotesesDeClassificacao): ClassificacaoDaEdificacao {
  const pendencias: string[] = [];

  // Divisão: declarada vence a sugerida.
  const sugerida = divisaoSugerida(model);
  const divisao = hip.divisao
    ? { valor: hip.divisao, origem: 'DECLARADA' as const, motivo: 'declarada nas premissas' }
    : sugerida.divisao
      ? { valor: sugerida.divisao, origem: 'SUGERIDA' as const, motivo: sugerida.motivo }
      : { valor: null, origem: 'SEM' as const, motivo: sugerida.motivo };
  if (!divisao.valor) pendencias.push('Declare a divisão de ocupação (ex.: A-2).');
  const letra = divisao.valor?.charAt(0) ?? null;
  const grupo = letra ? (GRUPOS_DE_OCUPACAO.find((g) => g.grupo === letra) ?? null) : null;

  // Altura para incêndio.
  const descarga = pavimentoDeDescarga(model, hip.pisoDeDescargaLevelId);
  const ultimo = ultimoPavimentoOcupado(model);
  const derivadaM = descarga && ultimo ? Math.max(0, (ultimo.elevationMm - descarga.elevationMm) / 1000) : 0;
  if (hip.alturaDeclaradaM == null && (!descarga || !ultimo)) pendencias.push('Sem pavimento com ambientes: a altura foi tomada como 0 m.');
  const altura = hip.alturaDeclaradaM != null
    ? { valorM: hip.alturaDeclaradaM, origem: 'DECLARADA' as const, descarga: descarga?.name ?? null, ultimo: ultimo?.name ?? null }
    : { valorM: derivadaM, origem: 'DERIVADA' as const, descarga: descarga?.name ?? null, ultimo: ultimo?.name ?? null };

  // Área.
  const areaPorPavimento = niveisOrdenados(model).map((l) => ({ levelId: l.id, nome: l.name, areaM2: areaConstruidaMm2(model, l) / 1e6 }));
  const areaTotalM2 = areaPorPavimento.reduce((s, p) => s + p.areaM2, 0);

  // Carga de incêndio: declarada vence a tabela.
  const daTabela = divisao.valor ? DIVISOES_TRANSCRITAS[divisao.valor]?.cargaMJm2 : undefined;
  const carga = hip.cargaDeclaradaMJm2 != null
    ? { valorMJm2: hip.cargaDeclaradaMJm2, origem: 'DECLARADA' as const }
    : daTabela != null
      ? { valorMJm2: daTabela, origem: 'TABELA' as const }
      : { valorMJm2: null, origem: 'SEM' as const };
  if (carga.valorMJm2 == null && divisao.valor) pendencias.push(`A carga de incêndio da divisão ${divisao.valor} não foi transcrita: declare-a (MJ/m²).`);

  return {
    preset: hip.preset,
    divisao,
    grupo,
    altura,
    tipoPorAltura: tipoPorAltura(altura.valorM),
    areaTotalM2,
    areaPorPavimento,
    pavimentos: model.levels.length,
    unidades: model.unidades?.length ?? 0,
    carga: { ...carga, nivel: carga.valorMJm2 != null ? nivelDeCarga(carga.valorMJm2) : null },
    pendencias,
  };
}

// ─── Medidas de segurança exigidas ───────────────────────────────────────────

export const MEDIDAS_DE_SEGURANCA = [
  { id: 'ACESSO_VIATURA', nome: 'Acesso de viatura na edificação' },
  { id: 'SEGURANCA_ESTRUTURAL', nome: 'Segurança estrutural contra incêndio' },
  { id: 'COMPARTIMENTACAO_HORIZONTAL', nome: 'Compartimentação horizontal' },
  { id: 'COMPARTIMENTACAO_VERTICAL', nome: 'Compartimentação vertical' },
  { id: 'CONTROLE_MATERIAIS_ACABAMENTO', nome: 'Controle de materiais de acabamento' },
  { id: 'SAIDAS_EMERGENCIA', nome: 'Saídas de emergência' },
  { id: 'PLANO_INTERVENCAO', nome: 'Plano de intervenção de incêndio' },
  { id: 'ELEVADOR_EMERGENCIA', nome: 'Elevador de emergência' },
  { id: 'CONTROLE_FUMACA', nome: 'Controle de fumaça' },
  { id: 'BRIGADA', nome: 'Brigada de incêndio' },
  { id: 'ILUMINACAO_EMERGENCIA', nome: 'Iluminação de emergência' },
  { id: 'DETECCAO', nome: 'Detecção de incêndio' },
  { id: 'ALARME', nome: 'Alarme de incêndio' },
  { id: 'SINALIZACAO', nome: 'Sinalização de emergência' },
  { id: 'EXTINTORES', nome: 'Extintores' },
  { id: 'HIDRANTES', nome: 'Hidrantes e mangotinhos' },
  { id: 'CHUVEIROS_AUTOMATICOS', nome: 'Chuveiros automáticos (sprinklers)' },
] as const;
export type MedidaDeSeguranca = (typeof MEDIDAS_DE_SEGURANCA)[number]['id'];

/** CONDICIONAL (D1): assinalada, mas a nota depende do que o desenho não sabe (população…) — a condição vai no motivo. */
export type EstadoDaExigencia = 'EXIGIDA' | 'DISPENSADA' | 'CONDICIONAL' | 'SEM_TABELA';

export interface ExigenciaDaMedida {
  medida: MedidaDeSeguranca;
  nome: string;
  estado: EstadoDaExigencia;
  /** Por que — sempre dito, inclusive no SEM_TABELA. */
  motivo: string;
  fonte: string | null;
  /** Transcrito de memória: não serve para aprovação até conferir o texto. */
  rascunho: boolean;
}

export interface ExigenciasDaEdificacao {
  preset: PresetDeBombeiros;
  /** O preset tem alguma tabela? (só MG — D1: texto do CBMMG). */
  temTabela: boolean;
  /** Alguma linha veio de memória? A tela põe o aviso de "não usar para aprovação". */
  temRascunho: boolean;
  medidas: ExigenciaDaMedida[];
}

export function exigenciasDaEdificacao(c: ClassificacaoDaEdificacao): ExigenciasDaEdificacao {
  const temTabela = PRESETS_COM_TABELA.includes(c.preset);
  const divisao = c.divisao.valor;
  const medidas = MEDIDAS_DE_SEGURANCA.map(({ id, nome }): ExigenciaDaMedida => {
    if (!temTabela) return { medida: id, nome, estado: 'SEM_TABELA', motivo: `${ROTULO_DO_PRESET[c.preset]}: preset sem tabela — cole o texto do regulamento`, fonte: null, rascunho: false };
    if (!divisao) return { medida: id, nome, estado: 'SEM_TABELA', motivo: 'sem divisão de ocupação — declare-a', fonte: null, rascunho: false };
    // D1: a IT 01 do CBMMG, conferida — `rascunho: false`.
    return { medida: id, nome, ...exigenciaMG(id, divisao, c), rascunho: false };
  });
  return { preset: c.preset, temTabela, temRascunho: medidas.some((m) => m.rascunho), medidas };
}
