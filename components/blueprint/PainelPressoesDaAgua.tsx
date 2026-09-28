/**
 * PRESSÃO NOS PONTOS (28/09/2026, E1.3 do roadmap hidrossanitário): a tabela
 * de cada rede de água — disponível, mínima, estática e o estado pela NBR
 * 5626:2020 — e as hipóteses do cálculo, editáveis (é o "simulador": mudar a
 * lâmina, a perda do aquecedor ou o ajuste da VRP refaz a conta na hora). O
 * cálculo é `utils/blueprintPressaoDaRede.ts`; aqui só se mostra.
 */
import React from 'react';
import { KPA_POR_MCA } from '../../utils/blueprintHidraulicaPressao';
import type { HipotesesDePressao, PressoesDaRede } from '../../utils/blueprintPressaoDaRede';

interface Props {
  pressoes: readonly PressoesDaRede[];
  nomeDaOrigem: (origemId: string) => string;
  hip: HipotesesDePressao;
  onHip: (h: HipotesesDePressao) => void;
  onSelecionar: (ids: string[]) => void;
}

const kpa = (v: number | null) => (v == null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kPa`);
const mca = (v: number | null) => (v == null ? '' : ` (${(v / KPA_POR_MCA).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mca)`);
const ESTADO: Record<string, { texto: string; cor: string }> = {
  OK: { texto: 'atende', cor: 'text-emerald-700' },
  INSUFICIENTE: { texto: 'insuficiente', cor: 'text-red-700' },
  EXCESSIVA: { texto: 'estática acima de 400', cor: 'text-amber-700' },
  NAO_AVALIADO: { texto: 'não avaliado', cor: 'text-slate-500' },
};

export default function PainelPressoesDaAgua({ pressoes, nomeDaOrigem, hip, onHip, onSelecionar }: Props) {
  const campo = (rotulo: string, chave: keyof HipotesesDePressao, sufixo: string, passo: number, aria: string) => (
    <label className="flex items-center gap-2">
      {rotulo}
      <input
        type="number"
        step={passo}
        min={0}
        value={hip[chave]}
        onChange={(e) => onHip({ ...hip, [chave]: Math.max(0, Number(e.target.value) || 0) })}
        aria-label={aria}
        className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums"
      />
      {sufixo}
    </label>
  );
  return (
    <div className="space-y-3" data-testid="pressoes-da-agua">
      <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <p className="font-semibold text-slate-700">Pressão nos pontos (NBR 5626:2020)</p>
        <p className="mt-1">
          Desnível da caixa menos as perdas no caminho — distribuída (Darcy-Weisbach, rugosidade do material) e localizada
          (conexões, registros, hidrômetro). Mínima de {hip.pressaoMinimaKpa} kPa (a da ficha quando o aparelho pede mais);
          estática até {hip.estaticaMaximaKpa} kPa.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          {campo('Lâmina d’água', 'laminaDaguaMm', 'mm', 50, 'Lâmina d’água acima do fundo da caixa, em mm')}
          {campo('Perda do aquecedor', 'perdaDoAquecedorKpa', 'kPa', 5, 'Perda de carga no aquecedor, em kPa')}
          {campo('Ajuste da VRP', 'ajusteDaVrpKpa', 'kPa', 10, 'Pressão a jusante da VRP, em kPa')}
          {campo('Qmáx do hidrômetro', 'qMaxDoHidrometroM3h', 'm³/h', 0.5, 'Vazão máxima do hidrômetro, em m³/h')}
        </div>
      </div>
      {pressoes.length === 0 && <p className="text-xs text-slate-500">Sem caixa d’água nem aquecedor no desenho — nada a calcular.</p>}
      {pressoes.map((r) => (
        <div key={r.origemId} className="space-y-1">
          <p className="text-xs font-semibold text-slate-700">
            {r.disciplina === 'AGUA_QUENTE' ? 'Água quente' : 'Água fria'} — {nomeDaOrigem(r.origemId)}
          </p>
          {r.motivo && <p className="text-xs text-slate-500">{r.motivo}</p>}
          {r.pontos.length > 0 && (
            <table className="w-full table-fixed text-xs" aria-label={`Pressões ${r.disciplina === 'AGUA_QUENTE' ? 'da água quente' : 'da água fria'}`}>
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-1.5 pr-2 font-medium">Ponto</th>
                  <th className="w-40 py-1.5 pr-2 font-medium">Disponível</th>
                  <th className="w-20 py-1.5 pr-2 font-medium">Mínima</th>
                  <th className="w-24 py-1.5 pr-2 font-medium">Estática</th>
                  <th className="w-32 py-1.5 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {r.pontos.map((p) => (
                  <tr key={p.terminalId}>
                    <td className="py-1.5 pr-2 text-slate-700">
                      <button type="button" className="text-left hover:underline" onClick={() => onSelecionar([p.terminalId])} title="Selecionar o ponto no desenho">
                        {p.nome}
                        {r.criticoId === p.terminalId ? ' · crítico' : ''}
                      </button>
                    </td>
                    <td className="py-1.5 pr-2 tabular-nums text-slate-600">{kpa(p.disponivelKpa)}{mca(p.disponivelKpa)}</td>
                    <td className="py-1.5 pr-2 tabular-nums text-slate-600">{kpa(p.minimaKpa)}</td>
                    <td className="py-1.5 pr-2 tabular-nums text-slate-600">{kpa(p.estaticaKpa)}</td>
                    <td className={`py-1.5 ${ESTADO[p.estado].cor}`} title={p.motivo}>{ESTADO[p.estado].texto}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  );
}
