/**
 * A gaveta "Vagas" (19/09/2026, E2.5): hipóteses do lançamento automático,
 * região, o plano (quantas cabem, por tipo), a conferência dos mínimos e da
 * exigência, e os botões Lançar / Relançar / Aceitar / Apagar sugeridas.
 * Apresentacional, no molde da gaveta de pilares: o plano vem pronto de
 * `planejarVagas`.
 */
import React from 'react';
import type { BlueprintModel, ObjectId, TipoDeVaga } from '../../utils/blueprintKernel';
import { ROTULO_DO_TIPO_DE_VAGA } from '../../utils/blueprintKernel';
import { ROTULO_DO_ARRANJO, type ArranjoDasVagas,
  ambientesCandidatos,
  type HipotesesDeVagas,
  type OrientacaoDasFileiras,
  type PlanoDeVagas,
  type RegiaoDeVagas,
} from '../../utils/blueprintVagasAutomaticas';

interface Props {
  model: BlueprintModel;
  levelId: ObjectId | null;
  hipoteses: HipotesesDeVagas;
  onHipoteses: (h: HipotesesDeVagas) => void;
  regiao: RegiaoDeVagas | null;
  onRegiao: (r: RegiaoDeVagas | null) => void;
  plano: PlanoDeVagas;
  sugeridasNoNivel: number;
  onLancar: () => void;
  onAceitar: () => void;
  onApagarSugeridas: () => void;
  resultado: string | null;
}

const campo = 'rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-normal text-slate-800';

export default function PainelVagas({ model, levelId, hipoteses: h, onHipoteses, regiao, onRegiao, plano, sugeridasNoNivel, onLancar, onAceitar, onApagarSugeridas, resultado }: Props) {
  const num = (k: keyof HipotesesDeVagas, v: string, inteiro = true) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    onHipoteses({ ...h, [k]: inteiro ? Math.round(n) : n });
  };
  const candidatos = levelId ? ambientesCandidatos(model, levelId) : [];
  const r = plano.resumo;
  const tipos: TipoDeVaga[] = ['COMUM', 'PCD', 'IDOSO', 'MOTO'];
  return (
    <div className="space-y-4 text-xs text-slate-700" data-testid="tarefa-vagas">
      <p className="text-slate-600">
        Fileiras de vagas com faixa de circulação entre elas, dentro da região escolhida; pilares, paredes, núcleos e vagas já confirmadas são obstáculo. As vagas nascem{' '}
        <strong>sugeridas</strong> (tracejadas): mover ou aceitar confirma; Ctrl+Z desfaz o lote.
      </p>

      <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-2">
        <p className="font-semibold text-slate-700">Hipóteses</p>
        <div className="mt-1 grid grid-cols-3 gap-2">
          <label className="flex flex-col gap-1">
            Largura (mm)
            <input type="number" step={50} value={h.larguraMm} onChange={(e) => num('larguraMm', e.target.value)} aria-label="Largura da vaga (mm)" className={campo} />
          </label>
          <label className="flex flex-col gap-1">
            Comprimento (mm)
            <input type="number" step={50} value={h.comprimentoMm} onChange={(e) => num('comprimentoMm', e.target.value)} aria-label="Comprimento da vaga (mm)" className={campo} />
          </label>
          <label className="flex flex-col gap-1">
            Circulação (mm)
            <input type="number" step={100} value={h.circulacaoMm} onChange={(e) => num('circulacaoMm', e.target.value)} aria-label="Faixa de circulação (mm)" className={campo} />
          </label>
          <label className="flex flex-col gap-1">
            Fileiras
            <select value={h.orientacao} onChange={(e) => onHipoteses({ ...h, orientacao: e.target.value as OrientacaoDasFileiras })} aria-label="Orientação das fileiras" className={campo}>
              <option value="AUTO">No eixo mais comprido</option>
              <option value="FILEIRAS_EM_X">Ao longo de X</option>
              <option value="FILEIRAS_EM_Y">Ao longo de Y</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Arranjo
            <select value={h.arranjo ?? 'PERPENDICULAR'} onChange={(e) => onHipoteses({ ...h, arranjo: e.target.value as ArranjoDasVagas })} aria-label="Arranjo das vagas na fileira" className={campo} title="De ré: a vaga perpendicular à circulação (90°). Espinha de peixe: 45°, banda mais funda e circulação mais estreita (3,50 m). Em fila: paralela à circulação, com 1,00 m de manobra entre vagas.">
              {(Object.keys(ROTULO_DO_ARRANJO) as ArranjoDasVagas[]).map((a) => (
                <option key={a} value={a}>{ROTULO_DO_ARRANJO[a]}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            PCD (%)
            <input type="number" step={1} min={0} value={h.pcdPct} onChange={(e) => num('pcdPct', e.target.value, false)} aria-label="Percentual mínimo de vagas PCD" className={campo} />
          </label>
          <label className="flex flex-col gap-1">
            Idoso (%)
            <input type="number" step={1} min={0} value={h.idosoPct} onChange={(e) => num('idosoPct', e.target.value, false)} aria-label="Percentual mínimo de vagas para idosos" className={campo} />
          </label>
          <label className="flex flex-col gap-1">
            Moto (%)
            <input type="number" step={1} min={0} value={h.motoPct} onChange={(e) => num('motoPct', e.target.value, false)} aria-label="Percentual de vagas de moto" className={campo} />
          </label>
          <label className="flex flex-col gap-1">
            Vagas por unidade
            <input type="number" step={0.5} min={0} value={h.vagasPorUnidade ?? ''} onChange={(e) => onHipoteses({ ...h, vagasPorUnidade: e.target.value === '' ? null : Number(e.target.value) })} aria-label="Vagas exigidas por unidade" className={campo} />
          </label>
          <label className="flex flex-col gap-1">
            Exigência (nº)
            <input type="number" step={1} min={0} value={h.exigenciaManual ?? ''} placeholder="da zona" onChange={(e) => onHipoteses({ ...h, exigenciaManual: e.target.value === '' ? null : Number(e.target.value) })} aria-label="Exigência de vagas (número)" className={campo} />
          </label>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500">
          PCD 2 % e ≥ 1 (Lei 10.098 / NBR 9050, com a faixa de 1,20 m → 3,70 m); idoso 5 % e ≥ 1 (Lei 10.741). A exigência vem do número manual ou de vagas × unidades (E2.2); a zona (E3) vai alimentá-la.
        </p>
      </div>

      <label className="flex items-center gap-2">
        Região
        <select
          value={regiao?.tipo === 'AMBIENTE' ? regiao.spaceId : regiao?.tipo === 'PAVIMENTO' ? '__pav__' : ''}
          onChange={(e) => onRegiao(e.target.value === '' ? null : e.target.value === '__pav__' ? { tipo: 'PAVIMENTO' } : { tipo: 'AMBIENTE', spaceId: e.target.value })}
          aria-label="Região onde lançar as vagas"
          className={`${campo} flex-1`}
        >
          <option value="">Automática (ambiente "Garagem", senão o contorno do pavimento)</option>
          <option value="__pav__">Contorno externo do pavimento</option>
          {candidatos.map((c) => (
            <option key={c.spaceId} value={c.spaceId}>
              {c.nome} · {c.areaM2.toFixed(2).replace('.', ',')} m²
            </option>
          ))}
        </select>
      </label>

      <div className="rounded-[10px] border border-slate-200 bg-white px-3 py-2" data-testid="plano-de-vagas">
        <p className="font-semibold text-slate-700">
          {plano.regiao ? `Em "${plano.regiao.nome}": ` : ''}
          {plano.vagas.length > 0 ? `${plano.vagas.length} vaga(s) a lançar` : plano.motivo ?? 'Nada a lançar'}
          {plano.substituidas.length > 0 ? ` (substitui ${plano.substituidas.length} sugerida(s))` : ''}
        </p>
        <dl className="mt-1 grid grid-cols-4 gap-1 text-[11px]">
          {tipos.map((t) => (
            <div key={t}>
              <dt className="text-slate-500">{ROTULO_DO_TIPO_DE_VAGA[t]}</dt>
              <dd className="font-semibold text-slate-800">{r.porTipo[t]}</dd>
            </div>
          ))}
        </dl>
        <ul className="mt-1.5 space-y-0.5 text-[11px]">
          <li className={r.porTipo.PCD >= r.pcdMinimo ? 'text-emerald-700' : 'text-amber-700'}>
            PCD: {r.porTipo.PCD} de {r.pcdMinimo} mínimas
          </li>
          <li className={r.porTipo.IDOSO >= r.idosoMinimo ? 'text-emerald-700' : 'text-amber-700'}>
            Idoso: {r.porTipo.IDOSO} de {r.idosoMinimo} mínimas
          </li>
          <li className={r.faltam === null ? 'text-slate-500' : r.faltam === 0 ? 'text-emerald-700' : 'text-amber-700'}>
            {r.exigencia === null ? 'Sem exigência declarada' : r.faltam === 0 ? `Atende a exigência (${r.total} de ${r.exigencia})` : `Faltam ${r.faltam} para a exigência de ${r.exigencia} (${r.total} no pavimento)`}
          </li>
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onLancar} disabled={plano.vagas.length === 0} className="rounded-md bg-slate-900 px-3 py-1.5 font-semibold text-white disabled:opacity-40">
          {plano.substituidas.length > 0 ? 'Relançar' : 'Lançar'}
        </button>
        <button type="button" onClick={onAceitar} disabled={sugeridasNoNivel === 0} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 disabled:opacity-40">
          Aceitar {sugeridasNoNivel || ''} sugerida(s)
        </button>
        <button type="button" onClick={onApagarSugeridas} disabled={sugeridasNoNivel === 0} className="rounded-md border border-red-200 bg-white px-3 py-1.5 font-medium text-red-700 disabled:opacity-40">
          Apagar sugeridas
        </button>
      </div>
      {resultado && (
        <p role="status" className="text-[11px] text-slate-600">
          {resultado}
        </p>
      )}
    </div>
  );
}
