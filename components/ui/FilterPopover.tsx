import React from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Filter } from 'lucide-react';

export interface FilterPopoverOption<V extends string> {
  value: V;
  label: string;
}

interface FilterPopoverProps<V extends string> {
  /** Nome da dimensão filtrada — aparece no gatilho ("Status"). */
  label: string;
  options: FilterPopoverOption<V>[];
  value: V;
  onChange: (value: V) => void;
  /** Valor que significa "sem recorte" (default `''`). Com ele selecionado o
   *  gatilho fica neutro; qualquer outro valor pinta o gatilho de azul e mostra
   *  o rótulo escolhido ao lado do nome da dimensão. */
  allValue?: V;
  /** Ícone do gatilho — default `Filter`. */
  icon?: React.ReactNode;
  className?: string;
}

/**
 * Filtro rápido de escolha única em popover (ui_ux_guia_unificado.md §5.4).
 *
 * Substitui a fileira de pílulas "Todos / A / B / C" acima da tabela: a mesma
 * escolha cabe num único botão `h-9` dentro da toolbar acoplada (§5.2), e o
 * gatilho diz sozinho qual recorte está ativo.
 *
 * O painel sai por portal em `document.body` com posição `fixed`, recalculada
 * ao abrir e enquanto a página rola/redimensiona — a toolbar acoplada vive num
 * card `overflow-hidden`, e um `absolute` comum seria cortado na borda dele
 * (mesma razão histórica do `ColumnConfigButton`).
 */
export function FilterPopover<V extends string>({
  label,
  options,
  value,
  onChange,
  allValue = '' as V,
  icon,
  className = '',
}: FilterPopoverProps<V>) {
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState<{ top: number; left: number } | null>(null);

  const active = value !== allValue;
  const activeLabel = options.find(o => o.value === value)?.label;

  const updatePosition = React.useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    // Alinha à esquerda do gatilho; se não couber, encosta na borda direita da janela.
    const width = panelRef.current?.offsetWidth ?? 220;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    setPosition({ top: rect.bottom + 8, left });
  }, []);

  React.useLayoutEffect(() => {
    if (!open) return;
    updatePosition();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={active ? `${label}: ${activeLabel}` : `Filtrar por ${label.toLowerCase()}`}
        className={`h-9 flex items-center gap-1.5 px-3 rounded-[6px] text-sm font-medium border transition-all whitespace-nowrap shrink-0 ${
          active || open
            ? 'border-blue-300 bg-blue-50 text-blue-700'
            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
        } ${className}`}
      >
        {icon ?? <Filter className="w-3.5 h-3.5" />}
        <span>{label}</span>
        {active && activeLabel && (
          <>
            <span className="text-blue-300">·</span>
            <span>{activeLabel}</span>
          </>
        )}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          role="menu"
          aria-label={label}
          style={{ position: 'fixed', top: position?.top ?? -9999, left: position?.left ?? -9999 }}
          className="bg-white rounded-[10px] border border-gray-200 shadow-lg p-1.5 z-[10000] min-w-[200px]"
        >
          {options.map(opt => {
            const selected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`w-full flex items-center justify-between gap-3 px-3 h-9 rounded-[6px] text-sm font-medium text-left transition-colors ${
                  selected ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {opt.label}
                {selected && <Check className="w-4 h-4 shrink-0" />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}

export default FilterPopover;
