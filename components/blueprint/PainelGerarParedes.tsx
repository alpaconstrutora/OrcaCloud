import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  DoorOpen,
  FileCheck2,
  FileUp,
  Loader2,
  Ruler,
  SquareDashedMousePointer,
  Wand2,
  X,
} from 'lucide-react';
import {
  gerarParedes,
  gerarPortas,
  histogramaEspessura,
  mmPorPt,
  type ArcoBezier,
  type ParaPixel,
  type ParedeAlvo,
  type ParedeGerada,
  type PortaGerada,
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
  semAfericao,
  pranchaId,
  limitesDaVista,
  regiao,
  regiaoArmada,
  onArmarRegiao,
  onLimparRegiao,
  onExtrair,
  onVetorGuardado,
  onRegravar,
  onGerar,
  paredesDoNivel,
  onGerarPortas,
  ocupado,
}: {
  underlay: Underlay | null;
  temFundo: boolean;
  /**
   * A escala não foi estabelecida por nenhuma via — nem declarada, nem aferida.
   *
   * Vem do hook, e não de `underlay.mmPorPixel === 1` como antes: a sentinela
   * é detalhe de armazenamento, e quem sabe se a prancha foi aferida é quem
   * guarda a linha.
   */
  semAfericao: boolean;
  /** Identidade da prancha ativa: trocar de prancha recomeça a busca. */
  pranchaId: string | null;
  /** O enquadramento da tela, em milímetro do modelo. É o padrão da região. */
  limitesDaVista: { x0: number; y0: number; x1: number; y1: number } | null;
  /**
   * A janela marcada à mão. Tem PRECEDÊNCIA sobre o enquadramento.
   *
   * Existe porque uma prancha traz ~23 desenhos: isolar um pelo zoom obriga a
   * enquadrar só ele, num zoom que não é o de leitura. Marcada, a região
   * sobrevive ao zoom — e é isso que permite escolher a espessura por
   * tentativa e erro sem o conjunto mudar por baixo a cada ajuste de vista.
   */
  regiao: { x0: number; y0: number; x1: number; y1: number } | null;
  /** O próximo arraste no desenho marca a região. */
  regiaoArmada: boolean;
  onArmarRegiao: () => void;
  onLimparRegiao: () => void;
  onExtrair: (arquivo: File, pagina: number) => Promise<{
    segmentos: SegmentoVetor[];
    arcos: ArcoBezier[];
    paraPixel: ParaPixel;
    larguraPt: number;
    alturaPt: number;
    totalPaginas: number;
  }>;
  /** Regrava o vetor guardado — para a prancha não pedir o PDF de novo. */
  onRegravar: (
    segmentos: SegmentoVetor[],
    larguraPt: number,
    alturaPt: number,
    paraPixel: ParaPixel,
    arcos: ArcoBezier[],
  ) => void;
  /** O vetor guardado na importação. `null` = não tem, e é caso normal. */
  onVetorGuardado: () => Promise<{
    segmentos: SegmentoVetor[];
    arcos: ArcoBezier[];
    temArcos: boolean;
    paraPixel: ParaPixel;
  } | null>;
  onGerar: (paredes: ParedeGerada[]) => void;
  /**
   * As paredes que já existem no nível — é nelas que a porta é hospedada.
   *
   * Vem de fora porque a porta não nasce sozinha: `AddOpening` exige uma
   * parede, e um arco sem parede sob a dobradiça é descartado em vez de
   * inventar a parede que falta.
   */
  paredesDoNivel: ParedeAlvo[];
  onGerarPortas: (portas: PortaGerada[]) => void;
  ocupado: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pagina, setPagina] = useState(1);
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [extraido, setExtraido] = useState<{
    segmentos: SegmentoVetor[];
    arcos: ArcoBezier[];
    /** O formato guardado sabe de arcos? Ver `temArcos` no service. */
    temArcos: boolean;
    paraPixel: ParaPixel;
    nome: string;
    guardado: boolean;
  } | null>(null);
  const [espessuraPt, setEspessuraPt] = useState<number | null>(null);
  const [buscandoGuardado, setBuscandoGuardado] = useState(false);

  // Procura o vetor guardado ao abrir o painel e a cada troca de prancha.
  //
  // ⚠️ `cancelado` não é zelo decorativo: o arquivo tem centenas de kilobytes,
  // e trocar de prancha durante a busca faria a resposta da prancha ANTERIOR
  // chegar depois e sobrescrever a atual — o usuário veria os traços da folha
  // errada, sem nenhum aviso de que trocou.
  useEffect(() => {
    let cancelado = false;
    setExtraido(null);
    setEspessuraPt(null);
    setErro(null);
    if (!pranchaId) return;

    setBuscandoGuardado(true);
    void onVetorGuardado()
      .then((v) => {
        if (cancelado || !v) return;
        setExtraido({
          segmentos: v.segmentos,
          arcos: v.arcos,
          temArcos: v.temArcos,
          paraPixel: v.paraPixel,
          nome: 'guardado na importação',
          guardado: true,
        });
      })
      .finally(() => {
        if (!cancelado) setBuscandoGuardado(false);
      });

    return () => {
      cancelado = true;
    };
  }, [pranchaId, onVetorGuardado]);

  // A aferição diz quantos milímetros reais vale um ponto de papel. É também a
  // resposta a "que escala é esta planta?" — 35,3 mm/pt é 1:100.
  const escala = underlay ? mmPorPt(underlay) : null;

  const grupos = useMemo(
    () => (extraido ? histogramaEspessura(extraido.segmentos).slice(0, 8) : []),
    [extraido],
  );

  /**
   * A região que vale: a janela marcada, se houver; senão o enquadramento.
   *
   * A precedência é da janela porque ela é AFIRMADA — o enquadramento muda a
   * cada rolagem de zoom, sem intenção. Deixar o enquadramento vencer faria a
   * região marcada sumir no primeiro ajuste de vista.
   */
  const regiaoEfetiva = regiao ?? limitesDaVista;

  const paredes = useMemo(() => {
    // SEM ESCALA NÃO SE GERA NADA — e isto é recusa, não aviso.
    //
    // Com `mmPorPixel = 1` (a sentinela de "não aferida"), o pareamento usa
    // uma faixa de espessura 17× errada e devolve pares que não são parede.
    // Medido num caso real: 13 paredes de 2,5 m no total, com espessuras de
    // 5, 6, 8, 9, 10 e 11 cm espalhadas — resultado que PARECE plausível e não
    // é. Avisar não bastou; a tela avisava e gerava assim mesmo.
    if (semAfericao) return [];
    if (!extraido || !underlay || espessuraPt === null) return [];
    const doGrupo = extraido.segmentos.filter(
      (s) => Math.abs(s.larguraPt - espessuraPt) < 0.01,
    );
    return gerarParedes(doGrupo, underlay, extraido.paraPixel, regiaoEfetiva);
  }, [semAfericao, extraido, underlay, espessuraPt, regiaoEfetiva]);

  /**
   * Quantos TOPOS de parede o corte de esbeltez removeu.
   *
   * Mostrado, e não escondido: é um descarte automático de metade dos
   * candidatos, e um descarte silencioso desse tamanho é o tipo de coisa que
   * ninguém questiona porque ninguém vê. Com o número na tela dá para
   * desconfiar dele.
   */
  const topos = useMemo(() => {
    if (semAfericao || !extraido || !underlay || espessuraPt === null) return 0;
    const doGrupo = extraido.segmentos.filter(
      (s) => Math.abs(s.larguraPt - espessuraPt) < 0.01,
    );
    const tudo = gerarParedes(doGrupo, underlay, extraido.paraPixel, regiaoEfetiva, {
      esbeltezMinima: 0,
    });
    return tudo.length - paredes.length;
  }, [semAfericao, extraido, underlay, espessuraPt, regiaoEfetiva, paredes.length]);

  /**
   * As portas que os arcos revelam, já casadas com as paredes do nível.
   *
   * Depende das paredes EXISTENTES, e não das que o painel acabou de calcular:
   * a porta é hospedada numa parede do modelo (`AddOpening` exige `wallId`), e
   * parede que ainda não foi aplicada não tem id. É por isso que a ordem na
   * tela é parede primeiro, porta depois — e a tela diz isso.
   */
  const portas = useMemo(() => {
    if (semAfericao || !extraido || !underlay) return [];
    if (!extraido.temArcos) return [];
    return gerarPortas(
      extraido.arcos,
      paredesDoNivel,
      underlay,
      extraido.paraPixel,
      regiaoEfetiva,
    );
  }, [semAfericao, extraido, underlay, paredesDoNivel, regiaoEfetiva]);

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
      setExtraido({
        segmentos: r.segmentos,
        arcos: r.arcos,
        // Extração ao vivo sempre tem arcos: é o caminho novo.
        temArcos: true,
        paraPixel: r.paraPixel,
        nome: arquivo.name,
        guardado: false,
      });
      // Regrava para a próxima visita: prancha com vetor em formato antigo
      // pediria o PDF para sempre, a cada vez que o painel abrisse.
      if (r.segmentos.length > 0) {
        onRegravar(r.segmentos, r.larguraPt, r.alturaPt, r.paraPixel, r.arcos);
      }
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
        <p className="mb-3 flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-[11px] font-medium text-red-800">
          <Ruler className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>A escala desta prancha não foi estabelecida.</strong> Gerar agora
            devolveria paredes de tamanho errado, com espessuras espalhadas que parecem
            plausíveis. Declare a escala (campo <strong>1:___</strong> na barra) ou afira
            sobre a cota mais longa da planta.
          </span>
        </p>
      )}

      {buscandoGuardado ? (
        <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Procurando o vetor guardado desta prancha…
        </p>
      ) : extraido?.guardado ? (
        <p className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">
          <FileCheck2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            O traço vetorial desta prancha foi guardado na importação —{' '}
            <strong>{extraido.segmentos.length.toLocaleString('pt-BR')} traços</strong>. Não
            precisa apontar o PDF.
          </span>
        </p>
      ) : (
        <p className="text-[11px] leading-relaxed text-slate-600">
          As paredes saem do <strong>traço vetorial</strong> do PDF do projeto. Esta prancha
          não tem o vetor guardado — ou entrou como imagem, ou foi importada antes desta
          versão. Aponte o PDF para gerar.
        </p>
      )}

      {!buscandoGuardado && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={lendo || ocupado}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            {lendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
            {extraido ? 'Usar outro PDF' : 'Escolher o PDF do projeto'}
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
      )}

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

      {extraido && grupos.length > 0 && (
        <>
          <h3 className="mt-4 text-xs font-semibold text-slate-700">De que parte da prancha?</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            Uma prancha traz vários desenhos. Marque uma janela em volta da planta que
            interessa — ela vale mesmo depois de mexer no zoom.
          </p>

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onArmarRegiao}
              disabled={ocupado}
              aria-pressed={regiaoArmada}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium disabled:opacity-40 ${
                regiaoArmada
                  ? 'border-violet-500 bg-violet-50 text-violet-800'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <SquareDashedMousePointer className="h-3.5 w-3.5" />
              {regiaoArmada ? 'Arraste no desenho…' : regiao ? 'Marcar outra região' : 'Marcar região'}
            </button>

            {regiao && (
              <button
                type="button"
                onClick={onLimparRegiao}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-3 w-3" />
                Limpar
              </button>
            )}
          </div>

          <p className="mt-1.5 text-[11px] text-slate-500">
            {regiao ? (
              <>
                Região marcada:{' '}
                <strong>
                  {((regiao.x1 - regiao.x0) / 1000).toFixed(2).replace('.', ',')} ×{' '}
                  {((regiao.y1 - regiao.y0) / 1000).toFixed(2).replace('.', ',')} m
                </strong>
              </>
            ) : (
              'Sem região marcada — vale o que estiver enquadrado na tela.'
            )}
          </p>
        </>
      )}

      {espessuraPt !== null && (
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-[11px] text-slate-600">
            {regiao ? (
              <>
                Na <strong>região marcada</strong>
              </>
            ) : (
              <>
                Na <strong>área visível da tela</strong>
              </>
            )}
            : {paredes.length} parede{paredes.length === 1 ? '' : 's'}
          </p>
          {porEspessura.length > 0 && (
            <p className="mt-1 text-[11px] text-slate-500">
              Espessuras: {porEspessura.map(([mm, n]) => `${mm / 10} cm ×${n}`).join(' · ')}
            </p>
          )}
          {topos > 0 && (
            <p className="mt-1 text-[11px] text-slate-500">
              {topos} topo{topos === 1 ? '' : 's'} de parede descartado
              {topos === 1 ? '' : 's'} — a face curta que fecha a ponta da parede casa
              com a vizinha e viraria uma parede atravessada.
            </p>
          )}
          {!regiao && (
            <p className="mt-1 text-[11px] text-slate-400">
              Dê zoom no desenho que interessa — ou marque uma região acima, que não se
              desfaz ao mexer no zoom.
            </p>
          )}

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

      {extraido && !semAfericao && (
        <div className="mt-4 border-t border-slate-200 pt-3">
          <h3 className="text-xs font-semibold text-slate-700">Portas</h3>

          {!extraido.temArcos ? (
            <p className="mt-1 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                O vetor guardado desta prancha é de uma versão que <strong>não guardava
                os arcos</strong> — então não dá para saber se há portas. Aponte o PDF
                acima uma vez e a prancha volta a abrir completa.
              </span>
            </p>
          ) : (
            <>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                A porta é reconhecida pelo <strong>arco de giro</strong>: o centro do
                arco é a dobradiça e o raio é a largura do vão. Cada porta entra numa
                parede que já exista — então gere as paredes primeiro.
              </p>

              {paredesDoNivel.length === 0 ? (
                <p className="mt-2 text-[11px] text-slate-500">
                  Nenhuma parede neste nível ainda. Gere as paredes acima e as portas
                  aparecem aqui.
                </p>
              ) : (
                <>
                  <p className="mt-2 text-[11px] text-slate-600">
                    {regiao ? 'Na região marcada' : 'Na área visível da tela'}:{' '}
                    <strong>
                      {portas.length} porta{portas.length === 1 ? '' : 's'}
                    </strong>
                  </p>
                  <button
                    type="button"
                    onClick={() => onGerarPortas(portas)}
                    disabled={portas.length === 0 || ocupado}
                    className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
                  >
                    <DoorOpen className="h-3.5 w-3.5" />
                    Gerar {portas.length} porta{portas.length === 1 ? '' : 's'}
                  </button>
                  <p className="mt-2 text-[11px] text-slate-400">
                    Só sai porta cuja dobradiça caia sobre uma parede. Arco solto é
                    descartado — inventar a parede que falta daria um resultado
                    plausível e errado.
                  </p>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
