import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { rotuloCurto, type BlueprintModel, type Conflito } from '../../utils/blueprintKernel';
import { ROTULO_DA_DISCIPLINA } from '../../utils/blueprintRede';

/**
 * A lista de CONFLITOS de instalação.
 *
 * ⚠️ Ela não oferece "resolver". Um conflito não se resolve numa lista: resolve-se
 * mudando o desenho — desviando o cano, mudando a cota, mexendo na viga. Um
 * botão de dispensar aqui criaria um estado "conhecido e ignorado" que
 * sobreviveria à mudança que o eliminou, e a lista passaria a mentir nos dois
 * sentidos: escondendo o que voltou e mostrando o que já foi.
 *
 * A lista é DERIVADA, recalculada a cada mudança. Some sozinha quando o desenho
 * deixa de ter o problema, e é assim que ela continua verdadeira.
 */
export default function PainelConflitos({
  model,
  conflitos,
  onSelecionar,
}: {
  model: BlueprintModel;
  conflitos: Conflito[];
  onSelecionar?: (id: string) => void;
}) {
  if (conflitos.length === 0) {
    return (
      <p className="flex items-start gap-1.5 text-[11px] text-slate-500">
        <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
        <span>
          Nenhum conflito entre instalação e estrutura, nem entre disciplinas.
          <span className="mt-0.5 block text-[10px]">
            Cano dentro de parede <strong>não</strong> conta — é onde ele mora.
          </span>
        </span>
      </p>
    );
  }

  const nomeDoTrecho = (id: string) => {
    const t = (model.trechos ?? []).find((x) => x.id === id);
    if (!t) return id;
    return `${ROTULO_DA_DISCIPLINA[t.disciplina]} ${t.rotulo || rotuloCurto(t.uid, 'trecho')}`;
  };

  const nomeDoOutro = (c: Conflito) => {
    if (c.classe === 'REDE') return nomeDoTrecho(c.outroId);
    const s = model.structures.find((x) => x.id === c.outroId);
    return s ? s.rotulo || rotuloCurto(s.uid, 'structural') : c.outroId;
  };

  return (
    <div className="space-y-1.5">
      {conflitos.map((c) => (
        <button
          key={`${c.trechoId}-${c.outroId}`}
          type="button"
          onClick={() => onSelecionar?.(c.trechoId)}
          className="flex w-full items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-left hover:bg-amber-100"
        >
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
          <span className="min-w-0 text-[11px] text-slate-700">
            <strong>{nomeDoTrecho(c.trechoId)}</strong> encontra{' '}
            <strong>{nomeDoOutro(c)}</strong>
            <span className="mt-0.5 block text-[10px] text-slate-500">
              {/* O número que decide o que fazer: atravessar 200 mm de viga é
                  um furo; roçar de raspão pode ser só um ajuste de cota. */}
              {c.comprimentoDentroMm > 0
                ? `${(c.comprimentoDentroMm / 1000).toFixed(3)} m por dentro`
                : `de raspão — ${Math.round(c.folgaEntreEixosMm)} mm entre os eixos`}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
