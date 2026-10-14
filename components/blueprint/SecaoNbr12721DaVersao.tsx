/**
 * ÁREAS NBR 12721 NA VERSÃO PUBLICADA (14/10/2026, Fase 7 do plano
 * `docs/planos/2026-10-13-areas-nbr12721-na-planta.md`) — a seção do painel
 * Versões que diz se a versão tem os quadros congelados, com que hash, e as
 * aprovações técnica e jurídica. É o que substitui o "locked" do Motor de
 * Áreas antigo: a versão já é imutável; aqui fica QUEM aprovou O QUÊ.
 *
 * Quem decide se pode aprovar é o banco (RPC `aprovar_nbr12721_da_versao`);
 * os botões só antecipam o motivo (pendência bloqueante, jurídica antes da
 * técnica, já aprovada) para o botão desligado dizer por quê.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import ActionIconButton from '../ui/ActionIconButton';
import DevolucaoNbr12721 from './DevolucaoNbr12721';
import {
  blueprintSnapshotNbr12721Service,
  type AprovacaoNbr12721,
  type QuadroDaVersao,
  type TipoDeAprovacaoNbr12721,
} from '../../services/blueprintSnapshotNbr12721Service';
import { nbr12721ExportService } from '../../services/nbr12721ExportService';

const ROTULO: Record<TipoDeAprovacaoNbr12721, string> = { TECNICA: 'Técnica', JURIDICA: 'Jurídica' };

interface Props {
  snapshotId: string;
  /** `false` = sem permissão de aprovar (o botão diz por quê). */
  podeAprovar?: boolean;
}

export default function SecaoNbr12721DaVersao({ snapshotId, podeAprovar = true }: Props) {
  const [quadro, setQuadro] = useState<QuadroDaVersao | null | undefined>(undefined);
  const [aprovacoes, setAprovacoes] = useState<AprovacaoNbr12721[]>([]);
  const [eu, setEu] = useState<string | null>(null);
  const [observacao, setObservacao] = useState('');
  const [enviando, setEnviando] = useState<TipoDeAprovacaoNbr12721 | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [nomes, setNomes] = useState<Map<string, string>>(new Map());
  const [baixando, setBaixando] = useState<'pdf' | 'xlsx' | null>(null);
  const [copiado, setCopiado] = useState(false);
  /** O Empreendimento ligado ao estudo (Fase 9); `null` = estudo solto, `undefined` = ainda lendo. */
  const [empreendimento, setEmpreendimento] = useState<{ id: string; name: string; organizationId: string } | null | undefined>(undefined);
  const [devolvendo, setDevolvendo] = useState(false);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const [q, a] = await Promise.all([blueprintSnapshotNbr12721Service.daVersao(snapshotId), blueprintSnapshotNbr12721Service.aprovacoes(snapshotId)]);
      setQuadro(q);
      setAprovacoes(a);
    } catch (e) {
      setQuadro(null);
      setErro(e instanceof Error ? e.message : String(e));
    }
  }, [snapshotId]);

  // O nome de quem aprovou é enfeite: falhar aqui não pode derrubar a seção — a linha mostra o id curto.
  useEffect(() => {
    if (!aprovacoes.length) return;
    let vivo = true;
    void (async () => {
      try {
        const n = await blueprintSnapshotNbr12721Service.nomesDeQuemAprovou(aprovacoes.map((x) => x.aprovadoPor));
        if (vivo) setNomes(n);
      } catch {
        /* fica o id curto */
      }
    })();
    return () => {
      vivo = false;
    };
  }, [aprovacoes]);

  useEffect(() => {
    void carregar();
  }, [carregar]);
  // Qual Empreendimento recebe a fração: o ligado ao estudo. Falhar aqui só desliga o botão (com o motivo).
  useEffect(() => {
    if (!quadro?.studyId) return;
    let vivo = true;
    void (async () => {
      try {
        const e = await blueprintSnapshotNbr12721Service.empreendimentoDoEstudo(quadro.studyId);
        if (vivo) setEmpreendimento(e);
      } catch {
        if (vivo) setEmpreendimento(null);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [quadro?.studyId]);
  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 2000);
    return () => clearTimeout(t);
  }, [copiado]);
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setEu(data?.user?.id ?? null));
  }, []);

  if (quadro === undefined) return null;

  const tem = (t: TipoDeAprovacaoNbr12721) => aprovacoes.some((a) => a.tipo === t);
  const motivo = (t: TipoDeAprovacaoNbr12721): string | null => {
    if (!podeAprovar) return 'Sem permissão para aprovar as Áreas NBR 12721';
    if (!quadro) return 'Esta versão não tem os quadros congelados';
    if (quadro.status !== 'success') return 'Os quadros desta versão têm pendência bloqueante';
    if (tem(t)) return `Esta versão já tem a aprovação ${ROTULO[t].toLowerCase()}`;
    if (t === 'JURIDICA' && !tem('TECNICA')) return 'A aprovação jurídica vem depois da técnica';
    return null;
  };
  const aprovar = async (t: TipoDeAprovacaoNbr12721) => {
    if (motivo(t)) return;
    setEnviando(t);
    setErro(null);
    try {
      await blueprintSnapshotNbr12721Service.aprovar(snapshotId, t, observacao.trim() || null);
      setObservacao('');
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message.replace(/^blueprintSnapshotNbr12721\/aprovar: /, '') : String(e));
    } finally {
      setEnviando(null);
    }
  };

  const motivoDaDevolucao = (): string | null => {
    if (!quadro) return 'Esta versão não tem os quadros congelados';
    if (empreendimento === undefined) return 'Procurando o Empreendimento ligado ao estudo';
    if (!empreendimento) return 'Este estudo não está ligado a um Empreendimento';
    if (quadro.status !== 'success') return 'Os quadros desta versão têm pendência bloqueante';
    if (!(tem('TECNICA') && tem('JURIDICA'))) return 'Só a versão aprovada na técnica e na jurídica leva a fração ao Empreendimento';
    return null;
  };

  const copiarHash = async () => {
    try {
      await navigator.clipboard?.writeText(quadro?.hash ?? '');
      setCopiado(true);
    } catch {
      // Sem clipboard: o `title` continua com o hash inteiro para seleção manual.
    }
  };

  const baixar = async (formato: 'pdf' | 'xlsx') => {
    setBaixando(formato);
    setErro(null);
    try {
      const doc = await nbr12721ExportService.documentoDaVersao(snapshotId);
      if (formato === 'pdf') await nbr12721ExportService.exportarPdf(doc);
      else nbr12721ExportService.exportarXlsx(doc);
    } catch (e) {
      setErro(e instanceof Error ? e.message.replace(/^nbr12721Export\/\w+: /, '') : String(e));
    } finally {
      setBaixando(null);
    }
  };

  return (
    <div className="border-b border-slate-200 px-4 py-3" data-testid="versao-nbr12721">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Áreas NBR 12721</h3>
      {!quadro ? (
        <p className="mt-1 text-[11px] text-slate-500">
          Esta versão não tem os quadros congelados — publicada antes da tela de Áreas, ou sem unidades. Publique de novo para congelar.
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-slate-700">
            {quadro.status === 'success' ? 'Quadros I, II e IV-B congelados' : 'Quadros congelados COM pendência bloqueante'}
          </p>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="font-mono text-[10px] text-slate-400" title={quadro.hash}>
              {quadro.hash.slice(0, 12)}
            </span>
            <ActionIconButton
              kind="duplicate"
              size="sm"
              title="Copiar o hash completo dos quadros"
              icon={copiado ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              onClick={() => void copiarHash()}
            />
          </div>
          <ul className="mt-1 space-y-0.5">
            {(['TECNICA', 'JURIDICA'] as TipoDeAprovacaoNbr12721[]).map((t) => {
              const a = aprovacoes.find((x) => x.tipo === t);
              return (
                <li key={t} className="text-[11px] text-slate-600">
                  {ROTULO[t]}:{' '}
                  {a ? (
                    <span className="text-emerald-700">
                      aprovada {new Date(a.aprovadoEm).toLocaleString('pt-BR')} · {a.aprovadoPor === eu ? 'por você' : <span title={a.aprovadoPor}>por {nomes.get(a.aprovadoPor) ?? a.aprovadoPor.slice(0, 8)}</span>}
                      {a.observacao && <span className="block text-slate-500">“{a.observacao}”</span>}
                    </span>
                  ) : (
                    <span className="text-slate-400">pendente</span>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex gap-2">
            {(['pdf', 'xlsx'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => void baixar(f)}
                disabled={baixando !== null}
                title={baixando ? 'Aguarde o arquivo em preparo' : `Baixa os Quadros I, II e IV-B, as frações e as aprovações desta versão em ${f.toUpperCase()}`}
                className="h-8 rounded-[6px] border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {baixando === f ? 'Gerando…' : `Baixar ${f.toUpperCase()}`}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setDevolvendo(true)}
              disabled={motivoDaDevolucao() !== null}
              title={motivoDaDevolucao() ?? `Liga as unidades e leva a fração desta versão a ${empreendimento?.name ?? 'o Empreendimento'}`}
              className="h-8 rounded-[6px] border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Levar ao Empreendimento
            </button>
          </div>
          {!(tem('TECNICA') && tem('JURIDICA')) && (
            <div className="mt-2 space-y-1.5">
              <input
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Observação (opcional)"
                aria-label="Observação da aprovação NBR 12721"
                className="h-8 w-full rounded-[6px] border border-slate-300 px-2 text-xs"
              />
              <div className="flex gap-2">
                {(['TECNICA', 'JURIDICA'] as TipoDeAprovacaoNbr12721[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => void aprovar(t)}
                    disabled={motivo(t) !== null || enviando !== null}
                    title={motivo(t) ?? `Registra a aprovação ${ROTULO[t].toLowerCase()} dos quadros desta versão (hash ${quadro.hash.slice(0, 12)})`}
                    className="h-8 rounded-[6px] border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {enviando === t ? 'Aprovando…' : `Aprovar ${ROTULO[t].toLowerCase()}`}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {erro && (
        <p className="mt-1 text-[11px] text-red-700" role="alert">
          {erro}
        </p>
      )}
      {empreendimento && (
        <DevolucaoNbr12721 aberto={devolvendo} onFechar={() => setDevolvendo(false)} snapshotId={snapshotId} empreendimento={empreendimento} />
      )}
    </div>
  );
}
