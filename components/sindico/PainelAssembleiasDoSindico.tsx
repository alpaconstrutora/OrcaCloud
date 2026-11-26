import React from 'react';
import { AlertCircle, Lock, Plus, ShieldCheck, Vote } from 'lucide-react';
import {
    CardHeader, GhostButton, PortalCard, PortalEmpty, PortalLoading, PrimaryButton, PrimaryLink, StatusPill, TextLinkButton,
    type PillTone,
} from '../portal/PortalKit';
import { useConfirm } from '../ui/confirm';
import AssembleiaDetalheView, { type CondominioDaAssembleia } from '../condominio/AssembleiaDetalheView';
import AssembleiaSheet from '../condominio/AssembleiaSheet';
import {
    operacoesDoSindico, type CondominioDoSindico, type IdentidadeDoSindico,
} from '../../services/sindicoPortalService';
import type { Assembleia, ResultadoItem, StatusAssembleia } from '../../services/condominioAssembleiaService';
import { dataHoraBrasilia, ROTULO_RESULTADO, ROTULO_STATUS, ROTULO_TIPO } from '../../utils/assembleiaTextos';
import { rotaDeEntradaDoPortal } from '../../lib/entradasDoPortal';
import { ProfileGroup } from '../../types';

/**
 * Portal do Síndico › Assembleias (B2, 26/11/2026).
 * Plano: docs/planos/2026-11-25-condominio-assembleias-votacoes.md (fase B).
 *
 * O síndico cria o rascunho, convoca e conduz a assembleia do prédio dele. A gaveta de
 * rascunho (AssembleiaSheet) e a TELA da assembleia (AssembleiaDetalheView) são as
 * MESMAS do gestor (A7), sem cópia: só a porta muda — `operacoesDoSindico`, as RPCs
 * `sindico_portal_assembleia_*` (B1). A lista é deste painel, no vocabulário do portal (§24).
 *
 * Exige o SÍNDICO LOGADO (e-mail e senha): as RPCs rodam no modo 'sessao' do resolvedor
 * e recusam o link sozinho (nem executam com a chave anon). Por isso, sem login, o painel
 * não chama o banco — só diz como entrar, com o caminho da entrada do portal. "Logado" quem
 * decide é a casca (entrada por e-mail OU sessão ativa com o link). A administradora
 * (portal aberto pelo app, por clientId) conduz pela tela do gestor no app.
 *
 * A tela da assembleia e a gaveta vêm com `accent="portal"` (§24) e avisam pelo toast da
 * casca; `onAlterado` relê o portal (o aviso da convocação em Avisos, a ata em Documentos).
 */

/** Frase da tela sem sessão (brief da B2). */
export const MOTIVO_SEM_SESSAO = 'Entre com e-mail e senha para conduzir a assembleia';

const TOM: Record<StatusAssembleia, PillTone> = {
    RASCUNHO: 'neutral', CONVOCADA: 'info', INSTALADA: 'accent', ENCERRADA: 'good', CANCELADA: 'muted',
};

const ROTULO = 'text-xs font-semibold text-slate-500';
const CAMPO = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#E1553C]/20 focus:border-[#E1553C]';

function resultadoDe(a: Assembleia): string | null {
    if (a.status === 'CANCELADA') return a.motivoCancelamento ? `Cancelada: ${a.motivoCancelamento}` : null;
    if (a.status !== 'ENCERRADA' || !a.retrato) return null;
    const conta = new Map<ResultadoItem, number>();
    for (const it of a.retrato.itens) conta.set(it.resultado, (conta.get(it.resultado) ?? 0) + 1);
    return [...conta.entries()].map(([r, n]) => `${ROTULO_RESULTADO[r]}: ${n}`).join(' · ') || null;
}

/** O que a tela da assembleia usa do condomínio, a partir do payload do portal. */
const condominioDaTela = (c: CondominioDoSindico): CondominioDaAssembleia => ({
    id: c.id, name: c.nome, code: c.codigo ?? undefined, condominio_razao_social: c.razaoSocial, condominio_cnpj: c.cnpj,
});

interface Props {
    identidade: IdentidadeDoSindico;
    condominios: CondominioDoSindico[];
    /** Síndico entrou com e-mail e senha (a única entrada com sessão dele). */
    logado: boolean;
    /** Portal aberto pela administradora no app: ela conduz pela tela do gestor. */
    comoAdministradora?: boolean;
    notify: (m: string, t?: 'success' | 'error' | 'warning') => void;
    /** Mudou algo que Avisos/Documentos mostram: a casca relê o portal. */
    onAlterado?: () => void;
}

/** Entrada por e-mail e senha do Portal do Síndico (o mapa de rotas dos portais). */
const ROTA_DO_LOGIN = rotaDeEntradaDoPortal(ProfileGroup.SINDICO) ?? '/portal-sindico';

const PainelAssembleiasDoSindico: React.FC<Props> = ({
    identidade, condominios, logado, comoAdministradora = false, notify, onAlterado,
}) => {
    const podeConduzir = logado && !comoAdministradora;

    if (!podeConduzir) {
        return (
            <PortalCard>
                <CardHeader title="Assembleias" subtitle="Criar, convocar e conduzir a assembleia do condomínio" />
                {comoAdministradora ? (
                    <PortalEmpty icon={<ShieldCheck className="w-10 h-10" />}
                        title="Como administradora, conduza a assembleia pelo app"
                        subtitle="Condomínios › o condomínio › aba Assembleias. Aqui a condução é do síndico, com o login dele." />
                ) : (
                    <>
                        <PortalEmpty icon={<Lock className="w-10 h-10" />} title={MOTIVO_SEM_SESSAO}
                            subtitle="Pelo link você consulta o portal; criar, convocar e conduzir a assembleia exige o seu login de síndico." />
                        <div className="flex justify-center pb-8 -mt-4">
                            <PrimaryLink href={ROTA_DO_LOGIN}>Entrar com e-mail e senha</PrimaryLink>
                        </div>
                    </>
                )}
            </PortalCard>
        );
    }
    return <ListaDeAssembleias identidade={identidade} condominios={condominios} notify={notify} onAlterado={onAlterado} />;
};

const ListaDeAssembleias: React.FC<Omit<Props, 'logado' | 'comoAdministradora'>> = ({ identidade, condominios, notify, onAlterado }) => {
    const confirm = useConfirm();
    const multi = condominios.length > 1;
    const [condominioId, setCondominioId] = React.useState(condominios[0]?.id ?? '');
    const condominio = condominios.find(c => c.id === condominioId) ?? null;
    const ops = React.useMemo(() => operacoesDoSindico(identidade, condominioId), [identidade, condominioId]);

    const [lista, setLista] = React.useState<Assembleia[]>([]);
    const [carregando, setCarregando] = React.useState(true);
    const [erro, setErro] = React.useState<string | null>(null);
    const [aberta, setAberta] = React.useState<string | null>(null);
    const [sheet, setSheet] = React.useState<{ open: boolean; id: string | null }>({ open: false, id: null });
    const [excluindo, setExcluindo] = React.useState<string | null>(null);

    const carregar = React.useCallback(async () => {
        if (!condominioId) { setLista([]); setCarregando(false); return; }
        setCarregando(true);
        setErro(null);
        try {
            setLista(await ops.listar(condominioId));
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível carregar as assembleias.');
        } finally {
            setCarregando(false);
        }
    }, [ops, condominioId]);

    React.useEffect(() => { void carregar(); }, [carregar]);

    // §22 — costura local.
    const salva = (a: Assembleia, pautaSalva: boolean) => {
        setLista(prev => (prev.some(x => x.id === a.id) ? prev.map(x => (x.id === a.id ? a : x)) : [a, ...prev]));
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
        setExcluindo(a.id);
        try {
            await ops.excluirRascunho(a.id);
            setLista(prev => prev.filter(x => x.id !== a.id));
            notify('Rascunho excluído.');
        } catch (e) {
            notify(e instanceof Error ? e.message : 'Não foi possível excluir o rascunho.', 'error');
        } finally {
            setExcluindo(null);
        }
    };

    // A TELA da assembleia (a mesma do gestor) substitui a lista; Voltar relê a lista.
    if (aberta && condominio) {
        return (
            <AssembleiaDetalheView
                assembleiaId={aberta}
                empreendimento={condominioDaTela(condominio)}
                ops={ops}
                rotuloDaLista="Assembleias"
                accent="portal"
                notify={(m, t) => notify(m, t)}
                onAlterado={onAlterado}
                onVoltar={() => { setAberta(null); void carregar(); }}
            />
        );
    }

    return (
        <>
            {multi && (
                <PortalCard className="p-4 md:p-5">
                    <div className="space-y-1.5 max-w-md">
                        <label className={ROTULO} htmlFor="assembleia-condominio">Condomínio</label>
                        <select id="assembleia-condominio" className={CAMPO} value={condominioId}
                            onChange={e => setCondominioId(e.target.value)}>
                            {condominios.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </select>
                    </div>
                </PortalCard>
            )}

            <PortalCard>
                <CardHeader
                    title="Assembleias"
                    subtitle="Rascunho não aparece para os condôminos; convocar publica o aviso no mural e abre o voto pelo portal"
                    right={<PrimaryButton onClick={() => setSheet({ open: true, id: null })}><Plus className="w-4 h-4" /> Nova assembleia</PrimaryButton>}
                />
                {erro && (
                    <div className="mx-5 mb-4 flex items-start gap-2 rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>
                            {erro}{' '}
                            <button type="button" onClick={() => void carregar()} className="font-medium underline">Tentar de novo</button>
                        </span>
                    </div>
                )}
                {carregando ? (
                    <PortalLoading label="Carregando as assembleias..." />
                ) : lista.length === 0 ? (
                    !erro && (
                        <PortalEmpty icon={<Vote className="w-10 h-10" />} title="Nenhuma assembleia"
                            subtitle="Crie o rascunho com a pauta; convocar publica o aviso no portal e abre o voto." />
                    )
                ) : (
                    <ul className="divide-y divide-[#ECECEF] border-t border-[#ECECEF]">
                        {lista.map(a => {
                            const resultado = resultadoDe(a);
                            return (
                                <li key={a.id} className="px-5 py-4 flex flex-wrap items-start justify-between gap-4">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-sm font-semibold text-[#1F2430]">{a.titulo}</span>
                                            <StatusPill tone={TOM[a.status]}>{ROTULO_STATUS[a.status]}</StatusPill>
                                        </div>
                                        <p className="text-[13px] text-[#4A505C] mt-1">
                                            {[
                                                ROTULO_TIPO[a.tipo],
                                                a.primeiraConvocacaoEm
                                                    ? `1ª convocação ${dataHoraBrasilia(a.primeiraConvocacaoEm)}`
                                                    : '1ª convocação a definir',
                                            ].join(' · ')}
                                        </p>
                                        {resultado && <p className="text-[13px] text-[#4A505C] mt-0.5">{resultado}</p>}
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <TextLinkButton onClick={() => setAberta(a.id)} className="px-2 h-9">Abrir</TextLinkButton>
                                        {/* Fora do rascunho a pauta está travada no banco: a ação nem aparece. */}
                                        {a.status === 'RASCUNHO' && (
                                            <>
                                                <GhostButton onClick={() => setSheet({ open: true, id: a.id })}>Editar</GhostButton>
                                                <GhostButton onClick={() => excluir(a)} disabled={excluindo === a.id}>
                                                    {excluindo === a.id ? 'Excluindo...' : 'Excluir'}
                                                </GhostButton>
                                            </>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </PortalCard>

            <AssembleiaSheet
                open={sheet.open}
                onClose={() => setSheet({ open: false, id: null })}
                empreendimentoId={condominioId}
                assembleiaId={sheet.id}
                ops={ops}
                onSalva={salva}
                accent="portal"
            />
        </>
    );
};

export default PainelAssembleiasDoSindico;
