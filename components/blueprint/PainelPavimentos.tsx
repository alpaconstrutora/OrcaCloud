/**
 * Gestão de pavimentos do editor de Planta Inteligente.
 *
 * Na PLANTA BAIXA, um radio escolhe o nível ativo — o que as ferramentas de
 * desenho editam. Nas VISTAS (elevação/3D), caixas de seleção escolhem quais
 * níveis empilhar. Ações: adicionar (`AddLevel`), editar cota/pé-direito
 * (`SetLevelProps`), duplicar (`DuplicateLevel`) e remover (`RemoveLevel`, com
 * confirmação e travado quando só há um).
 *
 * Cota e pé-direito são digitados em METROS — é como se fala de pavimento — e
 * convertidos para mm inteiro na borda.
 */

import React, { useState } from 'react';
import { Copy, Pencil, Trash2, Check, X } from 'lucide-react';
import type { BlueprintModel, Command, Level } from '../../utils/blueprintKernel';
import { useConfirm } from '../ui/confirm';

interface Props {
  model: BlueprintModel;
  /** true = vistas (multi-seleção); false = planta baixa (nível ativo). */
  modoVista: boolean;
  nivelAtivoId: string | null;
  onEscolherAtivo: (id: string) => void;
  /** Ids dos níveis visíveis nas vistas. */
  niveisVisiveis: string[];
  onNiveisVisiveis: (ids: string[]) => void;
  run: (cmd: Command) => string[];
  /**
   * O formulário de "novo pavimento" está aberto.
   *
   * Vem de fora porque o botão que o abre mora no cabeçalho da
   * `<SecaoAccordion>` que envolve este painel — o pai precisa saber o estado
   * para trocar o rótulo do botão, e este painel precisa saber para desenhar (ou
   * não) o formulário.
   */
  adicionando: boolean;
  onAdicionando: (v: boolean) => void;
}

const mmParaM = (mm: number) => (mm / 1000).toFixed(2);
const mParaMm = (txt: string) => Math.round(parseFloat(txt.replace(',', '.')) * 1000);

interface Rascunho {
  name: string;
  elevacaoM: string;
  peDireitoM: string;
}

function FormNivel({
  titulo,
  inicial,
  onConfirmar,
  onCancelar,
}: {
  titulo: string;
  inicial: Rascunho;
  onConfirmar: (r: Rascunho) => void;
  onCancelar: () => void;
}) {
  const [r, setR] = useState(inicial);
  const valido =
    r.name.trim().length > 0 &&
    Number.isFinite(mParaMm(r.elevacaoM)) &&
    mParaMm(r.peDireitoM) > 0;

  return (
    <div className="rounded-md border border-blue-200 bg-blue-50/60 p-2">
      <p className="mb-1.5 text-xs font-semibold text-slate-700">{titulo}</p>
      <input
        value={r.name}
        onChange={(e) => setR({ ...r, name: e.target.value })}
        placeholder="Nome do pavimento"
        className="mb-1.5 w-full rounded border border-slate-300 px-2 py-1 text-sm"
        aria-label="Nome do pavimento"
      />
      <div className="flex gap-1.5">
        <label className="flex-1 text-[11px] text-slate-500">
          Cota do piso (m)
          <input
            type="number"
            step="0.01"
            value={r.elevacaoM}
            onChange={(e) => setR({ ...r, elevacaoM: e.target.value })}
            className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="flex-1 text-[11px] text-slate-500">
          Pé-direito (m)
          <input
            type="number"
            step="0.01"
            min="0"
            value={r.peDireitoM}
            onChange={(e) => setR({ ...r, peDireitoM: e.target.value })}
            className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
      </div>
      <div className="mt-2 flex justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancelar}
          className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
        >
          <X className="h-3 w-3" /> Cancelar
        </button>
        <button
          type="button"
          disabled={!valido}
          onClick={() => onConfirmar(r)}
          className="inline-flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
        >
          <Check className="h-3 w-3" /> Salvar
        </button>
      </div>
    </div>
  );
}

export default function PainelPavimentos({
  model,
  modoVista,
  nivelAtivoId,
  onEscolherAtivo,
  niveisVisiveis,
  onNiveisVisiveis,
  run,
  adicionando,
  onAdicionando,
}: Props) {
  const confirmar = useConfirm();
  const [editando, setEditando] = useState<string | null>(null);

  // Do mais alto para o mais baixo — a ordem em que se pensa num prédio.
  const niveis = [...model.levels].sort((a, b) => b.elevationMm - a.elevationMm);
  const topoMm = niveis.length
    ? Math.max(...model.levels.map((l) => l.elevationMm + l.defaultHeightMm))
    : 0;
  const paredesDe = (id: string) => model.walls.filter((w) => w.levelId === id).length;

  const alternarVisivel = (id: string) => {
    const tem = niveisVisiveis.includes(id);
    if (tem && niveisVisiveis.length === 1) return; // nunca esconder tudo
    onNiveisVisiveis(tem ? niveisVisiveis.filter((x) => x !== id) : [...niveisVisiveis, id]);
  };

  const adicionar = (r: Rascunho) => {
    const criados = run({
      type: 'AddLevel',
      name: r.name.trim(),
      elevationMm: mParaMm(r.elevacaoM),
      defaultHeightMm: mParaMm(r.peDireitoM),
    });
    onAdicionando(false);
    if (criados[0] && !modoVista) onEscolherAtivo(criados[0]);
    if (criados[0]) onNiveisVisiveis([...niveisVisiveis, criados[0]]);
  };

  const salvarEdicao = (l: Level, r: Rascunho) => {
    run({
      type: 'SetLevelProps',
      levelId: l.id,
      name: r.name.trim(),
      elevationMm: mParaMm(r.elevacaoM),
      defaultHeightMm: mParaMm(r.peDireitoM),
    });
    setEditando(null);
  };

  const duplicar = (l: Level) => {
    const criados = run({
      type: 'DuplicateLevel',
      levelId: l.id,
      novoNome: `${l.name} (cópia)`,
      elevationMm: topoMm,
    });
    if (criados[0]) onNiveisVisiveis([...niveisVisiveis, criados[0]]);
  };

  const remover = async (l: Level) => {
    const ok = await confirmar({
      title: `Remover "${l.name}"?`,
      message: 'Some o pavimento e tudo desenhado nele — paredes, aberturas, limites.',
      variant: 'danger',
      confirmLabel: 'Remover',
    });
    if (!ok) return;
    run({ type: 'RemoveLevel', levelId: l.id });
    onNiveisVisiveis(niveisVisiveis.filter((x) => x !== l.id));
    if (nivelAtivoId === l.id) {
      const resto = model.levels.find((x) => x.id !== l.id);
      if (resto) onEscolherAtivo(resto.id);
    }
  };

  return (
    // Sem cabeçalho próprio: o rótulo "Pavimentos" e o botão "Adicionar" são o
    // cabeçalho da `<SecaoAccordion>` que envolve este painel. Ter os dois
    // renderizaria "Pavimentos" duas vezes, uma embaixo da outra.
    <div className="bg-white px-3 pb-2">
      {adicionando && (
        <div className="mb-2">
          <FormNivel
            titulo="Novo pavimento"
            inicial={{
              name: `Pavimento ${model.levels.length}`,
              elevacaoM: mmParaM(topoMm),
              peDireitoM: mmParaM(niveis[0]?.defaultHeightMm ?? 2800),
            }}
            onConfirmar={adicionar}
            onCancelar={() => onAdicionando(false)}
          />
        </div>
      )}

      <ul className="flex flex-col gap-1">
        {niveis.map((l) =>
          editando === l.id ? (
            <li key={l.id}>
              <FormNivel
                titulo="Editar pavimento"
                inicial={{
                  name: l.name,
                  elevacaoM: mmParaM(l.elevationMm),
                  peDireitoM: mmParaM(l.defaultHeightMm),
                }}
                onConfirmar={(r) => salvarEdicao(l, r)}
                onCancelar={() => setEditando(null)}
              />
            </li>
          ) : (
            <li
              key={l.id}
              className="flex items-center gap-2 rounded-md border border-slate-100 px-2 py-1.5"
            >
              <input
                type={modoVista ? 'checkbox' : 'radio'}
                name="nivel-blueprint"
                checked={modoVista ? niveisVisiveis.includes(l.id) : nivelAtivoId === l.id}
                onChange={() => (modoVista ? alternarVisivel(l.id) : onEscolherAtivo(l.id))}
                className="shrink-0"
                aria-label={`${modoVista ? 'Mostrar' : 'Editar'} ${l.name}`}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{l.name}</p>
                <p className="text-[11px] text-slate-500">
                  cota {mmParaM(l.elevationMm)} m · pé-direito {mmParaM(l.defaultHeightMm)} m ·{' '}
                  {paredesDe(l.id)} parede(s)
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setEditando(l.id)}
                  title="Editar"
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => duplicar(l)}
                  title="Duplicar"
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => remover(l)}
                  disabled={model.levels.length <= 1}
                  title={model.levels.length <= 1 ? 'É o único pavimento' : 'Remover'}
                  className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
