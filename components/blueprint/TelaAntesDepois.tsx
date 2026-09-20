/**
 * ANTES / DEPOIS (20/09/2026, roadmap E10.2) — a tela in-flow da reforma: duas
 * miniaturas na mesma escala e enquadramento (como a comparação de
 * alternativas da E6.1): à esquerda o que EXISTE hoje (existente + a demolir,
 * esta em vermelho tracejado), à direita o que FICA (existente em cinza + novo).
 * Embaixo, o resumo do que se demole e do que se constrói, e a lista das
 * peças por fase.
 */
import React, { useMemo, useState } from 'react';
import { Hammer } from 'lucide-react';
import MiniPlanta, { caixaDosModelos } from './MiniPlanta';
import type { BlueprintModel, FaseDeReforma, ObjectId, Quantitativos } from '../../utils/blueprintKernel';
import { ROTULO_DA_FASE } from '../../utils/blueprintKernel';
import { contagemPorFase, fasePorId, idsOcultosPelaFase, pecasComFase, resumirFases } from '../../utils/blueprintFases';

interface Props {
  model: BlueprintModel;
  quant: Quantitativos;
  levelId: ObjectId | null;
  /** Nome de cada pavimento, para o seletor. */
  niveis: { id: ObjectId; nome: string }[];
  /** Selecionar as peças de uma fase no desenho (o ribbon então muda a fase delas). */
  onSelecionar: (ids: ObjectId[]) => void;
}

export default function TelaAntesDepois({ model, quant, levelId, niveis, onSelecionar }: Props) {
  const [nivel, setNivel] = useState<ObjectId | null>(levelId);
  const caixa = useMemo(() => caixaDosModelos([model]), [model]);
  const fases = useMemo(() => fasePorId(model), [model]);
  const ocultosAntes = useMemo(() => idsOcultosPelaFase(model, 'ANTES'), [model]);
  const ocultosDepois = useMemo(() => idsOcultosPelaFase(model, 'DEPOIS'), [model]);
  const contagem = useMemo(() => contagemPorFase(model), [model]);
  const resumo = useMemo(() => resumirFases(quant), [quant]);
  const pecas = useMemo(() => pecasComFase(model), [model]);
  const porFase = (f: FaseDeReforma) => pecas.filter((p) => p.fase === f);
  const semReforma = contagem.EXISTENTE + contagem.DEMOLIR === 0;

  return (
    <div className="space-y-4" data-testid="tela-antes-depois">
      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
        <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
          Pavimento
          <select value={nivel ?? ''} onChange={(e) => setNivel(e.target.value || null)} aria-label="Pavimento do antes e depois" className="h-8 rounded-[6px] border border-slate-300 bg-white px-1.5 text-xs text-slate-800">
            {niveis.map((n) => (
              <option key={n.id} value={n.id}>{n.nome}</option>
            ))}
          </select>
        </label>
        <span className="text-xs text-slate-500" data-testid="contagem-por-fase">
          {contagem.EXISTENTE} existente(s) · {contagem.DEMOLIR} a demolir · {contagem.NOVO} nova(s)
        </span>
      </div>

      {semReforma && (
        <p className="rounded-[6px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="aviso-sem-reforma">
          Nenhuma peça marcada como existente ou a demolir: o desenho inteiro é construção nova, e os dois lados são iguais. Selecione paredes, aberturas, estrutura ou mobiliário e use Arquitetura › Reforma para marcar a fase.
        </p>
      )}

      {caixa && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <MiniPlanta model={model} levelId={nivel} caixa={caixa} titulo="Antes — existente e a demolir (vermelho tracejado)" ocultos={ocultosAntes} fases={fases} altura={360} />
          <MiniPlanta model={model} levelId={nivel} caixa={caixa} titulo="Depois — existente (cinza) e novo" ocultos={ocultosDepois} fases={fases} altura={360} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {([
          ['DEMOLIR', resumo.demolicao, 'border-red-200 bg-red-50 text-red-900'],
          ['EXISTENTE', resumo.existente, 'border-slate-200 bg-slate-50 text-slate-800'],
          ['NOVO', resumo.novo, 'border-blue-200 bg-blue-50 text-blue-900'],
        ] as const).map(([fase, texto, classe]) => (
          <div key={fase} className={`rounded-[10px] border p-3 text-sm ${classe}`} data-testid={`resumo-${fase.toLowerCase()}`}>
            <p className="flex items-center gap-1.5 font-semibold"><Hammer className="h-3.5 w-3.5" /> {ROTULO_DA_FASE[fase]}</p>
            <p className="mt-1 text-xs">{texto}</p>
            {porFase(fase).length > 0 && fase !== 'NOVO' && (
              <button type="button" onClick={() => onSelecionar(porFase(fase).map((p) => p.id))} className="mt-2 text-xs font-medium underline" data-testid={`selecionar-${fase.toLowerCase()}`}>
                Selecionar as {porFase(fase).length} peça(s) no desenho
              </button>
            )}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-500">
        Os quantitativos e o orçamento contam só o que é <strong>novo</strong>; o que se demole sai nas medidas <code>Demolição — …</code> do orçamento (área e volume de alvenaria, esquadrias a remover, concreto). O existente não entra em nenhum dos dois.
      </p>
    </div>
  );
}
