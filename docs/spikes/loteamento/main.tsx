/**
 * Harness visual do LOTEAMENTO (fase B1).
 *
 * POR QUE ELE EXISTE. Os testes de componente provam que os botões existem e o
 * que a barra pergunta; os de unidade provam a geometria. Nenhum dos dois vê o
 * DESENHO: em jsdom o canvas é opaco, `getContext('2d')` nem existe. Foi assim
 * que uma família já entrou no kernel sem aparecer na tela ("desenha mas não
 * alcança"). Aqui o canvas REAL pinta um loteamento real, e `medir.mjs` conta
 * pixels — se o lote não for desenhado, a contagem cai a zero e reprova.
 *
 * `?vazio=1` mostra o mesmo canvas SEM loteamento: é o controle que prova que a
 * medição discrimina. Sem ele, um "passou" não significaria nada.
 */
import '../../../index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import { ConfirmProvider } from '../../../components/ui/confirm';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  type BlueprintModel,
  type Command,
} from '../../../utils/blueprintKernel';
import {
  areasDoLoteamento,
  medirLote,
  faixaDaVia,
  subdividirQuadra,
  conferirLoteamento,
  resumoDaConferencia,
  SUBDIVISAO_PADRAO,
  REGRAS_PADRAO_DO_LOTEAMENTO,
} from '../../../utils/blueprintLoteamento';

const params = new URLSearchParams(location.search);
const vazio = params.has('vazio');
/** `?lotear=1` mostra a PROPOSTA de subdivisão (B2), tracejada, sem gravar nada. */
const lotear = params.has('lotear');

/**
 * Um loteamento pequeno e REAL: uma quadra de 60 × 30 m com cinco lotes de
 * 12 m de testada, a rua de 12 m ao sul e uma praça a leste. As medidas são as
 * usuais de loteamento urbano — 12 × 30 dá 360 m², bem acima do mínimo de
 * 125 m² da Lei 6.766, e a rua tem a caixa mínima de via local.
 */
function montar(): BlueprintModel {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 3000,
  }).model;
  if (vazio) return base;

  const levelId = base.levels[0].id;
  const comEstrutura = applyBatch(base, [
    {
      type: 'AddQuadra',
      levelId,
      nome: 'A',
      pontos: [
        { x: 0, y: 0 },
        { x: 60000, y: 0 },
        { x: 60000, y: 30000 },
        { x: 0, y: 30000 },
      ],
    },
    {
      type: 'AddVia',
      levelId,
      nome: 'Rua 1',
      eixo: [
        { x: -12000, y: -6000 },
        { x: 90000, y: -6000 },
      ],
      larguraMm: 12000,
      calcadaMm: 2000,
    },
    {
      type: 'AddVia',
      levelId,
      nome: 'Rua 2',
      eixo: [
        { x: -6000, y: -12000 },
        { x: -6000, y: 45000 },
      ],
      larguraMm: 12000,
      calcadaMm: 2000,
    },
    {
      type: 'AddAreaPublica',
      levelId,
      tipo: 'VERDE',
      nome: 'Praça da entrada',
      pontos: [
        { x: 66000, y: 0 },
        { x: 84000, y: 0 },
        { x: 84000, y: 30000 },
        { x: 66000, y: 30000 },
      ],
    },
  ]);

  const quadraId = comEstrutura.model.quadras[0].id;
  // No modo `?lotear=1` a quadra fica vazia: o que se quer ver é a PROPOSTA
  // tracejada por cima dela, que é o gesto que a B2 acrescenta.
  if (lotear) return comEstrutura.model;
  const lotes: Command[] = [0, 1, 2, 3, 4].map((i) => ({
    type: 'AddLote' as const,
    levelId,
    quadraId,
    numero: String(i + 1),
    pontos: [
      { x: i * 12000, y: 0 },
      { x: (i + 1) * 12000, y: 0 },
      { x: (i + 1) * 12000, y: 30000 },
      { x: i * 12000, y: 30000 },
    ],
  }));
  return applyBatch(comEstrutura.model, lotes).model;
}

const model = montar();
const levelId = model.levels[0].id;

/** O que o script de fora lê para separar "pintou" de "pintou certo". */
declare global {
  interface Window {
    __loteamento?: {
      quadras: number;
      lotes: number;
      vias: number;
      areasPublicas: number;
      /** Área da 1ª via pela faixa derivada, em m². */
      areaDaViaM2: number;
      /** Medida do lote do meio: área, testada e confrontantes por papel. */
      loteDoMeio: { areaM2: number; testadaM: number; lados: { papel: string; confrontante: string | null }[] } | null;
      areas: { chave: string; quantidade: number; areaM2: number; percentual: number | null }[];
      /** B2: a proposta de subdivisão (só no modo `?lotear=1`). */
      proposta: { lotes: number; areaM2: number | null; sobraM2: number; aviso: string | null } | null;
      /** B2: a conferência da Lei 6.766 sobre o que está desenhado. */
      conferencia: { erros: number; atencoes: number; regras: string[] };
    };
  }
}

/** B2: a proposta (derivada, nunca gravada) e a conferência. */
const propostaDaSubdivisao =
  lotear && model.quadras[0] ? subdividirQuadra(model.quadras[0], { ...SUBDIVISAO_PADRAO, testadaMm: 12000, profundidadeMm: 30000 }) : null;
const conferencia = conferirLoteamento(model, REGRAS_PADRAO_DO_LOTEAMENTO, 1800 * 1e6);

const loteDoMeio = model.lotes[2] ?? null;
const medida = loteDoMeio ? medirLote(model, loteDoMeio) : null;
window.__loteamento = {
  quadras: model.quadras.length,
  lotes: model.lotes.length,
  vias: model.vias.length,
  areasPublicas: model.areasPublicas.length,
  areaDaViaM2: model.vias[0]
    ? Math.round((Math.abs(areaDoAnel(faixaDaVia(model.vias[0].eixo, model.vias[0].larguraMm))) / 1e6) * 100) / 100
    : 0,
  loteDoMeio: medida
    ? {
        areaM2: Math.round((medida.areaMm2 / 1e6) * 100) / 100,
        testadaM: Math.round((medida.testadaMm / 1000) * 100) / 100,
        lados: medida.lados.map((l) => ({ papel: l.papel, confrontante: l.confrontante })),
      }
    : null,
  areas: areasDoLoteamento(model, 1800 * 1e6).map((l) => ({
    chave: l.chave,
    quantidade: l.quantidade,
    areaM2: l.areaM2,
    percentual: l.percentual,
  })),
  proposta: propostaDaSubdivisao
    ? {
        lotes: propostaDaSubdivisao.lotes.length,
        areaM2: propostaDaSubdivisao.lotes[0]?.areaM2 ?? null,
        sobraM2: propostaDaSubdivisao.sobraM2,
        aviso: propostaDaSubdivisao.aviso,
      }
    : null,
  conferencia: {
    ...resumoDaConferencia(conferencia),
    regras: conferencia.map((a) => a.regra),
  },
};

function areaDoAnel(anel: { x: number; y: number }[]): number {
  let s = 0;
  for (let i = 0; i < anel.length; i++) {
    const a = anel[i];
    const b = anel[(i + 1) % anel.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

function App() {
  return (
    <ConfirmProvider>
      <div style={{ height: '100vh', width: '100vw' }}>
        <BlueprintCanvas
          model={model}
          tool="selecionar"
          levelId={levelId}
          selectedIds={[]}
          onSelecionar={() => {}}
          lotesPropostos={propostaDaSubdivisao ? propostaDaSubdivisao.lotes.map((l) => l.pontos) : null}
        />
      </div>
    </ConfirmProvider>
  );
}

createRoot(document.getElementById('raiz') as HTMLElement).render(<App />);
