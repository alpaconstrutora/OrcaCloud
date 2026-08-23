/**
 * Harness da ferramenta JUNTAR — apontar duas pontas soltas e fechar o canto.
 *
 * O gesto é todo apontar-e-clicar: acertar o círculo âmbar, ver a cor mudar, ver
 * a prévia do canto, clicar de novo. Nada disso se julga em jsdom, onde o canvas
 * não desenha e `getBoundingClientRect` devolve zeros. O kernel prova a conta
 * (`cantoEntreEixos`) e o teste de componente prova que a barra oferece a
 * ferramenta; ISTO prova que os dois se falam através de um ponteiro real.
 *
 * Quatro cantos, os quatro casos que a decisão de produto distingue:
 *
 *   1. perpendicular exato   — uma ponta PASSOU do encontro, a outra não chegou
 *   2. perpendicular 1° torto — o "levemente desalinhadas" do pedido; tem que juntar
 *   3. paralelas             — não há canto: tem que RECUSAR
 *   4. quase colineares      — isto é VÃO, não canto: tem que RECUSAR
 *
 * Abrir em: /docs/spikes/juntar-pontas/index.html no servidor de dev.
 */

import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas, { type PontaSoltaCanvas } from '../../../components/blueprint/BlueprintCanvas';
import {
  applyBatch,
  applyCommand,
  cantoEntreEixos,
  emptyModel,
  point,
  type BlueprintModel,
  type Command,
} from '../../../utils/blueprintKernel';

const T = 200;
const H = 2800;

/**
 * Os quatro casos, um por faixa horizontal.
 *
 * Cada um são DUAS paredes que não se encontram. As coordenadas estão em mm do
 * modelo, com Y para CIMA — a faixa 0 fica junto ao rodapé, onde a vista nasce
 * enquadrada.
 *
 * ⚠️ TUDO tem de caber em 900 × 900 px na escala inicial de 0,05 px/mm, ou seja
 * ~16.800 mm de altura útil e ~16.000 de largura. A primeira versão espalhava os
 * casos de 12 em 12 metros: os dois últimos nasciam FORA da viewport, o clique do
 * passeio caía no vazio, e a falha aparecia como "a mira errou o círculo" — que é
 * o mesmo sintoma de um bug de acerto de verdade. O harness pegou; anotado aqui
 * para não voltar.
 */
const CASOS: { rotulo: string; junta: boolean; paredes: [number, number, number, number][] }[] = [
  {
    rotulo: '1 · perpendicular exato — DEVE juntar',
    junta: true,
    // Vertical passa 500 mm do encontro; horizontal para 4000 mm antes dele.
    paredes: [
      [0, 0, 0, 3000],
      [9000, 2500, 4000, 2500],
    ],
  },
  {
    rotulo: '2 · 1 grau torto — DEVE juntar',
    junta: true,
    // 52 mm de desvio em 3000 mm ≈ 1°. Planta vinda de PDF quase nunca está no
    // ortogonal exato; recusar por isso deixaria a ferramenta inútil.
    paredes: [
      [0, 5000, 52, 8000],
      [9000, 7500, 4000, 7500],
    ],
  },
  {
    rotulo: '3 · paralelas — deve RECUSAR',
    junta: false,
    paredes: [
      [0, 10000, 0, 12000],
      [2000, 14000, 2000, 12500],
    ],
  },
  {
    rotulo: '4 · quase colineares (isto é VÃO) — deve RECUSAR',
    junta: false,
    paredes: [
      [0, 15000, 3000, 15000],
      [9000, 15030, 4000, 15030],
    ],
  },
];

function construir() {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  });
  const levelId = base.model.levels[0].id;

  const comandos: Command[] = CASOS.flatMap((caso) =>
    caso.paredes.map(
      ([ax, ay, bx, by]): Command => ({
        type: 'AddWall',
        levelId,
        a: point(ax, ay),
        b: point(bx, by),
        thicknessMm: T,
        heightMm: H,
      }),
    ),
  );

  return applyBatch(base.model, comandos).model;
}

const modeloInicial = construir();

function App() {
  const [modelo, setModelo] = useState<BlueprintModel>(modeloInicial);
  const [pontaEmJuncao, setPontaEmJuncao] = useState<PontaSoltaCanvas | null>(null);
  const [recusas, setRecusas] = useState(0);

  /**
   * As pontas soltas, pela MESMA regra do editor: grau 1 no mapa de vértices.
   *
   * Repetida aqui de propósito — o harness não deve importar estado interno do
   * `BlueprintEditor`, senão deixa de ser um teste do canvas e vira um teste do
   * editor inteiro, com Supabase e tudo.
   */
  const soltas = useMemo<PontaSoltaCanvas[]>(() => {
    const grau = new Map<string, PontaSoltaCanvas & { n: number }>();
    for (const w of modelo.walls) {
      for (const [end, p, oposta] of [
        ['a', w.a, w.b],
        ['b', w.b, w.a],
      ] as const) {
        const k = `${p.x},${p.y}`;
        const atual = grau.get(k);
        if (atual) atual.n += 1;
        else grau.set(k, { p, wallId: w.id, end, oposta, n: 1 });
      }
    }
    return [...grau.values()].filter((v) => v.n === 1);
  }, [modelo.walls]);

  function juntar(primeira: PontaSoltaCanvas, segunda: PontaSoltaCanvas) {
    const el = document.getElementById('erro');
    if (primeira.wallId === segunda.wallId) {
      setRecusas((n) => n + 1);
      if (el) el.textContent = 'mesma parede';
      setPontaEmJuncao(null);
      return;
    }
    const canto = cantoEntreEixos(primeira.oposta, primeira.p, segunda.oposta, segunda.p);
    if (!canto) {
      // RECUSA é resultado, não falha: os casos 3 e 4 existem para chegar aqui.
      setRecusas((n) => n + 1);
      if (el) el.textContent = 'sem canto';
      setPontaEmJuncao(null);
      return;
    }
    setModelo(
      applyBatch(modelo, [
        { type: 'MoveVertex', wallId: primeira.wallId, end: primeira.end, to: canto },
        { type: 'MoveVertex', wallId: segunda.wallId, end: segunda.end, to: canto },
      ]).model,
    );
    if (el) el.textContent = '';
    setPontaEmJuncao(null);
  }

  const dump = document.getElementById('dump');
  if (dump) {
    dump.textContent = JSON.stringify(
      {
        soltas: soltas.length,
        recusas,
        escolhida: pontaEmJuncao ? `${pontaEmJuncao.wallId}:${pontaEmJuncao.end}` : null,
        walls: modelo.walls.map((w) => ({ id: w.id, a: w.a, b: w.b })),
      },
      null,
      1,
    );
  }

  return (
    <div id="tela">
      <BlueprintCanvas
        model={modelo}
        tool="juntar"
        levelId={modelo.levels[0].id}
        selectedIds={[]}
        onSelecionar={() => {}}
        onAddWall={() => null}
        onAddOpening={() => {}}
        larguraAberturaMm={900}
        onDelete={() => {}}
        espessuraMm={T}
        passoGradeMm={null}
        pontasSoltas={soltas}
        pontaEmJuncao={pontaEmJuncao}
        onEscolherPontaJuncao={setPontaEmJuncao}
        onJuntarPontas={juntar}
      />
    </div>
  );
}

createRoot(document.getElementById('raiz')!).render(<App />);
