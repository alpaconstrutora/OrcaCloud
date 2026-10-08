import React from 'react';
import type { CamadaMercado } from '../../hooks/useMarketLeaflet';

/** Cartão do Market Map™: seletor de camada ou controles de desenho, e o contêiner do Leaflet. */
interface Props {
  containerRef: React.RefObject<HTMLDivElement | null>;
  camada: CamadaMercado;
  onCamada: (c: CamadaMercado) => void;
  desenhando: boolean;
  vertices: number;
  ocupado: boolean;
  onConcluirDesenho: () => void;
  onCancelarDesenho: () => void;
  /** Há terreno marcado: mostra o atalho para o painel de estudo. */
  temTerreno: boolean;
  onIrParaEstudo: () => void;
}

const ROTULO: Record<CamadaMercado, string> = {
  preco: '💰 Preço/m²',
  saturacao: '⚠️ Saturação',
  concorrencia: '🏢 Concorrência',
  oportunidade: '✨ Oportunidades',
};

export default function MarketMapaPanel({
  containerRef, camada, onCamada, desenhando, vertices, ocupado, onConcluirDesenho, onCancelarDesenho, temTerreno, onIrParaEstudo,
}: Props) {
  return (
    <div className="bg-white border border-slate-200/60 p-6 rounded-[24px] shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Market Map™</h3>
          <span className="text-xs text-slate-500 font-semibold">Selecione uma camada e clique no mapa para analisar a vocação imobiliária</span>
        </div>

        <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl">
          {desenhando ? (
            <div className="flex items-center gap-3 px-2">
              <span className="text-[11px] font-black text-indigo-600 uppercase tracking-wider flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
                </span>
                Desenho Ativo
              </span>
              <div className="flex items-center gap-2 bg-white px-2 py-0.5 rounded border border-slate-200">
                <span className="text-[10px] font-bold text-slate-500">Vértices:</span>
                <span className="text-xs font-extrabold text-indigo-600">{vertices}</span>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={onConcluirDesenho}
                  disabled={vertices < 3 || ocupado}
                  title={vertices < 3 ? 'Clique pelo menos 3 pontos no mapa para fechar o lote.' : ocupado ? 'Aguarde o cálculo em andamento.' : undefined}
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-300 disabled:cursor-not-allowed text-white rounded text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 shadow-sm"
                >
                  {ocupado ? '...' : 'Concluir'}
                </button>
                <button
                  onClick={onCancelarDesenho}
                  disabled={ocupado}
                  title={ocupado ? 'Aguarde o cálculo em andamento.' : undefined}
                  className="px-3 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 rounded text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 shadow-sm disabled:cursor-not-allowed"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            (Object.keys(ROTULO) as CamadaMercado[]).map(c => (
              <button
                key={c}
                onClick={() => onCamada(c)}
                className={`px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                  camada === c ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {ROTULO[c]}
              </button>
            ))
          )}
        </div>
      </div>

      <div className="relative w-full h-[400px] rounded-2xl overflow-hidden shadow-inner border border-slate-200/80">
        {!desenhando && temTerreno && (
          <div className="absolute top-4 right-4 z-[1000]">
            <button
              onClick={onIrParaEstudo}
              className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-button font-black uppercase tracking-wider transition-all active:scale-95 shadow-xl flex items-center gap-2 border border-emerald-400"
            >
              🚀 Ver Estudo da IA
            </button>
          </div>
        )}
        <div ref={containerRef} className="w-full h-full z-10 relative" style={{ background: '#111827' }} />
      </div>
    </div>
  );
}
