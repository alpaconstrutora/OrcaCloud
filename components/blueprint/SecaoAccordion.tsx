import React from 'react';
import { ChevronRight } from 'lucide-react';

/**
 * Seção colapsável do painel lateral do editor de Planta Inteligente.
 *
 * Vocabulário do §19.2 do `docs/ui_ux_guia_unificado.md` (nó de grupo da árvore
 * lateral): `ChevronRight` que gira `rotate-90`, `rounded-[6px]`, `text-sm
 * font-medium`. É o mesmo chevron do `NavDropdown` do `Layout.tsx` e do
 * `ContextSelector` — o app já tem um gesto de "expandir", e este reusa, não
 * inventa outro.
 *
 * ─── POR QUE ABERTO/FECHADO VEM DE FORA ─────────────────────────────────────
 *
 * O padrão é multi-aberto (decidido com o usuário em 29/08/2026): abrir uma
 * seção não fecha as outras. Isso torna tentador dar a cada seção um `useState`
 * próprio — e aí o estado das três fica espalhado, sem como persistir entre
 * sessões nem como o editor abrir a seção de conteúdo quando o usuário troca de
 * aba. Controlado pelo pai, o `usePersistedState` mora num lugar só.
 *
 * ─── POR QUE `acoes` FICA FORA DO `<button>` ────────────────────────────────
 *
 * O cabeçalho de Pavimentos tem um botão "Adicionar". Botão dentro de botão é
 * HTML inválido e, na prática, o clique borbulharia e colapsaria a seção que o
 * usuário acabou de mandar receber um pavimento novo. Por isso o cabeçalho é uma
 * linha flex com DOIS filhos irmãos: o `<button>` que alterna (ocupa a folga) e
 * o slot `acoes` ao lado.
 */
export default function SecaoAccordion({
  titulo,
  contagem,
  acoes,
  aberta,
  onAlternar,
  children,
}: {
  titulo: string;
  /** Número à direita do rótulo (ex: quantos pavimentos). `undefined` = sem. */
  contagem?: number;
  /** Controles próprios da seção, à direita do cabeçalho. */
  acoes?: React.ReactNode;
  aberta: boolean;
  onAlternar: () => void;
  children: React.ReactNode;
}) {
  // `titulo` é o rótulo visível e também identifica a região para leitor de
  // tela — o `aria-labelledby` do corpo aponta para o texto do cabeçalho.
  const idCabecalho = `secao-${titulo.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <section className="shrink-0 border-b border-slate-100">
      <div className="flex items-center gap-1 bg-white px-2 py-1.5">
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={aberta}
          aria-controls={`${idCabecalho}-corpo`}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-[6px] px-1 py-1 text-left text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 hover:text-slate-900"
        >
          <ChevronRight
            aria-hidden
            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
              aberta ? 'rotate-90' : ''
            }`}
          />
          <span id={idCabecalho} className="truncate">
            {titulo}
          </span>
          {contagem !== undefined && (
            <span className="ml-auto shrink-0 rounded-[6px] bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
              {contagem}
            </span>
          )}
        </button>
        {acoes && <div className="shrink-0">{acoes}</div>}
      </div>

      {/* Desmontado quando fechado, não escondido por CSS: o corpo carrega
          painéis caros (Quantitativos deriva a planta inteira) e mantê-los
          montados fora de vista pagaria o custo sem ninguém ver o resultado. */}
      {aberta && (
        <div id={`${idCabecalho}-corpo`} role="region" aria-labelledby={idCabecalho}>
          {children}
        </div>
      )}
    </section>
  );
}
