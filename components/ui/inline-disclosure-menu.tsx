"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Delete02Icon,
} from "@hugeicons/core-free-icons";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  type Transition,
  type Variants,
} from "motion/react";

export interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  className?: string;
  /** Item visível mas inerte. Sempre com `title` dizendo o porquê. */
  disabled?: boolean;
  title?: string;
}

export interface InlineDisclosureMenuProps {
  menuItems?: MenuItemProps[];
  showDelete?: boolean;
  onDelete?: () => void;
  deleteDisabled?: boolean;
  deleteDisabledTitle?: string;
}

const spring: Transition = {
  type: "spring",
  bounce: 0,
  duration: 0.4,
};

const menuVariants: Variants = {
  hidden: { opacity: 0, scale: 0.94 },
  visible: { opacity: 1, scale: 1, transition: spring },
};

const deleteVariants: Variants = {
  initial: (confirm: boolean) => ({ y: confirm ? 60 : -60 }),
  animate: { y: 0, transition: spring },
  exit: (confirm: boolean) => ({ y: confirm ? -60 : 60, transition: spring }),
};

const confirmVariants: Variants = {
  initial: (confirm: boolean) => ({ y: confirm ? 60 : -60 }),
  animate: { y: 0, transition: spring },
  exit: (confirm: boolean) => ({ y: confirm ? -60 : 60, transition: spring }),
};

const MenuItem: React.FC<MenuItemProps> = ({ icon, label, onClick, className = "", disabled = false, title }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[#363538] transition-colors hover:bg-[#F6F5FA] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent ${className}`}
  >
    <span className="text-gray-500">{icon}</span>
    <span className="text-sm font-medium tracking-tight">{label}</span>
  </button>
);

const MARGEM = 8;

/** Faixa vertical visível para o elemento: a janela, recortada por todo ancestral que corta
 *  o que transborda (overflow auto/scroll/hidden/clip). */
function faixaVisivel(el: HTMLElement): { topo: number; base: number } {
  let topo = 0;
  let base = window.innerHeight;
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowY)) {
      const r = p.getBoundingClientRect();
      topo = Math.max(topo, r.top);
      base = Math.min(base, r.bottom);
    }
  }
  return { topo, base };
}

export function InlineDisclosureMenu({
  menuItems = [],
  showDelete = true,
  onDelete,
  deleteDisabled = false,
  deleteDisabledTitle,
}: InlineDisclosureMenuProps) {
  const [open, setOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const gatilhoRef = React.useRef<HTMLButtonElement>(null);
  const painelRef = React.useRef<HTMLDivElement>(null);
  // Onde o painel abre (2026-11-14: "nas últimas linhas da tabela abre para baixo e fica
  // cortado"). Fora de drawer/modal ele vai para o <body> com position:fixed — nenhum
  // overflow da tabela o corta e nenhuma célula fixa (sticky) o cobre. Dentro de um diálogo
  // Radix fica no lugar (portal para o body ali seria inclicável: o Radix desliga o ponteiro
  // fora do diálogo). Nos dois casos, mede e abre PARA CIMA quando não cabe embaixo.
  const [noLugar, setNoLugar] = React.useState(false);
  const [posicao, setPosicao] = React.useState<{ top: number; right: number; acima: boolean } | null>(null);

  const fechar = React.useCallback(() => {
    setOpen(false);
    setConfirm(false);
  }, []);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (ref.current?.contains(alvo) || painelRef.current?.contains(alvo)) return;
      fechar();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [fechar]);

  // Antes de pintar: decide portal × no lugar e mede o painel para escolher acima/abaixo.
  React.useLayoutEffect(() => {
    if (!open) return;
    const gatilho = gatilhoRef.current;
    if (!gatilho) return;
    const dentroDeDialogo = !!gatilho.closest('[role="dialog"]');
    const r = gatilho.getBoundingClientRect();
    const altura = painelRef.current?.offsetHeight ?? 0;
    const { topo, base } = dentroDeDialogo ? faixaVisivel(gatilho) : { topo: 0, base: window.innerHeight };
    const cabeAbaixo = r.bottom + MARGEM + altura <= base - MARGEM;
    const cabeAcima = r.top - MARGEM - altura >= topo + MARGEM;
    const acima = !cabeAbaixo && cabeAcima;
    setPosicao({
      top: acima ? r.top - MARGEM - altura : r.bottom + MARGEM,
      right: Math.max(MARGEM, window.innerWidth - r.right),
      acima,
    });
  }, [open]);

  // Aberto: rolar ou redimensionar fecha (o painel fixo não acompanharia o botão); Esc fecha
  // e devolve o foco ao botão.
  React.useEffect(() => {
    if (!open) return;
    const aoRolar = (e: Event) => {
      if (painelRef.current && e.target instanceof Node && painelRef.current.contains(e.target)) return;
      fechar();
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      fechar();
      gatilhoRef.current?.focus();
    };
    window.addEventListener("scroll", aoRolar, true);
    window.addEventListener("resize", fechar);
    document.addEventListener("keydown", aoTeclar, true);
    return () => {
      window.removeEventListener("scroll", aoRolar, true);
      window.removeEventListener("resize", fechar);
      document.removeEventListener("keydown", aoTeclar, true);
    };
  }, [open, fechar]);

  const acima = posicao?.acima ?? false;
  const emPortal = !noLugar && typeof document !== "undefined";

  const painel = (
    <AnimatePresence>
      {open && (
        <motion.div
          variants={menuVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          ref={painelRef}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className={`${emPortal ? "fixed z-[60]" : `absolute right-0 z-50 ${acima ? "bottom-10" : "top-10"}`} w-52 overflow-hidden rounded-2xl border-2 border-[#EEEEF2] bg-white shadow-xl`}
          style={{
            transformOrigin: acima ? "bottom right" : "top right",
            ...(emPortal
              ? { top: posicao?.top ?? 0, right: posicao?.right ?? 0, visibility: posicao ? "visible" : "hidden" }
              : { visibility: posicao ? "visible" : "hidden" }),
          }}
        >
          <div className="border-b-2 border-[#EEEEF2] bg-[#FAFAFC] px-4 py-2">
            <span className="text-xs font-medium text-gray-600">Mais opções</span>
          </div>

          <LayoutGroup>
            <div className="flex flex-col gap-1 px-2 py-2">
              {menuItems.map((item, i) => (
                <MenuItem
                  key={i}
                  {...item}
                  onClick={() => {
                    if (item.disabled) return;
                    item.onClick?.();
                    setOpen(false);
                  }}
                />
              ))}
            </div>

            {showDelete && (
              <div className="relative h-[48px] overflow-hidden border-t-2 border-[#EEEEF2]">
                <AnimatePresence custom={confirm} mode="popLayout" initial={false}>
                  {!confirm ? (
                    <motion.div
                      key="delete"
                      custom={confirm}
                      variants={deleteVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      className="absolute inset-0 flex items-center px-2"
                    >
                      {deleteDisabled ? (
                        <div
                          title={deleteDisabledTitle}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-gray-300 cursor-not-allowed"
                        >
                          <HugeiconsIcon icon={Delete02Icon} size={18} color="currentColor" />
                          <span className="text-sm font-medium tracking-tight">Excluir</span>
                        </div>
                      ) : (
                        <MenuItem
                          icon={<HugeiconsIcon icon={Delete02Icon} size={18} color="#e94447" />}
                          label="Excluir"
                          className="text-[#e94447]"
                          onClick={() => setConfirm(true)}
                        />
                      )}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="confirm"
                      custom={confirm}
                      variants={confirmVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      className="absolute inset-0 flex items-center gap-2 px-2"
                    >
                      <button
                        onClick={() => { onDelete?.(); setOpen(false); setConfirm(false); }}
                        className="h-8 flex-1 cursor-pointer rounded-xl bg-[#F24140] text-button font-semibold text-white"
                      >
                        Confirmar
                      </button>
                      <button
                        onClick={() => setConfirm(false)}
                        className="h-8 flex-1 cursor-pointer rounded-xl border border-gray-200 text-button text-gray-600"
                      >
                        Cancelar
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </LayoutGroup>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div className="relative flex justify-center">
      <div ref={ref} className="relative">
        <motion.button
          ref={gatilhoRef}
          type="button"
          whileTap={{ scale: 0.92 }}
          onClick={(e) => {
            e.stopPropagation();
            // Decidido no clique (antes de renderizar o painel), para não remontá-lo depois.
            setNoLugar(!!e.currentTarget.closest('[role="dialog"]'));
            setOpen((v) => !v);
          }}
          // Sem nome, o leitor de tela anunciava só "botão" (crítica 2026-11-14).
          aria-label="Mais ações"
          title="Mais ações"
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#EEEEF2] bg-white text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <MoreVertical className="h-4 w-4" />
        </motion.button>

        {emPortal ? createPortal(painel, document.body) : painel}
      </div>
    </div>
  );
}
