import React, { useRef, useState } from 'react';
import { AlertTriangle, Image as ImageIcon, Ruler, Trash2 } from 'lucide-react';
import {
  AVISO_RASTER,
  distanciaMedidaMm,
  escalaAparente,
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
  linha,
  underlay,
  opacidade,
  calibrando,
  ocupado,
  totalPaginas,
  onImportar,
  onCalibrar,
  onOpacidade,
  onRemover,
}: {
  linha: UnderlayRow | null;
  underlay: Underlay | null;
  opacidade: number;
  calibrando: boolean;
  ocupado: boolean;
  totalPaginas: number;
  onImportar: (arquivo: File, pagina: number) => void;
  onCalibrar: () => void;
  onOpacidade: (v: number) => void;
  onRemover: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pagina, setPagina] = useState(1);

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

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={ocupado}
        title="Importa uma imagem ou PDF para traçar por cima"
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
      >
        <ImageIcon className="h-3.5 w-3.5" />
        {linha ? 'Trocar fundo' : 'Planta de fundo'}
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

      {linha && underlay && (
        <>
          <button
            type="button"
            onClick={onCalibrar}
            aria-pressed={calibrando}
            title={
              calibrando
                ? 'Clique dois pontos de distância conhecida na planta'
                : 'Aferir a escala: dois cliques e a distância real entre eles'
            }
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium ${
              calibrando
                ? 'border-amber-500 bg-amber-50 text-amber-800'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Ruler className="h-3.5 w-3.5" />
            {calibrando ? 'Clique 2 pontos…' : 'Aferir escala'}
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
            aria-label="Remover planta de fundo"
            title="Remover a planta de fundo"
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

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2">
      <p className="flex items-start gap-1.5 text-[11px] text-amber-800">
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
        <span>{AVISO_RASTER}</span>
      </p>

      {temAfericao ? (
        <p className="mt-1 text-[11px] text-amber-700">
          Aferido em <strong>{(linha.calib_distancia_mm! / 1000).toFixed(2).replace('.', ',')} m</strong>
          {conferida !== null && (
            <> · confere em {(conferida / 1000).toFixed(2).replace('.', ',')} m</>
          )}{' '}
          · {underlay.mmPorPixel.toFixed(2).replace('.', ',')} mm por pixel · equivale a 1:
          {Math.round(escalaAparente(underlay))} num escaneamento de 150 dpi
          {linha.calib_alinhado && ' · planta alinhada pela referência'}
        </p>
      ) : (
        <p className="mt-1 text-[11px] font-medium text-amber-900">
          Escala ainda NÃO aferida — o que for traçado agora sai fora de escala.
        </p>
      )}
    </div>
  );
}
