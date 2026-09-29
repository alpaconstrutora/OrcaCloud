import React from 'react';
import { Check } from 'lucide-react';
import type { BlueprintProjetoExecutivoRow } from '../../types/blueprint';
import type { EmissaoExecutiva, ResponsavelTecnico } from '../../utils/blueprintTopografiaExecutivo';
import type { ResultadoHidroExecutivo, VerificacaoHidro } from '../../utils/blueprintHidroExecutivo';
import type { FormatoDoMemorial } from './PainelMemoriaisHidro';

/**
 * PROJETO EXECUTIVO HIDROSSANITÁRIO com ART — a tela (29/09/2026, E3.3). O
 * molde é o `PainelEletricaExecutivo`: o responsável se identifica, as
 * verificações aparecem agrupadas com ✓/✗, e emitir só habilita com todas
 * atendidas. A emissão é imutável e amarrada ao hash do desenho + premissas;
 * se a base mudou, a lista diz.
 *
 * O software não emite projeto — quem emite é o responsável técnico.
 */
export interface HidroExecutivoNoPainel {
  responsavel: ResponsavelTecnico;
  onResponsavel: (patch: Partial<ResponsavelTecnico>) => void;
  resultado: ResultadoHidroExecutivo | null;
  emitidos: BlueprintProjetoExecutivoRow[];
  emissaoValida: EmissaoExecutiva | null;
  hashDaBaseAtual: string;
  onEmitir: () => void;
  emitindo: boolean;
  erro: string | null;
  onBaixarMemorial: (row: BlueprintProjetoExecutivoRow, formato: FormatoDoMemorial) => void;
  persistenciaIndisponivel: boolean;
}

const ROTULO_DO_GRUPO: Record<VerificacaoHidro['grupo'], string> = {
  RESPONSAVEL: 'Responsável técnico',
  DADOS: 'Dados do desenho',
  NBR5626: 'Água fria e quente — NBR 5626',
  NBR8160: 'Esgoto sanitário — NBR 8160',
  NBR10844: 'Águas pluviais — NBR 10844',
  NBR7229: 'Tratamento individual — NBR 7229 / NBR 13969',
};

function CampoTexto({ rotulo, valor, onMudar, placeholder }: { rotulo: string; valor: string; onMudar: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block text-xs text-slate-500">
      {rotulo}
      <input
        type="text"
        value={valor}
        placeholder={placeholder}
        aria-label={rotulo}
        onChange={(e) => onMudar(e.target.value)}
        className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800"
      />
    </label>
  );
}

export default function PainelHidroExecutivo({ e }: { e: HidroExecutivoNoPainel }) {
  const r = e.responsavel;
  const res = e.resultado;
  const sigla = r.conselho === 'CAU' ? 'RRT' : 'ART';
  const grupos = res ? ([...new Set(res.verificacoes.map((v) => v.grupo))] as VerificacaoHidro['grupo'][]) : [];
  const dataBr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
  const motivoDoBotao = !res
    ? 'Calculando as verificações…'
    : e.persistenciaIndisponivel
      ? 'Sem a tabela do projeto executivo no banco, a emissão não é registrada'
      : !res.podeEmitir
        ? `${res.pendencias.length} verificação(ões) pendente(s)`
        : undefined;

  return (
    <div className="rounded-[10px] border border-slate-200 bg-white p-3" data-testid="hidro-executivo">
      <p className="text-sm font-semibold text-slate-800">Emissão do projeto executivo ({sigla})</p>
      <p className="mt-0.5 text-xs text-slate-500">
        A emissão é do responsável técnico. O programa reúne a conferência (NBR 5626 e 8160), registra a emissão com os dois
        memoriais e a amarra ao hash do desenho e das premissas.
      </p>

      {e.emissaoValida ? (
        <p className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-sm text-emerald-800" data-testid="hidro-emitido">
          <strong className="font-semibold">Emitido</strong> — {sigla} nº {e.emissaoValida.artNumero} · {e.emissaoValida.responsavel} (
          {e.emissaoValida.conselho} {e.emissaoValida.registro}) · {dataBr(e.emissaoValida.emitidoEm)}. Vale para o desenho e as premissas
          atuais.
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm font-medium text-slate-600">Responsável técnico</p>
          <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1" data-testid="hidro-responsavel">
            <CampoTexto rotulo="Nome" valor={r.nome} onMudar={(v) => e.onResponsavel({ nome: v })} />
            <CampoTexto rotulo="Título" valor={r.titulo} onMudar={(v) => e.onResponsavel({ titulo: v })} />
            <label className="block text-xs text-slate-500">
              Conselho
              <select
                value={r.conselho}
                aria-label="Conselho"
                onChange={(ev) => e.onResponsavel({ conselho: ev.target.value as ResponsavelTecnico['conselho'] })}
                className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800"
              >
                <option value="CREA">CREA</option>
                <option value="CAU">CAU</option>
              </select>
            </label>
            <CampoTexto rotulo="Registro" valor={r.registro} onMudar={(v) => e.onResponsavel({ registro: v })} placeholder="5069…" />
            <CampoTexto rotulo={`Número da ${sigla}`} valor={r.artNumero} onMudar={(v) => e.onResponsavel({ artNumero: v })} placeholder="28027230…" />
            <label className="block text-xs text-slate-500">
              Data da {sigla}
              <input
                type="date"
                value={r.artData}
                aria-label={`Data da ${sigla}`}
                onChange={(ev) => e.onResponsavel({ artData: ev.target.value })}
                className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800"
              />
            </label>
          </div>

          {res && (
            <ul className="mt-2 space-y-1" data-testid="hidro-verificacoes">
              {grupos.map((g) => (
                <li key={g}>
                  <p className="text-sm font-medium text-slate-600">{ROTULO_DO_GRUPO[g]}</p>
                  <ul className="space-y-0.5">
                    {res.verificacoes
                      .filter((v) => v.grupo === g)
                      .map((v, i) => (
                        <li key={i} className={`flex items-start gap-1.5 text-sm ${v.atende ? 'text-slate-700' : 'text-red-700'}`}>
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
            disabled={!!motivoDoBotao || e.emitindo}
            title={motivoDoBotao}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Check className="h-3.5 w-3.5" />
            {e.emitindo ? 'Emitindo…' : `Emitir projeto executivo hidrossanitário (${sigla})`}
          </button>
          {res && !res.podeEmitir && (
            <p className="mt-1 text-sm text-slate-500">
              {res.pendencias.length} verificação(ões) pendente(s): a emissão só é registrada com todas atendidas.
            </p>
          )}
          {e.persistenciaIndisponivel && (
            <p className="mt-1 text-sm text-amber-700">Sem a tabela do projeto executivo no banco, a emissão não é registrada.</p>
          )}
          {e.erro && <p className="mt-1 text-sm text-red-700">{e.erro}</p>}
        </>
      )}

      {e.emitidos.length > 0 && (
        <ul className="mt-2 space-y-1" data-testid="hidro-emitidos">
          {e.emitidos.map((row) => {
            const vale = row.hash_da_base === e.hashDaBaseAtual;
            const resp = row.responsavel;
            return (
              <li key={row.id} className="flex items-center justify-between gap-2 text-sm text-slate-600">
                <span className="min-w-0">
                  {resp.conselho === 'CAU' ? 'RRT' : 'ART'} {resp.artNumero} · {resp.nome} · {row.emitido_em ? dataBr(row.emitido_em) : ''}{' '}
                  <span className={vale ? 'text-emerald-700' : 'text-amber-700'}>{vale ? '(vale para o desenho atual)' : '(o desenho ou as premissas mudaram desde a emissão)'}</span>
                </span>
                <span className="flex shrink-0 gap-2">
                  <button type="button" onClick={() => e.onBaixarMemorial(row, 'pdf')} className="text-blue-700 transition-colors hover:text-blue-900">
                    PDF
                  </button>
                  <button type="button" onClick={() => e.onBaixarMemorial(row, 'docx')} className="text-blue-700 transition-colors hover:text-blue-900">
                    DOCX
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
