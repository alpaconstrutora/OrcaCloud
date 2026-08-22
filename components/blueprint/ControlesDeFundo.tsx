import React, { useRef, useState } from 'react';
import { AlertTriangle, Image as ImageIcon, Layers, Ruler, Trash2 } from 'lucide-react';
import {
  AVISO_RASTER,
  VAO_CURTO_PX,
  distanciaMedidaMm,
  escalaAparente,
  escalaPadraoProxima,
  precisaoDaAfericao,
  type Underlay,
} from '../../utils/blueprintUnderlay';
import type { UnderlayRow } from '../../services/blueprintUnderlayService';

/**
 * Controles da planta de fundo, na barra do editor.
 *
 * A ordem dos elementos segue o caminho real: importar → aferir → traçar. E o
 * aviso sobre raster fica VISÍVEL enquanto houver fundo, não escondido em ajuda:
 * a escala aferida num canto da folha pode não valer no outro, e quem não souber
 * disso vai confiar no traçado mais do que deve.
 */
export default function ControlesDeFundo({
  linhas,
  linha,
  underlay,
  opacidade,
  calibrando,
  ocupado,
  totalPaginas,
  onSelecionar,
  onImportar,
  onCalibrar,
  onDeclararEscala,
  onOpacidade,
  onRemover,
}: {
  linhas: UnderlayRow[];
  linha: UnderlayRow | null;
  underlay: Underlay | null;
  opacidade: number;
  calibrando: boolean;
  ocupado: boolean;
  totalPaginas: number;
  onSelecionar: (id: string) => void;
  onImportar: (arquivo: File, pagina: number) => void;
  onCalibrar: () => void;
  /** Escala DECLARADA. Só aparece para prancha de PDF — ver `mmPorPixelDaEscala`. */
  onDeclararEscala: (denominador: number) => void;
  onOpacidade: (v: number) => void;
  onRemover: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pagina, setPagina] = useState(1);
  const [escala, setEscala] = useState('');

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,application/pdf"
        className="hidden"
        aria-label="Arquivo da planta de fundo"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImportar(f, pagina);
          e.target.value = '';
        }}
      />

      {/* Só aparece a partir da segunda: com uma prancha o seletor seria um
          controle de escolha única, que não escolhe nada. */}
      {linhas.length > 1 && (
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <Layers className="h-3.5 w-3.5 text-slate-400" aria-hidden />
          <select
            value={linha?.id ?? ''}
            onChange={(e) => onSelecionar(e.target.value)}
            aria-label="Prancha ativa"
            // O nome COMPLETO no tooltip: o campo trunca, e nome de prancha é
            // longo por natureza (nome de arquivo de projeto). Sem isto, a
            // única forma de ler o nome inteiro seria abrir o menu.
            title={`${linha?.nome || linha?.nome_arquivo || 'Prancha'} — cada prancha tem a própria aferição, e mostra só as medições traçadas nela`}
            className="max-w-44 rounded-md border border-slate-300 px-2 py-1 text-xs"
          >
            {linhas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome || l.nome_arquivo}
              </option>
            ))}
          </select>
        </label>
      )}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={ocupado}
        title="Acrescenta uma prancha. As que já existem continuam, com a aferição delas."
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
      >
        <ImageIcon className="h-3.5 w-3.5" />
        {linha ? 'Acrescentar prancha' : 'Planta de fundo'}
      </button>

      {totalPaginas > 1 && (
        <label className="flex items-center gap-1 text-[11px] text-slate-600">
          Página
          <input
            type="number"
            min={1}
            max={totalPaginas}
            value={pagina}
            onChange={(e) => setPagina(Number(e.target.value))}
            aria-label="Página do PDF"
            className="w-14 rounded-md border border-slate-300 px-1 py-1 text-xs"
          />
          <span className="text-slate-400">de {totalPaginas}</span>
        </label>
      )}

      {/* ESCALA DECLARADA — a via certa para prancha de PDF.
          Vem ANTES de "Aferir escala" na barra porque é o caminho que deveria
          ser tentado primeiro: o raster foi gerado por nós, num dpi conhecido,
          então declarar o denominador dá escala EXATA. Clicar dois pontos
          introduz um erro que esta conta não tem — medido, 1 px numa cota de
          1,10 m virou 1,45% e partiu a espessura das paredes em dois valores. */}
      {linha && underlay && linha.pdf_pagina !== null && (
        <label
          className="flex items-center gap-1 text-[11px] text-slate-600"
          title="A escala impressa na prancha. Declarada, a escala é exata — não depende de acertar o pixel."
        >
          Escala 1:
          <input
            type="number"
            min={2}
            max={5000}
            placeholder={linha.escala_desenho ? String(linha.escala_desenho) : '100'}
            value={escala}
            onChange={(e) => setEscala(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              const n = Number(escala);
              if (n >= 2 && n <= 5000) {
                onDeclararEscala(n);
                setEscala('');
              }
            }}
            aria-label="Escala do desenho"
            className={`w-16 rounded-md border px-1 py-1 text-xs ${
              linha.escala_desenho
                ? 'border-emerald-400 bg-emerald-50'
                : 'border-slate-300'
            }`}
          />
          {linha.escala_desenho ? (
            <span className="text-emerald-700" title="Escala declarada — exata">
              ✓ exata
            </span>
          ) : (
            <span className="text-slate-400">Enter</span>
          )}
        </label>
      )}

      {linha && underlay && (
        <>
          <button
            type="button"
            onClick={onCalibrar}
            aria-pressed={calibrando}
            title={
              calibrando
                ? 'Clique dois pontos de distância conhecida — use a cota MAIS LONGA da planta'
                : 'Aferir a escala: dois cliques e a distância real entre eles. Prefira a cota mais longa: sobre 65 px um pixel de erro vale 1,5%; sobre 600 px, 0,17%'
            }
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium ${
              calibrando
                ? 'border-amber-500 bg-amber-50 text-amber-800'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Ruler className="h-3.5 w-3.5" />
            {calibrando ? 'Clique 2 pontos (cota longa)…' : 'Aferir escala'}
          </button>

          <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
            Opacidade
            <input
              type="range"
              min={5}
              max={100}
              value={Math.round(opacidade * 100)}
              onChange={(e) => onOpacidade(Number(e.target.value) / 100)}
              aria-label="Opacidade da planta de fundo"
              className="w-20"
            />
          </label>

          <button
            type="button"
            onClick={onRemover}
            disabled={ocupado}
            aria-label="Remover esta prancha"
            title="Remove esta prancha. As medições traçadas nela continuam, sem o documento por baixo."
            className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  );
}

/**
 * A aferição, mostrada por extenso.
 *
 * Não basta guardar `mm_por_pixel`: quem revisa precisa ver QUAL cota foi
 * clicada e qual distância foi declarada, senão não há como saber se a pessoa
 * mediu a parede certa. É a mesma disciplina da fórmula que acompanha cada
 * quantitativo.
 */
export function ResumoDaAfericao({
  linha,
  underlay,
}: {
  linha: UnderlayRow;
  underlay: Underlay;
}) {
  const temAfericao =
    linha.calib_p1_px !== null && linha.calib_p2_px !== null && linha.calib_distancia_mm !== null;

  const conferida = temAfericao
    ? distanciaMedidaMm(
        underlay,
        { px: linha.calib_p1_px!, py: linha.calib_p1_py! },
        { px: linha.calib_p2_px!, py: linha.calib_p2_py! },
      )
    : null;

  const aparente = escalaAparente(underlay);

  // A sugestão de escala padrão só vale para prancha vinda de PDF.
  //
  // `escalaAparente` supõe 150 dpi, que é como `rasterizarPdf` gera — para PDF
  // o número é exato. Numa foto ou num JPG solto o dpi é desconhecido, "1:101,5"
  // não significa nada, e sugerir 1:100 seria inventar precisão que não existe.
  const precisao = temAfericao
    ? precisaoDaAfericao(
        { px: linha.calib_p1_px!, py: linha.calib_p1_py! },
        { px: linha.calib_p2_px!, py: linha.calib_p2_py! },
      )
    : null;
  // Escala DECLARADA cala os dois avisos, e por motivos diferentes de "não se
  // aplica": não houve clique, logo não há pixel de erro para relatar; e o
  // número não "quase acertou" 1:100, ele É 1:100. Sugerir uma escala redonda a
  // quem acabou de digitar uma seria absurdo.
  // `?? null` NÃO é decoração: `undefined !== null` é verdadeiro, então uma
  // linha sem a coluna cairia no ramo "escala declarada" e a tela anunciaria
  // uma escala exata que ninguém informou. Um teste pegou. É a mesma família
  // de defeito das três sentinelas da REGRA #5 do CLAUDE.md.
  const declarada = linha.escala_desenho ?? null;
  const padrao =
    declarada === null && temAfericao && linha.pdf_pagina !== null
      ? escalaPadraoProxima(aparente)
      : null;
  const vaoCurto =
    declarada === null && precisao !== null && precisao.vaoPx < VAO_CURTO_PX;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2">
      <p className="flex items-start gap-1.5 text-[11px] text-amber-800">
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
        <span>{AVISO_RASTER}</span>
      </p>

      {declarada !== null ? (
        <p className="mt-1 text-[11px] text-emerald-800">
          Escala <strong>declarada</strong> como <strong>1:{declarada}</strong> ·{' '}
          {underlay.mmPorPixel.toFixed(4).replace('.', ',')} mm por pixel ·{' '}
          <strong>exata</strong>, sem erro de clique
          {linha.calib_alinhado && ' · planta alinhada pela referência'}
        </p>
      ) : temAfericao ? (
        <>
          <p className="mt-1 text-[11px] text-amber-700">
            Aferido em <strong>{(linha.calib_distancia_mm! / 1000).toFixed(2).replace('.', ',')} m</strong>
            {conferida !== null && (
              <> · confere em {(conferida / 1000).toFixed(2).replace('.', ',')} m</>
            )}{' '}
            · {underlay.mmPorPixel.toFixed(2).replace('.', ',')} mm por pixel · equivale a 1:
            {aparente.toFixed(1).replace('.', ',')}
            {linha.pdf_pagina === null && ' num escaneamento de 150 dpi'}
            {linha.calib_alinhado && ' · planta alinhada pela referência'}
          </p>

          {/* A SUGESTÃO DE ESCALA PADRÃO.
              Ninguém desenha em 1:101,5 — a proximidade de uma escala redonda
              denuncia erro de clique. O texto diz a CONSEQUÊNCIA, não só o
              desvio: "1,5%" não move ninguém, "parte a espessura das paredes em
              dois valores" move. */}
          {padrao !== null && (
            <p className="mt-1.5 flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-100 px-2 py-1.5 text-[11px] font-medium text-amber-900">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                Isso dá <strong>1:{aparente.toFixed(1).replace('.', ',')}</strong> — quis dizer{' '}
                <strong>1:{padrao}</strong>? Uma diferença dessas parte a espessura das paredes
                entre dois valores (20 cm e 21 cm), e a mesma alvenaria vira duas linhas no
                orçamento.
              </span>
            </p>
          )}

          {/* O VÃO DA AFERIÇÃO.
              A precisão não depende de clicar bem, e sim de sobre que
              comprimento se clicou — e este é o número que diz se vale refazer. */}
          {precisao !== null && (
            <p
              className={`mt-1 text-[11px] ${vaoCurto ? 'font-medium text-amber-900' : 'text-amber-700'}`}
            >
              Medido sobre {Math.round(precisao.vaoPx)} px da imagem: aqui, 1 pixel de erro vale{' '}
              {precisao.pctPorPixel.toFixed(2).replace('.', ',')}%
              {vaoCurto && ' — refaça sobre a cota mais longa da planta para reduzir isso'}
            </p>
          )}
        </>
      ) : (
        <p className="mt-1 text-[11px] font-medium text-amber-900">
          Escala ainda NÃO aferida — o que for traçado agora sai fora de escala.
        </p>
      )}
    </div>
  );
}
