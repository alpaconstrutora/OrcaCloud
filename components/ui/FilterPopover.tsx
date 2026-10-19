import React from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Filter } from 'lucide-react';

export interface FilterPopoverOption<V extends string> {
  value: V;
  label: string;
}

interface FilterPopoverBaseProps<V extends string> {
  /** Nome da dimensão filtrada — aparece no gatilho ("Status"). */
  label: string;
  options: FilterPopoverOption<V>[];
  /** Ícone do gatilho — default `Filter`. */
  icon?: React.ReactNode;
  className?: string;
}

interface FilterPopoverSingleProps<V extends string> extends FilterPopoverBaseProps<V> {
  multiple?: false;
  value: V;
  onChange: (value: V) => void;
  /** Valor que significa "sem recorte" (default `''`). Com ele selecionado o
   *  gatilho fica neutro; qualquer outro valor pinta o gatilho de azul e mostra
   *  o rótulo escolhido ao lado do nome da dimensão. */
  allValue?: V;
}

interface FilterPopoverMultipleProps<V extends string> extends FilterPopoverBaseProps<V> {
  /** Múltipla escolha (§5.4): itens marcáveis, o painel fica aberto entre cliques. */
  multiple: true;
  value: V[];
  onChange: (value: V[]) => void;
  /** Texto do gatilho para a seleção. Default: o rótulo, se for um só; senão "N de M". */
  resumo?: (value: V[]) => string;
  /** Seleção padrão da tela. Presente: o painel ganha "Restaurar padrão". */
  padrao?: readonly V[];
}

export type FilterPopoverProps<V extends string> = FilterPopoverSingleProps<V> | FilterPopoverMultipleProps<V>;

const MOTIVO_ULTIMO_MARCADO = 'Pelo menos uma opção precisa ficar marcada: marque outra antes de desmarcar esta.';

const mesmaSelecao = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((v) => b.includes(v));

/**
 * Filtro rápido em popover (ui_ux_guia_unificado.md §5.4) — escolha única, ou
 * múltipla com `multiple`.
 *
 * Substitui a fileira de pílulas "Todos / A / B / C" acima da tabela: a mesma
 * escolha cabe num único botão `h-9` dentro da toolbar acoplada (§5.2), e o
 * gatilho diz sozinho qual recorte está ativo.
 *
 * Na múltipla escolha a seleção nunca fica vazia: o último item marcado não
 * desmarca (com o motivo no `title`). Recorte vazio é tela vazia sem explicação.
 * Com todas as opções marcadas o gatilho fica neutro, como o "Todos" da única.
 *
 * O painel sai por portal em `document.body` com posição `fixed`, recalculada
 * ao abrir e enquanto a página rola/redimensiona — a toolbar acoplada vive num
 * card `overflow-hidden`, e um `absolute` comum seria cortado na borda dele
 * (mesma razão histórica do `ColumnConfigButton`).
 */
export function FilterPopover<V extends string>(props: FilterPopoverProps<V>) {
  const { label, options, icon, className = '' } = props;
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState<{ top: number; left: number } | null>(null);

  let active: boolean;
  let activeLabel: string | undefined;
  if (props.multiple) {
    active = props.value.length < options.length;
    activeLabel = props.resumo
      ? props.resumo(props.value)
      : props.value.length === 1
        ? options.find(o => o.value === props.value[0])?.label
        : `${props.value.length} de ${options.length}`;
  } else {
    const allValue = props.allValue ?? ('' as V);
    active = props.value !== allValue;
    activeLabel = options.find(o => o.value === props.value)?.label;
  }

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

  const itemClass = (selected: boolean, travado = false) =>
    `w-full flex items-center justify-between gap-3 px-3 h-9 rounded-[6px] text-sm font-medium text-left transition-colors ${
      selected ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
    } ${travado ? 'cursor-not-allowed' : ''}`;

  const renderItems = () => {
    if (!props.multiple) {
      return options.map(opt => {
        const selected = opt.value === props.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="menuitemradio"
            aria-checked={selected}
            onClick={() => { props.onChange(opt.value); setOpen(false); }}
            className={itemClass(selected)}
          >
            {opt.label}
            {selected && <Check className="w-4 h-4 shrink-0" />}
          </button>
        );
      });
    }

    const { value, onChange, padrao } = props;
    const alternar = (v: V) => {
      if (value.includes(v)) {
        if (value.length === 1) return;
        onChange(value.filter(x => x !== v));
      } else {
        // Mantém a ordem das opções, não a ordem dos cliques.
        onChange(options.map(o => o.value).filter(x => x === v || value.includes(x)));
      }
    };
    const noPadrao = padrao ? mesmaSelecao(value, padrao) : true;
    return (
      <>
        {options.map(opt => {
          const selected = value.includes(opt.value);
          // aria-disabled e não `disabled`: botão desligado não recebe hover e o
          // `title` com o motivo não aparece.
          const travado = selected && value.length === 1;
          return (
            <button
              key={opt.value}
              type="button"
              role="menuitemcheckbox"
              aria-checked={selected}
              aria-disabled={travado || undefined}
              title={travado ? MOTIVO_ULTIMO_MARCADO : undefined}
              onClick={() => alternar(opt.value)}
              className={itemClass(selected, travado)}
            >
              {opt.label}
              {selected && <Check className="w-4 h-4 shrink-0" />}
            </button>
          );
        })}
        {padrao && (
          <div className="border-t border-gray-100 mt-1.5 pt-1.5">
            <button
              type="button"
              onClick={() => onChange(options.map(o => o.value).filter(x => padrao.includes(x)))}
              aria-disabled={noPadrao || undefined}
              title={noPadrao ? 'A seleção já é a padrão.' : undefined}
              className={`w-full px-3 h-8 rounded-[6px] text-[13px] font-medium text-left transition-colors ${
                noPadrao ? 'text-gray-400 cursor-not-allowed' : 'text-blue-600 hover:bg-blue-50'
              }`}
            >
              Restaurar padrão
            </button>
          </div>
        )}
      </>
    );
  };

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
          {renderItems()}
        </div>,
        document.body
      )}
    </>
  );
}

export default FilterPopover;
