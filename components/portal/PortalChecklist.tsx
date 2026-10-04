import React from 'react';
import { CheckCircle2, Circle, ChevronRight } from 'lucide-react';
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
  accent?: 'orange' | 'coral' | 'indigo';
}

const ACCENT = {
  orange: { barra: 'bg-orange-500', link: 'text-orange-600' },
  coral: { barra: 'bg-[#E1553C]', link: 'text-[#C24428]' },
  indigo: { barra: 'bg-indigo-600', link: 'text-indigo-600' },
};

export const PortalChecklist: React.FC<PortalChecklistProps> = ({ portal, itens, feitos, onIr, onOcultar, accent = 'orange' }) => {
  const a = ACCENT[accent];
  const total = itens.length;
  const prontos = itens.filter(i => feitos.has(i.key)).length;
  if (total === 0 || prontos === total) return null;

  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm" aria-label="Primeiros passos" data-tour="checklist">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-sm font-bold text-gray-900">Primeiros passos</h4>
          <p className="text-xs text-gray-500 mt-0.5">{prontos} de {total} feitos</p>
        </div>
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
