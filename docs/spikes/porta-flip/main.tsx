/**
 * Harness isolado da manipulação de porta: SÍMBOLO, TAMANHO e POSIÇÃO.
 *
 * Quatro paredes, uma porta em cada, uma combinação de `hingeAtStart`/
 * `swingReversed` por parede. Nasceu para o símbolo, porque o risco daquela
 * mudança era o SENTIDO do arco (`anticlockwise` por XOR dos dois flags, ver
 * `BlueprintCanvas.tsx`): errado, sai um arco de 270° em vez do quarto de
 * círculo, e isso só se vê olhando o desenho.
 *
 * Depois recebeu tamanho (largura/altura) e o ARRASTE de posição, que tem o
 * mesmo tipo de risco: teste de acerto, grampo entre vizinhas e prévia só se
 * julgam com ponteiro de verdade sobre o canvas de verdade.
 *
 * A pasta continua `porta-flip` porque planos já commitados apontam para este
 * caminho.
 *
 * Abrir em: /docs/spikes/porta-flip/index.html no servidor de dev.
 */

import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import PainelParedeSelecionada from '../../../components/blueprint/PainelParedeSelecionada';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  point,
  type BlueprintModel,
  type Command,
} from '../../../utils/blueprintKernel';

const T = 200;
const H = 2800;
const LARGURA_PAREDE = 3000;
const LARGURA_PORTA = 900;
const OFFSET_PORTA = (LARGURA_PAREDE - LARGURA_PORTA) / 2;
const ESPACO_Y = 4000;

const COMBINACOES: { hingeAtStart: boolean; swingReversed: boolean; rotulo: string }[] = [
  { hingeAtStart: true, swingReversed: false, rotulo: 'padrão (0,0) — dobradiça início, sem espelhar' },
  { hingeAtStart: false, swingReversed: false, rotulo: 'GIRAR (1,0) — dobradiça na ponta final' },
  { hingeAtStart: true, swingReversed: true, rotulo: 'ESPELHAR (0,1) — abre para o outro lado' },
  { hingeAtStart: false, swingReversed: true, rotulo: 'os DOIS (1,1) — dobradiça final + espelhado' },
];

function construir() {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  });
  const levelId = base.model.levels[0].id;

  // Y do modelo aponta para CIMA; `i` cresce a parede para cima na tela — index
  // 0 fica perto do rodapé (onde a vista nasce enquadrada), os demais acima.
  const paredes: Command[] = COMBINACOES.map((_, i): Command => ({
    type: 'AddWall',
    levelId,
    a: point(0, i * ESPACO_Y),
    b: point(LARGURA_PAREDE, i * ESPACO_Y),
    thicknessMm: T,
    heightMm: H,
  }));

  const comParedes = applyBatch(base.model, paredes).model;

  let modelo = comParedes;
  COMBINACOES.forEach((combo, i) => {
    modelo = applyCommand(modelo, {
      type: 'AddOpening',
      wallId: comParedes.walls[i].id,
      kind: 'door',
      offsetMm: OFFSET_PORTA,
      widthMm: LARGURA_PORTA,
      heightMm: 2100,
      sillMm: 0,
      hingeAtStart: combo.hingeAtStart,
      swingReversed: combo.swingReversed,
    }).model;
  });

  return modelo;
}

const modeloInicial = construir();

function App() {
  const [modelo, setModelo] = useState<BlueprintModel>(modeloInicial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const aberturaSel = modelo.openings.find((o) => o.id === selectedId) ?? null;

  // Clique real → Girar/Espelhar real → comando real → modelo real. É a
  // integração que teste de unidade nenhum cobre: kernel prova a matemática,
  // componente prova o contrato do botão, isto aqui prova que os dois se falam.
  function flipAbertura(axis: 'hinge' | 'swing') {
    if (!aberturaSel) return;
    setModelo(applyCommand(modelo, { type: 'FlipOpening', openingId: aberturaSel.id, axis }).model);
  }

  /**
   * Redimensiona a abertura. O `catch` reproduz o editor: `editor.run` engole o
   * `KernelError` e o transforma na faixa de aviso, sem derrubar a tela — aqui
   * o erro vai para `#erro`, para o passeio conseguir afirmar que a recusa
   * ACONTECEU (e que o modelo não mudou).
   */
  function redimensionarAbertura(campos: { widthMm?: number; heightMm?: number; sillMm?: number }) {
    if (!aberturaSel) return;
    try {
      setModelo(
        applyCommand(modelo, { type: 'SetOpeningSize', openingId: aberturaSel.id, ...campos }).model,
      );
      const el = document.getElementById('erro');
      if (el) el.textContent = '';
    } catch (e) {
      const el = document.getElementById('erro');
      if (el) el.textContent = e instanceof Error ? e.message : String(e);
    }
  }

  function moverAbertura(openingId: string, offsetMm: number) {
    try {
      setModelo(applyCommand(modelo, { type: 'MoveOpening', openingId, offsetMm }).model);
      const el = document.getElementById('erro');
      if (el) el.textContent = '';
    } catch (e) {
      const el = document.getElementById('erro');
      if (el) el.textContent = e instanceof Error ? e.message : String(e);
    }
  }

  const dump = document.getElementById('dump');
  if (dump) {
    dump.textContent = JSON.stringify(
      {
        selectedId,
        openings: modelo.openings.map((o) => ({
          id: o.id,
          hingeAtStart: o.hingeAtStart,
          swingReversed: o.swingReversed,
          widthMm: o.widthMm,
          heightMm: o.heightMm,
          offsetMm: o.offsetMm,
        })),
      },
      null,
      1,
    );
  }

  return (
    <>
      <div id="tela">
        <BlueprintCanvas
          model={modelo}
          tool="selecionar"
          levelId={modelo.levels[0].id}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAddWall={() => null}
          onAddOpening={() => {}}
          larguraAberturaMm={900}
          onDelete={() => {}}
          espessuraMm={T}
          passoGradeMm={null}
          onMoveOpening={moverAbertura}
        />
      </div>
      <div style={{ position: 'absolute', top: 0, right: 0, width: 260, background: '#fff', borderLeft: '1px solid #e2e8f0' }}>
        <PainelParedeSelecionada
          parede={null}
          abertura={aberturaSel}
          pontaQueAnda={null}
          arrastaCanto={false}
          onComprimento={() => {}}
          onEspessura={() => {}}
          podeUnir={false}
          onDividir={() => {}}
          onUnir={() => {}}
          onFlipAbertura={flipAbertura}
          onTamanhoAbertura={redimensionarAbertura}
        />
      </div>
    </>
  );
}

createRoot(document.getElementById('raiz')!).render(<App />);
