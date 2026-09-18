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

import React, { useEffect, useRef, useState } from 'react';
import { Copy, MoreVertical, Pencil, Trash2, Check, X, Layers, Link2, Unlink } from 'lucide-react';
import type { BlueprintModel, Command, Level } from '../../utils/blueprintKernel';
import { useConfirm } from '../ui/confirm';

/**
 * Menu de ações de UM pavimento — Editar, Duplicar, Remover num popover só, com
 * a mesma mecânica do `MenuExibir` (mousedown fora + Esc fecham, `role="menu"`,
 * popover e não modal — `UI_PATTERNS.md`).
 *
 * Eram três ícones soltos por linha. Numa lista de pavimentos empilhados eles
 * repetem N vezes e brigam pelo espaço da linha de 307 px; agrupados, cada linha
 * volta a ter só o rádio, o nome e um gatilho.
 */
export interface AcaoNivel {
  chave: string;
  rotulo: string;
  icone: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  /** Texto em rose — a ação destrutiva. */
  perigo?: boolean;
  desabilitado?: boolean;
  /** Vai para o `title` do item. */
  ajuda?: string;
}

function MenuAcoesNivel({ rotulo, acoes }: { rotulo: string; acoes: AcaoNivel[] }) {
  const [aberto, setAberto] = useState(false);
  const caixaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function foraDaCaixa(e: MouseEvent) {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false);
    }
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false);
    }
    document.addEventListener('mousedown', foraDaCaixa);
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('mousedown', foraDaCaixa);
      document.removeEventListener('keydown', aoTeclar);
    };
  }, [aberto]);

  return (
    <div className="relative shrink-0" ref={caixaRef}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-haspopup="menu"
        title={rotulo}
        className={`rounded p-1 transition-colors ${
          aberto
            ? 'bg-slate-100 text-slate-600'
            : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
        }`}
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>

      {aberto ? (
        <div
          role="menu"
          aria-label={rotulo}
          className="absolute right-0 top-full z-30 mt-1 w-40 rounded-[10px] border border-slate-200 bg-white p-1 shadow-lg"
        >
          {acoes.map((a) => {
            const Icone = a.icone;
            return (
              <button
                key={a.chave}
                type="button"
                role="menuitem"
                disabled={a.desabilitado}
                onClick={() => {
                  setAberto(false);
                  a.onClick();
                }}
                title={a.ajuda}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                  a.desabilitado
                    ? 'cursor-not-allowed text-slate-300'
                    : a.perigo
                      ? 'text-rose-600 hover:bg-rose-50'
                      : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Icone className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{a.rotulo}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

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
  /** PAVIMENTO TIPO (E2.1): quem é cópia de quem, e quantos copiam cada um. */
  const nomeDe = (id: string | undefined) => model.levels.find((l) => l.id === id)?.name ?? '?';
  const copiasDe = (id: string) => model.levels.filter((l) => l.tipoDeId === id).length;
  const [repetindo, setRepetindo] = useState<string | null>(null);
  const [quantasRepeticoes, setQuantasRepeticoes] = useState('3');
  const [vinculando, setVinculando] = useState<string | null>(null);
  /** N cópias vivas acima do topo, uma sobre a outra, com o pé-direito do tipo. */
  const repetir = (l: Level) => {
    const n = Math.max(1, Math.min(60, Math.floor(Number(quantasRepeticoes)) || 1));
    const lote: Command[] = [];
    let cota = topoMm;
    const jaTem = copiasDe(l.id);
    for (let k = 1; k <= n; k++) {
      lote.push({ type: 'AddLevel', name: `${l.name} ${jaTem + k}`, elevationMm: cota, defaultHeightMm: l.defaultHeightMm, tipoDeId: l.id });
      cota += l.defaultHeightMm;
    }
    for (const c of lote) run(c);
    setRepetindo(null);
  };
  const vincular = (l: Level, tipoId: string) => {
    run({ type: 'SetLevelProps', levelId: l.id, tipoDeId: tipoId });
    setVinculando(null);
  };
  const desvincular = (l: Level) => run({ type: 'SetLevelProps', levelId: l.id, tipoDeId: null });

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
                {/* PAVIMENTO TIPO (E2.1): a cópia diz de quem é; o tipo diz quantos o copiam. */}
                {l.tipoDeId !== undefined && (
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-blue-700" data-testid={`vinculo-${l.id}`}>
                    <Link2 className="h-3 w-3" /> cópia de <strong>{nomeDe(l.tipoDeId)}</strong> — edite lá, propaga aqui
                  </p>
                )}
                {copiasDe(l.id) > 0 && (
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-600" data-testid={`tipo-${l.id}`}>
                    <Layers className="h-3 w-3" /> pavimento tipo de {copiasDe(l.id)} pavimento(s)
                  </p>
                )}
                {repetindo === l.id && (
                  <div className="mt-1 flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={quantasRepeticoes}
                      onChange={(e) => setQuantasRepeticoes(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') repetir(l);
                        if (e.key === 'Escape') setRepetindo(null);
                      }}
                      inputMode="numeric"
                      aria-label={`Quantas cópias de ${l.name}`}
                      className="h-7 w-14 rounded-[6px] border border-slate-200 bg-white px-2 text-xs"
                    />
                    <span className="text-[11px] text-slate-500">cópias vivas acima do topo</span>
                    <button type="button" onClick={() => repetir(l)} className="h-7 rounded-[6px] bg-blue-600 px-2 text-[12px] font-medium text-white">
                      Repetir
                    </button>
                    <button type="button" onClick={() => setRepetindo(null)} className="h-7 px-1 text-[12px] text-slate-500">
                      Cancelar
                    </button>
                  </div>
                )}
                {vinculando === l.id && (
                  <div className="mt-1 flex items-center gap-1.5">
                    <select
                      autoFocus
                      defaultValue=""
                      onChange={(e) => e.target.value && vincular(l, e.target.value)}
                      aria-label={`Vincular ${l.name} a um pavimento tipo`}
                      className="h-7 rounded-[6px] border border-slate-200 bg-white px-2 text-xs"
                    >
                      <option value="">Vincular a…</option>
                      {model.levels
                        .filter((t) => t.id !== l.id && t.tipoDeId === undefined && copiasDe(l.id) === 0)
                        .map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                    </select>
                    <span className="text-[11px] text-amber-700">o que este pavimento tem de arquitetura e estrutura será substituído pela cópia</span>
                    <button type="button" onClick={() => setVinculando(null)} className="h-7 px-1 text-[12px] text-slate-500">
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
              <MenuAcoesNivel
                rotulo={`Ações de ${l.name}`}
                acoes={[
                  { chave: 'editar', rotulo: 'Editar', icone: Pencil, onClick: () => setEditando(l.id) },
                  { chave: 'duplicar', rotulo: 'Duplicar', icone: Copy, onClick: () => duplicar(l) },
                  ...(l.tipoDeId === undefined
                    ? [
                        { chave: 'repetir', rotulo: 'Repetir como pavimento tipo…', icone: Layers, onClick: () => setRepetindo(l.id), ajuda: 'Cria N cópias vivas deste pavimento; editar aqui propaga a todas' },
                        ...(copiasDe(l.id) === 0 && model.levels.some((t) => t.id !== l.id && t.tipoDeId === undefined)
                          ? [{ chave: 'vincular', rotulo: 'Vincular a um tipo…', icone: Link2, onClick: () => setVinculando(l.id), ajuda: 'Este pavimento passa a ser cópia viva de outro' }]
                          : []),
                      ]
                    : [{ chave: 'desvincular', rotulo: 'Desvincular do tipo', icone: Unlink, onClick: () => desvincular(l), ajuda: 'As cópias ficam, agora editáveis; deixam de acompanhar o tipo' }]),
                  {
                    chave: 'remover',
                    rotulo: 'Remover',
                    icone: Trash2,
                    perigo: true,
                    desabilitado: model.levels.length <= 1,
                    ajuda: model.levels.length <= 1 ? 'É o único pavimento' : undefined,
                    onClick: () => void remover(l),
                  },
                ]}
              />
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
