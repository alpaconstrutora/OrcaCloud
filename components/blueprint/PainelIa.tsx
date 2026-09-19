/**
 * GAVETA "Conversar" (19/09/2026, E6.4): o pedido em linguagem natural vira
 * mudanças no programa / hipóteses / pesos (pela IA — Edge Function
 * `planta-ia` — ou pelo intérprete local quando ela não está configurada),
 * o gerador re-gera com as mesmas sementes e a resposta é o DELTA dos
 * indicadores e das áreas em relação à melhor alternativa anterior. "Explicar
 * solução" = decisões do gerador + indicadores + sugestões, determinístico.
 * Nada aqui toca geometria: quem desenha é o gerador.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Bot, Loader2, MessageSquareText, Send, Sparkles } from 'lucide-react';
import type { Avaliacao } from '../../utils/blueprintAvaliacao';
import type { ResultadoDoGerador } from '../../utils/blueprintGerador';
import { deltaDeAreas, deltaDeIndicadores, explicarSolucao, type MudancasDaIa, type ResultadoDaAplicacao } from '../../utils/blueprintIa';

export interface TurnoDaConversa {
  id: string;
  pedido: string;
  /** "IA" ou "intérprete local"; null enquanto pensa. */
  origem: 'IA' | 'LOCAL' | null;
  entendimento: string;
  aplicadas: string[];
  recusadas: string[];
  /** Preenchido quando a re-geração termina. */
  delta: { texto: string; areas: string; notaAntes: number | null; notaDepois: number | null } | null;
  erro: string | null;
  estado: 'PENSANDO' | 'GERANDO' | 'PRONTO' | 'SEM_MUDANCA' | 'ERRO';
}

interface Props {
  turnos: TurnoDaConversa[];
  pensando: boolean;
  gerando: boolean;
  temPrograma: boolean;
  iaDisponivel: boolean | null;
  onPedir: (pedido: string) => void;
  /** A melhor alternativa gerada até agora (para explicar) e a avaliação do desenho aberto. */
  melhor: ResultadoDoGerador | null;
  avaliacaoAtual: Avaliacao;
  onAbrirPrograma: () => void;
  onAbrirGerador: () => void;
}

export const EXEMPLOS = ['Suíte +2 m²', 'Aumente a sala em 3 m²', 'Quero 3 dormitórios', 'Corredor de 1,20 m', 'Tire a varanda', 'Peso da insolação 8', 'Mais um escritório'];

export default function PainelIa({ turnos, pensando, gerando, temPrograma, iaDisponivel, onPedir, melhor, avaliacaoAtual, onAbrirPrograma, onAbrirGerador }: Props) {
  const [texto, setTexto] = useState('');
  const [explicacao, setExplicacao] = useState<string | null>(null);
  const fim = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    fim.current?.scrollIntoView?.({ block: 'end' });
  }, [turnos.length, turnos[turnos.length - 1]?.estado]);
  const enviar = () => {
    const p = texto.trim();
    if (!p || pensando) return;
    onPedir(p);
    setTexto('');
  };
  const ocupado = pensando || gerando;

  return (
    <div className="flex h-full flex-col gap-3" data-testid="tarefa-ia">
      <div className="rounded-[6px] border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
        <p className="flex items-center gap-1">
          <Bot className="h-3.5 w-3.5 text-slate-500" />
          {iaDisponivel === false ? (
            <span data-testid="estado-da-ia">
              <strong>IA não configurada</strong> (Edge Function <code>planta-ia</code> sem <code>ANTHROPIC_API_KEY</code>): os pedidos passam pelo <strong>intérprete local</strong>, que entende os comuns.
            </span>
          ) : iaDisponivel === true ? (
            <span data-testid="estado-da-ia">
              <strong>IA ligada</strong> (Claude pela Edge Function <code>planta-ia</code>); o intérprete local cobre quando ela falha.
            </span>
          ) : (
            <span data-testid="estado-da-ia">Pedidos vão à IA (Edge Function <code>planta-ia</code>); sem ela, o intérprete local responde.</span>
          )}
        </p>
        <p className="mt-1 text-[11px] text-slate-500">
          O pedido nunca vira parede: vira mudança no programa, nas hipóteses do gerador ou nos pesos; o gerador re-gera com as mesmas sementes e você lê o delta dos indicadores. Cada resposta diz o que foi
          entendido, aplicado e recusado.
        </p>
        {!temPrograma && (
          <p className="mt-1 flex items-center gap-1 text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5" /> Sem programa de necessidades —{' '}
            <button type="button" onClick={onAbrirPrograma} className="font-medium text-blue-700 hover:underline">
              defina um
            </button>{' '}
            para a conversa ter sobre o que agir.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {EXEMPLOS.map((e) => (
          <button key={e} type="button" disabled={ocupado || !temPrograma} onClick={() => onPedir(e)} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50 disabled:opacity-50" data-testid="exemplo-de-pedido">
            {e}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setExplicacao(explicacao ? null : explicarSolucao(melhor?.decisoes ?? [], melhor?.avaliacao ?? avaliacaoAtual, melhor?.avisos ?? []))}
          className="ml-auto inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-100"
          data-testid="explicar-solucao"
        >
          <Sparkles className="h-3 w-3" /> {explicacao ? 'Ocultar explicação' : melhor ? `Explicar a alternativa #${melhor.semente}` : 'Explicar o desenho aberto'}
        </button>
      </div>

      {explicacao && (
        <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-[6px] border border-blue-100 bg-blue-50/40 px-3 py-2 font-sans text-xs text-slate-800" data-testid="explicacao-da-solucao">
          {explicacao}
        </pre>
      )}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1" data-testid="conversa">
        {turnos.length === 0 && (
          <p className="py-6 text-center text-xs text-slate-500">
            Peça algo — "suíte +2 m²", "3 dormitórios", "corredor de 1,20 m" — ou clique num exemplo. {melhor ? `A alternativa #${melhor.semente} é a base de comparação.` : 'Gere alternativas primeiro para comparar deltas; sem elas, a primeira resposta gera.'}
          </p>
        )}
        {turnos.map((t) => (
          <div key={t.id} className="space-y-1" data-testid={`turno-${t.id}`}>
            <p className="ml-8 rounded-[6px] bg-blue-600 px-3 py-1.5 text-sm text-white">{t.pedido}</p>
            <div className="mr-8 rounded-[6px] border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
              {t.estado === 'PENSANDO' && (
                <p className="flex items-center gap-1 text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Interpretando o pedido…
                </p>
              )}
              {t.estado !== 'PENSANDO' && (
                <>
                  <p>
                    <span className="mr-1 rounded bg-slate-100 px-1 text-[10px] font-medium uppercase text-slate-600">{t.origem === 'IA' ? 'IA' : 'intérprete local'}</span>
                    {t.entendimento}
                  </p>
                  {t.aplicadas.length > 0 && <p className="mt-1 text-emerald-800">Aplicado: {t.aplicadas.join(' · ')}.</p>}
                  {t.recusadas.length > 0 && <p className="mt-1 text-amber-800">Recusado: {t.recusadas.join(' · ')}.</p>}
                  {t.estado === 'GERANDO' && (
                    <p className="mt-1 flex items-center gap-1 text-slate-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Re-gerando as alternativas…
                    </p>
                  )}
                  {t.estado === 'PRONTO' && t.delta && (
                    <div className="mt-1 rounded bg-slate-50 px-2 py-1" data-testid="delta">
                      <p className="font-medium text-gray-800">{t.delta.texto}</p>
                      <p className="text-slate-600">Áreas: {t.delta.areas}</p>
                    </div>
                  )}
                  {t.estado === 'SEM_MUDANCA' && <p className="mt-1 text-slate-500">Nada a aplicar — reformule (ex.: "aumente a sala em 3 m²").</p>}
                  {t.erro && <p className="mt-1 text-red-700">{t.erro}</p>}
                </>
              )}
            </div>
          </div>
        ))}
        <div ref={fim} />
      </div>

      <div className="flex items-center gap-2">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && enviar()}
          placeholder={temPrograma ? 'Ex.: suíte +2 m² e corredor de 1,20 m' : 'Defina o programa antes'}
          disabled={!temPrograma || ocupado}
          aria-label="Pedido em linguagem natural"
          className="h-9 flex-1 rounded-[6px] border border-slate-300 px-3 text-sm disabled:bg-slate-50"
        />
        <button type="button" onClick={enviar} disabled={!texto.trim() || ocupado || !temPrograma} className="inline-flex h-9 items-center gap-1 rounded-[6px] bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300" data-testid="enviar-pedido">
          <Send className="h-4 w-4" /> Pedir
        </button>
        <button type="button" onClick={onAbrirGerador} className="inline-flex h-9 items-center gap-1 rounded-[6px] border border-slate-300 bg-white px-2 text-xs text-gray-700 hover:bg-slate-50" title="Ver as alternativas geradas">
          <MessageSquareText className="h-4 w-4" /> Gerar
        </button>
      </div>
    </div>
  );
}

/** Um turno recém-criado, ainda pensando. */
export function novoTurno(pedido: string): TurnoDaConversa {
  return { id: `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`, pedido, origem: null, entendimento: '', aplicadas: [], recusadas: [], delta: null, erro: null, estado: 'PENSANDO' };
}

/** Fecha o turno com o resultado da re-geração. */
export function concluirTurno(t: TurnoDaConversa, antes: ResultadoDoGerador | null, depois: ResultadoDoGerador | null): TurnoDaConversa {
  if (!depois) return { ...t, estado: 'ERRO', erro: 'A re-geração não produziu alternativa.' };
  const d = deltaDeIndicadores(antes?.avaliacao ?? null, depois.avaliacao);
  return { ...t, estado: 'PRONTO', delta: { texto: d.texto, areas: deltaDeAreas(antes?.ambientes ?? null, depois.ambientes), notaAntes: d.notaAntes, notaDepois: d.notaDepois } };
}

export function turnoComMudancas(t: TurnoDaConversa, origem: 'IA' | 'LOCAL', m: MudancasDaIa, r: ResultadoDaAplicacao): TurnoDaConversa {
  return { ...t, origem, entendimento: m.entendimento, aplicadas: r.aplicadas, recusadas: r.recusadas, estado: r.aplicadas.length ? 'GERANDO' : 'SEM_MUDANCA' };
}
