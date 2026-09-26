/**
 * LOTEAR QUADRA (B2) — a tarefa que transforma uma quadra desenhada em N lotes.
 *
 * A prévia é a peça central: o loteador escolhe testada e profundidade olhando
 * quantos lotes saem e quanto sobra, e só então aceita. Aceitar é UM lote de
 * comandos — um Ctrl+Z desfaz a quadra inteira.
 */
import React from 'react';
import { LandPlot, Ruler, AlertTriangle } from 'lucide-react';
import type { BlueprintModel, Quadra, ObjectId } from '../../utils/blueprintKernel';
import type { ParametrosDaSubdivisao, PropostaDeSubdivisao } from '../../utils/blueprintLoteamento';
import { areaEmM2 } from '../../utils/blueprintLoteamento';

interface Props {
  model: BlueprintModel;
  levelId: ObjectId | null;
  quadras: Quadra[];
  quadraId: ObjectId | null;
  onQuadra: (id: ObjectId | null) => void;
  parametros: ParametrosDaSubdivisao;
  onParametros: (p: ParametrosDaSubdivisao) => void;
  proposta: PropostaDeSubdivisao | null;
  onAceitar: () => void;
  resultado: string | null;
}

const campo = 'rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-normal text-slate-800';

/** Os lados da quadra, para escolher qual dá para a via. */
function ladosDaQuadra(q: Quadra): { indice: number; rotulo: string }[] {
  return q.pontos.map((p, i) => {
    const b = q.pontos[(i + 1) % q.pontos.length];
    const comp = Math.hypot(b.x - p.x, b.y - p.y) / 1000;
    return { indice: i, rotulo: `Lado ${i + 1} — ${comp.toFixed(2).replace('.', ',')} m` };
  });
}

export default function PainelLotear({
  model,
  levelId,
  quadras,
  quadraId,
  onQuadra,
  parametros: p,
  onParametros,
  proposta,
  onAceitar,
  resultado,
}: Props) {
  const quadra = quadras.find((q) => q.id === quadraId) ?? null;
  const mm = (k: 'testadaMm', v: string) => {
    const n = Number(v.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return;
    onParametros({ ...p, [k]: Math.round(n * 1000) });
  };
  const jaTemLotes = quadra ? (model.lotes ?? []).filter((l) => l.quadraId === quadra.id).length : 0;

  return (
    <div className="space-y-4 text-xs text-slate-700" data-testid="tarefa-lotear">
      <p className="text-slate-600">
        Fatia a quadra em lotes de testada fixa, perpendiculares ao lado que dá para a via. A proposta aparece tracejada no
        desenho e <strong>não grava nada</strong> até você aceitar — e aceitar é um passo só, que um Ctrl+Z desfaz.
      </p>

      {quadras.length === 0 ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-800">
          Nenhuma quadra neste pavimento. Desenhe uma com a ferramenta <strong>Quadra</strong> (aba Terreno) antes de lotear.
        </p>
      ) : (
        <>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-600">Quadra</span>
            <select
              value={quadraId ?? ''}
              onChange={(e) => onQuadra(e.target.value || null)}
              className={campo}
              aria-label="Quadra a lotear"
            >
              <option value="">Escolha a quadra…</option>
              {quadras.map((q) => (
                <option key={q.id} value={q.id}>
                  Quadra {q.nome} — {areaEmM2(q.pontos).toFixed(2).replace('.', ',')} m²
                </option>
              ))}
            </select>
          </label>

          {quadra && (
            <>
              <label className="flex flex-col gap-1">
                <span className="font-medium text-slate-600">Lado que dá para a via</span>
                <select
                  value={p.frenteIndex}
                  onChange={(e) => onParametros({ ...p, frenteIndex: Number(e.target.value) })}
                  className={campo}
                  aria-label="Lado da quadra que dá para a via"
                >
                  {ladosDaQuadra(quadra).map((l) => (
                    <option key={l.indice} value={l.indice}>
                      {l.rotulo}
                    </option>
                  ))}
                </select>
                <span className="text-slate-400">As fatias saem perpendiculares a ele; é a frente dos lotes.</span>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="font-medium text-slate-600">Testada (m)</span>
                  <input
                    type="number"
                    min={1}
                    step={0.5}
                    value={p.testadaMm / 1000}
                    onChange={(e) => mm('testadaMm', e.target.value)}
                    className={campo}
                    aria-label="Testada de cada lote em metros"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-medium text-slate-600">Profundidade (m)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={p.profundidadeMm != null ? p.profundidadeMm / 1000 : ''}
                    placeholder="até o fundo"
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      if (v === '') {
                        onParametros({ ...p, profundidadeMm: null });
                        return;
                      }
                      const n = Number(v.replace(',', '.'));
                      if (Number.isFinite(n) && n > 0) onParametros({ ...p, profundidadeMm: Math.round(n * 1000) });
                    }}
                    className={campo}
                    aria-label="Profundidade do lote em metros"
                  />
                  <span className="text-slate-400">Vazio = até o outro lado da quadra.</span>
                </label>
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={p.duasFileiras}
                  onChange={(e) => onParametros({ ...p, duasFileiras: e.target.checked })}
                  aria-label="Duas fileiras, fundo com fundo"
                  className="h-4 w-4 rounded border-slate-300"
                />
                <span>
                  Duas fileiras, fundo com fundo
                  <span className="text-slate-400"> — só quando a segunda cabe inteira.</span>
                </span>
              </label>

              {proposta && (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3" data-testid="previa-do-loteamento">
                  {proposta.lotes.length === 0 ? (
                    <p className="flex items-start gap-2 text-amber-800">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{proposta.aviso ?? 'Nada a lotear com esses parâmetros.'}</span>
                    </p>
                  ) : (
                    <>
                      <p className="flex items-center gap-2 font-medium text-slate-800">
                        <LandPlot className="h-4 w-4" />
                        {proposta.lotes.length} lote{proposta.lotes.length > 1 ? 's' : ''} de{' '}
                        {proposta.lotes[0].areaM2.toFixed(2).replace('.', ',')} m²
                      </p>
                      <p className="mt-1 flex items-center gap-2 text-slate-600">
                        <Ruler className="h-4 w-4" />
                        testada {proposta.lotes[0].testadaM.toFixed(2).replace('.', ',')} m
                        {proposta.sobraM2 > 0 && <> · sobra {proposta.sobraM2.toFixed(2).replace('.', ',')} m²</>}
                      </p>
                      {proposta.aviso && (
                        <p className="mt-2 flex items-start gap-2 text-amber-800">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>{proposta.aviso}</span>
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              {jaTemLotes > 0 && (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-800">
                  Esta quadra já tem {jaTemLotes} lote{jaTemLotes > 1 ? 's' : ''}. Lotear <strong>acrescenta</strong> os
                  novos; os que já existem ficam onde estão.
                </p>
              )}

              <button
                type="button"
                onClick={onAceitar}
                disabled={!proposta || proposta.lotes.length === 0 || !levelId}
                title={
                  !proposta || proposta.lotes.length === 0
                    ? 'Ajuste a testada ou o lado da frente até a prévia mostrar pelo menos um lote'
                    : 'Lança os lotes da prévia num passo só — Ctrl+Z desfaz todos'
                }
                className="w-full rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Lançar {proposta?.lotes.length ?? 0} lote{(proposta?.lotes.length ?? 0) > 1 ? 's' : ''}
              </button>
            </>
          )}
        </>
      )}

      {resultado && <p className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-800">{resultado}</p>}
    </div>
  );
}
