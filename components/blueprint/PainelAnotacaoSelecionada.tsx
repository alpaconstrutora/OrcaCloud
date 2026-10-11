/**
 * Painel da ANOTAÇÃO selecionada (19/09/2026, E8.1): texto (multilinha),
 * altura do texto (mm do modelo), traço, padrão de hachura, giro do texto,
 * cor; a cota angular mostra o ângulo derivado; vértices editáveis um a um.
 */
import React from 'react';
import {
  anguloDaCota,
  PADROES_DE_HACHURA,
  ROTULO_DO_TIPO_DE_ANOTACAO,
  TRACOS_DA_ANOTACAO,
  type Anotacao,
  type HachuraDaCamada,
  type PadraoDeHachura,
  type PlanoDaAnotacao,
  type TracoDaAnotacao,
} from '../../utils/blueprintKernel';
import { ordemAoMover } from '../../utils/blueprintAnotacoes';
import IdentificadorDoElemento from './IdentificadorDoElemento';
import CampoDeHachura from './CampoDeHachura';

interface Props {
  anotacao: Anotacao | null;
  /** F7: as anotações do desenho — a ORDEM é relativa às da mesma vista. */
  todas?: readonly Anotacao[];
  onProps: (campos: {
    pontos?: { x: number; y: number }[];
    texto?: string | null;
    alturaMm?: number;
    traco?: TracoDaAnotacao;
    hachura?: PadraoDeHachura | null;
    rotacaoGraus?: number;
    cor?: string | null;
    revisao?: { numero: number; data: string };
    /** F7 (0.97.0): `null` remove. */
    material?: HachuraDaCamada | null;
    fundo?: string | null;
    tracejadoMm?: [number, number] | null;
    plano?: PlanoDaAnotacao | null;
    ordem?: number | null;
  }) => void;
  onExcluir: () => void;
}

const ROTULO_TRACO: Record<TracoDaAnotacao, string> = { CONTINUO: 'Contínuo', TRACEJADO: 'Tracejado', PONTILHADO: 'Pontilhado' };
const ROTULO_HACHURA: Record<PadraoDeHachura, string> = { DIAGONAL: 'Diagonal 45°', CRUZADA: 'Cruzada', PONTOS: 'Pontos', SOLIDA: 'Sólida (translúcida)' };
const nomeDaVista = (a: Anotacao) => (a.vista.tipo === 'PLANTA' ? 'planta' : a.vista.tipo === 'CORTE' ? 'corte' : `elevação ${a.vista.direcao.toLowerCase().replace('_', ' ')}`);

export default function PainelAnotacaoSelecionada({ anotacao: a, todas = [], onProps, onExcluir }: Props) {
  if (!a) return null;
  // F7: o que os botoes de ordem gravariam; null = nao ha o que fazer (o botao diz por que).
  const paraFrente = ordemAoMover(todas, a, 'FRENTE');
  const paraTras = ordemAoMover(todas, a, 'TRAS');
  const campo = 'rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-800';
  const temTexto = a.tipo === 'TEXTO' || a.tipo === 'LEADER' || a.tipo === 'HACHURA' || a.tipo === 'NUVEM';
  const angulo = anguloDaCota(a);
  return (
    <div className="border-b border-slate-200 px-4 py-3" data-testid="painel-anotacao">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-slate-700">{ROTULO_DO_TIPO_DE_ANOTACAO[a.tipo]}</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">
            na {nomeDaVista(a)} · {a.pontos.length} ponto(s) · texto {a.alturaMm} mm
            {angulo != null && <> · <strong data-testid="angulo-da-cota">{angulo.toFixed(1).replace('.', ',')}°</strong> (derivado)</>}
          </p>
          <IdentificadorDoElemento uid={a.uid} familia="anotacao" />
        </div>
        <button type="button" onClick={onExcluir} className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-red-50 hover:text-red-700">
          Excluir
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-semibold text-slate-500">
        {a.tipo === 'NUVEM' && a.revisao && (
          <>
            <label className="flex flex-col gap-1">
              Revisão nº
              <input type="number" key={`${a.id}-rn`} defaultValue={a.revisao.numero} min={1} step={1} aria-label="Número da revisão da nuvem" onBlur={(e) => Number(e.target.value) >= 1 && onProps({ revisao: { numero: Math.round(Number(e.target.value)), data: a.revisao!.data } })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={campo} data-testid="nuvem-revisao-numero" />
            </label>
            <label className="flex flex-col gap-1">
              Data da revisão
              <input type="date" key={`${a.id}-rd`} defaultValue={a.revisao.data} aria-label="Data da revisão da nuvem" onBlur={(e) => /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) && onProps({ revisao: { numero: a.revisao!.numero, data: e.target.value } })} className={campo} data-testid="nuvem-revisao-data" />
            </label>
          </>
        )}
        {temTexto && (
          <label className="col-span-2 flex flex-col gap-1">
            {a.tipo === 'NUVEM' ? 'Descrição da alteração (sai na tabela de revisões)' : `Texto${a.tipo === 'HACHURA' ? ' (rótulo, opcional)' : ''}`}
            <textarea key={`${a.id}-t`} defaultValue={a.texto ?? ''} rows={2} maxLength={500} aria-label="Texto da anotação" onBlur={(e) => onProps({ texto: e.target.value })} className={`${campo} resize-y`} />
          </label>
        )}
        <label className="flex flex-col gap-1">
          Altura do texto (mm)
          <input type="number" key={`${a.id}-h`} defaultValue={a.alturaMm} min={50} step={50} aria-label="Altura do texto da anotação (mm)" onBlur={(e) => Number(e.target.value) > 0 && onProps({ alturaMm: Number(e.target.value) })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          Traço
          <select value={a.traco} onChange={(e) => onProps({ traco: e.target.value as TracoDaAnotacao })} aria-label="Traço da anotação" className={campo}>
            {TRACOS_DA_ANOTACAO.map((t) => (
              <option key={t} value={t}>{ROTULO_TRACO[t]}</option>
            ))}
          </select>
        </label>
        {a.tipo === 'HACHURA' && (
          <label className="flex flex-col gap-1">
            Padrão
            <select value={a.hachura ?? 'DIAGONAL'} onChange={(e) => onProps({ hachura: e.target.value as PadraoDeHachura })} aria-label="Padrão da hachura" className={campo}>
              {PADROES_DE_HACHURA.map((h) => (
                <option key={h} value={h}>{ROTULO_HACHURA[h]}</option>
              ))}
            </select>
          </label>
        )}
        {a.tipo === 'HACHURA' && (
          <>
            {/* F7: o MATERIAL (padrões da F6, com escala e giro) — quando escolhido, vale no lugar do padrão acima. */}
            <div className="col-span-2 flex flex-col gap-1">
              Material (escala e giro)
              <CampoDeHachura hachura={a.material} onMudar={(h) => onProps({ material: h ?? null })} rotulo="da região" />
            </div>
            {/* F7: FUNDO OPACO — o tapete com fundo branco do vídeo; o "Sólida" acima é translúcido.
                ⚠️ Sem fundo, o seletor de cor NÃO aparece: ele mostraria branco e escolher branco não
                dispara mudança — o fundo branco (o caso do vídeo) nunca era gravado (prova no app). */}
            <div className="flex flex-col gap-1">
              Fundo
              {a.fundo ? (
                <span className="flex items-center gap-2">
                  <input type="color" value={a.fundo} onChange={(e) => onProps({ fundo: e.target.value })} aria-label="Cor do fundo da região" className="h-7 w-10 rounded border border-slate-300" />
                  <button type="button" onClick={() => onProps({ fundo: null })} className="text-[11px] font-normal text-slate-500 underline-offset-2 hover:underline">sem fundo</button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onProps({ fundo: '#ffffff' })}
                  title="Fundo opaco: cobre o que está por baixo (o piso); a cor se troca depois"
                  className="self-start rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Pôr fundo branco
                </button>
              )}
            </div>
          </>
        )}
        {a.traco === 'TRACEJADO' && (
          <label className="flex flex-col gap-1">
            Tracejado: traço × espaço (mm)
            <span className="flex items-center gap-1">
              {([0, 1] as const).map((k) => (
                <input
                  key={`${a.id}-tr${k}-${a.tracejadoMm?.[k] ?? ''}`}
                  type="number"
                  min={1}
                  step={10}
                  defaultValue={a.tracejadoMm?.[k] ?? ''}
                  placeholder={k === 0 ? 'traço' : 'espaço'}
                  aria-label={k === 0 ? 'Traço do tracejado (mm)' : 'Espaço do tracejado (mm)'}
                  onBlur={(e) => {
                    const v = Math.round(Number(e.target.value));
                    if (!(v > 0)) return;
                    const atual: [number, number] = a.tracejadoMm ?? [200, 80];
                    const novo: [number, number] = k === 0 ? [v, atual[1]] : [atual[0], v];
                    if (novo[0] !== a.tracejadoMm?.[0] || novo[1] !== a.tracejadoMm?.[1]) onProps({ tracejadoMm: novo });
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  className={`${campo} w-16`}
                />
              ))}
              {a.tracejadoMm && (
                <button type="button" onClick={() => onProps({ tracejadoMm: null })} className="text-[11px] font-normal text-slate-500 underline-offset-2 hover:underline">padrão</button>
              )}
            </span>
          </label>
        )}
        {a.tipo === 'TEXTO' && (
          <label className="flex flex-col gap-1">
            Giro (°)
            <select value={a.rotacaoGraus} onChange={(e) => onProps({ rotacaoGraus: Number(e.target.value) })} aria-label="Giro do texto" className={campo}>
              {[0, 90, 180, 270].map((g) => (
                <option key={g} value={g}>{g}°</option>
              ))}
              {![0, 90, 180, 270].includes(a.rotacaoGraus) && <option value={a.rotacaoGraus}>{a.rotacaoGraus}°</option>}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1">
          Cor
          <span className="flex items-center gap-2">
            <input type="color" value={a.cor ?? '#b45309'} onChange={(e) => onProps({ cor: e.target.value })} aria-label="Cor da anotação" className="h-7 w-10 rounded border border-slate-300" />
            {a.cor && (
              <button type="button" onClick={() => onProps({ cor: null })} className="text-[11px] font-normal text-slate-500 underline-offset-2 hover:underline">padrão</button>
            )}
          </span>
        </label>
      </div>
      {/* F7: ORDEM DE DESENHO. "Enviar para trás" leva a região para o plano de FUNDO — abaixo das
          paredes e dos móveis, o tapete que não cobre o sofá. Botão sem efeito diz por quê. */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!paraFrente}
          onClick={() => paraFrente && onProps({ plano: paraFrente.plano, ordem: paraFrente.ordem })}
          title={paraFrente ? 'Por cima das outras anotações desta vista' : 'Já está por cima de todas'}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Trazer para frente
        </button>
        <button
          type="button"
          disabled={!paraTras}
          onClick={() => paraTras && onProps({ plano: paraTras.plano, ordem: paraTras.ordem })}
          title={
            paraTras
              ? 'Para o FUNDO: abaixo das paredes e dos móveis'
              : a.tipo !== 'HACHURA'
                ? 'Só a região hachurada vai para o fundo (abaixo das paredes e dos móveis)'
                : 'Já está no fundo, abaixo de todas'
          }
          className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Enviar para trás
        </button>
        {a.plano === 'FUNDO' && <span className="text-[11px] text-slate-500">no fundo: abaixo das paredes e dos móveis</span>}
      </div>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-[11px] font-medium text-slate-500">Vértices ({a.pontos.length})</summary>
        <ul className="mt-1 space-y-1">
          {a.pontos.map((p, i) => (
            <li key={`${a.id}-${i}`} className="flex items-center gap-1 text-[11px] text-slate-600">
              <span className="w-4 text-right text-slate-400">{i + 1}</span>
              <input type="number" defaultValue={p.x} step={10} aria-label={`X do vértice ${i + 1}`} onBlur={(e) => onProps({ pontos: a.pontos.map((q, k) => (k === i ? { x: Number(e.target.value), y: q.y } : q)) })} className={`${campo} w-24`} />
              <input type="number" defaultValue={p.y} step={10} aria-label={`Y do vértice ${i + 1}`} onBlur={(e) => onProps({ pontos: a.pontos.map((q, k) => (k === i ? { x: q.x, y: Number(e.target.value) } : q)) })} className={`${campo} w-24`} />
              <span className="text-slate-400">mm</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
