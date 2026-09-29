/**
 * E4.1 — CONSUMO E VOLUME DE RESERVAÇÃO (29/09/2026, roadmap hidrossanitário).
 *
 * População → consumo diário → volume a reservar, comparado com a(s) caixa(s)
 * do desenho. Tudo derivado, com as premissas do estudo:
 *
 *  - POPULAÇÃO pelos ambientes: 2 pessoas por dormitório ou suíte e 1 por
 *    dependência de empregada (critério usual de projeto residencial; editável).
 *    O tipo sai do NOME do ambiente (`usoDoNome`: "Dorm. 2", "Suíte", "Quarto").
 *    Quem sabe a população (comercial, alojamento…) declara e ela vale.
 *  - CONSUMO DIÁRIO = população × per capita (200 L/hab·dia, residencial).
 *  - VOLUME = consumo × dias de reserva (1 dia: a NBR 5626 pede ao menos o
 *    consumo de 24 h, sem a reserva de incêndio), arredondado para CIMA na
 *    série comercial de caixas.
 *  - Com reservatório INFERIOR (E4.2) o volume se divide — 60 % embaixo, 40 %
 *    em cima (premissa editável); sem ele, tudo no superior.
 *
 * O volume DECLARADO de cada caixa é o comercial (`volumeL`), e, sem ele, o
 * bruto das medidas.
 */
import type { BlueprintModel, Terminal } from './blueprintKernel';
import { usoDoNome } from './blueprintPrograma';

export interface HipotesesDeReservatorio {
  pessoasPorDormitorio: number;
  pessoasPorDependencia: number;
  /** L/hab·dia. */
  perCapitaLDia: number;
  diasDeReserva: number;
  /** Fração do volume no reservatório INFERIOR, quando há um (0–1). */
  fracaoInferior: number;
  /** População declarada: quando > 0, substitui a contada pelos ambientes. */
  populacaoDeclarada: number;
}

export const HIPOTESES_RESERVATORIO_PADRAO: HipotesesDeReservatorio = {
  pessoasPorDormitorio: 2,
  pessoasPorDependencia: 1,
  perCapitaLDia: 200,
  diasDeReserva: 1,
  fracaoInferior: 0.6,
  populacaoDeclarada: 0,
};

/** A série comercial de caixas d'água (polietileno/fibra), em litros. */
export const VOLUMES_COMERCIAIS_L = [310, 500, 750, 1000, 1500, 2000, 3000, 5000, 10000, 15000, 20000] as const;

/** "Dependência de empregada", "Dep. empregada", "Quarto de serviço". */
const DEPENDENCIA = /\b(depend[eê]ncia|dep\.|quarto\s+de\s+servi[cç]o)\b/i;

export interface AmbienteContado {
  nome: string;
  tipo: 'DORMITORIO' | 'SUITE' | 'DEPENDENCIA';
  pessoas: number;
}

export interface Populacao {
  ambientes: AmbienteContado[];
  /** A contada pelos ambientes. */
  contada: number;
  /** A que vale: a declarada, se houver, senão a contada. */
  pessoas: number;
  declarada: boolean;
}

export function populacaoDoModelo(model: BlueprintModel, hip: HipotesesDeReservatorio): Populacao {
  const ambientes: AmbienteContado[] = [];
  for (const s of model.spaces) {
    const nome = s.name?.trim() ?? '';
    if (!nome) continue;
    if (DEPENDENCIA.test(nome)) {
      ambientes.push({ nome, tipo: 'DEPENDENCIA', pessoas: hip.pessoasPorDependencia });
      continue;
    }
    const uso = usoDoNome(nome);
    if (uso === 'DORMITORIO' || uso === 'SUITE') ambientes.push({ nome, tipo: uso, pessoas: hip.pessoasPorDormitorio });
  }
  const contada = ambientes.reduce((s, a) => s + a.pessoas, 0);
  const declarada = hip.populacaoDeclarada > 0;
  return { ambientes, contada, pessoas: declarada ? hip.populacaoDeclarada : contada, declarada };
}

/** O menor volume comercial que atende; acima da série, múltiplo de 1000 L. */
export function volumeComercialL(necessarioL: number): number {
  if (necessarioL <= 0) return 0;
  return VOLUMES_COMERCIAIS_L.find((v) => v >= necessarioL - 1e-9) ?? Math.ceil(necessarioL / 1000) * 1000;
}

/** O volume declarado da caixa: o comercial, senão o bruto das medidas; `null` se nenhum. */
export function volumeDoReservatorioL(t: Terminal): number | null {
  if (t.volumeL != null && t.volumeL > 0) return t.volumeL;
  // E4.2: o cilindro pelo diâmetro (= largura).
  if (t.formaReservatorio === 'CILINDRO' && t.larguraMm && t.alturaMm) return Math.round((Math.PI * (t.larguraMm / 2) ** 2 * t.alturaMm) / 1e6);
  if (t.larguraMm && t.profundidadeMm && t.alturaMm) return Math.round((t.larguraMm * t.profundidadeMm * t.alturaMm) / 1e6);
  return null;
}

export type SituacaoDaReservacao = 'ATENDE' | 'INSUFICIENTE' | 'SEM_VOLUME' | 'SEM_RESERVATORIO' | 'SEM_POPULACAO';

export interface ReservatorioDeclarado {
  terminalId: string;
  levelId: string;
  volumeL: number | null;
}

export interface DimensionamentoDaReservacao {
  populacao: Populacao;
  consumoDiarioL: number;
  volumeNecessarioL: number;
  /** Com inferior: o que vai em cada um; sem ele, tudo no superior. */
  inferiorNecessarioL: number;
  superiorNecessarioL: number;
  volumeSugeridoL: number;
  reservatorios: ReservatorioDeclarado[];
  declaradoL: number;
  situacao: SituacaoDaReservacao;
  /** A frase que a gaveta e o memorial mostram. */
  texto: string;
}

const litros = (v: number) => `${Math.round(v).toLocaleString('pt-BR')} L`;

/**
 * O dimensionamento da reservação. `inferiores` são os reservatórios de papel
 * INFERIOR (E4.2) — por padrão, os que o desenho marca assim.
 */
export function dimensionarReservacao(
  model: BlueprintModel,
  hip: HipotesesDeReservatorio,
  inferiores: ReadonlySet<string> = new Set((model.terminais ?? []).filter((t) => t.tipoHidraulico === 'RESERVATORIO' && t.papelReservatorio === 'INFERIOR').map((t) => t.id)),
): DimensionamentoDaReservacao {
  const populacao = populacaoDoModelo(model, hip);
  const consumoDiarioL = populacao.pessoas * hip.perCapitaLDia;
  const volumeNecessarioL = consumoDiarioL * hip.diasDeReserva;
  const caixas = (model.terminais ?? []).filter((t) => t.tipoHidraulico === 'RESERVATORIO');
  const temInferior = caixas.some((c) => inferiores.has(c.id));
  const inferiorNecessarioL = temInferior ? volumeNecessarioL * hip.fracaoInferior : 0;
  const superiorNecessarioL = volumeNecessarioL - inferiorNecessarioL;
  const reservatorios = caixas.map((t) => ({ terminalId: t.id, levelId: t.levelId, volumeL: volumeDoReservatorioL(t) }));
  const declaradoL = reservatorios.reduce((s, r) => s + (r.volumeL ?? 0), 0);
  let situacao: SituacaoDaReservacao;
  let texto: string;
  if (populacao.pessoas <= 0) {
    situacao = 'SEM_POPULACAO';
    texto = 'Nenhum dormitório identificado pelo nome dos ambientes: declare a população para dimensionar a reservação.';
  } else if (caixas.length === 0) {
    situacao = 'SEM_RESERVATORIO';
    texto = `Consumo diário ${litros(consumoDiarioL)}: reservar ${litros(volumeNecessarioL)} (sugerida: caixa de ${litros(volumeComercialL(volumeNecessarioL))}). Não há caixa d'água no desenho.`;
  } else if (reservatorios.some((r) => r.volumeL == null)) {
    situacao = 'SEM_VOLUME';
    texto = `Reservar ${litros(volumeNecessarioL)}, mas há caixa sem volume nem medidas: declare o volume para conferir.`;
  } else if (declaradoL + 1e-9 < volumeNecessarioL) {
    situacao = 'INSUFICIENTE';
    texto = `Reservar ${litros(volumeNecessarioL)}; o desenho tem ${litros(declaradoL)} — faltam ${litros(volumeNecessarioL - declaradoL)} (sugerida: ${litros(volumeComercialL(volumeNecessarioL))}).`;
  } else {
    situacao = 'ATENDE';
    texto = `Reservar ${litros(volumeNecessarioL)}; o desenho tem ${litros(declaradoL)}.`;
  }
  return {
    populacao,
    consumoDiarioL,
    volumeNecessarioL,
    inferiorNecessarioL,
    superiorNecessarioL,
    volumeSugeridoL: volumeComercialL(volumeNecessarioL),
    reservatorios,
    declaradoL,
    situacao,
    texto,
  };
}
