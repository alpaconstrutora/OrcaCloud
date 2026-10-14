/**
 * ÁREAS NBR 12721 — O DOCUMENTO DA VERSÃO (14/10/2026, Fase 8 do plano
 * `docs/planos/2026-10-13-areas-nbr12721-na-planta.md`).
 *
 * Monta, sem DOM e sem biblioteca, as tabelas que o PDF e o XLSX levam: Quadro
 * I (colunas 2 a 18 da norma), Quadro II (20 a 38), Quadro IV-B, frações,
 * pendências e aprovações — sempre a partir da SAÍDA CONGELADA na versão
 * publicada, nunca de um recálculo. O que sai no papel é o que o hash cobre.
 *
 * As células numéricas ficam como número (o XLSX grava número de verdade); o
 * PDF formata pela `ColunaDoDocumento.formato`, com o mesmo número de casas da
 * tela `TelaAreasNbr12721`.
 */
import type { SaidaNbr12721 } from './tipos';

export type FormatoDaColuna = 'texto' | 'm2' | 'coef' | 'decimal' | 'pct' | 'mil';

export interface ColunaDoDocumento {
  /** Título completo — o cabeçalho do XLSX (uma linha só, sem grupo). */
  titulo: string;
  /** Título curto, debaixo do grupo — o cabeçalho do PDF. Ausente = `titulo`. */
  curto?: string;
  formato: FormatoDaColuna;
}

/** Cabeçalho de grupo do PDF (como na norma: Privativa, Comum não proporcional…), da 2ª coluna em diante. */
export interface GrupoDeColunas {
  titulo: string;
  colunas: number;
}

export interface TabelaDoDocumento {
  /** Título da tabela no PDF. */
  titulo: string;
  /** Nome da aba no XLSX (≤ 31 caracteres). */
  aba: string;
  colunas: ColunaDoDocumento[];
  /** Grupos sobre as colunas 2…n; somam `colunas.length - 1`. Ausente = cabeçalho de uma linha. */
  grupos?: GrupoDeColunas[];
  linhas: (string | number)[][];
  /** Linha de total (soma das colunas numéricas), ou `null` quando não faz sentido. */
  total: (string | number)[] | null;
}

export interface AprovacaoDoDocumento {
  tipo: 'TECNICA' | 'JURIDICA';
  aprovadoEm: string;
  /** Nome (ou e-mail) de quem aprovou — o id só quando o nome não pôde ser lido. */
  por: string;
  hash: string;
  observacao: string | null;
}

export interface DocumentoNbr12721 {
  estudo: string;
  empresa: string;
  /** Do carimbo do template de pranchas da organização, quando houver. */
  responsavel: string | null;
  registro: string | null;
  revisao: number;
  hash: string;
  versaoMotor: string;
  congeladoEm: string;
  aprovacoes: AprovacaoDoDocumento[];
  saida: SaidaNbr12721;
}

const ROTULO_DA_APROVACAO: Record<AprovacaoDoDocumento['tipo'], string> = { TECNICA: 'Técnica', JURIDICA: 'Jurídica' };

const BLOCOS = [
  ['Privativa', 'private'],
  ['Comum não proporcional', 'common_nonprop'],
  ['Comum proporcional', 'common_prop'],
] as const;

/** Colunas de um bloco da norma: coberta padrão, diferente/descoberta (real), equivalente, real total, equivalente total. */
function colunasDoBloco(prefixo: string, primeira: number): ColunaDoDocumento[] {
  const c = (n: number, nome: string, curto: string): ColunaDoDocumento => ({ titulo: `${prefixo}: ${nome} (${n})`, curto: `${curto} (${n})`, formato: 'm2' });
  return [
    c(primeira, 'coberta padrão', 'Coberta padrão'),
    c(primeira + 1, 'dif./descoberta real', 'Dif./desc. real'),
    c(primeira + 2, 'dif./descoberta equiv.', 'Dif./desc. equiv.'),
    c(primeira + 3, 'real total', 'Real total'),
    c(primeira + 4, 'equiv. total', 'Equiv. total'),
  ];
}

function somaDasColunas(colunas: ColunaDoDocumento[], linhas: (string | number)[][], rotulo = 'Total'): (string | number)[] {
  return colunas.map((c, i) => (i === 0 ? rotulo : c.formato === 'texto' ? '' : linhas.reduce((s, l) => s + (typeof l[i] === 'number' ? (l[i] as number) : 0), 0)));
}

export function tabelasDoDocumentoNbr12721(d: DocumentoNbr12721): TabelaDoDocumento[] {
  const s = d.saida;
  const tabelas: TabelaDoDocumento[] = [];

  // Quadro I — por pavimento, colunas 2 a 18.
  {
    const colunas: ColunaDoDocumento[] = [
      { titulo: 'Pavimento', formato: 'texto' },
      ...colunasDoBloco('Priv.', 2),
      ...colunasDoBloco('Não prop.', 7),
      ...colunasDoBloco('Prop.', 12),
      { titulo: 'Pavimento: real total (17)', curto: 'Real (17)', formato: 'm2' },
      { titulo: 'Pavimento: equiv. total (18)', curto: 'Equiv. (18)', formato: 'm2' },
    ];
    const grupos: GrupoDeColunas[] = [
      { titulo: 'Área privativa', colunas: 5 },
      { titulo: 'Área comum não proporcional', colunas: 5 },
      { titulo: 'Área comum proporcional', colunas: 5 },
      { titulo: 'Total do pavimento', colunas: 2 },
    ];
    const linhas = s.quadroI.map((l) => [
      l.floor_label,
      l.qi_02_private_covered_standard_raw,
      l.qi_03_private_nonstandard_or_uncovered_raw,
      l.qi_04_private_equivalent_raw,
      l.qi_05_private_real_total_raw,
      l.qi_06_private_equivalent_total_raw,
      l.qi_07_common_nonprop_covered_standard_raw,
      l.qi_08_common_nonprop_nonstandard_or_uncovered_raw,
      l.qi_09_common_nonprop_equivalent_raw,
      l.qi_10_common_nonprop_real_total_raw,
      l.qi_11_common_nonprop_equivalent_total_raw,
      l.qi_12_common_prop_covered_standard_raw,
      l.qi_13_common_prop_nonstandard_or_uncovered_raw,
      l.qi_14_common_prop_equivalent_raw,
      l.qi_15_common_prop_real_total_raw,
      l.qi_16_common_prop_equivalent_total_raw,
      l.qi_17_floor_real_total_raw,
      l.qi_18_floor_equivalent_total_raw,
    ]);
    tabelas.push({ titulo: 'Quadro I — Áreas por pavimento', aba: 'Quadro I', colunas, grupos, linhas, total: somaDasColunas(colunas, linhas) });
  }

  // Quadro II — por unidade, colunas 20 a 38.
  {
    const colunas: ColunaDoDocumento[] = [
      { titulo: 'Unidade', formato: 'texto' },
      ...colunasDoBloco('Priv.', 20),
      ...colunasDoBloco('Não prop.', 25),
      { titulo: 'Não prop.: equiv. total da unidade (30)', curto: 'Priv. + não prop. equiv. (30)', formato: 'm2' },
      { titulo: 'Coeficiente de proporcionalidade (31)', curto: 'Coef. proporc. (31)', formato: 'coef' },
      ...colunasDoBloco('Prop.', 32),
      { titulo: 'Unidade: real total (37)', curto: 'Real (37)', formato: 'm2' },
      { titulo: 'Unidade: equiv. total (38)', curto: 'Equiv. (38)', formato: 'm2' },
    ];
    const grupos: GrupoDeColunas[] = [
      { titulo: 'Área privativa', colunas: 5 },
      { titulo: 'Área comum não proporcional', colunas: 5 },
      { titulo: 'Proporcionalidade', colunas: 2 },
      { titulo: 'Área comum proporcional', colunas: 5 },
      { titulo: 'Total da unidade', colunas: 2 },
    ];
    const linhas = s.quadroII.map((l) => [
      l.unit_label,
      l.qii_20_private_covered_standard_raw,
      l.qii_21_private_nonstandard_or_uncovered_raw,
      l.qii_22_private_equivalent_raw,
      l.qii_23_private_real_total_raw,
      l.qii_24_private_equivalent_total_raw,
      l.qii_25_common_nonprop_covered_standard_raw,
      l.qii_26_common_nonprop_nonstandard_or_uncovered_raw,
      l.qii_27_common_nonprop_equivalent_raw,
      l.qii_28_common_nonprop_real_total_raw,
      l.qii_29_common_nonprop_equivalent_total_raw,
      l.qii_30_nonprop_equivalent_total_raw,
      l.qii_31_proportionality_coefficient_raw,
      l.qii_32_common_prop_covered_standard_raw,
      l.qii_33_common_prop_nonstandard_or_uncovered_raw,
      l.qii_34_common_prop_equivalent_raw,
      l.qii_35_common_prop_real_total_raw,
      l.qii_36_common_prop_equivalent_total_raw,
      l.qii_37_unit_real_total_raw,
      l.qii_38_unit_equivalent_total_raw,
    ]);
    tabelas.push({ titulo: 'Quadro II — Áreas por unidade autônoma', aba: 'Quadro II', colunas, grupos, linhas, total: somaDasColunas(colunas, linhas) });
  }

  // Quadro IV-B — áreas de cada unidade para a especificação de condomínio.
  {
    const colunas: ColunaDoDocumento[] = [
      { titulo: 'Unidade', formato: 'texto' },
      { titulo: 'Privativa principal (b)', formato: 'm2' },
      { titulo: 'Privativa acessória (c)', formato: 'm2' },
      { titulo: 'Privativa total (d)', formato: 'm2' },
      { titulo: 'Comum (e)', formato: 'm2' },
      { titulo: 'Real total (f)', formato: 'm2' },
      { titulo: 'Coeficiente de proporcionalidade (g)', formato: 'coef' },
    ];
    const linhas = s.quadroIVB.map((l) => [
      l.unit_label,
      l.qivb_b_private_main_area_raw,
      l.qivb_c_private_accessory_area_raw,
      l.qivb_d_private_total_area_raw,
      l.qivb_e_common_area_raw,
      l.qivb_f_real_total_area_raw,
      l.qivb_g_proportionality_coefficient_raw,
    ]);
    tabelas.push({ titulo: 'Quadro IV-B — Áreas das unidades autônomas', aba: 'Quadro IV-B', colunas, linhas, total: somaDasColunas(colunas, linhas) });
  }

  // Frações ideais — os milésimos FECHADOS em 1000 (maior resto) são os do cartório.
  {
    const colunas: ColunaDoDocumento[] = [
      { titulo: 'Unidade', formato: 'texto' },
      { titulo: 'Coeficiente de origem', formato: 'coef' },
      { titulo: 'Fração (decimal)', formato: 'decimal' },
      { titulo: 'Fração (%)', formato: 'pct' },
      { titulo: 'Milésimos (fechados em 1000)', formato: 'mil' },
    ];
    const linhas = s.fracoes.map((f) => [f.unidade, f.source_coefficient, f.fraction_decimal_raw, f.fraction_percent_raw, f.milesimos]);
    tabelas.push({ titulo: 'Frações ideais', aba: 'Frações', colunas, linhas, total: somaDasColunas(colunas, linhas) });
  }

  // Pendências e avisos — o documento diz o que o motor disse, inclusive os FECH_*.
  tabelas.push({
    titulo: 'Pendências e avisos do cálculo',
    aba: 'Pendências',
    colunas: [
      { titulo: 'Código', formato: 'texto' },
      { titulo: 'Tipo', formato: 'texto' },
      { titulo: 'Mensagem', formato: 'texto' },
      { titulo: 'Itens', formato: 'texto' },
    ],
    linhas: s.pendencias.map((p) => [p.codigo, p.bloqueante ? 'Bloqueante' : 'Aviso', p.mensagem, p.itens.join(', ')]),
    total: null,
  });

  tabelas.push({
    titulo: 'Aprovações',
    aba: 'Aprovações',
    colunas: [
      { titulo: 'Tipo', formato: 'texto' },
      { titulo: 'Aprovada em', formato: 'texto' },
      { titulo: 'Por', formato: 'texto' },
      { titulo: 'Hash aprovado', formato: 'texto' },
      { titulo: 'Observação', formato: 'texto' },
    ],
    linhas: d.aprovacoes.map((a) => [ROTULO_DA_APROVACAO[a.tipo], new Date(a.aprovadoEm).toLocaleString('pt-BR'), a.por, a.hash, a.observacao ?? '']),
    total: null,
  });

  return tabelas;
}

/** "Técnica e jurídica aprovadas" / "Só técnica aprovada" / "Sem aprovação" — o que o cabeçalho afirma. */
export function situacaoDasAprovacoes(aprovacoes: readonly Pick<AprovacaoDoDocumento, 'tipo'>[]): string {
  const t = aprovacoes.some((a) => a.tipo === 'TECNICA');
  const j = aprovacoes.some((a) => a.tipo === 'JURIDICA');
  return t && j ? 'Técnica e jurídica aprovadas' : t ? 'Só a técnica aprovada' : 'Sem aprovação';
}

/** As linhas do cabeçalho (resumo), na ordem em que o PDF e a aba "Resumo" as mostram. */
export function cabecalhoDoDocumentoNbr12721(d: DocumentoNbr12721): [string, string][] {
  return [
    ['Empresa', d.empresa],
    ...(d.responsavel ? [['Responsável técnico', d.registro ? `${d.responsavel} — ${d.registro}` : d.responsavel] as [string, string]] : []),
    ['Estudo', d.estudo],
    ['Versão', `${d.revisao} · hash ${d.hash}`],
    ['Congelada em', new Date(d.congeladoEm).toLocaleString('pt-BR')],
    ['Motor', d.versaoMotor],
    ['Situação do cálculo', d.saida.status === 'success' ? 'Sem pendência bloqueante' : 'COM pendência bloqueante'],
    ['Aprovações', situacaoDasAprovacoes(d.aprovacoes)],
  ];
}

const FORMATOS: Record<Exclude<FormatoDaColuna, 'texto'>, Intl.NumberFormatOptions> = {
  m2: { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  coef: { minimumFractionDigits: 6, maximumFractionDigits: 6 },
  decimal: { minimumFractionDigits: 10, maximumFractionDigits: 10 },
  pct: { minimumFractionDigits: 4, maximumFractionDigits: 4 },
  mil: { minimumFractionDigits: 4, maximumFractionDigits: 4 },
};

/** A célula como o PDF a imprime (pt-BR, as casas da tela). */
export function celulaFormatada(valor: string | number, formato: FormatoDaColuna): string {
  if (typeof valor !== 'number' || formato === 'texto') return String(valor);
  return valor.toLocaleString('pt-BR', FORMATOS[formato]);
}

/** Nome de arquivo sem acento nem espaço: `areas_nbr12721_<estudo>_v<revisão>`. */
export function nomeDoArquivoNbr12721(d: Pick<DocumentoNbr12721, 'estudo' | 'revisao'>): string {
  const base = d.estudo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return `areas_nbr12721_${base || 'estudo'}_v${d.revisao}`;
}

export interface VersaoCandidataAoMemorial {
  snapshotId: string;
  revisao: number;
  aprovacoes: readonly Pick<AprovacaoDoDocumento, 'tipo'>[];
}

/**
 * Qual versão o memorial de incorporação cita: a de revisão mais alta com
 * técnica E jurídica; senão a mais alta só com a técnica; senão a mais alta
 * congelada. O memorial é MINUTA — sai mesmo sem aprovação, mas o cabeçalho
 * diz a situação (`situacaoDasAprovacoes`) e a seção leva o aviso.
 */
export function versaoDoMemorial(candidatas: readonly VersaoCandidataAoMemorial[]): VersaoCandidataAoMemorial | null {
  const ordem = [...candidatas].sort((a, b) => b.revisao - a.revisao);
  const tem = (v: VersaoCandidataAoMemorial, t: AprovacaoDoDocumento['tipo']) => v.aprovacoes.some((a) => a.tipo === t);
  return ordem.find((v) => tem(v, 'TECNICA') && tem(v, 'JURIDICA')) ?? ordem.find((v) => tem(v, 'TECNICA')) ?? ordem[0] ?? null;
}
