import React from 'react';
import { FlaskConical, FolderOpen, PencilRuler, Rocket, Save, FileDown, Building2 } from 'lucide-react';
import Button from '../ui/Button';
import ActionIconButton from '../ui/ActionIconButton';
import MoneyCentsInput from '../ui/MoneyCentsInput';
import { SecaoTitulo } from '../ui/SecaoTitulo';
import type { OpuraMarketTerrainStudy } from '../../types';
import type { MarketVocacao } from '../../hooks/useMarketVocacao';
import { DESCRICAO_HIPOTESES, HIPOTESES_PADRAO } from '../../utils/opuraMarketVocacao';
import { TIPOS_DE_IMOVEL, TIPOS_PADRAO, descricaoDosTipos, resumoDosTipos, tiposDoEstudo, type TipoDeImovel } from '../../utils/opuraMarketTipos';
import { FilterPopover } from '../ui/FilterPopover';

const OPCOES_DE_TIPO = TIPOS_DE_IMOVEL.map((t) => ({ value: t, label: t }));

/** Recorte com que a estatística foi medida, por extenso. Estudo antigo: todos os tipos. */
const tiposMedidos = (stats: { tipos?: unknown }) => {
  const tipos = tiposDoEstudo(stats);
  return tipos ? descricaoDosTipos(tipos) : 'todos os tipos (estudo salvo antes de 19/10/2026)';
};

/**
 * Aba "Estudos & Análise": vocação do lote à esquerda (com as hipóteses da
 * Fase 5) e estudos salvos da organização à direita.
 *
 * Vocabulário do guia (docs/ui_ux_guia_unificado.md) desde 19/10/2026: cartões
 * §16 (`rounded-[10px]`), título de seção §30 (`SecaoTitulo`), rótulo §21
 * (sentence case), malha §30 (rótulo→campo 6px, campos curtos em grade),
 * botões §17 (um só azul sólido: Calcular). Antes era `font-black uppercase`
 * em todo rótulo, título e botão. Plano: 2026-10-19-opura-market-media-por-tipo, item 8.
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

const CARTAO = 'bg-white rounded-[10px] border border-gray-100 shadow-sm p-6';
const CAMPO = 'w-full px-3 h-9 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';
const ROTULO = 'block text-xs font-semibold text-slate-500';
const CAMPO_HIPOTESE = (alterada: boolean) =>
  `w-full px-2 h-8 bg-white border rounded-[6px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${alterada ? 'border-amber-300' : 'border-gray-200'}`;

function Hipoteses({ v }: { v: MarketVocacao }) {
  const { hipoteses, setHipoteses, errosHipoteses, hipotesesAlteradas } = v;
  return (
    <details className="border border-gray-100 rounded-[10px] bg-gray-50/60" open={errosHipoteses.length > 0 || undefined}>
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-gray-700">
        Hipóteses do cálculo{hipotesesAlteradas > 0 ? ` · ${hipotesesAlteradas} alterada(s)` : ' · padrão'}
      </summary>
      <div className="px-3 pb-3 space-y-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-4">
          {DESCRICAO_HIPOTESES.map(d => (
            <div key={d.chave} className="space-y-1.5" title={d.explicacao}>
              <label className="block text-xs font-semibold text-slate-500 leading-tight">
                {d.rotulo} <span className="font-normal text-slate-400">({d.unidade})</span>
              </label>
              {d.unidade === 'R$/m²' ? (
                <MoneyCentsInput
                  value={hipoteses[d.chave]}
                  onChange={(valor) => setHipoteses(h => ({ ...h, [d.chave]: valor === '' ? Number.NaN : Number(valor) }))}
                  className={CAMPO_HIPOTESE(hipoteses[d.chave] !== HIPOTESES_PADRAO[d.chave])}
                />
              ) : (
                <input
                  type="number"
                  step={d.passo}
                  min={d.min}
                  max={d.max}
                  value={Number.isFinite(hipoteses[d.chave]) ? hipoteses[d.chave] : ''}
                  onChange={(e) => setHipoteses(h => ({ ...h, [d.chave]: e.target.value === '' ? Number.NaN : Number(e.target.value) }))}
                  className={CAMPO_HIPOTESE(hipoteses[d.chave] !== HIPOTESES_PADRAO[d.chave])}
                />
              )}
            </div>
          ))}
        </div>
        {errosHipoteses.length > 0 && (
          <ul className="text-xs text-rose-600 space-y-0.5">
            {errosHipoteses.map(e => <li key={e}>{e}</li>)}
          </ul>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-gray-500">Passe o mouse sobre um campo para ver o efeito. Mudou, o resultado é refeito.</span>
          <button
            type="button"
            onClick={() => setHipoteses(HIPOTESES_PADRAO)}
            disabled={hipotesesAlteradas === 0}
            title={hipotesesAlteradas === 0 ? 'Todas as hipóteses já estão no padrão.' : undefined}
            className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:text-slate-300 disabled:cursor-not-allowed shrink-0"
          >
            Restaurar padrões
          </button>
        </div>
      </div>
    </details>
  );
}

/** Par rótulo + valor do resultado (leitura, não campo). */
function Dado({ rotulo, children, title }: { rotulo: string; children: React.ReactNode; title?: string }) {
  return (
    <div className="space-y-1" title={title}>
      <span className="block text-xs text-gray-500">{rotulo}</span>
      <span className="block text-sm font-semibold text-gray-900">{children}</span>
    </div>
  );
}

function Resultado({ v, motivoSemOrg, onSalvar, onExportarPdf, onCriarViabilidade }: Omit<Props, 'onDesenharLote' | 'onAbrirEstudo'>) {
  const r = v.analysisResult;
  if (!r) return null;
  const motivoSalvar = motivoSemOrg ?? (!v.studyName.trim() ? 'Dê um nome ao estudo.' : undefined);
  const motivoViabilidade = motivoSemOrg
    ?? (!r.stats || !(r.stats.pricePerM2Avg > 0)
      ? 'Este estudo não tem o preço por m² medido no raio (foi salvo antes de 07/10/2026). Clique em "Calcular vocação" e tente de novo.'
      : undefined);
  const ocupado = v.analyzing ? 'Aguarde a operação em andamento.' : undefined;
  return (
    <div className="space-y-4">
      <SecaoTitulo icon={Rocket} titulo="Vocação e recomendação" />
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <Dado rotulo="Padrão recomendado">{r.recStandard}</Dado>
        {r.stats ? (
          <Dado rotulo="Preço estimado / m²">
            <span className="text-emerald-700">R$ {r.stats.pricePerM2Avg.toLocaleString('pt-BR')}/m²</span>
          </Dado>
        ) : (
          <Dado rotulo="Preço estimado / m²" title="Este estudo foi salvo antes de 07/10/2026, quando as estatísticas do raio não eram guardadas. Clique em Calcular vocação para medir de novo.">
            <span className="font-normal text-gray-600">Estatísticas não guardadas</span>
          </Dado>
        )}
        <Dado rotulo="VGV potencial">R$ {(r.estimatedVgv || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</Dado>
        <Dado rotulo="Risco do produto">
          <span className={r.riskScore > 70 ? 'text-rose-600' : r.riskScore > 40 ? 'text-amber-600' : 'text-emerald-700'}>{r.riskScore}%</span>
        </Dado>
      </div>
      {r.stats && (
        <p className="text-xs text-gray-500">
          Base: {r.stats.totalListings.toLocaleString('pt-BR')} anúncio(s) no raio · {tiposMedidos(r.stats)}
        </p>
      )}

      <div className="space-y-1.5">
        <span className={ROTULO}>Mix de tipologias recomendadas</span>
        {r.productMix.tipologias.map((tip, idx) => (
          <div key={idx} className="flex justify-between text-sm bg-gray-50 px-3 py-2 rounded-[6px] border border-gray-100 text-gray-700">
            <span>{tip.tipo} ({tip.area} m²)</span>
            <span className="font-medium text-gray-900">{tip.mix}% do VGV</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 pt-1">
        <Button variant="secondary" onClick={onSalvar} disabled={v.analyzing || !!motivoSalvar} title={motivoSalvar ?? ocupado} className="w-full">
          <Save className="w-[15px] h-[15px]" /> Salvar estudo na organização
        </Button>
        <Button variant="secondary" onClick={onExportarPdf} disabled={v.analyzing} title={ocupado} className="w-full">
          <FileDown className="w-[15px] h-[15px]" /> Exportar relatório PDF
        </Button>
        {onCriarViabilidade && (
          <Button variant="secondary" onClick={onCriarViabilidade} disabled={v.analyzing || !!motivoViabilidade} title={motivoViabilidade ?? ocupado} className="w-full">
            <Building2 className="w-[15px] h-[15px]" /> Criar viabilidade (IMOVIB)
          </Button>
        )}
      </div>
    </div>
  );
}

export default function MarketEstudosPanel(props: Props) {
  const { v, onDesenharLote, onAbrirEstudo } = props;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className={`lg:col-span-1 h-fit space-y-8 ${CARTAO}`}>
        <div className="space-y-4">
          <SecaoTitulo
            icon={FlaskConical}
            titulo="Vocação territorial"
            acoes={v.terrainPin ? (
              <Button variant="secondary" size="sm" onClick={onDesenharLote}>
                <PencilRuler className="w-3.5 h-3.5" /> Redesenhar
              </Button>
            ) : undefined}
          />
          <p className="text-xs text-gray-500 -mt-1">Mix de tipologia, VGV e padrão construtivo a partir do lote marcado no mapa.</p>

          {!v.terrainPin ? (
            <div className="text-center py-10 space-y-3">
              <PencilRuler className="w-10 h-10 text-gray-300 mx-auto" />
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-gray-900">Nenhum lote selecionado</h4>
                <p className="text-xs text-gray-500 max-w-xs mx-auto">
                  Para rodar a análise de vocação, desenhe o terreno sobre o mapa ou clique num ponto dele.
                </p>
              </div>
              <Button onClick={onDesenharLote} className="mx-auto">
                <PencilRuler className="w-[15px] h-[15px]" /> Desenhar lote no mapa
              </Button>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-600 tabular-nums">
                Terreno em {v.terrainPin.lat.toFixed(6)}, {v.terrainPin.lng.toFixed(6)}
              </p>

              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div className="col-span-2 space-y-1.5">
                  <label className={ROTULO} htmlFor="estudo-nome">Nome do estudo</label>
                  <input id="estudo-nome" type="text" value={v.studyName} onChange={(e) => v.setStudyName(e.target.value)} placeholder="Ex.: Terreno do Centro" className={CAMPO} />
                </div>
                <div className="space-y-1.5">
                  <label className={ROTULO} htmlFor="estudo-area">Área do terreno (m²)</label>
                  <input id="estudo-area" type="number" value={v.terrainArea} onChange={(e) => v.setTerrainArea(e.target.value)} placeholder="Ex.: 1500" className={CAMPO} />
                </div>
                <div className="space-y-1.5">
                  <label className={ROTULO} htmlFor="estudo-raio">Raio de análise</label>
                  <select id="estudo-raio" value={v.analysisRadius} onChange={(e) => v.setAnalysisRadius(e.target.value)} className={`${CAMPO} cursor-pointer`}>
                    <option value="500">500 m · entorno</option>
                    <option value="1000">1 km · principal</option>
                    <option value="3000">3 km · influência</option>
                    <option value="5000">5 km · macrorregião</option>
                  </select>
                </div>
                <div className="col-span-2 space-y-1.5" title="Só estes tipos entram no preço médio, no ticket e na contagem de concorrentes do raio. Terreno fica de fora por padrão: anuncia a uma fração do R$/m² do construído.">
                  <span className={ROTULO}>Tipos comparados</span>
                  <FilterPopover<TipoDeImovel>
                    multiple
                    label="Tipos"
                    options={OPCOES_DE_TIPO}
                    value={v.tiposComparados}
                    onChange={v.alterarTiposComparados}
                    resumo={resumoDosTipos}
                    padrao={TIPOS_PADRAO}
                    className="w-full"
                  />
                </div>
              </div>

              <Hipoteses v={v} />

              <Button
                onClick={() => v.analisar()}
                disabled={v.analyzing || v.errosHipoteses.length > 0}
                title={v.errosHipoteses.length > 0 ? 'Corrija as hipóteses do cálculo antes de calcular.' : v.analyzing ? 'Aguarde a operação em andamento.' : undefined}
                className="w-full"
              >
                {v.analyzing ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Analisando…
                  </>
                ) : (
                  <><Rocket className="w-[15px] h-[15px]" /> Calcular vocação</>
                )}
              </Button>
            </>
          )}
        </div>

        {v.terrainPin && <Resultado {...props} />}
      </div>

      <div className={`lg:col-span-2 flex flex-col space-y-4 ${CARTAO}`}>
        <SecaoTitulo icon={FolderOpen} titulo="Estudos salvos da organização" resumo={v.savedStudies.length > 0 ? `${v.savedStudies.length} estudo(s)` : undefined} />

        {v.loadingStudies ? (
          <div className="text-center py-12 flex-1">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
            <p className="mt-2 text-sm text-gray-500">Carregando estudos…</p>
          </div>
        ) : v.savedStudies.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[600px] overflow-y-auto pr-1 flex-1">
            {v.savedStudies.map(study => {
              const tipos = tiposDoEstudo(study.radiusStats);
              return (
                <div key={study.id} className="p-4 bg-white border border-gray-200 rounded-[10px] flex flex-col justify-between hover:border-gray-300 transition-colors">
                  <div className="space-y-2">
                    <div className="flex justify-between items-start gap-2">
                      <h4 className="text-sm font-semibold text-gray-900 truncate" title={study.name}>{study.name}</h4>
                      <span className="text-xs text-gray-500 shrink-0">
                        {study.createdAt ? new Date(study.createdAt).toLocaleDateString('pt-BR') : ''}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-gray-600">
                      <span>Área: <span className="font-medium text-gray-900">{study.terrainArea.toLocaleString('pt-BR')} m²</span></span>
                      <span>Raio: <span className="font-medium text-gray-900">{study.analysisRadiusMeters} m</span></span>
                      <span className="col-span-2">Tipos: <span className="font-medium text-gray-900">{tipos ? resumoDosTipos(tipos) : 'Todos (antes de 19/10/2026)'}</span></span>
                      {study.estimatedVgv && (
                        <span className="col-span-2">VGV: <span className="font-medium text-emerald-700">R$ {study.estimatedVgv.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span></span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-gray-100">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onAbrirEstudo(study)}
                      title="Carrega o estudo no painel ao lado e marca o terreno no mapa."
                      className="flex-1"
                    >
                      <FolderOpen className="w-3.5 h-3.5" /> Abrir estudo
                    </Button>
                    <ActionIconButton kind="delete" title="Excluir estudo" onClick={() => v.excluirEstudo(study)} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 flex-1">
            <FolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum estudo salvo</h3>
            <p className="text-sm text-gray-500">Os estudos da organização aparecem aqui assim que salvos no painel de vocação.</p>
          </div>
        )}
      </div>
    </div>
  );
}
