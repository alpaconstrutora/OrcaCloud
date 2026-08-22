/**
 * Harness da planta de fundo e das medições, em navegador de verdade.
 *
 * Nada aqui é mock do que se quer provar: o componente é o `BlueprintCanvas` de
 * produção, e a transformação é a de `utils/blueprintUnderlay`. O que o harness
 * fabrica é só a IMAGEM de fundo — e ela é fabricada com um retângulo em pixels
 * conhecidos, para que exista uma feição da imagem contra a qual comparar.
 *
 * A prova é geométrica e legível por pixel: a forma medida é traçada exatamente
 * sobre o retângulo desenhado na imagem. Se o fundo estiver no lugar certo, os
 * dois retângulos coincidem na tela — em qualquer zoom, e depois de recalibrar.
 * Se saírem de sincronia, as caixas se afastam e o `passeio.mjs` reprova.
 *
 * jsdom não serve para isto: não há layout, não há canvas, não há pixel.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
// O CSS do app, para valer: medir largura com as classes do Tailwind ausentes
// mediria uma tela que não existe.
import '../../../index.css';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import ControlesDeFundo from '../../../components/blueprint/ControlesDeFundo';
import PainelMedicoes from '../../../components/blueprint/PainelMedicoes';
import AbasDoPainel from '../../../components/blueprint/AbasDoPainel';
import type { UnderlayRow } from '../../../services/blueprintUnderlayService';
import { emptyModel, type Point } from '../../../utils/blueprintKernel';
import {
  calibrar,
  pixelParaModelo,
  type Underlay,
} from '../../../utils/blueprintUnderlay';
import {
  transformarPorRecalibracao,
  type FormaMedida,
  type TipoMedida,
} from '../../../utils/blueprintMedicoes';

const LARGURA_PX = 400;
const ALTURA_PX = 300;
/** Cantos do retângulo desenhado NA IMAGEM, em pixel dela. */
const RETANGULO = { x1: 60, y1: 40, x2: 340, y2: 260 };
/** Marca assimétrica, dentro do retângulo e junto do canto SUPERIOR esquerdo. */
const MARCA = { x: 80, y: 60 };

/**
 * A imagem de fundo, desenhada aqui mesmo.
 *
 * Retângulo preto de traço grosso: preto puro é a única cor da cena que não
 * colide com a grade (cinza), com a forma medida (azul) nem com o traçado em
 * curso (âmbar), então o leitor de pixel separa as camadas sem ambiguidade.
 */
function imagemDeFundo(): Promise<HTMLImageElement> {
  const c = document.createElement('canvas');
  c.width = LARGURA_PX;
  c.height = ALTURA_PX;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, LARGURA_PX, ALTURA_PX);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 6;
  ctx.strokeRect(
    RETANGULO.x1,
    RETANGULO.y1,
    RETANGULO.x2 - RETANGULO.x1,
    RETANGULO.y2 - RETANGULO.y1,
  );
  // Marca VERMELHA no canto superior esquerdo, e só nele.
  //
  // Um retângulo é simétrico na vertical: desenhado de cabeça para baixo ele
  // fica idêntico, e a conferência aprovaria uma planta espelhada — que é
  // exatamente o defeito que o cabeçalho de `blueprintUnderlay.ts` descreve
  // como o que "só aparece quando a porta está do lado errado, já na obra".
  ctx.fillStyle = '#e11d48';
  ctx.fillRect(MARCA.x, MARCA.y, 24, 24);
  const img = new Image();
  return new Promise((resolve) => {
    img.onload = () => resolve(img);
    img.src = c.toDataURL('image/png');
  });
}

/**
 * Aferição inicial: 20 mm por pixel.
 *
 * `origemYMm` empurra a imagem para o quadrante de Y positivo do modelo. O Y da
 * imagem cresce para baixo e o do modelo para cima, então sem esse deslocamento
 * a planta inteira cairia em Y negativo — fora da vista inicial do canvas, e o
 * harness mediria uma tela vazia achando que mediu alguma coisa.
 */
const UNDERLAY_A: Underlay = {
  origemXMm: 0,
  origemYMm: ALTURA_PX * 20,
  mmPorPixel: 20,
  rotacaoMrad: 0,
};

/** Os quatro cantos do retângulo da imagem, em milímetro do modelo. */
function cantosDoRetangulo(u: Underlay): Point[] {
  return (
    [
      { px: RETANGULO.x1, py: RETANGULO.y1 },
      { px: RETANGULO.x2, py: RETANGULO.y1 },
      { px: RETANGULO.x2, py: RETANGULO.y2 },
      { px: RETANGULO.x1, py: RETANGULO.y2 },
    ] as const
  ).map((p) => {
    const m = pixelParaModelo(u, p);
    return { x: Math.round(m.x), y: Math.round(m.y) } as Point;
  });
}

function forma(pontos: Point[]): FormaMedida {
  return {
    id: 'f1',
    tipo: 'POLIGONO',
    pontos,
    nome: '',
    itemCode: null,
    underlayId: 'u1',
    camada: 'Geral',
    cor: '#2563eb',
  };
}

/**
 * Uma sala com uma porta na parede de baixo.
 *
 * Serve para olhar o arco de giro: ele é o único desenho da tela cujo SENTIDO
 * depende do sinal do Y, e inverter o eixo sem inverter o arco deixaria a folha
 * da porta apontando para um lado e o arco para o outro.
 */
function modeloComPorta() {
  const m = emptyModel();
  m.levels.push({ id: 'n1', name: 'Térreo', elevationMm: 0 });
  const canto: [number, number][] = [
    [0, 0],
    [6000, 0],
    [6000, 4000],
    [0, 4000],
  ];
  canto.forEach(([x, y], i) => {
    const [x2, y2] = canto[(i + 1) % canto.length];
    m.walls.push({
      id: `w${i}`,
      levelId: 'n1',
      a: { x, y } as Point,
      b: { x: x2, y: y2 } as Point,
      thicknessMm: 150,
      heightMm: 2800,
    });
  });
  m.openings.push({
    id: 'o1',
    wallId: 'w0',
    kind: 'door',
    offsetMm: 2000,
    widthMm: 900,
    heightMm: 2100,
    sillMm: 0,
  });
  return m;
}

const params = new URLSearchParams(location.search);
const cena = params.get('cena') ?? 'fundo';
/** Reintroduz o defeito que a medição precisa reprovar. Ver `passeio.mjs`. */
const defeito = params.get('defeito') === '1';

function Harness({ imagem }: { imagem: HTMLImageElement }) {
  const [eventos, setEventos] = React.useState<
    { tipo: TipoMedida; pontos: Point[] }[]
  >([]);

  // O harness precisa ler os eventos de fora, e ler estado do React pelo DOM
  // seria adivinhação. A lista fica pendurada em `window`, escrita pelo mesmo
  // callback que o editor de produção usa.
  React.useEffect(() => {
    (window as unknown as Record<string, unknown>).__eventos = eventos;
  }, [eventos]);

  let underlay = UNDERLAY_A;
  let pontos = cantosDoRetangulo(UNDERLAY_A);

  if (cena === 'recalibrar') {
    // Recalibra declarando 7 m onde antes se lia 5,6 m: a escala vai de 20 para
    // 25 mm/px. É a operação que o plano chama de "o teste que mais importa".
    const depois = calibrar({
      p1: { px: RETANGULO.x1, py: RETANGULO.y1 },
      p2: { px: RETANGULO.x2, py: RETANGULO.y1 },
      distanciaMm: 7000,
      anterior: UNDERLAY_A,
    });
    underlay = depois;
    // COM defeito: a imagem se ajusta à nova escala e a forma fica onde estava —
    // que é exatamente o que acontece se ninguém reposicionar as medições.
    if (!defeito) {
      pontos = transformarPorRecalibracao([forma(pontos)], UNDERLAY_A, depois)[0].pontos;
    }
  } else if (defeito) {
    // Fundo e desenho fora de sincronia: 10% de diferença na escala do fundo.
    underlay = { ...UNDERLAY_A, mmPorPixel: 22 };
  }

  const desenhando = cena === 'tracar';

  return (
    <BlueprintCanvas
      model={cena === 'porta' ? modeloComPorta() : emptyModel()}
      tool={desenhando ? 'medir-area' : 'selecionar'}
      levelId={null}
      selectedIds={[]}
      onSelecionar={() => {}}
      onAddWall={() => {}}
      onAddOpening={() => {}}
      onDelete={() => {}}
      larguraAberturaMm={900}
      espessuraMm={150}
      passoGradeMm={1000}
      fundo={{ imagem, underlay, opacidade: 1 }}
      medicoes={desenhando ? [] : [forma(pontos)]}
      onMedicaoPronta={(tipo, pts) => setEventos((a) => [...a, { tipo, pontos: pts }])}
    />
  );
}

/**
 * Barra e painel, nas larguras reais do editor.
 *
 * jsdom aprova os dois: os elementos existem, têm `role`, são achados por
 * `getByRole`. O que jsdom não tem é retângulo — e foi assim que duas abas
 * sumiram desta mesma tela, recortadas pelo `overflow-hidden` do painel.
 * A barra acabou de ganhar um seletor de prancha, e o painel, três controles
 * por linha; medir a largura é a única forma de saber se coube.
 */
function prancha(id: string, nome: string, ordem: number): UnderlayRow {
  return {
    id,
    study_id: 's',
    organization_id: 'o',
    level_id: 'n1',
    storage_path: 'p.png',
    nome_arquivo: 'planta-executiva-arquitetonica.pdf',
    nome,
    ordem,
    file_sha256: 'abc',
    pdf_pagina: ordem + 1,
    origem_x_mm: 0,
    origem_y_mm: 0,
    mm_por_pixel: 20,
    rotacao_mrad: 0,
    calib_p1_px: 0,
    calib_p1_py: 0,
    calib_p2_px: 100,
    calib_p2_py: 0,
    calib_distancia_mm: 2000,
    calib_alinhado: false,
    opacidade: 0.55,
    created_at: '',
    updated_at: '',
  };
}

function Painel() {
  const pranchas = [
    prancha('u1', 'Térreo', 0),
    prancha('u2', 'Cobertura', 1),
    prancha('u3', 'planta-executiva-arquitetonica.pdf · p.3', 2),
  ];
  const base = cantosDoRetangulo(UNDERLAY_A);
  const medidas: FormaMedida[] = [
    { ...forma(base), id: 'm1', nome: 'Sala de estar', itemCode: '87251' },
    {
      ...forma(base),
      id: 'm2',
      tipo: 'LINHA',
      pontos: base.slice(0, 2),
      nome: 'Rodapé do corredor',
      itemCode: null,
      itemNome: 'Demolição de alvenaria',
      itemPreco: 45,
      camada: 'Revestimento',
      cor: '#16a34a',
    },
    { ...forma(base), id: 'm3', nome: '', itemCode: null, camada: 'Piso' },
  ];

  return (
    <div className="flex h-[600px] w-[1200px] flex-col bg-slate-50">
      <div
        className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2"
        data-barra
        role="toolbar"
        aria-label="Ferramentas de desenho"
      >
        <ControlesDeFundo
          linhas={pranchas}
          linha={pranchas[0]}
          underlay={UNDERLAY_A}
          opacidade={0.55}
          calibrando={false}
          ocupado={false}
          totalPaginas={4}
          onSelecionar={() => {}}
          onImportar={() => {}}
          onCalibrar={() => {}}
          onOpacidade={() => {}}
          onRemover={() => {}}
        />
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1" />
        <aside
          data-painel
          className={`flex ${defeito ? 'w-64' : 'w-96'} shrink-0 flex-col overflow-hidden border-l border-slate-200 bg-white`}
        >
          <AbasDoPainel
            // ⚠️ ESPELHA `ABAS` de `BlueprintEditor.tsx`, e tem de continuar
            // espelhando: é esta lista que a medição de recorte usa. Uma aba
            // acrescentada lá e esquecida aqui deixa o harness aprovando uma
            // barra que na tela real transborda — e sumir aba deste painel já
            // aconteceu duas vezes.
            abas={[
              { id: 'ambientes', rotulo: 'Ambientes' },
              { id: 'vetor', rotulo: 'Do PDF' },
              { id: 'medicoes', rotulo: 'Medições' },
              { id: 'quantitativos', rotulo: 'Quantitativos' },
              { id: 'orcamento', rotulo: 'Orçamento' },
              { id: 'versoes', rotulo: 'Versões' },
            ]}
            ativa="medicoes"
            onEscolher={() => {}}
          />
          <PainelMedicoes
            formas={medidas.slice(0, 2)}
            todas={medidas}
            selecionada="m1"
            temFundo
            ocupado={false}
            camadasOcultas={new Set(['Piso'])}
            camadaAtiva="Geral"
            onAlternarCamada={() => {}}
            onCamadaAtiva={() => {}}
            onSelecionar={() => {}}
            onRenomear={() => {}}
            onEditarItem={() => {}}
            onRemover={() => {}}
            onEnviarOrcamento={() => {}}
            aviso={null}
            erro={null}
          />
        </aside>
      </div>
    </div>
  );
}

if (cena === 'painel') {
  document.body.setAttribute('data-cena', 'painel');
  createRoot(document.getElementById('raiz')!).render(<Painel />);
  document.body.setAttribute('data-pronto', '1');
}

imagemDeFundo().then((img) => {
  if (cena === 'painel') return;
  createRoot(document.getElementById('raiz')!).render(<Harness imagem={img} />);
  // Sinaliza que a imagem já carregou: sem isto o driver mediria o canvas antes
  // do `drawImage`, encontraria zero pixel preto e chamaria de defeito.
  document.body.setAttribute('data-pronto', '1');
});
