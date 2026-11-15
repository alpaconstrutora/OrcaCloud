import React from 'react';
import { BadgeCheck, Send, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { ProjectRisk, RiskMatrixConfig } from '../../types/risk';
import { riskService } from '../../services/riskService';
import { errorMessage } from '../../hooks/useOrgContext';
import { useToast } from '../../hooks/useToast';
import { useStore } from '../../store/useStore';
import { exigeAprovacao, situacaoDaAprovacao } from '../../utils/riskFase2';
import { nivelPendenteDaAlcada } from '../../utils/riskPainel';
import { juntarNomes, mensagemDaAlcada, motivoSemAlcada } from '../../utils/alcada';
import { useConfirm } from '../ui/confirm';
import { formatDateTimeBR } from '../ui/Format';
import { SecaoTitulo } from '../ui/SecaoTitulo';
import { AREA, BOTAO_PERIGO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CAMPO, COM_ERRO, ErroDoCampo, ROTULO } from './riscosUi';

/**
 * Alçada do risco na aba Ficha (F2.3 de docs/planos/2026-11-13-modulo-riscos.md).
 *
 * Exige aprovação: estratégia "aceitar" ou risco crítico (gatilho ou pontuação ≥ limite da
 * organização) — `exigeAprovacao`/`situacaoDaAprovacao` de `utils/riskFase2.ts`, sempre
 * sobre o que está GRAVADO (com a ficha suja, enviar e aprovar ficam desligados com o motivo).
 *
 * Quem aprova é decidido no BANCO (`approval_approvers` por tipo `project_risk`; a trava
 * `fn_alcada_trava_passo` recusa o resto com `ALCADA_NAO_PERMITE: …`). A tela só antecipa:
 * pergunta `podeAprovar` e mostra quem aprova o nível. Aprovar não depende de `canEditRisks`
 * — estar na alçada é a autorização (o banco confere); enviar, sim.
 *
 * Reprovar exige motivo: formulário DENTRO da ficha (um `Modal` dentro do `Sheet` ficaria
 * preso no painel, que tem `transform` — guia §31.2), no molde do "Encerrar o risco".
 */
interface Props {
    risco: ProjectRisk;
    faixas: RiskMatrixConfig;
    podeEditar: boolean;
    motivoSemEdicao: string;
    /** A ficha tem alteração não salva: a aprovação vale para o que está gravado. */
    fichaSuja: boolean;
    onRisco: (r: ProjectRisk) => void;
}

const MOTIVO_FICHA_SUJA = 'Salve as alterações da ficha antes: a aprovação vale para o que está gravado.';

const textoDoErro = (e: unknown, fallback: string) => {
    const m = errorMessage(e, fallback);
    return mensagemDaAlcada(m) ?? m;
};

/** Cadeia de aprovação (quem, quando, observação) — texto colorido, sem pílula (§8). */
const Cadeia: React.FC<{ risco: ProjectRisk }> = ({ risco }) => {
    if (!risco.approval_chain?.length) return null;
    return (
        <ul className="space-y-1.5">
            {risco.approval_chain.map((p, i) => (
                <li key={i} className="text-sm text-gray-700">
                    <span className={p.action === 'APROVADO' ? 'text-emerald-700' : 'text-red-700'}>
                        {p.action === 'APROVADO' ? `Nível ${p.level} aprovado` : 'Reprovado'}
                    </span>
                    {' por '}{p.approved_by}{' em '}{formatDateTimeBR(p.approved_at)}
                    {p.notes && <span className="text-gray-600"> — “{p.notes}”</span>}
                </li>
            ))}
        </ul>
    );
};

export const RiscoAlcada: React.FC<Props> = ({ risco, faixas, podeEditar, motivoSemEdicao, fichaSuja, onRisco }) => {
    const { showToast } = useToast();
    const confirm = useConfirm();
    const email = useStore(s => s.session?.user?.email ?? null);
    const situacao = situacaoDaAprovacao(risco, faixas);
    const { motivo: motivoExige } = exigeAprovacao(risco, faixas);
    const pendente = situacao === 'pendente' ? nivelPendenteDaAlcada(risco) : null;

    const [alcada, setAlcada] = React.useState<{ pode: boolean; nomes: string[] } | null>(null);
    const [erroAlcada, setErroAlcada] = React.useState<string | null>(null);
    const [observacao, setObservacao] = React.useState('');
    const [reprovando, setReprovando] = React.useState(false);
    const [motivoRep, setMotivoRep] = React.useState('');
    const [erroRep, setErroRep] = React.useState<string | null>(null);
    const [gravando, setGravando] = React.useState(false);

    const nivel = pendente?.nivel ?? null;
    const conferirAlcada = React.useCallback(() => {
        if (!nivel) return () => undefined;
        let vivo = true;
        setAlcada(null);
        setErroAlcada(null);
        Promise.all([riskService.podeAprovar(risco.organization_id, nivel), riskService.aprovadoresDoNivel(risco.organization_id, nivel)])
            .then(([pode, aprovadores]) => { if (vivo) setAlcada({ pode, nomes: aprovadores.map(a => a.nome) }); })
            .catch(e => { if (vivo) setErroAlcada(errorMessage(e, 'erro desconhecido')); });
        return () => { vivo = false; };
    }, [risco.organization_id, nivel]);
    React.useEffect(() => conferirAlcada(), [conferirAlcada]);

    if (situacao === 'nao_exige') return null;

    const enviar = async () => {
        if (!motivoExige) return;
        setGravando(true);
        try {
            const r = await riskService.enviarParaAprovacao(risco, motivoExige);
            onRisco(r);
            showToast(`${r.codigo} enviado para aprovação.`);
        } catch (e) {
            showToast(textoDoErro(e, 'Não foi possível enviar para aprovação.'), 'error');
        } finally {
            setGravando(false);
        }
    };

    const aprovar = async () => {
        if (!pendente || !email) return;
        const ultimo = pendente.nivel === pendente.de;
        const ok = await confirm({
            title: `Aprovar ${risco.codigo}?`,
            message: `${risco.titulo}. ${motivoExige ?? ''} Você aprova o nível ${pendente.nivel} de ${pendente.de}` +
                (ultimo ? ' e o risco fica aprovado.' : '; o nível 2 ainda precisa aprovar.') +
                ' A aprovação fica registrada em seu nome, com data e hora.',
            variant: 'default',
            confirmLabel: `Aprovar nível ${pendente.nivel}`,
        });
        if (!ok) return;
        setGravando(true);
        try {
            const r = await riskService.aprovar(risco, pendente.nivel, email, observacao.trim() || undefined);
            setObservacao('');
            onRisco(r);
            showToast(r.approval_status === 'APROVADO' ? `${r.codigo} aprovado.` : `Nível ${pendente.nivel} aprovado. Falta o nível 2.`);
        } catch (e) {
            showToast(textoDoErro(e, 'Não foi possível aprovar.'), 'error');
        } finally {
            setGravando(false);
        }
    };

    const reprovar = async () => {
        if (!email) return;
        if (!motivoRep.trim()) { setErroRep('Informe o motivo da reprovação.'); document.getElementById('ra-motivo')?.focus(); return; }
        setGravando(true);
        try {
            const r = await riskService.reprovar(risco, email, motivoRep.trim());
            setReprovando(false);
            setMotivoRep('');
            onRisco(r);
            showToast(`${r.codigo} reprovado. O dono vê o motivo na ficha.`);
        } catch (e) {
            showToast(textoDoErro(e, 'Não foi possível reprovar.'), 'error');
        } finally {
            setGravando(false);
        }
    };

    const motivoSemEnvio = !podeEditar ? motivoSemEdicao : fichaSuja ? MOTIVO_FICHA_SUJA : null;
    const motivoSemDecisao = !email ? 'Sua sessão não tem e-mail: saia e entre de novo para aprovar.'
        : fichaSuja ? MOTIVO_FICHA_SUJA : null;

    const resumo = situacao === 'pendente' && pendente
        ? `aguardando o nível ${pendente.nivel} de ${pendente.de}`
        : situacao === 'aprovado' ? 'aprovado' : situacao === 'reprovado' ? 'reprovado' : 'exige aprovação, ainda não enviado';
    const corResumo = situacao === 'aprovado' ? 'text-emerald-700' : situacao === 'reprovado' ? 'text-red-700' : 'text-amber-700';

    return (
        <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4">
            <SecaoTitulo icon={BadgeCheck} titulo="Aprovação" />
            <p className={`text-sm font-medium ${corResumo}`}>{resumo.charAt(0).toUpperCase() + resumo.slice(1)}</p>
            {motivoExige && <p className="text-sm text-gray-700">{motivoExige}</p>}

            <Cadeia risco={risco} />

            {(situacao === 'falta_enviar' || situacao === 'reprovado') && (
                <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex" title={motivoSemEnvio ?? undefined}>
                        <button type="button" onClick={() => void enviar()} disabled={!!motivoSemEnvio || gravando} className={BOTAO_PRIMARIO}>
                            <Send className="w-[15px] h-[15px]" /> {situacao === 'reprovado' ? 'Reenviar para aprovação' : 'Enviar para aprovação'}
                        </button>
                    </span>
                    {motivoSemEnvio && <p className="text-xs text-gray-600">{motivoSemEnvio}</p>}
                </div>
            )}

            {situacao === 'pendente' && pendente && (
                <div className="space-y-3">
                    {erroAlcada ? (
                        <p className="text-sm text-red-700">
                            Não foi possível conferir quem aprova: {erroAlcada}.{' '}
                            <button type="button" onClick={() => conferirAlcada()} className="font-medium underline">Tentar de novo</button>
                        </p>
                    ) : !alcada ? (
                        <p className="text-sm text-gray-600">Conferindo quem aprova este nível…</p>
                    ) : (
                        <>
                            <p className="text-sm text-gray-700">
                                {alcada.nomes.length
                                    ? `Quem aprova o nível ${pendente.nivel}: ${juntarNomes(alcada.nomes)}.`
                                    : `Nível ${pendente.nivel} sem aprovador cadastrado: qualquer membro da organização aprova (Aprovações › Faixas, tipo "Risco").`}
                            </p>
                            {!alcada.pode ? (
                                <p className="text-sm text-gray-700">{motivoSemAlcada({ pode_aprovar: false, vez_de: alcada.nomes })}</p>
                            ) : reprovando ? (
                                <div className="space-y-4 border-t border-gray-100 pt-4">
                                    <div className="space-y-1.5">
                                        <label className={ROTULO} htmlFor="ra-motivo">Motivo da reprovação</label>
                                        <textarea id="ra-motivo" className={`${AREA} ${erroRep ? COM_ERRO : ''}`} value={motivoRep} aria-invalid={!!erroRep}
                                            onChange={e => { setMotivoRep(e.target.value); setErroRep(null); }}
                                            placeholder="Ex.: aceitar sem seguro não é aceitável; contratar seguro de responsabilidade civil e reenviar." />
                                        <ErroDoCampo id="ra-motivo-erro" erro={erroRep ?? undefined} />
                                    </div>
                                    <div className="flex flex-wrap items-center justify-end gap-2">
                                        <button type="button" onClick={() => { setReprovando(false); setErroRep(null); }} className={BOTAO_SECUNDARIO}>Cancelar</button>
                                        <span className="inline-flex" title={motivoSemDecisao ?? undefined}>
                                            <button type="button" onClick={() => void reprovar()} disabled={!!motivoSemDecisao || gravando} className={BOTAO_PERIGO}>
                                                <ThumbsDown className="w-[15px] h-[15px]" /> Reprovar risco
                                            </button>
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3 border-t border-gray-100 pt-4">
                                    <div className="space-y-1.5">
                                        <label className={ROTULO} htmlFor="ra-obs">Observação (opcional)</label>
                                        <input id="ra-obs" type="text" className={CAMPO} value={observacao} onChange={e => setObservacao(e.target.value)}
                                            placeholder="Ex.: aceito com revisão mensal do dono" />
                                    </div>
                                    <div className="flex flex-wrap items-center justify-end gap-2">
                                        {motivoSemDecisao && <p className="text-xs text-gray-600 mr-auto">{motivoSemDecisao}</p>}
                                        <span className="inline-flex" title={motivoSemDecisao ?? undefined}>
                                            <button type="button" onClick={() => setReprovando(true)} disabled={!!motivoSemDecisao || gravando} className={BOTAO_PERIGO}>
                                                <ThumbsDown className="w-[15px] h-[15px]" /> Reprovar
                                            </button>
                                        </span>
                                        <span className="inline-flex" title={motivoSemDecisao ?? undefined}>
                                            <button type="button" onClick={() => void aprovar()} disabled={!!motivoSemDecisao || gravando} className={BOTAO_PRIMARIO}>
                                                <ThumbsUp className="w-[15px] h-[15px]" /> Aprovar nível {pendente.nivel}
                                            </button>
                                        </span>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default RiscoAlcada;
