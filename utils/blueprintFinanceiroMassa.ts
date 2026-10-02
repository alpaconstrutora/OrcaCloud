/**
 * ESTUDO DE MASSA — o FINANCEIRO (fase M3 do plano `2026-10-01-estudo-de-massa.md`).
 *
 * VGV, custo e margem de UM cenário de massa, com as hipóteses do produto. É a
 * conta de pré-viabilidade que o pedido mostra no §16 ("Área construída 7.850 m²,
 * VGV R$ 39,5 mi, custo R$ 24,2 mi, margem 27 %") — não o fluxo de caixa: TIR,
 * VPL e exposição continuam sendo da Viabilidade (Imovib), que recebe a
 * estrutura pelo Empreendimento.
 *
 * ─── PURO, E NUNCA INVENTA ──────────────────────────────────────────────────
 *
 * O CUB chega de fora (`services/cubService.ts`). Sem custo (nem CUB nem valor
 * digitado) o custo sai `null` com o motivo; tipologia sem preço fica fora do
 * VGV e a tela diz quantas ficaram. Nada de R$ 12.000/m² fixo no código — que
 * foi o defeito do Planta AI v1.
 */
import type { MedidaDaMassa } from './blueprintMassa';
import type { Produto, ResultadoDoProduto } from './blueprintProduto';
import type { CubDoPadrao } from '../services/cubService';

export interface LinhaDeObra {
  rotulo: string;
  areaM2: number;
  fator: number;
  custoM2: number;
  valor: number;
}

export interface ResultadoFinanceiro {
  vgv: number;
  vgvPorTipologia: { id: string; nome: string; unidades: number; areaM2: number; precoM2: number; valor: number }[];
  /** Tipologias com unidades e sem preço — ficaram fora do VGV. */
  semPreco: string[];
  custoM2Base: number | null;
  origemDoCusto: 'MANUAL' | 'CUB' | 'CUB_ESTIMADO' | 'SEM_DADO';
  cub: CubDoPadrao | null;
  linhasDeObra: LinhaDeObra[];
  custoObra: number | null;
  terreno: number;
  despesasComerciais: number;
  impostos: number;
  outrasDespesas: number;
  custoTotal: number | null;
  resultado: number | null;
  /** Resultado ÷ VGV, %. */
  margemPct: number | null;
  /** VGV ÷ custo total. */
  vgvSobreCusto: number | null;
  /** Custo de obra ÷ área privativa, R$/m². */
  custoPorM2Privativo: number | null;
  avisos: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function financeiroDaMassa(massa: MedidaDaMassa, produto: Produto, distribuicao: ResultadoDoProduto | null, cub: CubDoPadrao | null): ResultadoFinanceiro {
  const f = produto.financeiro;
  const avisos: string[] = [];

  // ── VGV: unidades × área × preço, por tipologia ──
  const vgvPorTipologia = produto.tipologias.map((t) => {
    const d = distribuicao?.porTipologia.find((x) => x.id === t.id);
    const unidades = d?.unidades ?? 0;
    const areaM2 = d?.privativaM2 ?? 0;
    return { id: t.id, nome: t.nome, unidades, areaM2, precoM2: t.precoM2, valor: r2(areaM2 * t.precoM2) };
  });
  const semPreco = vgvPorTipologia.filter((v) => v.unidades > 0 && v.precoM2 <= 0).map((v) => v.nome);
  if (semPreco.length) avisos.push(`Sem preço por m²: ${semPreco.join(', ')} — fora do VGV.`);
  const vgv = r2(vgvPorTipologia.reduce((s, v) => s + v.valor, 0));

  // ── Custo/m² base: digitado vence; senão CUB × (1 + acréscimos) ──
  let custoM2Base: number | null = null;
  let origemDoCusto: ResultadoFinanceiro['origemDoCusto'] = 'SEM_DADO';
  if (f.custoM2Manual != null && f.custoM2Manual > 0) {
    custoM2Base = f.custoM2Manual;
    origemDoCusto = 'MANUAL';
  } else if (cub && cub.valorM2 > 0) {
    custoM2Base = r2(cub.valorM2 * (1 + f.acrescimosSobreCubPct / 100));
    origemDoCusto = cub.fonte === 'TABELA' ? 'CUB' : 'CUB_ESTIMADO';
    if (cub.fonte === 'ESTIMADO') avisos.push(`CUB ${produto.padrao}/${f.uf} não encontrado na tabela: usei a estimativa da UF × multiplicador do padrão. Confira ou digite o custo por m².`);
  } else {
    avisos.push('Sem custo de obra: o CUB não carregou e não há custo por m² digitado.');
  }

  // ── Obra: por natureza do pavimento (subsolo, garagem, o resto) ──
  const grupos = new Map<string, { areaM2: number; fator: number }>();
  const somar = (rotulo: string, areaM2: number, fator: number) => {
    const g = grupos.get(rotulo) ?? { areaM2: 0, fator };
    g.areaM2 += areaM2;
    grupos.set(rotulo, g);
  };
  for (const b of massa.blocos) {
    for (const p of b.pisos) {
      if (p.subsolo) somar('Subsolo', b.projecaoM2, f.fatorSubsolo);
      else if (b.uso === 'GARAGEM') somar('Garagem acima do solo', b.projecaoM2, f.fatorGaragem);
      else somar('Edificação', b.projecaoM2, 1);
    }
  }
  const linhasDeObra: LinhaDeObra[] =
    custoM2Base == null
      ? []
      : [...grupos.entries()].map(([rotulo, g]) => {
          const custoM2 = r2(custoM2Base! * g.fator);
          return { rotulo, areaM2: r2(g.areaM2), fator: g.fator, custoM2, valor: r2(g.areaM2 * custoM2) };
        });
  const custoObra = custoM2Base == null ? null : r2(linhasDeObra.reduce((s, l) => s + l.valor, 0));

  const despesasComerciais = r2((vgv * f.despesasComerciaisPct) / 100);
  const impostos = r2((vgv * f.impostosPct) / 100);
  const outrasDespesas = r2((vgv * f.outrasDespesasPct) / 100);
  const custoTotal = custoObra == null ? null : r2(custoObra + f.terrenoR$ + despesasComerciais + impostos + outrasDespesas);
  const resultado = custoTotal == null ? null : r2(vgv - custoTotal);
  if (f.terrenoR$ <= 0) avisos.push('Custo do terreno não informado (R$ 0): a margem está otimista.');
  if (vgv <= 0) avisos.push('VGV zero: sem unidades com preço.');

  const privativa = distribuicao?.privativaTotalM2 ?? 0;
  return {
    vgv,
    vgvPorTipologia,
    semPreco,
    custoM2Base,
    origemDoCusto,
    cub,
    linhasDeObra,
    custoObra,
    terreno: f.terrenoR$,
    despesasComerciais,
    impostos,
    outrasDespesas,
    custoTotal,
    resultado,
    margemPct: resultado != null && vgv > 0 ? Math.round((resultado / vgv) * 1000) / 10 : null,
    vgvSobreCusto: custoTotal != null && custoTotal > 0 && vgv > 0 ? Math.round((vgv / custoTotal) * 100) / 100 : null,
    custoPorM2Privativo: custoObra != null && privativa > 0 ? r2(custoObra / privativa) : null,
    avisos,
  };
}
