/**
 * INCÊNDIO E10 (01/10/2026) — o GERADOR DE PPCI na gaveta: gerar a prévia
 * (as etapas, o que cada uma lança e o relatório do que não decidiu), lançar
 * tudo num lote só (um Ctrl+Z) e baixar o relatório.
 */
import React from 'react';
import { FileDown, Wand2 } from 'lucide-react';
import { ROTULO_DA_PENDENCIA, type GrupoDaPendencia, type PlanoDoPpci, type SituacaoDaEtapa } from '../../utils/blueprintGeradorPpci';
import type { Command } from '../../utils/blueprintKernel';
import { ROTULO_DA_ALIMENTACAO, ROTULO_DO_ARRANJO, type AlimentacaoDaRede, type ArranjoDaReserva } from '../../utils/blueprintCasaDeBombas';

const COR_DA_SITUACAO: Record<SituacaoDaEtapa, string> = {
  LANCOU: 'text-emerald-700',
  NADA_A_FAZER: 'text-slate-500',
  NAO_EXIGIDA: 'text-slate-400',
  NAO_RODOU: 'text-amber-700',
  CALCULOU: 'text-sky-700',
};
const ROTULO_DA_SITUACAO: Record<SituacaoDaEtapa, string> = { LANCOU: 'lança', NADA_A_FAZER: 'nada a fazer', NAO_EXIGIDA: 'não exigida', NAO_RODOU: 'não rodou', CALCULOU: 'calcula' };
const ORDEM: GrupoDaPendencia[] = ['VERIFICACAO', 'PREMISSA', 'SEM_SOLUCAO', 'CONFLITO', 'NAO_DECIDIDO', 'CONFERIR'];

/**
 * O que a gaveta mostra de QUALQUER gerador (10/10/2026: o de climatização, E11,
 * usa a mesma gaveta): o lote, as etapas e o relatório. O `PlanoDoPpci` cabe aqui.
 */
export interface PlanoDoGerador {
  comandos: readonly Command[];
  etapas: readonly { id: string; rotulo: string; situacao: SituacaoDaEtapa; comandos: number; nota: string | null }[];
  pendencias: PlanoDoPpci['pendencias'];
}

export interface GeradorPpciNoPainel {
  plano: PlanoDoGerador | null;
  gerando: boolean;
  onGerar: () => void;
  /** A trava antes de gravar: o lote recria os mesmos ids no desenho atual? */
  prova: { ok: true } | { ok: false; motivo: string } | null;
  onLancar: () => void;
  /** O que aconteceu no último lançamento. */
  lancado: string | null;
  onBaixar: (formato: 'pdf' | 'docx') => void;
  /** Fase B (D-3): o arranjo da fonte e da reserva — premissas do estudo. */
  arranjo?: {
    alimentacao: AlimentacaoDaRede;
    reserva: ArranjoDaReserva;
    /** Quantas bombas de incêndio com curva o catálogo da organização tem (0 = a bomba entra sem curva). */
    bombasNoCatalogo: number;
    onMudar: (patch: { alimentacao?: AlimentacaoDaRede; reserva?: ArranjoDaReserva }) => void;
  };
}

export default function PainelGeradorPpci({ g, testId = 'gerador-ppci' }: { g: GeradorPpciNoPainel; testId?: string }) {
  const p = g.plano;
  const motivoDeLancar = !p ? 'Gere a prévia primeiro' : p.comandos.length === 0 ? 'O gerador não tem nada a lançar' : g.prova && !g.prova.ok ? g.prova.motivo : undefined;
  const [aberto, setAberto] = React.useState<GrupoDaPendencia | null>('VERIFICACAO');
  return (
    <div className="space-y-3" data-testid={testId}>
      {g.arranjo && (
        <div className="grid grid-cols-1 gap-1.5 text-xs text-slate-600" data-testid="ppci-arranjo">
          <label className="flex items-center justify-between gap-2">
            <span>Alimentação da rede</span>
            <select value={g.arranjo.alimentacao} onChange={(e) => g.arranjo!.onMudar({ alimentacao: e.target.value as AlimentacaoDaRede })} aria-label="Alimentação da rede" className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs">
              {(['BOMBA', 'GRAVIDADE'] as const).map((x) => (
                <option key={x} value={x}>
                  {ROTULO_DA_ALIMENTACAO[x]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>Reserva técnica</span>
            <select value={g.arranjo.reserva} onChange={(e) => g.arranjo!.onMudar({ reserva: e.target.value as ArranjoDaReserva })} aria-label="Reserva técnica" className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs">
              {(['PROPRIA', 'PARCELA'] as const).map((x) => (
                <option key={x} value={x}>
                  {ROTULO_DO_ARRANJO[x]}
                </option>
              ))}
            </select>
          </label>
          {g.arranjo.alimentacao === 'BOMBA' && (
            <p className="text-[11px] text-slate-500">
              {g.arranjo.bombasNoCatalogo
                ? `${g.arranjo.bombasNoCatalogo} bomba(s) de incêndio no catálogo — o gerador escolhe a que atende o ponto de projeto.`
                : 'Nenhuma bomba de incêndio no catálogo: a bomba entra sem curva, e o relatório diz o ponto de projeto.'}
            </p>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={g.onGerar}
        disabled={g.gerando}
        title={g.gerando ? 'Gerando a prévia…' : undefined}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
      >
        <Wand2 className="h-3.5 w-3.5" />
        {g.gerando ? 'Gerando…' : p ? 'Gerar a prévia de novo' : 'Gerar a prévia'}
      </button>
      {g.lancado && <p className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-sm text-emerald-800">{g.lancado}</p>}

      {p && (
        <>
          <ul className="space-y-1" data-testid="ppci-etapas">
            {p.etapas.map((e) => (
              <li key={e.id} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 text-slate-700">{e.rotulo}</span>
                <span className={`shrink-0 text-xs ${COR_DA_SITUACAO[e.situacao]}`}>
                  {ROTULO_DA_SITUACAO[e.situacao]}
                  {e.comandos > 0 ? ` · ${e.comandos}` : ''}
                </span>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={g.onLancar}
            disabled={!!motivoDeLancar}
            title={motivoDeLancar}
            className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Lançar tudo ({p.comandos.length} comando{p.comandos.length === 1 ? '' : 's'}) — um Ctrl+Z desfaz
          </button>
          {motivoDeLancar && p.comandos.length > 0 && <p className="text-xs text-amber-700">{motivoDeLancar}</p>}

          <div data-testid="ppci-pendencias">
            <p className="text-sm font-medium text-slate-600">Relatório ({p.pendencias.length})</p>
            {ORDEM.map((grupo) => {
              const lista = p.pendencias.filter((x) => x.grupo === grupo);
              if (!lista.length) return null;
              return (
                <div key={grupo} className="mt-1">
                  <button type="button" onClick={() => setAberto(aberto === grupo ? null : grupo)} className="w-full text-left text-xs font-medium text-slate-600 hover:text-slate-800">
                    {aberto === grupo ? '▾' : '▸'} {ROTULO_DA_PENDENCIA[grupo]} ({lista.length})
                  </button>
                  {aberto === grupo && (
                    <ul className="mt-0.5 space-y-0.5">
                      {lista.map((x, i) => (
                        <li key={i} className={`break-words text-xs ${grupo === 'VERIFICACAO' || grupo === 'SEM_SOLUCAO' || grupo === 'CONFLITO' ? 'text-red-700' : 'text-slate-600'}`}>
                          {x.texto}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
            {!p.pendencias.some((x) => x.grupo === 'VERIFICACAO') && <p className="mt-1 text-xs text-emerald-700">Nenhuma verificação em falta no resultado.</p>}
          </div>

          <div className="flex gap-2">
            {(['pdf', 'docx'] as const).map((f) => (
              <button key={f} type="button" onClick={() => g.onBaixar(f)} className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 transition-colors hover:text-blue-900">
                <FileDown className="h-3 w-3" />
                Relatório {f.toUpperCase()}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
