/**
 * BIBLIOTECA DE COMPONENTES (11/10/2026 — F9 do plano
 * `2026-10-11-planta-recursos-video-synaps.md`): a grade de móveis, louças e
 * equipamentos com miniatura, busca e família — arrastar a miniatura para a planta
 * põe a peça no ponto solto (um Ctrl+Z desfaz). Clicar arma a ferramenta, para quem
 * prefere (ou só tem) o teclado: o clique seguinte na planta põe a peça.
 *
 * A miniatura é o MESMO símbolo da planta e do PDF (`tracosDoComponente`), encaixado.
 * As contas (busca, ponto do soltar, miniatura) moram em `utils/blueprintBiblioteca.ts`.
 */
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { FamiliaDeComponente, TipoDeComponente } from '../../utils/blueprintKernel';
import { MIME_DO_COMPONENTE, familiasDaBiblioteca, filtrarBiblioteca, miniaturaDoComponente } from '../../utils/blueprintBiblioteca';

interface Props {
  /** O tipo armado na ferramenta Componente, para a peça aparecer marcada. */
  ativo: TipoDeComponente | null;
  /** Clique numa miniatura: arma a ferramenta com o tipo. */
  onEscolher: (tipoId: TipoDeComponente) => void;
  /** Sem pavimento não há onde soltar — a grade diz por quê. */
  semPavimento?: boolean;
}

const cm = (mm: number) => String(Math.round(mm / 10));

function Miniatura({ tipoId }: { tipoId: TipoDeComponente }) {
  const m = useMemo(() => miniaturaDoComponente(tipoId, 56), [tipoId]);
  const caminho = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox="0 0 56 56" className="h-14 w-14" aria-hidden="true">
      {m.contornos.map((c, i) => (
        <path key={`c${i}`} d={caminho(c)} className="fill-slate-100 stroke-slate-500" strokeWidth={1} />
      ))}
      {m.tracos.map((t, i) => (
        <path key={`t${i}`} d={caminho(t)} className="fill-none stroke-slate-500" strokeWidth={0.8} />
      ))}
    </svg>
  );
}

export default function PainelBibliotecaComponentes({ ativo, onEscolher, semPavimento = false }: Props) {
  const [busca, setBusca] = useState('');
  const [familia, setFamilia] = useState<FamiliaDeComponente | 'CONJUNTOS' | ''>('');
  const familias = useMemo(() => familiasDaBiblioteca(), []);
  const itens = useMemo(() => filtrarBiblioteca(busca, familia || null), [busca, familia]);

  return (
    <div className="flex flex-col gap-2" data-testid="biblioteca-de-componentes">
      <div className="flex items-center gap-1.5">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar: sofá, cama, pia…"
            aria-label="Buscar na biblioteca de componentes"
            className="h-8 w-full rounded-[6px] border border-slate-200 bg-white pl-7 pr-2 text-sm text-slate-800 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </label>
        <select
          value={familia}
          onChange={(e) => setFamilia(e.target.value as FamiliaDeComponente | 'CONJUNTOS' | '')}
          aria-label="Família"
          className="h-8 rounded-[6px] border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="">Todas</option>
          {familias.map((f) => (
            <option key={f.id} value={f.id}>
              {f.rotulo} ({f.quantidade})
            </option>
          ))}
        </select>
      </div>
      <p className="text-[11px] text-slate-500">
        {semPavimento ? 'Crie um pavimento para pôr peças na planta.' : 'Arraste para a planta — ou clique e depois clique na planta.'}
      </p>
      {itens.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-400">Nada com "{busca}".</p>
      ) : (
        <ul className="grid grid-cols-3 gap-1.5">
          {itens.map((it) => (
            <li key={it.tipoId}>
              <button
                type="button"
                draggable={!semPavimento}
                disabled={semPavimento}
                onDragStart={(e) => {
                  e.dataTransfer.setData(MIME_DO_COMPONENTE, it.tipoId);
                  e.dataTransfer.setData('text/plain', it.rotulo);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => onEscolher(it.tipoId)}
                title={semPavimento ? 'Sem pavimento não há onde pôr a peça' : `${it.rotulo} — ${cm(it.larguraMm)} × ${cm(it.profundidadeMm)} cm. Arraste para a planta, ou clique e clique na planta.`}
                aria-label={`${it.rotulo}, ${cm(it.larguraMm)} por ${cm(it.profundidadeMm)} centímetros`}
                aria-pressed={ativo === it.tipoId}
                className={`flex w-full cursor-grab flex-col items-center gap-0.5 rounded-md border px-1 py-1.5 text-center transition-colors active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40 ${
                  ativo === it.tipoId ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50'
                }`}
              >
                <Miniatura tipoId={it.tipoId} />
                <span className="line-clamp-2 text-[11px] leading-tight text-slate-700">{it.rotulo}</span>
                <span className="text-[10px] tabular-nums text-slate-400">
                  {cm(it.larguraMm)}×{cm(it.profundidadeMm)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
