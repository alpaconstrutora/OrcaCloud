/**
 * Harness do ÍMÃ — o encaixe SOBRE a parede e a MARCA na tela.
 *
 * Usuário, 09/09/2026, depois da entrega: *"nao percebi o funcionamento do
 * snap"*. A fiação entre o motor (que tem 16 testes) e o canvas não tinha teste
 * nenhum — e é exatamente sobre ela que o relato é.
 *
 * Três perguntas que só um ponteiro de verdade sobre o canvas de verdade
 * responde, porque quem decide é `capturar`, dentro do componente, a partir da
 * distância em PIXEL — e o jsdom não tem pixel:
 *
 *   1. mover o cursor perto do MEIO de uma parede prende o ponto NA parede?
 *   2. a MARCA magenta aparece na tela?
 *   3. desligar o encaixe solta o ponto de volta para a grade?
 *
 * ─── AS MEDIDAS SÃO TORTAS DE PROPÓSITO ─────────────────────────────────────
 *
 * A parede vai de (1010, 3030) a (6010, 3030) — nem a linha dela nem o meio
 * dela caem num múltiplo do passo da grade (100 mm). Com medidas redondas, o
 * ímã e a grade dariam a MESMA resposta e o passeio aprovaria os dois mundos,
 * inclusive o mundo sem encaixe nenhum, que é o que se quer reprovar.
 *
 * Abrir em: /docs/spikes/encaixe-osnap/index.html no servidor de dev.
 */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import {
  applyCommand,
  emptyModel,
  type BlueprintModel,
  type Point,
} from '../../../utils/blueprintKernel';
import { TIPOS_DE_ENCAIXE } from '../../../utils/blueprintEncaixe';

const ESPESSURA = 150;
const H = 2800;

const comNivel = applyCommand(emptyModel(), {
  type: 'AddLevel',
  name: 'Térreo',
  elevationMm: 0,
  defaultHeightMm: H,
}).model;

const comParede = applyCommand(comNivel, {
  type: 'AddWall',
  levelId: comNivel.levels[0].id,
  a: { x: 1010, y: 3030 },
  b: { x: 6010, y: 3030 },
  thicknessMm: ESPESSURA,
  heightMm: H,
}).model;

// Um quadro e um circuito: o rótulo do ponto precisa de um circuito para
// escrever, e o ponto SEM circuito precisa existir para o anel âmbar aparecer.
const comQuadro = applyCommand(comParede, {
  type: 'AddQuadro',
  levelId: comParede.levels[0].id,
  nome: 'QDC',
  at: { x: 1500, y: 4500 },
  cotaMm: 1600,
}).model;
const comCircuito = applyCommand(comQuadro, {
  type: 'AddCircuito',
  quadroId: comQuadro.quadros[0].id,
  nome: 'C1',
  secaoMm2: 2.5,
}).model;

// As QUATRO tomadas da NBR 5444, na FACE de cima da parede (y = 3105), para o
// símbolo apontar para dentro sem ninguém girar nada: baixa, média, alta e no
// piso. A primeira com potência e circuito, para as legendas aparecerem.
const inicial = [
  { x: 1400, cota: 300, potencia: 100 as number | null, circuito: true },
  { x: 2200, cota: 1300, potencia: null, circuito: false },
  { x: 3000, cota: 2000, potencia: 600, circuito: false },
  { x: 3800, cota: 0, potencia: null, circuito: false },
  // A quinta é SUGERIDA — o anel tracejado azul (10/09/2026).
  { x: 4600, cota: 300, potencia: null, circuito: false, sugerida: true },
].reduce((m, t) => {
  const criado = applyCommand(m, {
    type: 'AddTerminal',
    levelId: m.levels[0].id,
    disciplina: 'ELETRICA',
    tipo: 'TUG',
    at: { x: t.x, y: 3105 },
    cotaMm: t.cota,
    tipoEletrico: 'TUG',
    sugerida: 'sugerida' in t ? t.sugerida : null,
  }).model;
  const id = criado.terminais[criado.terminais.length - 1].id;
  return applyCommand(criado, {
    type: 'SetTerminalProps',
    terminalId: id,
    potenciaW: t.potencia,
    circuitoId: t.circuito ? criado.circuitos[0].id : null,
  }).model;
}, comCircuito);

function App() {
  const [model, setModel] = useState<BlueprintModel>(inicial);
  const [ligado, setLigado] = useState(true);
  const [sel, setSel] = useState<string[]>([]);
  const [ferramenta, setFerramenta] = useState<'terminal' | 'selecionar' | 'rede'>('terminal');
  const levelId = model.levels[0].id;

  // Onde o TERMINAL aterrissou é a resposta da pergunta 1: ele é criado no
  // ponto que o ímã devolveu, e o kernel o guarda em milímetro inteiro.
  const dump = {
    ligado,
    ferramenta,
    parede: { a: model.walls[0].a, b: model.walls[0].b, esp: model.walls[0].thicknessMm },
    circuito: model.circuitos?.[0]?.id ?? null,
    terminais: (model.terminais ?? []).map((t) => ({
      x: t.at.x,
      y: t.at.y,
      circuitoId: t.circuitoId ?? null,
    })),
  };
  const el = document.getElementById('dump');
  if (el) el.textContent = JSON.stringify(dump, null, 1);

  return (
    <>
      <button
        id="alternar"
        type="button"
        style={{ position: 'fixed', left: 8, top: 8, zIndex: 10 }}
        onClick={() => setLigado((v) => !v)}
      >
        {ligado ? 'encaixe LIGADO' : 'encaixe DESLIGADO'}
      </button>
      <button
        id="ferramenta"
        type="button"
        style={{ position: 'fixed', left: 160, top: 8, zIndex: 10 }}
        onClick={() =>
          setFerramenta((f) =>
            f === 'terminal' ? 'selecionar' : f === 'selecionar' ? 'rede' : 'terminal',
          )
        }
      >
        {ferramenta}
      </button>
      <BlueprintCanvas
        model={model}
        tool={ferramenta}
        levelId={levelId}
        selectedIds={sel}
        onSelecionar={setSel}
        onAddTrecho={(a: Point, b: Point) => {
          try {
            setModel(
              applyCommand(model, {
                type: 'AddTrecho',
                levelId,
                disciplina: 'ELETRICA',
                a,
                b,
                cotaAMm: 300,
                cotaBMm: 300,
                bitolaMm: 25,
              }).model,
            );
          } catch (e) {
            console.error('trecho recusado:', e);
          }
        }}
        onAddTerminal={(at: Point) => {
          try {
            setModel(
              applyCommand(model, {
                type: 'AddTerminal',
                levelId,
                disciplina: 'ELETRICA',
                tipo: 'Tomada',
                at,
                cotaMm: 300,
              }).model,
            );
          } catch (e) {
            console.error('recusado:', e);
          }
        }}
        onMoverSelecao={(wallIds, boundaryIds, structuralIds, aguaIds, delta, rede) => {
          try {
            setModel(
              applyCommand(model, {
                type: 'TranslateEntities',
                wallIds,
                boundaryIds,
                structuralIds,
                aguaIds,
                trechoIds: rede?.trechoIds ?? [],
                terminalIds: rede?.terminalIds ?? [],
                quadroIds: rede?.quadroIds ?? [],
                delta,
                manterJuncoes: false,
              }).model,
            );
          } catch (e) {
            console.error('mover recusado:', e);
          }
        }}
        // ⚠️ O conjunto VAZIO é o caso "desliguei tudo" — e é ele que prova que
        // o controle da barra chega até aqui. Passar `undefined` significaria
        // "tudo ligado", que é o contrário.
        encaixesAtivos={ligado ? new Set<string>(TIPOS_DE_ENCAIXE) : new Set<string>()}
        alinhamento="EIXO"
        onInverterLado={() => {}}
        onAddOpening={() => {}}
        larguraAberturaMm={900}
        onDelete={() => {}}
        espessuraMm={ESPESSURA}
        passoGradeMm={100}
        ortogonal={false}
      />
    </>
  );
}

createRoot(document.getElementById('raiz')!).render(<App />);
