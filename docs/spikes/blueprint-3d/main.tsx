/**
 * Harness isolado da VISTA 3D.
 *
 * Monta o `Blueprint3DViewer` REAL (via a aba lazy) com um modelo fixo de dois
 * pavimentos, planta em "L", porta e janela. `?paredes=N` gera uma cena de
 * stress com ~N paredes para medir fps. `?niveis=terreo` mostra só o térreo.
 * `?cena=canto` isola DOIS cantos em close, para conferir a junção.
 *
 * Abrir em: /docs/spikes/blueprint-3d/index.html?laje=1&arestas=1
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import Blueprint3DTab from '../../../components/blueprint/Blueprint3DTab';
import payloadReal from './estudo-real.json';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  modelFromCanonicalPayload,
  point,
  type BlueprintModel,
  type Command,
} from '../../../utils/blueprintKernel';

const T = 150;
const H = 2800;

function pavimento(model: BlueprintModel, levelId: string): BlueprintModel {
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall',
    levelId,
    a: point(ax, ay),
    b: point(bx, by),
    thicknessMm: T,
    heightMm: H,
  });
  const m = applyBatch(model, [
    w(0, 0, 8000, 0),
    w(8000, 0, 8000, 3000),
    w(8000, 3000, 5000, 3000),
    w(5000, 3000, 5000, 5000),
    w(5000, 5000, 0, 5000),
    w(0, 5000, 0, 0),
    w(3000, 0, 3000, 5000),
  ]).model;
  const fachada = m.walls.find((x) => x.levelId === levelId && x.a.y === 0 && x.b.y === 0)!;
  return applyBatch(m, [
    { type: 'AddOpening', wallId: fachada.id, kind: 'door', offsetMm: 700, widthMm: 900, heightMm: 2100, sillMm: 0 },
    { type: 'AddOpening', wallId: fachada.id, kind: 'window', offsetMm: 4200, widthMm: 1600, heightMm: 1200, sillMm: 1000 },
  ]).model;
}

function construirCasa(): { model: BlueprintModel; terreoId: string } {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: H });
  const terreoId = base.model.levels[0].id;
  let m = pavimento(base.model, terreoId);
  m = applyCommand(m, { type: 'AddLevel', name: 'Pav 1', elevationMm: H, defaultHeightMm: H }).model;
  m = pavimento(m, m.levels[1].id);
  m = comLote(m, terreoId);
  return { model: m, terreoId };
}

/**
 * Lote 16 × 12 m em volta da casa (que ocupa 8 × 5), recuada 3 m da frente.
 * As divisas são `TERRENO` — é o que `medirTerreno` reconhece como lote.
 */
function comLote(model: BlueprintModel, levelId: string): BlueprintModel {
  const cantos: [number, number][] = [
    [-4000, -3000],
    [12000, -3000],
    [12000, 9000],
    [-4000, 9000],
  ];
  const cmds: Command[] = cantos.map((a, i) => {
    const b = cantos[(i + 1) % cantos.length];
    return {
      type: 'AddBoundary',
      levelId,
      a: point(a[0], a[1]),
      b: point(b[0], b[1]),
      kind: 'TERRENO',
    };
  });
  return applyBatch(model, cmds).model;
}

/**
 * O LOTE REAL do estudo "Planta 23/08/2026", copiado do `draft_payload`.
 *
 * Existe porque o retângulo sintético acima desenhava certo e o lote de
 * produção não aparecia. As duas diferenças que ele carrega: coordenadas longe
 * da origem (y de −43 m a −18 m) e uma divisa de 10 mm — sim, DEZ milímetros —
 * entre dois vértices quase coincidentes. `?lote=real` reproduz isso.
 */
function comLoteReal(model: BlueprintModel, levelId: string): BlueprintModel {
  const arestas: [number, number, number, number][] = [
    [17020, -43280, 27020, -43280],
    [17020, -18260, 17020, -43280],
    [17020, -18250, 17020, -18260],
    [27020, -43280, 27020, -18250],
    [27020, -18250, 17020, -18250],
  ];
  return applyBatch(
    model,
    arestas.map(([ax, ay, bx, by]) => ({
      type: 'AddBoundary',
      levelId,
      a: point(ax, ay),
      b: point(bx, by),
      kind: 'TERRENO',
    })),
  ).model;
}

/** Paredes na posição real da casa daquele estudo, para o lote não ficar solto. */
function casaNoLoteReal(model: BlueprintModel, levelId: string): BlueprintModel {
  const cantos: [number, number][] = [
    [17095, -38080],
    [26945, -38080],
    [26945, -18355],
    [17095, -18355],
  ];
  return applyBatch(
    model,
    cantos.map((a, i) => {
      const b = cantos[(i + 1) % cantos.length];
      return {
        type: 'AddWall',
        levelId,
        a: point(a[0], a[1]),
        b: point(b[0], b[1]),
        thicknessMm: T,
        heightMm: H,
      };
    }),
  ).model;
}

function construirLoteReal(): { model: BlueprintModel; terreoId: string } {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  });
  const terreoId = base.model.levels[0].id;
  let m = casaNoLoteReal(base.model, terreoId);
  m = comLoteReal(m, terreoId);
  return { model: m, terreoId };
}

/**
 * CENA DO CANTO — o close que reproduz o print do usuário (30/08/2026).
 *
 * Três paredes em cadeia, poucas e curtas, para o enquadramento automático do
 * viewer cair em cima da junção: com a casa inteira em cena a câmera recua e um
 * entalhe de 75 mm vira um pixel.
 *
 * As duas escolhas que fazem esta cena DISCRIMINAR:
 *
 * 1. **Longe da origem e assimétrica.** Fixture centrada na origem não
 *    distingue `z = y` de `z = −y`, e já deixou passar um espelhamento (ver
 *    `shapeDoAnel` no viewer). Aqui a cadeia vive perto de (21 m, −33 m).
 * 2. **Um canto RETO e um OBTUSO (120°).** O avanço certo é `(t/2)/tg(θ/2)`:
 *    em 90° dá exatamente meia espessura, e é por isso que uma implementação
 *    com "meia espessura sempre" passa despercebida numa planta ortogonal. Só o
 *    canto obtuso separa a régua certa da errada.
 */
function construirCanto(): { model: BlueprintModel; terreoId: string } {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  });
  const terreoId = base.model.levels[0].id;

  // Cadeia de TRÊS paredes, e portanto DOIS cantos:
  //   em (24000,−30000)  →  90°, avanço = t/2      = 200 mm
  //   em (24000,−27000)  → 120°, avanço = (t/2)/tg(60°) ≈ 115 mm
  const cantos: [number, number][] = [
    [21000, -30000],
    [24000, -30000],
    [24000, -27000],
    [26598, -25500],
  ];
  const cmds: Command[] = [];
  for (let i = 0; i + 1 < cantos.length; i++) {
    cmds.push({
      type: 'AddWall',
      levelId: terreoId,
      a: point(cantos[i][0], cantos[i][1]),
      b: point(cantos[i + 1][0], cantos[i + 1][1]),
      // Espessura grossa e parede baixa de propósito: o entalhe tem o tamanho
      // do erro, e o enquadramento automático do viewer não dá zoom — com uma
      // parede de 150 mm a 2,80 m o defeito cabe em dois pixels.
      thicknessMm: 400,
      heightMm: 1600,
    });
  }
  return { model: applyBatch(base.model, cmds).model, terreoId };
}

function construirStress(alvo: number): { model: BlueprintModel; terreoId: string } {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: H });
  const terreoId = base.model.levels[0].id;
  const cmds: Command[] = [];
  const lado = Math.ceil(Math.sqrt(alvo / 2));
  const s = 3000;
  for (let i = 0; i <= lado; i++) {
    for (let j = 0; j < lado; j++) {
      cmds.push({ type: 'AddWall', levelId: terreoId, a: point(j * s, i * s), b: point((j + 1) * s, i * s), thicknessMm: T, heightMm: H });
      cmds.push({ type: 'AddWall', levelId: terreoId, a: point(i * s, j * s), b: point(i * s, (j + 1) * s), thicknessMm: T, heightMm: H });
    }
  }
  return { model: applyBatch(base.model, cmds).model, terreoId };
}

/**
 * O caso do relato de 01/09/2026: um PILAR embutido numa parede.
 *
 * `?cena=pilar` mostra os dois lados sobrepostos, como o usuário fotografou.
 * `?cena=pilar&cede=1` marca a parede como quem cede o volume — e é aí que o
 * desenho tem de abrir o vão, em vez de deixar as duas peças ocupando o mesmo
 * espaço. Um print de cada é a única prova que serve aqui: o teste de unidade
 * afirma a faixa em milímetro, não que a malha tenha buraco.
 *
 * Parede baixa e curta de propósito, e pilar mais grosso que ela: assim o
 * encontro ocupa a tela inteira no enquadramento automático do viewer.
 */
function construirPilarEmbutido(
  cede: boolean,
  fino: boolean,
): { model: BlueprintModel; terreoId: string } {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2400,
  });
  const terreoId = base.model.levels[0].id;
  const comParede = applyBatch(base.model, [
    {
      type: 'AddWall',
      levelId: terreoId,
      a: point(0, 0),
      b: point(4000, 0),
      thicknessMm: 150,
      heightMm: 2400,
    },
  ]).model;
  const comPilar = applyBatch(comParede, [
    {
      type: 'AddStructural',
      levelId: terreoId,
      kind: 'PILAR',
      // Na PONTA da parede, como na planta real — é a configuração em que o
      // vão como FURO era ignorado pela triangulação e a parede saía inteira.
      pontos: [point(params.get('meio') === '1' ? 2000 : 4000, 0)],
      larguraMm: 300,
      // ⚠️ `fino` (10 cm) é o que torna o corte VISÍVEL. Com o pilar de 40 cm —
      // o do relato — a parede de 15 cm é mais fina que ele, então o vão aberto
      // fica inteiramente COBERTO pelo concreto e os dois prints saem
      // pixel a pixel iguais. Não é o corte que falha; é a câmera que não tem
      // como ver um buraco atrás de uma peça maior que ele.
      profundidadeMm: fino ? 100 : 400,
      alturaMm: 2400,
      rotulo: 'P1',
    },
  ]).model;

  // `?cede=1` agora CORTA a parede de verdade (01/09/2026) — o pedido do
  // usuário depois de ver que descontar no número e abrir vão no render não era
  // o que ele queria. O ambiente continua fechado porque o pilar empresta a
  // ponte ao arranjo planar.
  // `?cede=1` marca a parede como interrompida pelo concreto — NÃO corta de
  // verdade (o corte destrutivo foi revertido em 01/09/2026: ele não seguia o
  // pilar quando ele era reposicionado).
  const model = cede
    ? applyBatch(comPilar, [
        { type: 'SetCedeSobreposicao', id: comPilar.walls[0].id, cede: true },
      ]).model
    : comPilar;
  return { model, terreoId };
}

/**
 * ─── COMO OLHAR A PLANTA REAL DE UM ESTUDO ──────────────────────────────────
 *
 * Cinco verificações em cena SINTÉTICA aprovaram um defeito que só aparecia na
 * geometria de produção (pilar na PONTA da parede, e laje encostando na base
 * dela). Quando desconfiar de novo, faça o mesmo caminho — leva dois minutos:
 *
 *   1. `npx supabase db query --linked "select draft_payload from
 *      blueprint_branches where id='<branch>'"` → salve como `estudo-real.json`
 *      aqui do lado;
 *   2. `import payload from './estudo-real.json'` e
 *      `modelFromCanonicalPayload(payload)`;
 *   3. filtre paredes e peças a ~3 m da peça suspeita, senão o enquadramento
 *      automático mostra a planta inteira e o pilar de 15 cm some.
 *
 * ⚠️ NÃO comite o JSON: é a planta de um cliente, e este repositório não é
 * lugar de dado de produção.
 */

/**
 * Parede em CAMADAS, com composição deliberadamente ASSIMÉTRICA.
 *
 * `?cena=camadas` — um L de duas paredes com 10 (amarelo/isolamento) + 140
 * (vedação) + 40 (estrutural), somando 190 mm.
 *
 * A assimetria é o ponto inteiro da cena. A ordem da composição é da face
 * ESQUERDA para a DIREITA do sentido `a → b`, e no 3D isso depende do
 * referencial montado por `makeBasis` — um sinal trocado empilharia as faixas ao
 * contrário. Com reboco simétrico (25/140/25) o erro seria INVISÍVEL: as duas
 * faces têm a mesma espessura e a mesma cor. Com 10 de um lado e 40 do outro, em
 * cores diferentes, o print responde de que lado cada camada nasceu.
 *
 * O canto em L é a segunda pergunta: as faixas têm de acompanhar a mitragem sem
 * abrir fresta no encontro das duas paredes.
 */
function construirCamadas(): { model: BlueprintModel; terreoId: string } {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2400,
  });
  const terreoId = base.model.levels[0].id;

  const comParedes = applyBatch(base.model, [
    {
      type: 'AddWall',
      levelId: terreoId,
      a: point(0, 0),
      b: point(3000, 0),
      thicknessMm: 190,
      heightMm: 2400,
    },
    {
      type: 'AddWall',
      levelId: terreoId,
      a: point(3000, 0),
      b: point(3000, 2500),
      thicknessMm: 190,
      heightMm: 2400,
    },
  ]).model;

  const composicao = [
    { espessuraMm: 10, itemCode: 'FORA', descricao: 'Face externa', funcao: 'ISOLAMENTO' as const },
    { espessuraMm: 140, itemCode: 'BLOCO', descricao: 'Bloco', funcao: 'VEDACAO' as const },
    { espessuraMm: 40, itemCode: 'DENTRO', descricao: 'Face interna', funcao: 'ESTRUTURAL' as const },
  ];

  return {
    model: applyBatch(
      comParedes,
      comParedes.walls.map((w): Command => ({
        type: 'SetWallLayers',
        wallId: w.id,
        camadas: composicao,
      })),
    ).model,
    terreoId,
  };
}

const params = new URLSearchParams(location.search);
const stress = Number(params.get('paredes') || 0);
const { model, terreoId } =
  params.get('cena') === 'real'
    ? construirReal(params.get('perto') === '1')
    : params.get('cena') === 'pilar'
    ? construirPilarEmbutido(params.get('cede') === '1', params.get('fino') === '1')
    : params.get('cena') === 'camadas'
      ? construirCamadas()
    : params.get('cena') === 'canto'
      ? construirCanto()
      : params.get('lote') === 'real'
        ? construirLoteReal()
        : stress > 0
          ? construirStress(stress)
          : construirCasa();
const soTerreo = params.get('niveis') === 'terreo';

/**
 * `?ocultar=pilares|paredes|esquadrias` — a régua de visibilidade da lista de
 * Componentes (pedido de 01/09/2026), aplicada ao modelo fixo.
 *
 * O harness não tem o painel lateral; o que ele precisa provar é só que o
 * `ocultos` chega ao viewer e some com a geometria certa. Cada alvo é a família
 * que o olho do cabeçalho alternaria de uma vez.
 *
 * `paredes` esconde METADE, não todas: com a cena vazia as duas imagens do par
 * on/off provariam apenas que a tela apagou, não que o filtro acertou o alvo.
 */
function idsOcultos(m: BlueprintModel, alvo: string | null): Set<string> | undefined {
  if (alvo === 'pilares') return new Set((m.structures ?? []).map((s) => s.id));
  if (alvo === 'esquadrias') return new Set(m.openings.map((o) => o.id));
  if (alvo === 'paredes') {
    return new Set(m.walls.slice(0, Math.ceil(m.walls.length / 2)).map((w) => w.id));
  }
  return undefined;
}

const ocultos = idsOcultos(model, params.get('ocultar'));

function App() {
  return (
    <>
      <div id="barra">
        Paredes: {model.walls.length} · Pavimentos: {model.levels.length}
        {stress > 0 && ' · STRESS'}
        {ocultos && ` · OCULTOS: ${ocultos.size}`}
      </div>
      <div id="tela">
        <Blueprint3DTab
          model={model}
          levelIds={soTerreo ? [terreoId] : undefined}
          mostrarLaje={params.get('laje') === '1'}
          mostrarArestas={params.get('arestas') !== '0'}
          mostrarTerreno={params.get('terreno') === '1'}
          ocultos={ocultos}
        />
      </div>
    </>
  );
}

createRoot(document.getElementById('raiz')!).render(<App />);
