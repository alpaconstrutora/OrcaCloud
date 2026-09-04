// components/condominio/ComunicacaoTab.tsx
// Avisos do condomínio — o mural que o Portal do Condômino exibe.
// Plano: docs/planos/2026-08-13-opura-condominios-avaliacao.md (F3)
//
// ⚠️ DOCUMENTOS SAÍRAM DAQUI em 04/09/2026 → aba própria, `DocumentosTab.tsx`
// (plano 2026-09-04). Eram dois ciclos diferentes numa tela só: aviso é efêmero
// (publica, pessoas leem, vence) e documento é permanente — e a convenção do
// condomínio, o papel mais importante do prédio, ficava escondida numa sub-aba
// dentro de uma aba, sem nem aceitar upload. Não recriar a sub-aba aqui: o
// mesmo controle em dois caminhos foi o que Ocupações já teve de desfazer.
import React from 'react';
import { Megaphone, Search, RefreshCw, Plus, Eye, AlertCircle } from 'lucide-react';
import { usePersistedState } from '../ui/TableUtils';
import { KpiCard } from '../ui/KpiCard';
// Quantas pessoas o aviso alcança de fato. Sem isto, publicar é ato às cegas:
// a tela dizia "aparece no portal de todos os condôminos com link ativo" — e
// em 01/09 havia ZERO links de condômino ativos, ou seja, dizia "ninguém".
import { empreendimentoService } from '../../services/empreendimentoService';
import { unitOccupancyService } from '../../services/unitOccupancyService';
import { condominoAccessService } from '../../services/condominoPortalService';
import { condominioAcessoService } from '../../services/condominioAcessoService';
import { estadoDeAcesso, resumirAcessos, type ResumoDeAcesso } from '../../utils/acessoAoCondominio';
import { InlineDisclosureMenu } from '../ui/inline-disclosure-menu';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useConfirm } from '../ui/confirm';
import {
    condominioComunicacaoService,
    type AvisoRow, type AvisoCategoria,
} from '../../services/condominioComunicacaoService';
import type { Empreendimento } from '../../types/empreendimento';

const CATEGORIA_AVISO: Record<AvisoCategoria, { rotulo: string; cor: string }> = {
    AVISO: { rotulo: 'Aviso', cor: 'text-gray-600' },
    URGENTE: { rotulo: 'Urgente', cor: 'text-red-600' },
    MANUTENCAO: { rotulo: 'Manutenção', cor: 'text-amber-600' },
    ASSEMBLEIA: { rotulo: 'Assembleia', cor: 'text-indigo-600' },
    OBRA: { rotulo: 'Obra', cor: 'text-blue-600' },
};

function formatarData(iso?: string | null): string {
    if (!iso) return '—';
    const [a, m, d] = iso.slice(0, 10).split('-');
    return d && m && a ? `${d}/${m}/${a}` : '—';
}

interface Props { empreendimento: Empreendimento }

const ComunicacaoTab: React.FC<Props> = ({ empreendimento }) => {
    const confirm = useConfirm();
    const orgId = empreendimento.organization_id;

    const [searchTerm, setSearchTerm] = usePersistedState<string>('condominio:comunicacao:search', '');

    const [avisos, setAvisos] = React.useState<AvisoRow[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [erro, setErro] = React.useState<string | null>(null);
    const [salvando, setSalvando] = React.useState(false);
    const [sheetAviso, setSheetAviso] = React.useState(false);
    const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const [formAviso, setFormAviso] = React.useState<{
        titulo: string; corpo: string; categoria: AvisoCategoria; valido_ate: string;
    }>({ titulo: '', corpo: '', categoria: 'AVISO', valido_ate: '' });

    const carregar = React.useCallback(async () => {
        setLoading(true);
        setErro(null);
        try {
            setAvisos(await condominioComunicacaoService.listAvisos(empreendimento.id));
        } catch (e: any) {
            setErro(e?.message || 'Erro ao carregar os avisos.');
        } finally {
            setLoading(false);
        }
    }, [empreendimento.id]);

    React.useEffect(() => { carregar(); }, [carregar]);

    /** Alcance real: quantas ocupações vigentes conseguem VER o que se publica.
     *  `null` enquanto carrega — nunca 0, que seria uma afirmação falsa. */
    const [alcance, setAlcance] = React.useState<ResumoDeAcesso | null>(null);

    React.useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                const units = await empreendimentoService.listAllUnitsForEmpreendimento(empreendimento.id);
                const labels = Object.fromEntries(units.map(u => [u.id, {
                    unitName: u.name, towerName: u._tower_name, fracao: u.fracao_ideal_decimal ?? null,
                }]));
                const ocup = await unitOccupancyService.listByEmpreendimento(
                    units.map(u => u.id), labels, { incluirEncerradas: false });
                const [acessos, porCliente] = await Promise.all([
                    condominoAccessService.listByUnits(units.map(u => u.id)),
                    condominioAcessoService.mapearPorCliente(ocup.map(o => o.client_id)),
                ]);
                const porOcupacao = new Map(acessos.map(a => [a.occupancy_id, a]));
                if (!vivo) return;
                setAlcance(resumirAcessos(ocup.map(o =>
                    estadoDeAcesso(porCliente.get(o.client_id), porOcupacao.get(o.id)))));
            } catch {
                // Falhar aqui não pode impedir de publicar: a tela some com o
                // número em vez de mostrar um número inventado.
                if (vivo) setAlcance(null);
            }
        })();
        return () => { vivo = false; };
    }, [empreendimento.id]);

    const hoje = new Date().toISOString().slice(0, 10);
    const kpis = React.useMemo(() => ({
        vigentes: avisos.filter(a => !a.valido_ate || a.valido_ate >= hoje).length,
        leituras: avisos.reduce((s, a) => s + a._leituras, 0),
    }), [avisos, hoje]);

    const avisosFiltrados = React.useMemo(() => {
        const t = searchTerm.trim().toLowerCase();
        if (!t) return avisos;
        return avisos.filter(a => a.titulo.toLowerCase().includes(t) || a.corpo.toLowerCase().includes(t));
    }, [avisos, searchTerm]);

    const publicarAviso = async () => {
        if (!formAviso.titulo.trim() || !formAviso.corpo.trim()) {
            notify('Preencha o título e o texto do aviso.', 'error');
            return;
        }
        setSalvando(true);
        try {
            const criado = await condominioComunicacaoService.createAviso({
                empreendimento_id: empreendimento.id,
                organization_id: orgId,
                titulo: formAviso.titulo.trim(),
                corpo: formAviso.corpo.trim(),
                categoria: formAviso.categoria,
                valido_ate: formAviso.valido_ate || null,
            });
            // §22 — atualiza o array local, sem recarregar a aba.
            setAvisos(prev => [{ ...criado, _leituras: 0 }, ...prev]);
            setSheetAviso(false);
            setFormAviso({ titulo: '', corpo: '', categoria: 'AVISO', valido_ate: '' });
            notify(alcance ? `Aviso publicado. Alcança ${alcance.ve} de ${alcance.total} ocupações vigentes.` : 'Aviso publicado.');
        } catch (e: any) {
            notify(e?.message || 'Erro ao publicar.', 'error');
        } finally { setSalvando(false); }
    };

    const excluirAviso = async (a: AvisoRow) => {
        const ok = await confirm({
            title: 'Excluir o aviso?',
            message: a._leituras > 0
                ? `"${a.titulo}" já foi lido por ${a._leituras} condômino(s). Excluir apaga o aviso e o registro de quem leu.`
                : `"${a.titulo}" será apagado. Esta ação não pode ser desfeita.`,
            variant: 'danger', confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await condominioComunicacaoService.removeAviso(a.id);
            setAvisos(prev => prev.filter(x => x.id !== a.id));
            notify('Aviso excluído.');
        } catch (e: any) { notify(e?.message || 'Erro ao excluir.', 'error'); }
    };

    return (
        <div className="space-y-6">
            {erro && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-[10px] px-4 py-3 text-sm">{erro}</div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-3">
                <KpiCard label="AVISOS VIGENTES" value={kpis.vigentes} icon={<Megaphone className="w-5 h-5" />} color="blue" />
                <KpiCard
                    label="CONFIRMAÇÕES DE LEITURA" value={kpis.leituras}
                    sub={kpis.leituras === 0 && kpis.vigentes > 0 ? 'Ninguém abriu ainda' : undefined}
                    icon={<Eye className="w-5 h-5" />}
                    color={kpis.leituras > 0 ? 'emerald' : 'gray'}
                />
                {/* Quem RECEBE. Publicar sem esse número é falar para uma sala
                    que pode estar vazia — e estava: 0 links de condômino
                    ativos em 01/09. */}
                <KpiCard
                    label="ALCANÇA HOJE"
                    value={alcance ? `${alcance.ve} de ${alcance.total}` : '—'}
                    sub={!alcance ? undefined
                        : alcance.aguardaAba > 0
                            ? `${alcance.aguardaAba} só precisam da aba ligada`
                            : alcance.sem > 0 ? `${alcance.sem} sem acesso — conceda em Ocupações` : undefined}
                    icon={<Eye className="w-5 h-5" />}
                    color={!alcance ? 'gray' : alcance.ve === 0 ? 'amber' : 'emerald'}
                />
            </div>

            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-2 border-b border-gray-100 bg-white">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar por título ou texto do aviso..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>
                        <button
                            onClick={carregar}
                            className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95"
                            title="Recarregar"
                        >
                            <RefreshCw className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setSheetAviso(true)}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0 whitespace-nowrap"
                        >
                            <Plus className="w-[15px] h-[15px]" />
                            Publicar aviso
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : avisosFiltrados.length === 0 ? (
                    <div className="text-center py-12">
                        <Megaphone className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum aviso</h3>
                        <p className="text-sm text-gray-500 max-w-md mx-auto">
                            O que for publicado aqui aparece no portal dos condôminos com acesso, com confirmação de leitura.
                        </p>
                    </div>
                ) : (
                    <div className="p-4 space-y-3">
                        {avisosFiltrados.map(a => {
                            const cat = CATEGORIA_AVISO[a.categoria];
                            const vencido = !!a.valido_ate && a.valido_ate < hoje;
                            return (
                                <div key={a.id} className={`p-4 rounded-[10px] border ${vencido ? 'border-gray-100 opacity-60' : 'border-gray-200'}`}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <h3 className="text-sm font-medium text-gray-800">{a.titulo}</h3>
                                            <p className="text-xs text-gray-500 mt-0.5">
                                                <span className={cat.cor}>{cat.rotulo}</span>
                                                {' · '}{new Date(a.publicado_em).toLocaleDateString('pt-BR')}
                                                {a.valido_ate ? ` · até ${formatarData(a.valido_ate)}` : ''}
                                                {vencido ? ' · vencido' : ''}
                                                {' · '}
                                                <span className={a._leituras > 0 ? 'text-emerald-600' : 'text-gray-400'}>
                                                    {a._leituras} leitura{a._leituras === 1 ? '' : 's'}
                                                </span>
                                            </p>
                                        </div>
                                        <div className="shrink-0">
                                            <InlineDisclosureMenu showDelete onDelete={() => excluirAviso(a)} />
                                        </div>
                                    </div>
                                    <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{a.corpo}</p>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Publicar aviso */}
            <Sheet open={sheetAviso} onClose={() => setSheetAviso(false)} size="lg">
                <SheetHeader onClose={() => setSheetAviso(false)}>
                    <SheetTitle>Publicar aviso</SheetTitle>
                    <SheetDescription>{empreendimento.name}</SheetDescription>
                </SheetHeader>
                <SheetPanel>
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Título</label>
                            <input
                                type="text" value={formAviso.titulo}
                                onChange={e => setFormAviso(f => ({ ...f, titulo: e.target.value }))}
                                placeholder="Ex: Manutenção do elevador na quinta-feira"
                                className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Categoria</label>
                                <select
                                    value={formAviso.categoria}
                                    onChange={e => setFormAviso(f => ({ ...f, categoria: e.target.value as AvisoCategoria }))}
                                    className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                >
                                    {(Object.keys(CATEGORIA_AVISO) as AvisoCategoria[]).map(c => (
                                        <option key={c} value={c}>{CATEGORIA_AVISO[c].rotulo}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Válido até</label>
                                <input
                                    type="date" value={formAviso.valido_ate}
                                    onChange={e => setFormAviso(f => ({ ...f, valido_ate: e.target.value }))}
                                    className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                />
                                <p className="text-xs text-gray-400 mt-1">Em branco = sem prazo.</p>
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Texto</label>
                            <textarea
                                rows={6} value={formAviso.corpo}
                                onChange={e => setFormAviso(f => ({ ...f, corpo: e.target.value }))}
                                className="mt-1 w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            />
                        </div>
                        <p className="text-xs text-gray-400">
                            {alcance
                                ? `O aviso aparece imediatamente para ${alcance.ve} de ${alcance.total} ocupações vigentes${alcance.aguardaAba > 0 ? ` — outras ${alcance.aguardaAba} só precisam da aba Condomínio ligada` : ''}. O sistema registra quem confirmou a leitura.`
                                : 'O aviso aparece imediatamente no portal de quem tem acesso, e o sistema registra quem confirmou a leitura.'}
                        </p>
                    </div>
                </SheetPanel>
                <SheetFooter>
                    <button onClick={() => setSheetAviso(false)} className="h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all">Cancelar</button>
                    <button onClick={publicarAviso} disabled={salvando} className="h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50">
                        {salvando ? 'Publicando...' : 'Publicar aviso'}
                    </button>
                </SheetFooter>
            </Sheet>

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

export default ComunicacaoTab;
