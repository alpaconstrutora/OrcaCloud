/**
 * Harness do laço de seleção e do arraste do conjunto.
 *
 * Monta o `BlueprintCanvas` REAL com o mesmo estado que o editor mantém, aplica
 * os comandos pelo kernel de verdade e expõe o resultado em `window.__paredes`
 * para o script de medição ler.
 *
 * POR QUE ELE EXISTE. Laçar e arrastar são GESTOS: ponteiro pressionado, movido
 * e solto sobre pixels. jsdom não tem layout — `getBoundingClientRect` devolve
 * zero — então nenhum teste de componente consegue apertar "na parede que está
 * em x=200, y=640". Sem isto, a única prova de que o laço discrimina os dois
 * modos seria eu afirmar que discrimina.
 *
 * `?vizinhas=1` liga o modo ESTICAR. É a chave que o editor põe na barra.
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
import type { FormaMedida } from '../../../utils/blueprintMedicoes';

declare global {
  interface Window {
    __modelo?: BlueprintModel;
    __paredes?: { id: string; a: Point; b: Point }[];
    __medicoes?: { id: string; pontos: Point[] }[];
    __selecionados?: string[];
  }
}

const T = 150;
const H = 2800;

/**
 * Sala 6000×4000 no primeiro quadrante, na ordem sul, leste, norte, oeste.
 *
 * As medidas não são arbitrárias: na vista inicial (0,05 px/mm, margem de 60 px)
 * a sala cabe inteira num viewport de 1000×700, e o script consegue calcular
 * onde cada parede cai na tela em vez de procurar por tentativa.
 */
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

/** Uma área medida dentro da sala, para conferir que a outra camada anda junto. */
function medicaoInicial(): FormaMedida {
  return {
    id: 'med_1',
    tipo: 'POLIGONO',
    pontos: [point(1000, 1000), point(3000, 1000), point(3000, 2000), point(1000, 2000)],
    nome: 'Área',
    camada: 'Geral',
    cor: '#16a34a',
  };
}

function App() {
  const [model, setModel] = useState<BlueprintModel>(construir);
  const [medicoes, setMedicoes] = useState<FormaMedida[]>(() => [medicaoInicial()]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const arrastarVizinhas = new URLSearchParams(location.search).get('vizinhas') === '1';

  window.__modelo = model;
  window.__paredes = model.walls.map((w) => ({ id: w.id, a: w.a, b: w.b }));
  window.__medicoes = medicoes.map((f) => ({ id: f.id, pontos: f.pontos }));
  window.__selecionados = selectedIds;

  return (
    <div className="h-full w-full">
      <BlueprintCanvas
        model={model}
        tool="selecionar"
        levelId={model.levels[0]?.id ?? null}
        selectedIds={selectedIds}
        onSelecionar={setSelectedIds}
        arrastarVizinhas={arrastarVizinhas}
        onMoverSelecao={(wallIds, delta) => {
          setModel(
            (atual) =>
              applyCommand(atual, {
                type: 'TranslateWalls',
                wallIds,
                delta,
                arrastarVizinhas,
              }).model,
          );
        }}
        onMoverMedicoes={(ids, delta) => {
          const alvo = new Set(ids);
          setMedicoes((atual) =>
            atual.map((f) =>
              alvo.has(f.id)
                ? { ...f, pontos: f.pontos.map((p) => point(p.x + delta.x, p.y + delta.y)) }
                : f,
            ),
          );
        }}
        onAddWall={() => {}}
        onAddOpening={() => {}}
        onDelete={() => {}}
        larguraAberturaMm={900}
        espessuraMm={T}
        passoGradeMm={100}
        ortogonal
        medicoes={medicoes}
      />
    </div>
  );
}

createRoot(document.getElementById('raiz')!).render(<App />);
