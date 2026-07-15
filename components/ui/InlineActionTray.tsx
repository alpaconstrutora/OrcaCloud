"use client";

import * as React from "react";
import { MoreVertical } from "lucide-react";
import { AnimatePresence, motion, type Transition } from "motion/react";

const spring: Transition = {
  type: "spring",
  bounce: 0,
  duration: 0.3,
};

export interface InlineActionTrayProps {
  /** Ícones secundários revelados na bandeja. Se vazio, o gatilho não é renderizado. */
  children?: React.ReactNode;
  title?: string;
}

/**
 * Bandeja de ações secundárias para a coluna "Ações" (§9).
 *
 * Diferente do `InlineDisclosureMenu` (menu vertical de texto), esta primitiva
 * mantém as ações como ícones e as revela num painel **flutuante que abre para
 * baixo** ao clicar no gatilho de 3 pontinhos. O painel é `absolute` (overlay),
 * então **não altera a largura da tabela** ao abrir. Usar quando o objetivo é
 * apenas ocultar ícones secundários de forma compacta, mantendo as ações
 * primárias (ex: Editar + Download) sempre visíveis na célula.
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
    <div ref={ref} className="relative inline-flex items-center">
      <button
        type="button"
        title={title}
        aria-label={title}
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="bg-white border border-gray-200 rounded-[6px] shadow-sm p-1.5 text-gray-500 hover:text-blue-600 hover:border-blue-200 transition-all active:scale-95"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={spring}
            onClick={(e) => e.stopPropagation()}
            style={{ transformOrigin: "top right" }}
            className="absolute right-0 top-full z-50 mt-1.5 flex flex-row items-center gap-1.5 rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default InlineActionTray;
