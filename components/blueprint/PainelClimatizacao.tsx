/**
 * CLIMATIZAÇÃO — premissas do estudo (04/10/2026, E0.1 do roadmap de
 * climatização): as condições internas de conforto que valem para todos os
 * ambientes climatizados. Tudo o que entra aqui é DECIDIDO; a carga térmica
 * (E2) é derivada disto e do desenho.
 *
 * O aviso de CONFERIR NA NORMA fica à vista enquanto o padrão vier de
 * hipótese: sem o texto da NBR 16401-2, o número orienta, não aprova.
 */
import React from 'react';
import { FONTE_DO_CONFORTO, LIMITES_DE_CONFORTO, type HipotesesClimatizacao } from '../../utils/blueprintClimatizacao';

interface Props {
  hip: HipotesesClimatizacao;
  onHip: (h: HipotesesClimatizacao) => void;
  /** Sem a tabela no banco: as premissas valem só nesta sessão. */
  persistenciaIndisponivel: boolean;
}

const campo = 'rounded-md border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums';

/** Campo numérico obrigatório com faixa: fora dela o valor não é aplicado, e a borda avisa. */
function CampoNumero({ valor, onValor, rotulo, faixa, passo, unidade }: { valor: number; onValor: (v: number) => void; rotulo: string; faixa: { min: number; max: number }; passo: number; unidade: string }) {
  const [texto, setTexto] = React.useState(String(valor));
  React.useEffect(() => setTexto(String(valor)), [valor]);
  const n = Number(texto.replace(',', '.'));
  const invalido = !(texto.trim() && Number.isFinite(n) && n >= faixa.min && n <= faixa.max);
  return (
    <label className="flex items-center gap-1.5">
      {rotulo}
      <input
        type="number"
        min={faixa.min}
        max={faixa.max}
        step={passo}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          const v = Number(e.target.value.replace(',', '.'));
          if (e.target.value.trim() && Number.isFinite(v) && v >= faixa.min && v <= faixa.max) onValor(v);
        }}
        aria-label={rotulo}
        aria-invalid={invalido}
        title={`Entre ${faixa.min} e ${faixa.max} ${unidade}`}
        className={`w-20 ${campo} ${invalido ? 'border-red-400' : ''}`}
      />
      <span className="text-slate-500">{unidade}</span>
    </label>
  );
}

export default function PainelClimatizacao({ hip, onHip, persistenciaIndisponivel }: Props) {
  const c = hip.conforto;
  return (
    <div className="space-y-3" data-testid="climatizacao">
      {persistenciaIndisponivel && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800" data-testid="climatizacao-sem-persistencia">
          As premissas de climatização ainda não têm onde ser gravadas no estudo: valem só nesta sessão.
        </p>
      )}

      <section className="space-y-1.5">
        <h4 className="text-xs font-semibold text-slate-500">Condições internas de projeto</h4>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-600">
          <CampoNumero
            rotulo="Temperatura interna"
            valor={c.temperaturaInternaC}
            onValor={(temperaturaInternaC) => onHip({ ...hip, conforto: { ...c, temperaturaInternaC } })}
            faixa={LIMITES_DE_CONFORTO.temperaturaInternaC}
            passo={0.5}
            unidade="°C"
          />
          <CampoNumero
            rotulo="Umidade relativa"
            valor={c.umidadeRelativaPct}
            onValor={(umidadeRelativaPct) => onHip({ ...hip, conforto: { ...c, umidadeRelativaPct } })}
            faixa={LIMITES_DE_CONFORTO.umidadeRelativaPct}
            passo={5}
            unidade="%"
          />
        </div>
        <p className="text-[11px] text-slate-500">
          Valem para todos os ambientes climatizados do estudo. {FONTE_DO_CONFORTO}
        </p>
      </section>
    </div>
  );
}
