/**
 * D1.2 (plano `2026-10-01-incendio-backlog-pos-roadmap.md`) — HIDRANTES E MANGOTINHOS PELA IT 17 DO CBMMG.
 *
 * Transcrição das Tabelas 2 e 4 da IT 17 (1ª ed., alterada pela Portaria 70/2022), lidas pela
 * imagem das pp. 16–17 — o texto humano está em `docs/normas/incendio-mg/it17-tabelas.txt`, e o
 * teste `incendioHidrantesMG.test.ts` relê aquele texto e confere estes dados.
 *
 * O que a IT 17 decide, e que o rascunho tinha errado:
 *  - o TIPO do sistema (1 = mangotinho; 2 a 5 = hidrante) e a RESERVA DE INCÊNDIO saem da Tabela 4
 *    (área × grupo/divisão × carga) — a reserva é um VOLUME DE TABELA (5.9.2), não vazão × tempo;
 *  - a vazão mínima por saída é a da Tabela 2 (grupo A no mangotinho: 80 LPM, nota 2);
 *  - a cobertura é pelo trajeto real da mangueira, DESCONSIDERANDO o jato (5.8.2);
 *  - a IT NÃO fixa pressão mínima no esguicho: vale a vazão da Tabela 2 e o jato de 8 m (5.12.1).
 *    Para o jato compacto, a pressão que dá a vazão sai da fórmula do orifício (Cd 0,98) —
 *    física, não norma: CONFERIR com o catálogo do esguicho.
 */
import type { BlueprintModel } from './blueprintKernel';
import type { ClassificacaoDaEdificacao } from './blueprintIncendioClassificacao';
import type { HipotesesHidraulicasDeIncendio } from './blueprintCalculoIncendio';

export const FONTE_IT17_MG = 'IT 17 do CBMMG (Portaria 70/2022)';

export interface TipoDeSistemaIT17 {
  tipo: 1 | 2 | 3 | 4 | 5;
  sistema: 'Mangotinho' | 'Hidrante';
  esguicho: string;
  /** Jato compacto: o diâmetro do requinte (mm). `null` = só regulável (tipo 1). */
  requinteMm: number | null;
  /** Diâmetros de mangueira admitidos (mm); o primeiro é o usado por padrão. */
  mangueiraMm: readonly number[];
  comprimentoMaximoM: number;
  expedicoes: 'Simples' | 'Duplo';
  vazaoMinimaLmin: number;
}

/** IT 17, Tabela 2 (p. 16). */
export const TABELA_2_IT17: readonly TipoDeSistemaIT17[] = [
  { tipo: 1, sistema: 'Mangotinho', esguicho: 'Jato regulável', requinteMm: null, mangueiraMm: [25, 32], comprimentoMaximoM: 45, expedicoes: 'Simples', vazaoMinimaLmin: 100 },
  { tipo: 2, sistema: 'Hidrante', esguicho: 'Jato compacto Ø 13 mm ou regulável', requinteMm: 13, mangueiraMm: [40], comprimentoMaximoM: 30, expedicoes: 'Simples', vazaoMinimaLmin: 125 },
  { tipo: 3, sistema: 'Hidrante', esguicho: 'Jato compacto Ø 16 mm ou regulável', requinteMm: 16, mangueiraMm: [40], comprimentoMaximoM: 30, expedicoes: 'Simples', vazaoMinimaLmin: 250 },
  { tipo: 4, sistema: 'Hidrante', esguicho: 'Jato compacto Ø 19 mm ou regulável', requinteMm: 19, mangueiraMm: [40, 65], comprimentoMaximoM: 30, expedicoes: 'Simples', vazaoMinimaLmin: 400 },
  { tipo: 5, sistema: 'Hidrante', esguicho: 'Jato compacto Ø 25 mm ou regulável', requinteMm: 25, mangueiraMm: [65], comprimentoMaximoM: 30, expedicoes: 'Duplo', vazaoMinimaLmin: 650 },
];
/** Tabela 2, nota 2: grupo A no mangotinho. */
export const VAZAO_DO_MANGOTINHO_GRUPO_A_LMIN = 80;
/** Tabela 2, nota 3 e 5.8.3: A-2 e A-3 podem usar 45 m quando o trajeto real passar de 30 m. */
export const MANGUEIRA_ESTENDIDA_A2_A3_M = 45;

/** Uma regra de coluna da Tabela 4: as divisões, e a faixa de carga quando a coluna a pede (MJ/m²). */
interface RegraDaColuna {
  divisoes: readonly string[];
  cargaAcimaDe?: number;
  cargaAte?: number;
}
export interface ColunaDaTabela4 {
  coluna: 1 | 2 | 3 | 4;
  regras: readonly RegraDaColuna[];
}

/** IT 17, Tabela 4 (p. 17) — as colunas de grupo/divisão. */
export const COLUNAS_TABELA_4_IT17: readonly ColunaDaTabela4[] = [
  {
    coluna: 1,
    regras: [
      { divisoes: ['A-2', 'A-3', 'C-1', 'D-2', 'E-1', 'E-2', 'E-3', 'E-4', 'E-6', 'F-2', 'F-3', 'F-4', 'F-8', 'G-1', 'G-2', 'G-3', 'H-1', 'H-2', 'H-3', 'H-5', 'H-6', 'I-1', 'J-1', 'J-2'] },
      { divisoes: ['D-1', 'D-3', 'D-4', 'F-1', 'F-10', 'F-11', 'G-4', 'M-3'], cargaAte: 300 },
    ],
  },
  {
    coluna: 2,
    regras: [
      { divisoes: ['B-1', 'B-2', 'C-3', 'E-5', 'F-5', 'F-6', 'F-7', 'F-9', 'H-4'] },
      { divisoes: ['D-1', 'D-3', 'D-4', 'F-11', 'G-4'], cargaAcimaDe: 300 },
      { divisoes: ['C-2', 'F-10', 'I-2', 'J-3', 'M-3'], cargaAcimaDe: 300, cargaAte: 800 },
    ],
  },
  {
    coluna: 3,
    regras: [
      { divisoes: ['G-5', 'L-1', 'M-1'] },
      { divisoes: ['C-2', 'F-10', 'I-2', 'J-3', 'M-3'], cargaAcimaDe: 800 },
      { divisoes: ['F-1'], cargaAcimaDe: 300 },
    ],
  },
  { coluna: 4, regras: [{ divisoes: ['I-3', 'J-4', 'L-2', 'L-3'] }] },
];

/** As faixas de área da Tabela 4 (m², limite superior inclusivo). */
export const FAIXAS_DE_AREA_TABELA_4 = [3000, 6000, 10000, 15000, 30000, Infinity] as const;
const ROTULO_DA_FAIXA = ['até 3.000 m²', 'de 3.001 a 6.000 m²', 'de 6.001 a 10.000 m²', 'de 10.001 a 15.000 m²', 'de 15.001 a 30.000 m²', 'acima de 30.000 m²'];

/** As células da Tabela 4: [tipo, reserva m³] por faixa de área. A coluna 1 tem duas subcolunas. */
export const CELULAS_TABELA_4_IT17: Readonly<Record<'1.1' | '1.2' | '2' | '3' | '4', readonly (readonly [number, number])[]>> = {
  '1.1': [[1, 6], [1, 8], [1, 12], [1, 16], [1, 25], [1, 35]],
  '1.2': [[2, 8], [2, 12], [2, 16], [2, 20], [2, 35], [2, 47]],
  '2': [[3, 12], [3, 18], [3, 25], [3, 30], [3, 40], [3, 60]],
  '3': [[3, 20], [4, 20], [4, 30], [5, 45], [5, 50], [5, 90]],
  '4': [[3, 20], [4, 30], [5, 50], [5, 80], [5, 110], [5, 140]],
};

export interface SistemaDeHidrantesMG {
  tipo: TipoDeSistemaIT17;
  reservaM3: number;
  coluna: 1 | 2 | 3 | 4;
  faixa: string;
  /** Na coluna 1, a outra opção (tipo 1 ↔ tipo 2) — a escolha é do projeto. */
  alternativa: { tipo: TipoDeSistemaIT17; reservaM3: number } | null;
  motivo: string;
  fonte: string;
}

const casa = (r: RegraDaColuna, divisao: string, carga: number | null): boolean | 'SEM_CARGA' => {
  if (!r.divisoes.includes(divisao)) return false;
  if (r.cargaAcimaDe == null && r.cargaAte == null) return true;
  if (carga == null) return 'SEM_CARGA';
  return (r.cargaAcimaDe == null || carga > r.cargaAcimaDe) && (r.cargaAte == null || carga <= r.cargaAte);
};

/**
 * O sistema que a IT 17 pede para a edificação: a coluna pela divisão (e pela carga, quando a
 * coluna a usa) e a linha pela área total. Na coluna 1, `preferirMangotinho` escolhe o tipo 1;
 * senão o tipo 2 (e o outro vem em `alternativa`). `{ motivo }` sem sistema = a tabela não decide.
 */
export function sistemaDeHidrantesMG(
  c: Pick<ClassificacaoDaEdificacao, 'divisao' | 'carga' | 'areaTotalM2'>,
  preferirMangotinho = false,
): SistemaDeHidrantesMG | { motivo: string } {
  const divisao = c.divisao.valor;
  if (!divisao) return { motivo: 'sem divisão de ocupação — a Tabela 4 da IT 17 vai pela divisão' };
  if (divisao === 'M-2') return { motivo: 'M-2: a Tabela 4 manda adotar o item 5.18.1 (NBR 17505) — nota 2' };
  if (divisao === 'M-5' || divisao === 'M-8') return { motivo: `${divisao}: consultar a IT específica (Tabela 4, nota 3)` };
  const carga = c.carga.valorMJm2;
  let semCarga = false;
  const col = COLUNAS_TABELA_4_IT17.find((k) =>
    k.regras.some((r) => {
      const x = casa(r, divisao, carga);
      if (x === 'SEM_CARGA') semCarga = true;
      return x === true;
    }),
  );
  if (!col) {
    return {
      motivo: semCarga
        ? `${divisao}: a coluna da Tabela 4 depende da carga de incêndio — declare-a`
        : `${divisao}${carga != null ? ` com ${carga} MJ/m²` : ''} não consta na Tabela 4 da IT 17 — avaliação do responsável técnico`,
    };
  }
  const i = FAIXAS_DE_AREA_TABELA_4.findIndex((lim) => c.areaTotalM2 <= lim);
  const tipo = (n: number) => TABELA_2_IT17.find((t) => t.tipo === n)!;
  const celula = (k: keyof typeof CELULAS_TABELA_4_IT17) => ({ tipo: tipo(CELULAS_TABELA_4_IT17[k][i][0]), reservaM3: CELULAS_TABELA_4_IT17[k][i][1] });
  const principal = col.coluna === 1 ? celula(preferirMangotinho ? '1.1' : '1.2') : celula(String(col.coluna) as '2' | '3' | '4');
  const alternativa = col.coluna === 1 ? celula(preferirMangotinho ? '1.2' : '1.1') : null;
  return {
    ...principal,
    coluna: col.coluna,
    faixa: ROTULO_DA_FAIXA[i],
    alternativa,
    motivo: `${divisao}${carga != null ? `, ${carga} MJ/m²` : ''}, área total ${ROTULO_DA_FAIXA[i]}: tipo ${principal.tipo.tipo} (${principal.tipo.sistema.toLowerCase()}), reserva de ${principal.reservaM3} m³`,
    fonte: `${FONTE_IT17_MG}, Tabela 4 (coluna ${col.coluna}) e Tabela 2`,
  };
}

/** A Tabela 4 decidiu o sistema (e não devolveu só o motivo)? */
export function temSistema(s: SistemaDeHidrantesMG | { motivo: string } | null): s is SistemaDeHidrantesMG {
  return !!s && 'tipo' in s;
}

/** O desenho tem só mangotinho (nenhum hidrante)? Escolhe a subcoluna da coluna 1 pelo que foi lançado. */
export function desenhoPrefereMangotinho(model: BlueprintModel): boolean {
  const ts = (model.terminais ?? []).filter((t) => t.disciplina === 'INCENDIO');
  return ts.some((t) => t.tipoHidraulico === 'MANGOTINHO') && !ts.some((t) => t.tipoHidraulico === 'HIDRANTE_SIMPLES' || t.tipoHidraulico === 'HIDRANTE_DUPLO');
}

/** A pressão (kPa) que o jato compacto de requinte `d` (mm) precisa para dar `q` (L/min): Q = 0,2046·d²·√P(mca). */
export function pressaoDoJatoCompactoKpa(requinteMm: number, vazaoLmin: number): number {
  const mca = (vazaoLmin / (0.2046 * requinteMm * requinteMm)) ** 2;
  return Math.round(mca * 9.80665);
}

/**
 * As premissas hidráulicas que a IT 17 dá para o sistema (o botão "Usar os valores da IT 17"):
 * vazões das Tabelas 2, mangueiras no máximo da tabela, jato FORA da cobertura (5.8.2), dois jatos
 * simultâneos (5.8.4), 1.000 kPa (5.8.9) e 5 m/s (5.8.12). A pressão do hidrante sai do orifício
 * do requinte; a do mangotinho (regulável) fica a que o estudo já tem — é do catálogo.
 */
export function premissasDaIT17(s: SistemaDeHidrantesMG, grupo: string | null, hip: HipotesesHidraulicasDeIncendio): HipotesesHidraulicasDeIncendio {
  const hidrante = s.tipo.tipo === 1 ? s.alternativa?.tipo ?? TABELA_2_IT17[1] : s.tipo;
  const mangotinho = TABELA_2_IT17[0];
  return {
    ...hip,
    hidrantesSimultaneos: 2,
    vazaoMinimaHidranteLmin: hidrante.vazaoMinimaLmin,
    pressaoMinimaHidranteKpa: hidrante.requinteMm ? pressaoDoJatoCompactoKpa(hidrante.requinteMm, hidrante.vazaoMinimaLmin) : hip.pressaoMinimaHidranteKpa,
    comprimentoMangueiraHidranteM: hidrante.comprimentoMaximoM,
    diametroMangueiraHidranteMm: hidrante.mangueiraMm[0],
    vazaoMinimaMangotinhoLmin: grupo === 'A' ? VAZAO_DO_MANGOTINHO_GRUPO_A_LMIN : mangotinho.vazaoMinimaLmin,
    comprimentoMangueiraMangotinhoM: mangotinho.comprimentoMaximoM,
    diametroMangueiraMangotinhoMm: mangotinho.mangueiraMm[0],
    pressaoMaximaKpa: 1000,
    velocidadeMaxMs: 5,
    alcanceDoJatoM: 0,
  };
}

/** O que, nas premissas do estudo, DIVERGE da IT 17 para o sistema — uma frase por divergência. */
export function divergenciasDaIT17(s: SistemaDeHidrantesMG, grupo: string | null, divisao: string | null, hip: HipotesesHidraulicasDeIncendio): string[] {
  const it = premissasDaIT17(s, grupo, hip);
  const fora: string[] = [];
  if (hip.hidrantesSimultaneos !== 2) fora.push(`Hidrantes simultâneos: ${hip.hidrantesSimultaneos} — a IT 17 pede os dois jatos mais desfavoráveis (5.8.4)`);
  if (hip.vazaoMinimaHidranteLmin < it.vazaoMinimaHidranteLmin) fora.push(`Hidrante: ${hip.vazaoMinimaHidranteLmin} L/min — a IT 17 pede ${it.vazaoMinimaHidranteLmin} L/min por saída (Tabela 2)`);
  if (hip.vazaoMinimaMangotinhoLmin < it.vazaoMinimaMangotinhoLmin) fora.push(`Mangotinho: ${hip.vazaoMinimaMangotinhoLmin} L/min — a IT 17 pede ${it.vazaoMinimaMangotinhoLmin} L/min (Tabela 2)`);
  const maxHidrante = divisao === 'A-2' || divisao === 'A-3' ? MANGUEIRA_ESTENDIDA_A2_A3_M : it.comprimentoMangueiraHidranteM;
  if (hip.comprimentoMangueiraHidranteM > maxHidrante) fora.push(`Mangueira do hidrante de ${hip.comprimentoMangueiraHidranteM} m — máximo ${maxHidrante} m (Tabela 2)`);
  if (hip.comprimentoMangueiraMangotinhoM > it.comprimentoMangueiraMangotinhoM) fora.push(`Mangueira do mangotinho de ${hip.comprimentoMangueiraMangotinhoM} m — máximo ${it.comprimentoMangueiraMangotinhoM} m (Tabela 2)`);
  if (hip.alcanceDoJatoM > 0) fora.push(`Jato de ${hip.alcanceDoJatoM} m somado à cobertura — a IT 17 desconsidera o alcance do jato (5.8.2)`);
  if (hip.velocidadeMaxMs > 5) fora.push(`Velocidade máxima de ${hip.velocidadeMaxMs} m/s — a IT 17 limita a 5 m/s (5.8.12)`);
  if (hip.pressaoMaximaKpa > 1000) fora.push(`Pressão máxima de ${hip.pressaoMaximaKpa} kPa — a IT 17 recomenda até 1.000 kPa (5.8.9)`);
  return fora;
}
