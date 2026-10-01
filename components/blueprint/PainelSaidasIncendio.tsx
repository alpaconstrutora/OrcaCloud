/**
 * INCÊNDIO — saídas de emergência (01/10/2026, E6.1 do roadmap de incêndio):
 * a população de cada pavimento e a largura exigida × a desenhada das escadas,
 * dos corredores e das saídas para o exterior. Tudo derivado
 * (`blueprintSaidasIncendio`); só as premissas gravam.
 */
import React from 'react';
import { PROTECOES_DE_ESCADA, type ObjectId, type ProtecaoDaEscada } from '../../utils/blueprintKernel';
import { ROTULO_DA_PROTECAO, type AnaliseDeSaidas, type HipotesesDeSaidas } from '../../utils/blueprintSaidasIncendio';

interface Props {
  analise: AnaliseDeSaidas;
  hip: HipotesesDeSaidas;
  onHip: (h: HipotesesDeSaidas) => void;
  onSelecionar: (ids: ObjectId[]) => void;
  /** E6.2: declarar a proteção da escada (`null` = não declarada). */
  onProtecao?: (escadaId: ObjectId, p: ProtecaoDaEscada | null) => void;
  /** E6.2: marcar as portas como corta-fogo (um lote). */
  onCortaFogo?: (openingIds: ObjectId[]) => void;
}

const n = (v: number, casas = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const m = (mm: number) => `${n(mm / 1000, 2)} m`;
const campo = 'w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums';
const ROTULO_DO_TIPO = { ESCADA: 'Escada', CORREDOR: 'Corredor', DESCARGA: 'Descarga' } as const;

export default function PainelSaidasIncendio({ analise: a, hip, onHip, onSelecionar, onProtecao, onCortaFogo }: Props) {
  const falta = a.itens.filter((i) => !i.atende);
  return (
    <div className="space-y-3" data-testid="saidas-incendio">
      <div>
        <h4 className="text-xs font-semibold text-slate-700">Saídas de emergência</h4>
        <p className="text-[11px] text-slate-500">População e unidades de passagem (0,55 m) — {a.fonte}.</p>
      </div>

      <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs text-slate-600 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-2">
          <span>Pessoas por dormitório</span>
          <input
            type="number"
            min={1}
            step={1}
            value={hip.pessoasPorDormitorio}
            onChange={(e) => {
              const x = Number(e.target.value);
              if (Number.isFinite(x) && x > 0) onHip({ ...hip, pessoasPorDormitorio: x });
            }}
            aria-label="Pessoas por dormitório"
            className={campo}
          />
        </label>
        <label className="flex items-center justify-between gap-2">
          <span>
            m² por pessoa <span className="text-slate-400">(vazio = tabela)</span>
          </span>
          <input
            type="number"
            min={0}
            step={0.5}
            value={hip.areaPorPessoaM2 ?? ''}
            onChange={(e) => {
              if (e.target.value === '') return onHip({ ...hip, areaPorPessoaM2: null });
              const x = Number(e.target.value);
              if (Number.isFinite(x) && x > 0) onHip({ ...hip, areaPorPessoaM2: x });
            }}
            aria-label="m² por pessoa"
            className={campo}
          />
        </label>
      </div>

      {a.pendencias.map((p) => (
        <p key={p} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
          {p}
        </p>
      ))}

      <table className="w-full text-xs" data-testid="saidas-populacao">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-1 pr-2 font-medium">Pavimento</th>
            <th className="py-1 pr-2 text-right font-medium">População</th>
            <th className="py-1 text-right font-medium">Base</th>
          </tr>
        </thead>
        <tbody>
          {a.populacao.map((p) => (
            <tr key={p.levelId} className="border-b border-slate-100 text-slate-700">
              <td className="py-1.5 pr-2">{p.nome}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{p.pessoas}</td>
              <td className="py-1.5 text-right text-slate-500">{p.origem === 'DORMITORIOS' ? `${p.base} dormitório(s)` : `${n(p.base, 0)} m²`}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {a.itens.length === 0 ? (
        <p className="text-xs text-slate-500">Nenhuma escada, corredor ou saída para conferir.</p>
      ) : (
        <table className="w-full text-xs" data-testid="saidas-larguras">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-1 pr-2 font-medium">Onde</th>
              <th className="py-1 pr-2 text-right font-medium">Exigida</th>
              <th className="py-1 text-right font-medium">Desenhada</th>
            </tr>
          </thead>
          <tbody>
            {a.itens.map((i) => (
              <tr key={`${i.tipo}|${i.alvoId}`} className="border-b border-slate-100 align-top text-slate-700">
                <td className="py-1.5 pr-2">
                  <span className="text-slate-400">{ROTULO_DO_TIPO[i.tipo]} · </span>
                  <button type="button" className="text-left text-blue-700 hover:underline" onClick={() => onSelecionar([i.alvoId])}>
                    {i.rotulo}
                  </button>
                  <div className="text-[11px] text-slate-500">
                    {i.pessoas} pessoa(s) ({i.pavimentoCritico}) → {i.unidades} unidade(s) de passagem
                  </div>
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{m(i.exigidaMm)}</td>
                <td className={`py-1.5 text-right tabular-nums ${i.atende ? 'text-emerald-700' : 'font-semibold text-red-700'}`}>{m(i.desenhadaMm)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {a.protecao.length > 0 && (
        <div data-testid="saidas-protecao">
          <h5 className="mb-1 text-xs font-semibold text-slate-700">Proteção das escadas</h5>
          <ul className="space-y-2">
            {a.protecao.map((p) => (
              <li key={p.escadaId} className="text-xs text-slate-700">
                <div className="flex items-center justify-between gap-2">
                  <button type="button" className="text-left text-blue-700 hover:underline" onClick={() => onSelecionar([p.escadaId])}>
                    {p.rotulo}
                  </button>
                  <select
                    value={p.declarada ?? ''}
                    disabled={!onProtecao}
                    onChange={(e) => onProtecao?.(p.escadaId, (e.target.value || null) as ProtecaoDaEscada | null)}
                    aria-label={`Proteção da ${p.rotulo}`}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                  >
                    <option value="">Não declarada</option>
                    {PROTECOES_DE_ESCADA.map((x) => (
                      <option key={x} value={x}>{ROTULO_DA_PROTECAO[x]}</option>
                    ))}
                  </select>
                </div>
                <div className={`text-[11px] ${p.atende === false ? 'font-semibold text-red-700' : 'text-slate-500'}`}>
                  {p.exigida ? `Exigida: ${ROTULO_DA_PROTECAO[p.exigida].toLowerCase()} (${p.motivo})` : `Exigida: ${p.motivo}`}
                  {p.atende === false && ' — a declarada não basta'}
                  {p.atende === null && p.exigida && ' — declare a proteção'}
                </div>
                {p.semCaixa && <div className="text-[11px] text-red-700">A escada não está numa caixa própria em algum pavimento (ambiente fechado só dela: "escada" no nome, ou até 40 m²).</div>}
                {p.portasSemCortaFogo.length > 0 && (
                  <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-red-700">
                    <button type="button" className="text-left hover:underline" onClick={() => onSelecionar(p.portasSemCortaFogo)}>
                      {p.portasSemCortaFogo.length} porta(s) da caixa sem corta-fogo
                    </button>
                    <button
                      type="button"
                      disabled={!onCortaFogo}
                      onClick={() => onCortaFogo?.(p.portasSemCortaFogo)}
                      className="shrink-0 whitespace-nowrap rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      title="Marca as portas como corta-fogo — um passo de desfazer"
                    >
                      Marcar corta-fogo
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {falta.length > 0 && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-800" data-testid="saidas-falta">
          {falta.length} saída(s) mais estreita(s) que o exigido.
        </p>
      )}
    </div>
  );
}
