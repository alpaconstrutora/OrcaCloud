import React, { useMemo } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

/**
 * O ACESSO RÁPIDO do ribbon em GRUPOS que o usuário reordena (17/09/2026:
 * *"crie grupos de botões e crie possibilidade de mover os grupos para
 * direita/esquerda, deixando ao usuário organizar os grupos de botões
 * conforme ele quiser"*).
 *
 * Cada grupo é uma família de botões (navegar, vistas, zoom, modos, editar…)
 * com uma ALÇA à esquerda; arrastar a alça (ou Espaço + setas, pelo teclado)
 * troca o grupo de lugar. A ordem é preferência de leitura, não dado do
 * estudo: quem a guarda é o chamador (`localStorage`, como a ordem das seções
 * do painel). Grupo que a vista não admite simplesmente não é passado — a
 * ordem salva continua valendo para os que ficaram.
 *
 * A linha é ALINHADA À ESQUERDA (*"alinhe à esquerda"*): o acesso rápido tem
 * linha própria sob as abas, em vez de correr atrás delas e cair torto na
 * segunda linha quando não cabe.
 */

export interface GrupoDoAcessoRapido {
  id: string;
  rotulo: string;
  botoes: React.ReactNode;
}

interface Props {
  grupos: GrupoDoAcessoRapido[];
  /** A ordem preferida (ids); ids desconhecidos são ignorados, grupos novos entram no fim. */
  ordem: string[];
  onOrdem: (ordem: string[]) => void;
  /** O que vai no fim da linha, à direita (a contagem de paredes/ambientes). */
  cauda?: React.ReactNode;
}

/** Aplica a ordem salva aos grupos existentes — os que faltam nela vão para o fim. */
export function ordenarGrupos<T extends { id: string }>(grupos: T[], ordem: string[]): T[] {
  const porId = new Map(grupos.map((g) => [g.id, g]));
  const ordenados = ordem.map((id) => porId.get(id)).filter((g): g is T => !!g);
  const vistos = new Set(ordenados.map((g) => g.id));
  return [...ordenados, ...grupos.filter((g) => !vistos.has(g.id))];
}

function GrupoOrdenavel({ grupo }: { grupo: GrupoDoAcessoRapido }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: grupo.id });
  const estilo: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 1 : undefined,
  };
  return (
    <div
      ref={setNodeRef}
      style={estilo}
      role="group"
      aria-label={grupo.rotulo}
      data-grupo-do-acesso-rapido={grupo.id}
      className="relative flex items-center gap-1 rounded-md border border-transparent pr-1 hover:border-slate-200"
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Arrastar o grupo ${grupo.rotulo}`}
        title={`Arraste para mover o grupo "${grupo.rotulo}" (ou Espaço + setas)`}
        className="shrink-0 cursor-grab rounded p-0.5 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500 active:cursor-grabbing"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      {grupo.botoes}
    </div>
  );
}

export default function AcessoRapido({ grupos, ordem, onOrdem, cauda }: Props) {
  const visiveis = useMemo(() => ordenarGrupos(grupos, ordem), [grupos, ordem]);
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const aoSoltar = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = visiveis.map((g) => g.id);
    const de = ids.indexOf(String(active.id));
    const para = ids.indexOf(String(over.id));
    if (de < 0 || para < 0) return;
    // Guarda a ordem COMPLETA (os grupos ocultos nesta vista mantêm o lugar
    // relativo): o rearranjo é feito sobre a lista visível e reinserido na salva.
    const novaVisivel = arrayMove(ids, de, para);
    const ocultos = ordenarGrupos(
      ordem.filter((id) => !ids.includes(id)).map((id) => ({ id })),
      ordem,
    ).map((g) => g.id);
    onOrdem([...novaVisivel, ...ocultos]);
  };
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1" data-testid="acesso-rapido">
      <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={aoSoltar}>
        <SortableContext items={visiveis.map((g) => g.id)} strategy={horizontalListSortingStrategy}>
          {visiveis.map((g, i) => (
            <React.Fragment key={g.id}>
              {i > 0 && <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-slate-200" />}
              <GrupoOrdenavel grupo={g} />
            </React.Fragment>
          ))}
        </SortableContext>
      </DndContext>
      {cauda && <div className="ml-auto pl-2">{cauda}</div>}
    </div>
  );
}
