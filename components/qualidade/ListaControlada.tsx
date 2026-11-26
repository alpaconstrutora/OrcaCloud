import React from 'react';
import { Archive, ClipboardCheck, Plus } from 'lucide-react';
import type {
    ItemControlado, OrigemItem, ProcedimentoResumo, RegistroTreinamento, TipoItemControlado,
} from '../../types/qualidadeSiac';
import { contarTreinados, rotuloDoProcedimento, rotuloDosTreinados } from '../../utils/qualidadeSiac';
import { MOTIVO_SEM_EDICAO_QUALIDADE } from '../../utils/permissaoQualidadeSiac';
import StandardTable, { type StandardTableColumn } from '../ui/StandardTable';

/**
 * Lista controlada (serviços ou materiais) — a tabela da aba "Lista controlada".
 * Rascunho em docs/planos/2026-11-25-qualidade-siac-pbqph.md, "Telas (rascunho)".
 *
 *  - Dispensado aparece com a justificativa na coluna Procedimento (sai do N do painel, mas não some).
 *  - Arquivado (o "apagar" da tela — item criado por engano, inclusive replicado em "Todas") fica
 *    escondido; "Mostrar arquivados (N)", acima da tabela e só quando há algum, o mostra marcado
 *    "Arquivado" para reabrir e reativar. Nunca conta no painel (que só conta ATIVO).
 *  - Treinados é CONTAGEM (quem tem registro no curso), nunca "x de y".
 *  - Executores treinados (serviços, fase 2) é a fração "x de y" da inspeção aprovada MAIS RECENTE do
 *    serviço (executores congelados na aprovação, `contarAplicados().porItem`); "—" sem inspeção.
 *  - Lista vazia: o vazio orienta com a carga (Anexo 4 para serviços, sugestão para materiais).
 *  - Clicar na linha abre o item (`onAbrir`).
 */
export const ROTULO_ORIGEM: Record<OrigemItem, string> = {
    ANEXO4: 'Anexo 4',
    PROPRIO: 'Próprio',
    CLIENTE: 'Exigido pelo cliente',
    FAD_DATEC: 'FAD/DATec',
};

const TEXTO_DO_TIPO: Record<TipoItemControlado, {
    novo: string; carregar: string; vazio: string; subtitulo: string; nome: string; todosArquivados: string;
}> = {
    SERVICO: {
        todosArquivados: 'Todos os serviços estão arquivados',
        novo: 'Novo serviço',
        carregar: 'Carregar a lista mínima do Anexo 4 (27 serviços)',
        vazio: 'Nenhum serviço controlado',
        subtitulo: 'Comece pelos 27 serviços do Anexo 4 do SiAC. Depois dispense o que a construtora não executa.',
        nome: 'Serviço',
    },
    MATERIAL: {
        todosArquivados: 'Todos os materiais estão arquivados',
        novo: 'Novo material',
        carregar: 'Carregar sugestão de materiais (editável)',
        vazio: 'Nenhum material controlado',
        subtitulo: 'O Anexo 4 pede pelo menos 20 materiais. A sugestão é um ponto de partida: edite à vontade.',
        nome: 'Material',
    },
};

interface Props {
    tipo: TipoItemControlado;
    itens: ItemControlado[];
    procedimentos: Record<string, ProcedimentoResumo>;
    treinamentos: Record<string, RegistroTreinamento[]>;
    podeEditar: boolean;
    onCarregar(): void;
    onNovo(): void;
    onAbrir(item: ItemControlado): void;
    /** Carregando a lista (o vazio só aparece depois de saber que está vazia). */
    carregando?: boolean;
    /** Nome por organização — a coluna "Organização" só aparece quando a lista tem mais de uma. */
    nomesDasOrgs?: Record<string, string>;
    /** Sub-abas (Serviços | Materiais), acopladas no topo do card da tabela (§19.1 acoplada). */
    abas?: React.ReactNode;
    /** Serviços: executores treinados da inspeção aprovada mais recente, por item (`contarAplicados().porItem`). */
    executoresPorItem?: Record<string, { treinados: number; executores: number }>;
}

const procedimentoDo = (i: ItemControlado, procedimentos: Record<string, ProcedimentoResumo>) =>
    (i.procedure_document_id ? procedimentos[i.procedure_document_id] ?? null : null);

export const ListaControlada: React.FC<Props> = ({
    tipo, itens, procedimentos, treinamentos, podeEditar, onCarregar, onNovo, onAbrir, carregando, nomesDasOrgs, abas,
    executoresPorItem,
}) => {
    const texto = TEXTO_DO_TIPO[tipo];

    const [mostrarArquivados, setMostrarArquivados] = React.useState(false);
    const arquivados = React.useMemo(
        () => itens.filter(i => i.tipo === tipo && i.situacao === 'ARQUIVADO').length,
        [itens, tipo],
    );
    // Sem arquivado o botão some; o próximo arquivamento volta a esconder por padrão.
    React.useEffect(() => { if (arquivados === 0) setMostrarArquivados(false); }, [arquivados]);
    const linhas = React.useMemo(
        () => itens.filter(i => i.tipo === tipo && (mostrarArquivados || i.situacao !== 'ARQUIVADO')),
        [itens, tipo, mostrarArquivados],
    );
    const mostrarOrg = React.useMemo(() => new Set(linhas.map(i => i.organization_id)).size > 1, [linhas]);
    const nomeOrg = React.useCallback((id: string) => nomesDasOrgs?.[id] ?? 'Organização fora da lista', [nomesDasOrgs]);

    const rotuloProcedimento = React.useCallback((i: ItemControlado) => (
        i.situacao === 'DISPENSADO'
            ? `Dispensado — "${i.justificativa ?? ''}"`
            : i.situacao === 'ARQUIVADO'
                ? (i.justificativa ? `Arquivado — "${i.justificativa}"` : 'Arquivado')
                : rotuloDoProcedimento(procedimentoDo(i, procedimentos))
    ), [procedimentos]);

    const contagem = React.useCallback((i: ItemControlado) => {
        if (i.situacao === 'DISPENSADO' || !i.training_course_id) return null;
        return contarTreinados(treinamentos[i.training_course_id] ?? [], procedimentoDo(i, procedimentos)?.versao_ativa_em ?? null);
    }, [treinamentos, procedimentos]);

    const rotuloTreinados = React.useCallback((i: ItemControlado) => {
        const c = contagem(i);
        if (!c) return '—';
        if (c.revisaoAnterior === 0) return rotuloDosTreinados(c);   // '—' quando ninguém
        const vigentes = c.proprios + c.empreiteira > 0 ? rotuloDosTreinados(c) : 'Nenhum na revisão vigente';
        return `${vigentes} · ${c.revisaoAnterior} treinado(s) em revisão anterior`;
    }, [contagem]);

    const rotuloExecutores = React.useCallback((i: ItemControlado) => {
        const e = executoresPorItem?.[i.id];
        return e ? `${e.treinados} de ${e.executores}` : '—';
    }, [executoresPorItem]);

    const colunas = React.useMemo<StandardTableColumn[]>(() => [
        { key: 'numero', label: 'Nº', sortable: true, width: 70, align: 'right' },
        { key: 'nome', label: texto.nome, sortable: true, width: 320 },
        ...(mostrarOrg ? [{ key: 'org', label: 'Organização', sortable: true, width: 180 }] : []),
        { key: 'etapa', label: 'Etapa', sortable: true, width: 170 },
        { key: 'origem', label: 'Origem', sortable: true, width: 150 },
        { key: 'procedimento', label: 'Procedimento', sortable: true, width: 260 },
        { key: 'treinados', label: 'Treinados (rev. vigente)', sortable: true, width: 220 },
        ...(tipo === 'SERVICO' ? [{ key: 'executores', label: 'Executores treinados', sortable: true, width: 170 }] : []),
        { key: 'codigos', label: 'Códigos', sortable: true, width: 100, align: 'right' },
    ], [texto.nome, mostrarOrg, tipo]);

    const novo = (
        <span className="inline-flex" title={podeEditar ? undefined : MOTIVO_SEM_EDICAO_QUALIDADE}>
            <button type="button" onClick={onNovo} disabled={!podeEditar}
                className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 shrink-0">
                <Plus className="w-[15px] h-[15px]" /> {texto.novo}
            </button>
        </span>
    );

    const filtroArquivados = arquivados > 0 ? (
        <button type="button" aria-pressed={mostrarArquivados} onClick={() => setMostrarArquivados(v => !v)}
            title={mostrarArquivados ? 'Esconder os itens arquivados' : 'Mostrar os itens arquivados para reabrir ou reativar'}
            className={`flex items-center gap-1.5 h-9 px-3.5 border rounded-[6px] font-medium text-[13px] transition-all shrink-0 ${mostrarArquivados
                ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}>
            <Archive className="w-[15px] h-[15px]" aria-hidden="true" /> Mostrar arquivados ({arquivados})
        </button>
    ) : undefined;

    const temLista = linhas.length > 0;

    return (
        <StandardTable<ItemControlado>
            storageKey={`qualidade:lista:${tipo}`}
            columns={colunas}
            rows={linhas}
            rowKey={i => i.id}
            loading={carregando}
            toolbarTop={abas}
            filters={filtroArquivados}
            toolbarRight={novo}
            searchText={i => `${i.nome} ${i.etapa ?? ''} ${ROTULO_ORIGEM[i.origem]} ${rotuloProcedimento(i)} ${i.codigos.join(' ')}`}
            searchPlaceholder={tipo === 'SERVICO' ? 'Buscar por serviço, etapa, procedimento ou código...' : 'Buscar por material, procedimento ou código...'}
            defaultSort={{ column: 'numero', direction: 'asc' }}
            sortValue={(k, i) => {
                switch (k) {
                    case 'numero': return i.anexo4_numero ?? i.ordem;
                    case 'org': return nomeOrg(i.organization_id);
                    case 'etapa': return i.etapa ?? '';
                    case 'origem': return ROTULO_ORIGEM[i.origem];
                    case 'procedimento': return rotuloProcedimento(i);
                    case 'treinados': { const c = contagem(i); return c ? c.proprios + c.empreiteira : -1; }
                    case 'executores': { const e = executoresPorItem?.[i.id]; return e ? e.treinados / Math.max(e.executores, 1) : -1; }
                    case 'codigos': return i.codigos.length;
                    default: return i.nome;
                }
            }}
            onRowClick={onAbrir}
            rowLabel={i => `${i.nome}. Abrir o item`}
            renderCell={(k, i) => {
                switch (k) {
                    case 'numero': {
                        const n = i.anexo4_numero ?? (i.ordem > 0 ? i.ordem : null);
                        return <span className="text-sm font-normal text-gray-600" title={i.anexo4_numero ? 'Número no Anexo 4 do SiAC' : undefined}>{n ?? '—'}</span>;
                    }
                    case 'nome': return <span className="block truncate text-sm font-normal text-gray-700" title={i.nome}>{i.nome}</span>;
                    case 'org': { const t = nomeOrg(i.organization_id); return <span className="block truncate text-sm font-normal text-gray-700" title={t}>{t}</span>; }
                    case 'etapa': return <span className="block truncate text-sm font-normal text-gray-700" title={i.etapa ?? undefined}>{i.etapa || '—'}</span>;
                    case 'origem': return <span className="text-sm font-normal text-gray-700">{ROTULO_ORIGEM[i.origem]}</span>;
                    case 'procedimento': {
                        const t = rotuloProcedimento(i);
                        return <span className={`block truncate text-sm font-normal ${i.situacao === 'ATIVO' ? 'text-gray-700' : 'text-gray-600'}`} title={t}>{t}</span>;
                    }
                    case 'treinados': { const t = rotuloTreinados(i); return <span className="block truncate text-sm font-normal text-gray-700" title={t}>{t}</span>; }
                    case 'executores': {
                        const t = rotuloExecutores(i);
                        return <span className="text-sm font-normal text-gray-700" title={t === '—' ? 'Nenhuma inspeção aprovada deste serviço' : 'Executores treinados na inspeção aprovada mais recente'}>{t}</span>;
                    }
                    case 'codigos': return <span className="text-sm font-normal text-gray-700">{i.codigos.length}</span>;
                    default: return null;
                }
            }}
            empty={temLista
                ? { icon: <ClipboardCheck className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhum item com esta busca', subtitle: 'Mude a busca.' }
                : arquivados > 0
                    // Tudo arquivado: a carga não traria nada (a chave padrão já existe) — o caminho é reativar.
                    ? {
                        icon: <ClipboardCheck className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                        title: texto.todosArquivados,
                        subtitle: 'Use "Mostrar arquivados" acima da tabela para vê-los, abrir um item e voltar a situação para Ativo.',
                    }
                    : {
                        icon: <ClipboardCheck className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                        title: texto.vazio,
                        subtitle: texto.subtitulo,
                        acao: { rotulo: texto.carregar, onClick: onCarregar, desligadoPor: podeEditar ? undefined : MOTIVO_SEM_EDICAO_QUALIDADE },
                    }}
        />
    );
};

export default ListaControlada;
