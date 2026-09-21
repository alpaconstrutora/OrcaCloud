/**
 * ETAPAS DE OBRA — fases personalizadas (21/09/2026, backlog P2): a linha do
 * tempo (criar, renomear, reordenar, apagar; semear a típica), a seleção na
 * linha (nasce em / demolida em), a etapa EM VISTA (o canvas mostra o desenho
 * como está nela) e o quadro do que entra e sai por etapa.
 */
import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import type { Etapa, ObjectId } from '../../utils/blueprintKernel';
import { MAX_NOME_DE_ETAPA } from '../../utils/blueprintKernel';
import { ETAPAS_SUGERIDAS, type LinhaDoQuadroDeEtapas, type PecaNaLinhaDoTempo } from '../../utils/blueprintEtapas';
import { useConfirm } from '../ui/confirm';

interface Props {
  etapas: Etapa[];
  quadro: LinhaDoQuadroDeEtapas[];
  /** As peças SELECIONADAS que têm lugar na linha do tempo. */
  selecao: PecaNaLinhaDoTempo[];
  semEtapa: number;
  etapaEmVista: ObjectId | null;
  contagemEmVista: { EXISTENTE: number; DEMOLIR: number; NOVO: number; ocultas: number } | null;
  onEtapaEmVista: (id: ObjectId | null) => void;
  onCriar: (nomes: string[]) => void;
  onRenomear: (id: ObjectId, nome: string) => void;
  onMover: (id: ObjectId, direcao: -1 | 1) => void;
  onApagar: (id: ObjectId) => void;
  onAtribuir: (ids: ObjectId[], campos: { etapaId?: ObjectId | null; demolidaEmEtapaId?: ObjectId | null }) => void;
}

const m = (v: number) => v.toFixed(2).replace('.', ',');

export default function PainelEtapas({ etapas, quadro, selecao, semEtapa, etapaEmVista, contagemEmVista, onEtapaEmVista, onCriar, onRenomear, onMover, onApagar, onAtribuir }: Props) {
  const confirmar = useConfirm();
  const [novo, setNovo] = useState('');
  const campo = 'h-8 rounded-[6px] border border-slate-300 bg-white px-2 text-xs text-slate-800';
  const ids = selecao.map((p) => p.id);
  const comum = <K extends 'etapaId' | 'demolidaEmEtapaId'>(k: K): string => {
    const v = new Set(selecao.map((p) => p[k] ?? ''));
    return v.size === 1 ? [...v][0] : '';
  };
  const misto = (k: 'etapaId' | 'demolidaEmEtapaId') => new Set(selecao.map((p) => p[k] ?? '')).size > 1;

  return (
    <div className="space-y-4" data-testid="tarefa-etapas">
      <div className="rounded-[10px] border border-slate-200 bg-white p-3 text-xs text-slate-700">
        <p>
          <strong>Linha do tempo da obra</strong> — {etapas.length} etapa(s){etapas.length > 0 ? ` · ${semEtapa} peça(s) ainda sem etapa` : ''}.
        </p>
        <p className="mt-1 text-[11px] text-slate-500">
          Cada peça diz em que etapa nasce e, se sai, em que etapa é demolida. Com uma etapa em vista, o desenho mostra o que existe nela: o que nasceu antes em cinza, o que nasce nela normal, o que sai nela em vermelho tracejado, o resto some. Sem etapa, a peça segue o status Existente / A demolir / Novo.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input value={novo} maxLength={MAX_NOME_DE_ETAPA} onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && novo.trim()) { onCriar([novo.trim()]); setNovo(''); } }} aria-label="Nome da nova etapa" placeholder="Nova etapa (ex.: Fase 1 — demolições)" className={`${campo} w-64`} />
          <button type="button" disabled={!novo.trim()} onClick={() => { onCriar([novo.trim()]); setNovo(''); }} className="h-8 rounded-[6px] bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50" data-testid="criar-etapa">
            Criar etapa
          </button>
          {etapas.length === 0 && (
            <button type="button" onClick={() => onCriar([...ETAPAS_SUGERIDAS])} className="h-8 rounded-[6px] border border-slate-300 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50" data-testid="semear-etapas">
              Semear a linha típica de reforma (4 etapas)
            </button>
          )}
        </div>
        {etapas.length > 0 && (
          <ul className="mt-2 divide-y divide-slate-100" data-testid="lista-de-etapas">
            {etapas.map((e, i) => (
              <li key={e.id} className="flex items-center gap-2 py-1.5">
                <span className="w-6 text-right tabular-nums text-slate-400">{i + 1}.</span>
                <input key={`${e.id}-${e.nome}`} defaultValue={e.nome} maxLength={MAX_NOME_DE_ETAPA} aria-label={`Nome da etapa ${i + 1}`} onBlur={(ev) => { const v = ev.target.value.trim(); if (v && v !== e.nome) onRenomear(e.id, v); }} onKeyDown={(ev) => ev.key === 'Enter' && (ev.target as HTMLInputElement).blur()} className={`${campo} flex-1`} />
                <button type="button" disabled={i === 0} onClick={() => onMover(e.id, -1)} aria-label={`Subir etapa ${e.nome}`} className="rounded-[6px] border border-slate-300 p-1 text-slate-600 hover:bg-slate-50 disabled:opacity-40"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" disabled={i === etapas.length - 1} onClick={() => onMover(e.id, 1)} aria-label={`Descer etapa ${e.nome}`} className="rounded-[6px] border border-slate-300 p-1 text-slate-600 hover:bg-slate-50 disabled:opacity-40"><ArrowDown className="h-3.5 w-3.5" /></button>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await confirmar({ title: 'Apagar etapa', message: `"${e.nome}" sai da linha do tempo; as peças que nascem ou são demolidas nela ficam sem essa referência (o desenho não muda).`, confirmLabel: 'Apagar', variant: 'danger' });
                    if (ok) onApagar(e.id);
                  }}
                  aria-label={`Apagar etapa ${e.nome}`}
                  className="rounded-[6px] border border-slate-300 p-1 text-slate-600 hover:bg-red-50 hover:text-red-700"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {etapas.length > 0 && (
        <div className="rounded-[10px] border border-slate-200 bg-white p-3" data-testid="selecao-na-linha">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Seleção ({selecao.length} peça(s))</h4>
          {selecao.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">Selecione paredes, esquadrias, estrutura ou componentes no desenho para dizer em que etapa nascem e em qual saem.</p>
          ) : (
            <div className="mt-2 grid grid-cols-2 gap-3 text-[11px] text-slate-600">
              <label className="flex flex-col gap-0.5 font-medium">
                Nasce em{misto('etapaId') ? ' (misto)' : ''}
                <select value={comum('etapaId')} onChange={(e) => onAtribuir(ids, { etapaId: e.target.value || null })} aria-label="Etapa em que a seleção nasce" className={campo}>
                  <option value="">— sem etapa —</option>
                  {etapas.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-0.5 font-medium">
                Demolida em{misto('demolidaEmEtapaId') ? ' (misto)' : ''}
                <select value={comum('demolidaEmEtapaId')} onChange={(e) => onAtribuir(ids, { demolidaEmEtapaId: e.target.value || null })} aria-label="Etapa em que a seleção é demolida" className={campo}>
                  <option value="">— não é demolida —</option>
                  {etapas.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nome}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>
      )}

      {etapas.length > 0 && (
        <div className="rounded-[10px] border border-slate-200 bg-white p-3">
          <label className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
            Etapa em vista
            <select value={etapaEmVista ?? ''} onChange={(e) => onEtapaEmVista(e.target.value || null)} aria-label="Etapa em vista no desenho" className={`${campo} normal-case tracking-normal`} data-testid="etapa-em-vista">
              <option value="">Todas (sem linha do tempo)</option>
              {etapas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </label>
          {contagemEmVista && (
            <p className="mt-1 text-[11px] text-slate-500" data-testid="contagem-em-vista">
              {contagemEmVista.NOVO} nova(s) · {contagemEmVista.EXISTENTE} existente(s) · {contagemEmVista.DEMOLIR} a demolir · {contagemEmVista.ocultas} ainda não existe(m) / já saiu(ram)
            </p>
          )}
          <table className="mt-2 w-full text-xs" data-testid="quadro-de-etapas">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="py-1 font-medium">Etapa</th>
                <th className="py-1 pl-3 text-right font-medium">Nascem</th>
                <th className="py-1 pl-3 text-right font-medium">m de parede</th>
                <th className="py-1 pl-3 text-right font-medium">Saem</th>
                <th className="py-1 pl-3 text-right font-medium">m de parede</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {quadro.map((l) => (
                <tr key={l.etapa.id}>
                  <td className="py-1">{l.etapa.nome}</td>
                  <td className="py-1 pl-3 text-right tabular-nums" title={`${l.nascem.paredes} parede(s), ${l.nascem.aberturas} esquadria(s), ${l.nascem.estruturas} estrutura(s), ${l.nascem.componentes} componente(s)`}>{l.nascem.paredes + l.nascem.aberturas + l.nascem.estruturas + l.nascem.componentes}</td>
                  <td className="py-1 pl-3 text-right tabular-nums">{m(l.nascem.comprimentoParedeM)}</td>
                  <td className="py-1 pl-3 text-right tabular-nums" title={`${l.saem.paredes} parede(s), ${l.saem.aberturas} esquadria(s), ${l.saem.estruturas} estrutura(s), ${l.saem.componentes} componente(s)`}>{l.saem.paredes + l.saem.aberturas + l.saem.estruturas + l.saem.componentes}</td>
                  <td className="py-1 pl-3 text-right tabular-nums">{m(l.saem.comprimentoParedeM)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
