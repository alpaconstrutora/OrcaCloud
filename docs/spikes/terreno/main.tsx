/**
 * Harness de desenho de TERRENO.
 *
 * Monta o `BlueprintCanvas` REAL com o mesmo estado que o editor mantém, aplica
 * os comandos pelo kernel de verdade e expõe o resultado em `window.__limites` e
 * `window.__terreno` para o script de medição ler.
 *
 * POR QUE ELE EXISTE. Desenhar contorno é GESTO: uma sequência de cliques em
 * pixels, e um último clique que tem de cair EM CIMA do primeiro vértice para
 * fechar. jsdom não tem layout — `getBoundingClientRect` devolve zero — então
 * nenhum teste de componente consegue clicar "no vértice em x=340, y=210". Sem
 * isto, a única prova de que o lote fecha seria eu afirmar que fecha.
 *
 * `?orto=0` desliga a trava ortogonal.
 */
import '../../../index.css';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  type BlueprintModel,
  type BoundaryKind,
  type BoundaryPapel,
  type Command,
  type Point,
} from '../../../utils/blueprintKernel';
import {
  envelopeConstrutivo,
  medirTerreno,
  PAPEIS_DE_DIVISA,
  papeisSugeridos,
  RECUOS_ZERO,
  type Terreno,
} from '../../../utils/blueprintTerreno';
import type { BlueprintTool } from '../../../hooks/useBlueprintEditor';

declare global {
  interface Window {
    __modelo?: BlueprintModel;
    __limites?: {
      id: string;
      a: Point;
      b: Point;
      kind: BoundaryKind;
      papel?: BoundaryPapel | null;
    }[];
    __terreno?: Terreno | null;
    __selecionados?: string[];
    __selecionar?: (ids: string[]) => void;
    /**
     * Troca a ferramenta SEM recarregar.
     *
     * Existe porque o gesto de arrastar só acontece na ferramenta Selecionar, e
     * recarregar para trocá-la apagaria o desenho que se acabou de fazer — o
     * teste do arraste ficaria sem nada para arrastar, e passaria em branco.
     */
    __ferramenta?: (t: BlueprintTool) => void;
    /** Liga/desliga o preenchimento do lote, como o menu Exibir faz. */
    __preencherTerreno?: (ligado: boolean) => void;
    /** Marca papéis e aplica um recuo igual em todos os lados, em mm. */
    __recuar?: (mm: number) => void;
    /** Muda o comprimento da divisa indicada, como o painel faz. */
    __esticar?: (boundaryId: string, comprimentoMm: number) => void;
    /**
     * Aponta a frente e deriva os demais papéis, como o quadro de divisas faz.
     *
     * Aqui não basta o teste de unidade de `papeisSugeridos`: lá o anel é montado
     * por um helper, em ordem conhecida. O que só o navegador prova é que o anel
     * saído do GESTO — cliques em pixels, fechamento no primeiro vértice — chega
     * ao mesmo resultado. Se o caminhamento devolvesse os lados em outra ordem ou
     * no outro sentido, as laterais sairiam trocadas na escritura.
     */
    __apontarFrente?: (boundaryId: string) => void;
  }
}

function nivel(): { model: BlueprintModel; levelId: string } {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  });
  return { model: base.model, levelId: base.model.levels[0].id };
}

function App() {
  const [{ model, levelId }, setEstado] = useState(nivel);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const busca = new URLSearchParams(location.search);
  const orto = busca.get('orto') !== '0';
  const [tool, setTool] = useState<BlueprintTool>((busca.get('tool') as BlueprintTool) ?? 'terreno');
  const [recuoMm, setRecuoMm] = useState(0);
  /**
   * Preenchimento do lote — o toggle "Preenchimento do terreno" do menu Exibir.
   * Exposto por `window.__preencherTerreno` para o script poder ligar e desligar
   * SEM recarregar: recarregar apagaria o lote recém-desenhado, e a medição
   * ficaria sem nada para conferir.
   */
  const [preencherTerreno, setPreencherTerreno] = useState(true);

  const terrenoMedido = medirTerreno(model.boundaries);
  const envelope = terrenoMedido
    ? envelopeConstrutivo(terrenoMedido, model.boundaries, {
        FRENTE: recuoMm,
        FUNDOS: recuoMm,
        LATERAL_DIREITA: recuoMm,
        LATERAL_ESQUERDA: recuoMm,
      })
    : null;

  const rodar = (comandos: Command[]) =>
    setEstado((atual) => ({
      ...atual,
      model: applyBatch(atual.model, comandos).model,
    }));

  window.__modelo = model;
  window.__limites = model.boundaries.map((b) => ({
    id: b.id,
    a: b.a,
    b: b.b,
    kind: b.kind,
    papel: b.papel ?? null,
  }));
  window.__terreno = medirTerreno(model.boundaries);
  window.__selecionados = selectedIds;
  window.__selecionar = setSelectedIds;
  window.__ferramenta = setTool;
  window.__preencherTerreno = setPreencherTerreno;
  // Marca um papel por divisa, na ordem, e aplica recuos — é o que o painel faz.
  window.__recuar = (mm) => {
    rodar(
      model.boundaries.map((b, i) => ({
        type: 'SetBoundaryPapel' as const,
        boundaryId: b.id,
        papel: PAPEIS_DE_DIVISA[i % PAPEIS_DE_DIVISA.length],
      })),
    );
    setRecuoMm(mm);
  };

  // O MESMO caminho do quadro de divisas: um lote de `SetBoundaryPapel`, que no
  // editor vira UM passo de histórico.
  window.__apontarFrente = (boundaryId) => {
    const medido = medirTerreno(model.boundaries);
    if (!medido) return;
    const papeis = papeisSugeridos(medido, boundaryId);
    if (!papeis) return;
    rodar(
      [...papeis].map(([id, papel]) => ({
        type: 'SetBoundaryPapel' as const,
        boundaryId: id,
        papel,
      })),
    );
  };

  // A MESMA regra do editor: mudar o comprimento arrasta junto a divisa vizinha
  // que compartilha o vértice, senão o canto abre e o lote deixa de fechar.
  window.__esticar = (boundaryId, comprimentoMm) => {
    const divisa = model.boundaries.find((b) => b.id === boundaryId);
    if (!divisa) return;
    const comp = Math.hypot(divisa.b.x - divisa.a.x, divisa.b.y - divisa.a.y);
    if (comp === 0) return;
    const ux = (divisa.b.x - divisa.a.x) / comp;
    const uy = (divisa.b.y - divisa.a.y) / comp;
    const to = {
      x: Math.round(divisa.a.x + ux * comprimentoMm),
      y: Math.round(divisa.a.y + uy * comprimentoMm),
    };
    const pontaAtual = divisa.b;
    const lote: Command[] = [{ type: 'MoveBoundaryVertex', boundaryId, end: 'b', to }];
    for (const outra of model.boundaries) {
      if (outra.id === boundaryId) continue;
      if (outra.a.x === pontaAtual.x && outra.a.y === pontaAtual.y) {
        lote.push({ type: 'MoveBoundaryVertex', boundaryId: outra.id, end: 'a', to });
      }
      if (outra.b.x === pontaAtual.x && outra.b.y === pontaAtual.y) {
        lote.push({ type: 'MoveBoundaryVertex', boundaryId: outra.id, end: 'b', to });
      }
    }
    rodar(lote);
  };

  return (
    <div className="h-full w-full">
      <BlueprintCanvas
        model={model}
        tool={tool}
        levelId={levelId}
        selectedIds={selectedIds}
        onSelecionar={setSelectedIds}
        ortogonal={orto}
        mostrarPreenchimentoTerreno={preencherTerreno}
        mostrarMedidasParedes
        envelope={envelope?.valido ? envelope.anel : []}
        onAddLimite={(a, b, kind) => rodar([{ type: 'AddBoundary', levelId, a, b, kind }])}
        onMoveBoundaryVertex={(boundaryId, end, to) =>
          rodar([{ type: 'MoveBoundaryVertex', boundaryId, end, to }])
        }
        onMoverSelecao={(wallIds, boundaryIds, delta) =>
          rodar([
            { type: 'TranslateEntities', wallIds, boundaryIds, delta, manterJuncoes: false },
          ])
        }
        onAddWall={() => {}}
        onAddOpening={() => {}}
        onDelete={() => {}}
        larguraAberturaMm={900}
        espessuraMm={150}
        passoGradeMm={100}
      />
    </div>
  );
}

createRoot(document.getElementById('raiz')!).render(<App />);
