/**
 * Aba 3D do editor de Planta Inteligente.
 *
 * `React.lazy` + `<Suspense>` como o `components/planta_ai/View3DTab.tsx`: o
 * three.js (~600 KB) só entra no bundle quando esta vista é aberta. Enquanto o
 * seletor de vista está em "Planta" ou numa elevação, nada de three é baixado.
 */

import React, { Suspense, useRef, useState } from 'react';
import { Camera, ImageDown, Loader2 } from 'lucide-react';
import { RESOLUCOES_DA_CAPTURA, nomeDaCaptura, type ResolucaoDaCaptura } from '../../utils/blueprintCaptura';
import type { BlueprintModel } from '../../utils/blueprintKernel';
import type { MalhaDoTerreno } from '../../utils/blueprintTopografia';
import type { ArmaduraDaPeca, HipotesesDeArmadura } from '../../utils/blueprintArmadura';
import type { ExtrasDoRelevo3d } from '../../utils/blueprintTopografia3dExtras';
import type { PlanoDaTexturaDoMapa } from '../../utils/blueprintMapaDeFundo';

const Blueprint3DViewer = React.lazy(() => import('./Blueprint3DViewer'));

interface Props {
  /**
   * F13 (12/10/2026): onde o viewer PUBLICA a função de captura — `(largura, altura, focalMm?) → PNG`.
   * Quem segura a ref (a aba) chama; o viewer desenha a cena num alvo fora da tela. Ver `blueprintCaptura`.
   */
  capturaRef?: React.MutableRefObject<((largura: number, altura: number, focalMm?: number) => Promise<Blob>) | null>;
  /** F13: o nome do estudo, para o nome do PNG. Ausente = sem o botão "Exportar imagem". */
  nomeDoEstudo?: string;
  /**
   * F12 (12/10/2026): o PONTO DE VISTA de uma câmera salva — olho e alvo no mundo do 3D (metros) e a
   * focal. Presente, a câmera do 3D vai para lá (a órbita gira em torno do alvo); `chave` muda quando a
   * câmera muda (posição, alvo, lente). Ausente = navegação livre de sempre.
   */
  pontoDeVista?: { chave: string; posicao: [number, number, number]; alvo: [number, number, number]; focalMm: number } | null;
  /** F12: as câmeras salvas, para o seletor "Ponto de vista" (ausente = sem seletor). */
  pontosDeVista?: { id: string; nome: string }[];
  pontoDeVistaId?: string | null;
  onPontoDeVista?: (id: string | null) => void;
  model: BlueprintModel;
  levelIds?: string[];
  mostrarLaje?: boolean;
  mostrarArestas?: boolean;
  /** Rótulos "ø100 mm" das redes hidráulicas — ver `Blueprint3DViewer`. */
  mostrarRotulosDeRede?: boolean;
  /** ESTILO (E8.2): repassado ao visualizador. */
  estilo?: 'SOMBREADO' | 'LINHA_OCULTA' | 'TRANSPARENTE';
  mostrarTerreno?: boolean;
  /** ENVELOPE 3D (E3.3): prismas edificáveis por pavimento. Ver `Blueprint3DViewer`. */
  envelope?: { levelId: string; nome: string; anel: { x: number; y: number }[]; pecas?: { x: number; y: number }[][]; baseMm: number; topoMm: number; acimaDoGabarito: boolean }[];
  /** ESTUDO DE MASSA (M1): um prisma sólido por pavimento de cada bloco. Ver `Blueprint3DViewer`. */
  massa?: { id: string; chave: string; nome: string; anel: { x: number; y: number }[]; baseMm: number; topoMm: number; cor: string; problema: boolean; indice?: number }[];
  /** O pavimento da massa clicado (27/10/2026) — ver `Blueprint3DViewer`. */
  pisoDaMassa?: string | null;
  onPisoDaMassa?: (blocoId: string, indice: number) => void;
  sol?: { x: number; y: number; z: number } | null;
  entorno?: { id: string; rotulo: string; anel: { x: number; y: number }[]; alturaMm: number }[];
  /**
   * A malha do relevo (topografia gerada). Com ela, o terreno deixa de ser o
   * plano chato e vira a superfície. `relevoChave` é o hash da versão — é a
   * dependência dos memos, para a malha não remontar a cada render.
   */
  relevo?: MalhaDoTerreno | null;
  relevoChave?: string;
  /** Cota do chão em (x, z) de mundo, para o modo de percorrer. */
  alturaDoChao?: (x: number, z: number) => number | null;
  /** Drenagem traçada e muros de arrimo sobre o relevo (fase 8). `extrasChave` é a dependência dos memos. */
  extrasDoRelevo?: ExtrasDoRelevo3d | null;
  extrasChave?: string;
  /** 12/10/2026: o mapa (ruas/relevo das camadas) colado na malha do relevo — ver `Blueprint3DViewer`. */
  mapaNoRelevo?: { plano: PlanoDaTexturaDoMapa; chave: string } | null;
  /** Ids de peça que a lista de Componentes mandou esconder. Não muda o modelo. */
  ocultos?: Set<string>;
  /** CAMADAS EM MEIO-TOM (04/10/2026): peças translúcidas e sem clique — ver `Fantasma` no `Blueprint3DViewer`. */
  atenuados?: Set<string>;
  /** O TERRENO em meio-tom: relevo, envelope e massa vão para a passada translúcida. */
  terrenoEmMeioTom?: boolean;
  /** Cor por `uid` — o 4D. Ver `Blueprint3DViewer`. */
  coresPorUid?: Map<string, string>;
  /** Ids do kernel selecionados, para destacar na cena. */
  selecionados?: Set<string>;
  /** Clique numa peça, com o id do KERNEL. Ausente = cena não clicável. */
  onSelecionar?: (ids: string[]) => void;
  /** As barras do esquema de armadura, como linhas; o concreto fica translúcido. Ver `Blueprint3DViewer`. */
  armadura?: { pecas: readonly ArmaduraDaPeca[]; hipoteses: HipotesesDeArmadura };
  /**
   * E10.3 (climatização): MOVER no 3D — com seleção, a alça de setas (só em planta) aparece; ao
   * soltar, o deslocamento em mm do modelo chega aqui para virar UM `TranslateEntities` (um Ctrl+Z).
   * Ausente = sem alça.
   */
  onMover?: (delta: { x: number; y: number }) => void;
  /** Subir/descer a seleção pela seta verde (ver `Blueprint3DViewer`). */
  onElevar?: (dzMm: number) => void;
  /** A trava de 90° do 2D (botão "Trava 90°"/F8) — vale no arraste da peça no 3D. */
  ortogonal?: boolean;
  /** VER O CORTE NO 3D (13/10/2026): o plano do corte, o nome e o "Ver tudo". Ver `corteNo3d`. */
  planoDeCorte?: { normal: [number, number, number]; constante: number } | null;
  rotuloDoCorte?: string;
  onSairDoCorte?: () => void;
  /** E10.3: a caixa de corte ligada desde o início (METRO, Y para cima) — o harness e a vista que a pede. */
  caixaDeCorteInicial?: import('../../utils/blueprint3dSelecao').CaixaDeCorte | null;
  /**
   * E10.4b: modelos IFC EXTERNOS desenhados como referência — só para olhar. Não são
   * peça do modelo: não se clicam, não entram no enquadramento nem no hash; a caixa
   * de corte os recorta junto. `matriz` vem de `matrizDaReferencia`.
   */
  referencias?: readonly import('./Blueprint3DViewer').ReferenciaNo3D[];
}

const Carregando = () => (
  <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-slate-400">
    <Loader2 className="h-6 w-6 animate-spin" />
    <span className="text-sm">Carregando modelo 3D…</span>
  </div>
);

/**
 * F13 — EXPORTAR IMAGEM: a resolução e o botão. O PNG sai do ponto de vista em uso (a câmera salva, com a
 * lente dela) ou da órbita livre. Falha (placa de vídeo sem memória, cena vazia) aparece aqui, com o motivo.
 */
function BarraDaCaptura({
  capturaRef,
  nomeDoEstudo,
  vista,
  focalMm,
}: {
  capturaRef: React.MutableRefObject<((largura: number, altura: number, focalMm?: number) => Promise<Blob>) | null>;
  nomeDoEstudo: string;
  vista: string | null;
  focalMm?: number;
}) {
  const [resolucao, setResolucao] = useState<ResolucaoDaCaptura>('HD');
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const exportar = async () => {
    const r = RESOLUCOES_DA_CAPTURA.find((x) => x.id === resolucao)!;
    if (!capturaRef.current) {
      setErro('O 3D ainda está carregando.');
      return;
    }
    setGerando(true);
    setErro(null);
    try {
      const png = await capturaRef.current(r.largura, r.altura, focalMm);
      const url = URL.createObjectURL(png);
      const a = document.createElement('a');
      a.href = url;
      a.download = nomeDaCaptura(nomeDoEstudo, vista, new Date());
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setGerando(false);
    }
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white/95 px-2 py-1 text-xs text-slate-600 shadow-sm">
        <select
          value={resolucao}
          onChange={(e) => setResolucao(e.target.value as ResolucaoDaCaptura)}
          aria-label="Resolução da imagem"
          className="h-7 rounded-[6px] border border-slate-200 bg-white px-1.5 text-xs text-slate-800 outline-none focus:border-blue-500"
        >
          {RESOLUCOES_DA_CAPTURA.map((r) => (
            <option key={r.id} value={r.id}>{r.rotulo}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void exportar()}
          disabled={gerando}
          title={`PNG do que se vê${vista ? ` — ${vista}` : ''}, sem a grade nem a alça. A seleção sai destacada: limpe com Esc antes, se não a quiser na imagem.`}
          className="inline-flex h-7 items-center gap-1 rounded-[6px] bg-blue-600 px-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
        >
          {gerando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageDown className="h-3.5 w-3.5" />}
          {gerando ? 'Gerando…' : 'Exportar imagem'}
        </button>
      </div>
      {erro && <p className="max-w-xs rounded-md bg-white/95 px-2 py-1 text-[11px] text-red-700 shadow-sm" role="alert">{erro}</p>}
    </div>
  );
}

export default function Blueprint3DTab(props: Props) {
  const { onSelecionar, selecionados } = props;
  // F13: o viewer publica aqui a função de captura (ver `Captura` no viewer).
  const capturaRef = useRef<((largura: number, altura: number, focalMm?: number) => Promise<Blob>) | null>(null);
  return (
    // ESC LIMPA A SELEÇÃO NO 3D (16/09/2026: *"quando clico na tecla ESC a
    // seleção se desfaz. O mesmo comportamento não acontece na visualização
    // 3D"*). O invólucro é focável para receber a tecla — clicar na cena já lhe
    // dá o foco, porque o canvas WebGL não é focável e o foco sobe para o
    // ancestral mais próximo que é — e o gesto é o mesmo do canvas 2D:
    // `onSelecionar([])`. Fica AQUI, fora do `lazy`, para valer desde o primeiro
    // quadro. Só age quando há o que limpar, para não engolir o Escape de um
    // diálogo aberto por cima.
    <div
      className="relative h-full w-full outline-none"
      data-testid="cena-3d"
      tabIndex={onSelecionar ? 0 : undefined}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && onSelecionar && (selecionados?.size ?? 0) > 0) {
          e.preventDefault();
          onSelecionar([]);
        }
      }}
    >
      {/* F12: as VISTAS SALVAS (câmeras da planta) — "Livre" devolve a órbita de sempre. F13: a CAPTURA em PNG. */}
      {((props.pontosDeVista && props.pontosDeVista.length > 0 && props.onPontoDeVista) || props.nomeDoEstudo) && (
        <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2">
          {props.pontosDeVista && props.pontosDeVista.length > 0 && props.onPontoDeVista && (
            <label className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white/95 px-2 py-1 text-xs text-slate-600 shadow-sm">
              <Camera className="h-3.5 w-3.5 text-violet-600" aria-hidden="true" />
              Ponto de vista
              <select
                value={props.pontoDeVistaId ?? ''}
                onChange={(e) => props.onPontoDeVista?.(e.target.value || null)}
                aria-label="Ponto de vista do 3D"
                className="h-7 rounded-[6px] border border-slate-200 bg-white px-1.5 text-xs text-slate-800 outline-none focus:border-blue-500"
              >
                <option value="">Livre (órbita)</option>
                {props.pontosDeVista.map((v) => (
                  <option key={v.id} value={v.id}>{v.nome}</option>
                ))}
              </select>
            </label>
          )}
          {props.nomeDoEstudo && <BarraDaCaptura capturaRef={capturaRef} nomeDoEstudo={props.nomeDoEstudo} vista={props.pontosDeVista?.find((v) => v.id === props.pontoDeVistaId)?.nome ?? null} focalMm={props.pontoDeVista?.focalMm} />}
        </div>
      )}
      <Suspense fallback={<Carregando />}>
        <Blueprint3DViewer {...props} capturaRef={capturaRef} />
      </Suspense>
    </div>
  );
}
