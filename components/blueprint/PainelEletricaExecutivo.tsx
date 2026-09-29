import React from 'react';
import { Check } from 'lucide-react';
import type { BlueprintProjetoExecutivoRow } from '../../types/blueprint';
import type { ResponsavelTecnico, EmissaoExecutiva } from '../../utils/blueprintTopografiaExecutivo';
import type { ResultadoEletricoExecutivo, VerificacaoEletrica } from '../../utils/blueprintEletricaExecutivo';
import PainelMemoriaisHidro, { type FormatoDoMemorial, type QualMemorial } from './PainelMemoriaisHidro';
import type { BlocoDoMemorial } from '../../utils/blueprintMemorialHidro';
import { TEXTOS_PADRAO_DO_MEMORIAL_ELETRICO, type TextosDoMemorialEletrico } from '../../utils/blueprintEletricaDimensionamento';

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
  /** O memorial GRAVADO na emissão, em PDF ou DOCX (E5.3; sem formato = PDF, como antes). */
  onBaixarMemorial: (row: BlueprintProjetoExecutivoRow, formato?: FormatoDoMemorial) => void;
  persistenciaIndisponivel: boolean;
  /**
   * E5.3 — os memoriais descritivo e de cálculo DERIVADOS AGORA (antes da
   * emissão), e os textos editáveis do descritivo. Ausentes = o painel não os mostra.
   */
  memoriais?: { calculo: BlocoDoMemorial[]; descritivo: BlocoDoMemorial[]; onBaixar: (qual: QualMemorial, formato: FormatoDoMemorial) => Promise<void> };
  textosDoMemorial?: TextosDoMemorialEletrico;
  onTextosDoMemorial?: (t: TextosDoMemorialEletrico) => void;
}

const CAMPOS_DO_MEMORIAL: { chave: keyof TextosDoMemorialEletrico; rotulo: string; ajuda: string }[] = [
  { chave: 'objeto', rotulo: 'Objeto', ajuda: 'Vazio: gerado do desenho (quadros, circuitos, pontos, pavimentos).' },
  { chave: 'execucao', rotulo: 'Condutores e eletrodutos (execução)', ajuda: 'Vazio: o texto padrão (cores da NBR 5410 6.1.5.3, PVC antichama, identificação no quadro).' },
  { chave: 'aterramento', rotulo: 'Aterramento', ajuda: 'Vazio: o texto padrão (PE em todos os circuitos, BEP junto à entrada, Tab. 58).' },
  { chave: 'observacoes', rotulo: 'Observações', ajuda: 'Vazio: a seção não sai.' },
];

const ROTULO_DO_GRUPO: Record<VerificacaoEletrica['grupo'], string> = {
  RESPONSAVEL: 'Responsável técnico',
  DADOS: 'Dados do desenho',
  NORMA: 'Conferência NBR 5410',
  CIRCUITOS: 'Circuitos',
  QUADROS: 'Quadros e alimentadores',
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

export default function PainelEletricaExecutivo({
  e,
  semCabecalho = false,
}: {
  e: EletricaExecutivoNoPainel;
  /**
   * No drawer próprio (14/09/2026) o título e a descrição já estão no
   * cabeçalho do `Sheet`; repeti-los aqui era a primeira coisa que a captura
   * mostrou. Sem moldura também — o drawer já é a moldura.
   */
  semCabecalho?: boolean;
}) {
  const r = e.responsavel;
  const res = e.resultado;
  const sigla = r.conselho === 'CAU' ? 'RRT' : 'ART';
  const grupos = res ? ([...new Set(res.verificacoes.map((v) => v.grupo))] as VerificacaoEletrica['grupo'][]) : [];
  const dataBr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

  return (
    <div className={semCabecalho ? '' : 'rounded-md border border-slate-200 px-2 py-2'} data-testid="eletrica-executivo">
      {!semCabecalho && (
        <>
          <p className="text-sm font-medium text-slate-700">Projeto executivo elétrico ({sigla})</p>
          <p className="mt-0.5 text-sm text-slate-500">
            A emissão é do responsável técnico. O programa reúne a conferência NBR 5410 e o pré-dimensionamento
            de cada circuito e quadro, registra a emissão e a amarra ao hash do desenho e das hipóteses.
          </p>
        </>
      )}

      {e.emissaoValida ? (
        <p className="mt-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-sm text-emerald-800" data-testid="eletrica-emitido">
          <strong className="font-semibold">Emitido</strong> — {sigla} nº {e.emissaoValida.artNumero} · {e.emissaoValida.responsavel} (
          {e.emissaoValida.conselho} {e.emissaoValida.registro}) · {dataBr(e.emissaoValida.emitidoEm)}. Vale para o desenho e as hipóteses
          atuais.
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm font-medium text-slate-600">Responsável técnico</p>
          <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1" data-testid="eletrica-responsavel">
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
            <ul className="mt-2 space-y-1" data-testid="eletrica-verificacoes">
              {grupos.map((g) => (
                <li key={g}>
                  <p className="text-sm font-medium text-slate-600">{ROTULO_DO_GRUPO[g] ?? g}</p>
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
            disabled={!res || !res.podeEmitir || e.emitindo || e.persistenciaIndisponivel}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Check className="h-3.5 w-3.5" />
            {e.emitindo ? 'Emitindo…' : `Emitir projeto executivo elétrico (${sigla})`}
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
        <ul className="mt-2 space-y-1" data-testid="eletrica-emitidos">
          {e.emitidos.map((row) => {
            const vale = row.hash_da_base === e.hashDaBaseAtual;
            const resp = row.responsavel;
            return (
              <li key={row.id} className="flex items-center justify-between gap-2 text-sm text-slate-600">
                <span className="min-w-0">
                  {resp.conselho === 'CAU' ? 'RRT' : 'ART'} {resp.artNumero} · {resp.nome} · {row.emitido_em ? dataBr(row.emitido_em) : ''}{' '}
                  <span className={vale ? 'text-emerald-700' : 'text-amber-700'}>{vale ? '(vale para o desenho atual)' : '(o desenho ou as hipóteses mudaram desde a emissão)'}</span>
                </span>
                <span className="flex shrink-0 gap-2">
                  <button type="button" onClick={() => e.onBaixarMemorial(row, 'pdf')} className="text-blue-700 transition-colors hover:text-blue-900">
                    Memorial (PDF)
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

      {/* E5.3 — os memoriais A QUALQUER MOMENTO (não só na emissão) e os textos editáveis do descritivo. */}
      {e.memoriais && (
        <section className="mt-5 border-t border-slate-100 pt-4" aria-label="Memoriais elétricos">
          <p className="mb-2 text-sm font-semibold text-slate-800">Memoriais (antes da emissão)</p>
          <PainelMemoriaisHidro
            calculo={e.memoriais.calculo}
            descritivo={e.memoriais.descritivo}
            onBaixar={e.memoriais.onBaixar}
            textos={{
              calculo: 'Hipóteses, cada quadro (demanda, alimentador, queda até a origem) com a tabela dos circuitos (IB, seção, Iz, disjuntor, curva, ΔV) e a conferência NBR 5410 regra a regra.',
              descritivo: 'Objeto, normas, entrada, quadros, circuitos, proteção, condutores e eletrodutos, aterramento e quantitativos — com os textos editáveis abaixo.',
              vazio: 'O desenho não tem quadro de distribuição — não há o que memorializar.',
              tituloVazio: 'Sem quadro de distribuição no desenho',
              testId: 'memoriais-eletricos',
            }}
          />
          {e.onTextosDoMemorial && (
            <details className="mt-3 rounded-[10px] border border-slate-200 bg-white p-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">Textos do memorial descritivo (editáveis)</summary>
              <div className="mt-2 space-y-2">
                {CAMPOS_DO_MEMORIAL.map((c) => (
                  <label key={c.chave} className="block text-xs text-slate-500">
                    {c.rotulo}
                    <textarea
                      value={e.textosDoMemorial?.[c.chave] ?? ''}
                      placeholder={TEXTOS_PADRAO_DO_MEMORIAL_ELETRICO[c.chave] || c.ajuda}
                      aria-label={`Texto do memorial — ${c.rotulo}`}
                      rows={3}
                      onChange={(ev) => e.onTextosDoMemorial?.({ ...(e.textosDoMemorial ?? {}), [c.chave]: ev.target.value })}
                      className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800"
                    />
                    <span className="mt-0.5 block text-[11px] text-slate-400">{c.ajuda} Não altera a validade da emissão.</span>
                  </label>
                ))}
              </div>
            </details>
          )}
        </section>
      )}
    </div>
  );
}
