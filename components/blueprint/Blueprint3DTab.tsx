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
  /** Rótulos "ø100 mm" das redes hidráulicas — ver `Blueprint3DViewer`. */
  mostrarRotulosDeRede?: boolean;
  /** ESTILO (E8.2): repassado ao visualizador. */
  estilo?: 'SOMBREADO' | 'LINHA_OCULTA' | 'TRANSPARENTE';
  mostrarTerreno?: boolean;
  /** ENVELOPE 3D (E3.3): prismas edificáveis por pavimento. Ver `Blueprint3DViewer`. */
  envelope?: { levelId: string; nome: string; anel: { x: number; y: number }[]; pecas?: { x: number; y: number }[][]; baseMm: number; topoMm: number; acimaDoGabarito: boolean }[];
  /** ESTUDO DE MASSA (M1): um prisma sólido por pavimento de cada bloco. Ver `Blueprint3DViewer`. */
  massa?: { id: string; chave: string; nome: string; anel: { x: number; y: number }[]; baseMm: number; topoMm: number; cor: string; problema: boolean }[];
  sol?: { x: number; y: number; z: number } | null;
  entorno?: { id: string; rotulo: string; anel: { x: number; y: number }[]; alturaMm: number }[];
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
  /** CAMADAS EM MEIO-TOM (04/10/2026): peças translúcidas e sem clique — ver `Fantasma` no `Blueprint3DViewer`. */
  atenuados?: Set<string>;
  /** O TERRENO em meio-tom: relevo, envelope e massa vão para a passada translúcida. */
  terrenoEmMeioTom?: boolean;
  /** Cor por `uid` — o 4D. Ver `Blueprint3DViewer`. */
  coresPorUid?: Map<string, string>;
  /** Ids do kernel selecionados, para destacar na cena. */
  selecionados?: Set<string>;
  /** Clique numa peça, com o id do KERNEL. Ausente = cena não clicável. */
  onSelecionar?: (ids: string[]) => void;
  /** As barras do esquema de armadura, como linhas; o concreto fica translúcido. Ver `Blueprint3DViewer`. */
  armadura?: { pecas: readonly ArmaduraDaPeca[]; hipoteses: HipotesesDeArmadura };
  /**
   * E10.3 (climatização): MOVER no 3D — com seleção, a alça de setas (só em planta) aparece; ao
   * soltar, o deslocamento em mm do modelo chega aqui para virar UM `TranslateEntities` (um Ctrl+Z).
   * Ausente = sem alça.
   */
  onMover?: (delta: { x: number; y: number }) => void;
  /** E10.3: a caixa de corte ligada desde o início (METRO, Y para cima) — o harness e a vista que a pede. */
  caixaDeCorteInicial?: import('../../utils/blueprint3dSelecao').CaixaDeCorte | null;
  /**
   * E10.4b: modelos IFC EXTERNOS desenhados como referência — só para olhar. Não são
   * peça do modelo: não se clicam, não entram no enquadramento nem no hash; a caixa
   * de corte os recorta junto. `matriz` vem de `matrizDaReferencia`.
   */
  referencias?: readonly import('./Blueprint3DViewer').ReferenciaNo3D[];
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
