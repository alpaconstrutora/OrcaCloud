/**
 * Aba 3D do editor de Planta Inteligente.
 *
 * `React.lazy` + `<Suspense>` como o `components/planta_ai/View3DTab.tsx`: o
 * three.js (~600 KB) só entra no bundle quando esta vista é aberta. Enquanto o
 * seletor de vista está em "Planta" ou numa elevação, nada de three é baixado.
 */

import React, { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import type { BlueprintModel } from '../../utils/blueprintKernel';
import type { MalhaDoTerreno } from '../../utils/blueprintTopografia';
import type { ExtrasDoRelevo3d } from '../../utils/blueprintTopografia3dExtras';

const Blueprint3DViewer = React.lazy(() => import('./Blueprint3DViewer'));

interface Props {
  model: BlueprintModel;
  levelIds?: string[];
  mostrarLaje?: boolean;
  mostrarArestas?: boolean;
  mostrarTerreno?: boolean;
  /**
   * A malha do relevo (topografia gerada). Com ela, o terreno deixa de ser o
   * plano chato e vira a superfície. `relevoChave` é o hash da versão — é a
   * dependência dos memos, para a malha não remontar a cada render.
   */
  relevo?: MalhaDoTerreno | null;
  relevoChave?: string;
  /** Cota do chão em (x, z) de mundo, para o modo de percorrer. */
  alturaDoChao?: (x: number, z: number) => number | null;
  /** Drenagem traçada e muros de arrimo sobre o relevo (fase 8). `extrasChave` é a dependência dos memos. */
  extrasDoRelevo?: ExtrasDoRelevo3d | null;
  extrasChave?: string;
  /** Ids de peça que a lista de Componentes mandou esconder. Não muda o modelo. */
  ocultos?: Set<string>;
  /** Cor por `uid` — o 4D. Ver `Blueprint3DViewer`. */
  coresPorUid?: Map<string, string>;
  /** Ids do kernel selecionados, para destacar na cena. */
  selecionados?: Set<string>;
  /** Clique numa peça, com o id do KERNEL. Ausente = cena não clicável. */
  onSelecionar?: (ids: string[]) => void;
}

const Carregando = () => (
  <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-slate-400">
    <Loader2 className="h-6 w-6 animate-spin" />
    <span className="text-sm">Carregando modelo 3D…</span>
  </div>
);

export default function Blueprint3DTab(props: Props) {
  return (
    <Suspense fallback={<Carregando />}>
      <Blueprint3DViewer {...props} />
    </Suspense>
  );
}
