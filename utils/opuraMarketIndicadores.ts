// utils/opuraMarketIndicadores.ts
//
// Saturação e Score Potencial do bairro no ÒPURA Market.
// Plano: docs/planos/2026-10-10-opura-market-pendencias.md, item 3.
//
// ─── De onde vem a demanda ──────────────────────────────────────────────────
// Não há dado de venda. A medida que existe é a SAÍDA de anúncio do feed salvo:
// anúncio que some do feed foi vendido ou retirado (item 1 grava `removed_at`).
// Meses de estoque = anúncios ativos ÷ saídas por mês.
//
// ⚠️ A regra que eu tinha oferecido ao usuário — "ativos ÷ (ativos × VSO)" — dava
// 1/VSO, o MESMO número em todo bairro. Ela foi trocada antes de implementar.
//
// Sem histórico mínimo de feed, ou sem nenhuma saída na janela, o bairro NÃO
// recebe número: a tela diz o motivo. Um número inventado aqui viraria decisão
// de produto.
//
// Toda folga é hipótese editável (faixas, pesos, janela, tetos), com padrão.

export type FaixaDeSaturacao = 'Escassez' | 'Saudável' | 'Atenção' | 'Saturado';

export interface HipotesesIndicadores {
  /** Janela de saídas e de tendência de preço, em meses. */
  janelaMeses: number;
  /** Abaixo disto de histórico de feed, não calcula. */
  mesesMinimosHistorico: number;
  /** Faixas de meses de estoque: até X = Escassez, até Y = Saudável, até Z = Atenção, acima = Saturado. */
  escassezAte: number;
  saudavelAte: number;
  atencaoAte: number;
  /** Pesos do Score Potencial. */
  pesoEstoque: number;
  pesoTendencia: number;
  pesoPrecoRelativo: number;
  /** Alta de preço na janela que já vale nota máxima na tendência (%). */
  tetoTendencia: number;
  /** Desconto em relação à média da praça que já vale nota máxima (%). */
  descontoMaximo: number;
}

export const HIPOTESES_INDICADORES_PADRAO: HipotesesIndicadores = {
  janelaMeses: 6,
  mesesMinimosHistorico: 3,
  escassezAte: 6,
  saudavelAte: 12,
  atencaoAte: 18,
  pesoEstoque: 40,
  pesoTendencia: 35,
  pesoPrecoRelativo: 25,
  tetoTendencia: 10,
  descontoMaximo: 20,
};

export interface DescricaoHipoteseIndicador {
  chave: keyof HipotesesIndicadores;
  rotulo: string;
  unidade: string;
  min: number;
  max: number;
  passo: number;
  explicacao: string;
}

export const DESCRICAO_HIPOTESES_INDICADORES: DescricaoHipoteseIndicador[] = [
  { chave: 'janelaMeses', rotulo: 'Janela', unidade: 'meses', min: 1, max: 36, passo: 1,
    explicacao: 'Período em que as saídas são contadas e em que a tendência de preço é medida.' },
  { chave: 'mesesMinimosHistorico', rotulo: 'Histórico mínimo', unidade: 'meses', min: 1, max: 36, passo: 1,
    explicacao: 'Com menos histórico de feed do que isto, o bairro fica sem número.' },
  { chave: 'escassezAte', rotulo: 'Escassez até', unidade: 'meses de estoque', min: 0.5, max: 120, passo: 0.5,
    explicacao: 'Estoque que vende em até este tempo indica falta de oferta.' },
  { chave: 'saudavelAte', rotulo: 'Saudável até', unidade: 'meses de estoque', min: 0.5, max: 120, passo: 0.5,
    explicacao: 'Acima de Escassez e até este tempo, mercado equilibrado.' },
  { chave: 'atencaoAte', rotulo: 'Atenção até', unidade: 'meses de estoque', min: 0.5, max: 240, passo: 0.5,
    explicacao: 'Acima de Saudável e até este tempo, Atenção; acima disso, Saturado.' },
  { chave: 'pesoEstoque', rotulo: 'Peso do estoque baixo', unidade: 'pontos', min: 0, max: 100, passo: 1,
    explicacao: 'Quanto pesa no Score o estoque vender rápido (zero meses = nota máxima; "Atenção até" ou mais = zero).' },
  { chave: 'pesoTendencia', rotulo: 'Peso da alta de preço', unidade: 'pontos', min: 0, max: 100, passo: 1,
    explicacao: 'Quanto pesa no Score o preço por m² ter subido na janela (queda = zero).' },
  { chave: 'pesoPrecoRelativo', rotulo: 'Peso do preço abaixo da praça', unidade: 'pontos', min: 0, max: 100, passo: 1,
    explicacao: 'Quanto pesa no Score o preço por m² do bairro estar abaixo da média da praça (espaço para subir).' },
  { chave: 'tetoTendencia', rotulo: 'Alta que vale nota máxima', unidade: '%', min: 0.5, max: 100, passo: 0.5,
    explicacao: 'Alta de preço na janela a partir da qual a parte de tendência fica cheia.' },
  { chave: 'descontoMaximo', rotulo: 'Desconto que vale nota máxima', unidade: '%', min: 0.5, max: 100, passo: 0.5,
    explicacao: 'Diferença abaixo da média da praça a partir da qual a parte de preço relativo fica cheia.' },
];

export function validarHipotesesIndicadores(h: HipotesesIndicadores): string[] {
  const erros: string[] = [];
  for (const d of DESCRICAO_HIPOTESES_INDICADORES) {
    const v = h[d.chave];
    if (!Number.isFinite(v)) erros.push(`${d.rotulo}: informe um número.`);
    else if (v < d.min || v > d.max) erros.push(`${d.rotulo}: entre ${d.min} e ${d.max}.`);
  }
  if (h.escassezAte >= h.saudavelAte || h.saudavelAte >= h.atencaoAte) {
    erros.push('As faixas precisam crescer: Escassez < Saudável < Atenção.');
  }
  if (h.pesoEstoque + h.pesoTendencia + h.pesoPrecoRelativo <= 0) {
    erros.push('Pelo menos um peso do Score precisa ser maior que zero.');
  }
  return erros;
}

/** Hipóteses gravadas na configuração da praça; campo ausente ou inválido cai no padrão. */
export function hipotesesIndicadoresGravadas(gravadas: Record<string, unknown> | null | undefined): HipotesesIndicadores {
  const h = { ...HIPOTESES_INDICADORES_PADRAO };
  if (!gravadas) return h;
  for (const d of DESCRICAO_HIPOTESES_INDICADORES) {
    const v = Number(gravadas[d.chave]);
    if (gravadas[d.chave] != null && Number.isFinite(v)) h[d.chave] = v;
  }
  return h;
}

/** O que a RPC get_market_neighborhood_dinamica devolve por bairro. */
export interface DinamicaDoBairro {
  ativos: number;
  saidas: number;
  precoAtual: number | null;
  precoInicioJanela: number | null;
  /** Primeira captura de anúncio de feed salvo na cidade; null = nunca houve feed salvo. */
  inicioHistorico: string | null;
}

export interface IndicadoresDoBairro {
  saturacao: FaixaDeSaturacao | null;
  mesesDeEstoque: number | null;
  score: number | null;
  /** Por que não há número (quando não há). */
  motivo: string | null;
  /** Cada parte do Score (0–1) e quanto ela somou — para o `title` da tela. */
  partes: { estoque: number | null; tendencia: number | null; precoRelativo: number | null };
  variacaoPreco: number | null;
  diferencaPraca: number | null;
}

const MS_POR_MES = 30.4375 * 24 * 3600 * 1000;
const limitar = (v: number) => Math.min(1, Math.max(0, v));

/** Meses entre o início do histórico e `agora`, limitado à janela. */
export function mesesObservados(inicioHistorico: string | null, janelaMeses: number, agora: Date = new Date()): number {
  if (!inicioHistorico) return 0;
  const m = (agora.getTime() - new Date(inicioHistorico).getTime()) / MS_POR_MES;
  return Math.max(0, Math.min(janelaMeses, m));
}

export function faixaDeSaturacao(meses: number, h: HipotesesIndicadores): FaixaDeSaturacao {
  if (meses <= h.escassezAte) return 'Escassez';
  if (meses <= h.saudavelAte) return 'Saudável';
  if (meses <= h.atencaoAte) return 'Atenção';
  return 'Saturado';
}

/**
 * Saturação (faixa de meses de estoque) e Score Potencial (0–100) de um bairro.
 * `precoMedioPraca` é a média de preço por m² dos bairros da praça, ponderada
 * pelos anúncios ativos (ver `precoMedioDaPraca`).
 */
export function calcularIndicadoresDoBairro(
  d: DinamicaDoBairro,
  precoMedioPraca: number | null,
  h: HipotesesIndicadores,
  agora: Date = new Date(),
): IndicadoresDoBairro {
  const vazio = (motivo: string): IndicadoresDoBairro => ({
    saturacao: null, mesesDeEstoque: null, score: null, motivo,
    partes: { estoque: null, tendencia: null, precoRelativo: null }, variacaoPreco: null, diferencaPraca: null,
  });
  if (!d.inicioHistorico) return vazio('Sem histórico de saídas: nenhum feed salvo foi importado nesta cidade.');
  const meses = mesesObservados(d.inicioHistorico, h.janelaMeses, agora);
  if (meses < h.mesesMinimosHistorico) {
    return vazio(`Sem histórico de saídas suficiente: ${meses.toFixed(1).replace('.', ',')} de ${h.mesesMinimosHistorico} meses de feed.`);
  }
  if (d.ativos <= 0) return vazio('Nenhum anúncio ativo no bairro.');
  if (d.saidas <= 0) return vazio(`Nenhuma saída de anúncio registrada nos últimos ${h.janelaMeses} meses.`);

  const saidasPorMes = d.saidas / meses;
  const mesesDeEstoque = d.ativos / saidasPorMes;
  const saturacao = faixaDeSaturacao(mesesDeEstoque, h);

  const estoque = limitar(1 - mesesDeEstoque / h.atencaoAte);
  const variacaoPreco = d.precoAtual != null && d.precoInicioJanela != null && d.precoInicioJanela > 0
    ? (d.precoAtual / d.precoInicioJanela - 1) * 100 : null;
  const tendencia = variacaoPreco == null ? null : limitar(variacaoPreco / h.tetoTendencia);
  const diferencaPraca = d.precoAtual != null && precoMedioPraca != null && precoMedioPraca > 0
    ? ((precoMedioPraca - d.precoAtual) / precoMedioPraca) * 100 : null;
  const precoRelativo = diferencaPraca == null ? null : limitar(diferencaPraca / h.descontoMaximo);

  // Parte sem dado (ex.: sem preço no início da janela) sai da média, não vale zero.
  const pares: [number | null, number][] = [[estoque, h.pesoEstoque], [tendencia, h.pesoTendencia], [precoRelativo, h.pesoPrecoRelativo]];
  const validos = pares.filter(([v, p]) => v != null && p > 0) as [number, number][];
  const somaPesos = validos.reduce((s, [, p]) => s + p, 0);
  const score = somaPesos > 0 ? Math.round((100 * validos.reduce((s, [v, p]) => s + v * p, 0)) / somaPesos) : null;

  return { saturacao, mesesDeEstoque, score, motivo: null, partes: { estoque, tendencia, precoRelativo }, variacaoPreco, diferencaPraca };
}

/** Média de preço por m² da praça, ponderada pelos anúncios ativos de cada bairro. */
export function precoMedioDaPraca(bairros: DinamicaDoBairro[]): number | null {
  let soma = 0;
  let n = 0;
  for (const b of bairros) {
    if (b.precoAtual == null || b.ativos <= 0) continue;
    soma += b.precoAtual * b.ativos;
    n += b.ativos;
  }
  return n > 0 ? soma / n : null;
}
