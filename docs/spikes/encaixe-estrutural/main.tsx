/**
 * Harness do ENCAIXE nas peças de concreto.
 *
 * Monta o `BlueprintCanvas` REAL com uma viga sozinha em cena, selecionada, e
 * deixa o passeio traçar uma parede a partir dela. As duas perguntas só se
 * respondem com ponteiro de verdade sobre o canvas de verdade:
 *
 *   1. o clique perto do CANTO da viga vira exatamente o canto (e não o ponto
 *      da grade ao lado)?
 *   2. o clique perto da ponta do EIXO vira exatamente a ponta?
 *
 * Nenhum teste de unidade alcança isso: quem decide é `capturar`, dentro do
 * componente, a partir da distância em PIXEL — e jsdom não tem pixel.
 *
 * ─── AS MEDIDAS SÃO TORTAS DE PROPÓSITO ─────────────────────────────────────
 *
 * Largura 1230 mm e ponta em x = 6010: nenhum dos pontos de conexão cai num
 * múltiplo do passo da grade (100 mm). Com medidas redondas, encaixe e grade
 * dariam a MESMA resposta e o passeio aprovaria os dois mundos — inclusive o
 * mundo sem encaixe nenhum, que é o que se quer reprovar.
 *
 * A largura também é exagerada (1,23 m) para os cantos ficarem a 615 mm do
 * eixo: mais que os 240 mm do raio de encaixe na escala inicial (SNAP_PX 12 ÷
 * 0,05 px/mm). Assim o clique no canto não pode ser confundido com o clique no
 * eixo, e cada pergunta testa uma urna só.
 *
 * Abrir em: /docs/spikes/encaixe-estrutural/index.html no servidor de dev.
 */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import {
  applyBatch,
  applyCommand,
  contornoEmPlanta,
  emptyModel,
  pontosDeConexaoEstrutural,
  type BlueprintModel,
  type Command,
  type Point,
} from '../../../utils/blueprintKernel';

const ESPESSURA = 150;
const H = 2800;

const comNivel = applyCommand(emptyModel(), {
  type: 'AddLevel',
  name: 'Térreo',
  elevationMm: 0,
  defaultHeightMm: H,
}).model;

const inicial = applyCommand(comNivel, {
  type: 'AddStructural',
  levelId: comNivel.levels[0].id,
  kind: 'VIGA',
  pontos: [
    { x: 2000, y: 4000 },
    { x: 6010, y: 4000 },
  ],
  larguraMm: 1230,
  profundidadeMm: 0,
  alturaMm: 500,
  rotulo: 'V1',
}).model;

function App() {
  const [model, setModel] = useState<BlueprintModel>(inicial);
  const levelId = model.levels[0].id;
  const viga = model.structures[0];

  function adicionarParede(a: Point, b: Point): string | null {
    try {
      const r = applyBatch(model, [
        { type: 'AddWall', levelId, a, b, thicknessMm: ESPESSURA, heightMm: H },
      ] as Command[]);
      setModel(r.model);
      return r.diff.created.find((id) => id.startsWith('wal')) ?? null;
    } catch (e) {
      console.error('lote recusado:', e);
      return null;
    }
  }

  // O dump é a parte verificável sem olhar pixel: onde o clique ATERRISSOU,
  // contra os pontos de conexão que a peça oferece.
  const dump = {
    conexao: pontosDeConexaoEstrutural(viga),
    contorno: contornoEmPlanta(viga),
    paredes: model.walls.map((w) => ({ id: w.id, a: w.a, b: w.b })),
  };
  const el = document.getElementById('dump');
  if (el) el.textContent = JSON.stringify(dump, null, 1);

  return (
    <BlueprintCanvas
      model={model}
      tool="parede"
      levelId={levelId}
      // Selecionada de saída: é o estado do print do pedido, e é o que faz o
      // canvas desenhar as alças do eixo e os pontos de conexão dos cantos.
      selectedIds={[viga.id]}
      onSelecionar={() => {}}
      onAddWall={adicionarParede}
      alinhamento="EIXO"
      onInverterLado={() => {}}
      onAddOpening={() => {}}
      larguraAberturaMm={900}
      onDelete={() => {}}
      espessuraMm={ESPESSURA}
      passoGradeMm={100}
      ortogonal={false}
    />
  );
}

createRoot(document.getElementById('raiz')!).render(<App />);
