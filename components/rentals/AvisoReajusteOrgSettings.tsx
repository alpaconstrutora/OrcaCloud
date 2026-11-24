import React, { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { useOrgContext } from '../../hooks/useOrgContext';
import { SecaoTitulo } from '../ui/SecaoTitulo';
import { reajusteLocacaoService } from '../../services/reajusteLocacaoService';

/**
 * Configurações do Sistema › Índices de Reajuste — antecedência PADRÃO do aviso
 * de reajuste da organização (decisão do usuário 24/11/2026: "Os dois" — padrão
 * da organização aqui, e cada contrato pode trocar o seu em Dados do contrato).
 * O aviso diário (fn_notif_contrato_reajuste) usa contrato → organização → 30.
 * REGRA #5: a organização é a do seletor do topo; em "Todas" não há a qual gravar.
 */
const AvisoReajusteOrgSettings: React.FC = () => {
    const { orgId, isAllOrgs } = useOrgContext();
    const [dias, setDias] = useState('');
    const [salvo, setSalvo] = useState<string>('');
    const [carregando, setCarregando] = useState(false);
    const [gravando, setGravando] = useState(false);
    const [mensagem, setMensagem] = useState<{ texto: string; erro: boolean } | null>(null);

    useEffect(() => {
        if (!orgId) { setDias(''); setSalvo(''); return; }
        let vivo = true;
        setCarregando(true);
        setMensagem(null);
        reajusteLocacaoService.avisoPadraoDaOrg(orgId)
            .then(v => { if (vivo) { const s = v == null ? '' : String(v); setDias(s); setSalvo(s); } })
            .catch(() => { if (vivo) setMensagem({ texto: 'Não foi possível ler o padrão da organização.', erro: true }); })
            .finally(() => { if (vivo) setCarregando(false); });
        return () => { vivo = false; };
    }, [orgId]);

    const valor = dias.trim() === '' ? null : Math.floor(Number(dias));
    const invalido = valor != null && (!Number.isFinite(valor) || valor < 0 || valor > 365);
    const motivo = isAllOrgs || !orgId ? 'Escolha uma organização no seletor do topo para definir o padrão dela.'
        : carregando ? 'Carregando…'
        : gravando ? 'Gravando…'
        : invalido ? 'Informe de 0 a 365 dias (vazio = 30).'
        : dias === salvo ? 'Nada a gravar: o valor é o que já está salvo.'
        : null;

    const gravar = async () => {
        if (!orgId || motivo) return;
        setGravando(true);
        setMensagem(null);
        try {
            await reajusteLocacaoService.definirAvisoPadraoDaOrg(orgId, valor);
            setSalvo(dias);
            setMensagem({ texto: 'Padrão gravado. Vale a partir do próximo aviso diário.', erro: false });
        } catch (e) {
            setMensagem({ texto: e instanceof Error ? e.message : 'Erro ao gravar.', erro: true });
        } finally {
            setGravando(false);
        }
    };

    return (
        <div className="space-y-4">
            <SecaoTitulo icon={Bell} titulo="Aviso de reajuste" />
            <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1.5">
                    <label htmlFor="aviso-reajuste-org" className="block text-xs font-semibold text-slate-500">Avisar antes do reajuste</label>
                    <div className="relative w-40" title={isAllOrgs || !orgId ? motivo ?? undefined : undefined}>
                        <input
                            id="aviso-reajuste-org"
                            type="number" min={0} max={365} step={1} inputMode="numeric"
                            placeholder="30"
                            disabled={isAllOrgs || !orgId || carregando}
                            value={dias}
                            onChange={e => setDias(e.target.value)}
                            className="w-full h-9 pl-3 pr-12 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all disabled:bg-gray-50 disabled:cursor-not-allowed"
                        />
                        <span aria-hidden="true" className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none">dias</span>
                    </div>
                </div>
                <span className="inline-flex" title={motivo ?? undefined}>
                    <button
                        type="button"
                        onClick={gravar}
                        disabled={!!motivo}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {gravando ? 'Gravando…' : 'Gravar padrão'}
                    </button>
                </span>
            </div>
            <p className="text-xs text-gray-500">
                Padrão da organização para o aviso de reajuste das locações (vazio = 30 dias). Cada contrato pode ter o seu
                prazo em Gerenciar Negociação › Contrato › Dados do contrato.
            </p>
            {mensagem && <p className={`text-xs ${mensagem.erro ? 'text-red-600' : 'text-emerald-700'}`}>{mensagem.texto}</p>}
        </div>
    );
};

export default AvisoReajusteOrgSettings;
