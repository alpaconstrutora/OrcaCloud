// components/condominio/AssembleiasTab.tsx
// Aba "Assembleias" do condomínio (Task A7): a lista das assembleias e o único
// lugar onde se cria, edita e exclui o RASCUNHO (guia §18.1). Plano:
// docs/planos/2026-11-25-condominio-assembleias-votacoes.md (R10, "Desenho › Telas").
//
// Abrir uma assembleia NÃO é painel: é TELA (AssembleiaDetalheView), e quem troca
// o conteúdo é o pai (CondominioDetail, early return), como o detalhe do rateio.
//
// Editar e Excluir só existem em RASCUNHO — fora dele a pauta está travada e o
// banco recusa com mensagem genérica, então a ação simplesmente não aparece.
//
// A organização não sai daqui: o gatilho do banco grava fn_org_do_condominio.

import React from 'react';
import { Vote, FilePen, CheckCircle2, AlertCircle, Plus } from 'lucide-react';
import StandardTable, { type StandardTableColumn } from '../ui/StandardTable';
import { KpiCard } from '../ui/KpiCard';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import type { AcaoDoTitulo } from './CondominioDetail';
import AssembleiaSheet from './AssembleiaSheet';
import {
    condominioAssembleiaService, type Assembleia, type ResultadoItem, type StatusAssembleia,
} from '../../services/condominioAssembleiaService';
import {
    dataHoraBrasilia, percentualDoTotal, ROTULO_RESULTADO, ROTULO_STATUS, ROTULO_TIPO,
} from '../../utils/assembleiaTextos';
import type { Empreendimento } from '../../types/empreendimento';
import { BOTAO_PRIMARIO, COR_STATUS } from './assembleia/comum';

const COLUNAS: StandardTableColumn[] = [
    { key: 'titulo', label: 'Título', sortable: true, width: 260 },
    { key: 'tipo', label: 'Tipo', sortable: true, width: 110 },
    { key: 'data', label: '1ª convocação', sortable: true, width: 170 },
    { key: 'status', label: 'Situação', sortable: true, width: 120 },
    { key: 'presentes', label: 'Presentes / participantes', sortable: true, width: 220 },
    { key: 'resultado', label: 'Resultado', sortable: true, width: 260 },
];

/** Ordem do ciclo (R10) para ordenar a coluna Situação. */
const ORDEM_STATUS: Record<StatusAssembleia, number> = { RASCUNHO: 0, CONVOCADA: 1, INSTALADA: 2, ENCERRADA: 3, CANCELADA: 4 };

function presentesDe(a: Assembleia): { texto: string; valor: number | null } {
    const q = a.quorumInstalacao;
    if (!q) return { texto: '—', valor: null };
    const pct = percentualDoTotal(q.presentesFracao, q.total);
    const participantes = a.retrato?.unidades.length;
    return {
        texto: participantes != null
            ? `${q.presentesUnidades} de ${participantes} · ${pct}`
            : `${q.presentesUnidades} ${q.presentesUnidades === 1 ? 'unidade' : 'unidades'} · ${pct}`,
        valor: q.total > 0 ? q.presentesFracao / q.total : 0,
    };
}

function resultadoDe(a: Assembleia): string {
    if (a.status === 'CANCELADA') return a.motivoCancelamento ? `Cancelada: ${a.motivoCancelamento}` : 'Cancelada';
    if (a.status !== 'ENCERRADA' || !a.retrato) return '—';
    const conta = new Map<ResultadoItem, number>();
    for (const it of a.retrato.itens) conta.set(it.resultado, (conta.get(it.resultado) ?? 0) + 1);
    return [...conta.entries()].map(([r, n]) => `${ROTULO_RESULTADO[r]}: ${n}`).join(' · ') || 'Sem itens';
}

interface Props {
    empreendimento: Empreendimento;
    /** Publica "Nova assembleia" na linha do título do condomínio (§17). */
    registrarAcaoDoTitulo?: (acao: AcaoDoTitulo | null) => void;
    /** Abre a TELA da assembleia (o pai faz o early return). */
    onAbrirAssembleia: (id: string) => void;
}

const AssembleiasTab: React.FC<Props> = ({ empreendimento, registrarAcaoDoTitulo, onAbrirAssembleia }) => {
    const confirm = useConfirm();
    const [lista, setLista] = React.useState<Assembleia[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [erro, setErro] = React.useState<string | null>(null);
    const [sheet, setSheet] = React.useState<{ open: boolean; id: string | null }>({ open: false, id: null });
    const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const carregar = React.useCallback(async () => {
        setLoading(true);
        setErro(null);
        try {
            setLista(await condominioAssembleiaService.listar(empreendimento.id));
        } catch (e: unknown) {
            setErro(e instanceof Error ? e.message : 'Erro ao carregar as assembleias.');
        } finally {
            setLoading(false);
        }
    }, [empreendimento.id]);

    React.useEffect(() => { carregar(); }, [carregar]);

    const abrirNova = React.useCallback(() => setSheet({ open: true, id: null }), []);
    React.useEffect(() => {
        if (!registrarAcaoDoTitulo) return;
        registrarAcaoDoTitulo({ label: 'Nova assembleia', onClick: abrirNova });
        return () => registrarAcaoDoTitulo(null);
    }, [registrarAcaoDoTitulo, abrirNova]);

    // §22 — costura local.
    const salva = (a: Assembleia, pautaSalva: boolean) => {
        setLista(prev => (prev.some(x => x.id === a.id) ? prev.map(x => (x.id === a.id ? a : x)) : [a, ...prev]));
        // Pauta que falhou: a gaveta continua aberta com o erro; aqui só não se diz "salvo".
        if (pautaSalva) notify('Rascunho salvo. Para publicar, abra a assembleia e convoque.');
    };

    const excluir = async (a: Assembleia) => {
        const ok = await confirm({
            title: 'Excluir o rascunho?',
            message: `"${a.titulo}" e a pauta dele serão apagados. Rascunho nunca foi publicado, então ninguém mais o viu.`,
            variant: 'danger',
            confirmLabel: 'Excluir rascunho',
        });
        if (!ok) return;
        try {
            await condominioAssembleiaService.excluirRascunho(a.id);
            setLista(prev => prev.filter(x => x.id !== a.id));
            notify('Rascunho excluído.');
        } catch (e: unknown) {
            notify(e instanceof Error ? e.message : 'Erro ao excluir.', 'error');
        }
    };

    const kpis = React.useMemo(() => ({
        andamento: lista.filter(a => a.status === 'CONVOCADA' || a.status === 'INSTALADA').length,
        rascunhos: lista.filter(a => a.status === 'RASCUNHO').length,
        encerradas: lista.filter(a => a.status === 'ENCERRADA').length,
    }), [lista]);

    return (
        <div className="space-y-6">
            {erro && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-[10px] px-4 py-3 text-sm">{erro}</div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <KpiCard label="Em andamento" value={kpis.andamento} sub="convocadas ou instaladas: o portal vota"
                    icon={<Vote className="w-4 h-4" />} color={kpis.andamento ? 'blue' : 'gray'} />
                <KpiCard label="Rascunhos" value={kpis.rascunhos} sub="invisíveis no portal até convocar"
                    icon={<FilePen className="w-4 h-4" />} color="amber" />
                <KpiCard label="Encerradas" value={kpis.encerradas} icon={<CheckCircle2 className="w-4 h-4" />} color="emerald" />
            </div>

            <StandardTable<Assembleia>
                storageKey={`condominio:${empreendimento.id}:assembleias`}
                columns={COLUNAS}
                rows={lista}
                rowKey={a => a.id}
                loading={loading}
                searchText={a => `${a.titulo} ${a.tipo} ${ROTULO_TIPO[a.tipo]} ${ROTULO_STATUS[a.status]}`}
                searchPlaceholder="Buscar por título, tipo ou situação..."
                onRowClick={a => onAbrirAssembleia(a.id)}
                rowLabel={a => `${a.titulo}: abrir a assembleia`}
                sortValue={(key, a) => key === 'titulo' ? a.titulo
                    : key === 'tipo' ? a.tipo
                        : key === 'data' ? a.primeiraConvocacaoEm
                            : key === 'status' ? ORDEM_STATUS[a.status]
                                : key === 'presentes' ? presentesDe(a).valor
                                    : resultadoDe(a)}
                renderCell={(key, a) => {
                    if (key === 'titulo') return <span className="block truncate text-sm font-normal text-gray-700" title={a.titulo}>{a.titulo}</span>;
                    if (key === 'tipo') return <span className="text-sm font-normal text-gray-700" title={ROTULO_TIPO[a.tipo]}>{a.tipo}</span>;
                    if (key === 'data') return <span className="text-sm font-normal text-gray-600">{a.primeiraConvocacaoEm ? dataHoraBrasilia(a.primeiraConvocacaoEm) : 'a definir'}</span>;
                    if (key === 'status') return <span className={`text-sm font-normal ${COR_STATUS[a.status]}`}>{ROTULO_STATUS[a.status]}</span>;
                    if (key === 'presentes') return <span className="text-sm font-normal text-gray-600">{presentesDe(a).texto}</span>;
                    const r = resultadoDe(a);
                    return <span className="block truncate text-sm font-normal text-gray-700" title={r}>{r}</span>;
                }}
                actions={{
                    width: 160,
                    render: a => (
                        <>
                            <button type="button" onClick={() => onAbrirAssembleia(a.id)}
                                className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-[6px] transition-all">
                                Abrir
                            </button>
                            {a.status === 'RASCUNHO' && (
                                <>
                                    <ActionIconButton kind="edit" title="Editar rascunho" onClick={() => setSheet({ open: true, id: a.id })} />
                                    <ActionIconButton kind="delete" title="Excluir rascunho" onClick={() => excluir(a)} />
                                </>
                            )}
                        </>
                    ),
                }}
                toolbarRight={!registrarAcaoDoTitulo ? (
                    <button type="button" onClick={abrirNova} className={BOTAO_PRIMARIO}>
                        <Plus className="w-[15px] h-[15px]" /> Nova assembleia
                    </button>
                ) : undefined}
                empty={{
                    icon: <Vote className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                    title: 'Nenhuma assembleia',
                    subtitle: 'Crie o rascunho com a pauta; convocar publica o aviso no portal e abre o voto.',
                    acao: { rotulo: 'Nova assembleia', onClick: abrirNova },
                }}
            />

            <AssembleiaSheet
                open={sheet.open}
                onClose={() => setSheet({ open: false, id: null })}
                empreendimentoId={empreendimento.id}
                assembleiaId={sheet.id}
                onSalva={salva}
            />

            {notification && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {notification.message}
                </div>
            )}
        </div>
    );
};

export default AssembleiasTab;
