// components/condominio/CondominioDetail.tsx
// ÒPURA Pós-Entrega — o edifício depois da entrega.
// Plano: docs/planos/2026-08-13-opura-condominios-avaliacao.md
//
// Um condomínio é o `Empreendimento` no estado EM_OPERACAO — não há entidade
// nem árvore nova. As torres e unidades são as mesmas que foram vendidas.
import React from 'react';
import { ArrowLeft, FileText, Users, Wrench, Save, Scale } from 'lucide-react';
import OcupacoesTab from './OcupacoesTab';
import ManutencaoTab from './ManutencaoTab';
import FracoesTab from './FracoesTab';
import { empreendimentoService } from '../../services/empreendimentoService';
import { clientService } from '../../services/clientService';
import type { Empreendimento } from '../../types/empreendimento';

type Aba = 'ficha' | 'ocupacoes' | 'fracoes' | 'manutencao';

interface Props {
    empreendimento: Empreendimento;
    onBack: () => void;
    onChanged?: (e: Empreendimento) => void;
}

const CondominioDetail: React.FC<Props> = ({ empreendimento, onBack, onChanged }) => {
    const [aba, setAba] = React.useState<Aba>('ficha');
    const [e, setE] = React.useState<Empreendimento>(empreendimento);
    const [salvando, setSalvando] = React.useState(false);
    const [clientes, setClientes] = React.useState<{ id: string; name: string }[]>([]);
    const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const [ficha, setFicha] = React.useState({
        condominio_razao_social: e.condominio_razao_social || '',
        condominio_cnpj: e.condominio_cnpj || '',
        condominio_instalado_em: e.condominio_instalado_em || '',
        sindico_client_id: e.sindico_client_id || '',
        sindico_mandato_inicio: e.sindico_mandato_inicio || '',
        sindico_mandato_fim: e.sindico_mandato_fim || '',
    });

    React.useEffect(() => {
        clientService.listClients(e.organization_id)
            .then(cs => setClientes((cs || []).map((c: any) => ({ id: c.id, name: c.name }))))
            .catch(() => setClientes([]));
    }, [e.organization_id]);

    /** Mandato vencido não representa o condomínio — o aviso precisa existir na tela. */
    const mandatoVencido = React.useMemo(() => {
        if (!ficha.sindico_mandato_fim) return false;
        return ficha.sindico_mandato_fim.slice(0, 10) < new Date().toISOString().slice(0, 10);
    }, [ficha.sindico_mandato_fim]);

    const salvarFicha = async () => {
        setSalvando(true);
        try {
            const atualizado = await empreendimentoService.update(e.id, {
                condominio_razao_social: ficha.condominio_razao_social || null,
                condominio_cnpj: ficha.condominio_cnpj || null,
                condominio_instalado_em: ficha.condominio_instalado_em || null,
                sindico_client_id: ficha.sindico_client_id || null,
                sindico_mandato_inicio: ficha.sindico_mandato_inicio || null,
                sindico_mandato_fim: ficha.sindico_mandato_fim || null,
            } as any);
            setE(atualizado);
            onChanged?.(atualizado);
            notify('Ficha do condomínio salva.');
        } catch (err: any) {
            notify(err?.message || 'Erro ao salvar a ficha.', 'error');
        } finally { setSalvando(false); }
    };

    const abas: { id: Aba; label: string; icon: any }[] = [
        { id: 'ficha', label: 'Ficha', icon: FileText },
        { id: 'ocupacoes', label: 'Ocupações', icon: Users },
        // Fica entre Ocupações e Manutenção porque é da mesma família: quem
        // ocupa e quanto pesa cada unidade. É a base do rateio e do peso de
        // voto em assembleia, ambos pós-portão.
        { id: 'fracoes', label: 'Frações', icon: Scale },
        { id: 'manutencao', label: 'Manutenção', icon: Wrench },
    ];

    return (
        <div className="space-y-6">
            {/* §20 — título solto, NUNCA em card. Copiei o cabeçalho em card do
                EmpreendimentoDetail, mas ele é exceção NOMEADA para telas que já
                existiam; tela nova segue o padrão. §23: com 1 salto de
                profundidade o padrão é "Voltar", não migalha de pão. */}
            <div>
                <button
                    type="button"
                    onClick={onBack}
                    className="flex items-center gap-1.5 h-8 px-2.5 -ml-2.5 rounded-[6px] text-sm font-medium text-gray-500 hover:bg-gray-100 transition-all mb-3"
                >
                    <ArrowLeft className="w-4 h-4" /> Voltar
                </button>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">{e.name}</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">
                    {e.code ? `${e.code} · ` : ''}
                    {e.condominio_cnpj ? `CNPJ ${e.condominio_cnpj}` : 'CNPJ do condomínio não informado'}
                </p>
            </div>

            {/* Abas §19.1 */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-3 rounded-[10px] border border-gray-100 shadow-sm mb-3">
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
                        </button>
                    ))}
                </div>
            </div>

            {aba === 'ficha' && (
                <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm max-w-3xl">
                    <h3 className="text-xs font-semibold text-gray-500 mb-1">Dados do condomínio</h3>
                    <p className="text-xs text-gray-400 mb-4">
                        O CNPJ do condomínio não é o da SPE que incorporou — são pessoas jurídicas distintas, e é
                        por aqui que a segregação de caixa se ancora quando o financeiro condominial entrar.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Razão social do condomínio</label>
                            <input
                                type="text"
                                value={ficha.condominio_razao_social}
                                onChange={ev => setFicha(f => ({ ...f, condominio_razao_social: ev.target.value }))}
                                className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500">CNPJ do condomínio</label>
                            <input
                                type="text"
                                value={ficha.condominio_cnpj}
                                onChange={ev => setFicha(f => ({ ...f, condominio_cnpj: ev.target.value }))}
                                placeholder="00.000.000/0001-00"
                                className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            />
                            {e.spe_cnpj && (
                                <p className="text-xs text-gray-400 mt-1">SPE incorporadora: {e.spe_cnpj}</p>
                            )}
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Instalado em</label>
                            <input
                                type="date"
                                value={ficha.condominio_instalado_em?.slice(0, 10) || ''}
                                onChange={ev => setFicha(f => ({ ...f, condominio_instalado_em: ev.target.value }))}
                                className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Síndico</label>
                            <select
                                value={ficha.sindico_client_id}
                                onChange={ev => setFicha(f => ({ ...f, sindico_client_id: ev.target.value }))}
                                className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            >
                                <option value="">Não definido</option>
                                {clientes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Mandato — início</label>
                            <input
                                type="date"
                                value={ficha.sindico_mandato_inicio?.slice(0, 10) || ''}
                                onChange={ev => setFicha(f => ({ ...f, sindico_mandato_inicio: ev.target.value }))}
                                className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Mandato — fim</label>
                            <input
                                type="date"
                                value={ficha.sindico_mandato_fim?.slice(0, 10) || ''}
                                onChange={ev => setFicha(f => ({ ...f, sindico_mandato_fim: ev.target.value }))}
                                className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            />
                            {mandatoVencido && (
                                <p className="text-xs text-red-600 mt-1">
                                    Mandato vencido — o síndico não representa mais o condomínio.
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex justify-end mt-6">
                        <button
                            onClick={salvarFicha}
                            disabled={salvando}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                        >
                            <Save className="w-[15px] h-[15px]" /> {salvando ? 'Salvando...' : 'Salvar ficha'}
                        </button>
                    </div>
                </div>
            )}

            {aba === 'ocupacoes' && <OcupacoesTab empreendimento={e} />}
            {aba === 'fracoes' && <FracoesTab empreendimento={e} />}
            {aba === 'manutencao' && <ManutencaoTab empreendimento={e} />}

            {notification && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium ${
                    notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    {notification.message}
                </div>
            )}
        </div>
    );
};

export default CondominioDetail;
