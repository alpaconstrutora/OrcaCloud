// components/condominio/BuildingSystemSelect.tsx — campo "Sistema predial" com o cadastro dentro
// Plano: docs/planos/2026-10-15-condominio-sistema-predial-crud.md
//
// Antes era um <select> nativo sobre `building_systems`, sem tela nenhuma para
// cadastrar: com a lista vazia, o aviso mandava rodar o "bloco 9 da migration".
// Agora o campo abre um seletor em drawer — a exceção de drawer sobre drawer do
// UI_PATTERNS §4 (seletor de campo, por portal, Esc fecha só ele) — e o
// cadastro mora ali: buscar, cadastrar, editar, desativar/reativar, excluir.
// Escolher um sistema fecha o drawer.
//
// Regras que o componente garante:
//  - a organização é a DO REGISTRO (`organizationId`), nunca perguntada (REGRA #5);
//  - excluir só o que ninguém usa — usado, oferece desativar (ver
//    `maintenanceService.countSystemUsage`);
//  - inativo some da escolha, mas continua aparecendo no campo de quem já aponta para ele;
//  - nome repetido (sem caixa/acento) é recusado apontando o existente;
//  - o `slug` nasce do nome e não muda ao renomear (é a chave do catálogo de itens padrão);
//  - a lista é do PAI (`onSistemasChange`): a aba usa os mesmos sistemas nas tabelas.
import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, Plus, Layers, AlertCircle } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from '../ui/sheet';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import { maintenanceService } from '../../services/maintenanceService';
import { SISTEMAS_PADRAO, slugLivre } from '../../services/maintenanceCatalog';
import { acharPorNome, filtrarPorNome, normalizarNome, NOME_CATALOGO_MAX } from '../../utils/catalogoNome';
import type { BuildingSystem } from '../../types/condominio';

const CAMPO = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none';
const ROTULO = 'text-xs font-semibold text-slate-500';

interface Props {
    /** Org do registro (empreendimento). Sem ela o campo fica desligado, com o motivo. */
    organizationId: string | null | undefined;
    sistemas: BuildingSystem[];
    onSistemasChange: (sistemas: BuildingSystem[]) => void;
    /** '' = sem sistema definido. */
    value: string;
    onChange: (id: string) => void;
    id?: string;
    /**
     * Camada do drawer. 150: acima do `Sheet` do formulário (50) e ABAIXO do
     * `useConfirm` (200) — com o 10000 dos outros seletores, a confirmação de
     * excluir/desativar nasceria atrás do drawer e o clique pareceria morto.
     */
    zIndex?: number;
}

function ordenar(lista: BuildingSystem[]): BuildingSystem[] {
    return [...lista].sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name, 'pt-BR'));
}

type Edicao = { id: string | null; name: string; norm_ref: string; is_active: boolean };

const BuildingSystemSelect: React.FC<Props> = ({
    organizationId, sistemas, onSistemasChange, value, onChange, id, zIndex = 150,
}) => {
    const confirm = useConfirm();
    const [open, setOpen] = React.useState(false);
    // Montado só enquanto aberto, por portal — igual ao HierarchicalSelect: dentro
    // do painel do Sheet (transform + overflow-hidden) um `fixed` ficaria preso.
    const [mounted, setMounted] = React.useState(false);
    const [shown, setShown] = React.useState(false);
    React.useEffect(() => {
        if (open) {
            setMounted(true);
            const r = requestAnimationFrame(() => setShown(true));
            return () => cancelAnimationFrame(r);
        }
        setShown(false);
        const t = window.setTimeout(() => setMounted(false), 300);
        return () => window.clearTimeout(t);
    }, [open]);

    // §3.1 — a busca filtra o seletor, não a tela: estado transitório.
    const [busca, setBusca] = React.useState('');
    const [edicao, setEdicao] = React.useState<Edicao | null>(null);
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);

    const selecionado = sistemas.find(s => s.id === value);
    const ativos = React.useMemo(() => ordenar(sistemas.filter(s => s.is_active)), [sistemas]);
    const inativos = React.useMemo(() => ordenar(sistemas.filter(s => !s.is_active)), [sistemas]);
    const texto = (s: BuildingSystem) => `${s.name} ${s.norm_ref ?? ''}`;
    const ativosFiltrados = filtrarPorNome(ativos, busca, texto, 500);
    const inativosFiltrados = filtrarPorNome(inativos, busca, texto, 500);
    const padraoFaltando = SISTEMAS_PADRAO.filter(p => !sistemas.some(s => s.slug === p.slug)).length;
    const semOrg = !organizationId;

    const fechar = () => { setOpen(false); setBusca(''); setEdicao(null); setErro(null); };
    const escolher = (sid: string) => { onChange(sid); fechar(); };

    const substituir = (s: BuildingSystem) =>
        onSistemasChange(ordenar(sistemas.some(x => x.id === s.id) ? sistemas.map(x => (x.id === s.id ? s : x)) : [...sistemas, s]));

    // Sem org o gatilho já vem desligado com o motivo; se mesmo assim chegar
    // aqui, a ação diz por que não gravou em vez de não fazer nada calada.
    const orgDoRegistro = (): string => {
        if (organizationId) return organizationId;
        throw new Error('O empreendimento não tem organização — não há onde cadastrar os sistemas.');
    };

    const salvar = async () => {
        if (!edicao) return;
        const nome = normalizarNome(edicao.name);
        if (!nome) { setErro('Dê um nome ao sistema.'); return; }
        const igual = acharPorNome(sistemas.filter(s => s.id !== edicao.id), nome);
        if (igual) {
            setErro(igual.is_active
                ? `Já existe "${igual.name}".`
                : `Já existe "${igual.name}", desativado — reative-o na lista de inativos.`);
            return;
        }
        const norma = normalizarNome(edicao.norm_ref) || null;
        setSalvando(true);
        setErro(null);
        try {
            if (edicao.id) {
                substituir(await maintenanceService.updateSystem(edicao.id, { name: nome, norm_ref: norma, is_active: edicao.is_active }));
                setEdicao(null);
            } else {
                const org = orgDoRegistro();
                const ultimo = sistemas.reduce((m, s) => Math.max(m, s.sort_order), 0);
                const criado = await maintenanceService.createSystem({
                    organization_id: org,
                    name: nome,
                    slug: slugLivre(nome, sistemas),
                    norm_ref: norma,
                    description: null,
                    sort_order: ultimo + 10,
                });
                substituir(criado);
                // Cadastrou a partir do campo = é este que a pessoa quer no item.
                escolher(criado.id);
            }
        } catch (e: any) {
            setErro(e?.message || 'Erro ao salvar o sistema.');
        } finally {
            setSalvando(false);
        }
    };

    const alternarAtivo = async (s: BuildingSystem, ativo: boolean) => {
        setErro(null);
        try {
            substituir(await maintenanceService.updateSystem(s.id, { is_active: ativo }));
        } catch (e: any) {
            setErro(e?.message || 'Erro ao atualizar o sistema.');
        }
    };

    const excluir = async (s: BuildingSystem) => {
        setErro(null);
        try {
            const uso = await maintenanceService.countSystemUsage(s.id);
            const partes = [
                uso.itens && `${uso.itens} ${uso.itens === 1 ? 'item de plano' : 'itens de plano'}`,
                uso.ativos && `${uso.ativos} ${uso.ativos === 1 ? 'ativo' : 'ativos'}`,
                uso.ordens && `${uso.ordens} ${uso.ordens === 1 ? 'ordem de serviço' : 'ordens de serviço'}`,
            ].filter(Boolean);
            if (partes.length > 0) {
                if (!s.is_active) {
                    await confirm({
                        title: 'Não é possível excluir',
                        message: `"${s.name}" está em ${partes.join(', ')} — excluí-lo deixaria esses registros sem sistema. Ele já está desativado e não aparece para escolha nova.`,
                        variant: 'default',
                        confirmLabel: 'Entendi',
                    });
                    return;
                }
                const ok = await confirm({
                    title: 'Desativar em vez de excluir?',
                    message: `"${s.name}" está em ${partes.join(', ')}. Excluí-lo deixaria esses registros sem sistema. Desativado, ele some da escolha em item e ordem novos e continua nos que já o usam.`,
                    variant: 'warning',
                    confirmLabel: 'Desativar',
                });
                if (ok) await alternarAtivo(s, false);
                return;
            }
            const ok = await confirm({
                title: 'Excluir o sistema predial?',
                message: `"${s.name}" não está em nenhum item de plano, ativo ou ordem. Esta ação não pode ser desfeita.`,
                variant: 'danger',
                confirmLabel: 'Excluir',
            });
            if (!ok) return;
            await maintenanceService.deleteSystem(s.id);
            onSistemasChange(sistemas.filter(x => x.id !== s.id));
            if (value === s.id) onChange('');
            if (edicao?.id === s.id) setEdicao(null);
        } catch (e: any) {
            setErro(e?.message || 'Erro ao excluir o sistema.');
        }
    };

    const cadastrarPadrao = async () => {
        setSalvando(true);
        setErro(null);
        try {
            onSistemasChange(ordenar(await maintenanceService.seedDefaultSystems(orgDoRegistro())));
        } catch (e: any) {
            setErro(e?.message || 'Erro ao cadastrar os sistemas padrão.');
        } finally {
            setSalvando(false);
        }
    };

    const linha = (s: BuildingSystem) => {
        const atual = s.id === value;
        return (
            <div key={s.id} className={`flex items-center gap-2 px-4 py-2 transition-colors hover:bg-gray-50 ${atual ? 'bg-gray-100' : ''}`}>
                {s.is_active ? (
                    <button type="button" onClick={() => escolher(s.id)} className="flex-1 min-w-0 flex items-baseline gap-2 text-left">
                        <span className="text-sm font-normal text-gray-900 truncate">{s.name}</span>
                        {s.norm_ref && <span className="text-xs font-normal text-gray-500 shrink-0">{s.norm_ref}</span>}
                    </button>
                ) : (
                    <div className="flex-1 min-w-0 flex items-baseline gap-2" title="Desativado — reative para escolher">
                        <span className="text-sm font-normal text-gray-400 truncate">{s.name}</span>
                        {s.norm_ref && <span className="text-xs font-normal text-gray-400 shrink-0">{s.norm_ref}</span>}
                    </div>
                )}
                <div className="flex items-center gap-1.5 shrink-0">
                    {!s.is_active && (
                        <button
                            type="button"
                            onClick={() => alternarAtivo(s, true)}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium px-1.5 py-1 hover:bg-blue-50 rounded-[6px] transition-all"
                        >
                            Reativar
                        </button>
                    )}
                    <ActionIconButton
                        kind="edit"
                        size="sm"
                        onClick={() => { setErro(null); setEdicao({ id: s.id, name: s.name, norm_ref: s.norm_ref ?? '', is_active: s.is_active }); }}
                    />
                    <ActionIconButton kind="delete" size="sm" title="Excluir" onClick={() => excluir(s)} />
                </div>
            </div>
        );
    };

    const formulario = edicao && (
        <div className="px-4 py-4 border-b border-gray-100 bg-gray-50/60 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">{edicao.id ? 'Editar sistema' : 'Novo sistema'}</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div className="space-y-1.5 col-span-2 sm:col-span-1">
                    <label htmlFor="sistema-nome" className={ROTULO}>Nome</label>
                    <input
                        id="sistema-nome"
                        autoFocus
                        type="text"
                        maxLength={NOME_CATALOGO_MAX}
                        value={edicao.name}
                        onChange={e => setEdicao(v => v && { ...v, name: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') salvar(); }}
                        placeholder="Ex: Piscina"
                        className={CAMPO}
                    />
                </div>
                <div className="space-y-1.5 col-span-2 sm:col-span-1">
                    <label htmlFor="sistema-norma" className={ROTULO}>Norma de referência</label>
                    <input
                        id="sistema-norma"
                        type="text"
                        maxLength={60}
                        value={edicao.norm_ref}
                        onChange={e => setEdicao(v => v && { ...v, norm_ref: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') salvar(); }}
                        placeholder="Ex: NBR 10339"
                        className={CAMPO}
                    />
                </div>
            </div>
            {edicao.id && (
                <label className="flex items-center gap-2 text-sm font-normal text-gray-700 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={edicao.is_active}
                        onChange={e => setEdicao(v => v && { ...v, is_active: e.target.checked })}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500/20"
                    />
                    Disponível para escolha em item e ordem novos
                </label>
            )}
            <div className="flex items-center justify-end gap-2">
                <button
                    type="button"
                    onClick={() => { setEdicao(null); setErro(null); }}
                    className="h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all"
                >
                    Cancelar
                </button>
                <button
                    type="button"
                    onClick={salvar}
                    disabled={salvando}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                >
                    {salvando ? 'Salvando...' : edicao.id ? 'Salvar' : 'Cadastrar e escolher'}
                </button>
            </div>
        </div>
    );

    const nadaNaBusca = busca.trim() !== '' && ativosFiltrados.length === 0 && inativosFiltrados.length === 0;

    return (
        <>
            <button
                id={id}
                type="button"
                onClick={() => setOpen(true)}
                disabled={semOrg}
                title={semOrg ? 'O empreendimento não tem organização — não há onde cadastrar os sistemas.' : undefined}
                aria-haspopup="dialog"
                aria-expanded={open}
                className={`${CAMPO} flex items-center justify-between gap-2 text-left disabled:opacity-60 disabled:cursor-not-allowed`}
            >
                {selecionado ? (
                    <span className="text-sm font-normal text-gray-900 truncate">
                        {selecionado.name}
                        {!selecionado.is_active && <span className="text-gray-400"> · desativado</span>}
                    </span>
                ) : (
                    <span className="text-sm font-normal text-gray-400 truncate">
                        {semOrg ? 'Empreendimento sem organização' : 'Sem sistema definido'}
                    </span>
                )}
                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
            </button>

            {mounted && createPortal(
                <Sheet open={shown} onClose={fechar} side="right" size="md" zIndex={zIndex}>
                    <SheetHeader onClose={fechar}>
                        <SheetTitle>Sistemas prediais</SheetTitle>
                        <SheetDescription>Escolha o sistema, ou cadastre e ajuste os da organização.</SheetDescription>
                    </SheetHeader>

                    <div className="p-4 border-b border-gray-100 shrink-0 flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                autoFocus
                                type="text"
                                value={busca}
                                onChange={e => setBusca(e.target.value)}
                                placeholder="Buscar por nome ou norma..."
                                className={`${CAMPO} pl-9`}
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => { setErro(null); setEdicao({ id: null, name: busca.trim(), norm_ref: '', is_active: true }); }}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                        >
                            <Plus className="w-[15px] h-[15px]" /> Novo
                        </button>
                    </div>

                    {erro && (
                        <div className="mx-4 mt-3 flex items-start gap-2 px-3 py-2 rounded-[6px] bg-red-50 text-sm text-red-700 shrink-0">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>{erro}</span>
                        </div>
                    )}

                    <SheetPanel>
                        {formulario}

                        {sistemas.length === 0 ? (
                            <div className="text-center py-12 px-6">
                                <Layers className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                                <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum sistema predial</h3>
                                <p className="text-sm text-gray-500 mb-4 max-w-sm mx-auto">
                                    Cadastre os {SISTEMAS_PADRAO.length} sistemas do rol da NBR 14037 de uma vez — elevadores,
                                    bombas, SPDA, incêndio… — e ajuste depois. São eles que fazem "Criar plano"
                                    sugerir os itens padrão.
                                </p>
                                <button
                                    type="button"
                                    onClick={cadastrarPadrao}
                                    disabled={salvando}
                                    className="inline-flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                                >
                                    <Plus className="w-[15px] h-[15px]" />
                                    {salvando ? 'Cadastrando...' : `Cadastrar os ${SISTEMAS_PADRAO.length} sistemas padrão`}
                                </button>
                            </div>
                        ) : nadaNaBusca ? (
                            <div className="px-4 py-6 text-sm text-gray-500 text-center">
                                Nenhum sistema com "{busca.trim()}". Use <span className="font-medium text-gray-700">Novo</span> para cadastrar.
                            </div>
                        ) : (
                            <div className="py-1">
                                {!busca.trim() && (
                                    <button
                                        type="button"
                                        onClick={() => escolher('')}
                                        className={`w-full px-4 py-2 text-left text-sm font-normal text-gray-500 transition-colors hover:bg-gray-50 ${value === '' ? 'bg-gray-100' : ''}`}
                                    >
                                        Sem sistema definido
                                    </button>
                                )}
                                {ativosFiltrados.map(linha)}
                                {inativosFiltrados.length > 0 && (
                                    <>
                                        <div className="px-4 pt-4 pb-1 text-xs font-semibold text-slate-500">
                                            Desativados ({inativosFiltrados.length})
                                        </div>
                                        {inativosFiltrados.map(linha)}
                                    </>
                                )}
                                {!busca.trim() && padraoFaltando > 0 && (
                                    <div className="px-4 pt-4 pb-3">
                                        <button
                                            type="button"
                                            onClick={cadastrarPadrao}
                                            disabled={salvando}
                                            className="text-blue-600 hover:text-blue-800 text-sm font-medium disabled:opacity-50"
                                        >
                                            {salvando
                                                ? 'Cadastrando...'
                                                : `Incluir ${padraoFaltando === 1 ? 'o sistema padrão que falta' : `os ${padraoFaltando} sistemas padrão que faltam`}`}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </SheetPanel>
                </Sheet>,
                document.body,
            )}
        </>
    );
};

export default BuildingSystemSelect;
