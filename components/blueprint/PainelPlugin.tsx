/**
 * EXECUTOR DE PLUGIN (21/09/2026, backlog P2): o iframe com sandbox onde o
 * plugin roda, a conversa por `postMessage` (o desenho vai a cada mudança
 * depois do handshake) e a coluna de PROPOSTAS — cada uma ensaiada pelo kernel
 * numa cópia antes de aparecer, e aplicada só no clique.
 *
 * Segurança: `sandbox="allow-scripts allow-forms"` (sem `allow-same-origin`:
 * o plugin não lê cookies, storage nem esta página); `event.source` tem de
 * ser a janela do iframe; plugin por URL exige `event.origin` igual à origem
 * cadastrada; o de exemplo (srcdoc) tem origem "null".
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Puzzle } from 'lucide-react';
import type { BlueprintModel, Command } from '../../utils/blueprintKernel';
import { ensaiarProposta, lerMensagemDoPlugin, mensagemDoModelo, origemDoPlugin, PLUGIN_DE_EXEMPLO, PLUGIN_DE_EXEMPLO_HTML, type EstudoParaPlugin, type PluginDaPlanta, type PropostaEnsaiada } from '../../utils/blueprintPlugins';

interface Props {
  plugin: PluginDaPlanta;
  model: BlueprintModel;
  estudo: EstudoParaPlugin;
  nivelAtivoId: string | null;
  selecao: string[];
  onAplicar: (comandos: Command[], descricao: string | null) => void;
  onSelecionar: (uids: string[]) => void;
  onFechar: () => void;
}

interface Registro {
  quando: string;
  texto: string;
  tom: 'info' | 'erro';
}

const hora = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export default function PainelPlugin({ plugin, model, estudo, nivelAtivoId, selecao, onAplicar, onSelecionar, onFechar }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [pronto, setPronto] = useState(false);
  const [propostas, setPropostas] = useState<(PropostaEnsaiada & { id: number })[]>([]);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [enviadas, setEnviadas] = useState(0);
  const seq = useRef(0);
  const ehExemplo = plugin.id === PLUGIN_DE_EXEMPLO.id;
  const origemEsperada = useMemo(() => (ehExemplo ? 'null' : origemDoPlugin(plugin.url)), [ehExemplo, plugin.url]);
  const modelRef = useRef(model);
  modelRef.current = model;

  const registrar = useCallback((texto: string, tom: Registro['tom'] = 'info') => setRegistros((r) => [{ quando: hora(), texto, tom }, ...r].slice(0, 50)), []);

  /** Manda o desenho ao plugin (só depois do handshake). */
  const enviarModelo = useCallback(() => {
    const janela = iframeRef.current?.contentWindow;
    if (!janela || !pronto) return;
    const msg = mensagemDoModelo(modelRef.current, { estudo, nivelAtivoId, selecao, permissoes: plugin.permissoes });
    // Alvo '*' é seguro aqui: a mensagem só vai à janela do iframe, e o conteúdo não tem credencial.
    janela.postMessage(msg, '*');
    setEnviadas((n) => n + 1);
  }, [pronto, estudo, nivelAtivoId, selecao, plugin.permissoes]);

  useEffect(() => {
    enviarModelo();
  }, [enviarModelo, model]);

  useEffect(() => {
    const ouvir = (ev: MessageEvent) => {
      if (!iframeRef.current || ev.source !== iframeRef.current.contentWindow) return;
      const lido = lerMensagemDoPlugin(ev.data, { origemRecebida: ev.origin, origemEsperada, permissoes: plugin.permissoes });
      if (!lido.ok) {
        registrar(`Mensagem recusada: ${lido.motivo}.`, 'erro');
        return;
      }
      const m = lido.mensagem;
      if (m.tipo === 'opura.planta.pronto') {
        setPronto(true);
        registrar('Plugin carregado; desenho enviado.');
        return;
      }
      if (m.tipo === 'opura.planta.aviso') {
        registrar(`Plugin: ${m.texto}`);
        return;
      }
      if (m.tipo === 'opura.planta.selecionar') {
        onSelecionar(m.uids);
        registrar(`Plugin selecionou ${m.uids.length} peça(s).`);
        return;
      }
      const ensaio = ensaiarProposta(modelRef.current, m.comandos, m.descricao);
      if (!ensaio.ok) {
        registrar(`Proposta recusada: ${ensaio.motivo}.`, 'erro');
        return;
      }
      seq.current += 1;
      setPropostas((p) => [{ ...ensaio.mensagem, id: seq.current }, ...p]);
      registrar(`Proposta recebida: ${ensaio.mensagem.descricao ?? ensaio.mensagem.resumo}.`);
    };
    window.addEventListener('message', ouvir);
    return () => window.removeEventListener('message', ouvir);
  }, [origemEsperada, plugin.permissoes, onSelecionar, registrar]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]" data-testid="executor-de-plugin">
      <div className="rounded-[10px] border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 text-xs text-slate-600">
          <span className="flex items-center gap-2">
            <Puzzle className="h-4 w-4 text-slate-400" />
            <strong className="text-slate-800">{plugin.nome}</strong>
            {ehExemplo ? <span>· embutido</span> : <span className="truncate" title={plugin.url}>· {origemEsperada}</span>}
            <span>· {pronto ? `conectado · ${enviadas} envio(s)` : 'aguardando o plugin…'}</span>
          </span>
          <button type="button" onClick={onFechar} className="text-xs font-medium underline">
            fechar
          </button>
        </div>
        <iframe
          ref={iframeRef}
          title={`Plugin ${plugin.nome}`}
          sandbox="allow-scripts allow-forms"
          referrerPolicy="no-referrer"
          className="h-[60vh] w-full bg-white"
          {...(ehExemplo ? { srcDoc: PLUGIN_DE_EXEMPLO_HTML } : { src: plugin.url })}
        />
      </div>
      <div className="space-y-3">
        <div className="rounded-[10px] border border-slate-200 bg-white p-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Propostas ({propostas.length})</h4>
          {propostas.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">Nada proposto ainda. O plugin pode enviar comandos do kernel; eles aparecem aqui, ensaiados, para você aplicar.</p>
          ) : (
            <ul className="mt-2 space-y-2" data-testid="propostas-do-plugin">
              {propostas.map((p) => (
                <li key={p.id} className="rounded-[6px] border border-slate-200 p-2 text-xs">
                  <p className="font-medium text-slate-800">{p.descricao ?? p.resumo}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {p.resumo} · cria {p.criados}, altera {p.atualizados}, apaga {p.apagados}
                  </p>
                  <div className="mt-1.5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onAplicar(p.comandos, p.descricao);
                        setPropostas((lista) => lista.filter((x) => x.id !== p.id));
                        registrar(`Aplicada: ${p.descricao ?? p.resumo}.`);
                      }}
                      className="h-7 rounded-[6px] bg-blue-600 px-2 text-xs font-medium text-white hover:bg-blue-700"
                      data-testid="aplicar-proposta"
                    >
                      Aplicar
                    </button>
                    <button type="button" onClick={() => setPropostas((lista) => lista.filter((x) => x.id !== p.id))} className="h-7 rounded-[6px] border border-slate-300 bg-white px-2 text-xs text-slate-700 hover:bg-slate-50">
                      Descartar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-[10px] border border-slate-200 bg-white p-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Conversa</h4>
          <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-[11px]" data-testid="registro-do-plugin">
            {registros.length === 0 && <li className="text-slate-500">Aguardando o handshake (opura.planta.pronto)…</li>}
            {registros.map((r, i) => (
              <li key={`${r.quando}-${i}`} className={r.tom === 'erro' ? 'text-red-700' : 'text-slate-600'}>
                <span className="tabular-nums text-slate-400">{r.quando}</span> {r.texto}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
