import React from 'react';
import { ClipboardCheck } from 'lucide-react';
import type { ItemControlado } from '../../types/qualidadeSiac';
import { qualidadeSiacService } from '../../services/qualidadeSiacService';
import { errorMessage, useOrgContext } from '../../hooks/useOrgContext';
import { useToast } from '../../hooks/useToast';
import { useStore } from '../../store/useStore';
import { usePersistedState } from '../ui/TableUtils';
import { MOTIVO_SEM_EDICAO_QUALIDADE } from '../../utils/permissaoQualidadeSiac';
import StandardTable, { type StandardTableColumn } from '../ui/StandardTable';
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetPanel, SheetTitle } from '../ui/sheet';

/**
 * Aba "Por obra" do módulo Qualidade (SiAC), fase 1
 * (docs/planos/2026-11-25-qualidade-siac-pbqph.md, "Telas (rascunho)", bullet "Por obra").
 *
 * Regra: todo item ATIVO da lista controlada se aplica a toda obra da organização, salvo a exceção
 * registrada em `quality_project_exclusions` (obra × item) com MOTIVO. A tabela mostra os itens ativos
 * da organização da obra escolhida; "Nesta obra" diz "aplica" ou "não se aplica — motivo".
 *
 * Decisões:
 *  - Obras: `useStore().projects` já vem só com OBRA e sem o projeto de sistema (REGRAS #2/#3), então
 *    não se refiltra por classificação nem por nome. Com organização no topo, só as dela; em "Todas",
 *    todas (REGRA #5: lê `useOrgContext()`, nunca prop).
 *  - A organização do item tem de ser a da obra (a policy do banco exige): por isso a tabela só lista
 *    itens da organização da obra escolhida.
 *  - Motivo obrigatório num Sheet pequeno (e não inline na linha): a linha de uma tabela redimensionável
 *    não comporta o campo, e o Sheet é o padrão do app para entrada de dados (§25). Validação ao
 *    registrar: o botão fica ligado e a mensagem aparece no campo — nunca um botão mudo.
 *  - Falha ao carregar as exceções NÃO vira tabela vazia: sem as exceções todo item pareceria "aplica",
 *    o que seria mentira. Mostra a faixa de erro (com "Tentar de novo") e esconde a tabela.
 *  - A obra escolhida persiste; se sumir da lista (troca de organização), vale a primeira.
 */
interface Props {
    /** Todos os itens carregados pelo módulo (a tabela recorta os ATIVOS da organização da obra). */
    itens: ItemControlado[];
    /** Falso = só leitura, com o motivo no título dos controles desligados. */
    podeEditar: boolean;
}

const ROTULO = 'block text-xs font-semibold text-slate-500';
const CAMPO = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-700 disabled:cursor-not-allowed transition-all';
const COM_ERRO = 'border-red-300 focus:border-red-500 focus:ring-red-500/20';
const BOTAO_PRIMARIO = 'flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 shrink-0';
const BOTAO_VOLTAR = 'h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]';
const BOTAO_LINHA = 'h-8 px-3 bg-white text-gray-700 border border-gray-200 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0';

const MOTIVO_GRAVANDO = 'Aguarde: a gravação anterior ainda está em andamento.';

const TIPO_ROTULO: Record<ItemControlado['tipo'], string> = { SERVICO: 'Serviço', MATERIAL: 'Material' };

const COLUNAS: StandardTableColumn[] = [
    { key: 'numero', label: 'Nº', sortable: true, width: 70, align: 'right' },
    { key: 'tipo', label: 'Tipo', sortable: true, width: 110 },
    { key: 'nome', label: 'Item', sortable: true, width: 320 },
    { key: 'etapa', label: 'Etapa', sortable: true, width: 170 },
    { key: 'nesta', label: 'Nesta obra', sortable: true, width: 340 },
];

/** Item no Sheet do motivo, já com a obra de quando foi aberto. */
interface PedidoDeExcecao { projectId: string; item: ItemControlado }

export const PorObra: React.FC<Props> = ({ itens, podeEditar }) => {
    const { orgId } = useOrgContext();
    const projects = useStore(s => s.projects);
    const { showToast, localToast } = useToast();

    const obras = React.useMemo(
        () => projects
            .filter(p => !!p.id && (!orgId || (p.organization_id ?? p.settings?.organizationId) === orgId))
            .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
        [projects, orgId],
    );

    const [escolhida, setEscolhida] = usePersistedState<string>('qualidade:por-obra:obra', '');
    const obra = obras.find(o => o.id === escolhida) ?? obras[0] ?? null;
    const projectId = obra?.id ?? null;
    const orgDaObra = obra ? (obra.organization_id ?? obra.settings?.organizationId ?? null) : null;

    const [exclusoes, setExclusoes] = React.useState<Record<string, string>>({});
    const [carregando, setCarregando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    const [gravando, setGravando] = React.useState(false);
    const [pedido, setPedido] = React.useState<PedidoDeExcecao | null>(null);

    const seq = React.useRef(0);
    const carregar = React.useCallback(async () => {
        const minha = ++seq.current;
        setExclusoes({});
        setErro(null);
        if (!projectId) { setCarregando(false); return; }
        setCarregando(true);
        try {
            const lista = await qualidadeSiacService.listarExclusoes(projectId);
            if (minha !== seq.current) return;
            setExclusoes(Object.fromEntries(lista.map(x => [x.item_id, x.motivo])));
        } catch (e) {
            if (minha !== seq.current) return;
            setErro(errorMessage(e, 'erro desconhecido'));
        } finally {
            if (minha === seq.current) setCarregando(false);
        }
    }, [projectId]);
    React.useEffect(() => { void carregar(); }, [carregar]);
    /** A recarga depois de gravar usa o `carregar` de AGORA: se a obra trocou no meio, recarrega a nova. */
    const carregarRef = React.useRef(carregar);
    carregarRef.current = carregar;

    const linhas = React.useMemo(
        () => itens.filter(i => i.situacao === 'ATIVO' && !!orgDaObra && i.organization_id === orgDaObra),
        [itens, orgDaObra],
    );

    const rotuloNesta = React.useCallback((i: ItemControlado) => (
        i.id in exclusoes ? `não se aplica — ${exclusoes[i.id]}` : 'aplica'
    ), [exclusoes]);

    const voltarAAplicar = async (i: ItemControlado) => {
        if (!projectId) return;
        setGravando(true);
        try {
            await qualidadeSiacService.reincluirNaObra(projectId, i.id);
            showToast(`"${i.nome}" voltou a se aplicar nesta obra.`, 'success');
        } catch (e) {
            showToast(`Não foi possível voltar a aplicar: ${errorMessage(e, 'erro desconhecido')}`, 'error');
        } finally {
            setGravando(false);
        }
        await carregarRef.current();
    };

    const registrarExcecao = async (p: PedidoDeExcecao, motivo: string) => {
        setGravando(true);
        try {
            await qualidadeSiacService.excluirDaObra(p.projectId, p.item.id, motivo);
            showToast(`"${p.item.nome}" não se aplica nesta obra.`, 'success');
            setPedido(null);
        } catch (e) {
            showToast(`Não foi possível registrar a exceção: ${errorMessage(e, 'erro desconhecido')}`, 'error');
        } finally {
            setGravando(false);
        }
        await carregarRef.current();
    };

    const vazio = obra
        ? { title: 'Nenhum item ativo', subtitle: 'A organização desta obra não tem item ativo na lista controlada. Cadastre na aba "Lista controlada".' }
        : { title: 'Nenhuma obra', subtitle: orgId ? 'A organização do topo não tem obra cadastrada.' : 'Nenhuma obra cadastrada.' };

    return (
        <section aria-label="Qualidade por obra" className="space-y-4">
            <div className="max-w-sm space-y-1.5">
                <label htmlFor="po-obra" className={ROTULO}>Obra</label>
                <select id="po-obra" className={CAMPO} value={obra?.id ?? ''} disabled={obras.length === 0}
                    onChange={e => setEscolhida(e.target.value)}>
                    {obras.length === 0 && <option value="">Nenhuma obra</option>}
                    {obras.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
            </div>

            {erro ? (
                <div className="flex flex-wrap items-center justify-between gap-3 bg-red-50 border border-red-100 rounded-[10px] px-4 py-3 text-sm text-red-700">
                    <span>Não foi possível carregar as exceções da obra: {erro}</span>
                    <button type="button" onClick={() => void carregar()} className="font-medium text-red-700 underline">Tentar de novo</button>
                </div>
            ) : (
                <StandardTable<ItemControlado>
                    storageKey="qualidade:por-obra"
                    columns={COLUNAS}
                    rows={linhas}
                    rowKey={i => i.id}
                    loading={carregando}
                    searchText={i => `${i.nome} ${i.etapa ?? ''} ${TIPO_ROTULO[i.tipo]} ${rotuloNesta(i)}`}
                    searchPlaceholder="Buscar por item, etapa ou motivo..."
                    defaultSort={{ column: 'numero', direction: 'asc' }}
                    sortValue={(k, i) => {
                        switch (k) {
                            case 'numero': return i.anexo4_numero ?? i.ordem;
                            case 'tipo': return TIPO_ROTULO[i.tipo];
                            case 'etapa': return i.etapa ?? '';
                            case 'nesta': return rotuloNesta(i);
                            default: return i.nome;
                        }
                    }}
                    renderCell={(k, i) => {
                        switch (k) {
                            case 'numero': {
                                const n = i.anexo4_numero ?? (i.ordem > 0 ? i.ordem : null);
                                return <span className="text-sm font-normal text-gray-600">{n ?? '—'}</span>;
                            }
                            case 'tipo': return <span className="text-sm font-normal text-gray-700">{TIPO_ROTULO[i.tipo]}</span>;
                            case 'nome': return <span className="block truncate text-sm font-normal text-gray-700" title={i.nome}>{i.nome}</span>;
                            case 'etapa': return <span className="block truncate text-sm font-normal text-gray-700" title={i.etapa ?? undefined}>{i.etapa || '—'}</span>;
                            case 'nesta': { const t = rotuloNesta(i); return <span className="block truncate text-sm font-normal text-gray-700" title={t}>{t}</span>; }
                            default: return null;
                        }
                    }}
                    actions={{
                        label: 'Ações',
                        width: 170,
                        render: i => {
                            const excecao = i.id in exclusoes;
                            // O motivo fica no `<span>` que envolve o botão: botão desligado engole o hover.
                            const desligadoPor = !podeEditar ? MOTIVO_SEM_EDICAO_QUALIDADE : gravando ? MOTIVO_GRAVANDO : undefined;
                            return (
                                <span className="inline-flex" title={desligadoPor}>
                                    {excecao ? (
                                        <button type="button" className={BOTAO_LINHA} disabled={!!desligadoPor}
                                            onClick={() => void voltarAAplicar(i)}>Voltar a aplicar</button>
                                    ) : (
                                        <button type="button" className={BOTAO_LINHA} disabled={!!desligadoPor}
                                            onClick={() => projectId && setPedido({ projectId, item: i })}>Não se aplica</button>
                                    )}
                                </span>
                            );
                        },
                    }}
                    empty={{
                        icon: <ClipboardCheck className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                        title: linhas.length > 0 ? 'Nenhum item com esta busca' : vazio.title,
                        subtitle: linhas.length > 0 ? 'Mude a busca.' : vazio.subtitle,
                    }}
                />
            )}

            {pedido && (
                <SheetDoMotivo key={`${pedido.projectId}:${pedido.item.id}`} pedido={pedido}
                    nomeDaObra={obras.find(o => o.id === pedido.projectId)?.name ?? 'obra'}
                    gravando={gravando}
                    onClose={() => setPedido(null)}
                    onRegistrar={m => void registrarExcecao(pedido, m)} />
            )}

            {/* §13 — com o ToastProvider na raiz `localToast` vem null; sem provider (teste) aparece aqui. */}
            {localToast && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium ${localToast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
                    {localToast.message}
                </div>
            )}
        </section>
    );
};

const SheetDoMotivo: React.FC<{
    pedido: PedidoDeExcecao;
    nomeDaObra: string;
    gravando: boolean;
    onClose(): void;
    onRegistrar(motivo: string): void;
}> = ({ pedido, nomeDaObra, gravando, onClose, onRegistrar }) => {
    const [motivo, setMotivo] = React.useState('');
    const [erro, setErro] = React.useState<string | undefined>();

    const registrar = () => {
        const m = motivo.trim();
        if (!m) { setErro('Informe o motivo.'); return; }
        onRegistrar(m);
    };

    return (
        <Sheet open onClose={onClose} size="md" dirty={motivo.trim() !== ''} zIndex={60}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Não se aplica nesta obra</SheetTitle>
                <SheetDescription>{pedido.item.nome} · {nomeDaObra}</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-5 space-y-5">
                <fieldset disabled={gravando} className="min-w-0 space-y-1.5">
                    <label htmlFor="po-motivo" className={ROTULO}>Motivo</label>
                    <input id="po-motivo" className={`${CAMPO} ${erro ? COM_ERRO : ''}`} value={motivo}
                        placeholder="Por que este item não se aplica a esta obra"
                        aria-invalid={!!erro} aria-describedby={erro ? 'po-motivo-erro' : undefined}
                        onChange={e => { setMotivo(e.target.value); setErro(undefined); }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); registrar(); } }} />
                    {erro && <p id="po-motivo-erro" role="alert" className="text-xs text-red-600">{erro}</p>}
                </fieldset>
            </SheetPanel>
            <SheetFooter>
                <button type="button" onClick={onClose} className={BOTAO_VOLTAR}>Cancelar</button>
                <span className="inline-flex" title={gravando ? MOTIVO_GRAVANDO : undefined}>
                    <button type="button" onClick={registrar} disabled={gravando} className={BOTAO_PRIMARIO}>Registrar exceção</button>
                </span>
            </SheetFooter>
        </Sheet>
    );
};

export default PorObra;
