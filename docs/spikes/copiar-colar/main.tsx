/**
 * Harness de COPIAR E COLAR na planta.
 *
 * Monta o `BlueprintCanvas` REAL e liga o Ctrl+C/Ctrl+V dele às funções REAIS
 * de `utils/blueprintAreaDeTransferencia.ts` e ao kernel de verdade — é o mesmo
 * caminho do `BlueprintEditor`, sem o resto do editor. Nada aqui é dublê: se
 * qualquer peça do caminho estiver errada, o resultado sai errado.
 *
 * POR QUE ELE EXISTE. As regras da colagem têm teste de unidade
 * (`__tests__/blueprintAreaDeTransferencia.test.ts`). O que teste nenhum de
 * unidade alcança é a metade de cima do gesto:
 *
 *   - o canvas precisa SABER ONDE O PONTEIRO ESTÁ quando o Ctrl+V chega, e essa
 *     posição é escrita num `ref` a cada `pointermove` — em jsdom não há
 *     `getBoundingClientRect`, então não há posição nenhuma;
 *   - o `paredeSob` que decide em qual parede a porta avulsa cai é medido em
 *     PIXELS, com a escala da vista;
 *   - e o atalho só chega se o canvas estiver com o foco, o que exige um
 *     documento de verdade.
 *
 * Estado exposto em `window.__modelo` para o script de medição ler.
 */
import '../../../index.css';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import {
  applyCommand,
  emptyModel,
  type BlueprintModel,
  type Command,
} from '../../../utils/blueprintKernel';
import {
  comandoDeColagem,
  copiarSelecao,
  type AreaDeTransferencia,
} from '../../../utils/blueprintAreaDeTransferencia';
import type { BlueprintTool } from '../../../hooks/useBlueprintEditor';

declare global {
  interface Window {
    __modelo?: BlueprintModel;
    __paredes?: { id: string; a: { x: number; y: number }; b: { x: number; y: number } }[];
    __aberturas?: { id: string; wallId: string; kind: string; offsetMm: number; widthMm: number }[];
    __selecionar?: (ids: string[]) => void;
    __selecionados?: string[];
    __ferramenta?: (t: BlueprintTool) => void;
    /** O que está na área de transferência. `null` antes do primeiro Ctrl+C. */
    __copiado?: AreaDeTransferencia | null;
    /** Último recado da colagem — o mesmo texto que o editor mostra na faixa. */
    __aviso?: string | null;
  }
}

const T = 150;
const H = 2800;

/**
 * Uma sala de 8 × 5 m com porta e janela na parede de baixo.
 *
 * Medidas escolhidas para o desenho INTEIRO caber na vista inicial (escala
 * 0,05 px/mm, margem de 60 px, origem no rodapé) — e sobrar espaço acima dele
 * para a cópia. Clique fora da tela não chega ao canvas e some sem erro nenhum,
 * que é a armadilha número um de todo harness deste módulo.
 */
function cenario(): { model: BlueprintModel; levelId: string } {
  const nivel = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  });
  const levelId = nivel.model.levels[0].id;

  const paredes: Command[] = [
    { type: 'AddWall', levelId, a: { x: 1000, y: 1000 }, b: { x: 9000, y: 1000 }, thicknessMm: T, heightMm: H },
    { type: 'AddWall', levelId, a: { x: 9000, y: 1000 }, b: { x: 9000, y: 6000 }, thicknessMm: T, heightMm: H },
    { type: 'AddWall', levelId, a: { x: 9000, y: 6000 }, b: { x: 1000, y: 6000 }, thicknessMm: T, heightMm: H },
    { type: 'AddWall', levelId, a: { x: 1000, y: 6000 }, b: { x: 1000, y: 1000 }, thicknessMm: T, heightMm: H },
  ];
  let model = nivel.model;
  const ids: string[] = [];
  for (const cmd of paredes) {
    const r = applyCommand(model, cmd);
    model = r.model;
    ids.push(r.diff.created[0]);
  }

  model = applyCommand(model, {
    type: 'AddOpening',
    wallId: ids[0],
    kind: 'PORTA',
    offsetMm: 1000,
    widthMm: 900,
    heightMm: 2100,
    sillMm: 0,
  }).model;
  model = applyCommand(model, {
    type: 'AddOpening',
    wallId: ids[0],
    kind: 'JANELA',
    offsetMm: 4000,
    widthMm: 1200,
    heightMm: 1200,
    sillMm: 900,
  }).model;

  return { model, levelId };
}

function App() {
  const [{ model, levelId }, setEstado] = useState(cenario);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [copiado, setCopiado] = useState<AreaDeTransferencia | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const busca = new URLSearchParams(location.search);
  const [tool, setTool] = useState<BlueprintTool>(
    (busca.get('tool') as BlueprintTool) ?? 'selecionar',
  );

  const rodar = (comando: Command): string[] => {
    const r = applyCommand(model, comando);
    setEstado((atual) => ({ ...atual, model: r.model }));
    return r.diff.created;
  };

  window.__modelo = model;
  window.__paredes = model.walls.map((w) => ({ id: w.id, a: w.a, b: w.b }));
  window.__aberturas = model.openings.map((o) => ({
    id: o.id,
    wallId: o.wallId,
    kind: o.kind,
    offsetMm: o.offsetMm,
    widthMm: o.widthMm,
  }));
  window.__selecionados = selectedIds;
  window.__selecionar = setSelectedIds;
  window.__ferramenta = setTool;
  window.__copiado = copiado;
  window.__aviso = aviso;

  return (
    <div className="h-full w-full">
      <BlueprintCanvas
        model={model}
        tool={tool}
        levelId={levelId}
        selectedIds={selectedIds}
        onSelecionar={setSelectedIds}
        ortogonal
        mostrarMedidasParedes
        // ── O MESMO caminho do BlueprintEditor ────────────────────────────────
        onCopiar={() => {
          const r = copiarSelecao(model, selectedIds);
          if (!r.ok) {
            setAviso(r.aviso);
            return;
          }
          setCopiado(r.area);
          setAviso(null);
        }}
        onColar={(destino) => {
          if (!copiado) return;
          const r = comandoDeColagem(model, copiado, destino, levelId);
          if (!r.ok) {
            setAviso(r.aviso);
            return;
          }
          const criados = rodar(r.comando);
          setAviso(r.aviso);
          if (criados.length > 0) setSelectedIds(criados);
        }}
        onAddWall={() => ''}
        onAddOpening={() => {}}
        onDelete={() => {}}
        onMoverSelecao={(wallIds, boundaryIds, delta) =>
          rodar({ type: 'TranslateEntities', wallIds, boundaryIds, delta, manterJuncoes: false })
        }
        larguraAberturaMm={900}
        espessuraMm={T}
        passoGradeMm={100}
      />
    </div>
  );
}

createRoot(document.getElementById('raiz')!).render(<App />);
