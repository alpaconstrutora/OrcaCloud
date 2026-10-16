import React, { useEffect, useState } from 'react';
import { Workflow, ChevronDown, ChevronRight, GitBranch, Loader2, Plus } from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import type { P2PEdge, P2PStage, P2PTemplateAtivo } from '../../services/p2pFlowService';
import { PROCESS_EVENT_LABEL } from '../../types/process';
import type { ProcessEventKey } from '../../types/process';
import { processService } from '../../services/processService';
import { descreverCondicao } from '../../utils/processCondition';
import { STAGE_ICON } from './P2PNodeCard';
import type { P2PSelecao } from './P2PCanvas';

const EVENT_KEYS = Object.keys(PROCESS_EVENT_LABEL) as ProcessEventKey[];

/** Título de seção da biblioteca — rótulo em caixa alta (como "TRIGGER / CONDITIONS" do desenho de referência); não é status. */
const TituloDeSecao: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{children}</h3>
);

interface CondicaoListada {
  template: P2PTemplateAtivo;
  edge: P2PEdge;
  etapa: string;
  texto: string;
}

/**
 * Coluna da esquerda do canvas: o que existe no fluxo (etapas), o que o motor
 * de Processos escuta (gatilhos, por evento) e as condições das etapas dos
 * modelos ativos. Clicar numa etapa centra o nó; num gatilho, seleciona a
 * transição que ele conduz; "Novo gatilho" põe o canvas no modo de escolher a
 * transição. As condições são carregadas só quando a seção abre.
 */
export function P2PLibrary({ stages, edges, selecao, modoEscolher, onFocusNode, onSelectEdge, onNovoGatilho, onEditarTemplate }: {
  stages: P2PStage[];
  edges: P2PEdge[];
  selecao: P2PSelecao;
  modoEscolher: boolean;
  onFocusNode: (id: string) => void;
  onSelectEdge: (edge: P2PEdge) => void;
  onNovoGatilho: () => void;
  onEditarTemplate: (tpl: P2PTemplateAtivo, edge: P2PEdge) => void;
}) {
  const [condicoesAbertas, setCondicoesAbertas] = useState(false);
  const [condicoes, setCondicoes] = useState<CondicaoListada[] | null>(null);
  const [carregando, setCarregando] = useState(false);

  // Modelos ativos de todas as arestas, sem repetir (um modelo escuta UM evento, mas a aresta pode ter vários).
  const modelos = edges.flatMap(e => (e.templates ?? []).map(t => ({ t, e })))
    .filter((m, i, arr) => arr.findIndex(x => x.t.id === m.t.id) === i);
  const chaveDosModelos = modelos.map(m => m.t.id).join(',');

  useEffect(() => {
    if (!condicoesAbertas) return;
    let vivo = true;
    setCarregando(true);
    Promise.all(modelos.map(async ({ t, e }) => {
      try {
        const steps = await processService.getTemplateSteps(t.id);
        return steps.flatMap(s => {
          const texto = descreverCondicao(s.condition);
          return texto ? [{ template: t, edge: e, etapa: s.name, texto }] : [];
        });
      } catch {
        return [];
      }
    })).then(listas => { if (vivo) setCondicoes(listas.flat()); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [condicoesAbertas, chaveDosModelos]);

  return (
    <aside className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-3 space-y-5 overflow-y-auto lg:max-h-[560px]">
      <section className="space-y-1.5">
        <TituloDeSecao>Etapas</TituloDeSecao>
        <ul className="space-y-0.5">
          {stages.map(s => {
            const Icon = STAGE_ICON[s.id] ?? Workflow;
            const ativa = selecao?.tipo === 'no' && selecao.id === s.id;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onFocusNode(s.id)}
                  className={`w-full h-8 px-2 flex items-center gap-2 rounded-[6px] text-sm text-left transition-colors
                    ${ativa ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'}`}
                >
                  <Icon className="w-4 h-4 shrink-0 text-gray-400" />
                  <span className="truncate">{s.label}</span>
                  <span className="ml-auto text-xs text-gray-400 tabular-nums">{s.count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-1.5">
        <TituloDeSecao>Gatilhos</TituloDeSecao>
        <ul className="space-y-0.5">
          {EVENT_KEYS.map(key => {
            const edge = edges.find(e => e.eventKeys?.includes(key));
            const modelosDoEvento = (edge?.templates ?? []).filter(t => t.eventKey === key);
            const ativa = !!edge && selecao?.tipo === 'aresta' && selecao.id === edge.id;
            return (
              <li key={key} className={`rounded-[6px] ${ativa ? 'bg-blue-50' : ''}`}>
                <div className="flex items-center gap-1 pr-1">
                  <button
                    type="button"
                    disabled={!edge}
                    title={edge ? `Conduz ${edge.from} → ${edge.to}` : 'Nenhuma transição do fluxo escuta este evento'}
                    onClick={() => edge && onSelectEdge(edge)}
                    className={`flex-1 min-w-0 h-8 px-2 flex items-center gap-2 rounded-[6px] text-sm text-left transition-colors
                      ${ativa ? 'text-blue-700' : 'text-gray-700 hover:bg-gray-50'} disabled:opacity-50`}
                  >
                    <Workflow className={`w-4 h-4 shrink-0 ${modelosDoEvento.length > 0 ? 'text-indigo-500' : 'text-gray-300'}`} />
                    <span className="truncate">{PROCESS_EVENT_LABEL[key]}</span>
                    <span className="ml-auto text-xs text-gray-400 tabular-nums" title="Modelos ativos que escutam este evento">
                      {modelosDoEvento.length}
                    </span>
                  </button>
                  {edge && modelosDoEvento.length > 0 && (
                    <ActionIconButton
                      kind="edit"
                      size="sm"
                      title={modelosDoEvento.length === 1 ? `Editar "${modelosDoEvento[0].name}"` : 'Editar o primeiro modelo deste evento'}
                      onClick={() => onEditarTemplate(modelosDoEvento[0], edge)}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={onNovoGatilho}
          disabled={modoEscolher}
          title={modoEscolher ? 'Escolha a transição no desenho (Esc cancela)' : 'Criar um modelo de processo que nasce de um evento do fluxo'}
          className="w-full h-9 flex items-center justify-center gap-1.5 rounded-[6px] border border-gray-200 bg-white text-[13px] font-medium text-gray-700 hover:bg-gray-50 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
        >
          <Plus className="w-[15px] h-[15px]" /> Novo gatilho
        </button>
      </section>

      <section className="space-y-1.5">
        <button
          type="button"
          onClick={() => setCondicoesAbertas(v => !v)}
          className="w-full flex items-center gap-1 text-left"
          aria-expanded={condicoesAbertas}
        >
          {condicoesAbertas ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
          <TituloDeSecao>Condições</TituloDeSecao>
        </button>
        {condicoesAbertas && (
          carregando && condicoes === null ? (
            <div className="py-3 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-blue-600" /></div>
          ) : (condicoes ?? []).length === 0 ? (
            <p className="text-xs text-gray-500 px-2">
              Nenhuma etapa condicionada. Condições são criadas dentro do modelo, em "Só executa quando…".
            </p>
          ) : (
            <ul className="space-y-0.5">
              {(condicoes ?? []).map((c, i) => (
                <li key={`${c.template.id}-${i}`}>
                  <button
                    type="button"
                    onClick={() => onEditarTemplate(c.template, c.edge)}
                    title={`${c.template.name} · ${c.etapa}`}
                    className="w-full px-2 py-1.5 flex items-start gap-2 rounded-[6px] text-left hover:bg-gray-50 transition-colors"
                  >
                    <GitBranch className="w-4 h-4 shrink-0 text-gray-400 mt-0.5" />
                    <span className="min-w-0">
                      <span className="block text-sm text-gray-700 truncate">{c.etapa}</span>
                      <span className="block text-xs text-gray-500 truncate">{c.texto}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        )}
      </section>
    </aside>
  );
}
