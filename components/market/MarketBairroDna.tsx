import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { opuraMarketService } from '../../services/opuraMarketService';
import type { OpuraMarketNeighborhood, OpuraMarketNeighborhoodSerie, OpuraMarketNeighborhoodStats } from '../../types';
import type { IndicadoresDoBairro } from '../../utils/opuraMarketIndicadores';

/**
 * DNA do bairro (Fase 4.5): números calculados na leitura, só com o que a RLS
 * libera a quem vê, e a evolução mês a mês pela data de captura.
 */
interface Props {
  bairro: OpuraMarketNeighborhood;
  stats: OpuraMarketNeighborhoodStats | undefined;
  /** Saturação e Score Potencial (plano 2026-10-10, item 3). Ausente = ainda lendo. */
  indicadores?: IndicadoresDoBairro | null;
  /** Bloco de hipóteses dos indicadores, logo abaixo dos números. */
  children?: React.ReactNode;
}

const NAO = 'Não calculado';
const pct = (v: number | null) => (v == null ? 'sem dado' : `${Math.round(v * 100)}%`);
const numero = (v: number, casas = 1) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: 0 });

/** Texto do `title` do Score: de onde veio cada parte. */
function explicarScore(i: IndicadoresDoBairro): string {
  const partes = [
    `Estoque baixo: ${pct(i.partes.estoque)}${i.mesesDeEstoque != null ? ` (${numero(i.mesesDeEstoque)} meses de estoque)` : ''}`,
    `Alta de preço: ${pct(i.partes.tendencia)}${i.variacaoPreco != null ? ` (variação de ${numero(i.variacaoPreco)}% na janela)` : ''}`,
    `Preço abaixo da praça: ${pct(i.partes.precoRelativo)}${i.diferencaPraca != null ? ` (${numero(i.diferencaPraca)}% ${i.diferencaPraca >= 0 ? 'abaixo' : 'acima'} da média)` : ''}`,
  ];
  return partes.join(' · ') + '. Pesos e tetos nas hipóteses abaixo.';
}

function Celula({ rotulo, valor, titulo }: { rotulo: string; valor: React.ReactNode; titulo?: string }) {
  return (
    <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1" title={titulo}>
      <span className="block font-black text-slate-400 uppercase text-[9px]">{rotulo}</span>
      <span className="block font-black text-slate-800 text-sm truncate">{valor}</span>
    </div>
  );
}

export default function MarketBairroDna({ bairro, stats: st, indicadores: ind, children }: Props) {
  const [serie, setSerie] = React.useState<OpuraMarketNeighborhoodSerie[]>([]);
  const [carregando, setCarregando] = React.useState(false);

  React.useEffect(() => {
    let vivo = true;
    setCarregando(true);
    opuraMarketService.getNeighborhoodSeries(bairro.id)
      .then(s => { if (vivo) setSerie(s); })
      .catch(err => console.error('Erro ao buscar histórico do bairro:', err))
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [bairro.id]);

  return (
    <div className="bg-white border border-slate-200/60 p-6 rounded-[24px] shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">DNA do Bairro™</h3>
          <h2 className="text-base font-black text-slate-900 tracking-tight">🏢 Bairro: {bairro.name}</h2>
        </div>
        {/* Bairro Score não é exibido: não tem regra de cálculo (decisão D3). Até
            10/10/2026 aparecia "0 / 100" em todo bairro cadastrado pela gaveta, porque
            a coluna nascia com DEFAULT 0.0 (migration aplicar_20271010001400). */}
      </div>

      {!st ? (
        <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-600 font-semibold leading-relaxed">
          Nenhum anúncio ativo vinculado a este bairro. Os anúncios se vinculam pelo nome do bairro de origem quando ele está cadastrado na praça.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <Celula rotulo="Preço Médio / m²" valor={st.pricePerM2Avg == null ? NAO : `R$ ${Math.round(st.pricePerM2Avg).toLocaleString('pt-BR')}/m²`} />
          <Celula rotulo="Ticket Médio" valor={st.ticketAvg == null ? NAO : `R$ ${Math.round(st.ticketAvg).toLocaleString('pt-BR')}`} />
          <Celula rotulo="Área Média" valor={st.areaAvg == null ? NAO : `${Math.round(st.areaAvg).toLocaleString('pt-BR')} m²`} />
          <Celula rotulo="Mais Anunciado" valor={st.tipologia ?? NAO} />
          <Celula rotulo="Anúncios Ativos" valor={st.total.toLocaleString('pt-BR')} />
          <Celula
            rotulo="Saturação"
            valor={ind?.saturacao ? `${ind.saturacao} · ${numero(ind.mesesDeEstoque ?? 0)} meses` : NAO}
            titulo={ind?.saturacao
              ? 'Meses de estoque = anúncios ativos ÷ saídas por mês (anúncios que sumiram do feed salvo). Faixas nas hipóteses abaixo.'
              : ind?.motivo ?? 'Lendo a dinâmica do bairro…'}
          />
          <Celula
            rotulo="Score Potencial"
            valor={ind?.score != null ? `${ind.score} / 100` : NAO}
            titulo={ind?.score != null ? explicarScore(ind) : ind?.motivo ?? 'Lendo a dinâmica do bairro…'}
          />
        </div>
      )}

      {children}

      <div className="border-t border-slate-100 pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="block font-black text-slate-400 uppercase text-[9px] tracking-wider">Evolução do Preço Ofertado (m²)</span>
          <span className="text-xs text-slate-500 font-semibold">Mês a mês, pela data de captura</span>
        </div>

        {carregando ? (
          <div className="h-40 flex items-center justify-center bg-slate-50 rounded-2xl border border-slate-100">
            <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : serie.length > 0 ? (
          <div className="h-44 bg-slate-50/50 border border-slate-100 rounded-2xl p-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={serie.map(h => ({
                mes: new Date(`${h.mes}T12:00:00`).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
                preco: h.pricePerM2Avg == null ? null : Math.round(h.pricePerM2Avg),
              }))} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPreco" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="mes" tickLine={false} axisLine={false} style={{ fontSize: 9, fontWeight: 700, fill: '#94A3B8' }} />
                <YAxis tickLine={false} axisLine={false} style={{ fontSize: 9, fontWeight: 700, fill: '#94A3B8' }} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ background: '#0F172A', border: 'none', borderRadius: 12, padding: '8px 12px' }}
                  labelStyle={{ color: '#94A3B8', fontSize: 9, fontWeight: 900, textTransform: 'uppercase' }}
                  itemStyle={{ color: '#FFFFFF', fontSize: 11, fontWeight: 700 }}
                  formatter={(value: any) => [`R$ ${value.toLocaleString('pt-BR')}/m²`, 'Preço Médio']}
                />
                <Area type="monotone" dataKey="preco" stroke="#3B82F6" strokeWidth={2.5} fillOpacity={1} fill="url(#colorPreco)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-40 flex items-center justify-center bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-400 font-semibold">
            Sem anúncio com preço por m² vinculado a este bairro.
          </div>
        )}
      </div>
    </div>
  );
}
