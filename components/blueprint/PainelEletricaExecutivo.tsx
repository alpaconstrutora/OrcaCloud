import React from 'react';
import { Check } from 'lucide-react';
import type { BlueprintProjetoExecutivoRow } from '../../types/blueprint';
import type { ResponsavelTecnico, EmissaoExecutiva } from '../../utils/blueprintTopografiaExecutivo';
import type { ResultadoEletricoExecutivo, VerificacaoEletrica } from '../../utils/blueprintEletricaExecutivo';

/**
 * PROJETO EXECUTIVO ELÉTRICO com ART — a tela (F7, 13/09/2026).
 *
 * O molde é a `SecaoProjetoExecutivo` da topografia: o responsável se
 * identifica, as verificações aparecem agrupadas com ✓/✗, e o botão de
 * emitir só habilita com todas atendidas. A emissão registrada é imutável e
 * amarrada ao hash do desenho + hipóteses; se a base mudou, a lista diz.
 *
 * O software não emite projeto — quem emite é o responsável técnico.
 */
export interface EletricaExecutivoNoPainel {
  responsavel: ResponsavelTecnico;
  onResponsavel: (patch: Partial<ResponsavelTecnico>) => void;
  resultado: ResultadoEletricoExecutivo | null;
  emitidos: BlueprintProjetoExecutivoRow[];
  /** A emissão que vale para a base atual (hash confere), se houver. */
  emissaoValida: EmissaoExecutiva | null;
  hashDaBaseAtual: string;
  onEmitir: () => void;
  emitindo: boolean;
  erro: string | null;
  onBaixarMemorial: (row: BlueprintProjetoExecutivoRow) => void;
  persistenciaIndisponivel: boolean;
}

const ROTULO_DO_GRUPO: Record<VerificacaoEletrica['grupo'], string> = {
  RESPONSAVEL: 'Responsável técnico',
  DADOS: 'Dados do desenho',
  NORMA: 'Conferência NBR 5410',
  CIRCUITOS: 'Circuitos',
  QUADROS: 'Quadros e alimentadores',
};

function CampoTexto({ rotulo, valor, onMudar, placeholder }: { rotulo: string; valor: string; onMudar: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block text-[11px] text-slate-500">
      {rotulo}
      <input
        type="text"
        value={valor}
        placeholder={placeholder}
        aria-label={rotulo}
        onChange={(e) => onMudar(e.target.value)}
        className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-800"
      />
    </label>
  );
}

export default function PainelEletricaExecutivo({ e }: { e: EletricaExecutivoNoPainel }) {
  const r = e.responsavel;
  const res = e.resultado;
  const sigla = r.conselho === 'CAU' ? 'RRT' : 'ART';
  const grupos = res ? ([...new Set(res.verificacoes.map((v) => v.grupo))] as VerificacaoEletrica['grupo'][]) : [];
  const dataBr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

  return (
    <div className="rounded-md border border-slate-200 px-2 py-2" data-testid="eletrica-executivo">
      <p className="text-xs font-medium text-slate-700">Projeto executivo elétrico ({sigla})</p>
      <p className="mt-0.5 text-[11px] text-slate-500">
        A emissão é do responsável técnico. O programa reúne a conferência NBR 5410 e o pré-dimensionamento
        de cada circuito e quadro, registra a emissão e a amarra ao hash do desenho e das hipóteses.
      </p>

      {e.emissaoValida ? (
        <p className="mt-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-800" data-testid="eletrica-emitido">
          <strong className="font-semibold">Emitido</strong> — {sigla} nº {e.emissaoValida.artNumero} · {e.emissaoValida.responsavel} (
          {e.emissaoValida.conselho} {e.emissaoValida.registro}) · {dataBr(e.emissaoValida.emitidoEm)}. Vale para o desenho e as hipóteses
          atuais.
        </p>
      ) : (
        <>
          <p className="mt-2 text-[11px] font-medium text-slate-600">Responsável técnico</p>
          <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1" data-testid="eletrica-responsavel">
            <CampoTexto rotulo="Nome" valor={r.nome} onMudar={(v) => e.onResponsavel({ nome: v })} />
            <CampoTexto rotulo="Título" valor={r.titulo} onMudar={(v) => e.onResponsavel({ titulo: v })} />
            <label className="block text-[11px] text-slate-500">
              Conselho
              <select
                value={r.conselho}
                aria-label="Conselho"
                onChange={(ev) => e.onResponsavel({ conselho: ev.target.value as ResponsavelTecnico['conselho'] })}
                className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-800"
              >
                <option value="CREA">CREA</option>
                <option value="CAU">CAU</option>
              </select>
            </label>
            <CampoTexto rotulo="Registro" valor={r.registro} onMudar={(v) => e.onResponsavel({ registro: v })} placeholder="5069…" />
            <CampoTexto rotulo={`Número da ${sigla}`} valor={r.artNumero} onMudar={(v) => e.onResponsavel({ artNumero: v })} placeholder="28027230…" />
            <label className="block text-[11px] text-slate-500">
              Data da {sigla}
              <input
                type="date"
                value={r.artData}
                aria-label={`Data da ${sigla}`}
                onChange={(ev) => e.onResponsavel({ artData: ev.target.value })}
                className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-800"
              />
            </label>
          </div>

          {res && (
            <ul className="mt-2 space-y-1" data-testid="eletrica-verificacoes">
              {grupos.map((g) => (
                <li key={g}>
                  <p className="text-[11px] font-medium text-slate-600">{ROTULO_DO_GRUPO[g] ?? g}</p>
                  <ul className="space-y-0.5">
                    {res.verificacoes
                      .filter((v) => v.grupo === g)
                      .map((v, i) => (
                        <li key={i} className={`flex items-start gap-1.5 text-[11px] ${v.atende ? 'text-slate-700' : 'text-red-700'}`}>
                          <span className="mt-px shrink-0">{v.atende ? '✓' : '✗'}</span>
                          <span className="min-w-0 break-words">
                            {v.item} <span className="text-slate-400">({v.norma})</span> — exigido {v.exigido}; obtido {v.obtido}
                          </span>
                        </li>
                      ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={e.onEmitir}
            disabled={!res || !res.podeEmitir || e.emitindo || e.persistenciaIndisponivel}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Check className="h-3.5 w-3.5" />
            {e.emitindo ? 'Emitindo…' : `Emitir projeto executivo elétrico (${sigla})`}
          </button>
          {res && !res.podeEmitir && (
            <p className="mt-1 text-[11px] text-slate-500">
              {res.pendencias.length} verificação(ões) pendente(s): a emissão só é registrada com todas atendidas.
            </p>
          )}
          {e.persistenciaIndisponivel && (
            <p className="mt-1 text-[11px] text-amber-700">Sem a tabela do projeto executivo no banco, a emissão não é registrada.</p>
          )}
          {e.erro && <p className="mt-1 text-[11px] text-red-700">{e.erro}</p>}
        </>
      )}

      {e.emitidos.length > 0 && (
        <ul className="mt-2 space-y-1" data-testid="eletrica-emitidos">
          {e.emitidos.map((row) => {
            const vale = row.hash_da_base === e.hashDaBaseAtual;
            const resp = row.responsavel;
            return (
              <li key={row.id} className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                <span className="min-w-0">
                  {resp.conselho === 'CAU' ? 'RRT' : 'ART'} {resp.artNumero} · {resp.nome} · {row.emitido_em ? dataBr(row.emitido_em) : ''}{' '}
                  <span className={vale ? 'text-emerald-700' : 'text-amber-700'}>{vale ? '(vale para o desenho atual)' : '(o desenho ou as hipóteses mudaram desde a emissão)'}</span>
                </span>
                <button type="button" onClick={() => e.onBaixarMemorial(row)} className="shrink-0 text-blue-700 transition-colors hover:text-blue-900">
                  Memorial (PDF)
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
