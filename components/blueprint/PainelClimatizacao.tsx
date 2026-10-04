/**
 * CLIMATIZAÇÃO — premissas do estudo (04/10/2026, E0.1–E0.3 do roadmap de
 * climatização): as condições internas de conforto, o clima externo de projeto
 * e o declarado POR AMBIENTE. Tudo o que entra aqui é DECIDIDO; o que não foi
 * declarado aparece DERIVADO, com a origem escrita (cidade do contexto, capital
 * mais próxima, georreferência, tabela, padrão do uso, setpoint do estudo), e
 * a carga térmica (E2) lê daqui.
 *
 * O aviso de CONFERIR NA NORMA fica à vista enquanto algum número vier de
 * hipótese ou da tabela de memória: sem o texto da NBR 16401/16655, o número
 * orienta, não aprova.
 */
import React from 'react';
import type { AcabamentosDoAmbiente, ObjectId } from '../../utils/blueprintKernel';
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
import {
  ATIVIDADES,
  FONTE_DO_PADRAO_POR_USO,
  HIPOTESES_DO_AMBIENTE_VAZIAS,
  LIMITES_DO_AMBIENTE,
  ROTULO_DA_ATIVIDADE,
  ambienteSemDeclaracao,
  premissasDoAmbiente,
  rotuloDoUso,
  type Atividade,
  type HipotesesDoAmbiente,
  type OrigemDoDado,
} from '../../utils/blueprintClimatizacaoAmbientes';

/** O que o editor sabe de cada ambiente do pavimento ativo — o `uid` é o da ETIQUETA (sem ela, não há onde declarar). */
export interface AmbienteParaClima {
  spaceId: ObjectId;
  uid: string | null;
  rotulo: string;
  areaPisoM2: number;
  peDireitoMm: number;
  acabamentos?: AcabamentosDoAmbiente;
}

interface Props {
  hip: HipotesesClimatizacao;
  onHip: (h: HipotesesClimatizacao) => void;
  /** O clima em vigor, derivado das premissas + georreferência + contexto urbanístico. */
  condicoes: CondicoesExternas;
  /** E0.3: os ambientes do pavimento ativo. */
  ambientes: AmbienteParaClima[];
  nomeDoPavimento: string;
  onSelecionar?: (spaceId: ObjectId) => void;
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
const ORIGEM_DO_DADO: Record<OrigemDoDado, string> = { DECLARADA: 'declarado', USO: 'padrão do uso', ESTUDO: 'do estudo', SEM: 'sem uso reconhecido' };

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

/** Campo numérico ANULÁVEL: vazio = derivar (o placeholder mostra o valor em uso e o `title` a origem). */
function CampoDerivavel({ valor, onValor, rotulo, faixa, passo, unidade, emUso, inteiro }: { valor: number | null; onValor: (v: number | null) => void; rotulo: string; faixa: { min: number; max: number }; passo: number; unidade: string; emUso: { valor: number | null; origem: string }; inteiro?: boolean }) {
  const [texto, setTexto] = React.useState(valor == null ? '' : String(valor));
  React.useEffect(() => setTexto(valor == null ? '' : String(valor)), [valor]);
  const n = Number(texto.replace(',', '.'));
  const aceita = (v: number) => Number.isFinite(v) && v >= faixa.min && v <= faixa.max && (!inteiro || Number.isInteger(v));
  const invalido = texto.trim() !== '' && !aceita(n);
  return (
    <label className="flex items-center gap-1.5" title={emUso.valor == null ? 'Sem valor em uso' : `Em uso: ${num(emUso.valor, inteiro ? 0 : 1)} ${unidade} (${emUso.origem})`}>
      {rotulo}
      <input
        type="number"
        min={faixa.min}
        max={faixa.max}
        step={passo}
        value={texto}
        placeholder={emUso.valor == null ? '—' : num(emUso.valor, inteiro ? 0 : 1)}
        onChange={(e) => {
          setTexto(e.target.value);
          const t = e.target.value.trim();
          if (t === '') {
            onValor(null);
            return;
          }
          const v = Number(t.replace(',', '.'));
          if (aceita(v)) onValor(v);
        }}
        aria-label={rotulo}
        aria-invalid={invalido}
        className={`w-20 ${campo} ${invalido ? 'border-red-400' : ''}`}
      />
      <span className="text-slate-500">{unidade}</span>
    </label>
  );
}

/** E0.3: o editor de UM ambiente — cada campo vazio = derivar; o placeholder mostra o que vale. */
function EditorDoAmbiente({ a, declarado, onDeclarar, temperaturaDoEstudoC }: { a: AmbienteParaClima; declarado: HipotesesDoAmbiente; onDeclarar: (h: HipotesesDoAmbiente) => void; temperaturaDoEstudoC: number }) {
  const p = premissasDoAmbiente(declarado, { nome: a.rotulo, areaPisoM2: a.areaPisoM2, peDireitoMm: a.peDireitoMm, acabamentos: a.acabamentos, temperaturaDoEstudoC });
  const set = (parte: Partial<HipotesesDoAmbiente>) => onDeclarar({ ...declarado, ...parte });
  const uso = rotuloDoUso(p.uso);
  return (
    <div className="space-y-2 text-xs text-slate-600" data-testid={`clima-ambiente-${a.spaceId}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <label className="flex items-center gap-1.5">
          Climatizado
          <select
            value={declarado.climatizado == null ? '' : declarado.climatizado ? 'sim' : 'nao'}
            onChange={(e) => set({ climatizado: e.target.value === '' ? null : e.target.value === 'sim' })}
            aria-label={`Climatizado — ${a.rotulo}`}
            className={campo}
          >
            <option value="">{`padrão (${p.climatizado.valor ? 'sim' : 'não'}${uso ? `, ${uso.toLowerCase()}` : ''})`}</option>
            <option value="sim">sim</option>
            <option value="nao">não</option>
          </select>
        </label>
        <CampoDerivavel rotulo="Setpoint" valor={declarado.temperaturaInternaC} onValor={(temperaturaInternaC) => set({ temperaturaInternaC })} faixa={LIMITES_DO_AMBIENTE.temperaturaInternaC} passo={0.5} unidade="°C" emUso={{ valor: p.temperaturaInternaC.valor, origem: ORIGEM_DO_DADO[p.temperaturaInternaC.origem] }} />
        <CampoDerivavel rotulo="Pessoas" valor={declarado.pessoas} onValor={(pessoas) => set({ pessoas })} faixa={LIMITES_DO_AMBIENTE.pessoas} passo={1} unidade="" emUso={{ valor: p.pessoas.valor, origem: ORIGEM_DO_DADO[p.pessoas.origem] }} inteiro />
        <label className="flex items-center gap-1.5">
          Atividade
          <select value={declarado.atividade ?? ''} onChange={(e) => set({ atividade: (e.target.value || null) as Atividade | null })} aria-label={`Atividade — ${a.rotulo}`} className={campo}>
            <option value="">{`padrão (${ROTULO_DA_ATIVIDADE[p.atividade.valor].toLowerCase()})`}</option>
            {ATIVIDADES.map((at) => (
              <option key={at} value={at}>{ROTULO_DA_ATIVIDADE[at]}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <CampoDerivavel rotulo="Iluminação" valor={declarado.iluminacaoWm2} onValor={(iluminacaoWm2) => set({ iluminacaoWm2 })} faixa={LIMITES_DO_AMBIENTE.iluminacaoWm2} passo={1} unidade="W/m²" emUso={{ valor: p.iluminacaoWm2.valor, origem: ORIGEM_DO_DADO[p.iluminacaoWm2.origem] }} />
        <CampoDerivavel rotulo="Equipamentos" valor={declarado.equipamentosW} onValor={(equipamentosW) => set({ equipamentosW })} faixa={LIMITES_DO_AMBIENTE.equipamentosW} passo={50} unidade="W" emUso={{ valor: p.equipamentosW.valor, origem: ORIGEM_DO_DADO[p.equipamentosW.origem] }} />
        <CampoDerivavel rotulo="Fonte extra sensível" valor={declarado.fonteSensivelW} onValor={(fonteSensivelW) => set({ fonteSensivelW })} faixa={LIMITES_DO_AMBIENTE.fonteW} passo={50} unidade="W" emUso={{ valor: null, origem: '' }} />
        <CampoDerivavel rotulo="Fonte extra latente" valor={declarado.fonteLatenteW} onValor={(fonteLatenteW) => set({ fonteLatenteW })} faixa={LIMITES_DO_AMBIENTE.fonteW} passo={50} unidade="W" emUso={{ valor: null, origem: '' }} />
      </div>
      <p className="text-[11px] text-slate-500">
        Em uso: {p.climatizado.valor ? 'climatizado' : 'não climatizado'} · {p.pessoas.valor} pessoa(s), {ROTULO_DA_ATIVIDADE[p.atividade.valor].toLowerCase()} · iluminação {p.iluminacaoW} W · equipamentos {p.equipamentosW.valor} W · setpoint {num(p.temperaturaInternaC.valor)} °C · volume {num(p.volumeM3, 1)} m³ (pé-direito livre {num(p.peDireitoLivreMm / 1000, 2)} m)
      </p>
    </div>
  );
}

export default function PainelClimatizacao({ hip, onHip, condicoes: c, ambientes, nomeDoPavimento, onSelecionar, persistenciaIndisponivel }: Props) {
  const conf = hip.conforto;
  const clima = hip.clima;
  const cidades = Object.keys(CLIMA_POR_CIDADE);
  const cidadeNoSelect = clima.cidade && cidades.includes(clima.cidade) ? clima.cidade : '';
  const [aberto, setAberto] = React.useState<ObjectId | null>(null);
  const declarar = (uid: string, h: HipotesesDoAmbiente) => {
    const { [uid]: _antigo, ...resto } = hip.ambientes;
    void _antigo;
    onHip({ ...hip, ambientes: ambienteSemDeclaracao(h) ? resto : { ...resto, [uid]: h } });
  };
  const semEtiqueta = ambientes.filter((a) => !a.uid).length;
  const declarados = ambientes.filter((a) => a.uid && hip.ambientes[a.uid]).length;
  const algumDoUso = ambientes.some((a) => premissasDoAmbiente(a.uid ? hip.ambientes[a.uid] : undefined, { nome: a.rotulo, areaPisoM2: a.areaPisoM2, peDireitoMm: a.peDireitoMm, acabamentos: a.acabamentos, temperaturaDoEstudoC: conf.temperaturaInternaC }).conferir);

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
          Valem para todos os ambientes climatizados do estudo (cada ambiente pode ter o seu setpoint abaixo). {FONTE_DO_CONFORTO}
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
          <CampoDerivavel rotulo="TBS externa" valor={clima.tbsExternaC} onValor={(tbsExternaC) => onHip({ ...hip, clima: { ...clima, tbsExternaC } })} faixa={LIMITES_DO_CLIMA.tbsExternaC} passo={0.1} unidade="°C" emUso={{ valor: c.tbsC.valor, origem: ORIGEM[c.tbsC.origem] }} />
          <CampoDerivavel rotulo="TBU externa" valor={clima.tbuExternaC} onValor={(tbuExternaC) => onHip({ ...hip, clima: { ...clima, tbuExternaC } })} faixa={LIMITES_DO_CLIMA.tbuExternaC} passo={0.1} unidade="°C" emUso={{ valor: c.tbuC.valor, origem: ORIGEM[c.tbuC.origem] }} />
          <CampoDerivavel rotulo="Altitude" valor={clima.altitudeM} onValor={(altitudeM) => onHip({ ...hip, clima: { ...clima, altitudeM } })} faixa={LIMITES_DO_CLIMA.altitudeM} passo={10} unidade="m" emUso={{ valor: c.altitudeM.valor, origem: ORIGEM[c.altitudeM.origem] }} />
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

      {/* E0.3: por ambiente — a mesma tabela compacta do painel de acabamentos (mesma gaveta, mesma família). */}
      <section className="space-y-1.5" data-testid="clima-por-ambiente">
        <h4 className="text-xs font-semibold text-slate-500">Por ambiente — {nomeDoPavimento}</h4>
        <p className="text-[11px] text-slate-500">
          <strong>{declarados} de {ambientes.length} ambiente(s)</strong> com algo declarado; o resto segue o padrão do uso pelo nome.
          {semEtiqueta > 0 && <span className="text-amber-800"> {semEtiqueta} sem etiqueta — nomeie o ambiente para declarar.</span>}
        </p>
        {ambientes.length === 0 ? (
          <p className="text-[11px] text-slate-400">Nenhum ambiente fechado neste pavimento.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="tabela-clima-ambientes">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-1 pr-2 font-medium">Ambiente</th>
                  <th className="py-1 pr-2 font-medium">Uso</th>
                  <th className="py-1 pr-2 font-medium">Climatizado</th>
                  <th className="py-1 pr-2 text-right font-medium">Pessoas</th>
                  <th className="py-1 pr-2 text-right font-medium">Setpoint</th>
                  <th className="py-1 pr-2 text-right font-medium">Volume (m³)</th>
                  <th className="py-1 font-medium" />
                </tr>
              </thead>
              <tbody>
                {ambientes.map((a) => {
                  const declarado = (a.uid && hip.ambientes[a.uid]) || HIPOTESES_DO_AMBIENTE_VAZIAS;
                  const p = premissasDoAmbiente(a.uid ? hip.ambientes[a.uid] : undefined, { nome: a.rotulo, areaPisoM2: a.areaPisoM2, peDireitoMm: a.peDireitoMm, acabamentos: a.acabamentos, temperaturaDoEstudoC: conf.temperaturaInternaC });
                  const marca = (origem: OrigemDoDado) => (origem === 'DECLARADA' ? '' : ' *');
                  return (
                    <React.Fragment key={a.spaceId}>
                      <tr className={`border-t border-slate-100 ${aberto === a.spaceId ? 'bg-blue-50/40' : ''}`} aria-label={`Ambiente ${a.rotulo}`}>
                        <td className="py-1.5 pr-2">
                          <button type="button" onClick={() => onSelecionar?.(a.spaceId)} className="font-medium text-slate-800 hover:underline">{a.rotulo}</button>
                        </td>
                        <td className="py-1.5 pr-2 text-slate-700">{rotuloDoUso(p.uso) ?? <span className="text-slate-400">—</span>}</td>
                        <td className="py-1.5 pr-2 text-slate-700">{p.climatizado.valor ? 'sim' : 'não'}{marca(p.climatizado.origem)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{p.pessoas.valor}{marca(p.pessoas.origem)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{num(p.temperaturaInternaC.valor)} °C</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{num(p.volumeM3)}</td>
                        <td className="py-1.5 text-right">
                          {a.uid ? (
                            <button type="button" onClick={() => setAberto(aberto === a.spaceId ? null : a.spaceId)} aria-label={`Declarar climatização de ${a.rotulo}`} className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50">
                              {aberto === a.spaceId ? 'Fechar' : 'Editar'}
                            </button>
                          ) : (
                            <span className="text-[10px] text-amber-800" title="Nomeie o ambiente (etiqueta) para declarar">sem etiqueta</span>
                          )}
                        </td>
                      </tr>
                      {aberto === a.spaceId && a.uid && (
                        <tr className="border-t border-slate-100 bg-slate-50/60">
                          <td colSpan={7} className="px-2 py-3">
                            <EditorDoAmbiente a={a} declarado={declarado} onDeclarar={(h) => declarar(a.uid!, h)} temperaturaDoEstudoC={conf.temperaturaInternaC} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-slate-500">
          * = padrão do uso, não declarado.{algumDoUso ? ` ${FONTE_DO_PADRAO_POR_USO}` : ''} O volume usa o pé-direito livre (do piso acabado à face do forro).
        </p>
      </section>
    </div>
  );
}
