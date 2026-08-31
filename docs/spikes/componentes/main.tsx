/**
 * Harness do painel "Componentes" — o gerenciador de peças do editor de plantas
 * (pedido de 31/08/2026).
 *
 * POR QUE ELE EXISTE. O teste de componente prova que a linha ESTÁ no DOM, com
 * o rótulo e a medida certos. Ele não prova que ela CABE: a linha tem ícone,
 * rótulo, detalhe, medida e lixeira dentro dos 307 px do painel, e jsdom não faz
 * layout — `getBoundingClientRect` devolve zero para tudo. A aba "Versões" já
 * sumiu da tela exatamente assim, presente no DOM e recortada pelo `overflow`
 * (ver `docs/spikes/abas-editor/`).
 *
 * ARMADILHA de todo harness deste módulo: sem `index.css` as classes do Tailwind
 * não existem, o painel vem com a largura natural do bloco e a medição aprova
 * qualquer coisa.
 */
import '../../../index.css';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import PainelComponentes from '../../../components/blueprint/PainelComponentes';
import PainelEstruturaSelecionada from '../../../components/blueprint/PainelEstruturaSelecionada';
import SecaoAccordion from '../../../components/blueprint/SecaoAccordion';
import { LARGURA_PADRAO } from '../../../components/blueprint/LarguraDoPainel';
import {
  applyBatch,
  emptyModel,
  type BlueprintModel,
  type Command,
} from '../../../utils/blueprintKernel';

/**
 * Uma planta pequena mas COMPLETA: as quatro famílias representadas, com uma
 * peça de rótulo longo em cada uma. Lista curta e de nomes curtos não denuncia
 * recorte — é o mesmo motivo de a imagem do harness de medições ter uma marca
 * vermelha num canto só.
 */
function planta(): BlueprintModel {
  const base = applyBatch(emptyModel(), [
    { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 },
  ]).model;
  const levelId = base.levels[0].id;

  const cantos: [number, number, number, number][] = [
    [0, 0, 4250, 0],
    [4250, 0, 4250, 3120],
    [4250, 3120, 0, 3120],
    [0, 3120, 0, 0],
    [2000, 0, 2000, 3120],
  ];
  const comParedes = applyBatch(
    base,
    cantos.map(([ax, ay, bx, by]) => ({
      type: 'AddWall',
      levelId,
      a: { x: ax, y: ay },
      b: { x: bx, y: by },
      thicknessMm: 150,
      heightMm: 2800,
    })) as Command[],
  ).model;

  const [p1, p2, p3] = comParedes.walls;
  return applyBatch(comParedes, [
    { type: 'AddOpening', wallId: p1.id, kind: 'door', offsetMm: 900, widthMm: 900, heightMm: 2100, sillMm: 0 },
    { type: 'AddOpening', wallId: p2.id, kind: 'window', offsetMm: 1200, widthMm: 1500, heightMm: 1100, sillMm: 900 },
    { type: 'AddOpening', wallId: p3.id, kind: 'sliding', offsetMm: 1500, widthMm: 2400, heightMm: 2100, sillMm: 0 },
    { type: 'AddOpening', wallId: p1.id, kind: 'passage', offsetMm: 3000, widthMm: 1000, heightMm: 2100, sillMm: 0 },
    {
      type: 'AddStructural',
      levelId,
      kind: 'PILAR',
      pontos: [{ x: 2000, y: 0 }],
      larguraMm: 200,
      profundidadeMm: 400,
      alturaMm: 2800,
    },
    {
      type: 'AddStructural',
      levelId,
      kind: 'VIGA',
      pontos: [{ x: 0, y: 0 }, { x: 4250, y: 0 }],
      larguraMm: 200,
      profundidadeMm: 0,
      alturaMm: 500,
      baseMm: 2300,
    },
    {
      type: 'AddStructural',
      levelId,
      kind: 'LAJE',
      pontos: [
        { x: 0, y: 0 },
        { x: 4250, y: 0 },
        { x: 4250, y: 3120 },
        { x: 0, y: 3120 },
      ],
      larguraMm: 0,
      profundidadeMm: 0,
      alturaMm: 120,
      baseMm: 2800,
    },
    {
      type: 'AddStructural',
      levelId,
      kind: 'ESTACA',
      pontos: [{ x: 0, y: 0 }],
      larguraMm: 300,
      profundidadeMm: 300,
      alturaMm: 8000,
      baseMm: -9100,
      circular: true,
    },
  ] as Command[]).model;
}

const MODELO = planta();

function Painel() {
  // Começa com a peça estrutural selecionada: é o estado que o pedido descreve
  // ("quando seleciono um componente"), e o que põe as propriedades e a lista na
  // mesma coluna, disputando os mesmos 307 px.
  const [selecionados, setSelecionados] = useState<string[]>([MODELO.structures[0].id]);
  const [aberta, setAberta] = useState(true);
  const estrutura = MODELO.structures.find((s) => s.id === selecionados[0]) ?? null;

  return (
    <div
      data-painel
      className="overflow-y-auto border-l border-slate-200 bg-white"
      // Alto o bastante para a captura pegar as quatro famílias de uma vez: o
      // que se quer olhar é a coluna inteira, e um painel com rolagem esconderia
      // metade dela do `screenshot`.
      style={{ width: LARGURA_PADRAO, maxHeight: 1500 }}
    >
      <SecaoAccordion
        titulo="Componentes"
        contagem={MODELO.walls.length + MODELO.openings.length + MODELO.structures.length}
        aberta={aberta}
        onAlternar={() => setAberta((v) => !v)}
      >
        <PainelComponentes
          paredes={MODELO.walls}
          aberturas={MODELO.openings}
          estruturas={MODELO.structures}
          selecionados={selecionados}
          onSelecionar={setSelecionados}
          onExcluir={() => {}}
          propriedades={
            <PainelEstruturaSelecionada
              estrutura={estrutura}
              onMedidas={() => {}}
              onTipo={() => {}}
              onExcluir={() => {}}
            />
          }
        />
      </SecaoAccordion>
    </div>
  );
}

createRoot(document.getElementById('raiz')!).render(<Painel />);
