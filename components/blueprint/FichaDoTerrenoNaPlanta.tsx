/**
 * Planta › Terreno › Dados do lote › "Ficha do empreendimento": os números do lote DESENHADO
 * lado a lado com a ficha (Empreendimento › Torres & Unidades › Terreno).
 *
 * Pedido de 21/10/2026 — "devem ser sincronizadas com planta inteligente > terreno > dados do
 * lote" — com as decisões do usuário: os dois lados mostram o número do outro e a pessoa escolhe;
 * a Planta conta o desenhado; profundidade = média das laterais. "Levar à ficha" grava o desenho
 * na ficha (com confirmação no editor); o caminho inverso é "Criar o lote digitando", que já nasce
 * com as medidas da ficha. Plano: docs/planos/2026-10-21-terreno-ficha-planta.md.
 */
import React from 'react';
import { Save } from 'lucide-react';
import type { LinhaDaComparacao, SituacaoDoCampo } from '../../utils/blueprintTerrenoDaFicha';

export interface FichaNoPainel {
  /** Nome do empreendimento. */
  nome: string;
  /** `true` = o vinculado à planta; `false` = o escolhido na zona urbanística (planta sem vínculo). */
  vinculado: boolean;
  linhas: LinhaDaComparacao[];
  /** Por que "Levar à ficha" está desligado; `null` = pode levar. */
  motivoSemLevar: string | null;
  /** O que foi preenchido sozinho na ficha nesta abertura (só campos que estavam vazios). */
  avisoAutomatico: string | null;
}

const SITUACAO: Record<SituacaoDoCampo, { texto: string; cor: string }> = {
  IGUAL: { texto: 'Igual', cor: 'text-emerald-700' },
  DIFERENTE: { texto: 'Diferente', cor: 'text-amber-700' },
  SO_PLANTA: { texto: 'Só na planta', cor: 'text-blue-700' },
  SO_FICHA: { texto: 'Só na ficha', cor: 'text-gray-600' },
  NENHUM: { texto: '—', cor: 'text-gray-400' },
};

const valor = (v: number | null, unidade: string) =>
  v === null ? '—' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${unidade}`;

const TH = 'px-3 py-2 border-r border-gray-100 last:border-r-0 text-left';
const TD = 'px-3 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal';

export default function FichaDoTerrenoNaPlanta({
  ficha,
  onLevar,
  gravando = false,
  erro = null,
}: {
  ficha: FichaNoPainel;
  onLevar: () => void;
  gravando?: boolean;
  erro?: string | null;
}) {
  const motivo = gravando ? 'Gravando…' : ficha.motivoSemLevar;
  return (
    <div className="mt-3 border-t border-slate-200 pt-3" data-testid="ficha-do-terreno">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-xs font-medium text-slate-700">
          Ficha do empreendimento ·{' '}
          <span className="font-normal text-slate-600" title={ficha.nome}>
            {ficha.nome}
          </span>
          {!ficha.vinculado && <span className="font-normal text-slate-500"> (escolhido na zona urbanística)</span>}
        </p>
        <button
          type="button"
          disabled={!!motivo}
          title={motivo ?? 'Grava na ficha as medidas desenhadas (mostra antes e depois para confirmar)'}
          onClick={onLevar}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          {gravando ? 'Gravando…' : 'Levar à ficha'}
        </button>
      </div>

      <div className="mt-1.5 overflow-x-auto rounded-[10px] border border-gray-100">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-gray-200 bg-white text-xs font-semibold text-gray-700">
              <th className={TH}>Medida</th>
              <th className={TH}>Planta (desenho)</th>
              <th className={TH}>Ficha</th>
              <th className={TH}>Situação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {ficha.linhas.map((l) => (
              <tr key={l.campo} data-campo={l.campo}>
                <td className={`${TD} text-gray-700`}>{l.rotulo}</td>
                <td className={`${TD} text-gray-600`}>{valor(l.planta, l.unidade)}</td>
                <td className={`${TD} text-gray-600`}>{valor(l.ficha, l.unidade)}</td>
                <td className={`${TD} ${SITUACAO[l.situacao].cor}`}>{SITUACAO[l.situacao].texto}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ficha.avisoAutomatico && (
        <p className="mt-1.5 text-xs text-slate-500" data-testid="ficha-preenchida-sozinha">
          {ficha.avisoAutomatico}
        </p>
      )}
      <p className="mt-1.5 text-xs text-slate-500">
        A planta conta o desenho; profundidade é a média das laterais. Para levar a ficha à planta, use “Criar o lote
        digitando”.
      </p>
      {erro && (
        <p className="mt-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">Não deu para gravar: {erro}</p>
      )}
    </div>
  );
}
