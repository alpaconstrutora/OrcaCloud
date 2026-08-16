/**
 * Harness da ferramenta POLÍGONO.
 *
 * Monta o `BlueprintCanvas` REAL com a ferramenta ativa e reproduz o pouco de
 * editor de que ela depende: gravar as N paredes num lote e recalcular os
 * ambientes. Existe porque o que pode dar errado aqui não aparece em teste de
 * unidade — o gesto de dois cliques, o giro que acompanha o cursor, e o
 * contorno FECHANDO de fato (canto mitrado) para derivar ambiente.
 *
 * `?lados=N` escolhe o número de lados, como o seletor da barra faz.
 *
 * Abrir em: /docs/spikes/poligono/index.html no servidor de dev.
 */

import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  type BlueprintModel,
  type Command,
  type Point,
} from '../../../utils/blueprintKernel';

const T = 200;
const H = 2800;

const lados = Number(new URLSearchParams(location.search).get('lados') ?? 6);

const inicial = applyCommand(emptyModel(), {
  type: 'AddLevel',
  name: 'Térreo',
  elevationMm: 0,
  defaultHeightMm: H,
}).model;

function App() {
  const [modelo, setModelo] = useState<BlueprintModel>(inicial);
  const levelId = modelo.levels[0].id;

  /** UM lote para o polígono inteiro — igual ao editor. */
  function adicionarPoligono(eixos: { a: Point; b: Point }[]) {
    const comandos: Command[] = eixos.map((e) => ({
      type: 'AddWall',
      levelId,
      a: e.a,
      b: e.b,
      thicknessMm: T,
      heightMm: H,
    }));
    try {
      setModelo(applyBatch(modelo, comandos).model);
    } catch (e) {
      console.error('lote recusado:', e);
    }
  }

  // O dump é a parte verificável sem olhar pixel: número de paredes, cantos
  // compartilhados e — o que realmente importa — o ambiente derivado.
  const dump = document.getElementById('dump');
  if (dump) {
    dump.textContent = JSON.stringify(
      {
        lados,
        paredes: modelo.walls.length,
        ambientes: modelo.spaces.length,
        areaM2: modelo.spaces.map((s) => +(s.areaMm2 / 1_000_000).toFixed(2)),
        eixos: modelo.walls.map((w) => [w.a.x, w.a.y, w.b.x, w.b.y]),
      },
      null,
      1,
    );
  }

  return (
    <BlueprintCanvas
      model={modelo}
      tool="poligono"
      levelId={levelId}
      selectedId={null}
      onSelect={() => {}}
      onAddWall={() => null}
      onAddOpening={() => {}}
      larguraAberturaMm={900}
      onDelete={() => {}}
      espessuraMm={T}
      passoGradeMm={100}
      alinhamento="DIREITA"
      ladosPoligono={lados}
      onAddPoligono={adicionarPoligono}
    />
  );
}

createRoot(document.getElementById('raiz')!).render(<App />);
