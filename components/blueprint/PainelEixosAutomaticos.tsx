import React from 'react';
import type { DistanciaDosEixos, HipotesesDeEixos, PropostaDeEixos } from '../../utils/blueprintEixosAutomaticos';

/**
 * A GAVETA "Eixos automáticos" (07/10/2026) — *"veja que também tem eixos identificados com números e letras"*.
 *
 * O corpo da gaveta: as hipóteses (as três distâncias, editáveis — folga de projeto nunca fica escondida), o aviso de
 * que os eixos valem para os Pilares automáticos e a prévia em tabela. O botão "Criar N eixos" mora no rodapé da
 * gaveta, com o motivo quando desligado. O cálculo é `propostaDeEixos` (`utils/blueprintEixosAutomaticos.ts`).
 */
export interface PainelEixosAutomaticosProps {
  proposta: PropostaDeEixos;
  hipoteses: HipotesesDeEixos;
  onHipotese: (campo: DistanciaDosEixos, valorMm: number) => void;
  /** "Usar o lote" — lados, recuos, restrições e divisas (08/10/2026). */
  onUsarLadosDoLote: (ligado: boolean) => void;
  /** "Renumerar os existentes" (08/10/2026). */
  onRenumerar: (ligado: boolean) => void;
  /** Recolhe a gaveta para ver a prévia tracejada no desenho. */
  onVerPrevia: () => void;
  resultado: { ok: boolean; texto: string } | null;
}

const metros = (mm: number) => (mm / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ORIGEM: Record<PropostaDeEixos['eixos'][number]['origem'], string> = {
  PAREDE: 'Parede',
  BLOCO: 'Bloco de massa',
  PAREDE_E_BLOCO: 'Parede e bloco',
  LOTE: 'Lado do lote',
  RECUO: 'Recuo',
  RESTRICAO: 'Faixa de restrição',
  DIVISA: 'Divisa',
  EXISTENTE: 'Já existe',
};

export default function PainelEixosAutomaticos({ proposta, hipoteses, onHipotese, onUsarLadosDoLote, onRenumerar, onVerPrevia, resultado }: PainelEixosAutomaticosProps) {
  const campo = 'w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs';
  const numero = (k: DistanciaDosEixos, emMm: number, rotulo: string, unidade: 'm' | 'cm', title: string) => {
    const fator = unidade === 'm' ? 1000 : 10;
    return (
      <label className="flex items-center gap-2" title={title}>
        {rotulo}
        <input
          type="number"
          min={0}
          step={unidade === 'm' ? 0.5 : 5}
          value={emMm / fator}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (e.target.value !== '' && Number.isFinite(v) && v >= 0) onHipotese(k, Math.round(v * fator));
          }}
          aria-label={`${rotulo} (${unidade})`}
          className={campo}
        />
        <span className="text-slate-500">{unidade}</span>
      </label>
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <p className="font-semibold text-slate-700">Hipóteses da malha</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>
            Um eixo no <strong>eixo de cada parede</strong> horizontal ou vertical do pavimento e nos lados dos{' '}
            <strong>blocos de massa</strong>. Parede oblíqua fica de fora. Sem parede nem bloco, os{' '}
            <strong>lote</strong>: os lados, a linha de cada <strong>recuo</strong>, as faixas de restrição e as divisas (se
            ligado abaixo).
          </li>
          <li>
            <strong>Letras nos verticais</strong> (A, B… da esquerda para a direita) e <strong>números nos horizontais</strong>{' '}
            (1, 2… de cima para baixo). Linha que já tem eixo não ganha outro; com <strong>Renumerar</strong>, os existentes
            de nome automático são renomeados para a sequência ficar em ordem.
          </li>
          <li>
            Os eixos são de verdade: editáveis, e os <strong>Pilares automáticos</strong> passam a usar os cruzamentos deles.
          </li>
        </ul>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          {numero('alemDoDesenhoMm', hipoteses.alemDoDesenhoMm, 'Além do desenho', 'm', 'Quanto cada eixo passa além do desenho (edificação e lote), de cada lado — para a bolha com o nome cair por fora das cotas.')}
          {numero('comprimentoMinimoDaParedeMm', hipoteses.comprimentoMinimoDaParedeMm, 'Parede mínima', 'm', 'Parede (ou lado de bloco) mais curta que isto não gera eixo — a mureta e o trecho curto não definem malha.')}
          {numero('juntarAMenosDeMm', hipoteses.juntarAMenosDeMm, 'Juntar linhas a menos de', 'cm', 'Duas linhas paralelas mais próximas que isto viram um eixo só (fica a posição da parede mais comprida).')}
          <label
            className="flex items-center gap-2"
            title="Para o estudo que só tem o lote: sem parede nem bloco no pavimento, um eixo em cada lado horizontal ou vertical do lote fechado. Com edificação desenhada, o lote não entra — a malha é da estrutura."
          >
            <input type="checkbox" checked={hipoteses.usarLadosDoLote} onChange={(e) => onUsarLadosDoLote(e.target.checked)} aria-label="Usar o lote (lados, recuos e restrições) sem paredes nem blocos" />
            Usar o lote — lados, recuos e restrições (sem paredes nem blocos)
          </label>
          <label
            className="flex items-center gap-2"
            title="Com eixos já criados, os novos entram na posição certa e os existentes de nome automático (A, B… / 1, 2…) são renomeados para a sequência continuar em ordem. Nome dado à mão fica como está."
          >
            <input type="checkbox" checked={hipoteses.renumerar} onChange={(e) => onRenumerar(e.target.checked)} aria-label="Renumerar os eixos existentes para manter a ordem" />
            Renumerar os existentes para manter a ordem
          </label>
          {proposta.novos > 0 && (
            <button
              type="button"
              onClick={onVerPrevia}
              title="Recolhe a gaveta para ver os eixos propostos, tracejados em azul, sobre o desenho"
              className="rounded-[6px] border border-blue-300 bg-white px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
            >
              Ver prévia no desenho
            </button>
          )}
        </div>
      </div>

      {proposta.novos + proposta.renomeados === 0 ? (
        <p className="text-sm text-slate-500">{proposta.motivoVazio}</p>
      ) : (
        <table className="w-full table-fixed text-xs" aria-label="Prévia dos eixos">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="w-14 py-1.5 pr-2 font-medium">Eixo</th>
              <th className="w-24 py-1.5 pr-2 font-medium">Direção</th>
              <th className="w-28 py-1.5 pr-2 text-right font-medium">Posição (m)</th>
              <th className="py-1.5 pl-4 font-medium">Origem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {proposta.eixos.map((e) => (
              <tr key={e.existenteId ?? `${e.vertical ? 'v' : 'h'}${e.coordenadaMm}`}>
                <td className={`py-1.5 pr-2 font-medium ${e.existenteId ? 'text-slate-500' : 'text-slate-700'}`}>{e.nome}</td>
                <td className="py-1.5 pr-2 text-slate-600">{e.vertical ? 'Vertical' : 'Horizontal'}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600">
                  {e.vertical ? 'x' : 'y'} = {metros(e.coordenadaMm)}
                </td>
                <td className="py-1.5 pl-4 text-slate-600">
                  {ORIGEM[e.origem]}
                  {e.nomeAnterior !== undefined ? ` — era ${e.nomeAnterior}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(proposta.paredesObliquas > 0 || proposta.paredesCurtas > 0 || proposta.jaTinhamEixo > 0) && (
        <p className="text-xs text-slate-500">
          {[
            proposta.jaTinhamEixo > 0 ? `${proposta.jaTinhamEixo} linha(s) já tinham eixo` : null,
            proposta.paredesCurtas > 0 ? `${proposta.paredesCurtas} parede(s) abaixo da parede mínima` : null,
            proposta.paredesObliquas > 0 ? `${proposta.paredesObliquas} parede(s) oblíqua(s) fora da malha` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          .
        </p>
      )}

      {resultado && (
        <p className={`text-sm ${resultado.ok ? 'text-emerald-700' : 'text-red-600'}`} role="status">
          {resultado.texto}
        </p>
      )}
    </div>
  );
}
