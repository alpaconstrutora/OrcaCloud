/**
 * INCÊNDIO — classificação e exigências (30/09/2026, E0.2/E0.3 do roadmap de
 * incêndio): as premissas do estudo (preset do Corpo de Bombeiros, divisão,
 * altura, carga, pavimento de descarga), a classificação que sai do desenho e
 * a lista do que o prédio exige. Tudo derivado — só as premissas são gravadas.
 *
 * O aviso de RASCUNHO fica no topo enquanto alguma linha vier de memória: sem
 * o texto do CBMMG, a lista orienta, não aprova.
 */
import React from 'react';
import type { Level } from '../../utils/blueprintKernel';
import { ATIVIDADES_IT09 } from '../../utils/blueprintIncendioAtividadesMG';
import {
  PRESETS_DE_BOMBEIROS,
  ROTULO_DO_PRESET,
  normalizarDivisao,
  type ClassificacaoDaEdificacao,
  type EstadoDaExigencia,
  type ExigenciasDaEdificacao,
  type HipotesesDeClassificacao,
  type PresetDeBombeiros,
  atividadeDoRotulo,
  rotuloDaAtividade,
} from '../../utils/blueprintIncendioClassificacao';

interface Props {
  hip: HipotesesDeClassificacao;
  onHip: (h: HipotesesDeClassificacao) => void;
  classificacao: ClassificacaoDaEdificacao;
  exigencias: ExigenciasDaEdificacao;
  niveis: readonly Level[];
  /** Sem a tabela no banco: as premissas valem só nesta sessão. */
  persistenciaIndisponivel: boolean;
}

const campo = 'rounded-md border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums';
const num = (v: number, casas = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

const ORIGEM: Record<string, string> = {
  DECLARADA: 'declarada',
  SUGERIDA: 'sugerida pelos ambientes',
  DERIVADA: 'derivada dos pavimentos',
  TABELA: 'tabela da IT 09',
  SEM: 'sem valor',
};

const ESTADO: Record<EstadoDaExigencia, { rotulo: string; cor: string }> = {
  EXIGIDA: { rotulo: 'Exigida', cor: 'bg-red-50 text-red-700 border-red-200' },
  DISPENSADA: { rotulo: 'Dispensada', cor: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  CONDICIONAL: { rotulo: 'Condicional', cor: 'bg-amber-50 text-amber-800 border-amber-200' },
  SEM_TABELA: { rotulo: 'Sem tabela', cor: 'bg-slate-50 text-slate-600 border-slate-200' },
};

/** Campo numérico anulável: vazio = derivar. */
function CampoNumero({ valor, onValor, rotulo, placeholder, passo }: { valor: number | null; onValor: (v: number | null) => void; rotulo: string; placeholder: string; passo: number }) {
  return (
    <input
      type="number"
      min={0}
      step={passo}
      value={valor ?? ''}
      placeholder={placeholder}
      onChange={(e) => {
        const n = Number(e.target.value.replace(',', '.'));
        onValor(e.target.value.trim() && Number.isFinite(n) && n >= 0 ? n : null);
      }}
      aria-label={rotulo}
      className={`w-24 ${campo}`}
    />
  );
}

export default function PainelIncendio({ hip, onHip, classificacao: c, exigencias: e, niveis, persistenciaIndisponivel }: Props) {
  const [divisaoDigitada, setDivisaoDigitada] = React.useState(hip.divisao ?? '');
  const [atividadeDigitada, setAtividadeDigitada] = React.useState(hip.atividade ?? '');
  React.useEffect(() => setAtividadeDigitada(hip.atividade ?? ''), [hip.atividade]);
  const atividadeInvalida = atividadeDigitada.trim() !== '' && !atividadeDoRotulo(atividadeDigitada);
  React.useEffect(() => setDivisaoDigitada(hip.divisao ?? ''), [hip.divisao]);
  const divisaoInvalida = divisaoDigitada.trim() !== '' && normalizarDivisao(divisaoDigitada) == null;

  return (
    <div className="space-y-3" data-testid="incendio">
      {persistenciaIndisponivel && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800" data-testid="incendio-sem-persistencia">
          As premissas de incêndio ainda não têm onde ser gravadas no estudo: valem só nesta sessão.
        </p>
      )}
      {e.temRascunho && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-800" data-testid="incendio-rascunho">
          <strong>Rascunho — não use para aprovação.</strong> As linhas marcadas vieram de memória, sem o texto do Decreto e
          das ITs do CBMMG. Elas orientam o projeto até o texto ser conferido.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-600">
        <label className="flex items-center gap-1.5">
          Corpo de Bombeiros
          <select value={hip.preset} onChange={(ev) => onHip({ ...hip, preset: ev.target.value as PresetDeBombeiros })} aria-label="Corpo de Bombeiros do regulamento" className={campo}>
            {PRESETS_DE_BOMBEIROS.map((p) => (
              <option key={p} value={p}>{ROTULO_DO_PRESET[p]}</option>
            ))}
          </select>
        </label>
        {/* D1.3: a atividade da IT 09 (Tabela A.1) dá a divisão e a carga de incêndio. */}
        <label className="flex min-w-0 items-center gap-1.5">
          Atividade
          <input
            type="text"
            list="incendio-atividades-it09"
            value={atividadeDigitada}
            placeholder="busque na Tabela A.1 da IT 09"
            onChange={(ev) => {
              const v = ev.target.value;
              setAtividadeDigitada(v);
              if (v.trim() === '') onHip({ ...hip, atividade: null });
              else if (atividadeDoRotulo(v)) onHip({ ...hip, atividade: v });
            }}
            aria-label="Atividade da edificação (IT 09, Tabela A.1)"
            aria-invalid={atividadeInvalida}
            className={`w-64 min-w-0 ${campo} ${atividadeInvalida ? 'border-red-400' : ''}`}
          />
          <datalist id="incendio-atividades-it09">
            {ATIVIDADES_IT09.map((a) => (
              <option key={rotuloDaAtividade(a)} value={rotuloDaAtividade(a)} />
            ))}
          </datalist>
        </label>
        <label className="flex items-center gap-1.5">
          Divisão
          <input
            type="text"
            value={divisaoDigitada}
            placeholder={c.divisao.origem === 'SUGERIDA' ? (c.divisao.valor ?? '') : 'ex.: A-2'}
            onChange={(ev) => {
              setDivisaoDigitada(ev.target.value);
              const d = normalizarDivisao(ev.target.value);
              if (d || ev.target.value.trim() === '') onHip({ ...hip, divisao: d });
            }}
            aria-label="Divisão de ocupação declarada (vazio = sugerida pelos ambientes)"
            aria-invalid={divisaoInvalida}
            className={`w-20 ${campo} ${divisaoInvalida ? 'border-red-400' : ''}`}
          />
        </label>
        <label className="flex items-center gap-1.5">
          Pavimento de descarga
          <select
            value={hip.pisoDeDescargaLevelId ?? ''}
            onChange={(ev) => onHip({ ...hip, pisoDeDescargaLevelId: ev.target.value || null })}
            aria-label="Pavimento de descarga (vazio = o de cota mais próxima de zero)"
            className={campo}
          >
            <option value="">— cota mais próxima de 0 —</option>
            {niveis.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          Altura (m)
          <CampoNumero valor={hip.alturaDeclaradaM} onValor={(v) => onHip({ ...hip, alturaDeclaradaM: v })} rotulo="Altura para incêndio declarada, em m (vazio = derivada)" placeholder="derivada" passo={0.1} />
        </label>
        <label className="flex items-center gap-1.5">
          Carga (MJ/m²)
          <CampoNumero valor={hip.cargaDeclaradaMJm2} onValor={(v) => onHip({ ...hip, cargaDeclaradaMJm2: v })} rotulo="Carga de incêndio declarada, em MJ/m² (vazio = tabela da divisão)" placeholder="da tabela" passo={10} />
        </label>
      </div>
      {divisaoInvalida && <p className="text-xs text-red-700">Divisão no formato letra-número, de A a M (ex.: A-2, C-1).</p>}

      {c.pendencias.map((p) => (
        <p key={p} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800" data-testid="incendio-pendencia">
          {p}
        </p>
      ))}

      <table className="w-full text-xs" data-testid="incendio-classificacao">
        <tbody>
          <tr className="border-b border-slate-100">
            <td className="py-1.5 pr-2 text-slate-500">Ocupação</td>
            <td className="py-1.5 text-slate-800">
              {c.divisao.valor ? <strong>{c.divisao.valor}</strong> : '—'}
              {c.grupo && ` · ${c.grupo.nome}`}
              <span className="text-slate-500"> — {ORIGEM[c.divisao.origem]}{c.divisao.origem !== 'DECLARADA' ? ` (${c.divisao.motivo})` : ''}</span>
            </td>
          </tr>
          <tr className="border-b border-slate-100">
            <td className="py-1.5 pr-2 text-slate-500">Altura para incêndio</td>
            <td className="py-1.5 text-slate-800">
              <strong className="tabular-nums">{num(c.altura.valorM)} m</strong> · tipo {c.tipoPorAltura.tipo} ({c.tipoPorAltura.nome})
              <span className="text-slate-500">
                {' '}— {ORIGEM[c.altura.origem]}
                {c.altura.origem === 'DERIVADA' && c.altura.descarga && c.altura.ultimo ? ` (de ${c.altura.descarga} a ${c.altura.ultimo})` : ''}
              </span>
            </td>
          </tr>
          <tr className="border-b border-slate-100">
            <td className="py-1.5 pr-2 text-slate-500">Área construída</td>
            <td className="py-1.5 tabular-nums text-slate-800">
              <strong>{num(c.areaTotalM2)} m²</strong> em {c.pavimentos} pavimento(s) · {c.unidades} unidade(s)
            </td>
          </tr>
          <tr>
            <td className="py-1.5 pr-2 text-slate-500">Carga de incêndio</td>
            <td className="py-1.5 text-slate-800">
              {c.carga.valorMJm2 != null ? (
                <>
                  <strong className="tabular-nums">{num(c.carga.valorMJm2, 0)} MJ/m²</strong> · risco {c.carga.nivel?.toLowerCase()}
                  <span className="text-slate-500"> — {ORIGEM[c.carga.origem]}</span>
                </>
              ) : (
                '—'
              )}
            </td>
          </tr>
        </tbody>
      </table>

      <div>
        <h4 className="mb-1 text-xs font-semibold text-slate-700">O que este prédio exige — {ROTULO_DO_PRESET[e.preset]}</h4>
        <table className="w-full text-xs" data-testid="incendio-exigencias">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-1 pr-2 font-medium">Medida</th>
              <th className="py-1 pr-2 font-medium">Situação</th>
              <th className="py-1 font-medium">Por quê</th>
            </tr>
          </thead>
          <tbody>
            {e.medidas.map((m) => (
              <tr key={m.medida} className="border-b border-slate-100 align-top text-slate-700" data-testid={`incendio-medida-${m.medida}`}>
                <td className="py-1.5 pr-2">{m.nome}</td>
                <td className="py-1.5 pr-2">
                  <span className={`inline-block whitespace-nowrap rounded border px-1.5 py-0.5 ${ESTADO[m.estado].cor}`}>{ESTADO[m.estado].rotulo}</span>
                  {m.rascunho && <span className="ml-1 whitespace-nowrap text-[11px] text-red-700">rascunho</span>}
                </td>
                <td className="py-1.5 text-slate-600">
                  {m.motivo}
                  {m.fonte && <span className="block text-[11px] text-slate-400">{m.fonte}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        A altura é a do regulamento de incêndio: do piso do pavimento de descarga ao piso do último pavimento com ambientes
        (barrilete, casa de máquinas e ático não contam). A divisão e a carga saem da atividade (IT 09, Tabela A.1) quando
        não declaradas. "Sem tabela" é o que o texto da IT 01 não cobre (divisão fora das tabelas, G-3 acima de 12 m,
        Tabela 17): nunca é "dispensada".
      </p>
    </div>
  );
}
