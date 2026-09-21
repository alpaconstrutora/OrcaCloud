/**
 * TRAVAS EXPLÍCITAS (21/09/2026, backlog P2 "lock fino") — a tela in-flow:
 * as travas do ramo (quem, o quê, nota, até quando), travar a seleção atual,
 * o pavimento atual ou uma disciplina com nota e validade, soltar a própria e
 * forçar a liberação de outra (com confirmação — o dono é avisado pelo canal).
 * Molde da tela de acesso/webhooks.
 */
import React, { useState } from 'react';
import { Lock, Unlock } from 'lucide-react';
import { StandardTable, type StandardTableColumn } from '../ui/StandardTable';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import type { BlueprintModel } from '../../utils/blueprintKernel';
import { DISCIPLINAS } from '../../utils/blueprintKernel';
import { dataHoraBr, indiceDePecas, MAX_NOTA_DE_TRAVA, ROTULO_DO_ESCOPO_DE_TRAVA, rotuloDaTrava, travasVigentes, VALIDADES_DE_TRAVA_H, type EscopoDeTrava, type TravaExplicita } from '../../utils/blueprintColaboracao';

interface Props {
  model: BlueprintModel;
  travas: TravaExplicita[];
  carregando: boolean;
  indisponivel: string | null;
  meuUserId: string | null;
  /** Ids selecionados no desenho agora (para "Travar seleção"). */
  selecionados: string[];
  nivelAtivo: { id: string; uid: string; name: string } | null;
  onTravar: (escopo: EscopoDeTrava, alvos: string[], nota: string, validadeHoras: number) => Promise<void>;
  onSoltar: (t: TravaExplicita, forcada: boolean) => Promise<void>;
}

const COLUNAS: StandardTableColumn[] = [
  { key: 'escopo', label: 'Escopo', width: 120 },
  { key: 'alvo', label: 'O quê', width: 220 },
  { key: 'quem', label: 'Quem', width: 220 },
  { key: 'nota', label: 'Nota', width: 260 },
  { key: 'ate', label: 'Até', width: 140 },
];

export default function TelaTravas({ model, travas, carregando, indisponivel, meuUserId, selecionados, nivelAtivo, onTravar, onSoltar }: Props) {
  const confirmar = useConfirm();
  const [escopo, setEscopo] = useState<EscopoDeTrava>('ELEMENTOS');
  const [disciplina, setDisciplina] = useState<string>(DISCIPLINAS[0]);
  const [nota, setNota] = useState('');
  const [validade, setValidade] = useState<number>(8);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const vigentes = travasVigentes(travas);
  const indice = indiceDePecas(model);
  const uidsSelecionados = [...new Set(selecionados.map((id) => indice.get(id)?.uid ?? null).filter((u): u is string => !!u))];
  const alvos = escopo === 'ELEMENTOS' ? uidsSelecionados : escopo === 'PAVIMENTO' ? (nivelAtivo ? [nivelAtivo.uid] : []) : [disciplina];
  const campo = 'h-9 rounded-[6px] border border-slate-300 bg-white px-2 text-sm text-slate-800';

  async function travar() {
    if (alvos.length === 0) return;
    setOcupado(true);
    setAviso(null);
    try {
      await onTravar(escopo, alvos, nota, validade);
      setNota('');
      setAviso('Trava criada. Os outros veem o motivo quando tentarem editar.');
    } catch (e) {
      setAviso(`Falha ao travar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="tela-travas">
      <div className="rounded-[10px] border border-slate-200 bg-white p-4 text-sm text-slate-700">
        <p className="font-semibold text-slate-800">Como funciona</p>
        <p className="mt-1">
          A trava por <strong>seleção</strong> já existe e é automática: o que outra pessoa tem selecionado está em edição por ela. A trava <strong>explícita</strong> é pedida — "estou na elétrica do térreo até amanhã" — e fica até você soltar, alguém forçar a liberação ou o prazo vencer. Pavimento e disciplina travados bloqueiam também criar coisa nova neles. Quem tentar editar vê o seu nome, a nota e o prazo.
        </p>
      </div>

      {indisponivel && <p className="rounded-[6px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Travas indisponíveis: {indisponivel}</p>}
      {aviso && <p className="rounded-[6px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800" data-testid="aviso-trava">{aviso}</p>}

      <div className="rounded-[10px] border border-slate-200 bg-white p-4" data-testid="form-trava">
        <p className="text-sm font-semibold text-slate-800">Nova trava</p>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Escopo
            <select value={escopo} onChange={(e) => setEscopo(e.target.value as EscopoDeTrava)} aria-label="Escopo da trava" className={campo}>
              <option value="ELEMENTOS">Seleção atual ({uidsSelecionados.length} elemento(s))</option>
              <option value="PAVIMENTO">Pavimento atual{nivelAtivo ? ` (${nivelAtivo.name})` : ''}</option>
              <option value="DISCIPLINA">Disciplina</option>
            </select>
          </label>
          {escopo === 'DISCIPLINA' && (
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Disciplina
              <select value={disciplina} onChange={(e) => setDisciplina(e.target.value)} aria-label="Disciplina a travar" className={campo}>
                {DISCIPLINAS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 md:col-span-2">
            Nota (o que você está fazendo)
            <input value={nota} maxLength={MAX_NOTA_DE_TRAVA} onChange={(e) => setNota(e.target.value)} aria-label="Nota da trava" placeholder="ex.: revisando a elétrica do térreo" className={campo} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Validade
            <select value={validade} onChange={(e) => setValidade(Number(e.target.value))} aria-label="Validade da trava" className={campo}>
              {VALIDADES_DE_TRAVA_H.map((h) => (
                <option key={h} value={h}>
                  {h} h
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={() => void travar()} disabled={ocupado || alvos.length === 0 || !meuUserId} className="inline-flex h-9 items-center gap-1 rounded-[6px] bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50" data-testid="travar">
            <Lock className="h-4 w-4" /> Travar
          </button>
          {escopo === 'ELEMENTOS' && uidsSelecionados.length === 0 && <span className="text-xs text-slate-500">Selecione no desenho o que quer travar.</span>}
        </div>
      </div>

      <StandardTable<TravaExplicita>
        columns={COLUNAS}
        storageKey="blueprint:travas"
        rows={vigentes}
        rowKey={(t) => t.id}
        loading={carregando}
        renderCell={(key, t) => {
          switch (key) {
            case 'escopo':
              return <span className="flex items-center gap-1.5 text-xs text-slate-700"><Lock className="h-3.5 w-3.5 text-slate-400" />{ROTULO_DO_ESCOPO_DE_TRAVA[t.escopo]}</span>;
            case 'alvo':
              return <span className="text-xs text-slate-700">{rotuloDaTrava(t, model)}</span>;
            case 'quem':
              return (
                <span className="text-xs text-slate-700">
                  {t.holderNome || t.holderEmail}
                  {t.holderUserId === meuUserId && <span className="ml-1 rounded-[4px] bg-blue-50 px-1 text-[10px] text-blue-700">você</span>}
                </span>
              );
            case 'nota':
              return <span className="text-xs text-slate-600">{t.nota || '—'}</span>;
            case 'ate':
              return <span className="text-xs text-slate-600">{dataHoraBr(t.expiresAt)}</span>;
            default:
              return null;
          }
        }}
        actions={{
          label: 'Ações',
          width: 90,
          render: (t) =>
            t.holderUserId === meuUserId ? (
              <ActionIconButton kind="edit" icon={<Unlock className="h-4 w-4" />} title="Soltar a trava" aria-label={`Soltar trava ${rotuloDaTrava(t, model)}`} onClick={() => void onSoltar(t, false)} />
            ) : (
              <ActionIconButton
                kind="delete"
                icon={<Unlock className="h-4 w-4" />}
                title="Forçar a liberação"
                aria-label={`Forçar liberação da trava de ${t.holderNome || t.holderEmail}`}
                onClick={async () => {
                  const ok = await confirmar({ title: 'Forçar liberação', message: `A trava de ${t.holderNome || t.holderEmail} (${rotuloDaTrava(t, model)}${t.nota ? ` — "${t.nota}"` : ''}) será solta e essa pessoa avisada pelo canal. Faça isso só se ela não puder soltar.`, confirmLabel: 'Forçar', variant: 'danger' });
                  if (ok) await onSoltar(t, true);
                }}
              />
            ),
        }}
        empty={{ title: 'Nenhuma trava vigente neste ramo', subtitle: 'Trave a seleção, o pavimento ou uma disciplina quando precisar de exclusividade por um tempo.' }}
      />
    </div>
  );
}
