import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileUp, Loader2, Ruler, Wand2 } from 'lucide-react';
import {
  gerarParedes,
  histogramaEspessura,
  mmPorPt,
  type ParedeGerada,
  type SegmentoVetor,
} from '../../utils/blueprintVetor';
import type { Underlay } from '../../utils/blueprintUnderlay';

/**
 * Gerar paredes a partir do vetor do PDF.
 *
 * ─── AS TRÊS COISAS QUE ESTA TELA PRECISA EXPLICAR ──────────────────────────
 *
 * 1. **Por que o PDF de novo.** A importação da planta de fundo rasteriza e
 *    sobe o PNG; o PDF não fica guardado. Sem dizer isso, pedir o arquivo outra
 *    vez parece defeito.
 * 2. **Por que precisa da aferição.** A escala do desenho sai da aferição do
 *    fundo, e é ela que faz a parede gerada cair EM CIMA da planta. Sem fundo
 *    aferido não há para onde converter.
 * 3. **Qual espessura é parede.** Numa prancha os traços misturam parede, cota,
 *    hachura e letra. O Spike C mediu que a espessura separa — e que escolher
 *    automaticamente erra. Quem escolhe é o usuário, num clique.
 *
 * ─── POR QUE NÃO HÁ PRÉVIA COLORIDA ─────────────────────────────────────────
 *
 * A prévia é o próprio resultado: gerar é UM passo de desfazer, então errar a
 * espessura custa um Ctrl+Z. Uma camada de prévia no canvas exigiria um
 * caminho de desenho novo para dar a mesma informação que o número já dá antes
 * de aplicar. Fica para depois, se o uso mostrar que o número não basta.
 */
export default function PainelGerarParedes({
  underlay,
  temFundo,
  limitesDaVista,
  onExtrair,
  onGerar,
  ocupado,
}: {
  underlay: Underlay | null;
  temFundo: boolean;
  /** Região = o que está na tela. Vem do canvas, em milímetro do modelo. */
  limitesDaVista: { x0: number; y0: number; x1: number; y1: number } | null;
  onExtrair: (arquivo: File, pagina: number) => Promise<{
    segmentos: SegmentoVetor[];
    alturaPt: number;
    totalPaginas: number;
  }>;
  onGerar: (paredes: ParedeGerada[]) => void;
  ocupado: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pagina, setPagina] = useState(1);
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [extraido, setExtraido] = useState<{
    segmentos: SegmentoVetor[];
    alturaPt: number;
    nome: string;
  } | null>(null);
  const [espessuraPt, setEspessuraPt] = useState<number | null>(null);

  // A aferição diz quantos milímetros reais vale um ponto de papel. É também a
  // resposta a "que escala é esta planta?" — 35,3 mm/pt é 1:100.
  const escala = underlay ? mmPorPt(underlay) : null;

  const grupos = useMemo(
    () => (extraido ? histogramaEspessura(extraido.segmentos).slice(0, 8) : []),
    [extraido],
  );

  const paredes = useMemo(() => {
    if (!extraido || !underlay || espessuraPt === null) return [];
    const doGrupo = extraido.segmentos.filter(
      (s) => Math.abs(s.larguraPt - espessuraPt) < 0.01,
    );
    return gerarParedes(doGrupo, underlay, extraido.alturaPt, limitesDaVista);
  }, [extraido, underlay, espessuraPt, limitesDaVista]);

  const porEspessura = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of paredes) m.set(p.espessuraMm, (m.get(p.espessuraMm) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [paredes]);

  async function escolher(arquivo: File) {
    setLendo(true);
    setErro(null);
    setEspessuraPt(null);
    try {
      const r = await onExtrair(arquivo, pagina);
      setExtraido({ segmentos: r.segmentos, alturaPt: r.alturaPt, nome: arquivo.name });
      if (r.segmentos.length === 0) {
        setErro(
          'Este PDF não tem traço vetorial nesta página — provavelmente é um ' +
            'escaneamento. Só dá para gerar parede de PDF de projeto, exportado do CAD.',
        );
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setLendo(false);
    }
  }

  if (!temFundo || !underlay) {
    return (
      <div className="p-4">
        <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Importe a planta de fundo e afira a escala primeiro. A escala do desenho sai
            da aferição — é ela que faz a parede gerada cair em cima da planta.
          </span>
        </p>
      </div>
    );
  }

  const semAfericao = underlay.mmPorPixel === 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        aria-label="PDF do projeto"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void escolher(f);
          e.target.value = '';
        }}
      />

      {semAfericao && (
        <p className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          <Ruler className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            A escala ainda não foi aferida. As paredes sairiam do tamanho errado — afira
            antes de gerar.
          </span>
        </p>
      )}

      <p className="text-[11px] leading-relaxed text-slate-600">
        As paredes saem do <strong>traço vetorial</strong> do PDF do projeto. A planta de
        fundo guarda só a imagem, então o arquivo precisa ser apontado de novo aqui.
      </p>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={lendo || ocupado}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          {lendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
          {extraido ? 'Trocar o PDF' : 'Escolher o PDF do projeto'}
        </button>

        <label className="flex items-center gap-1 text-[11px] text-slate-600">
          Página
          <input
            type="number"
            min={1}
            value={pagina}
            onChange={(e) => setPagina(Math.max(1, Number(e.target.value)))}
            aria-label="Página do PDF"
            className="w-14 rounded-md border border-slate-300 px-1 py-1 text-xs"
          />
        </label>
      </div>

      {escala !== null && (
        <p className="mt-2 text-[11px] text-slate-500">
          Escala do desenho, pela aferição: <strong>{escala.toFixed(1).replace('.', ',')} mm</strong> por
          ponto de papel {escala > 1 && <>· cerca de 1:{Math.round(escala / (25.4 / 72))}</>}
        </p>
      )}

      {erro && (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
          {erro}
        </p>
      )}

      {extraido && grupos.length > 0 && (
        <>
          <h3 className="mt-4 text-xs font-semibold text-slate-700">Qual traço é parede?</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            Num projeto o mesmo desenho traz parede, cota, hachura e letra, separadas
            pela espessura do traço. A parede costuma ser o grupo de traço mais grosso e
            de comprimento médio na casa do metro.
          </p>

          <ul className="mt-2 space-y-1">
            {grupos.map((g) => {
              const escolhido = espessuraPt !== null && Math.abs(g.larguraPt - espessuraPt) < 0.001;
              const medioMm = escala !== null ? g.comprimentoMedioPt * escala : null;
              return (
                <li key={g.larguraPt}>
                  <button
                    type="button"
                    onClick={() => setEspessuraPt(g.larguraPt)}
                    aria-pressed={escolhido}
                    className={`flex w-full items-baseline justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs ${
                      escolhido
                        ? 'border-blue-500 bg-blue-50 text-blue-800'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="font-medium">
                      {g.larguraPt.toFixed(2).replace('.', ',')} pt
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {g.n} traços
                      {medioMm !== null && <> · média {(medioMm / 1000).toFixed(2).replace('.', ',')} m</>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {espessuraPt !== null && (
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-[11px] text-slate-600">
            Na <strong>área visível da tela</strong>: {paredes.length} parede
            {paredes.length === 1 ? '' : 's'}
          </p>
          {porEspessura.length > 0 && (
            <p className="mt-1 text-[11px] text-slate-500">
              Espessuras: {porEspessura.map(([mm, n]) => `${mm / 10} cm ×${n}`).join(' · ')}
            </p>
          )}
          <p className="mt-1 text-[11px] text-slate-400">
            Dê zoom no desenho que interessa — a prancha tem vários, e só o que está na
            tela é gerado.
          </p>

          <button
            type="button"
            onClick={() => onGerar(paredes)}
            disabled={paredes.length === 0 || ocupado}
            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
          >
            <Wand2 className="h-3.5 w-3.5" />
            Gerar {paredes.length} parede{paredes.length === 1 ? '' : 's'}
          </button>
          <p className="mt-2 text-[11px] text-slate-400">
            Sai como um passo só de desfazer: se a espessura estiver errada, um Ctrl+Z
            remove tudo.
          </p>
        </div>
      )}
    </div>
  );
}
