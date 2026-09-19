/**
 * GRUPO COM ORIGEM (19/09/2026, E2.3) — a gaveta da tarefa "Grupo": agrupar a
 * seleção, instanciar (espelho, giro, deslocamento), remover instância,
 * desagrupar ou excluir com as cópias. Apresentacional: o kernel decide.
 *
 * A seleção diz de que grupo se fala: peça da ORIGEM selecionada → o grupo
 * dela; nada de grupo selecionado → "Agrupar a seleção" e a lista dos grupos
 * do pavimento (com "selecionar a origem" para chegar a um deles).
 */
import React, { useState } from 'react';
import { Boxes, Trash2, Ungroup } from 'lucide-react';
import type { BlueprintModel, Command, EspelhoDoGrupo, ObjectId, RotacaoDoGrupo } from '../../utils/blueprintKernel';
import { comandoDeAgrupar, descreverInstancia, grupoDaSelecao } from '../../utils/blueprintGrupos';

interface Props {
  model: BlueprintModel;
  selectedIds: readonly ObjectId[];
  levelId: ObjectId | null;
  onRun: (c: Command) => void;
  onSelecionar: (ids: ObjectId[]) => void;
  /** A última recusa do kernel — o painel mostra ao lado do gesto. */
  erro: string | null;
}

export default function PainelGrupo({ model, selectedIds, levelId, onRun, onSelecionar, erro }: Props) {
  const [nome, setNome] = useState('');
  const [dx, setDx] = useState('0');
  const [dy, setDy] = useState('0');
  const [giro, setGiro] = useState<RotacaoDoGrupo>(0);
  const [espelho, setEspelho] = useState<EspelhoDoGrupo>('NENHUM');
  const [aviso, setAviso] = useState<string | null>(null);

  const grupo = grupoDaSelecao(model, selectedIds);
  const idsDaOrigem = (g: NonNullable<typeof grupo>): ObjectId[] => [
    ...model.walls.filter((w) => g.origem.walls.includes(w.uid)).map((w) => w.id),
    ...model.structures.filter((s) => g.origem.structures.includes(s.uid)).map((s) => s.id),
    ...(model.labels ?? []).filter((l) => g.origem.labels.includes(l.uid)).map((l) => l.id),
  ];

  const agrupar = () => {
    const r = comandoDeAgrupar(model, selectedIds, nome);
    setAviso(r.aviso);
    if (!r.ok) return;
    onRun(r.comando);
    setNome('');
  };

  const instanciar = () => {
    if (!grupo) return;
    onRun({
      type: 'AddInstanciaDeGrupo',
      grupoId: grupo.id,
      translacao: { x: Math.round(Number(dx) || 0), y: Math.round(Number(dy) || 0) },
      rotacaoGraus: giro,
      espelho,
    });
  };

  const campo = 'rounded-md border border-slate-300 bg-white px-2 py-1 text-xs';

  return (
    <div className="space-y-4 text-xs text-slate-700" data-testid="tarefa-grupo">
      <p className="text-slate-600">
        Um <strong>grupo</strong> tem uma <strong>origem</strong> (paredes com suas esquadrias, estrutura e etiquetas de um pavimento) e{' '}
        <strong>instâncias</strong> — cópias vivas espelhadas, giradas ou deslocadas. Editar a origem propaga; a cópia não se edita. Desagrupar deixa as cópias livres.
      </p>

      {!grupo && (
        <div className="space-y-2 rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="font-semibold text-slate-700">Agrupar a seleção</p>
          <div className="flex items-center gap-2">
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder={`Grupo ${(model.grupos ?? []).length + 1}`} aria-label="Nome do grupo" className={`${campo} flex-1`} maxLength={40} />
            <button type="button" onClick={agrupar} disabled={selectedIds.length === 0} className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1.5 font-semibold text-white disabled:opacity-40">
              <Boxes className="h-3.5 w-3.5" /> Agrupar
            </button>
          </div>
          <p className="text-[11px] text-slate-500">{selectedIds.length === 0 ? 'Selecione paredes e peças na planta.' : `${selectedIds.length} peça(s) selecionada(s).`}</p>
          {(model.grupos ?? []).filter((g) => !levelId || g.levelId === levelId).length > 0 && (
            <ul className="divide-y divide-slate-200 border-t border-slate-200 pt-1">
              {(model.grupos ?? [])
                .filter((g) => !levelId || g.levelId === levelId)
                .map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-2 py-1">
                    <span>
                      <strong>{g.nome}</strong> · {g.origem.walls.length} parede(s) · {g.instancias.length} instância(s)
                    </span>
                    <button type="button" onClick={() => onSelecionar(idsDaOrigem(g))} className="text-blue-700 underline">
                      selecionar a origem
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      {grupo && (
        <div className="space-y-3" data-testid={`grupo-${grupo.id}`}>
          <div className="flex items-center gap-2">
            <input
              key={grupo.id + grupo.nome}
              defaultValue={grupo.nome}
              aria-label="Nome do grupo"
              onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== grupo.nome && onRun({ type: 'SetGrupoProps', grupoId: grupo.id, nome: e.target.value })}
              className={`${campo} flex-1 font-semibold`}
              maxLength={40}
            />
            <span className="text-[11px] text-slate-500">
              {grupo.origem.walls.length} parede(s) · {grupo.origem.structures.length} peça(s) · {grupo.origem.labels.length} etiqueta(s)
            </span>
          </div>
          <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="font-semibold text-slate-700">Nova instância</p>
            <div className="mt-1 grid grid-cols-4 gap-2">
              <label className="flex flex-col gap-1">
                ΔX (mm)
                <input type="number" step={50} value={dx} onChange={(e) => setDx(e.target.value)} aria-label="Deslocamento X da instância (mm)" className={campo} />
              </label>
              <label className="flex flex-col gap-1">
                ΔY (mm)
                <input type="number" step={50} value={dy} onChange={(e) => setDy(e.target.value)} aria-label="Deslocamento Y da instância (mm)" className={campo} />
              </label>
              <label className="flex flex-col gap-1">
                Giro
                <select value={giro} onChange={(e) => setGiro(Number(e.target.value) as RotacaoDoGrupo)} aria-label="Giro da instância" className={campo}>
                  {[0, 90, 180, 270].map((g) => (
                    <option key={g} value={g}>{g}°</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                Espelho
                <select value={espelho} onChange={(e) => setEspelho(e.target.value as EspelhoDoGrupo)} aria-label="Espelho da instância" className={campo}>
                  <option value="NENHUM">Nenhum</option>
                  <option value="X">Horizontal (X)</option>
                  <option value="Y">Vertical (Y)</option>
                </select>
              </label>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-500">
                Espelho e giro em torno do pivô ({(grupo.pivo.x / 1000).toFixed(2).replace('.', ',')}; {(grupo.pivo.y / 1000).toFixed(2).replace('.', ',')}) m, depois o deslocamento.
              </span>
              <button type="button" onClick={instanciar} className="rounded-md bg-slate-900 px-3 py-1.5 font-semibold text-white">
                Instanciar
              </button>
            </div>
          </div>
          <div>
            <p className="font-semibold text-slate-700">{grupo.instancias.length === 0 ? 'Sem instâncias ainda' : `${grupo.instancias.length} instância(s)`}</p>
            <ul className="divide-y divide-slate-100">
              {grupo.instancias.map((i, k) => (
                <li key={i.uid} className="flex items-center justify-between gap-2 py-1">
                  <span>
                    #{k + 1} · {descreverInstancia(model, i)}
                  </span>
                  <button type="button" onClick={() => onRun({ type: 'DeleteInstanciaDeGrupo', grupoId: grupo.id, instanciaUid: i.uid })} aria-label={`Remover a instância ${k + 1}`} className="text-red-700 underline">
                    remover
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex items-center gap-2 border-t border-slate-200 pt-2">
            <button type="button" onClick={() => onRun({ type: 'DeleteGrupo', grupoId: grupo.id, manterInstancias: true })} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-700">
              <Ungroup className="h-3.5 w-3.5" /> Desagrupar (as cópias ficam)
            </button>
            <button type="button" onClick={() => onRun({ type: 'DeleteGrupo', grupoId: grupo.id, manterInstancias: false })} className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 text-red-700">
              <Trash2 className="h-3.5 w-3.5" /> Excluir grupo e cópias
            </button>
          </div>
        </div>
      )}

      {(aviso || erro) && (
        <p role="status" className="text-[11px] text-amber-700">
          {aviso ?? erro}
        </p>
      )}
    </div>
  );
}
