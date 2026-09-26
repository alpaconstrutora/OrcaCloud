/**
 * CONFERÊNCIA DO LOTEAMENTO (B2) — o que a prefeitura vai olhar, antes de ela
 * olhar: área e testada mínimas, lote encravado, número repetido e o percentual
 * de áreas públicas.
 *
 * ⚠️ Só ACUSA. Nada trava o desenho: projeto em andamento passa por estados
 * inválidos o tempo todo, e travar o desenho por causa disso seria impedir o
 * trabalho em vez de ajudar.
 */
import React from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { AvisoDoLoteamento, RegrasDoLoteamento } from '../../utils/blueprintLoteamento';
import { resumoDaConferencia, AREA_MINIMA_LEI_6766_M2, TESTADA_MINIMA_LEI_6766_MM } from '../../utils/blueprintLoteamento';

interface Props {
  avisos: AvisoDoLoteamento[];
  regras: RegrasDoLoteamento;
  /** De onde vieram os mínimos: a zona do estudo ou o piso da lei federal. */
  origemDasRegras: { area: 'ZONA' | 'LEI'; testada: 'ZONA' | 'LEI' };
  totalDeLotes: number;
  onSelecionar: (loteId: string) => void;
}

export default function PainelConferenciaDoLoteamento({ avisos, regras, origemDasRegras, totalDeLotes, onSelecionar }: Props) {
  const { erros, atencoes } = resumoDaConferencia(avisos);
  const m = (v: number) => v.toFixed(2).replace('.', ',');
  const informativos = avisos.filter((a) => a.gravidade === 'OK');
  const problemas = avisos.filter((a) => a.gravidade !== 'OK');

  return (
    <div className="space-y-4 text-xs text-slate-700" data-testid="conferencia-do-loteamento">
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
        <p className="font-medium text-slate-800">
          {totalDeLotes} lote{totalDeLotes === 1 ? '' : 's'} conferido{totalDeLotes === 1 ? '' : 's'}
        </p>
        <p className="mt-1 text-slate-600">
          Área mínima {m(regras.areaMinimaM2)} m² e testada mínima {m(regras.testadaMinimaMm / 1000)} m
          {origemDasRegras.area === 'ZONA' || origemDasRegras.testada === 'ZONA' ? ' (da zona do estudo)' : ' (piso da Lei 6.766/79, art. 4º, II)'}.
        </p>
        {origemDasRegras.area === 'LEI' && origemDasRegras.testada === 'LEI' && (
          <p className="mt-1 text-slate-500">
            A lei municipal quase sempre exige mais que os {AREA_MINIMA_LEI_6766_M2} m² e{' '}
            {m(TESTADA_MINIMA_LEI_6766_MM / 1000)} m federais. Informe na zona do estudo para conferir pelo que vale ali.
          </p>
        )}
      </div>

      {totalDeLotes === 0 ? (
        <p className="rounded-md bg-slate-50 px-3 py-2 text-slate-600">
          Nenhum lote desenhado ainda. Use <strong>Lotear quadra</strong> ou a ferramenta <strong>Lote</strong>.
        </p>
      ) : problemas.length === 0 ? (
        <p className="flex items-start gap-2 rounded-md bg-emerald-50 px-3 py-2 text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Nenhum problema. Todos os lotes passam na área, na testada e têm frente para via.</span>
        </p>
      ) : (
        <>
          <p className="text-slate-600">
            {erros} erro{erros === 1 ? '' : 's'}
            {atencoes > 0 && <> · {atencoes} atenção{atencoes === 1 ? '' : 'ões'}</>}
          </p>
          <ul className="space-y-1">
            {problemas.map((a, i) => (
              <li key={`${a.regra}-${a.loteId ?? 'geral'}-${i}`}>
                <button
                  type="button"
                  onClick={() => a.loteId && onSelecionar(a.loteId)}
                  disabled={!a.loteId}
                  title={a.loteId ? 'Selecionar no desenho' : undefined}
                  className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left ${
                    a.gravidade === 'ERRO' ? 'bg-rose-50 text-rose-800' : 'bg-amber-50 text-amber-800'
                  } ${a.loteId ? 'hover:brightness-95' : 'cursor-default'}`}
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <strong>{a.rotulo}</strong> · {a.texto}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {informativos.map((a, i) => (
        <p key={`info-${i}`} className="flex items-start gap-2 rounded-md bg-slate-50 px-3 py-2 text-slate-700">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{a.texto}</span>
        </p>
      ))}
    </div>
  );
}
