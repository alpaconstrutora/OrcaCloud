/**
 * PRESSÃO NOS PONTOS (28/09/2026, E1.3 do roadmap hidrossanitário): a tabela
 * de cada rede de água — disponível, mínima, estática e o estado pela NBR
 * 5626:2020 — e as hipóteses do cálculo, editáveis (é o "simulador": mudar a
 * lâmina, a perda do aquecedor ou o ajuste da VRP refaz a conta na hora). O
 * cálculo é `utils/blueprintPressaoDaRede.ts`; aqui só se mostra.
 *
 * 14/10/2026: hipóteses recolhidas abaixo das tabelas; a pressão mínima e a
 * estática máxima (os limites da NBR 5626) viraram campos — o rótulo
 * "estática acima de N" lê a hipótese; campo numérico que só grava ao sair
 * (apagar a perda do aquecedor gravava 0 kPa); tabela no padrão de tabela em
 * drawer (§6.9/§6.11 do guia); sem rede, não aparece (a gaveta já diz que
 * falta a caixa d'água).
 */
import React from 'react';
import { KPA_POR_MCA } from '../../utils/blueprintHidraulicaPressao';
import type { HipotesesDePressao, PressoesDaRede } from '../../utils/blueprintPressaoDaRede';
import BlocoDeHipoteses from './BlocoDeHipoteses';
import CampoNumericoDeHipotese from './CampoNumericoDeHipotese';

interface Props {
  pressoes: readonly PressoesDaRede[];
  nomeDaOrigem: (origemId: string) => string;
  hip: HipotesesDePressao;
  onHip: (h: HipotesesDePressao) => void;
  onSelecionar: (ids: string[]) => void;
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const kpa = (v: number | null) => (v == null ? '—' : `${fmt(v)} kPa`);
const mca = (v: number | null) => (v == null ? '' : ` (${(v / KPA_POR_MCA).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mca)`);
const COR_DO_ESTADO: Record<string, string> = {
  OK: 'text-emerald-700',
  INSUFICIENTE: 'text-red-700',
  EXCESSIVA: 'text-amber-700',
  NAO_AVALIADO: 'text-gray-500',
};
const textoDoEstado = (estado: string, hip: HipotesesDePressao) =>
  estado === 'OK' ? 'atende' : estado === 'INSUFICIENTE' ? 'insuficiente' : estado === 'EXCESSIVA' ? `estática acima de ${fmt(hip.estaticaMaximaKpa)}` : 'não avaliado';

const TH = 'border-r border-gray-100 px-3 py-2';
const TD = 'border-r border-gray-100 px-3 py-2.5 text-sm font-normal';

export default function PainelPressoesDaAgua({ pressoes, nomeDaOrigem, hip, onHip, onSelecionar }: Props) {
  if (pressoes.length === 0) return null;
  const campo = (rotulo: string, chave: keyof HipotesesDePressao, sufixo: string, passo: number, aria: string, extra: { casas?: number; min?: number; max?: number; title?: string } = {}) => (
    <label className="flex items-center gap-2">
      {rotulo}
      <CampoNumericoDeHipotese value={hip[chave]} onCommit={(v) => onHip({ ...hip, [chave]: v })} min={extra.min ?? 0} max={extra.max} step={passo} casas={extra.casas} aria-label={aria} title={extra.title} />
      {sufixo}
    </label>
  );
  return (
    <div className="space-y-3" data-testid="pressoes-da-agua">
      <p className="text-xs font-semibold text-slate-700">Pressão nos pontos (NBR 5626:2020)</p>
      {pressoes.map((r) => (
        <div key={r.origemId} className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-700">
            {r.disciplina === 'AGUA_QUENTE' ? 'Água quente' : 'Água fria'} — {nomeDaOrigem(r.origemId)}
          </p>
          {r.motivo && <p className="text-xs text-slate-500">{r.motivo}</p>}
          {r.avisos.map((a, i) => (
            <p key={i} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">{a}</p>
          ))}
          {r.pontos.length > 0 && (
            <div className="overflow-x-auto rounded-[10px] border border-gray-100">
              <table className="w-full table-fixed border-collapse text-left" aria-label={`Pressões ${r.disciplina === 'AGUA_QUENTE' ? 'da água quente' : 'da água fria'}`}>
                <thead>
                  <tr className="border-b border-gray-200 bg-white text-xs font-semibold text-gray-700">
                    <th className={TH}>Ponto</th>
                    <th className={`w-44 text-right ${TH}`}>Disponível</th>
                    <th className={`w-20 text-right ${TH}`}>Mínima</th>
                    <th className={`w-24 text-right ${TH}`}>Estática</th>
                    <th className="w-36 px-3 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {r.pontos.map((p) => (
                    <tr key={p.terminalId}>
                      <td className={`text-gray-700 ${TD}`}>
                        <button type="button" className="block w-full truncate text-left hover:underline" onClick={() => onSelecionar([p.terminalId])} title="Selecionar o ponto no desenho">
                          {p.nome}
                          {r.criticoId === p.terminalId ? ' · crítico' : ''}
                        </button>
                      </td>
                      <td className={`text-right tabular-nums text-gray-600 ${TD}`}>{kpa(p.disponivelKpa)}{mca(p.disponivelKpa)}</td>
                      <td className={`text-right tabular-nums text-gray-600 ${TD}`}>{kpa(p.minimaKpa)}</td>
                      <td className={`text-right tabular-nums text-gray-600 ${TD}`}>{kpa(p.estaticaKpa)}</td>
                      <td className={`px-3 py-2.5 text-sm font-normal ${COR_DO_ESTADO[p.estado]}`} title={p.motivo}>
                        {textoDoEstado(p.estado, hip)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
      <BlocoDeHipoteses
        id="pressao"
        titulo="Hipóteses da pressão"
        resumo={[
          `mín. ${fmt(hip.pressaoMinimaKpa)} kPa`,
          `estática ≤ ${fmt(hip.estaticaMaximaKpa)} kPa`,
          `lâmina ${fmt(hip.laminaDaguaMm)} mm`,
          `aquecedor ${fmt(hip.perdaDoAquecedorKpa)} kPa`,
        ].join(' · ')}
        regras={
          <li>
            Desnível da caixa menos as perdas no caminho — distribuída (Darcy-Weisbach, rugosidade do material) e localizada
            (conexões, registros, hidrômetro). Mínima de {fmt(hip.pressaoMinimaKpa)} kPa (a da ficha quando o aparelho pede mais);
            estática até {fmt(hip.estaticaMaximaKpa)} kPa. Os padrões (10 e 400 kPa) são os limites da NBR 5626.
          </li>
        }
      >
        {campo('Lâmina d’água', 'laminaDaguaMm', 'mm', 50, 'Lâmina d’água acima do fundo da caixa, em mm', { max: 5000 })}
        {campo('Perda do aquecedor', 'perdaDoAquecedorKpa', 'kPa', 5, 'Perda de carga no aquecedor, em kPa', { max: 500 })}
        {campo('Ajuste da VRP', 'ajusteDaVrpKpa', 'kPa', 10, 'Pressão a jusante da VRP, em kPa', { max: 1000 })}
        {campo('Qmáx do hidrômetro', 'qMaxDoHidrometroM3h', 'm³/h', 0.5, 'Vazão máxima do hidrômetro, em m³/h', { casas: 1, min: 0.5, max: 50, title: 'A perda no hidrômetro é (36·Q)² ÷ Qmáx²: com Qmáx 0 ela seria infinita' })}
        {campo('Pressão mínima', 'pressaoMinimaKpa', 'kPa', 5, 'Pressão mínima nos pontos, em kPa', { max: 200, title: 'NBR 5626: 10 kPa nos pontos de utilização (o aparelho cuja ficha pede mais usa a da ficha)' })}
        {campo('Estática máxima', 'estaticaMaximaKpa', 'kPa', 10, 'Pressão estática máxima nos pontos, em kPa', { max: 2000, title: 'NBR 5626: 400 kPa de pressão estática nos pontos de utilização' })}
      </BlocoDeHipoteses>
    </div>
  );
}
