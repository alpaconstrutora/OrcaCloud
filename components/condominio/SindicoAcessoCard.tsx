// components/condominio/SindicoAcessoCard.tsx
// Portais › Portal do Condomínio › (condomínio) — o acesso do SÍNDICO.
// Plano: docs/planos/2026-10-20-portal-do-sindico.md
//
// O síndico é escolhido na Ficha do condomínio (`sindico_client_id` + mandato);
// o acesso dele ao Portal do Síndico nasce, é convidado e é revogado AQUI — e só
// aqui (a Ficha mostra o estado e aponta para cá). Duas portas para o mesmo
// gesto é como nasce divergência — mesma razão de Ocupações ser a única porta do
// acesso dos moradores.
//
// Quem pode o quê vem do banco (`sindico_portal_estado.podeGerir` =
// `is_org_manager`), a mesma régua de `sindico_portal_gerar_token`: o botão
// desligado diz o motivo, nunca some.
import React from 'react';
import { Building, Copy, Eye, Loader2, RefreshCw, ShieldOff } from 'lucide-react';
import { SecaoTitulo } from '../ui/SecaoTitulo';
import { useConfirm } from '../ui/confirm';
import ConvitePortalBloco from '../portal/ConvitePortalBloco';
import { sindicoPortalService } from '../../services/sindicoPortalService';
import { acessoDoSindico, type EstadoDoSindico, type SituacaoDoAcessoDoSindico } from '../../utils/acessoDoSindico';
import { hojeEmBrasilia } from '../../utils/mandatoSindico';

// §8 — status em texto colorido, sem pílula.
const COR: Record<SituacaoDoAcessoDoSindico, string> = {
    ATIVO: 'text-emerald-700',
    SEM_ACESSO: 'text-gray-600',
    EXPIRADO: 'text-amber-700',
    REVOGADO: 'text-red-600',
    MANDATO_FORA: 'text-red-600',
    SEM_SINDICO: 'text-gray-600',
};

const data = (iso: string | null | undefined) => {
    if (!iso) return null;
    const [a, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${a}`;
};

const dataHora = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;

const BTN_PRIMARIO = 'flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed';
const BTN_SECUNDARIO = 'flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed';

interface Props {
    condominio: { id: string; name: string };
    notify: (m: string, t?: 'success' | 'error') => void;
    onVerComoSindico: (clientId: string) => void;
    onDefinirNaFicha: () => void;
}

const SindicoAcessoCard: React.FC<Props> = ({ condominio, notify, onVerComoSindico, onDefinirNaFicha }) => {
    const confirm = useConfirm();
    const [estado, setEstado] = React.useState<(EstadoDoSindico & { podeGerir: boolean }) | null>(null);
    const [erro, setErro] = React.useState<string | null>(null);
    const [ocupado, setOcupado] = React.useState<'copiar' | 'renovar' | 'revogar' | null>(null);

    const carregar = React.useCallback(async () => {
        setErro(null);
        try {
            const r = await sindicoPortalService.estado(condominio.id);
            if (!r.ok) { setErro(r.motivo || 'Não foi possível ler o acesso do síndico.'); return; }
            setEstado(r);
        } catch (e) {
            setErro((e as Error).message);
        }
    }, [condominio.id]);

    React.useEffect(() => { void carregar(); }, [carregar]);

    const hoje = hojeEmBrasilia();
    const acesso = estado ? acessoDoSindico(estado, hoje) : null;
    const s = estado?.sindico ?? null;

    // Motivo único de cada botão desligado (regra do app: botão desligado diz por quê).
    const motivoGerir = !estado?.podeGerir
        ? 'Só administrador ou proprietário da organização gera e revoga o acesso do síndico.'
        : acesso?.situacao === 'MANDATO_FORA'
            ? 'O mandato do síndico está fora da vigência — ajuste as datas na Ficha.'
            : null;

    const copiarLink = async (renovar: boolean) => {
        if (renovar) {
            const ok = await confirm({
                title: 'Gerar um novo link?',
                message: 'O link atual para de funcionar na hora. O login por e-mail e senha continua valendo.',
                variant: 'warning',
                confirmLabel: 'Gerar novo link',
            });
            if (!ok) return;
        }
        setOcupado(renovar ? 'renovar' : 'copiar');
        try {
            const link = await sindicoPortalService.gerarLink(condominio.id, renovar);
            await navigator.clipboard.writeText(link).catch(() => undefined);
            notify(renovar ? 'Novo link gerado e copiado.' : 'Link do Portal do Síndico copiado.');
            await carregar();
        } catch (e) {
            notify((e as Error).message, 'error');
        } finally {
            setOcupado(null);
        }
    };

    const revogar = async () => {
        if (!s) return;
        const ok = await confirm({
            title: 'Revogar o acesso do síndico?',
            message: `${s.nome} deixa de entrar no Portal do Síndico — pelo link e pelo e-mail e senha. Gerar um novo link devolve o acesso.`,
            variant: 'danger',
            confirmLabel: 'Revogar',
        });
        if (!ok) return;
        setOcupado('revogar');
        try {
            await sindicoPortalService.revogar(s.clientId);
            notify('Acesso do síndico revogado.');
            await carregar();
        } catch (e) {
            notify((e as Error).message, 'error');
        } finally {
            setOcupado(null);
        }
    };

    return (
        <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4">
            <SecaoTitulo
                icon={Building}
                titulo="Síndico"
                resumo="Acesso ao Portal do Síndico: o prédio inteiro, avisos, chamados e prestação de contas"
            />

            {erro ? (
                <p className="text-sm text-red-600">{erro}</p>
            ) : !estado || !acesso ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
                </div>
            ) : !s ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-gray-700">Nenhum síndico definido para este condomínio.</p>
                    <button type="button" onClick={onDefinirNaFicha} className={BTN_SECUNDARIO}>Definir na Ficha</button>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
                        <div className="space-y-1.5">
                            <p className="text-xs font-semibold text-slate-500">Síndico</p>
                            <p className="text-sm text-gray-900">{s.nome}</p>
                            <p className="text-xs text-gray-500 break-all">{[s.email, s.telefone].filter(Boolean).join(' · ') || 'Sem e-mail nem telefone'}</p>
                        </div>
                        <div className="space-y-1.5">
                            <p className="text-xs font-semibold text-slate-500">Mandato</p>
                            <p className="text-sm text-gray-900">
                                {s.mandatoInicio || s.mandatoFim
                                    ? `${data(s.mandatoInicio) ?? 'sem início'} a ${data(s.mandatoFim) ?? 'sem prazo'}`
                                    : 'Sem prazo definido'}
                            </p>
                            {acesso.situacao === 'MANDATO_FORA' && (
                                <button type="button" onClick={onDefinirNaFicha} className="text-xs font-medium text-blue-600 hover:text-blue-800">
                                    Ajustar na Ficha
                                </button>
                            )}
                        </div>
                        <div className="space-y-1.5">
                            <p className="text-xs font-semibold text-slate-500">Acesso</p>
                            <p className={`text-sm font-normal ${COR[acesso.situacao]}`}>{acesso.rotulo}</p>
                            <p className="text-xs text-gray-500">
                                {estado.acesso?.ultimoUso ? `Último uso ${dataHora(estado.acesso.ultimoUso)}` : estado.acesso ? 'Ainda não usado' : ''}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => copiarLink(false)}
                            disabled={!!motivoGerir || ocupado !== null}
                            title={motivoGerir ?? 'Copia o link vivo; sem link, gera um (90 dias)'}
                            className={BTN_PRIMARIO}
                        >
                            {ocupado === 'copiar' ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Copy className="w-[15px] h-[15px]" />}
                            Copiar link
                        </button>
                        <button
                            type="button"
                            onClick={() => copiarLink(true)}
                            disabled={!!motivoGerir || ocupado !== null}
                            title={motivoGerir ?? 'Troca o link e invalida o anterior'}
                            className={BTN_SECUNDARIO}
                        >
                            {ocupado === 'renovar' ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <RefreshCw className="w-[15px] h-[15px]" />}
                            Gerar novo link
                        </button>
                        <button
                            type="button"
                            onClick={() => onVerComoSindico(s.clientId)}
                            disabled={acesso.situacao === 'MANDATO_FORA'}
                            title={acesso.situacao === 'MANDATO_FORA' ? 'Com o mandato fora da vigência o portal não abre — nem a prévia.' : 'Prévia somente leitura do que o síndico vê'}
                            className={BTN_SECUNDARIO}
                        >
                            <Eye className="w-[15px] h-[15px]" />
                            Ver como o síndico
                        </button>
                        {estado.acesso?.ativo && (
                            <button
                                type="button"
                                onClick={revogar}
                                disabled={!estado.podeGerir || ocupado !== null}
                                title={!estado.podeGerir ? 'Só administrador ou proprietário da organização revoga o acesso do síndico.' : 'Desliga o link e o login por e-mail'}
                                className={`${BTN_SECUNDARIO} text-red-600 hover:bg-red-50`}
                            >
                                {ocupado === 'revogar' ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <ShieldOff className="w-[15px] h-[15px]" />}
                                Revogar
                            </button>
                        )}
                    </div>

                    {estado.podeGerir && acesso.situacao !== 'MANDATO_FORA' && (
                        <ConvitePortalBloco
                            portal="sindico"
                            id={condominio.id}
                            email={s.email}
                            invitedAt={estado.acesso?.convidadoEm ?? null}
                            onResultado={r => { notify(r.mensagem, r.ok ? 'success' : 'error'); if (r.ok) void carregar(); }}
                        />
                    )}
                </>
            )}
        </div>
    );
};

export default SindicoAcessoCard;
