/**
 * Harness — o ímã com SÓ ALGUNS tipos ligados, desenhando estrutura.
 *
 * Usuário, 14/10/2026, com print do menu Encaixe só com "Extremidade" ligada:
 * *"tentei desenhar uma laje e nao encontrou nem o canto e nem a extremidades
 * das paredes"*.
 *
 * A laje, o pilar e a viga passam pelo MESMO `capturarTracado`. Este harness usa
 * o PILAR porque ele grava o ponto capturado num clique só — a laje só grava
 * quando o contorno fecha, e o ponto do vértice não ficaria legível no dump.
 *
 * A combinação é escolhida pela URL: `?ativos=EXTREMIDADE,CANTO&alinhamento=DIREITA`.
 * `DIREITA` é o padrão do editor — e é ele que dá preferência ao CANTO.
 *
 * Abrir em: /docs/spikes/encaixe-laje/index.html no servidor de dev.
 */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import { applyCommand, emptyModel, type BlueprintModel, type Point } from '../../../utils/blueprintKernel';

const ESPESSURA = 150;
const H = 2800;

const comNivel = applyCommand(emptyModel(), {
  type: 'AddLevel',
  name: 'Térreo',
  elevationMm: 0,
  defaultHeightMm: H,
}).model;
const levelId = comNivel.levels[0].id;

// Um L com uma ponta LIVRE em (1010, 1030) e um canto em (6010, 1030). Medidas
// tortas: nada aqui cai num múltiplo da grade de 100 mm.
const inicial = [
  { a: { x: 1010, y: 1030 }, b: { x: 6010, y: 1030 } },
  { a: { x: 6010, y: 1030 }, b: { x: 6010, y: 4030 } },
].reduce(
  (m, w) =>
    applyCommand(m, { type: 'AddWall', levelId, a: w.a, b: w.b, thicknessMm: ESPESSURA, heightMm: H }).model,
  comNivel,
);

const busca = new URLSearchParams(location.search);
const ativos = new Set((busca.get('ativos') ?? '').split(',').filter(Boolean));
const alinhamento = (busca.get('alinhamento') ?? 'DIREITA') as 'EIXO' | 'DIREITA' | 'ESQUERDA';
// `contar` grava o ponto num clique pelo MESMO caminho de Medir linha/área —
// é como se prova que a medição prende nas peças sem cair na grade.
const ferramenta = busca.get('ferramenta') === 'contar' ? 'contar' : 'estrutural';

function App() {
  const [model] = useState<BlueprintModel>(inicial);
  const [pontos, setPontos] = useState<Point[]>([]);

  const el = document.getElementById('dump');
  if (el) el.textContent = JSON.stringify({ ativos: [...ativos], alinhamento, pontos });

  return (
    <BlueprintCanvas
      model={model}
      tool={ferramenta}
      estruturalKind="PILAR"
      levelId={levelId}
      selectedIds={[]}
      onSelecionar={() => {}}
      onAddEstrutural={(_k: unknown, ps: Point[]) => setPontos((v) => [...v, ps[0]])}
      onMedicaoPronta={(_t: unknown, ps: Point[]) => setPontos((v) => [...v, ps[0]])}
      encaixesAtivos={ativos}
      alinhamento={alinhamento}
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
