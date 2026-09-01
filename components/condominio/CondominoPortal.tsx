// components/condominio/CondominoPortal.tsx
// Portal do Condômino — acesso público por link, F3.
// Plano: docs/planos/2026-08-13-opura-condominios-avaliacao.md
//
// CASCA PRÓPRIA, fora do <Layout>: o guard de token roda antes dele, então o
// gutter do §20.2 não é herdado — esta tela repete `p-4 md:p-6` à mão. Foi
// justamente por não repetir que três portais deste app acabaram com padding
// diferente entre si (§20.2.1).
//
// SEM DADO FINANCEIRO, de propósito. Link público é compartilhável e não tem
// senha; boleto e inadimplência por unidade só depois da autenticação real.
import React from 'react';
import {
    Building2, Home, Megaphone, FileText, Wrench, Plus, AlertCircle, Check, Eye,
} from 'lucide-react';
import {
    condominoPortalService,
    type PortalCondominoData, type PortalAviso,
} from '../../services/condominoPortalService';

type Aba = 'unidade' | 'avisos' | 'documentos' | 'chamados';

const CATEGORIA_AVISO: Record<string, { rotulo: string; cor: string }> = {
    AVISO: { rotulo: 'Aviso', cor: 'text-gray-600' },
    URGENTE: { rotulo: 'Urgente', cor: 'text-red-600' },
    MANUTENCAO: { rotulo: 'Manutenção', cor: 'text-amber-600' },
    ASSEMBLEIA: { rotulo: 'Assembleia', cor: 'text-indigo-600' },
    OBRA: { rotulo: 'Obra', cor: 'text-blue-600' },
};

const CATEGORIA_DOC: Record<string, string> = {
    CONVENCAO: 'Convenção', REGULAMENTO: 'Regulamento', ATA: 'Ata',
    MANUAL: 'Manual do proprietário', LAUDO: 'Laudo', SEGURO: 'Seguro', OUTRO: 'Outro',
};

const PAPEL: Record<string, string> = {
    PROPRIETARIO: 'Proprietário', INQUILINO: 'Inquilino',
    MORADOR: 'Morador', RESPONSAVEL_FINANCEIRO: 'Responsável financeiro',
};

const STATUS_COR: Record<string, string> = {
    'Aberto': 'text-amber-600', 'Em Andamento': 'text-blue-600',
    'Aguardando': 'text-indigo-600', 'Resolvido': 'text-emerald-600',
    'Cancelado': 'text-gray-500',
};

function formatarData(iso?: string | null): string {
    if (!iso) return '—';
    const [a, m, d] = iso.slice(0, 10).split('-');
    return d && m && a ? `${d}/${m}/${a}` : '—';
}

interface Props {
    token: string;
    /**
     * Prévia da visão do morador, para quem administra o condomínio.
     *
     * NÃO é cosmético: o portal tem duas ações de ESCRITA, e a aba Comunicação
     * conta `leituras` por aviso. Sem este modo, só de abrir a prévia os avisos
     * daquele morador seriam marcados como lidos, e o número que diz ao síndico
     * se a comunicação chegou viraria ficção. Abrir chamado em nome de outra
     * pessoa é pior ainda.
     *
     * Default `false` — o acesso público por token não muda em nada.
     */
    somenteLeitura?: boolean;
}

const CondominoPortal: React.FC<Props> = ({ token, somenteLeitura = false }) => {
    const [aba, setAba] = React.useState<Aba>('avisos');
    const [dados, setDados] = React.useState<PortalCondominoData | null>(null);
    const [erro, setErro] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [enviando, setEnviando] = React.useState(false);
    const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const [novoChamado, setNovoChamado] = React.useState(false);
    const [form, setForm] = React.useState({
        titulo: '', descricao: '', categoria: 'Geral', prioridade: 'Média',
    });

    const carregar = React.useCallback(async () => {
        setLoading(true);
        setErro(null);
        try {
            const r = await condominoPortalService.carregar(token);
            if (!r.ok) { setErro(r.motivo); setDados(null); }
            else setDados(r);
        } catch (e: any) {
            setErro(e?.message || 'Não foi possível abrir o portal.');
        } finally {
            setLoading(false);
        }
    }, [token]);

    React.useEffect(() => { carregar(); }, [carregar]);

    const marcarLido = async (aviso: PortalAviso) => {
        // A prévia não confirma leitura por ninguém — ver `somenteLeitura`.
        if (somenteLeitura || aviso.lido) return;
        try {
            await condominoPortalService.marcarLido(token, aviso.id);
            setDados(d => d && ({
                ...d,
                avisos: d.avisos.map(a => (a.id === aviso.id ? { ...a, lido: true } : a)),
            }));
        } catch { /* marcar leitura falhando não pode atrapalhar a leitura em si */ }
    };

    const enviarChamado = async () => {
        if (somenteLeitura) return;
        if (!form.titulo.trim()) { notify('Descreva o assunto do chamado.', 'error'); return; }
        setEnviando(true);
        try {
            const r = await condominoPortalService.abrirChamado(token, form);
            if (!r.ok) { notify(r.motivo || 'Não foi possível abrir o chamado.', 'error'); return; }
            setNovoChamado(false);
            setForm({ titulo: '', descricao: '', categoria: 'Geral', prioridade: 'Média' });
            notify('Chamado aberto. A administração foi avisada.');
            await carregar();
        } catch (e: any) {
            notify(e?.message || 'Erro ao abrir o chamado.', 'error');
        } finally {
            setEnviando(false);
        }
    };

    if (loading) {
        return (
            <div className="h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-500 text-sm">Abrindo o portal...</p>
                </div>
            </div>
        );
    }

    if (erro || !dados) {
        return (
            <div className="h-screen flex items-center justify-center bg-gray-50 p-4 md:p-6">
                <div className="text-center max-w-md">
                    <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h1 className="text-lg font-bold text-gray-900 mb-2">Não foi possível abrir</h1>
                    <p className="text-sm text-gray-500">
                        {erro || 'Link inválido ou expirado.'} Peça um link novo à administração do condomínio.
                    </p>
                </div>
            </div>
        );
    }

    const naoLidos = dados.avisos.filter(a => !a.lido).length;
    const abas: { id: Aba; label: string; icon: any; badge?: number }[] = [
        { id: 'avisos', label: 'Avisos', icon: Megaphone, badge: naoLidos },
        { id: 'unidade', label: 'Minha unidade', icon: Home },
        { id: 'documentos', label: 'Documentos', icon: FileText },
        { id: 'chamados', label: 'Chamados', icon: Wrench },
    ];

    return (
        // §20.2.1 — casca própria repete o gutter à mão; não herda o do Layout.
        <div className="min-h-screen bg-gray-50">
            {/* A faixa é obrigatória, não decorativa: sem ela alguém olha esta
                tela achando que é o portal ao vivo e conclui que o morador já
                leu os avisos — o oposto do que aconteceu. */}
            {somenteLeitura && (
                <div className="bg-amber-50 border-b border-amber-200">
                    <div className="max-w-4xl mx-auto px-4 md:px-6 py-2.5 flex items-start gap-2">
                        <Eye className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                        <p className="text-sm text-amber-800">
                            <span className="font-medium">Prévia da visão do condômino.</span>{' '}
                            Nada é gravado: abrir um aviso aqui não conta como leitura dele, e
                            chamados não podem ser abertos em nome de outra pessoa.
                        </p>
                    </div>
                </div>
            )}
            <div className="bg-white border-b border-gray-100">
                <div className="max-w-4xl mx-auto p-4 md:p-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-teal-50 text-teal-600 rounded-[10px]">
                            <Building2 className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-xl font-black text-gray-900 tracking-tight truncate">
                                {dados.condominio.nome}
                            </h1>
                            <p className="text-gray-400 text-sm font-medium truncate">
                                {dados.unidade.torre} · {dados.unidade.nome} · {dados.pessoa.nome}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
                {/* Abas §19.1 */}
                <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                    <div className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
                        {abas.map(t => (
                            <button
                                key={t.id}
                                onClick={() => setAba(t.id)}
                                className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                                    aba === t.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'
                                }`}
                            >
                                <t.icon className="w-3.5 h-3.5" /> {t.label}
                                {t.badge != null && t.badge > 0 && (
                                    <span className="ml-0.5 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold">
                                        {t.badge}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {aba === 'avisos' && (
                    dados.avisos.length === 0 ? (
                        <div className="text-center py-12 bg-white rounded-[10px] border border-gray-100">
                            <Megaphone className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum aviso</h3>
                            <p className="text-sm text-gray-500">Quando a administração publicar algo, aparece aqui.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {dados.avisos.map(a => {
                                const cat = CATEGORIA_AVISO[a.categoria] || CATEGORIA_AVISO.AVISO;
                                return (
                                    <div
                                        key={a.id}
                                        onClick={() => marcarLido(a)}
                                        className={`bg-white p-4 rounded-[10px] border shadow-sm transition-all ${
                                            a.lido ? 'border-gray-100' : 'border-amber-200 cursor-pointer hover:border-amber-300'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <h3 className="text-sm font-medium text-gray-800">{a.titulo}</h3>
                                                <p className="text-xs text-gray-500 mt-0.5">
                                                    <span className={cat.cor}>{cat.rotulo}</span>
                                                    {' · '}{new Date(a.publicadoEm).toLocaleDateString('pt-BR')}
                                                </p>
                                            </div>
                                            {a.lido
                                                ? <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                                                : <span className="text-xs text-amber-600 shrink-0">Não lido</span>}
                                        </div>
                                        <p className="text-sm text-gray-700 mt-3 whitespace-pre-wrap">{a.corpo}</p>
                                    </div>
                                );
                            })}
                        </div>
                    )
                )}

                {aba === 'unidade' && (
                    <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm">
                        <h3 className="text-xs font-semibold text-gray-500 mb-4">Dados da unidade</h3>
                        <dl className="space-y-3 text-sm">
                            <Linha rotulo="Torre" valor={dados.unidade.torre} />
                            <Linha rotulo="Unidade" valor={dados.unidade.nome} />
                            <Linha rotulo="Pavimento" valor={dados.unidade.pavimento?.toString()} />
                            <Linha rotulo="Tipologia" valor={dados.unidade.tipologia} />
                            <Linha
                                rotulo="Área privativa"
                                valor={dados.unidade.areaPrivativa != null ? `${dados.unidade.areaPrivativa} m²` : undefined}
                            />
                            <Linha
                                rotulo="Fração ideal"
                                valor={dados.unidade.fracaoIdeal != null
                                    ? `${(dados.unidade.fracaoIdeal * 100).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}%`
                                    : undefined}
                            />
                        </dl>

                        <h3 className="text-xs font-semibold text-gray-500 mt-6 mb-3">Quem consta na unidade</h3>
                        {dados.ocupacoes.length === 0 ? (
                            <p className="text-sm text-gray-400">Nenhuma ocupação registrada.</p>
                        ) : (
                            <ul className="space-y-1.5">
                                {dados.ocupacoes.map((o, i) => (
                                    <li key={i} className="text-sm text-gray-700">
                                        <span className="text-gray-500">{PAPEL[o.papel] || o.papel}:</span> {o.nome}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                {aba === 'documentos' && (
                    dados.documentos.length === 0 ? (
                        <div className="text-center py-12 bg-white rounded-[10px] border border-gray-100">
                            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum documento</h3>
                            <p className="text-sm text-gray-500">Convenção, regulamento e atas aparecem aqui quando publicados.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {dados.documentos.map(d => (
                                <a
                                    key={d.id}
                                    href={d.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-start gap-3 bg-white p-4 rounded-[10px] border border-gray-100 shadow-sm hover:border-blue-200 transition-all"
                                >
                                    <FileText className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                                    <div className="min-w-0">
                                        <div className="text-sm font-medium text-blue-600">{d.titulo}</div>
                                        <div className="text-xs text-gray-500 mt-0.5">
                                            {CATEGORIA_DOC[d.categoria] || d.categoria}
                                            {d.descricao ? ` · ${d.descricao}` : ''}
                                        </div>
                                    </div>
                                </a>
                            ))}
                        </div>
                    )
                )}

                {aba === 'chamados' && (
                    <div className="space-y-3">
                        {!somenteLeitura && (
                            <div className="flex justify-end">
                                <button
                                    onClick={() => setNovoChamado(v => !v)}
                                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
                                >
                                    <Plus className="w-[15px] h-[15px]" /> Abrir chamado
                                </button>
                            </div>
                        )}

                        {novoChamado && (
                            <div className="bg-white p-4 rounded-[10px] border border-gray-100 shadow-sm space-y-3">
                                <div>
                                    <label className="text-xs font-semibold text-slate-500">Assunto</label>
                                    <input
                                        type="text"
                                        value={form.titulo}
                                        onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                                        placeholder="Ex: Vazamento no teto da garagem"
                                        className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-semibold text-slate-500">Categoria</label>
                                        <select
                                            value={form.categoria}
                                            onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                                            className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                        >
                                            {['Geral', 'Elétrica', 'Hidráulica', 'Estrutural', 'Pintura', 'Serralheria', 'Outro'].map(c => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-semibold text-slate-500">Prioridade</label>
                                        <select
                                            value={form.prioridade}
                                            onChange={e => setForm(f => ({ ...f, prioridade: e.target.value }))}
                                            className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                        >
                                            {['Baixa', 'Média', 'Alta', 'Urgente'].map(p => <option key={p} value={p}>{p}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-slate-500">Descrição</label>
                                    <textarea
                                        rows={3}
                                        value={form.descricao}
                                        onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                                        className="mt-1 w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                    />
                                </div>
                                <div className="flex justify-end gap-2">
                                    <button
                                        onClick={() => setNovoChamado(false)}
                                        className="h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={enviarChamado}
                                        disabled={enviando}
                                        className="h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                                    >
                                        {enviando ? 'Enviando...' : 'Enviar chamado'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {dados.chamados.length === 0 ? (
                            <div className="text-center py-12 bg-white rounded-[10px] border border-gray-100">
                                <Wrench className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                                <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum chamado</h3>
                                <p className="text-sm text-gray-500">
                                    Problemas na unidade ou nas áreas comuns podem ser registrados aqui.
                                </p>
                            </div>
                        ) : (
                            dados.chamados.map(c => (
                                <div key={c.id} className="bg-white p-4 rounded-[10px] border border-gray-100 shadow-sm">
                                    <div className="flex items-start justify-between gap-3">
                                        <h3 className="text-sm font-medium text-gray-800">{c.titulo}</h3>
                                        <span className={`text-sm font-normal shrink-0 ${STATUS_COR[c.status] || 'text-gray-600'}`}>
                                            {c.status}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        {c.categoria} · {c.prioridade} · aberto em {formatarData(c.abertoEm)}
                                        {c.resolvidoEm ? ` · resolvido em ${formatarData(c.resolvidoEm)}` : ''}
                                    </p>
                                    {c.descricao && (
                                        <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{c.descricao}</p>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

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

const Linha: React.FC<{ rotulo: string; valor?: string | null }> = ({ rotulo, valor }) => (
    <div className="flex justify-between gap-4">
        <dt className="text-gray-500">{rotulo}</dt>
        <dd className="text-gray-800 text-right">{valor || <span className="text-gray-400">—</span>}</dd>
    </div>
);

export default CondominoPortal;
