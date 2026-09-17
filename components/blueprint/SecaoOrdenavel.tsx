import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

/**
 * Uma seção do painel lateral que se ARRASTA para reordenar (17/09/2026:
 * *"implemente sortable no painel lateral"*). Envolve a `SecaoAccordion` e lhe
 * entrega a ALÇA (`GripVertical`) já ligada ao dnd-kit — a seção não sabe que é
 * ordenável, e o painel não sabe como se arrasta; só este arquivo sabe dos dois.
 *
 * Render-prop, e não `children` puro, porque a alça tem de ficar DENTRO do
 * cabeçalho da seção (à esquerda do chevron), e só a seção sabe onde é isso.
 * Teclado: a alça é focável; Espaço pega, setas movem, Espaço solta — o
 * `KeyboardSensor` do contexto pai faz o resto.
 */
export default function SecaoOrdenavel({
  id,
  children,
}: {
  id: string;
  children: (alca: React.ReactNode) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const estilo: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    position: 'relative',
    zIndex: isDragging ? 1 : undefined,
  };
  const alca = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`Arrastar a seção para reordenar`}
      title="Arraste para reordenar as seções (ou Espaço + setas)"
      className="shrink-0 cursor-grab rounded p-1 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500 active:cursor-grabbing"
    >
      <GripVertical className="h-3.5 w-3.5" />
    </button>
  );
  return (
    <div ref={setNodeRef} style={estilo} data-secao-ordenavel={id}>
      {children(alca)}
    </div>
  );
}
