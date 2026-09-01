/**
 * Harness isolado do desenho de parede.
 *
 * Monta o BlueprintCanvas REAL — não uma cópia — com um modelo fixo, sem
 * Supabase e sem login. Existe porque duas correções de canto seguidas foram
 * feitas no escuro: `tsc` e testes não olham pixel, e sem ver o resultado a
 * correção vira chute.
 *
 * Abrir em: /docs/spikes/wall-render/index.html no servidor de dev.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  point,
  pontasSoltasDoNivel,
  type Command,
} from '../../../utils/blueprintKernel';

// Espessura exagerada de proposito: a 0,05 px/mm ela rende 60 px na tela, e o
// canto fica grande o bastante para se julgar sem ampliar nada.
const T = 1200;
const H = 2800;

/**
 * Cena de ESPESSURAS DIFERENTES — o caso do print de 27/08/2026.
 *
 * As cenas anteriores usavam espessura uniforme, onde o avanço de mitra e o
 * recuo até a face coincidem. Foi por isso que o defeito passou por toda a
 * bateria de testes: sem espessuras diferentes, as duas grandezas são iguais.
 */
const cenaMista = new URLSearchParams(location.search).get('mista') === '1';
/** Rótulo de ambiente no desenho: nome, área e perímetro. */
const mostrarRotulos = new URLSearchParams(location.search).get('rotulos') === '1';

function construir() {
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

  const base2 = applyBatch(base.model, [
    // Retângulo fechado: exercita os quatro cantos em L.
    w(0, 0, 16000, 0),
    w(16000, 0, 16000, 11000),
    w(16000, 11000, 0, 11000),
    w(0, 11000, 0, 0),
    // Divisória: junção em T nas duas pontas.
    w(8000, 0, 8000, 4500),
    w(8000, 5400, 8000, 11000),
    // Ponta solta: exercita a extremidade LIVRE.
    w(16000, 5000, 21000, 5000),
  ]).model;

  // Divisoria com VAO ABERTO no meio: e o caso que trava o ambiente e que o
  // painel de vaos existe para resolver. Duas pontas soltas a 900 mm.

  // Aberturas: uma porta e uma janela, para conferir vao, batente e simbolo.
  const paredeSul = base2.walls.find((w) => w.a.y === 11000 && w.b.y === 11000);
  const paredeOeste = base2.walls.find((w) => w.a.x === 0 && w.b.x === 0);

  let comAberturas = base2;
  if (paredeSul) {
    comAberturas = applyCommand(comAberturas, {
      type: 'AddOpening',
      wallId: paredeSul.id,
      kind: 'door',
      offsetMm: 4000,
      widthMm: 900,
      heightMm: 2100,
      sillMm: 0,
    }).model;
  }
  if (paredeOeste) {
    comAberturas = applyCommand(comAberturas, {
      type: 'AddOpening',
      wallId: paredeOeste.id,
      kind: 'window',
      offsetMm: 3000,
      widthMm: 2000,
      heightMm: 1200,
      sillMm: 900,
    }).model;
  }
  return comAberturas;
}

/**
 * Planta de ESPESSURAS DIFERENTES: fachada de 300, divisória de 100.
 *
 * Reproduz o print de 27/08/2026. Com espessura uniforme o defeito é invisível
 * — avanço de mitra e recuo até a face valem os dois `t/2`. Aqui eles diferem
 * por 100 mm, que é a medida que estava mentindo.
 */
function construirMista() {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  });
  const levelId = base.model.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number, t: number): Command => ({
    type: 'AddWall',
    levelId,
    a: point(ax, ay),
    b: point(bx, by),
    thicknessMm: t,
    heightMm: H,
  });

  return applyBatch(base.model, [
    // Envoltória GROSSA (300).
    w(0, 0, 9000, 0, 300),
    w(9000, 0, 9000, 6000, 300),
    w(9000, 6000, 0, 6000, 300),
    w(0, 6000, 0, 0, 300),
    // Divisória FINA (100), em T nas duas fachadas.
    w(4000, 0, 4000, 6000, 100),
  ]).model;
}


/**
 * Planta com PAREDE EM CAMADAS, composição deliberadamente ASSIMÉTRICA.
 *
 * `?camadas=1` — envoltória de 300 mm em 40 (isolamento, amarelo) + 200
 * (vedação) + 60 (estrutural), e divisória de 100 mm em 20 + 60 + 20.
 *
 * A assimetria é o ponto inteiro da cena, pela mesma razão da cena `mista`
 * acima: com composição simétrica (25/200/25) um empilhamento invertido é
 * INVISÍVEL — as duas faces têm a mesma espessura e a mesma cor, e o print sai
 * idêntico com o sinal certo e com o errado.
 *
 * As três perguntas que este print responde, e que nenhum teste de unidade
 * responde:
 *   1. as faixas somam a espessura e ficam DENTRO do contorno da parede;
 *   2. o canto em L continua vivo, sem fresta nem faixa invadindo a vizinha;
 *   3. a divisória em T de 100 mm, mais fina, ainda mostra as três faixas.
 */
function construirCamadas() {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  });
  const levelId = base.model.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number, t: number): Command => ({
    type: 'AddWall',
    levelId,
    a: point(ax, ay),
    b: point(bx, by),
    thicknessMm: t,
    heightMm: H,
  });

  const comParedes = applyBatch(base.model, [
    w(0, 0, 9000, 0, 300),
    w(9000, 0, 9000, 6000, 300),
    w(9000, 6000, 0, 6000, 300),
    w(0, 6000, 0, 0, 300),
    w(4000, 0, 4000, 6000, 100),
  ]).model;

  const proporcao = (t: number) => [
    { espessuraMm: Math.round(t * 0.2), itemCode: 'ISO', descricao: 'Isolamento', funcao: 'ISOLAMENTO' as const },
    { espessuraMm: t - Math.round(t * 0.2) - Math.round(t * 0.2 * 1.5), itemCode: 'BLO', descricao: 'Bloco', funcao: 'VEDACAO' as const },
    { espessuraMm: Math.round(t * 0.2 * 1.5), itemCode: 'EST', descricao: 'Estrutural', funcao: 'ESTRUTURAL' as const },
  ];

  return applyBatch(
    comParedes,
    comParedes.walls.map((parede): Command => ({
      type: 'SetWallLayers',
      wallId: parede.id,
      camadas: proporcao(parede.thicknessMm),
    })),
  ).model;
}

const cenaCamadas = new URLSearchParams(location.search).get('camadas') === '1';
const modelo = cenaCamadas ? construirCamadas() : cenaMista ? construirMista() : construir();

// ?medidas=1 liga o toggle "Medidas" — harness estático, sem botão de verdade,
// mas o mesmo prop que o botão da barra acende.
const mostrarMedidas = new URLSearchParams(location.search).get('medidas') === '1';
// Cadeias de cota por lado — total/parcial/interna. Botão próprio no editor.
const mostrarCotas = new URLSearchParams(location.search).get('cotas') === '1';

function App() {
  return (
    <BlueprintCanvas
      model={modelo}
      tool="selecionar"
      levelId={modelo.levels[0].id}
      selectedIds={[]}
      onSelecionar={() => {}}
      onAddWall={() => {}}
      onAddOpening={() => {}}
      larguraAberturaMm={900}
      onDelete={() => {}}
      espessuraMm={T}
      passoGradeMm={null}
      vaos={[{ a: point(8000, 4500), b: point(8000, 5400), mm: 900 }]}
      pontasSoltas={pontasSoltasDoNivel(modelo, modelo.levels[0])}
      mostrarMedidasParedes={mostrarMedidas}
      mostrarCamadasParedes={cenaCamadas}
      mostrarCotas={mostrarCotas}
      mostrarRotulosAmbiente={mostrarRotulos}
      // Montados como o editor monta: nome, área e perímetro, na mesma ordem.
      rotulosDeAmbiente={modelo.spaces.map((s, i) => ({
        spaceId: s.id,
        linhas: [
          s.name ?? `Ambiente ${i + 1}`,
          `${(s.areaMm2 / 1_000_000).toFixed(2).replace('.', ',')} m²`,
          `${(s.perimeterMm / 1000).toFixed(2).replace('.', ',')} m`,
        ],
      }))}
    />
  );
}

createRoot(document.getElementById('raiz')!).render(<App />);
