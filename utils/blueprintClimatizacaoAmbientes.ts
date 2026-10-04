/**
 * CLIMATIZAÇÃO — dados POR AMBIENTE (04/10/2026, E0.3 do roadmap
 * `docs/planos/2026-10-04-climatizacao-benchmark-altoqi-e-roadmap.md`).
 *
 * O que a carga térmica (E2) precisa saber de cada ambiente e que o desenho
 * não tem como derivar: se é climatizado, quantas pessoas, que atividade,
 * iluminação e equipamentos, uma fonte de calor extra. Mora nas premissas do
 * ESTUDO, indexado pelo `uid` da ETIQUETA do ambiente (achado 6: `SpaceLabel`
 * não tem bolsa de parâmetros, e o `id` do `Space` muda a cada rederivação —
 * o `uid` da etiqueta é a única identidade estável). Ambiente sem etiqueta
 * não declara nada: vale o padrão pelo nome.
 *
 * O que não foi declarado vem do PADRÃO POR USO (`usoDoNome`), e cada valor
 * diz de onde veio. ⚠️ CONFERIR NA NORMA: os padrões (pessoas, W/m² de
 * iluminação, W de equipamentos, atividade) são hipótese de projeto
 * residencial; a norma de referência é a NBR 16401-1 (densidade de ocupação,
 * Anexo) e a NBR 16655-3 (cargas internas residenciais), cujos PDFs não estão
 * no repositório.
 *
 * ─── Pé-direito ÚNICO (achado 3) ─────────────────────────────────────────────
 * Havia duas contas: `peDireitoUtilMm` (desconta piso, rebaixo e forro) e a da
 * planta de forro/quantitativo (desconta só o rebaixo). Para o VOLUME DE AR da
 * carga térmica vale UMA: `peDireitoLivreMm`, que é a primeira — do piso
 * acabado à face do forro. A do quantitativo mede outra coisa (a altura até o
 * forro para o acabamento) e fica como está, agora com o nome que a distingue.
 */
import type { AcabamentosDoAmbiente } from './blueprintKernel';
import { peDireitoUtilMm } from './blueprintAcabamentos';
import { FICHA_DO_USO, USOS_DO_AMBIENTE, usoDoNome, type UsoDoAmbiente } from './blueprintPrograma';

export const ATIVIDADES = ['SENTADO_REPOUSO', 'SENTADO_TRABALHO_LEVE', 'EM_PE_LEVE', 'MODERADA', 'PESADA'] as const;
export type Atividade = (typeof ATIVIDADES)[number];
export const ROTULO_DA_ATIVIDADE: Record<Atividade, string> = {
  SENTADO_REPOUSO: 'Sentado, em repouso',
  SENTADO_TRABALHO_LEVE: 'Sentado, trabalho leve',
  EM_PE_LEVE: 'Em pé, trabalho leve',
  MODERADA: 'Atividade moderada',
  PESADA: 'Atividade pesada',
};

/** O que o projetista declara de UM ambiente. `null` = derivar (padrão pelo uso; temperatura do estudo). */
export interface HipotesesDoAmbiente {
  climatizado: boolean | null;
  /** Setpoint próprio, °C; `null` = o do estudo. */
  temperaturaInternaC: number | null;
  pessoas: number | null;
  atividade: Atividade | null;
  /** Potência de iluminação por área, W/m²; `null` = padrão do uso. */
  iluminacaoWm2: number | null;
  /** Equipamentos e aparelhos, W; `null` = padrão do uso. */
  equipamentosW: number | null;
  /** Fonte de calor personalizada (sensível e latente), W; `null` = nenhuma. */
  fonteSensivelW: number | null;
  fonteLatenteW: number | null;
}

export const HIPOTESES_DO_AMBIENTE_VAZIAS: HipotesesDoAmbiente = {
  climatizado: null,
  temperaturaInternaC: null,
  pessoas: null,
  atividade: null,
  iluminacaoWm2: null,
  equipamentosW: null,
  fonteSensivelW: null,
  fonteLatenteW: null,
};

export const LIMITES_DO_AMBIENTE = {
  temperaturaInternaC: { min: 16, max: 30 },
  pessoas: { min: 0, max: 500 },
  iluminacaoWm2: { min: 0, max: 100 },
  equipamentosW: { min: 0, max: 50000 },
  fonteW: { min: 0, max: 100000 },
} as const;

export interface PadraoDoUso {
  climatizado: boolean;
  pessoas: number;
  atividade: Atividade;
  iluminacaoWm2: number;
  equipamentosW: number;
}

/**
 * Padrão por uso — HIPÓTESE de projeto residencial, não tabela de norma.
 * ⚠️ CONFERIR NA NORMA (NBR 16401-1 e NBR 16655-3). A organização ajusta no
 * estudo, ambiente a ambiente; o declarado vence sempre.
 */
export const PADRAO_POR_USO: Record<UsoDoAmbiente, PadraoDoUso> = {
  SALA: { climatizado: true, pessoas: 4, atividade: 'SENTADO_REPOUSO', iluminacaoWm2: 5, equipamentosW: 300 },
  COZINHA: { climatizado: false, pessoas: 1, atividade: 'EM_PE_LEVE', iluminacaoWm2: 7, equipamentosW: 1000 },
  DORMITORIO: { climatizado: true, pessoas: 2, atividade: 'SENTADO_REPOUSO', iluminacaoWm2: 5, equipamentosW: 100 },
  SUITE: { climatizado: true, pessoas: 2, atividade: 'SENTADO_REPOUSO', iluminacaoWm2: 5, equipamentosW: 150 },
  BANHEIRO: { climatizado: false, pessoas: 1, atividade: 'EM_PE_LEVE', iluminacaoWm2: 7, equipamentosW: 0 },
  LAVABO: { climatizado: false, pessoas: 1, atividade: 'EM_PE_LEVE', iluminacaoWm2: 7, equipamentosW: 0 },
  AREA_DE_SERVICO: { climatizado: false, pessoas: 1, atividade: 'EM_PE_LEVE', iluminacaoWm2: 7, equipamentosW: 500 },
  VARANDA: { climatizado: false, pessoas: 2, atividade: 'SENTADO_REPOUSO', iluminacaoWm2: 3, equipamentosW: 0 },
  CIRCULACAO: { climatizado: false, pessoas: 0, atividade: 'EM_PE_LEVE', iluminacaoWm2: 3, equipamentosW: 0 },
  GARAGEM: { climatizado: false, pessoas: 0, atividade: 'EM_PE_LEVE', iluminacaoWm2: 2, equipamentosW: 0 },
  ESCRITORIO: { climatizado: true, pessoas: 1, atividade: 'SENTADO_TRABALHO_LEVE', iluminacaoWm2: 10, equipamentosW: 200 },
  DEPOSITO: { climatizado: false, pessoas: 0, atividade: 'EM_PE_LEVE', iluminacaoWm2: 2, equipamentosW: 0 },
  OUTRO: { climatizado: false, pessoas: 0, atividade: 'SENTADO_REPOUSO', iluminacaoWm2: 5, equipamentosW: 0 },
};

export const FONTE_DO_PADRAO_POR_USO = 'Padrão por uso = hipótese de projeto residencial. CONFERIR NA NORMA: NBR 16401-1 (ocupação) e NBR 16655-3 (cargas internas).';

// ─── Leitura da coluna ───────────────────────────────────────────────────────

const objeto = (raw: unknown): Record<string, unknown> => (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
const numeroOuNulo = (x: unknown, faixa: { min: number; max: number }): number | null =>
  typeof x === 'number' && Number.isFinite(x) && x >= faixa.min && x <= faixa.max ? x : null;

export function hipotesesDoAmbienteDaColuna(raw: unknown): HipotesesDoAmbiente {
  const r = objeto(raw);
  return {
    climatizado: typeof r.climatizado === 'boolean' ? r.climatizado : null,
    temperaturaInternaC: numeroOuNulo(r.temperaturaInternaC, LIMITES_DO_AMBIENTE.temperaturaInternaC),
    pessoas: typeof r.pessoas === 'number' && Number.isInteger(r.pessoas) ? numeroOuNulo(r.pessoas, LIMITES_DO_AMBIENTE.pessoas) : null,
    atividade: (ATIVIDADES as readonly unknown[]).includes(r.atividade) ? (r.atividade as Atividade) : null,
    iluminacaoWm2: numeroOuNulo(r.iluminacaoWm2, LIMITES_DO_AMBIENTE.iluminacaoWm2),
    equipamentosW: numeroOuNulo(r.equipamentosW, LIMITES_DO_AMBIENTE.equipamentosW),
    fonteSensivelW: numeroOuNulo(r.fonteSensivelW, LIMITES_DO_AMBIENTE.fonteW),
    fonteLatenteW: numeroOuNulo(r.fonteLatenteW, LIMITES_DO_AMBIENTE.fonteW),
  };
}

export function ambienteSemDeclaracao(h: HipotesesDoAmbiente): boolean {
  return Object.values(h).every((v) => v === null);
}

/** O mapa `uid → declaração` gravado: chave que não é texto cai, declaração vazia cai. */
export function ambientesDaColuna(raw: unknown): Record<string, HipotesesDoAmbiente> {
  const saida: Record<string, HipotesesDoAmbiente> = {};
  for (const [uid, v] of Object.entries(objeto(raw))) {
    if (!uid.trim()) continue;
    const h = hipotesesDoAmbienteDaColuna(v);
    if (!ambienteSemDeclaracao(h)) saida[uid] = h;
  }
  return saida;
}

// ─── O que vale para cada ambiente ───────────────────────────────────────────

export type OrigemDoDado = 'DECLARADA' | 'USO' | 'ESTUDO' | 'SEM';
export interface DadoComOrigem<T> {
  valor: T;
  origem: OrigemDoDado;
}

export interface ContextoDoAmbiente {
  nome: string | null | undefined;
  areaPisoM2: number;
  /** Pé-direito do pavimento (piso a piso menos a laje), mm. */
  peDireitoMm: number;
  acabamentos?: AcabamentosDoAmbiente;
  /** O setpoint do estudo (`HipotesesDeConforto.temperaturaInternaC`). */
  temperaturaDoEstudoC: number;
}

export interface PremissasDoAmbiente {
  uso: UsoDoAmbiente | null;
  climatizado: DadoComOrigem<boolean>;
  temperaturaInternaC: DadoComOrigem<number>;
  pessoas: DadoComOrigem<number>;
  atividade: DadoComOrigem<Atividade>;
  iluminacaoWm2: DadoComOrigem<number>;
  /** Iluminação total = W/m² × área, W. */
  iluminacaoW: number;
  equipamentosW: DadoComOrigem<number>;
  fonteSensivelW: number;
  fonteLatenteW: number;
  /** Do piso acabado à face do forro (achado 3): a altura do VOLUME DE AR. */
  peDireitoLivreMm: number;
  volumeM3: number;
  /** Algum valor veio do padrão por uso — a tela e o memorial dizem CONFERIR NA NORMA. */
  conferir: boolean;
}

/** A definição ÚNICA do pé-direito que a carga térmica usa — ver o cabeçalho do arquivo. */
export function peDireitoLivreMm(peDireitoMm: number, acabamentos: AcabamentosDoAmbiente | undefined): number {
  return peDireitoUtilMm(peDireitoMm, acabamentos);
}

export function premissasDoAmbiente(declarado: HipotesesDoAmbiente | undefined, ctx: ContextoDoAmbiente): PremissasDoAmbiente {
  const h = declarado ?? HIPOTESES_DO_AMBIENTE_VAZIAS;
  const uso = usoDoNome(ctx.nome);
  const padrao = uso ? PADRAO_POR_USO[uso] : PADRAO_POR_USO.OUTRO;
  const origemPadrao: OrigemDoDado = uso ? 'USO' : 'SEM';
  const escolher = <T,>(decl: T | null, doUso: T): DadoComOrigem<T> => (decl != null ? { valor: decl, origem: 'DECLARADA' } : { valor: doUso, origem: origemPadrao });

  const climatizado = escolher(h.climatizado, padrao.climatizado);
  const temperaturaInternaC: DadoComOrigem<number> =
    h.temperaturaInternaC != null ? { valor: h.temperaturaInternaC, origem: 'DECLARADA' } : { valor: ctx.temperaturaDoEstudoC, origem: 'ESTUDO' };
  const pessoas = escolher(h.pessoas, padrao.pessoas);
  const atividade = escolher(h.atividade, padrao.atividade);
  const iluminacaoWm2 = escolher(h.iluminacaoWm2, padrao.iluminacaoWm2);
  const equipamentosW = escolher(h.equipamentosW, padrao.equipamentosW);
  const pd = peDireitoLivreMm(ctx.peDireitoMm, ctx.acabamentos);
  const conferir = [climatizado, pessoas, atividade, iluminacaoWm2, equipamentosW].some((d) => d.origem !== 'DECLARADA');
  return {
    uso,
    climatizado,
    temperaturaInternaC,
    pessoas,
    atividade,
    iluminacaoWm2,
    iluminacaoW: Math.round(iluminacaoWm2.valor * ctx.areaPisoM2),
    equipamentosW,
    fonteSensivelW: h.fonteSensivelW ?? 0,
    fonteLatenteW: h.fonteLatenteW ?? 0,
    peDireitoLivreMm: pd,
    volumeM3: Math.round(ctx.areaPisoM2 * (pd / 1000) * 100) / 100,
    conferir,
  };
}

/** O rótulo do uso para a tela ("Sala", "Dormitório"…); sem uso reconhecido, `null`. */
export function rotuloDoUso(uso: UsoDoAmbiente | null): string | null {
  return uso ? FICHA_DO_USO[uso].rotulo : null;
}

export { USOS_DO_AMBIENTE };
