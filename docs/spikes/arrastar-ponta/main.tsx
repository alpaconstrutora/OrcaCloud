/**
 * Harness de arrastar ponta e trava ortogonal.
 *
 * Monta o `BlueprintCanvas` REAL, com o mesmo estado que o editor mantém, e
 * expõe o modelo em `window.__modelo` para o script de medição ler.
 *
 * POR QUE ELE EXISTE. Arrastar é gesto: ponteiro pressionado, movido e solto
 * sobre pixels. jsdom não tem layout — `getBoundingClientRect` devolve zero —
 * então nenhum teste de componente consegue apertar numa alça que está "em
 * x=340, y=210". Sem isto, a única prova de que arrastar funciona seria eu
 * afirmar que funciona.
 */
import '../../../index.css';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  point,
  type BlueprintModel,
  type Command,
  type Point,
} from '../../../utils/blueprintKernel';

declare global {
  interface Window {
    __modelo?: BlueprintModel;
    __selecionar?: (id: string) => void;
    __paredes?: { id: string; a: Point; b: Point }[];
  }
}

const T = 150;
const H = 2800;

function construir(): BlueprintModel {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  });
  const levelId = base.model.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall',
    levelId,
    a: point(ax, ay),
    b: point(bx, by),
    thicknessMm: T,
    heightMm: H,
  });

  return applyBatch(base.model, [
    w(0, 0, 6000, 0),
    w(6000, 0, 6000, 4000),
    w(6000, 4000, 0, 4000),
    w(0, 4000, 0, 0),
  ]).model;
}

function App() {
  const [model, setModel] = useState<BlueprintModel>(construir);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ortogonal, setOrtogonal] = useState(
    new URLSearchParams(location.search).get('orto') !== '0',
  );

  window.__modelo = model;
  window.__paredes = model.walls.map((w) => ({ id: w.id, a: w.a, b: w.b }));
  window.__selecionar = setSelectedId;

  return (
    <div className="h-full w-full">
      <BlueprintCanvas
        model={model}
        tool="selecionar"
        levelId={model.levels[0]?.id ?? null}
        selectedIds={selectedId ? [selectedId] : []}
        onSelecionar={(ids) => setSelectedId(ids[0] ?? null)}
        onAddWall={() => {}}
        onAddOpening={() => {}}
        onDelete={() => {}}
        larguraAberturaMm={900}
        espessuraMm={T}
        passoGradeMm={100}
        ortogonal={ortogonal}
        onMoveVertex={(wallId, end, to) => {
          setModel((atual) => applyCommand(atual, { type: 'MoveVertex', wallId, end, to }).model);
        }}
      />
      <button
        type="button"
        data-orto
        onClick={() => setOrtogonal((v) => !v)}
        style={{ position: 'absolute', top: 8, left: 8 }}
      >
        orto: {ortogonal ? 'on' : 'off'}
      </button>
    </div>
  );
}

createRoot(document.getElementById('raiz')!).render(<App />);
