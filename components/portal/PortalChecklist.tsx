import React, { useState } from 'react';
import { CheckCircle2, Circle, ChevronRight, ChevronDown } from 'lucide-react';
import { sectionLabel, type MergedChecklistItem, type Portal } from '../../utils/portalHelpDefaults';

/**
 * Cartão "Primeiros passos" dos portais externos (tour v2, F8 — 04/10/2026).
 *
 * Só desenha: quem decide o que está feito, grava e navega é o PortalHelp.
 * Some sozinho quando tudo está feito, quando a pessoa oculta, ou quando não
 * há item (abas do checklist ocultas para este externo).
 */
export interface PortalChecklistProps {
  portal: Portal;
  itens: readonly MergedChecklistItem[];
  feitos: ReadonlySet<string>;
  onIr?: (section: string) => void;
  onOcultar?: () => void;
  accent?: 'orange' | 'coral' | 'indigo' | 'teal';
  /**
   * Celular: uma linha com o progresso que abre a lista no lugar (o cartão
   * inteiro comia a primeira dobra — plano 2026-10-16-portal-corretor-mobile, D4).
   */
  compacto?: boolean;
}

const ACCENT = {
  orange: { barra: 'bg-orange-500', link: 'text-orange-600', anel: 'stroke-orange-500' },
  coral: { barra: 'bg-[#E1553C]', link: 'text-[#C24428]', anel: 'stroke-[#E1553C]' },
  indigo: { barra: 'bg-indigo-600', link: 'text-indigo-600', anel: 'stroke-indigo-600' },
  teal: { barra: 'bg-teal-600', link: 'text-teal-700', anel: 'stroke-teal-600' },
};

export const PortalChecklist: React.FC<PortalChecklistProps> = ({ portal, itens, feitos, onIr, onOcultar, accent = 'orange', compacto = false }) => {
  const a = ACCENT[accent];
  const [aberto, setAberto] = useState(false);
  const total = itens.length;
  const prontos = itens.filter(i => feitos.has(i.key)).length;
  if (total === 0 || prontos === total) return null;

  if (compacto && !aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-expanded={false}
        aria-label={`Primeiros passos: ${prontos} de ${total} feitos. Abrir a lista`}
        data-tour="checklist"
        className="w-full flex items-center gap-3 bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm text-left active:bg-gray-50"
      >
        <span className="relative w-8 h-8 shrink-0" aria-hidden>
          <svg viewBox="0 0 36 36" className="w-8 h-8 -rotate-90">
            <circle cx="18" cy="18" r="15" fill="none" strokeWidth="4" className="stroke-gray-100" />
            <circle cx="18" cy="18" r="15" fill="none" strokeWidth="4" strokeLinecap="round"
              className={a.anel} strokeDasharray={`${(prontos / total) * 94.25} 94.25`} />
          </svg>
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-gray-900">Primeiros passos</span>
          <span className="block text-xs text-gray-500">{prontos} de {total} feitos</span>
        </span>
        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
      </button>
    );
  }

  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm" aria-label="Primeiros passos" data-tour="checklist">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-sm font-bold text-gray-900">Primeiros passos</h4>
          <p className="text-xs text-gray-500 mt-0.5">{prontos} de {total} feitos</p>
        </div>
        {compacto && (
          <button type="button" onClick={() => setAberto(false)} className="text-xs font-medium text-gray-500 hover:text-gray-800 hover:underline">
            Recolher
          </button>
        )}
        {onOcultar && (
          <button type="button" onClick={onOcultar} title="Esconde este cartão; ele volta pela Ajuda" className="text-xs font-medium text-gray-500 hover:text-gray-800 hover:underline">
            Ocultar
          </button>
        )}
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-gray-100 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={prontos} aria-label="Progresso dos primeiros passos">
        <div className={`h-full rounded-full ${a.barra} transition-all`} style={{ width: `${Math.round((prontos / total) * 100)}%` }} />
      </div>
      <ul className="mt-3 divide-y divide-gray-100">
        {itens.map(item => {
          const feito = feitos.has(item.key);
          return (
            <li key={item.key} className="flex items-center justify-between gap-3 py-2">
              <span className="flex items-center gap-2.5 min-w-0">
                {feito
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-label="Feito" />
                  : <Circle className="w-4 h-4 text-gray-300 shrink-0" aria-label="A fazer" />}
                <span className="min-w-0">
                  <span className={`block text-sm truncate ${feito ? 'text-gray-400' : 'text-gray-800'}`}>{item.title}</span>
                  <span className="block text-xs text-gray-400">{sectionLabel(portal, item.section)}</span>
                </span>
              </span>
              {!feito && onIr && (
                <button type="button" onClick={() => onIr(item.section)} className={`inline-flex items-center gap-0.5 text-xs font-semibold ${a.link} hover:underline shrink-0`}>
                  Ir <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default PortalChecklist;
