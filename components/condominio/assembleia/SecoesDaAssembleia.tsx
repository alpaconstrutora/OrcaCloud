// components/condominio/assembleia/SecoesDaAssembleia.tsx
// As seções SÓ DE LEITURA da tela da assembleia: Identificação, Edital e ata,
// Pauta e Apuração ao vivo. A lista de Unidades (tabela) fica no pai e vem POR
// ÚLTIMO — nada abaixo de tabela (guia §6.14).
//
// Percentual é sempre do TOTAL da assembleia (percentualDoTotal, A5), nunca a
// fração crua: no Bella Vista a soma é 0,01 e 0,00125 é 12,50%.

import React from 'react';
import { ClipboardList, FileText, BarChart3, Info, RefreshCw } from 'lucide-react';
import SecaoTitulo from '../../ui/SecaoTitulo';
import {
    dataHoraBrasilia, percentualDoTotal, rotuloOpcao, REGRA_QUORUM, ROTULO_PARTICIPARAM_DA_VOTACAO,
    ROTULO_QUORUM, ROTULO_QUORUM_INSTALACAO, ROTULO_RESULTADO, ROTULO_STATUS, ROTULO_TIPO, ROTULO_TIPO_ITEM,
} from '../../../utils/assembleiaTextos';
import type { Apuracao, Assembleia, ItemAssembleia, ResultadoItem } from '../../../services/condominioAssembleiaService';
import { BOTAO_SECUNDARIO, CARD, COR_STATUS, diasDeAntecedencia, opcoesDoItem } from './comum';

const Par: React.FC<{ rotulo: string; children: React.ReactNode; largo?: boolean }> = ({ rotulo, children, largo }) => (
    <div className={`space-y-1.5 ${largo ? 'col-span-2' : ''}`}>
        <p className="text-xs font-semibold text-slate-500">{rotulo}</p>
        <div className="text-sm font-normal text-gray-900">{children}</div>
    </div>
);

// ─── Identificação ───────────────────────────────────────────────────────────

export const IdentificacaoSecao: React.FC<{ assembleia: Assembleia }> = ({ assembleia: a }) => {
    const q = a.quorumInstalacao;
    const antecedencia = a.convocadaEm && a.primeiraConvocacaoEm
        ? diasDeAntecedencia(a.primeiraConvocacaoEm, new Date(a.convocadaEm)) : null;
    return (
        <div className={CARD}>
            <SecaoTitulo icon={Info} titulo="Identificação" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
                <Par rotulo="Tipo">{ROTULO_TIPO[a.tipo]}</Par>
                <Par rotulo="Situação"><span className={COR_STATUS[a.status]}>{ROTULO_STATUS[a.status]}</span></Par>
                <Par rotulo="1ª convocação">{a.primeiraConvocacaoEm ? dataHoraBrasilia(a.primeiraConvocacaoEm) : 'a definir'}</Par>
                <Par rotulo="2ª convocação">{a.segundaConvocacaoEm ? dataHoraBrasilia(a.segundaConvocacaoEm) : 'a definir'}</Par>
                <Par rotulo="Local">{a.local || (a.linkTransmissao ? 'somente por transmissão' : 'a definir')}</Par>
                <Par rotulo="Transmissão">
                    {a.linkTransmissao
                        ? <a href={a.linkTransmissao} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">{a.linkTransmissao}</a>
                        : 'sem link'}
                </Par>
                {a.convocadaEm && (
                    <Par rotulo="Convocada em">
                        {dataHoraBrasilia(a.convocadaEm)}
                        {antecedencia !== null && ` · ${antecedencia} ${antecedencia === 1 ? 'dia' : 'dias'} de antecedência`}
                    </Par>
                )}
                {a.instaladaEm && (
                    <Par rotulo="Instalada">
                        {a.instaladaConvocacao ? `${a.instaladaConvocacao}ª convocação · ` : ''}{dataHoraBrasilia(a.instaladaEm)}
                    </Par>
                )}
                {(a.presidenteNome || a.secretarioNome) && (
                    <Par rotulo="Mesa">Presidente {a.presidenteNome ?? '—'} · secretário {a.secretarioNome ?? '—'}</Par>
                )}
                {q && (
                    <Par rotulo={ROTULO_QUORUM_INSTALACAO}>
                        {percentualDoTotal(q.presentesFracao, q.total)} · {q.presentesUnidades} {q.presentesUnidades === 1 ? 'unidade' : 'unidades'}
                    </Par>
                )}
                {a.encerradaEm && <Par rotulo="Encerrada em">{dataHoraBrasilia(a.encerradaEm)}</Par>}
                {a.canceladaEm && <Par rotulo="Cancelada em">{dataHoraBrasilia(a.canceladaEm)}</Par>}
                {a.motivoCancelamento && <Par rotulo="Motivo do cancelamento" largo>{a.motivoCancelamento}</Par>}
            </div>
        </div>
    );
};

// ─── Edital e ata ────────────────────────────────────────────────────────────

export const EditalAtaSecao: React.FC<{
    assembleia: Assembleia;
    ata: { gerando: boolean; erro: string | null };
}> = ({ assembleia: a, ata }) => {
    const convocada = a.status !== 'RASCUNHO';
    return (
        <div className={CARD}>
            <SecaoTitulo icon={FileText} titulo="Edital e ata" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                <Par rotulo="Edital de convocação">
                    {convocada
                        ? 'Em PDF, a qualquer momento: botão "Baixar edital" no topo.'
                        : 'Fica disponível depois de convocar.'}
                </Par>
                <Par rotulo="Ata">
                    {a.status !== 'ENCERRADA' ? (
                        a.status === 'CANCELADA' ? 'Assembleia cancelada: não tem ata.' : 'Sai ao encerrar, do retrato gravado pelo banco.'
                    ) : a.ataDocumentoId ? (
                        <span className="text-emerald-700">Ata gravada em Documentos, visível no portal.</span>
                    ) : ata.gerando ? (
                        'Gerando a ata...'
                    ) : (
                        <span className="text-amber-700">
                            A ata ainda não foi gravada{ata.erro ? `: ${ata.erro}` : ''}. "Gerar ata novamente" refaz do mesmo retrato.
                        </span>
                    )}
                </Par>
            </div>
        </div>
    );
};

// ─── Pauta ───────────────────────────────────────────────────────────────────

export const PautaSecao: React.FC<{
    assembleia: Assembleia;
    itens: ItemAssembleia[];
    onVoltarParaEditar: () => void;
}> = ({ assembleia: a, itens, onVoltarParaEditar }) => {
    const deliberacao = (i: ItemAssembleia) => a.retrato?.deliberacoes?.[i.id] ?? i.deliberacao;
    return (
        <div className={CARD}>
            <SecaoTitulo icon={ClipboardList} titulo="Pauta" resumo={`${itens.length} ${itens.length === 1 ? 'item' : 'itens'}`}
                acoes={a.status === 'RASCUNHO' ? (
                    <button type="button" onClick={onVoltarParaEditar} className="text-sm font-medium text-blue-600 hover:text-blue-800">
                        Editar na lista de assembleias
                    </button>
                ) : undefined} />
            {a.status === 'RASCUNHO' && (
                <p className="text-xs text-gray-500">
                    Rascunho: dados e pauta se editam pelo lápis na lista de assembleias. Depois de convocar, a pauta não muda.
                </p>
            )}
            {itens.length === 0 ? (
                <p className="text-sm text-gray-600">Nenhum item na pauta.</p>
            ) : (
                <ol className="space-y-3">
                    {itens.map((it, n) => (
                        <li key={it.id} className="rounded-[10px] border border-gray-100 p-4 space-y-1">
                            <p className="text-sm font-medium text-gray-900">{n + 1}. {it.titulo}</p>
                            {it.descricao && <p className="text-sm text-gray-700 whitespace-pre-line">{it.descricao}</p>}
                            <p className="text-xs text-gray-500">
                                {ROTULO_TIPO_ITEM[it.tipo]}
                                {it.tipo === 'ESCOLHA' && it.opcoes?.length ? `: ${it.opcoes.join(', ')}` : ''}
                                {' · '}<span className="text-gray-700">{ROTULO_QUORUM[it.quorum]}</span> — {REGRA_QUORUM[it.quorum]}
                            </p>
                            {deliberacao(it) && (
                                <p className="text-sm text-gray-900"><span className="text-xs font-semibold text-slate-500">Deliberação: </span>{deliberacao(it)}</p>
                            )}
                        </li>
                    ))}
                </ol>
            )}
        </div>
    );
};

// ─── Apuração ao vivo ────────────────────────────────────────────────────────

const COR_RESULTADO: Record<ResultadoItem, string> = {
    APROVADO: 'text-emerald-700',
    REJEITADO: 'text-red-600',
    QUORUM_NAO_ATINGIDO: 'text-amber-700',
    SEM_DECISAO: 'text-gray-600',
};

export const ApuracaoSecao: React.FC<{
    assembleia: Assembleia;
    itens: ItemAssembleia[];
    apuracao: Apuracao | null;
    totalUnidades: number;
    erro: string | null;
    atualizando: boolean;
    onAtualizar: () => void;
}> = ({ assembleia: a, itens, apuracao, totalUnidades, erro, atualizando, onAtualizar }) => {
    const final = a.status === 'ENCERRADA';
    return (
        <div className={CARD}>
            <SecaoTitulo icon={BarChart3} titulo={final ? 'Resultado' : 'Apuração ao vivo'}
                resumo={apuracao
                    ? `${ROTULO_PARTICIPARAM_DA_VOTACAO}: ${percentualDoTotal(apuracao.presentesFracao, apuracao.total)} · ${apuracao.presentesUnidades} de ${totalUnidades} unidades`
                    : undefined}
                acoes={!final ? (
                    <button type="button" onClick={onAtualizar} disabled={atualizando} className={BOTAO_SECUNDARIO}>
                        <RefreshCw className={`w-[15px] h-[15px] ${atualizando ? 'animate-spin' : ''}`} />
                        {atualizando ? 'Atualizando...' : 'Atualizar apuração'}
                    </button>
                ) : undefined} />
            {!final && (
                <p className="text-xs text-gray-500">
                    Parcial: soma os votos dados até agora, pelo portal e na sala. O resultado vale só no encerramento,
                    quando o banco grava o retrato. Percentuais sobre o total das frações da assembleia.
                </p>
            )}
            {erro && <p className="text-sm text-red-600">Não foi possível carregar a apuração: {erro}</p>}
            {!apuracao ? (
                !erro && <p className="text-sm text-gray-500">Carregando a apuração...</p>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {apuracao.itens.slice().sort((x, y) => x.ordem - y.ordem).map((it, n) => {
                        const item = itens.find(i => i.id === it.itemId);
                        const opcoes = item ? opcoesDoItem(item) : Object.keys(it.porOpcao);
                        const somaUn = Object.values(it.porOpcao).reduce((s, o) => s + o.unidades, 0);
                        const somaFr = Object.values(it.porOpcao).reduce((s, o) => s + o.fracao, 0);
                        return (
                            <div key={it.itemId} className="rounded-[10px] border border-gray-100 p-4 space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-gray-900">{n + 1}. {it.titulo}</p>
                                        <p className="text-xs text-gray-500 mt-0.5">{ROTULO_QUORUM[it.quorum]}</p>
                                    </div>
                                    <p className={`text-sm font-normal shrink-0 ${COR_RESULTADO[it.resultado]}`}>
                                        {final ? '' : 'Parcial: '}
                                        {it.vencedora ? `Vencedora: ${it.vencedora}` : ROTULO_RESULTADO[it.resultado]}
                                    </p>
                                </div>
                                <dl className="space-y-1">
                                    {opcoes.map(op => {
                                        const s = it.porOpcao[op] ?? { fracao: 0, unidades: 0 };
                                        return (
                                            <div key={op} className="flex items-center justify-between gap-3 text-sm">
                                                <dt className="text-gray-700">{rotuloOpcao(op)}</dt>
                                                <dd className="text-gray-900 tabular-nums">
                                                    {percentualDoTotal(s.fracao, apuracao.total)}
                                                    <span className="text-gray-500"> · {s.unidades} {s.unidades === 1 ? 'unidade' : 'unidades'}</span>
                                                </dd>
                                            </div>
                                        );
                                    })}
                                    <div className="flex items-center justify-between gap-3 text-sm border-t border-gray-100 pt-1">
                                        <dt className="text-gray-500">Sem voto</dt>
                                        <dd className="text-gray-600 tabular-nums">
                                            {percentualDoTotal(Math.max(apuracao.total - somaFr, 0), apuracao.total)}
                                            {' · '}{Math.max(totalUnidades - somaUn, 0)} {Math.max(totalUnidades - somaUn, 0) === 1 ? 'unidade' : 'unidades'}
                                        </dd>
                                    </div>
                                </dl>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
