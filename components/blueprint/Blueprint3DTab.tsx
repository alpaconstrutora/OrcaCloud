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
import type { ArmaduraDaPeca, HipotesesDeArmadura } from '../../utils/blueprintArmadura';
import type { ExtrasDoRelevo3d } from '../../utils/blueprintTopografia3dExtras';

const Blueprint3DViewer = React.lazy(() => import('./Blueprint3DViewer'));

interface Props {
  model: BlueprintModel;
  levelIds?: string[];
  mostrarLaje?: boolean;
  mostrarArestas?: boolean;
  mostrarTerreno?: boolean;
  /** ENVELOPE 3D (E3.3): prismas edificáveis por pavimento. Ver `Blueprint3DViewer`. */
  envelope?: { levelId: string; nome: string; anel: { x: number; y: number }[]; baseMm: number; topoMm: number; acimaDoGabarito: boolean }[];
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
  /** As barras do esquema de armadura, como linhas; o concreto fica translúcido. Ver `Blueprint3DViewer`. */
  armadura?: { pecas: readonly ArmaduraDaPeca[]; hipoteses: HipotesesDeArmadura };
}

const Carregando = () => (
  <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-slate-400">
    <Loader2 className="h-6 w-6 animate-spin" />
    <span className="text-sm">Carregando modelo 3D…</span>
  </div>
);

export default function Blueprint3DTab(props: Props) {
  const { onSelecionar, selecionados } = props;
  return (
    // ESC LIMPA A SELEÇÃO NO 3D (16/09/2026: *"quando clico na tecla ESC a
    // seleção se desfaz. O mesmo comportamento não acontece na visualização
    // 3D"*). O invólucro é focável para receber a tecla — clicar na cena já lhe
    // dá o foco, porque o canvas WebGL não é focável e o foco sobe para o
    // ancestral mais próximo que é — e o gesto é o mesmo do canvas 2D:
    // `onSelecionar([])`. Fica AQUI, fora do `lazy`, para valer desde o primeiro
    // quadro. Só age quando há o que limpar, para não engolir o Escape de um
    // diálogo aberto por cima.
    <div
      className="h-full w-full outline-none"
      data-testid="cena-3d"
      tabIndex={onSelecionar ? 0 : undefined}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && onSelecionar && (selecionados?.size ?? 0) > 0) {
          e.preventDefault();
          onSelecionar([]);
        }
      }}
    >
      <Suspense fallback={<Carregando />}>
        <Blueprint3DViewer {...props} />
      </Suspense>
    </div>
  );
}
