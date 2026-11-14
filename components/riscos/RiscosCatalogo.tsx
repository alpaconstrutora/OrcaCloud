import React from 'react';
import { BookOpen, ExternalLink, Flame, Library, Plus } from 'lucide-react';
import type { RiskCatalogItem, RiskCategoryRow, RiskDimensao, RiskFase, RiskTipologia } from '../../types/risk';
import { RISK_DIMENSOES, RISK_FASES, RISK_ROTULO, RISK_TIPOLOGIAS } from '../../types/risk';
import { riskService } from '../../services/riskService';
import { errorMessage } from '../../hooks/useOrgContext';
import { useToast } from '../../hooks/useToast';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { useStore } from '../../store/useStore';
import { usePersistedState } from '../ui/TableUtils';
import { FilterPopover } from '../ui/FilterPopover';
import StandardTable, { type StandardTableColumn } from '../ui/StandardTable';
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetPanel, SheetTitle } from '../ui/sheet';
import { SecaoTitulo } from '../ui/SecaoTitulo';
import { AREA, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CAMPO, COM_ERRO, ErroDoCampo, ROTULO, linhasParaLista } from './riscosUi';

/**
 * Aba Catálogo (F1.5): os 312 riscos do sistema + os riscos próprios da
 * organização. Filtros por categoria, fase, tipologia e gatilho crítico; selo
 * "Rascunho em revisão técnica" enquanto a revisão (F0.5) não volta.
 * Clicar abre a leitura completa num Sheet; "Usar em um risco" FECHA esse Sheet e
 * abre a ficha nova pré-preenchida (sem drawer aninhado — UI_PATTERNS §4.4).
 */
const COLUNAS: StandardTableColumn[] = [
    { key: 'codigo', label: 'Código', sortable: true, width: 100 },
    { key: 'evento', label: 'Evento', sortable: true, width: 380 },
    { key: 'categoria', label: 'Categoria', sortable: true, width: 220 },
    { key: 'fases', label: 'Fases', sortable: true, width: 220 },
    { key: 'tipologias', label: 'Tipologias', sortable: true, width: 200 },
    { key: 'dimensoes', label: 'Dimensões', sortable: true, width: 200 },
    { key: 'gatilho', label: 'Gatilho crítico', sortable: true, width: 130 },
    { key: 'revisao', label: 'Revisão técnica', sortable: true, width: 210 },
    { key: 'origem', label: 'Origem', sortable: true, width: 110 },
];

const COR_REVISAO: Record<RiskCatalogItem['revisao_tecnica'], string> = {
    rascunho: 'text-amber-700', revisado: 'text-blue-700', aprovado: 'text-emerald-700',
};

const lista = <T extends string>(itens: T[], rotulo: Record<T, string>) => itens.map(i => rotulo[i] ?? i).join(', ');

interface Props {
    itens: RiskCatalogItem[];
    categorias: RiskCategoryRow[];
    carregando: boolean;
    erro: string | null;
    onTentarDeNovo: () => void;
    onAbrir: (item: RiskCatalogItem) => void;
    onUsar: (item: RiskCatalogItem) => void;
    podeEditar: boolean;
    motivoSemEdicao: string;
}

export const RiscosCatalogo: React.FC<Props> = ({ itens, categorias, carregando, erro, onTentarDeNovo, onAbrir, onUsar, podeEditar, motivoSemEdicao }) => {
    const organizations = useStore(s => s.organizations);
    const [fCategoria, setFCategoria] = usePersistedState<string>('riscos:catalogo:categoria', '');
    const [fFase, setFFase] = usePersistedState<RiskFase | ''>('riscos:catalogo:fase', '');
    const [fTipologia, setFTipologia] = usePersistedState<RiskTipologia | ''>('riscos:catalogo:tipologia', '');
    const [fGatilho, setFGatilho] = usePersistedState<'' | 'sim' | 'nao'>('riscos:catalogo:gatilho', '');

    const catPorId = React.useMemo(() => new Map(categorias.map(c => [c.id, c])), [categorias]);
    const nomeCategoria = (id: string) => { const c = catPorId.get(id); return c ? `${c.codigo} · ${c.nome}` : '—'; };
    const orgNome = (id: string | null) => (id ? organizations.find(o => o.id === id)?.name ?? 'Própria' : 'Sistema');

    // `rows` estável (useMemo): a paginação do StandardTable zera pela identidade do array (§6.7).
    const linhas = React.useMemo(() => itens.filter(i =>
        (!fCategoria || i.category_id === fCategoria) &&
        (!fFase || i.fases.includes(fFase)) &&
        (!fTipologia || i.tipologias.includes(fTipologia)) &&
        (!fGatilho || (fGatilho === 'sim') === i.gatilho_critico),
    ), [itens, fCategoria, fFase, fTipologia, fGatilho]);

    const opcoesCategoria = React.useMemo(() => [{ value: '', label: 'Todas' }, ...categorias.map(c => ({ value: c.id, label: `${c.codigo} · ${c.nome}` }))], [categorias]);

    return (
        <div className="space-y-3">
            {erro && (
                <div className="flex flex-wrap items-center justify-between gap-3 bg-red-50 border border-red-100 rounded-[10px] px-4 py-3 text-sm text-red-700">
                    <span>Não foi possível carregar o catálogo: {erro}</span>
                    <button type="button" onClick={onTentarDeNovo} className="font-medium text-red-700 underline">Tentar de novo</button>
                </div>
            )}
            <StandardTable<RiskCatalogItem>
                storageKey="riscos:catalogo:tabela"
                columns={COLUNAS}
                rows={linhas}
                rowKey={i => i.id}
                loading={carregando}
                pagination={{ defaultPageSize: 100 }}
                searchText={i => `${i.codigo} ${i.evento} ${nomeCategoria(i.category_id)} ${i.causas.join(' ')} ${i.consequencias.join(' ')}`}
                searchPlaceholder="Buscar por código, evento, causa ou consequência..."
                filters={<>
                    <FilterPopover<string> label="Categoria" value={fCategoria} onChange={setFCategoria} options={opcoesCategoria} />
                    <FilterPopover<RiskFase | ''> label="Fase" value={fFase} onChange={setFFase}
                        options={[{ value: '', label: 'Todas' }, ...RISK_FASES.map(f => ({ value: f, label: RISK_ROTULO.fase[f] }))]} />
                    <FilterPopover<RiskTipologia | ''> label="Tipologia" value={fTipologia} onChange={setFTipologia}
                        options={[{ value: '', label: 'Todas' }, ...RISK_TIPOLOGIAS.map(t => ({ value: t, label: RISK_ROTULO.tipologia[t] }))]} />
                    <FilterPopover<'' | 'sim' | 'nao'> label="Gatilho crítico" value={fGatilho} onChange={setFGatilho}
                        options={[{ value: '', label: 'Todos' }, { value: 'sim', label: 'Com gatilho' }, { value: 'nao', label: 'Sem gatilho' }]} />
                </>}
                sortValue={(k, i) => {
                    switch (k) {
                        case 'categoria': return nomeCategoria(i.category_id);
                        case 'fases': return lista(i.fases, RISK_ROTULO.fase);
                        case 'tipologias': return lista(i.tipologias, RISK_ROTULO.tipologia);
                        case 'dimensoes': return lista(i.dimensoes, RISK_ROTULO.dimensao);
                        case 'gatilho': return i.gatilho_critico ? 1 : 0;
                        case 'revisao': return RISK_ROTULO.revisao[i.revisao_tecnica];
                        case 'origem': return orgNome(i.organization_id);
                        default: return (i as unknown as Record<string, string>)[k];
                    }
                }}
                onRowClick={onAbrir}
                rowLabel={i => `${i.codigo}: ${i.evento}. Ver o item do catálogo`}
                renderCell={(k, i) => {
                    switch (k) {
                        case 'codigo': return <span className="text-sm font-normal text-gray-600">{i.codigo}</span>;
                        case 'evento': return <span className="block truncate text-sm font-normal text-gray-700" title={i.evento}>{i.evento}</span>;
                        case 'categoria': { const t = nomeCategoria(i.category_id); return <span className="block truncate text-sm font-normal text-gray-700" title={t}>{t}</span>; }
                        case 'fases': { const t = lista(i.fases, RISK_ROTULO.fase) || '—'; return <span className="block truncate text-sm font-normal text-gray-600" title={t}>{t}</span>; }
                        case 'tipologias': { const t = lista(i.tipologias, RISK_ROTULO.tipologia) || 'Todas'; return <span className="block truncate text-sm font-normal text-gray-600" title={t}>{t}</span>; }
                        case 'dimensoes': { const t = lista(i.dimensoes, RISK_ROTULO.dimensao) || '—'; return <span className="block truncate text-sm font-normal text-gray-600" title={t}>{t}</span>; }
                        case 'gatilho': return i.gatilho_critico
                            ? <span className="inline-flex items-center gap-1 text-sm font-normal text-red-700" title={i.gatilho_motivo ?? undefined}><Flame className="w-3.5 h-3.5" aria-hidden="true" /> Sim</span>
                            : <span className="text-sm font-normal text-gray-600">Não</span>;
                        case 'revisao': return <span className={`text-sm font-normal ${COR_REVISAO[i.revisao_tecnica]}`}>{RISK_ROTULO.revisao[i.revisao_tecnica]}</span>;
                        case 'origem': return <span className="block truncate text-sm font-normal text-gray-600" title={orgNome(i.organization_id)}>{i.organization_id ? 'Próprio' : 'Sistema'}</span>;
                        default: return null;
                    }
                }}
                actions={{
                    width: 110,
                    // Clicar na linha abre a leitura (ação dominante, §9.1); aqui fica a OUTRA ação.
                    render: i => (
                        <div className="flex items-center justify-end" onClick={e => e.stopPropagation()}>
                            <span className="inline-flex" title={podeEditar ? `Criar um risco a partir de ${i.codigo}` : motivoSemEdicao}>
                                <button type="button" onClick={() => onUsar(i)} disabled={!podeEditar}
                                    className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-[6px] transition-all disabled:text-gray-400 disabled:hover:bg-transparent disabled:cursor-not-allowed">
                                    Usar
                                </button>
                            </span>
                        </div>
                    ),
                }}
                empty={{ icon: <Library className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: itens.length ? 'Nenhum item com estes filtros' : 'Catálogo vazio', subtitle: itens.length ? 'Tente tirar um filtro ou mudar a busca.' : 'O catálogo do sistema ainda não foi carregado no banco.' }}
            />
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Leitura de um item do catálogo
// ─────────────────────────────────────────────────────────────────────────────
const Lista: React.FC<{ titulo: string; itens: string[] }> = ({ titulo, itens }) => (
    <div className="space-y-1.5">
        <p className={ROTULO}>{titulo}</p>
        {itens.length ? (
            <ul className="list-disc pl-5 space-y-1 text-sm text-gray-800">{itens.map((t, n) => <li key={n}>{t}</li>)}</ul>
        ) : <p className="text-sm text-gray-500">—</p>}
    </div>
);

export const CatalogoItemSheet: React.FC<{
    item: RiskCatalogItem | null;
    categorias: RiskCategoryRow[];
    podeEditar: boolean;
    motivoSemEdicao: string;
    onClose: () => void;
    onUsar: (item: RiskCatalogItem) => void;
}> = ({ item, categorias, podeEditar, motivoSemEdicao, onClose, onUsar }) => {
    if (!item) return null;
    const cat = categorias.find(c => c.id === item.category_id);
    return (
        <Sheet open onClose={onClose} size="xl">
            <SheetHeader onClose={onClose}>
                <SheetTitle>{item.codigo} · {item.evento}</SheetTitle>
                <SheetDescription>
                    {cat ? `${cat.codigo} · ${cat.nome}` : 'Sem categoria'} · versão {item.versao} ·{' '}
                    <span className={COR_REVISAO[item.revisao_tecnica]}>{RISK_ROTULO.revisao[item.revisao_tecnica]}</span>
                </SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-5 space-y-5">
                {item.revisao_tecnica === 'rascunho' && (
                    <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-[10px] px-4 py-3">
                        Rascunho em revisão técnica: causas, consequências e controles foram redigidos para o engenheiro e o técnico de segurança revisarem. Confira antes de usar como verdade.
                    </p>
                )}
                {item.gatilho_critico && (
                    <p className="flex items-start gap-2 text-sm text-red-800 bg-red-50 border border-red-100 rounded-[10px] px-4 py-3">
                        <Flame className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                        <span>Gatilho crítico{item.gatilho_motivo ? `: ${item.gatilho_motivo}` : ''}. O risco criado a partir deste item é tratado como crítico qualquer que seja a pontuação.</span>
                    </p>
                )}
                <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-8">
                    <div className="space-y-4">
                        <SecaoTitulo icon={BookOpen} titulo="Evento, causas e consequências" />
                        <Lista titulo="Causas" itens={item.causas} />
                        <Lista titulo="Consequências" itens={item.consequencias} />
                        <Lista titulo="Sinais de alerta" itens={item.sinais_alerta} />
                    </div>
                    <div className="space-y-4">
                        <SecaoTitulo icon={BookOpen} titulo="Controles" />
                        <Lista titulo="Preventivos" itens={item.controles_preventivos} />
                        <Lista titulo="De resposta" itens={item.controles_resposta} />
                    </div>
                    <div className="space-y-4">
                        <SecaoTitulo icon={BookOpen} titulo="Onde se aplica" />
                        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                            <div className="space-y-1.5"><p className={ROTULO}>Dimensões</p><p className="text-sm text-gray-800">{lista(item.dimensoes, RISK_ROTULO.dimensao) || '—'}</p></div>
                            <div className="space-y-1.5"><p className={ROTULO}>Fases</p><p className="text-sm text-gray-800">{lista(item.fases, RISK_ROTULO.fase) || '—'}</p></div>
                            <div className="space-y-1.5"><p className={ROTULO}>Tipologias</p><p className="text-sm text-gray-800">{lista(item.tipologias, RISK_ROTULO.tipologia) || 'Todas'}</p></div>
                            <div className="space-y-1.5"><p className={ROTULO}>Origem</p><p className="text-sm text-gray-800">{item.organization_id ? 'Risco próprio da organização' : 'Catálogo do sistema'}</p></div>
                        </div>
                        <Lista titulo="Referências" itens={item.referencias} />
                        {item.condicoes_sugestao.length > 0 && <Lista titulo="Quando sugerir" itens={item.condicoes_sugestao} />}
                    </div>
                </div>
            </SheetPanel>
            <SheetFooter>
                {!podeEditar && <p className="text-xs text-gray-600 mr-auto">{motivoSemEdicao}</p>}
                <button type="button" onClick={onClose} className={BOTAO_SECUNDARIO}>Fechar</button>
                <span className="inline-flex" title={podeEditar ? undefined : motivoSemEdicao}>
                    <button type="button" onClick={() => onUsar(item)} disabled={!podeEditar} className={BOTAO_PRIMARIO}>
                        <ExternalLink className="w-[15px] h-[15px]" /> Usar em um risco
                    </button>
                </span>
            </SheetFooter>
        </Sheet>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Novo risco próprio da organização
// ─────────────────────────────────────────────────────────────────────────────
interface FormProprio {
    category_id: string;
    evento: string;
    causas: string;
    consequencias: string;
    controles_preventivos: string;
    controles_resposta: string;
    dimensoes: RiskDimensao[];
    fases: RiskFase[];
    gatilho_critico: boolean;
    gatilho_motivo: string;
}
const PROPRIO_VAZIO: FormProprio = {
    category_id: '', evento: '', causas: '', consequencias: '', controles_preventivos: '', controles_resposta: '',
    dimensoes: [], fases: [], gatilho_critico: false, gatilho_motivo: '',
};

export const RiscoProprioSheet: React.FC<{
    orgId: string | null;
    categorias: RiskCategoryRow[];
    onClose: () => void;
    onCriado: (item: RiskCatalogItem) => void;
}> = ({ orgId, categorias, onClose, onCriado }) => {
    const { showToast } = useToast();
    const { dirty, markDirty, markSaved, confirmDiscard } = useUnsavedChanges();
    const organizations = useStore(s => s.organizations);
    const [form, setForm] = React.useState<FormProprio>(PROPRIO_VAZIO);
    const [erros, setErros] = React.useState<Record<string, string>>({});
    const [salvando, setSalvando] = React.useState(false);
    if (!orgId) return null;

    const set = <K extends keyof FormProprio>(k: K, v: FormProprio[K]) => { setForm(p => ({ ...p, [k]: v })); markDirty(); };
    const alternar = <T extends string>(k: 'dimensoes' | 'fases', v: T, ligado: boolean) =>
        set(k, (ligado ? [...(form[k] as T[]), v] : (form[k] as T[]).filter(x => x !== v)) as never);
    const handleBack = async () => { if (await confirmDiscard()) onClose(); };

    const salvar = async () => {
        const e: Record<string, string> = {};
        if (!form.category_id) e.categoria = 'Escolha a categoria.';
        if (!form.evento.trim()) e.evento = 'Descreva o evento de risco.';
        if (form.gatilho_critico && !form.gatilho_motivo.trim()) e.gatilho = 'Diga por que este risco tem gatilho crítico.';
        setErros(e);
        const primeiro = ['categoria', 'evento', 'gatilho'].find(k => e[k]);
        if (primeiro) { document.getElementById(`rp-${primeiro}`)?.focus(); return; }
        setSalvando(true);
        try {
            const criado = await riskService.criarRiscoProprio(orgId, {
                category_id: form.category_id,
                evento: form.evento.trim(),
                causas: linhasParaLista(form.causas),
                consequencias: linhasParaLista(form.consequencias),
                controles_preventivos: linhasParaLista(form.controles_preventivos),
                controles_resposta: linhasParaLista(form.controles_resposta),
                dimensoes: form.dimensoes,
                fases: form.fases,
                gatilho_critico: form.gatilho_critico,
                gatilho_motivo: form.gatilho_critico ? form.gatilho_motivo.trim() : null,
            });
            markSaved();
            onCriado(criado);
            showToast(`Risco próprio ${criado.codigo} cadastrado no catálogo.`);
            onClose();   // §25: criar fecha.
        } catch (err) {
            showToast(errorMessage(err, 'Não foi possível cadastrar o risco próprio.'), 'error');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open onClose={onClose} size="xl" dirty={dirty}>
            <SheetHeader onClose={handleBack}>
                <SheetTitle>Novo risco próprio</SheetTitle>
                <SheetDescription>Entra no catálogo de {organizations.find(o => o.id === orgId)?.name ?? 'sua organização'} com código próprio (P001, P002…).</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-5 space-y-5">
                <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-8">
                    <div className="space-y-4">
                        <SecaoTitulo icon={BookOpen} titulo="Evento" />
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="rp-categoria">Categoria</label>
                            <select id="rp-categoria" className={`${CAMPO} ${erros.categoria ? COM_ERRO : ''}`} value={form.category_id} aria-invalid={!!erros.categoria}
                                onChange={e => set('category_id', e.target.value)}>
                                <option value="">Escolha…</option>
                                {categorias.map(c => <option key={c.id} value={c.id}>{c.codigo} · {c.nome}</option>)}
                            </select>
                            <ErroDoCampo id="rp-categoria-erro" erro={erros.categoria} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="rp-evento">Evento</label>
                            <textarea id="rp-evento" className={`${AREA} ${erros.evento ? COM_ERRO : ''}`} value={form.evento} aria-invalid={!!erros.evento}
                                onChange={e => set('evento', e.target.value)} placeholder="O que pode acontecer." />
                            <ErroDoCampo id="rp-evento-erro" erro={erros.evento} />
                        </div>
                        {([['causas', 'Causas'], ['consequencias', 'Consequências']] as const).map(([k, rotulo]) => (
                            <div key={k} className="space-y-1.5">
                                <label className={ROTULO} htmlFor={`rp-${k}`}>{rotulo}</label>
                                <textarea id={`rp-${k}`} className={AREA} value={form[k]} onChange={e => set(k, e.target.value)} placeholder="Uma por linha." />
                            </div>
                        ))}
                    </div>
                    <div className="space-y-4">
                        <SecaoTitulo icon={BookOpen} titulo="Controles" />
                        {([['controles_preventivos', 'Preventivos'], ['controles_resposta', 'De resposta']] as const).map(([k, rotulo]) => (
                            <div key={k} className="space-y-1.5">
                                <label className={ROTULO} htmlFor={`rp-${k}`}>{rotulo}</label>
                                <textarea id={`rp-${k}`} className={AREA} value={form[k]} onChange={e => set(k, e.target.value)} placeholder="Um por linha." />
                            </div>
                        ))}
                    </div>
                    <div className="space-y-4">
                        <SecaoTitulo icon={BookOpen} titulo="Onde se aplica" />
                        <div className="space-y-1.5">
                            <span className={ROTULO}>Dimensões</span>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
                                {RISK_DIMENSOES.map(d => (
                                    <label key={d} className="inline-flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                                        <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-blue-600" checked={form.dimensoes.includes(d)}
                                            onChange={e => alternar('dimensoes', d, e.target.checked)} />
                                        {RISK_ROTULO.dimensao[d]}
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <span className={ROTULO}>Fases</span>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                                {RISK_FASES.map(f => (
                                    <label key={f} className="inline-flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                                        <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-blue-600" checked={form.fases.includes(f)}
                                            onChange={e => alternar('fases', f, e.target.checked)} />
                                        {RISK_ROTULO.fase[f]}
                                    </label>
                                ))}
                            </div>
                        </div>
                        <label className="inline-flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                            <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-red-600" checked={form.gatilho_critico}
                                onChange={e => set('gatilho_critico', e.target.checked)} />
                            Gatilho crítico — tratar como crítico qualquer que seja a pontuação
                        </label>
                        {form.gatilho_critico && (
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="rp-gatilho">Motivo do gatilho</label>
                                <input id="rp-gatilho" type="text" className={`${CAMPO} ${erros.gatilho ? COM_ERRO : ''}`} value={form.gatilho_motivo} aria-invalid={!!erros.gatilho}
                                    onChange={e => set('gatilho_motivo', e.target.value)} placeholder="Ex.: risco à vida, obrigação legal" />
                                <ErroDoCampo id="rp-gatilho-erro" erro={erros.gatilho} />
                            </div>
                        )}
                    </div>
                </div>
            </SheetPanel>
            <SheetFooter>
                <button type="button" onClick={() => void handleBack()} className={BOTAO_SECUNDARIO}>Cancelar</button>
                <button type="button" onClick={() => void salvar()} disabled={salvando} className={BOTAO_PRIMARIO}>
                    <Plus className="w-[15px] h-[15px]" /> {salvando ? 'Cadastrando…' : 'Cadastrar risco próprio'}
                </button>
            </SheetFooter>
        </Sheet>
    );
};

export default RiscosCatalogo;
