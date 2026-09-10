import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Eye, Info, Zap } from 'lucide-react';
import type { ConferenciaNbr5410, RegraConferida } from '../../utils/blueprintNbr5410';

/**
 * CONFERÊNCIA NBR 5410 — a lista das regras, cada uma com o que achou.
 *
 * ─── ⚠️ TRÊS ESTADOS POR REGRA, E O TERCEIRO É O QUE IMPORTA ────────────────
 *
 * ✗ falta · ⚠ aviso · ✓ atende — e, ao lado do ✓, o que ficou FORA da
 * avaliação ("2 ambientes sem tipo", "circuito C3 sem tensão"). Um ✓ que
 * esconde o não-avaliado é o pior verde que existe: parece pronto, e não foi
 * olhado.
 *
 * Cada achado leva ao desenho (seleciona as peças) e, quando há uma ação que
 * não decide pelo projetista — converter o chuveiro em ligação direta —, ela
 * fica no próprio achado.
 */
export default function PainelConferenciaNbr({
  conferencia,
  onSelecionar,
  onConverterLigacaoDireta,
}: {
  conferencia: ConferenciaNbr5410;
  onSelecionar?: (ids: string[]) => void;
  onConverterLigacaoDireta?: (terminalIds: string[]) => void;
}) {
  const [abertas, setAbertas] = useState<Record<string, boolean>>({});
  const { faltas, avisos } = conferencia;

  return (
    <div className="space-y-2" aria-label="Conferência NBR 5410">
      <p className="flex items-center gap-1.5 text-[11px] text-slate-600">
        <Zap className="h-3.5 w-3.5 text-amber-500" />
        <strong>Conferência NBR 5410</strong>
        <span className="text-slate-400">·</span>
        {faltas === 0 && avisos === 0 ? (
          <span className="text-emerald-700">nenhuma falta</span>
        ) : (
          <span>
            {faltas > 0 && <span className="text-red-700">{faltas} {faltas === 1 ? 'falta' : 'faltas'}</span>}
            {faltas > 0 && avisos > 0 && ' · '}
            {avisos > 0 && <span className="text-amber-700">{avisos} {avisos === 1 ? 'aviso' : 'avisos'}</span>}
          </span>
        )}
      </p>
      <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
        {conferencia.regras.map((r) => (
          <LinhaDaRegra
            key={r.codigo}
            regra={r}
            aberta={abertas[r.codigo] ?? r.achados.length > 0}
            onAlternar={() =>
              setAbertas((a) => ({ ...a, [r.codigo]: !(a[r.codigo] ?? r.achados.length > 0) }))
            }
            onSelecionar={onSelecionar}
            onConverterLigacaoDireta={onConverterLigacaoDireta}
          />
        ))}
      </ul>
      <p className="text-[10px] text-slate-400">
        Confere o que foi declarado; não atribui potência, não divide circuito nem escolhe
        disjuntor.
      </p>
    </div>
  );
}

function LinhaDaRegra({
  regra,
  aberta,
  onAlternar,
  onSelecionar,
  onConverterLigacaoDireta,
}: {
  regra: RegraConferida;
  aberta: boolean;
  onAlternar: () => void;
  onSelecionar?: (ids: string[]) => void;
  onConverterLigacaoDireta?: (terminalIds: string[]) => void;
}) {
  const temFalta = regra.achados.some((a) => a.nivel === 'FALTA');
  const temAviso = regra.achados.some((a) => a.nivel === 'AVISO');
  const Icone = temFalta ? AlertTriangle : temAviso ? Info : CheckCircle2;
  const cor = temFalta ? 'text-red-600' : temAviso ? 'text-amber-600' : 'text-emerald-600';
  const estado = temFalta ? 'falta' : temAviso ? 'aviso' : 'atende';
  const Seta = aberta ? ChevronDown : ChevronRight;
  const codigo = regra.codigo === 'SUGERIDAS' ? 'Sugeridas' : regra.codigo;

  return (
    <li>
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={aberta}
        aria-label={`${codigo} — ${regra.titulo}: ${estado}`}
        className="flex w-full items-start gap-1.5 px-2 py-1.5 text-left text-[11px] hover:bg-slate-50"
      >
        <Seta className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
        <Icone className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${cor}`} />
        <span className="min-w-0 flex-1">
          <span className="font-mono text-[10px] text-slate-500">{codigo}</span>{' '}
          <span className="text-slate-700">{regra.titulo}</span>
          {regra.achados.length === 0 && regra.naoAvaliado.length > 0 && (
            <span className="ml-1 text-slate-400">(parcial)</span>
          )}
        </span>
      </button>
      {aberta && (
        <div className="space-y-1 px-2 pb-2 pl-9 text-[11px]">
          {regra.achados.map((a, i) => (
            <div key={i} className="flex flex-wrap items-start gap-x-2 gap-y-1">
              <span className={a.nivel === 'FALTA' ? 'text-red-700' : 'text-amber-700'}>
                {a.mensagem}
              </span>
              {a.ids.length > 0 && onSelecionar && (
                <button
                  type="button"
                  onClick={() => onSelecionar(a.ids)}
                  title="Seleciona as peças envolvidas no desenho"
                  className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
                >
                  <Eye className="h-3 w-3" />
                  ver
                </button>
              )}
              {a.acao?.tipo === 'CONVERTER_LIGACAO_DIRETA' && onConverterLigacaoDireta && (
                <button
                  type="button"
                  onClick={() => onConverterLigacaoDireta(a.acao!.terminalIds)}
                  title="Troca o tipo do ponto para ligação direta — posição, circuito e potência ficam"
                  className="inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-amber-800 hover:bg-amber-50"
                >
                  Converter em ligação direta
                </button>
              )}
            </div>
          ))}
          {regra.achados.length === 0 && (
            <p className="text-emerald-700">
              {regra.avaliados > 0
                ? `Atende — ${regra.avaliados} ${regra.avaliados === 1 ? 'item avaliado' : 'itens avaliados'}.`
                : 'Nada a avaliar ainda.'}
            </p>
          )}
          {regra.naoAvaliado.length > 0 && (
            <p className="text-slate-500">
              <span className="font-medium">Fora da avaliação:</span> {regra.naoAvaliado.join('; ')}.
            </p>
          )}
        </div>
      )}
    </li>
  );
}
