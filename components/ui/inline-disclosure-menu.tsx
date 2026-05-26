"use client";

import * as React from "react";
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

const MenuItem: React.FC<MenuItemProps> = ({ icon, label, onClick, className = "" }) => (
  <button
    onClick={onClick}
    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[#363538] transition-colors hover:bg-[#F6F5FA] ${className}`}
  >
    <span className="text-gray-500">{icon}</span>
    <span className="text-sm font-medium tracking-tight">{label}</span>
  </button>
);

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

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirm(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative flex justify-center">
      <div ref={ref} className="relative">
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#EEEEF2] bg-white text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors"
        >
          <MoreVertical className="h-4 w-4" />
        </motion.button>

        <AnimatePresence>
          {open && (
            <motion.div
              variants={menuVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-10 z-50 w-52 overflow-hidden rounded-2xl border-2 border-[#EEEEF2] bg-white shadow-xl"
              style={{ transformOrigin: "top right" }}
            >
              <div className="border-b-2 border-[#EEEEF2] bg-[#FAFAFC] px-4 py-2">
                <span className="text-xs font-medium text-[#828287]">Mais Opções</span>
              </div>

              <LayoutGroup>
                <div className="flex flex-col gap-1 px-2 py-2">
                  {menuItems.map((item, i) => (
                    <MenuItem
                      key={i}
                      {...item}
                      onClick={() => {
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
                            className="h-8 flex-1 cursor-pointer rounded-xl bg-[#F24140] text-xs font-semibold text-white"
                          >
                            Confirmar
                          </button>
                          <button
                            onClick={() => setConfirm(false)}
                            className="h-8 flex-1 cursor-pointer rounded-xl border border-gray-200 text-xs text-gray-600"
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
      </div>
    </div>
  );
}
