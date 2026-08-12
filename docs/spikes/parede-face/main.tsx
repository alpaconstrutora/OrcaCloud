/**
 * Harness isolado do traçado de parede PELA FACE.
 *
 * Monta o `BlueprintCanvas` REAL e reproduz o pouco de editor de que ele
 * depende: aplicar `MoveVertex` + `AddWall` como um lote e devolver o id da
 * parede criada. Sem esse retorno o canto não mitra, então um harness que
 * devolvesse `null` provaria o contrário do que se quer provar.
 *
 * Existe porque `tsc` e teste unitário não olham pixel nem disparam clique: as
 * duas perguntas aqui — "o ponto clicado virou o canto da parede?" e "o rótulo
 * saiu de cima da parede?" — só se respondem com ponteiro de verdade sobre o
 * canvas de verdade.
 *
 * Abrir em: /docs/spikes/parede-face/index.html no servidor de dev.
 * Query: ?alinhamento=DIREITA|ESQUERDA|EIXO
 */

import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas, { type AjustePonta } from '../../../components/blueprint/BlueprintCanvas';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  type AlinhamentoParede,
  type BlueprintModel,
  type Command,
  type Point,
} from '../../../utils/blueprintKernel';

/** Exagerada de propósito: a 0,05 px/mm ela rende 60 px de faixa na tela. */
const T = 1200;
const H = 2800;

const inicialAlinhamento = ((new URLSearchParams(location.search).get('alinhamento') ??
  'DIREITA') as AlinhamentoParede);

/** Mesma regra do editor: do eixo, a tecla passa a desenhar pela face. */
function inverterLado(atual: AlinhamentoParede): AlinhamentoParede {
  return atual === 'ESQUERDA' ? 'DIREITA' : atual === 'DIREITA' ? 'ESQUERDA' : 'DIREITA';
}

const inicial = applyCommand(emptyModel(), {
  type: 'AddLevel',
  name: 'Térreo',
  elevationMm: 0,
  defaultHeightMm: H,
}).model;

function App() {
  const [model, setModel] = useState<BlueprintModel>(inicial);
  const [alinhamento, setAlinhamento] = useState<AlinhamentoParede>(inicialAlinhamento);
  const levelId = model.levels[0].id;

  function adicionarParede(a: Point, b: Point, ajustes?: AjustePonta[]): string | null {
    const comandos: Command[] = [
      ...(ajustes ?? []).map(
        (aj): Command => ({ type: 'MoveVertex', wallId: aj.wallId, end: aj.end, to: aj.to }),
      ),
      { type: 'AddWall', levelId, a, b, thicknessMm: T, heightMm: H },
    ];
    try {
      const r = applyBatch(model, comandos);
      setModel(r.model);
      return r.diff.created.find((id) => id.startsWith('wal')) ?? null;
    } catch (e) {
      console.error('lote recusado:', e);
      return null;
    }
  }

  // O dump é a parte VERIFICÁVEL sem olhar pixel: coordenadas de eixo e área do
  // ambiente derivado provam a mitra e o fechamento do contorno.
  const dump = {
    alinhamento,
    paredes: model.walls.map((w) => ({ id: w.id, a: w.a, b: w.b })),
    ambientes: model.spaces.map((s) => ({ areaMm2: s.areaMm2, anel: s.ring })),
  };
  const el = document.getElementById('dump');
  if (el) el.textContent = JSON.stringify(dump, null, 1);

  return (
    <BlueprintCanvas
      model={model}
      tool="parede"
      levelId={levelId}
      selectedId={null}
      onSelect={() => {}}
      onAddWall={adicionarParede}
      alinhamento={alinhamento}
      onInverterLado={() => setAlinhamento(inverterLado)}
      onAddOpening={() => {}}
      larguraAberturaMm={900}
      onDelete={() => {}}
      espessuraMm={T}
      passoGradeMm={100}
      ortogonal
    />
  );
}

createRoot(document.getElementById('raiz')!).render(<App />);
