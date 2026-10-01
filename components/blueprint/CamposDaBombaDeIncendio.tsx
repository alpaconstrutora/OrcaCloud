/**
 * A BOMBA DE INCÊNDIO no painel do ponto (30/09/2026, E4.1 do roadmap de
 * incêndio): a curva Q×H do catálogo do fabricante, o NPSH requerido e, na
 * jockey, a bomba principal que ela protege. A curva se edita numa tabela e se
 * aplica num passo só — com o motivo dito quando não dá (o kernel recusaria).
 *
 * Salvar a bomba como TIPO da organização (o seletor de tipos do painel) leva a
 * curva junto: é o cadastro de bombas por fabricante e modelo.
 */
import React from 'react';
import { PONTOS_MINIMOS_DA_CURVA, type PontoDaCurvaDaBomba, type Terminal } from '../../utils/blueprintKernel';

interface Props {
  terminal: Terminal;
  /** As bombas principais do desenho, para a jockey escolher. */
  principais: { id: string; nome: string }[];
  onBomba: (campos: { curvaBomba?: PontoDaCurvaDaBomba[] | null; npshrMm?: number | null; bombaPrincipalId?: string | null }) => void;
}

type Linha = { q: string; h: string };
const campo = 'w-full rounded-md border border-slate-300 px-2 py-1 text-xs tabular-nums';
const num = (s: string) => Number(s.replace(',', '.'));
const doTerminal = (t: Terminal): Linha[] =>
  t.curvaBomba?.map((p) => ({ q: String(p.vazaoLmin), h: String(p.alturaMm / 1000).replace('.', ',') })) ?? Array.from({ length: PONTOS_MINIMOS_DA_CURVA }, () => ({ q: '', h: '' }));

/** A curva digitada, validada como o kernel valida — ou o motivo. */
export function curvaDigitada(linhas: Linha[]): { curva: PontoDaCurvaDaBomba[] } | { motivo: string } {
  const cheias = linhas.filter((l) => l.q.trim() || l.h.trim());
  if (cheias.length < PONTOS_MINIMOS_DA_CURVA) return { motivo: `a curva precisa de ${PONTOS_MINIMOS_DA_CURVA} pontos ou mais` };
  const curva: PontoDaCurvaDaBomba[] = [];
  for (const [i, l] of cheias.entries()) {
    const q = num(l.q);
    const h = num(l.h);
    if (!Number.isFinite(q) || q < 0 || !Number.isFinite(h) || h <= 0) return { motivo: `ponto ${i + 1}: vazão ≥ 0 e altura > 0` };
    curva.push({ vazaoLmin: Math.round(q), alturaMm: Math.round(h * 1000) });
  }
  for (let i = 1; i < curva.length; i++) {
    if (curva[i].vazaoLmin <= curva[i - 1].vazaoLmin) return { motivo: `ponto ${i + 1}: a vazão tem de crescer` };
    if (curva[i].alturaMm > curva[i - 1].alturaMm) return { motivo: `ponto ${i + 1}: a altura não pode subir com a vazão` };
  }
  return { curva };
}

export default function CamposDaBombaDeIncendio({ terminal, principais, onBomba }: Props) {
  const [linhas, setLinhas] = React.useState<Linha[]>(() => doTerminal(terminal));
  // Outra bomba selecionada, ou a curva mudou por fora (Ctrl+Z, tipo aplicado): recarrega.
  const assinatura = `${terminal.id}|${JSON.stringify(terminal.curvaBomba ?? null)}`;
  React.useEffect(() => setLinhas(doTerminal(terminal)), [assinatura]); // eslint-disable-line react-hooks/exhaustive-deps
  const r = curvaDigitada(linhas);
  const igual = 'curva' in r && JSON.stringify(r.curva) === JSON.stringify(terminal.curvaBomba ?? null);
  const motivo = 'motivo' in r ? r.motivo : igual ? 'a curva digitada é a que já está na bomba' : null;
  const set = (i: number, k: keyof Linha, v: string) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  return (
    <div className="space-y-2" data-testid="campos-da-bomba">
      {terminal.tipoHidraulico === 'BOMBA_JOCKEY' && (
        <label className="block">
          <span className="text-[11px] font-medium text-slate-600">Bomba principal</span>
          <select
            value={terminal.bombaPrincipalId ?? ''}
            onChange={(e) => onBomba({ bombaPrincipalId: e.target.value || null })}
            aria-label="Bomba principal da jockey"
            className={campo}
          >
            <option value="">{principais.length ? '— escolha —' : '— não há bomba principal no desenho —'}</option>
            {principais.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </label>
      )}
      <div>
        <span className="text-[11px] font-medium text-slate-600">Curva da bomba (catálogo do fabricante)</span>
        <table className="mt-0.5 w-full text-xs" data-testid="curva-da-bomba">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="pr-2 font-medium">Vazão (L/min)</th>
              <th className="font-medium">Altura (m)</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={i}>
                <td className="py-0.5 pr-2">
                  <input value={l.q} onChange={(e) => set(i, 'q', e.target.value)} inputMode="decimal" aria-label={`Vazão do ponto ${i + 1} (L/min)`} className={campo} />
                </td>
                <td className="py-0.5">
                  <input value={l.h} onChange={(e) => set(i, 'h', e.target.value)} inputMode="decimal" aria-label={`Altura do ponto ${i + 1} (m)`} className={campo} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setLinhas((ls) => [...ls, { q: '', h: '' }])} className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50">
            + ponto
          </button>
          <button
            type="button"
            onClick={() => 'curva' in r && onBomba({ curvaBomba: r.curva })}
            disabled={!!motivo}
            title={motivo ?? 'Grava a curva na bomba — um passo de desfazer'}
            className="rounded-md border border-blue-600 bg-blue-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Aplicar curva
          </button>
          {terminal.curvaBomba && (
            <button type="button" onClick={() => onBomba({ curvaBomba: null })} className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50">
              Tirar a curva
            </button>
          )}
        </div>
        {motivo && 'motivo' in r && <p className="mt-0.5 text-[11px] text-slate-500">Aplicar: {motivo}.</p>}
      </div>
      <label className="block">
        <span className="text-[11px] font-medium text-slate-600">NPSH requerido (m)</span>
        <input
          type="number"
          min={0}
          step={0.1}
          value={terminal.npshrMm != null ? terminal.npshrMm / 1000 : ''}
          placeholder="do catálogo"
          onChange={(e) => {
            const v = num(e.target.value);
            onBomba({ npshrMm: e.target.value.trim() === '' || !(v > 0) ? null : Math.round(v * 1000) });
          }}
          aria-label="NPSH requerido da bomba (m)"
          className={campo}
        />
      </label>
    </div>
  );
}
