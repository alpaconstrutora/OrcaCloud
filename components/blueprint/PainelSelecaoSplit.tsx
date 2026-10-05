/**
 * SELEÇÃO E POSIÇÃO DO SPLIT (04/10/2026, E4 do roadmap de climatização —
 * "vai além"): por ambiente climatizado, a carga, o necessário com a folga, o
 * que está instalado e o estado (atende / sub / super / sem capacidade / sem
 * equipamento), a sugestão do catálogo; as hipóteses da seleção (folgas
 * editáveis); lançar o split (evaporadora + condensadora + ponto elétrico +
 * sistema) num lote, aceitar o sugerido; a conferência em 3 estados. Molde:
 * `PainelRedeDeHidrantes` + `PainelCargaTermica`.
 */
import React from 'react';
import { AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';
import type { ObjectId } from '../../utils/blueprintKernel';
import { TIPOS_DE_EVAPORADORA } from '../../utils/blueprintKernel';
import { FICHA_DO_PONTO_HIDRAULICO } from '../../utils/blueprintHidraulica';
import type { HipotesesDeSelecao } from '../../utils/blueprintClimatizacao';
import { LIMITES_DE_SELECAO } from '../../utils/blueprintClimatizacao';
import { ROTULO_DO_ESTADO, type EstadoDaCapacidade, type SelecaoDoNivel } from '../../utils/blueprintSelecaoClimatizacao';
import type { PlanoDeEquipamentosSplit } from '../../utils/blueprintPosicaoSplit';
import type { EstadoDaConferencia } from '../../utils/blueprintConferenciaClimatizacao';

interface Props {
  selecao: SelecaoDoNivel;
  plano: PlanoDeEquipamentosSplit;
  hip: HipotesesDeSelecao;
  onHip: (h: HipotesesDeSelecao) => void;
  /** As peças de climatização (e o ponto elétrico do aparelho) ainda sugeridas no pavimento. */
  sugeridas: ObjectId[];
  onLancar: () => void;
  onAceitar: (ids: ObjectId[]) => void;
  onSelecionar?: (ids: string[]) => void;
  /** O catálogo ainda está carregando / indisponível. */
  catalogo?: { carregando: boolean; indisponivel: string | null };
}

const campo = 'rounded-md border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums';
const botao = 'rounded-md border px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50';
const btu = (v: number | null | undefined) => (v == null ? '—' : `${v.toLocaleString('pt-BR')} BTU/h`);

const COR_DO_ESTADO: Record<EstadoDaCapacidade, string> = {
  ATENDE: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  SUBDIMENSIONADO: 'bg-red-50 text-red-800 border-red-200',
  SUPERDIMENSIONADO: 'bg-amber-50 text-amber-800 border-amber-200',
  SEM_CAPACIDADE: 'bg-red-50 text-red-800 border-red-200',
  SEM_EQUIPAMENTO: 'bg-slate-100 text-slate-700 border-slate-200',
};

function Numero({ rotulo, valor, onValor, passo, faixa }: { rotulo: string; valor: number; onValor: (v: number) => void; passo: number; faixa: { min: number; max: number } }) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span>{rotulo}</span>
      <input
        type="number"
        min={faixa.min}
        max={faixa.max}
        step={passo}
        value={valor}
        onChange={(e) => {
          const x = Number(e.target.value);
          if (Number.isFinite(x) && x >= faixa.min && x <= faixa.max) onValor(x);
        }}
        aria-label={rotulo}
        className={`w-24 ${campo}`}
      />
    </label>
  );
}

function IconeDoEstado({ estado }: { estado: EstadoDaConferencia }) {
  if (estado === 'OK') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-label="ok" />;
  if (estado === 'NAO_AVALIADO') return <HelpCircle className="h-3.5 w-3.5 text-slate-400" aria-label="não avaliado" />;
  return <AlertTriangle className={`h-3.5 w-3.5 ${estado === 'FALTA' ? 'text-red-600' : 'text-amber-600'}`} aria-label={estado === 'FALTA' ? 'falta' : 'aviso'} />;
}

export default function PainelSelecaoSplit({ selecao, plano, hip, onHip, sugeridas, onLancar, onAceitar, onSelecionar, catalogo }: Props) {
  const motivoDeLancar = plano.motivo ?? (plano.aCriar.length === 0 && plano.apagados === 0 ? 'nada a lançar' : null);
  return (
    <div className="space-y-3" data-testid="selecao-split">
      <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs text-slate-600 sm:grid-cols-2">
        <Numero rotulo="Folga sobre a carga (%)" passo={5} valor={hip.folgaPct} faixa={LIMITES_DE_SELECAO.folgaPct} onValor={(v) => onHip({ ...hip, folgaPct: v })} />
        <Numero rotulo="Superdimensionado acima de (%)" passo={10} valor={hip.superPct} faixa={LIMITES_DE_SELECAO.superPct} onValor={(v) => onHip({ ...hip, superPct: v })} />
        <Numero rotulo="EER típico (W/W)" passo={0.1} valor={hip.eerWW} faixa={LIMITES_DE_SELECAO.eerWW} onValor={(v) => onHip({ ...hip, eerWW: v })} />
        <label className="flex items-center justify-between gap-2">
          <span>Tipo preferido</span>
          <select value={hip.tipoPreferido} onChange={(e) => onHip({ ...hip, tipoPreferido: e.target.value as HipotesesDeSelecao['tipoPreferido'] })} aria-label="Tipo de evaporadora preferido" className={`w-40 ${campo}`}>
            {TIPOS_DE_EVAPORADORA.map((t) => (
              <option key={t} value={t}>
                {FICHA_DO_PONTO_HIDRAULICO[t].rotulo}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-[11px] text-slate-500">
        Folgas são hipóteses de projeto; o catálogo são os tipos salvos da organização com capacidade (as sementes de 9.000 a 60.000 BTU/h são valores típicos — CONFERIR com o fabricante).
        {catalogo?.carregando && ' Carregando o catálogo…'}
        {catalogo?.indisponivel && ` Catálogo indisponível: ${catalogo.indisponivel}.`}
      </p>

      {selecao.ambientes.length === 0 ? (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700" data-testid="selecao-vazia">
          Nenhum ambiente climatizado no pavimento — marque o uso ou "climatizado" nas premissas por ambiente.
        </p>
      ) : (
        <table className="w-full text-xs" data-testid="tabela-selecao">
          <thead>
            <tr className="text-left text-[11px] text-slate-500">
              <th className="py-1 pr-2 font-medium">Ambiente</th>
              <th className="py-1 pr-2 text-right font-medium">Carga</th>
              <th className="py-1 pr-2 text-right font-medium">Necessário</th>
              <th className="py-1 pr-2 text-right font-medium">Instalado</th>
              <th className="py-1 pr-2 font-medium">Estado</th>
              <th className="py-1 font-medium">Sugestão</th>
            </tr>
          </thead>
          <tbody>
            {selecao.ambientes.map((a) => (
              <tr key={a.spaceId} className="border-t border-slate-100 align-top">
                <td className="py-1 pr-2">
                  <button type="button" className="text-left font-medium text-slate-800 hover:underline" onClick={() => onSelecionar?.([a.spaceId])}>
                    {a.nome}
                  </button>
                  {a.pendencias.length > 0 && <p className="text-[10px] text-amber-700">{a.pendencias.join(' · ')}</p>}
                </td>
                <td className="py-1 pr-2 text-right tabular-nums">{btu(a.cargaBtuH)}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{btu(a.necessarioBtuH)}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{a.evaporadoras.length === 0 ? '—' : a.instaladaBtuH == null ? 'sem capacidade' : btu(a.instaladaBtuH)}</td>
                <td className="py-1 pr-2">
                  <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] ${COR_DO_ESTADO[a.estado]}`} data-testid={`estado-${a.spaceId}`}>
                    {ROTULO_DO_ESTADO[a.estado]}
                  </span>
                </td>
                <td className="py-1">
                  {a.sugestao.escolhido ? (
                    <span>
                      {a.sugestao.escolhido.nome}
                      {a.sugestao.alternativas.length > 0 && <span className="text-slate-400"> (+{a.sugestao.alternativas.length})</span>}
                    </span>
                  ) : (
                    <span className="text-amber-700">{a.sugestao.motivo}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {plano.motivo ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800" data-testid="plano-motivo">
          {plano.motivo}
        </p>
      ) : (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800" data-testid="plano-resumo">
          {plano.aCriar.length > 0 ? (
            <>
              <p>
                Lança <strong>{plano.aCriar.length}</strong> split(s): evaporadora na parede livre, condensadora fora, ponto de força com a potência da placa, sistema ligado — um passo, Ctrl+Z desfaz.
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {plano.resumo.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </>
          ) : (
            <p>Nenhum split a lançar.</p>
          )}
          {plano.jaAtendidos.length > 0 && <p className="mt-1 text-slate-600">Já atendidos (equipamento confirmado): {plano.jaAtendidos.join(', ')}.</p>}
          {plano.semLugar.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-amber-800">
              {plano.semLugar.map((s) => (
                <li key={`${s.nome}-${s.motivo}`}>
                  {s.nome}: {s.motivo}
                </li>
              ))}
            </ul>
          )}
          {plano.apagados > 0 && <p className="mt-1 text-slate-600">Relançar troca as {plano.apagados} peças ainda sugeridas.</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onLancar} disabled={!!motivoDeLancar} title={motivoDeLancar ?? 'Lança os splits sugeridos num passo só — Ctrl+Z desfaz'} className={`${botao} border-blue-600 bg-blue-600 text-white hover:bg-blue-700`}>
          {plano.apagados > 0 ? 'Relançar os splits' : 'Lançar os splits'}
        </button>
        <button
          type="button"
          onClick={() => onAceitar(sugeridas)}
          disabled={sugeridas.length === 0}
          title={sugeridas.length === 0 ? 'não há peça de climatização sugerida para aceitar' : 'Confirma as peças sugeridas — relançar não mexe mais nelas'}
          className={`${botao} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
        >
          Aceitar{sugeridas.length > 0 ? ` (${sugeridas.length})` : ''}
        </button>
      </div>
      {motivoDeLancar && !plano.motivo && <p className="text-[11px] text-slate-500">Lançar: {motivoDeLancar}.</p>}

      <div data-testid="selecao-conferencia">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Conferência</p>
        <ul className="mt-1 space-y-1 text-xs">
          {selecao.conferencia.map((c) => (
            <li key={c.codigo} className="flex items-start gap-1.5">
              <span className="mt-0.5">
                <IconeDoEstado estado={c.estado} />
              </span>
              <span>
                <span className="text-slate-800">{c.item}</span>
                <span className="text-slate-500"> — </span>
                {c.spaceIds.length > 0 && onSelecionar ? (
                  <button type="button" className="text-blue-700 hover:underline" onClick={() => onSelecionar(c.spaceIds)}>
                    {c.obtido}
                  </button>
                ) : (
                  <span className="text-slate-600">{c.obtido}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
