/**
 * CLIMATIZAÇÃO — premissas do estudo (04/10/2026, E0.1/E0.2 do roadmap de
 * climatização): as condições internas de conforto e o clima externo de
 * projeto. Tudo o que entra aqui é DECIDIDO; o que não foi declarado aparece
 * DERIVADO, com a origem escrita (cidade do contexto, capital mais próxima,
 * georreferência, tabela), e a carga térmica (E2) lê daqui.
 *
 * O aviso de CONFERIR NA NORMA fica à vista enquanto algum número vier de
 * hipótese ou da tabela de memória: sem o texto da NBR 16401, o número
 * orienta, não aprova.
 */
import React from 'react';
import {
  CLIMA_POR_CIDADE,
  FONTE_DO_CLIMA,
  FONTE_DO_CONFORTO,
  LIMITES_DE_CONFORTO,
  LIMITES_DO_CLIMA,
  type CondicoesExternas,
  type HipotesesClimatizacao,
  type OrigemDoClima,
} from '../../utils/blueprintClimatizacao';

interface Props {
  hip: HipotesesClimatizacao;
  onHip: (h: HipotesesClimatizacao) => void;
  /** O clima em vigor, derivado das premissas + georreferência + contexto urbanístico. */
  condicoes: CondicoesExternas;
  /** Sem a tabela no banco: as premissas valem só nesta sessão. */
  persistenciaIndisponivel: boolean;
}

const campo = 'rounded-md border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums';
const num = (v: number, casas = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

const ORIGEM: Record<OrigemDoClima, string> = {
  DECLARADA: 'declarada',
  CONTEXTO: 'cidade do contexto urbanístico',
  MAIS_PROXIMA: 'capital mais próxima pela georreferência',
  TABELA: 'tabela',
  GEORREFERENCIA: 'georreferência do desenho',
  SEM: 'sem valor',
};

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

/** Campo numérico ANULÁVEL: vazio = derivar (o placeholder mostra o valor em uso e a origem). */
function CampoDerivavel({ valor, onValor, rotulo, faixa, passo, unidade, emUso }: { valor: number | null; onValor: (v: number | null) => void; rotulo: string; faixa: { min: number; max: number }; passo: number; unidade: string; emUso: { valor: number | null; origem: OrigemDoClima } }) {
  const [texto, setTexto] = React.useState(valor == null ? '' : String(valor));
  React.useEffect(() => setTexto(valor == null ? '' : String(valor)), [valor]);
  const n = Number(texto.replace(',', '.'));
  const invalido = texto.trim() !== '' && !(Number.isFinite(n) && n >= faixa.min && n <= faixa.max);
  return (
    <label className="flex items-center gap-1.5" title={emUso.valor == null ? 'Sem valor em uso' : `Em uso: ${num(emUso.valor)} ${unidade} (${ORIGEM[emUso.origem]})`}>
      {rotulo}
      <input
        type="number"
        min={faixa.min}
        max={faixa.max}
        step={passo}
        value={texto}
        placeholder={emUso.valor == null ? '—' : num(emUso.valor)}
        onChange={(e) => {
          setTexto(e.target.value);
          const t = e.target.value.trim();
          if (t === '') {
            onValor(null);
            return;
          }
          const v = Number(t.replace(',', '.'));
          if (Number.isFinite(v) && v >= faixa.min && v <= faixa.max) onValor(v);
        }}
        aria-label={rotulo}
        aria-invalid={invalido}
        className={`w-20 ${campo} ${invalido ? 'border-red-400' : ''}`}
      />
      <span className="text-slate-500">{unidade}</span>
    </label>
  );
}

export default function PainelClimatizacao({ hip, onHip, condicoes: c, persistenciaIndisponivel }: Props) {
  const conf = hip.conforto;
  const clima = hip.clima;
  const cidades = Object.keys(CLIMA_POR_CIDADE);
  const cidadeNoSelect = clima.cidade && cidades.includes(clima.cidade) ? clima.cidade : '';
  return (
    <div className="space-y-4" data-testid="climatizacao">
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
            valor={conf.temperaturaInternaC}
            onValor={(temperaturaInternaC) => onHip({ ...hip, conforto: { ...conf, temperaturaInternaC } })}
            faixa={LIMITES_DE_CONFORTO.temperaturaInternaC}
            passo={0.5}
            unidade="°C"
          />
          <CampoNumero
            rotulo="Umidade relativa"
            valor={conf.umidadeRelativaPct}
            onValor={(umidadeRelativaPct) => onHip({ ...hip, conforto: { ...conf, umidadeRelativaPct } })}
            faixa={LIMITES_DE_CONFORTO.umidadeRelativaPct}
            passo={5}
            unidade="%"
          />
        </div>
        <p className="text-[11px] text-slate-500">
          Valem para todos os ambientes climatizados do estudo. {FONTE_DO_CONFORTO}
        </p>
      </section>

      {/* E0.2: o clima externo — o declarado vence, o resto é derivado e diz de onde veio. */}
      <section className="space-y-1.5" data-testid="clima-externo">
        <h4 className="text-xs font-semibold text-slate-500">Clima externo de projeto</h4>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-600">
          <label className="flex items-center gap-1.5">
            Cidade
            <select
              value={cidadeNoSelect}
              onChange={(e) => onHip({ ...hip, clima: { ...clima, cidade: e.target.value || null } })}
              aria-label="Cidade do clima de projeto (vazia = pelo contexto ou pela georreferência)"
              className={campo}
            >
              <option value="">{c.cidade.valor && c.cidade.origem !== 'DECLARADA' ? `${c.cidade.valor} (${ORIGEM[c.cidade.origem]})` : 'pelo contexto / georreferência'}</option>
              {cidades.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <CampoDerivavel rotulo="TBS externa" valor={clima.tbsExternaC} onValor={(tbsExternaC) => onHip({ ...hip, clima: { ...clima, tbsExternaC } })} faixa={LIMITES_DO_CLIMA.tbsExternaC} passo={0.1} unidade="°C" emUso={c.tbsC} />
          <CampoDerivavel rotulo="TBU externa" valor={clima.tbuExternaC} onValor={(tbuExternaC) => onHip({ ...hip, clima: { ...clima, tbuExternaC } })} faixa={LIMITES_DO_CLIMA.tbuExternaC} passo={0.1} unidade="°C" emUso={c.tbuC} />
          <CampoDerivavel rotulo="Altitude" valor={clima.altitudeM} onValor={(altitudeM) => onHip({ ...hip, clima: { ...clima, altitudeM } })} faixa={LIMITES_DO_CLIMA.altitudeM} passo={10} unidade="m" emUso={c.altitudeM} />
        </div>
        <p className="text-[11px] text-slate-600" data-testid="clima-em-uso">
          Em uso:{' '}
          {c.cidade.valor ? (
            <>
              <strong>{c.cidade.valor}</strong> ({ORIGEM[c.cidade.origem]}{c.cidade.distanciaKm != null ? `, ${c.cidade.distanciaKm} km` : ''})
            </>
          ) : (
            <strong>sem cidade</strong>
          )}
          {' · '}TBS {c.tbsC.valor == null ? '—' : `${num(c.tbsC.valor)} °C`}
          {' · '}TBU {c.tbuC.valor == null ? '—' : `${num(c.tbuC.valor)} °C`}
          {' · '}altitude {c.altitudeM.valor == null ? '—' : `${num(c.altitudeM.valor, 0)} m`}
          {c.altitudeM.origem === 'GEORREFERENCIA' ? ' (georreferência)' : ''}
        </p>
        {c.pendencias.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-amber-800" data-testid="clima-pendencias">
            {c.pendencias.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {c.conferir && <p className="text-[11px] text-slate-500">{FONTE_DO_CLIMA}</p>}
        <p className="text-[11px] text-slate-500">
          Data, hora solar e latitude suposta da insolação também são do estudo desde 04/10/2026 — ajustam-se na gaveta Insolação.
        </p>
      </section>
    </div>
  );
}
