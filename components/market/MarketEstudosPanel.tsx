import React from 'react';
import Button from '../ui/Button';
import type { OpuraMarketTerrainStudy } from '../../types';
import type { MarketVocacao } from '../../hooks/useMarketVocacao';
import { DESCRICAO_HIPOTESES, HIPOTESES_PADRAO } from '../../utils/opuraMarketVocacao';

/**
 * Aba "Estudos & Análise": vocação do lote à esquerda (com as hipóteses da
 * Fase 5) e estudos salvos da organização à direita.
 */
interface Props {
  v: MarketVocacao;
  /** Motivo de gravar estar desligado (nenhuma organização no topo). */
  motivoSemOrg?: string;
  onDesenharLote: () => void;
  onSalvar: () => void;
  onExportarPdf: () => void;
  /** Ausente: a tela não sabe navegar para o IMOVIB e o botão não aparece. */
  onCriarViabilidade?: () => void;
  onAbrirEstudo: (s: OpuraMarketTerrainStudy) => void;
}

const campo = 'w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-500';
const rotulo = 'block text-xs font-black text-slate-400 uppercase tracking-widest';

function Hipoteses({ v }: { v: MarketVocacao }) {
  const { hipoteses, setHipoteses, errosHipoteses, hipotesesAlteradas } = v;
  return (
    <details className="border border-slate-100 rounded-xl bg-slate-50/50" open={errosHipoteses.length > 0 || undefined}>
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-slate-600">
        Hipóteses do cálculo{hipotesesAlteradas > 0 ? ` · ${hipotesesAlteradas} alterada(s)` : ' · padrão'}
      </summary>
      <div className="px-3 pb-3 space-y-3">
        <div className="grid grid-cols-2 gap-x-3 gap-y-3">
          {DESCRICAO_HIPOTESES.map(d => (
            <div key={d.chave} className="space-y-1.5" title={d.explicacao}>
              <label className="block text-[11px] font-semibold text-slate-500 leading-tight">
                {d.rotulo} <span className="font-normal text-slate-400">({d.unidade})</span>
              </label>
              <input
                type="number"
                step={d.passo}
                min={d.min}
                max={d.max}
                value={Number.isFinite(hipoteses[d.chave]) ? hipoteses[d.chave] : ''}
                onChange={(e) => setHipoteses(h => ({ ...h, [d.chave]: e.target.value === '' ? Number.NaN : Number(e.target.value) }))}
                className={`w-full px-2 h-8 bg-white border rounded-[6px] text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-500 ${hipoteses[d.chave] !== HIPOTESES_PADRAO[d.chave] ? 'border-amber-300' : 'border-slate-200'}`}
              />
            </div>
          ))}
        </div>
        {errosHipoteses.length > 0 && (
          <ul className="text-xs text-rose-600 space-y-0.5">
            {errosHipoteses.map(e => <li key={e}>{e}</li>)}
          </ul>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-400">Passe o mouse sobre um campo para ver o efeito. Mudou, o resultado é refeito.</span>
          <button
            type="button"
            onClick={() => setHipoteses(HIPOTESES_PADRAO)}
            disabled={hipotesesAlteradas === 0}
            title={hipotesesAlteradas === 0 ? 'Todas as hipóteses já estão no padrão.' : undefined}
            className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 disabled:text-slate-300 disabled:cursor-not-allowed shrink-0"
          >
            Restaurar padrões
          </button>
        </div>
      </div>
    </details>
  );
}

function Resultado({ v, motivoSemOrg, onSalvar, onExportarPdf, onCriarViabilidade }: Omit<Props, 'onDesenharLote' | 'onAbrirEstudo'>) {
  const r = v.analysisResult;
  if (!r) return null;
  const motivoSalvar = motivoSemOrg ?? (!v.studyName.trim() ? 'Dê um nome ao estudo.' : undefined);
  const motivoViabilidade = motivoSemOrg
    ?? (!r.stats || !(r.stats.pricePerM2Avg > 0)
      ? 'Este estudo não tem o preço por m² medido no raio (foi salvo antes de 07/10/2026). Clique em "Calcular Vocação Territorial" e tente de novo.'
      : undefined);
  return (
    <div className="border border-slate-100 rounded-2xl p-4 bg-slate-50/50 space-y-4">
      <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">Vocação e Recomendação IA</h4>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="space-y-0.5">
          <span className="block text-[9px] text-slate-400 font-bold uppercase">Padrão Recomendado</span>
          <span className="block font-black text-slate-800">{r.recStandard}</span>
        </div>
        <div className="space-y-0.5">
          <span className="block text-[9px] text-slate-400 font-bold uppercase">Preço Estimado / m²</span>
          {r.stats ? (
            <span className="block font-black text-emerald-600">R$ {r.stats.pricePerM2Avg.toLocaleString('pt-BR')}/m²</span>
          ) : (
            <span className="block font-semibold text-slate-500" title="Este estudo foi salvo antes de 07/10/2026, quando as estatísticas do raio não eram guardadas. Clique em Calcular Vocação Territorial para medir de novo.">Estatísticas não guardadas</span>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <span className="block text-[9px] text-slate-400 font-bold uppercase">Mix de Tipologias Recomendadas</span>
        {r.productMix.tipologias.map((tip, idx) => (
          <div key={idx} className="flex justify-between text-xs bg-white p-2 rounded-lg border border-slate-100 font-semibold text-slate-600">
            <span>{tip.tipo} ({tip.area}m²)</span>
            <span className="text-slate-800 font-bold">{tip.mix}% do VGV</span>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-100 pt-3 grid grid-cols-2 gap-3 text-xs font-semibold">
        <div>
          <span className="block text-[9px] text-slate-400 font-bold uppercase">VGV Potencial</span>
          <span className="block font-black text-slate-800 text-sm">R$ {(r.estimatedVgv || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>
        </div>
        <div>
          <span className="block text-[9px] text-slate-400 font-bold uppercase">Risco do Produto</span>
          <span className={`block font-black text-sm ${r.riskScore > 70 ? 'text-rose-600' : r.riskScore > 40 ? 'text-amber-600' : 'text-emerald-600'}`}>{r.riskScore}%</span>
        </div>
      </div>

      <div className="space-y-2 pt-2 border-t border-slate-100">
        <button
          onClick={onSalvar}
          disabled={v.analyzing || !!motivoSalvar}
          title={motivoSalvar}
          className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white rounded-xl text-button font-black uppercase tracking-wider transition-all active:scale-95"
        >
          💾 Salvar Estudo na Organização
        </button>
        <button
          onClick={onExportarPdf}
          disabled={v.analyzing}
          title={v.analyzing ? 'Aguarde a operação em andamento.' : undefined}
          className="w-full py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 disabled:cursor-not-allowed text-white rounded-xl text-button font-black uppercase tracking-wider transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          📄 Exportar Relatório PDF
        </button>
        {onCriarViabilidade && (
          <Button
            variant="primary"
            size="md"
            onClick={onCriarViabilidade}
            disabled={v.analyzing || !!motivoViabilidade}
            title={motivoViabilidade}
            className="w-full rounded-xl text-button font-black uppercase tracking-wider transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            🏗️ Criar Viabilidade (IMOVIB)
          </Button>
        )}
      </div>
    </div>
  );
}

export default function MarketEstudosPanel(props: Props) {
  const { v, onDesenharLote, onAbrirEstudo } = props;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-1 bg-white rounded-[24px] border border-slate-200/60 p-6 shadow-sm h-fit space-y-6">
        <div className="border-b border-slate-100 pb-3">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">🧪 Vocação Territorial & IA</h3>
          <p className="text-[11px] text-slate-500 font-semibold mt-1">
            Calcule o mix de tipologia, VGV e recomendação construtiva baseada no lote selecionado.
          </p>
        </div>

        {!v.terrainPin ? (
          <div className="py-12 text-center space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-2xl mx-auto">📐</div>
            <div className="space-y-1">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Nenhum lote selecionado</h4>
              <p className="text-[11px] text-slate-500 font-semibold max-w-xs mx-auto">
                Para rodar a análise de vocação, desenhe o terreno sobre o mapa ou clique num ponto dele.
              </p>
            </div>
            <button
              onClick={onDesenharLote}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-button font-black uppercase tracking-wider transition-all active:scale-95 text-xs shadow-md"
            >
              📐 Desenhar Lote no Mapa
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl text-xs space-y-2">
              <div className="flex justify-between items-center">
                <span className="block font-black text-indigo-800 uppercase text-[9px] tracking-wider">Terreno Georreferenciado</span>
                <button onClick={onDesenharLote} className="text-[9px] font-black uppercase tracking-wider text-indigo-600 hover:text-indigo-800 underline">
                  Redesenhar
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 font-semibold font-mono">
                <span>Lat: {v.terrainPin.lat.toFixed(6)}</span>
                <span>Lng: {v.terrainPin.lng.toFixed(6)}</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className={rotulo}>Nome do Estudo</label>
                <input type="text" value={v.studyName} onChange={(e) => v.setStudyName(e.target.value)} placeholder="Ex: Terreno do Centro" className={campo} />
              </div>
              <div className="space-y-1">
                <label className={rotulo}>Área do Terreno (m²)</label>
                <input type="number" value={v.terrainArea} onChange={(e) => v.setTerrainArea(e.target.value)} placeholder="Ex: 1500" className={campo} />
              </div>
              <div className="space-y-1">
                <label className={rotulo}>Raio de Análise</label>
                <select value={v.analysisRadius} onChange={(e) => v.setAnalysisRadius(e.target.value)} className={campo}>
                  <option value="500">500m (Entorno Direto)</option>
                  <option value="1000">1km (Raio Principal)</option>
                  <option value="3000">3km (Região de Influência)</option>
                  <option value="5000">5km (Macro Região)</option>
                </select>
              </div>

              <Hipoteses v={v} />

              <button
                onClick={v.analisar}
                disabled={v.analyzing || v.errosHipoteses.length > 0}
                title={v.errosHipoteses.length > 0 ? 'Corrija as hipóteses do cálculo antes de calcular.' : v.analyzing ? 'Aguarde a operação em andamento.' : undefined}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 disabled:cursor-not-allowed text-white rounded-xl text-button font-black uppercase tracking-wider transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {v.analyzing ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Analisando...
                  </>
                ) : '🚀 Calcular Vocação Territorial'}
              </button>
            </div>

            <Resultado {...props} />
          </div>
        )}
      </div>

      <div className="lg:col-span-2 bg-white rounded-[24px] border border-slate-200/60 p-6 shadow-sm flex flex-col space-y-6">
        <div className="border-b border-slate-100 pb-3">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">📂 Estudos Salvos da Organização</h3>
          <p className="text-[11px] text-slate-500 font-semibold mt-1">
            Lista histórica de terrenos e estimativas de vocação computadas por sua organização.
          </p>
        </div>

        {v.loadingStudies ? (
          <div className="flex flex-col items-center justify-center py-20 flex-1">
            <div className="w-8 h-8 border-4 border-slate-950 border-t-transparent rounded-full animate-spin mb-3" />
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Buscando Estudos...</span>
          </div>
        ) : v.savedStudies.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[600px] overflow-y-auto pr-1 flex-1">
            {v.savedStudies.map(study => (
              <div key={study.id} className="p-4 bg-slate-50/50 border border-slate-100 rounded-2xl transition-all flex flex-col justify-between hover:border-slate-200">
                <div className="space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider truncate max-w-[200px]" title={study.name}>{study.name}</h4>
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                      {study.createdAt ? new Date(study.createdAt).toLocaleDateString('pt-BR') : ''}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-slate-600 font-semibold">
                    <span>Área: <strong className="text-slate-800">{study.terrainArea.toLocaleString('pt-BR')}m²</strong></span>
                    <span>Raio: <strong className="text-slate-800">{study.analysisRadiusMeters}m</strong></span>
                    {study.estimatedVgv && (
                      <span className="col-span-2 text-emerald-600 font-black">
                        VGV: R$ {study.estimatedVgv.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-4 pt-3 border-t border-slate-100/60">
                  <button
                    onClick={() => onAbrirEstudo(study)}
                    title="Carrega o estudo no painel ao lado e marca o terreno no mapa."
                    className="flex-1 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100/30 text-indigo-700 rounded-lg text-[10px] font-black uppercase tracking-wider text-center transition-all active:scale-95"
                  >
                    📂 Abrir estudo
                  </button>
                  <button
                    onClick={() => v.excluirEstudo(study)}
                    className="p-1.5 bg-rose-50 border border-rose-100 hover:bg-rose-100 text-rose-600 rounded-lg text-xs transition-all active:scale-95"
                    title="Excluir estudo"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 bg-slate-50/50 border border-dashed border-slate-200 rounded-3xl flex-1 text-center space-y-3">
            <span className="text-3xl block">📂</span>
            <div className="space-y-1">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Nenhum estudo localizado</h4>
              <p className="text-[11px] text-slate-500 font-semibold max-w-xs mx-auto">
                Os estudos da sua organização serão listados aqui assim que salvos no painel lateral de vocação.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
