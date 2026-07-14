"use client";

import * as React from "react";
import { MoreHorizontal } from "lucide-react";
import { AnimatePresence, motion, type Transition } from "motion/react";

const spring: Transition = {
  type: "spring",
  bounce: 0,
  duration: 0.35,
};

export interface InlineActionTrayProps {
  /** Ícones secundários revelados na bandeja horizontal. Se vazio, o gatilho não é renderizado. */
  children?: React.ReactNode;
  title?: string;
}

/**
 * Bandeja horizontal de ações secundárias para a coluna "Ações" (§9).
 *
 * Diferente do `InlineDisclosureMenu` (menu vertical de texto que abre para
 * baixo), esta primitiva mantém as ações como ícones e as revela numa faixa
 * horizontal que desliza aberta para a **esquerda** ao clicar no gatilho de
 * 3 pontinhos. Usar quando o objetivo é apenas ocultar ícones secundários de
 * forma compacta, mantendo Editar + Download sempre visíveis na célula.
 */
export function InlineActionTray({ children, title = "Mais ações" }: InlineActionTrayProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Bandeja vazia (ex: documento integrado) → não mostra o gatilho.
  if (!children || (Array.isArray(children) && children.every((c) => !c))) {
    return null;
  }

  return (
    <div ref={ref} className="inline-flex items-center gap-1.5">
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "auto", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={spring}
            className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap"
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
      <button
        type="button"
        title={title}
        aria-label={title}
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="bg-white border border-gray-200 rounded-[6px] shadow-sm p-1.5 text-gray-500 hover:text-blue-600 hover:border-blue-200 transition-all active:scale-95"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
    </div>
  );
}

export default InlineActionTray;
