import React from 'react';
import type { OpuraMarketListing } from '../../types';

/**
 * Painel lateral "Ofertas da Praça" do mapa. Mesma busca e mesmo filtro de fonte
 * da tabela de ocorrências (o termo é um só, guardado pelo módulo).
 */
interface Props {
  total: number;
  filtrados: OpuraMarketListing[];
  busca: string;
  onBusca: (v: string) => void;
  filtroFonte: React.ReactNode;
  /** Motivo de "Importar" estar desligado (ex.: nenhuma organização no topo). */
  motivoImportarDesligado?: string;
  onImportar: () => void;
  onAbrirTabela: () => void;
  onFocar: (l: OpuraMarketListing) => void;
  onDetalhes: (l: OpuraMarketListing) => void;
  onExcluir: (l: OpuraMarketListing) => void;
}

export default function MarketOfertasPanel({
  total, filtrados, busca, onBusca, filtroFonte, motivoImportarDesligado, onImportar, onAbrirTabela, onFocar, onDetalhes, onExcluir,
}: Props) {
  return (
    <div className="bg-white border border-slate-200/60 p-6 rounded-[24px] shadow-sm flex flex-col h-fit min-h-[500px] space-y-6">
      <div className="border-b border-slate-100 pb-3 flex justify-between items-center gap-2">
        <div>
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Ofertas da Praça</h3>
          <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-1.5 mt-0.5">
            🏢 Concorrência ({total})
          </h2>
        </div>
        <button
          onClick={onImportar}
          disabled={!!motivoImportarDesligado}
          title={motivoImportarDesligado ?? 'Importar planilha de concorrência'}
          className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100/70 border border-emerald-100 text-emerald-700 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 flex items-center gap-1 shadow-sm shrink-0 disabled:bg-slate-50 disabled:border-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed disabled:active:scale-100"
        >
          📥 Importar
        </button>
      </div>

      <div className="space-y-4 flex flex-col flex-1 min-h-[450px]">
        <div className="space-y-2">
          <input
            type="text"
            value={busca}
            onChange={(e) => onBusca(e.target.value)}
            placeholder="🔍 Buscar por endereço, tipo, fonte..."
            className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-[6px] text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <div className="flex gap-2">
            <div className="flex-1">{filtroFonte}</div>
            <button
              type="button"
              onClick={onAbrirTabela}
              className="flex items-center gap-1 h-9 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[6px] font-medium text-[13px] transition-all active:scale-95 shrink-0"
            >
              📋 Tabela
            </button>
          </div>
        </div>

        <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1 flex-1">
          {filtrados.length > 0 ? filtrados.map(l => {
            // Com dono = importado por uma organização; sem dono = global (o mesmo teste do mapa).
            const privado = l.organizationId != null;
            return (
              <div
                key={l.id}
                onClick={() => onFocar(l)}
                className="p-3 bg-slate-50 border border-slate-100 hover:bg-slate-100/50 rounded-xl cursor-pointer transition-all space-y-2 relative group"
              >
                <div className="flex items-center justify-between gap-2 pr-7">
                  <span className={`text-xs font-semibold ${privado ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {privado ? 'Privado (importado)' : 'Global'}
                  </span>
                  <span className="text-xs font-semibold text-slate-400 truncate max-w-[120px]">{l.source}</span>
                </div>

                <div className="space-y-0.5">
                  <span className="block font-black text-slate-900 text-sm">R$ {l.price.toLocaleString('pt-BR')}</span>
                  <span className="block text-xs text-slate-500 font-semibold truncate leading-normal" title={l.address || ''}>
                    📍 {l.address || 'Endereço não geocodificado'}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 text-xs font-bold text-slate-500">
                  <span className="bg-white px-2 py-0.5 rounded border border-slate-100">{l.propertyType}</span>
                  {l.areaPrivate && <span className="bg-white px-2 py-0.5 rounded border border-slate-100">📐 {l.areaPrivate}m²</span>}
                  {l.bedrooms > 0 && <span className="bg-white px-2 py-0.5 rounded border border-slate-100">🛏️ {l.bedrooms}D</span>}
                  {l.suites > 0 && <span className="bg-white px-2 py-0.5 rounded border border-slate-100">✨ {l.suites}S</span>}
                  {l.parkingSpaces > 0 && <span className="bg-white px-2 py-0.5 rounded border border-slate-100">🚗 {l.parkingSpaces}V</span>}
                  {l.constructionStandard && <span className="bg-white px-2 py-0.5 rounded border border-slate-100 text-slate-600">{l.constructionStandard}</span>}
                </div>

                {l.description && (
                  <p className="text-[9px] text-slate-400 font-semibold italic line-clamp-1 border-t border-slate-100/60 pt-1.5 mt-1">"{l.description}"</p>
                )}

                <div className="flex justify-between items-center pt-2 border-t border-slate-100/60 mt-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); onDetalhes(l); }}
                    className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-700 bg-white border border-slate-200 rounded-[6px] hover:bg-slate-50 transition-all flex items-center gap-1 active:scale-95 shadow-sm"
                  >
                    🔍 Ver Detalhes
                  </button>
                  <span className="text-[9px] text-slate-400 font-semibold font-mono">
                    {l.capturedAt ? new Date(l.capturedAt).toLocaleDateString('pt-BR') : ''}
                  </span>
                </div>

                {privado && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onExcluir(l); }}
                    className="absolute right-3 top-3 w-6 h-6 rounded-lg bg-white border border-slate-200 text-rose-500 hidden group-hover:flex items-center justify-center text-xs active:scale-90 shadow-sm transition-all"
                    title="Excluir ocorrência"
                  >
                    🗑️
                  </button>
                )}
              </div>
            );
          }) : (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 text-xs font-semibold text-center space-y-2">
              <span>🏢</span>
              <span>Nenhum anúncio encontrado com estes filtros.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
