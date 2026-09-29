import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Ruler } from 'lucide-react';
import {
  DEMANDA_SEM_FATOR,
  HIPOTESES_PADRAO,
  METODOS_DE_INSTALACAO,
  type HipotesesEletricas,
  type PreDimensionamentoDoCircuito,
} from '../../utils/blueprintEletricaDimensionamento';
import { EXPOSICOES_A_RAIOS, ROTULO_DA_EXPOSICAO, type ExposicaoARaios } from '../../utils/blueprintEletricaDimensionamento';

const ROTULO_DO_GRUPO = { ILUMINACAO: 'iluminação', TUG: 'TUG', FORCA: 'força', MOTOR: 'motores / ar-condicionado' } as const;
/** Fator de demanda entre 0 e 1; texto vazio ou inválido mantém o atual. */
const fatorDeDemanda = (v: string, atual: number) => {
  const n = Number(v);
  return v.trim() !== '' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : atual;
};

/**
 * O PRÉ-DIMENSIONAMENTO na tela — a linha de cada circuito e as hipóteses.
 *
 * ─── ⚠️ CALCULADO AO LADO DO DECLARADO, NUNCA NO LUGAR ──────────────────────
 *
 * O campo "Disj." e o campo "Seção" continuam sendo o que o projetista
 * declarou. Esta linha mostra o que a NBR 5410 pede para a carga declarada —
 * IB, seção mínima, disjuntor que cabe, queda de tensão — e acusa quando o
 * declarado não atende, com o item da norma. "Usar sugerido" preenche o
 * declarado com um clique; ainda assim é ele quem clica.
 *
 * Toda hipótese que muda um número está no painel recolhível abaixo, com o
 * padrão e a tabela de origem. Item 6 (13/09/2026), molde da topografia:
 * pré-dimensionamento com hipóteses declaradas.
 */

const n1 = (v: number) => v.toFixed(1).replace('.', ',');
const mm2 = (v: number) => String(v).replace('.', ',');

export function LinhaPreDimensionamento({
  r,
  hipoteses,
  onUsarSugerido,
}: {
  r: PreDimensionamentoDoCircuito;
  hipoteses: HipotesesEletricas;
  onUsarSugerido?: (campos: { disjuntorA?: number; secaoMm2?: number }) => void;
}) {
  const faltas = r.achados.filter((a) => a.nivel === 'FALTA');
  // AVISO (14/09/2026): a seção de TUE abaixo da HIPÓTESE do projetista — não é
  // norma, então não pinta a linha de vermelho nem barra a emissão, mas aparece.
  const avisos = r.achados.filter((a) => a.nivel === 'AVISO');
  const cor = faltas.length > 0 ? 'text-red-700' : r.ibA == null ? 'text-slate-400' : avisos.length > 0 ? 'text-amber-700' : 'text-emerald-700';

  if (r.ibA == null) {
    return (
      <div className="px-2 pb-1.5 text-xs text-slate-400" aria-label={`Pré-dimensionamento do circuito ${r.nome}`}>
        Pré-dimensionamento: {r.naoAvaliado.join('; ')}.
      </div>
    );
  }

  const secaoQueVale = r.secaoDeclaradaMm2 ?? r.secaoCalculada?.secaoMm2 ?? null;
  const sugerirSecao = r.secaoCalculada && (r.secaoDeclaradaMm2 == null || r.secaoDeclaradaMm2 < r.secaoCalculada.secaoMm2);
  const sugerirDisj = r.disjuntorSugeridoA != null && r.disjuntorDeclaradoA !== r.disjuntorSugeridoA;

  return (
    <div className="min-w-0 space-y-0.5 break-words px-2 pb-1.5 text-sm" aria-label={`Pré-dimensionamento do circuito ${r.nome}`}>
      <p className={cor}>
        <span className="font-semibold">IB {n1(r.ibA)} A</span>
        {r.pontosSemPotencia > 0 && <span title="há pontos sem potência — IB é um piso"> (≥)</span>}
        {' · '}
        seção mín.{' '}
        {r.secaoCalculada ? (
          <span title={`Iz corrigida ${n1(r.secaoCalculada.izA)} A · critério: ${r.secaoCalculada.criterio === 'USO' ? (r.uso === 'TUE' ? 'hipótese TUE' : 'Tab. 47 (uso)') : r.secaoCalculada.criterio === 'DISJUNTOR' ? 'menor disjuntor comercial (5.3.4.1)' : 'Tab. 36 (corrente)'}`}>
            {mm2(r.secaoCalculada.secaoMm2)} mm²
          </span>
        ) : (
          '—'
        )}
        {' · '}
        In{' '}
        {r.disjuntorSugeridoA != null ? (
          `${r.disjuntorSugeridoA} A`
        ) : (
          <span title="Nenhum disjuntor do catálogo fica entre IB e a capacidade da seção que vai existir — a resposta é a seção, não o disjuntor">
            nenhum cabe na seção
          </span>
        )}
        {r.quedaPct != null && r.comprimento && (
          <>
            {' · '}
            <span title={`${n1(r.comprimento.metros)} m ${r.comprimento.origem === 'ESTIMADO' ? 'estimados em planta' : 'pelos eletrodutos'}${secaoQueVale != null ? ` com ${mm2(secaoQueVale)} mm²` : ''}`}>
              ΔV {n1(r.quedaPct)} %{r.comprimento.origem === 'ESTIMADO' ? ' (est.)' : ''}
            </span>
          </>
        )}
        {onUsarSugerido && (sugerirSecao || sugerirDisj) && (
          <>
            {' '}
            <button
              type="button"
              onClick={() =>
                onUsarSugerido({
                  ...(sugerirSecao && r.secaoCalculada ? { secaoMm2: r.secaoCalculada.secaoMm2 } : {}),
                  ...(sugerirDisj && r.disjuntorSugeridoA != null ? { disjuntorA: r.disjuntorSugeridoA } : {}),
                })
              }
              title="Preenche seção e disjuntor declarados com os sugeridos — quem clica decide"
              className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              usar sugerido
            </button>
          </>
        )}
      </p>
      {faltas.map((a, i) => (
        <p key={i} className="text-red-700">
          <span className="font-mono text-xs text-red-500">{a.referencia}</span> {a.mensagem}
        </p>
      ))}
      {avisos.map((a, i) => (
        <p key={`aviso-${i}`} className="text-amber-700">
          <span className="font-mono text-xs text-amber-600">{a.referencia}</span> {a.mensagem}
        </p>
      ))}
      {r.naoAvaliado.length > 0 && (
        <p className="text-slate-400">Fora da avaliação: {r.naoAvaliado.join('; ')}.</p>
      )}
    </div>
  );
}

/** As hipóteses, recolhidas — abrir para editar. */
export function HipotesesDoPreDimensionamento({
  hipoteses,
  onChange,
}: {
  hipoteses: HipotesesEletricas;
  onChange: (h: HipotesesEletricas) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const Seta = aberto ? ChevronDown : ChevronRight;
  // Demanda "informada" = qualquer coisa diferente do preset sem demanda — pelo
  // nome ou por um fator que não seja 1,00 (coluna gravada à mão, por exemplo).
  const demandaInformada =
    hipoteses.demanda.nome !== DEMANDA_SEM_FATOR.nome ||
    hipoteses.demanda.ILUMINACAO !== 1 ||
    hipoteses.demanda.TUG !== 1 ||
    hipoteses.demanda.FORCA !== 1 ||
    (hipoteses.demanda.MOTOR ?? 1) !== 1;
  const resumo = `${hipoteses.metodoDeInstalacao} · ${hipoteses.temperaturaAmbienteC} °C · ${hipoteses.circuitosAgrupados} circ./eletroduto · ρ ${String(hipoteses.rhoOhmMm2PorM).replace('.', ',')} · ΔV ≤ ${hipoteses.limiteQuedaTerminalPct} % (origem ${hipoteses.limiteQuedaTotalPct} %) · TUE ≥ ${String(hipoteses.secaoMinimaTueMm2).replace('.', ',')} mm²${demandaInformada ? ` · demanda: ${hipoteses.demanda.nome}` : ''}${hipoteses.exposicaoARaios !== 'NAO_AVALIADA' ? ` · descargas: ${hipoteses.exposicaoARaios === 'EXPOSTA' ? 'exposta' : 'não exposta'}` : ''}`;
  const campo = 'w-16 rounded border border-slate-300 px-1 py-0.5 text-sm';
  return (
    <div className="rounded-md border border-dashed border-slate-300">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-sm text-slate-600 hover:bg-slate-50"
      >
        <Seta className="h-3 w-3 shrink-0 text-slate-400" />
        <Ruler className="h-3 w-3 shrink-0 text-slate-400" />
        <span className="font-medium">Hipóteses do pré-dimensionamento</span>
        <span className="ml-auto truncate text-xs text-slate-400">{resumo}</span>
      </button>
      {aberto && (
        <div className="space-y-1.5 border-t border-slate-200 px-2 py-2 text-sm text-slate-600">
          <label className="flex items-center justify-between gap-2">
            <span>Método de instalação (Tab. 33/36)</span>
            <select
              value={hipoteses.metodoDeInstalacao}
              onChange={(e) => onChange({ ...hipoteses, metodoDeInstalacao: e.target.value as HipotesesEletricas['metodoDeInstalacao'] })}
              aria-label="Método de instalação"
              className={campo}
            >
              {METODOS_DE_INSTALACAO.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>Temperatura ambiente, °C (Tab. 40)</span>
            <input type="number" value={hipoteses.temperaturaAmbienteC} onChange={(e) => onChange({ ...hipoteses, temperaturaAmbienteC: Number(e.target.value) })} aria-label="Temperatura ambiente" className={campo} />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>Circuitos por eletroduto (Tab. 42)</span>
            <input type="number" min={1} value={hipoteses.circuitosAgrupados} onChange={(e) => onChange({ ...hipoteses, circuitosAgrupados: Math.max(1, Number(e.target.value) || 1) })} aria-label="Circuitos agrupados" className={campo} />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>ρ do cobre, Ω·mm²/m</span>
            <input type="number" step="0.0001" value={hipoteses.rhoOhmMm2PorM} onChange={(e) => onChange({ ...hipoteses, rhoOhmMm2PorM: Number(e.target.value) || HIPOTESES_PADRAO.rhoOhmMm2PorM })} aria-label="Resistividade do cobre" className={campo} />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>Queda máxima no terminal, % (6.2.7)</span>
            <input type="number" step="0.5" value={hipoteses.limiteQuedaTerminalPct} onChange={(e) => onChange({ ...hipoteses, limiteQuedaTerminalPct: Number(e.target.value) || HIPOTESES_PADRAO.limiteQuedaTerminalPct })} aria-label="Limite de queda de tensão" className={campo} />
          </label>
          {/* Hipótese de projeto, não norma: a Tab. 47 pede 2,5 para força. O
              rótulo diz isso para ninguém ler 4,0 como exigência da 5410. */}
          <label className="flex items-center justify-between gap-2">
            <span>Seção mínima de TUE, mm² (hipótese; Tab. 47 pede 2,5)</span>
            <input type="number" step="0.5" min={2.5} value={hipoteses.secaoMinimaTueMm2} onChange={(e) => onChange({ ...hipoteses, secaoMinimaTueMm2: Number(e.target.value) || HIPOTESES_PADRAO.secaoMinimaTueMm2 })} aria-label="Seção mínima de TUE" className={campo} />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>Queda máxima da origem ao pior ponto, % (6.2.7.1)</span>
            <input type="number" step="0.5" min={0} value={hipoteses.limiteQuedaTotalPct} onChange={(e) => onChange({ ...hipoteses, limiteQuedaTotalPct: Number(e.target.value) || HIPOTESES_PADRAO.limiteQuedaTotalPct })} aria-label="Limite de queda de tensão da origem" className={campo} />
          </label>
          {/* E3.1: quantos circuitos um DR de grupo pode juntar — hipótese de projeto, não norma. */}
          <label className="flex items-center justify-between gap-2">
            <span>Circuitos por DR de grupo, máx. (hipótese)</span>
            <input type="number" step="1" min={1} value={hipoteses.maxCircuitosPorDR} onChange={(e) => onChange({ ...hipoteses, maxCircuitosPorDR: Math.max(1, Number(e.target.value) || HIPOTESES_PADRAO.maxCircuitosPorDR) })} aria-label="Máximo de circuitos por DR" className={campo} />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>Desequilíbrio de fases tolerado, % (quadro trifásico)</span>
            <input type="number" step="1" min={0} value={hipoteses.desequilibrioMaxPct} onChange={(e) => onChange({ ...hipoteses, desequilibrioMaxPct: Number(e.target.value) || HIPOTESES_PADRAO.desequilibrioMaxPct })} aria-label="Desequilíbrio de fases tolerado" className={campo} />
          </label>
          {/* E3.2: a exposição a descargas é dado do LUGAR (6.3.5.2.1) — hipótese
              declarada; decide se "quadro sem DPS" é aviso, falta ou dispensa. */}
          <label className="flex items-center justify-between gap-2">
            <span>Exposição a descargas atmosféricas (6.3.5.2)</span>
            <select value={hipoteses.exposicaoARaios} onChange={(e) => onChange({ ...hipoteses, exposicaoARaios: e.target.value as ExposicaoARaios })} aria-label="Exposição a descargas atmosféricas" className="w-40 rounded border border-slate-300 px-1 py-0.5 text-sm">
              {EXPOSICOES_A_RAIOS.map((x) => (
                <option key={x} value={x}>
                  {ROTULO_DA_EXPOSICAO[x].split(' (')[0].split(' — ')[0]}
                </option>
              ))}
            </select>
          </label>
          {/* Demanda (E0.1, 29/09/2026): a tabela é da CONCESSIONÁRIA, não da 5410 —
              por isso é um preset NOMEADO. Só dois: sem demanda (o padrão) e o que o
              projetista informar, com o nome da fonte. Nenhuma tabela "de memória". */}
          <label className="flex items-center justify-between gap-2">
            <span>Fatores de demanda do alimentador</span>
            <select
              value={demandaInformada ? 'INFORMADA' : 'SEM'}
              onChange={(e) =>
                onChange({
                  ...hipoteses,
                  demanda:
                    e.target.value === 'SEM'
                      ? DEMANDA_SEM_FATOR
                      : { ...hipoteses.demanda, nome: demandaInformada ? hipoteses.demanda.nome : 'tabela informada pelo projetista' },
                })
              }
              aria-label="Tabela de demanda"
              className="w-40 rounded border border-slate-300 px-1 py-0.5 text-sm"
            >
              <option value="SEM">sem demanda (1,00)</option>
              <option value="INFORMADA">informada (nomear a fonte)</option>
            </select>
          </label>
          {demandaInformada && (
            <div className="space-y-1.5 pl-3">
              <label className="flex items-center justify-between gap-2">
                <span>Fonte da tabela</span>
                <input type="text" value={hipoteses.demanda.nome} onChange={(e) => onChange({ ...hipoteses, demanda: { ...hipoteses.demanda, nome: e.target.value } })} aria-label="Fonte da tabela de demanda" className="w-40 rounded border border-slate-300 px-1 py-0.5 text-sm" />
              </label>
              {(['ILUMINACAO', 'TUG', 'FORCA', 'MOTOR'] as const).map((g) => (
                <label key={g} className="flex items-center justify-between gap-2">
                  <span>Fator — {ROTULO_DO_GRUPO[g]}</span>
                  <input type="number" step="0.05" min={0} max={1} value={hipoteses.demanda[g]} onChange={(e) => onChange({ ...hipoteses, demanda: { ...hipoteses.demanda, [g]: fatorDeDemanda(e.target.value, hipoteses.demanda[g]) } })} aria-label={`Fator de demanda de ${ROTULO_DO_GRUPO[g]}`} className={campo} />
                </label>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-400">
            Cobre com isolação PVC (Tabela 36); B1 = eletroduto embutido em alvenaria. Disjuntores:{' '}
            {hipoteses.catalogoDeDisjuntoresA.join(', ')} A.{' '}
            <button type="button" onClick={() => onChange(HIPOTESES_PADRAO)} className="text-blue-700 hover:underline">
              Voltar ao padrão
            </button>
          </p>
        </div>
      )}
    </div>
  );
}
