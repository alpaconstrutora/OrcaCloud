/**
 * Harness visual do QUADRO DE DIVISAS.
 *
 * Monta o `Sheet` real sobre um lote real, aplicando comandos pelo kernel de
 * verdade — é o que permite OLHAR a tela sem passar por login, obra e estudo.
 * Existe pela mesma razão do harness de gesto ao lado: conferir padrão de UI
 * lendo `className` no diff não pega o que salta aos olhos no navegador.
 *
 * `?vazio=1` mostra o estado de criação (nenhum lado com papel).
 * `?painel=1` mostra a caixa "Terreno" do painel lateral, na largura real dele.
 */
import '../../../index.css';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import QuadroDeDivisas from '../../../components/blueprint/QuadroDeDivisas';
import PainelTerreno from '../../../components/blueprint/PainelTerreno';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  point,
  type BlueprintModel,
  type Command,
} from '../../../utils/blueprintKernel';
import {
  divergente,
  linhasDoQuadro,
  medirTerreno,
  papeisSugeridos,
} from '../../../utils/blueprintTerreno';

/** Lote de 5 lados: frente ao sul, fundo partido em dois trechos da mesma reta. */
const CANTOS = [
  { x: 0, y: 0 },
  { x: 12_000, y: 0 },
  { x: 12_000, y: 30_000 },
  { x: 6000, y: 30_000 },
  { x: 0, y: 30_000 },
];

function inicial(): BlueprintModel {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  });
  const levelId = base.model.levels[0].id;
  const lados: Command[] = CANTOS.map((c, i) => ({
    type: 'AddBoundary' as const,
    levelId,
    a: point(c.x, c.y),
    b: point(CANTOS[(i + 1) % CANTOS.length].x, CANTOS[(i + 1) % CANTOS.length].y),
    kind: 'TERRENO' as const,
  }));
  let model = applyBatch(base.model, lados).model;

  if (new URLSearchParams(location.search).get('vazio') === '1') return model;

  // Estado cheio: papéis derivados, escritura preenchida e uma divergência de
  // 20 cm — que é o caso que o painel existe para mostrar.
  const terreno = medirTerreno(model.boundaries)!;
  const papeis = papeisSugeridos(terreno, terreno.ladosIds[0])!;
  model = applyBatch(
    model,
    [...papeis].map(([boundaryId, papel]) => ({
      type: 'SetBoundaryPapel' as const,
      boundaryId,
      papel,
    })),
  ).model;
  model = applyBatch(model, [
    { type: 'SetAreaEscritura', areaMm2: 360_000_000 },
    {
      type: 'SetBoundaryEscritura',
      boundaryId: terreno.ladosIds[0],
      medidaMm: 12_000,
      confrontante: 'Rua das Acácias',
    },
    {
      type: 'SetBoundaryEscritura',
      boundaryId: terreno.ladosIds[1],
      medidaMm: 29_800,
      confrontante: 'Lote 03',
    },
    {
      type: 'SetBoundaryEscritura',
      boundaryId: terreno.ladosIds[4],
      medidaMm: 30_000,
      confrontante: 'Lote 05',
    },
  ]).model;
  return model;
}

function App() {
  const [model, setModel] = useState(inicial);
  const rodar = (comandos: Command[]) =>
    setModel((atual) => applyBatch(atual, comandos).model);
  const terreno = medirTerreno(model.boundaries);

  if (new URLSearchParams(location.search).get('painel') === '1') {
    const linhas = terreno ? linhasDoQuadro(terreno, model.boundaries) : [];
    // A largura real da coluna de propriedades do editor. Sem fixá-la, o painel
    // se espalha na tela e o teste não mostra o aperto que ele vive.
    return (
      <div className="w-[320px] border-l border-slate-200 bg-white">
        <PainelTerreno
          terreno={terreno}
          divisaSelecionada={model.boundaries[1] ?? null}
          onComprimento={() => {}}
          onPapel={() => {}}
          recuos={{ FRENTE: 5000, FUNDOS: 3000, LATERAL_DIREITA: 1500, LATERAL_ESQUERDA: 1500 }}
          onRecuo={() => {}}
          envelope={null}
          aproveitamento={null}
          taxaOcupacaoMax={null}
          coeficienteMax={null}
          onTaxaOcupacaoMax={() => {}}
          onCoeficienteMax={() => {}}
          empreendimentos={[{ id: 'e1', nome: 'Residencial Acácias', areaAtualM2: 358 }]}
          empreendimentoSugerido="e1"
          onGravarArea={() => {}}
          onAbrirQuadro={() => {}}
          ladosSemPapel={linhas.filter((l) => l.papel === null).length}
          ladosDivergentes={linhas.filter(divergente).length}
        />
      </div>
    );
  }

  return (
    <QuadroDeDivisas
      aberto
      onFechar={() => {}}
      terreno={terreno}
      limites={model.boundaries}
      areaEscrituraMm2={model.areaEscrituraMm2 ?? null}
      onAreaEscritura={(areaMm2) => rodar([{ type: 'SetAreaEscritura', areaMm2 }])}
      onPapel={(boundaryId, papel) => rodar([{ type: 'SetBoundaryPapel', boundaryId, papel }])}
      onApontarFrente={(boundaryId) => {
        if (!terreno) return;
        const papeis = papeisSugeridos(terreno, boundaryId);
        if (!papeis) return;
        rodar(
          [...papeis].map(([id, papel]) => ({
            type: 'SetBoundaryPapel' as const,
            boundaryId: id,
            papel,
          })),
        );
      }}
      onEscritura={(boundaryId, medidaMm, confrontante) =>
        rodar([{ type: 'SetBoundaryEscritura', boundaryId, medidaMm, confrontante }])
      }
      onDestacar={() => {}}
    />
  );
}

createRoot(document.getElementById('raiz')!).render(<App />);
