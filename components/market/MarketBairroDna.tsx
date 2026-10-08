import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { opuraMarketService } from '../../services/opuraMarketService';
import type { OpuraMarketNeighborhood, OpuraMarketNeighborhoodSerie, OpuraMarketNeighborhoodStats } from '../../types';

/**
 * DNA do bairro (Fase 4.5): números calculados na leitura, só com o que a RLS
 * libera a quem vê, e a evolução mês a mês pela data de captura.
 */
interface Props {
  bairro: OpuraMarketNeighborhood;
  stats: OpuraMarketNeighborhoodStats | undefined;
}

const NAO = 'Não calculado';
const SEM_REGRA = 'Ainda sem regra de cálculo definida (decisão D3 do plano).';

function Celula({ rotulo, valor, titulo }: { rotulo: string; valor: React.ReactNode; titulo?: string }) {
  return (
    <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1" title={titulo}>
      <span className="block font-black text-slate-400 uppercase text-[9px]">{rotulo}</span>
      <span className="block font-black text-slate-800 text-sm truncate">{valor}</span>
    </div>
  );
}

export default function MarketBairroDna({ bairro, stats: st }: Props) {
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
        {bairro.bairroScore != null && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase">Bairro Score™</span>
            <span className="text-lg font-black text-slate-900 bg-slate-100 px-3 py-1 rounded-xl">{bairro.bairroScore} / 100</span>
          </div>
        )}
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
          <Celula rotulo="Saturação" valor={NAO} titulo={SEM_REGRA} />
          <Celula rotulo="Score Potencial" valor={NAO} titulo={SEM_REGRA} />
        </div>
      )}

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
