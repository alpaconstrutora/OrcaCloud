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

const Blueprint3DViewer = React.lazy(() => import('./Blueprint3DViewer'));

interface Props {
  model: BlueprintModel;
  levelIds?: string[];
  mostrarLaje?: boolean;
  mostrarArestas?: boolean;
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
