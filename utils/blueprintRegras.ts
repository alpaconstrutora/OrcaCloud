/**
 * MOTOR DE REGRAS (19/09/2026, roadmap E3.2: *"Motor de Regras / Legislação"*).
 *
 * ─── REGRA DECLARATIVA, AVALIADA PELO MOTOR DE FÓRMULAS ─────────────────────
 *
 * Uma regra é `{escopo, quando?, expressao, severidade, fonte}`: para cada
 * ALVO do escopo (o lote, a edificação, cada pavimento, unidade, ambiente ou
 * porta) o motor monta as VARIÁVEIS do alvo (área, largura mínima, pé-direito,
 * área de janelas…), avalia `quando` (a regra se aplica?) e depois
 * `expressao` (verdadeiro = conforme). Expressão é texto do motor da E1.3 —
 * a mesma gramática das fórmulas de parâmetro, com `e`/`ou`/comparações — e
 * por isso o catálogo pode crescer sem código: "area >= 2.5" é dado, não
 * `if`.
 *
 * ─── TRÊS ESTADOS + NÃO AVALIADA ────────────────────────────────────────────
 *
 * CONFORME, VIOLADA, e NÃO AVALIADA quando falta variável (a zona não disse o
 * gabarito; o lote não tem frente marcada) ou a expressão não parseia. Não
 * avaliada nunca vira conforme em silêncio — é o mesmo princípio do "N.A."
 * da zona: a ausência é nomeada. Regra cujo `quando` é falso não se aplica e
 * não aparece.
 *
 * ─── ACUSA, NÃO TRAVA ───────────────────────────────────────────────────────
 *
 * Nada aqui impede desenhar. A tela "Verificar legislação" lista, agrupa por
 * fonte, e o clique leva ao elemento. Como as restrições (E1.4b).
 *
 * ─── A SEMENTE ──────────────────────────────────────────────────────────────
 *
 * `REGRAS_SEMENTE` é um código de obras GENÉRICO — ordens de grandeza comuns
 * aos códigos municipais brasileiros e às NBR 9050/15575 —, dito como semente:
 * cada município tem os seus números, e é para isso que existem as regras da
 * organização (`blueprint_rule_sets`), que somam ou substituem.
 */
import {
  anelRecuado,
  areaRecuada,
  areaConstruidaMm2,
  type BlueprintModel,
  type ObjectId,
  type Opening,
  type Space,
  type Wall,
} from './blueprintKernel';
import { etiquetaDoAmbiente } from './blueprintDistribuicao';
import { avaliar, erroDeSintaxe, formatarValor, variaveisCitadas, type Valor, type Variaveis } from './blueprintFormulas';
import { unidadePorEtiqueta, medirUnidade } from './blueprintUnidades';

export type EscopoDaRegra = 'LOTE' | 'EDIFICACAO' | 'PAVIMENTO' | 'UNIDADE' | 'AMBIENTE' | 'PORTA';
export const ESCOPOS_DA_REGRA: readonly EscopoDaRegra[] = ['LOTE', 'EDIFICACAO', 'PAVIMENTO', 'UNIDADE', 'AMBIENTE', 'PORTA'];
export const ROTULO_DO_ESCOPO: Record<EscopoDaRegra, string> = {
  LOTE: 'Lote',
  EDIFICACAO: 'Edificação',
  PAVIMENTO: 'Pavimento',
  UNIDADE: 'Unidade',
  AMBIENTE: 'Ambiente',
  PORTA: 'Porta',
};

export type SeveridadeDaRegra = 'ERRO' | 'AVISO' | 'INFO';

export interface Regra {
  id: string;
  nome: string;
  escopo: EscopoDaRegra;
  /** Quando a regra se aplica ao alvo (booleano). Ausente = sempre. */
  quando?: string | null;
  /** Verdadeiro = conforme. */
  expressao: string;
  severidade: SeveridadeDaRegra;
  /** A lei/norma: "Código de obras genérico (semente)", "NBR 9050:2020", "LC 123/2019 (Município)". */
  fonte: string;
  artigo?: string | null;
  /** O que a regra pede, em uma linha, para a tela. */
  descricao?: string | null;
}

/** As variáveis de cada escopo — a documentação que o editor de regras mostra. */
export const VARIAVEIS_DO_ESCOPO: Record<EscopoDaRegra, { nome: string; descricao: string }[]> = {
  LOTE: [
    { nome: 'area', descricao: 'área do lote (m²)' },
    { nome: 'testada', descricao: 'soma das divisas de frente (m) — ausente sem frente marcada' },
    { nome: 'perimetro', descricao: 'perímetro do lote (m)' },
    { nome: 'taxa_ocupacao', descricao: 'taxa de ocupação desenhada (%)' },
    { nome: 'coeficiente', descricao: 'coeficiente de aproveitamento desenhado' },
    { nome: 'to_max', descricao: 'taxa de ocupação máxima da zona (%) — ausente se a zona não disse' },
    { nome: 'ca_max', descricao: 'coeficiente máximo da zona' },
    { nome: 'testada_min', descricao: 'testada mínima da zona (m)' },
    { nome: 'area_min', descricao: 'área mínima do lote da zona (m²)' },
    { nome: 'permeabilidade_min', descricao: 'taxa de permeabilidade mínima da zona (%)' },
  ],
  EDIFICACAO: [
    { nome: 'altura', descricao: 'altura desenhada (m): topo do pavimento mais alto' },
    { nome: 'pavimentos', descricao: 'número de pavimentos' },
    { nome: 'gabarito_m', descricao: 'gabarito em altura da zona (m)' },
    { nome: 'gabarito_pav', descricao: 'gabarito em pavimentos da zona' },
    { nome: 'area_construida', descricao: 'soma da área construída dos pavimentos (m²)' },
  ],
  PAVIMENTO: [
    { nome: 'nome', descricao: 'nome do pavimento' },
    { nome: 'pe_direito', descricao: 'pé-direito padrão (m)' },
    { nome: 'cota', descricao: 'cota do piso (m)' },
    { nome: 'area_construida', descricao: 'área construída do pavimento (m²)' },
    { nome: 'ambientes', descricao: 'número de ambientes' },
    { nome: 'area_envelope', descricao: 'área do envelope edificável neste pavimento (m²) — E3.3' },
    { nome: 'area_fora_envelope', descricao: 'área do contorno desenhado fora do envelope (m²)' },
    { nome: 'cabe_no_envelope', descricao: 'o contorno desenhado está dentro do envelope (sim/não)' },
    { nome: 'acima_do_gabarito', descricao: 'o pavimento passa do gabarito da zona (sim/não)' },
  ],
  UNIDADE: [
    { nome: 'numero', descricao: 'número da unidade' },
    { nome: 'tipologia', descricao: 'tipologia (texto)' },
    { nome: 'pcd', descricao: 'unidade adaptada (sim/não)' },
    { nome: 'area_privativa', descricao: 'área privativa NBR 12721 (m²)' },
    { nome: 'ambientes', descricao: 'número de ambientes' },
  ],
  AMBIENTE: [
    { nome: 'nome', descricao: 'nome do ambiente' },
    { nome: 'tipo', descricao: "tipo NBR 5410: 'BANHEIRO', 'COZINHA_SERVICO', 'VARANDA', 'SALA_DORMITORIO', 'OUTRO' ou '' (a classificar)" },
    { nome: 'area', descricao: 'área útil de piso (m²)' },
    { nome: 'largura_min', descricao: 'menor lado da caixa do ambiente (m)' },
    { nome: 'pe_direito', descricao: 'pé-direito do pavimento (m)' },
    { nome: 'area_janelas', descricao: 'soma das áreas das janelas nas paredes do ambiente (m²)' },
    { nome: 'area_portas', descricao: 'soma das áreas das portas do ambiente (m²)' },
    { nome: 'unidade_pcd', descricao: 'o ambiente pertence a uma unidade PCD (sim/não)' },
    { nome: 'pavimento', descricao: 'nome do pavimento' },
    { nome: 'horas_sol_inverno', descricao: 'horas de sol pelas janelas no solstício de inverno (E5.1)' },
    { nome: 'horas_sol_verao', descricao: 'horas de sol pelas janelas no solstício de verão (E5.1)' },
    { nome: 'ventilacao_cruzada', descricao: 'aberturas para fora em fachadas não paralelas (sim/não)' },
    { nome: 'insolacao_minima', descricao: 'horas mínimas de sol exigidas pela zona' },
  ],
  PORTA: [
    { nome: 'largura', descricao: 'vão (m)' },
    { nome: 'altura', descricao: 'altura (m)' },
    { nome: 'tipo', descricao: "'door', 'sliding' ou 'passage'" },
    { nome: 'pavimento', descricao: 'nome do pavimento' },
  ],
};

const FONTE_SEMENTE = 'Código de obras genérico (semente)';
const NBR_9050 = 'NBR 9050:2020';

export const REGRAS_SEMENTE: readonly Regra[] = [
  { id: 'sem-banheiro-area', nome: 'Banheiro: área mínima', escopo: 'AMBIENTE', quando: "tipo == 'BANHEIRO'", expressao: 'area >= 2.5', severidade: 'ERRO', fonte: FONTE_SEMENTE, descricao: 'Banheiro com ao menos 2,50 m² de piso' },
  { id: 'sem-banheiro-largura', nome: 'Banheiro: largura mínima', escopo: 'AMBIENTE', quando: "tipo == 'BANHEIRO'", expressao: 'largura_min >= 1.2', severidade: 'ERRO', fonte: FONTE_SEMENTE, descricao: 'Menor lado do banheiro ≥ 1,20 m' },
  { id: 'sem-cozinha-area', nome: 'Cozinha/serviço: área mínima', escopo: 'AMBIENTE', quando: "tipo == 'COZINHA_SERVICO'", expressao: 'area >= 4', severidade: 'ERRO', fonte: FONTE_SEMENTE, descricao: 'Cozinha ou área de serviço com ao menos 4,00 m²' },
  { id: 'sem-cozinha-largura', nome: 'Cozinha/serviço: largura mínima', escopo: 'AMBIENTE', quando: "tipo == 'COZINHA_SERVICO'", expressao: 'largura_min >= 1.5', severidade: 'ERRO', fonte: FONTE_SEMENTE, descricao: 'Menor lado ≥ 1,50 m' },
  { id: 'sem-sala-area', nome: 'Sala/dormitório: área mínima', escopo: 'AMBIENTE', quando: "tipo == 'SALA_DORMITORIO'", expressao: 'area >= 8', severidade: 'ERRO', fonte: FONTE_SEMENTE, descricao: 'Compartimento habitável com ao menos 8,00 m²' },
  { id: 'sem-sala-largura', nome: 'Sala/dormitório: largura mínima', escopo: 'AMBIENTE', quando: "tipo == 'SALA_DORMITORIO'", expressao: 'largura_min >= 2.4', severidade: 'ERRO', fonte: FONTE_SEMENTE, descricao: 'Menor lado ≥ 2,40 m' },
  { id: 'sem-pe-direito-habitavel', nome: 'Pé-direito em compartimento habitável', escopo: 'AMBIENTE', quando: "tipo == 'SALA_DORMITORIO'", expressao: 'pe_direito >= 2.5', severidade: 'ERRO', fonte: FONTE_SEMENTE, descricao: 'Pé-direito ≥ 2,50 m' },
  { id: 'sem-pe-direito-servico', nome: 'Pé-direito em banheiro e serviço', escopo: 'AMBIENTE', quando: "tipo == 'BANHEIRO' ou tipo == 'COZINHA_SERVICO'", expressao: 'pe_direito >= 2.3', severidade: 'AVISO', fonte: FONTE_SEMENTE, descricao: 'Pé-direito ≥ 2,30 m' },
  { id: 'sem-iluminacao-habitavel', nome: 'Iluminação natural: 1/6 do piso', escopo: 'AMBIENTE', quando: "tipo == 'SALA_DORMITORIO'", expressao: 'area_janelas >= area / 6', severidade: 'ERRO', fonte: FONTE_SEMENTE, descricao: 'Área de janelas ≥ 1/6 da área do piso' },
  { id: 'sem-ventilacao-habitavel', nome: 'Ventilação natural: 1/12 do piso', escopo: 'AMBIENTE', quando: "tipo == 'SALA_DORMITORIO'", expressao: 'area_janelas * 0.5 >= area / 12', severidade: 'AVISO', fonte: FONTE_SEMENTE, descricao: 'Metade da área de janelas (a parte que abre) ≥ 1/12 do piso' },
  { id: 'sem-iluminacao-servico', nome: 'Iluminação natural em banheiro e cozinha: 1/8', escopo: 'AMBIENTE', quando: "tipo == 'BANHEIRO' ou tipo == 'COZINHA_SERVICO'", expressao: 'area_janelas >= area / 8', severidade: 'AVISO', fonte: FONTE_SEMENTE, descricao: 'Área de janelas ≥ 1/8 do piso (ou ventilação mecânica, a declarar)' },
  { id: 'sem-porta-largura', nome: 'Porta: vão livre mínimo', escopo: 'PORTA', quando: "tipo != 'passage'", expressao: 'largura >= 0.8', severidade: 'ERRO', fonte: NBR_9050, artigo: '6.11.2.4', descricao: 'Vão livre ≥ 0,80 m' },
  { id: 'sem-porta-altura', nome: 'Porta: altura mínima', escopo: 'PORTA', quando: "tipo != 'passage'", expressao: 'altura >= 2.1', severidade: 'AVISO', fonte: FONTE_SEMENTE, descricao: 'Altura ≥ 2,10 m' },
  { id: 'sem-giro-pcd', nome: 'Banheiro acessível: giro de 1,50 m', escopo: 'AMBIENTE', quando: "unidade_pcd e tipo == 'BANHEIRO'", expressao: 'largura_min >= 1.5', severidade: 'ERRO', fonte: NBR_9050, artigo: '7.5', descricao: 'Menor lado ≥ 1,50 m para o círculo de giro' },
  { id: 'sem-lote-to', nome: 'Taxa de ocupação', escopo: 'LOTE', expressao: 'taxa_ocupacao <= to_max', severidade: 'ERRO', fonte: 'Zona urbanística', descricao: 'Taxa de ocupação desenhada ≤ máxima da zona' },
  { id: 'sem-lote-ca', nome: 'Coeficiente de aproveitamento', escopo: 'LOTE', expressao: 'coeficiente <= ca_max', severidade: 'ERRO', fonte: 'Zona urbanística', descricao: 'Coeficiente desenhado ≤ máximo da zona' },
  { id: 'sem-lote-testada', nome: 'Testada mínima', escopo: 'LOTE', expressao: 'testada >= testada_min', severidade: 'ERRO', fonte: 'Zona urbanística', descricao: 'Testada ≥ mínima da zona' },
  { id: 'sem-lote-area', nome: 'Área mínima do lote', escopo: 'LOTE', expressao: 'area >= area_min', severidade: 'ERRO', fonte: 'Zona urbanística', descricao: 'Área ≥ mínima da zona' },
  { id: 'sem-gabarito-m', nome: 'Gabarito em altura', escopo: 'EDIFICACAO', expressao: 'altura <= gabarito_m', severidade: 'ERRO', fonte: 'Zona urbanística', descricao: 'Altura desenhada ≤ gabarito da zona' },
  { id: 'sem-gabarito-pav', nome: 'Gabarito em pavimentos', escopo: 'EDIFICACAO', expressao: 'pavimentos <= gabarito_pav', severidade: 'ERRO', fonte: 'Zona urbanística', descricao: 'Pavimentos ≤ gabarito da zona' },
  { id: 'sem-pav-pe-direito', nome: 'Pé-direito do pavimento', escopo: 'PAVIMENTO', expressao: 'pe_direito >= 2.5', severidade: 'AVISO', fonte: FONTE_SEMENTE, descricao: 'Pé-direito padrão ≥ 2,50 m' },
  { id: 'sem-pav-envelope', nome: 'Pavimento dentro do envelope edificável', escopo: 'PAVIMENTO', expressao: 'cabe_no_envelope', severidade: 'ERRO', fonte: 'Zona urbanística', descricao: 'Contorno desenhado dentro dos recuos, afastamentos e faixas restritas (E3.3)' },
  { id: 'sem-pav-gabarito', nome: 'Pavimento dentro do gabarito', escopo: 'PAVIMENTO', expressao: 'nao acima_do_gabarito', severidade: 'ERRO', fonte: 'Zona urbanística', descricao: 'Topo do pavimento ≤ gabarito em altura e ordem ≤ gabarito em pavimentos' },
  // Insolação e ventilação (E5.1): sol de inverno pelas janelas dos ambientes de permanência prolongada; ventilação cruzada como recomendação.
  { id: 'sem-amb-insolacao', nome: 'Sala/dormitório: insolação mínima no inverno', escopo: 'AMBIENTE', quando: "tipo == 'SALA_DORMITORIO' e area_janelas > 0", expressao: 'horas_sol_inverno >= insolacao_minima', severidade: 'ERRO', fonte: 'Zona urbanística', descricao: 'Horas de sol pelas janelas em 21/06 ≥ mínimo da zona' },
  { id: 'sem-amb-ventilacao-cruzada', nome: 'Sala/dormitório: ventilação cruzada', escopo: 'AMBIENTE', quando: "tipo == 'SALA_DORMITORIO'", expressao: 'ventilacao_cruzada', severidade: 'INFO', fonte: 'NBR 15575-1:2021', artigo: '11 (desempenho térmico)', descricao: 'Aberturas para fora em fachadas não paralelas' },
];

/** O que o motor precisa de fora do modelo (zona, lote, aproveitamento). Tudo opcional: o que falta vira NÃO AVALIADA. */
export interface ContextoDeRegras {
  lote?: { areaM2: number; perimetroM: number; testadaM: number | null } | null;
  taxaOcupacaoPct?: number | null;
  coeficiente?: number | null;
  alturaM?: number | null;
  zona?: {
    taxaOcupacaoMax?: number | null;
    coeficienteMax?: number | null;
    gabaritoAlturaMaxM?: number | null;
    gabaritoPavimentos?: number | null;
    taxaPermeabilidadeMin?: number | null;
    testadaMinimaMm?: number | null;
    areaMinimaDoLoteM2?: number | null;
    insolacaoMinimaH?: number | null;
  } | null;
  /** Insolação por ambiente (E5.1): `insolacaoParaRegras`. Ausente = variáveis ausentes. */
  insolacaoPorAmbiente?: Record<ObjectId, { horasSolInverno: number; horasSolVerao: number; ventilacaoCruzada: boolean; temJanela: boolean }> | null;
  /** Envelope 3D por pavimento (E3.3): `envelopePorPavimentoParaRegras`. Ausente = variáveis ausentes. */
  envelopePorPavimento?: Record<ObjectId, { areaEnvelopeM2: number; areaForaM2: number | null; cabe: boolean; acimaDoGabarito: boolean }> | null;
}

export type EstadoDaRegra = 'CONFORME' | 'VIOLADA' | 'NAO_AVALIADA';

export interface ResultadoDeRegra {
  regraId: string;
  regra: Regra;
  estado: EstadoDaRegra;
  /** O alvo: id de peça (ambiente, porta, pavimento, unidade) ou `null` para lote/edificação. */
  alvoId: ObjectId | null;
  alvoRotulo: string;
  levelId: ObjectId | null;
  /** Para o clique levar ao elemento: a etiqueta do ambiente, a porta, etc. */
  selecionarId: ObjectId | null;
  /** As variáveis citadas e os valores que tinham — "area = 3,2 · largura_min = 1,1". */
  valores: string;
  /** Por que não foi avaliada. */
  motivo: string | null;
}

interface Alvo {
  id: ObjectId | null;
  rotulo: string;
  levelId: ObjectId | null;
  selecionarId: ObjectId | null;
  vars: Variaveis;
}

const m2 = (mm2: number) => Math.round(mm2 / 10_000) / 100;
const m = (mm: number) => Math.round(mm) / 1000;

/** Só as variáveis com valor: `null`/`undefined` ficam de fora e a regra que as cita vira NÃO AVALIADA. */
function so(vars: Record<string, Valor | null | undefined>): Variaveis {
  const saida: Variaveis = {};
  for (const [k, v] of Object.entries(vars)) if (v !== null && v !== undefined) saida[k] = v;
  return saida;
}

/**
 * O menor lado da caixa do ambiente pela FACE INTERNA: o anel do arranjo corre
 * no eixo das paredes, e um banheiro de 1,35 m de eixo tem 1,20 m livres — é o
 * livre que a lei mede. Lado sem parede (contorno aberto) não recua.
 */
export function larguraMinimaMm(s: Space, paredes: Wall[]): number {
  const n = s.ring.length;
  const recuos = s.ring.map((a, i) => {
    const b = s.ring[(i + 1) % n];
    const w = paredes.find((x) => {
      const cruz = (p: { x: number; y: number }) => (x.b.x - x.a.x) * (p.y - x.a.y) - (x.b.y - x.a.y) * (p.x - x.a.x);
      const entre = (p: { x: number; y: number }) => Math.min(x.a.x, x.b.x) <= p.x && p.x <= Math.max(x.a.x, x.b.x) && Math.min(x.a.y, x.b.y) <= p.y && p.y <= Math.max(x.a.y, x.b.y);
      return cruz(a) === 0 && cruz(b) === 0 && entre(a) && entre(b);
    });
    return w ? w.thicknessMm / 2 : 0;
  });
  const anel = anelRecuado(s.ring, recuos);
  const base = anel.length >= 3 ? anel : s.ring;
  const xs = base.map((p) => p.x);
  const ys = base.map((p) => p.y);
  return Math.max(0, Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)));
}

/** Aberturas nas paredes que compõem o contorno do ambiente (colineares e contidas num lado). */
function aberturasDoAmbiente(model: BlueprintModel, s: Space): Opening[] {
  const paredes = model.walls.filter((w) => w.levelId === s.levelId);
  const ids = new Set<string>();
  const n = s.ring.length;
  for (let i = 0; i < n; i++) {
    const a = s.ring[i];
    const b = s.ring[(i + 1) % n];
    for (const w of paredes) {
      const cruz = (p: { x: number; y: number }) => (w.b.x - w.a.x) * (p.y - w.a.y) - (w.b.y - w.a.y) * (p.x - w.a.x);
      const entre = (p: { x: number; y: number }) => Math.min(w.a.x, w.b.x) <= p.x && p.x <= Math.max(w.a.x, w.b.x) && Math.min(w.a.y, w.b.y) <= p.y && p.y <= Math.max(w.a.y, w.b.y);
      if (cruz(a) === 0 && cruz(b) === 0 && entre(a) && entre(b)) ids.add(w.id);
    }
  }
  return model.openings.filter((o) => ids.has(o.wallId));
}

/** Os alvos de um escopo, com as variáveis prontas. */
export function alvosDoEscopo(model: BlueprintModel, escopo: EscopoDaRegra, ctx: ContextoDeRegras): Alvo[] {
  const nivel = (id: ObjectId) => model.levels.find((l) => l.id === id);
  switch (escopo) {
    case 'LOTE':
      if (!ctx.lote) return [];
      return [
        {
          id: null,
          rotulo: 'Lote',
          levelId: null,
          selecionarId: null,
          vars: so({
            area: ctx.lote.areaM2,
            perimetro: ctx.lote.perimetroM,
            testada: ctx.lote.testadaM,
            taxa_ocupacao: ctx.taxaOcupacaoPct,
            coeficiente: ctx.coeficiente,
            to_max: ctx.zona?.taxaOcupacaoMax,
            ca_max: ctx.zona?.coeficienteMax,
            testada_min: ctx.zona?.testadaMinimaMm != null ? m(ctx.zona.testadaMinimaMm) : null,
            area_min: ctx.zona?.areaMinimaDoLoteM2,
            permeabilidade_min: ctx.zona?.taxaPermeabilidadeMin,
          }),
        },
      ];
    case 'EDIFICACAO': {
      if (model.levels.length === 0) return [];
      const areaConstruida = model.levels.reduce((s, l) => s + areaConstruidaMm2(model, l), 0);
      return [
        {
          id: null,
          rotulo: 'Edificação',
          levelId: null,
          selecionarId: null,
          vars: so({
            altura: ctx.alturaM,
            pavimentos: model.levels.length,
            gabarito_m: ctx.zona?.gabaritoAlturaMaxM,
            gabarito_pav: ctx.zona?.gabaritoPavimentos,
            area_construida: m2(areaConstruida),
          }),
        },
      ];
    }
    case 'PAVIMENTO':
      return model.levels.map((l) => {
        const env = ctx.envelopePorPavimento?.[l.id];
        return {
          id: l.id,
          rotulo: l.name,
          levelId: l.id,
          selecionarId: null,
          vars: so({
            nome: l.name,
            pe_direito: m(l.defaultHeightMm),
            cota: m(l.elevationMm),
            area_construida: m2(areaConstruidaMm2(model, l)),
            ambientes: model.spaces.filter((s) => s.levelId === l.id).length,
            area_envelope: env?.areaEnvelopeM2,
            area_fora_envelope: env?.areaForaM2,
            cabe_no_envelope: env?.cabe,
            acima_do_gabarito: env?.acimaDoGabarito,
          }),
        };
      });
    case 'UNIDADE':
      return (model.unidades ?? []).map((u) => {
        const med = medirUnidade(model, u);
        return {
          id: u.id,
          rotulo: `Un. ${u.numero}`,
          levelId: med.levelIds[0] ?? null,
          selecionarId: null,
          vars: so({ numero: u.numero, tipologia: u.tipologia ?? '', pcd: u.pcd, area_privativa: m2(med.areaPrivativaMm2), ambientes: med.ambientes.length }),
        };
      });
    case 'AMBIENTE': {
      const unidadeDe = unidadePorEtiqueta(model);
      return model.spaces.map((s, i) => {
        const etiqueta = etiquetaDoAmbiente(s, model.labels);
        const paredes = model.walls.filter((w) => w.levelId === s.levelId);
        const aberturas = aberturasDoAmbiente(model, s);
        const areaDe = (o: Opening) => (o.widthMm * o.heightMm) / 1_000_000;
        const unidade = s.labelUid ? unidadeDe.get(s.labelUid) : undefined;
        const l = nivel(s.levelId);
        return {
          id: s.id,
          rotulo: s.name ?? `Ambiente ${i + 1}`,
          levelId: s.levelId,
          selecionarId: etiqueta?.id ?? null,
          vars: so({
            nome: s.name ?? '',
            tipo: etiqueta?.tipoDeAmbiente ?? '',
            area: m2(areaRecuada(s.ring, paredes).areaMm2),
            largura_min: m(larguraMinimaMm(s, paredes)),
            pe_direito: l ? m(l.defaultHeightMm) : null,
            area_janelas: Math.round(aberturas.filter((o) => o.kind === 'window').reduce((t, o) => t + areaDe(o), 0) * 100) / 100,
            area_portas: Math.round(aberturas.filter((o) => o.kind !== 'window').reduce((t, o) => t + areaDe(o), 0) * 100) / 100,
            unidade_pcd: unidade?.pcd ?? false,
            pavimento: l?.name ?? '',
            horas_sol_inverno: ctx.insolacaoPorAmbiente?.[s.id]?.horasSolInverno,
            horas_sol_verao: ctx.insolacaoPorAmbiente?.[s.id]?.horasSolVerao,
            ventilacao_cruzada: ctx.insolacaoPorAmbiente?.[s.id]?.ventilacaoCruzada,
            insolacao_minima: ctx.zona?.insolacaoMinimaH,
          }),
        };
      });
    }
    case 'PORTA':
      return model.openings
        .filter((o) => o.kind !== 'window')
        .map((o) => {
          const w = model.walls.find((x) => x.id === o.wallId);
          const l = w ? nivel(w.levelId) : undefined;
          return {
            id: o.id,
            rotulo: `${o.kind === 'passage' ? 'Vão' : 'Porta'} ${m(o.widthMm).toFixed(2).replace('.', ',')} m`,
            levelId: w?.levelId ?? null,
            selecionarId: o.id,
            vars: so({ largura: m(o.widthMm), altura: m(o.heightMm), tipo: o.kind, pavimento: l?.name ?? '' }),
          };
        });
    default:
      return [];
  }
}

function formatarValores(expr: string[], vars: Variaveis): string {
  const nomes = new Set<string>();
  for (const e of expr) {
    try {
      for (const v of variaveisCitadas(e)) nomes.add(v);
    } catch {
      /* expressão inválida: sem variáveis a mostrar */
    }
  }
  return [...nomes]
    .filter((n) => n in vars)
    .map((n) => `${n} = ${formatarValor(vars[n])}`)
    .join(' · ');
}

/** Avalia todas as regras contra o modelo. Puro; nada trava. */
export function avaliarRegras(model: BlueprintModel, regras: readonly Regra[], ctx: ContextoDeRegras = {}): ResultadoDeRegra[] {
  const saida: ResultadoDeRegra[] = [];
  const alvosPorEscopo = new Map<EscopoDaRegra, Alvo[]>();
  for (const regra of regras) {
    if (!alvosPorEscopo.has(regra.escopo)) alvosPorEscopo.set(regra.escopo, alvosDoEscopo(model, regra.escopo, ctx));
    const erroExpr = erroDeSintaxe(regra.expressao) ?? (regra.quando ? erroDeSintaxe(regra.quando) : null);
    for (const alvo of alvosPorEscopo.get(regra.escopo)!) {
      const base = { regraId: regra.id, regra, alvoId: alvo.id, alvoRotulo: alvo.rotulo, levelId: alvo.levelId, selecionarId: alvo.selecionarId, valores: formatarValores([regra.expressao, regra.quando ?? ''], alvo.vars) };
      if (erroExpr) {
        saida.push({ ...base, estado: 'NAO_AVALIADA', motivo: `expressão inválida: ${erroExpr}` });
        continue;
      }
      try {
        if (regra.quando) {
          const aplica = avaliar(regra.quando, alvo.vars);
          if (aplica !== true) continue;
        }
        const v = avaliar(regra.expressao, alvo.vars);
        if (typeof v !== 'boolean') {
          saida.push({ ...base, estado: 'NAO_AVALIADA', motivo: `a expressão devolve ${formatarValor(v)}, não sim/não` });
          continue;
        }
        saida.push({ ...base, estado: v ? 'CONFORME' : 'VIOLADA', motivo: null });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Variável ausente = falta o DADO, dito pelo nome que o usuário conhece.
        const faltou = /Variável desconhecida "([^"]+)"/.exec(msg)?.[1];
        const descricao = faltou ? VARIAVEIS_DO_ESCOPO[regra.escopo].find((v) => v.nome === faltou)?.descricao : undefined;
        saida.push({ ...base, estado: 'NAO_AVALIADA', motivo: faltou ? `falta o dado "${faltou}"${descricao ? ` — ${descricao}` : ''}` : msg });
      }
    }
  }
  return saida;
}

export interface ResumoDasRegras {
  violadas: number;
  erros: number;
  avisos: number;
  conformes: number;
  naoAvaliadas: number;
}

export function resumirRegras(resultados: readonly ResultadoDeRegra[]): ResumoDasRegras {
  const r = { violadas: 0, erros: 0, avisos: 0, conformes: 0, naoAvaliadas: 0 };
  for (const x of resultados) {
    if (x.estado === 'VIOLADA') {
      r.violadas++;
      if (x.regra.severidade === 'ERRO') r.erros++;
      else r.avisos++;
    } else if (x.estado === 'CONFORME') r.conformes++;
    else r.naoAvaliadas++;
  }
  return r;
}

/** Valida uma regra digitada: escopo conhecido, expressões que parseiam, variáveis do escopo. */
export function problemasDaRegra(regra: Pick<Regra, 'escopo' | 'expressao' | 'quando' | 'nome'>): string[] {
  const problemas: string[] = [];
  if (!regra.nome.trim()) problemas.push('Dê um nome à regra.');
  if (!ESCOPOS_DA_REGRA.includes(regra.escopo)) problemas.push('Escopo desconhecido.');
  const conhecidas = new Set((VARIAVEIS_DO_ESCOPO[regra.escopo] ?? []).map((v) => v.nome));
  for (const [rotulo, expr] of [
    ['expressão', regra.expressao],
    ['condição', regra.quando ?? ''],
  ] as const) {
    if (!expr.trim()) {
      if (rotulo === 'expressão') problemas.push('A expressão está vazia.');
      continue;
    }
    const erro = erroDeSintaxe(expr);
    if (erro) {
      problemas.push(`${rotulo}: ${erro}`);
      continue;
    }
    for (const v of variaveisCitadas(expr)) if (!conhecidas.has(v)) problemas.push(`${rotulo}: variável "${v}" não existe no escopo ${ROTULO_DO_ESCOPO[regra.escopo]}.`);
  }
  return problemas;
}
