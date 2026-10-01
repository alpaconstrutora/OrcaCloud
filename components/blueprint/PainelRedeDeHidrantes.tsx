/**
 * INCÊNDIO — a rede de hidrantes automática (30/09/2026, E3.1 do roadmap de
 * incêndio): o que o plano faz (colunas, hidrantes a ligar, metros), a prova do
 * plano, lançar num lote e aceitar o que ficou sugerido.
 */
import React from 'react';
import type { ObjectId } from '../../utils/blueprintKernel';
import type { HipotesesDaRedeDeHidrantes, PlanoDaRedeDeHidrantes } from '../../utils/blueprintRedeDeHidrantes';

interface Props {
  hip: HipotesesDaRedeDeHidrantes;
  onHip: (h: HipotesesDaRedeDeHidrantes) => void;
  plano: PlanoDaRedeDeHidrantes;
  /** `conferirPlanoDaRede`: o lote aplicado numa cópia liga todo hidrante à bomba? */
  prova: { ok: true } | { ok: false; motivo: string } | null;
  /** Os trechos de incêndio ainda sugeridos (tracejados). */
  sugeridos: ObjectId[];
  onLancar: () => void;
  onAceitar: (ids: ObjectId[]) => void;
  onSelecionar: (ids: string[]) => void;
}

const campo = 'rounded-md border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums';
const botao = 'rounded-md border px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50';

function Numero({ rotulo, valor, onValor, passo }: { rotulo: string; valor: number; onValor: (v: number) => void; passo: number }) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span>{rotulo}</span>
      <input
        type="number"
        min={1}
        step={passo}
        value={valor}
        onChange={(e) => {
          const x = Math.round(Number(e.target.value));
          if (Number.isFinite(x) && x > 0) onValor(x);
        }}
        aria-label={rotulo}
        className={`w-24 ${campo}`}
      />
    </label>
  );
}

export default function PainelRedeDeHidrantes({ hip, onHip, plano, prova, sugeridos, onLancar, onAceitar, onSelecionar }: Props) {
  const adicoes = plano.comandos.filter((c) => c.type === 'AddTrecho').length;
  const motivoDeLancar = plano.motivo
    ? plano.motivo
    : plano.aLigar.length === 0
      ? plano.apagados > 0
        ? null
        : 'todos os hidrantes já chegam à bomba por tubo confirmado'
      : prova && !prova.ok
        ? `o plano não fecha: ${prova.motivo}`
        : null;
  const m = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

  return (
    <div className="space-y-3" data-testid="rede-de-hidrantes">
      <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs text-slate-600 sm:grid-cols-3">
        <Numero rotulo="Cota do ramal (mm)" passo={50} valor={hip.cotaDoRamalMm} onValor={(v) => onHip({ ...hip, cotaDoRamalMm: v })} />
        <Numero rotulo="Raio da coluna (mm)" passo={100} valor={hip.raioDaColunaMm} onValor={(v) => onHip({ ...hip, raioDaColunaMm: v })} />
        <Numero rotulo="DN de partida" passo={5} valor={hip.dnMm} onValor={(v) => onHip({ ...hip, dnMm: v })} />
      </div>

      {plano.motivo ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800" data-testid="rede-de-hidrantes-motivo">
          {plano.motivo}
        </p>
      ) : (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800" data-testid="rede-de-hidrantes-resumo">
          {plano.aLigar.length > 0 ? (
            <>
              Liga <strong>{plano.aLigar.length}</strong> hidrante(s) por <strong>{plano.colunas.length}</strong> coluna(s): {adicoes} trechos, {m(plano.metros)} m de
              tubo.
            </>
          ) : (
            'Nenhum hidrante a ligar.'
          )}
          {plano.jaLigados.length > 0 && ` ${plano.jaLigados.length} já chega(m) à bomba por tubo confirmado.`}
          {plano.apagados > 0 && ` Relançar troca os ${plano.apagados} trechos ainda sugeridos.`}
        </p>
      )}

      {plano.colunas.length > 0 && (
        <ul className="space-y-0.5 text-xs text-slate-600">
          {plano.colunas.map((c, i) => (
            <li key={`${c.x},${c.y}`}>
              Coluna {i + 1}: {c.pavimentos} pavimento(s),{' '}
              <button type="button" className="text-blue-700 hover:underline" onClick={() => onSelecionar(c.hidranteIds)}>
                {c.hidranteIds.length} hidrante(s)
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onLancar} disabled={!!motivoDeLancar} title={motivoDeLancar ?? 'Lança a rede sugerida num passo só — Ctrl+Z desfaz'} className={`${botao} border-blue-600 bg-blue-600 text-white hover:bg-blue-700`}>
          {plano.apagados > 0 ? 'Relançar a rede' : 'Lançar a rede'}
        </button>
        <button
          type="button"
          onClick={() => onAceitar(sugeridos)}
          disabled={sugeridos.length === 0}
          title={sugeridos.length === 0 ? 'não há trecho de incêndio sugerido para aceitar' : 'Confirma os trechos sugeridos — relançar não mexe mais neles'}
          className={`${botao} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
        >
          Aceitar a rede{sugeridos.length > 0 ? ` (${sugeridos.length})` : ''}
        </button>
      </div>
      {motivoDeLancar && !plano.motivo && <p className="text-[11px] text-slate-500">Lançar: {motivoDeLancar}.</p>}

      <p className="text-xs text-slate-500">
        A rede nasce no DN de partida; depois, Cálculo hidráulico → "Ajustar DN pela velocidade". O registro de recalque vai no passeio e se lança à mão
        (a conferência cobra que ele esteja ligado à rede).
      </p>
    </div>
  );
}
