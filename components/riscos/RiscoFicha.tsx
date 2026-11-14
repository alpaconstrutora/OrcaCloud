import React from 'react';
import { Archive, FileText, HardHat, Lock, MapPin, RotateCcw, ShieldCheck, Trash2, UserCheck } from 'lucide-react';
import type {
    ProjectRisk, ProjectRiskInput, RiskAction, RiskAuditLog, RiskCategoryRow, RiskDimensao, RiskEscopo, RiskEstrategia,
    RiskEvaluation, RiskFase, RiskMatrixConfig, RiskStatus,
} from '../../types/risk';
import { RISK_DIMENSOES, RISK_FASES, RISK_ROTULO } from '../../types/risk';
import { riskService, type DocumentoSst } from '../../services/riskService';
import { errorMessage } from '../../hooks/useOrgContext';
import { useToast } from '../../hooks/useToast';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { useStore } from '../../store/useStore';
import { useConfirm } from '../ui/confirm';
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetPanel, SheetTitle } from '../ui/sheet';
import { TabsBar } from '../ui/TabsBar';
import SaveStatus from '../ui/SaveStatus';
import { SecaoTitulo } from '../ui/SecaoTitulo';
import { formatDateBR } from '../ui/Format';
import { faixasDe, hojeLocalISO, nivelNaOrg } from '../../utils/riskPainel';
import { RiscoAvaliacoes } from './RiscoAvaliacoes';
import { RiscoAcoes } from './RiscoAcoes';
import { RiscoHistorico } from './RiscoHistorico';
import {
    AREA, BOTAO_PERIGO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CAMPO, COM_ERRO, ErroDoCampo, NivelTexto, ROTULO,
    useEuNaOrg, useMembrosComConta, useObrasDaOrg,
} from './riscosUi';

/**
 * Ficha do risco em painel lateral (F1.6/F1.7/F1.8/F1.11/F1.12 de
 * docs/planos/2026-11-13-modulo-riscos.md; UI_PATTERNS §3: ver/editar/criar = Sheet).
 *
 * Abas internas: Ficha (Identificação · Contexto · Responsabilidade · Resposta ·
 * vínculo SST, um formulário só — §30) · Avaliações · Ações · Histórico. Nenhum
 * drawer aninhado: avaliação e ação abrem o formulário DENTRO da ficha.
 *
 * §25: editar e salvar NÃO fecha (grava + "Salvo"); criar fecha — o guia é
 * explícito ("criar → grava → toast → fecha"). Saída com pendência pergunta
 * (`useUnsavedChanges` + `dirty` do Sheet; o X do cabeçalho passa pelo
 * `confirmDiscard` porque não passa pelo `requestClose` do Sheet).
 *
 * CA03: salvar sem causa, evento, consequência, contexto (o campo do escopo), dono
 * ou próxima revisão é bloqueado com erro POR CAMPO e foco no primeiro (UI_PATTERNS §6.4).
 */
export type SecaoFicha = 'ficha' | 'avaliacoes' | 'acoes' | 'historico';

export type AberturaFicha =
    | { modo: 'novo'; orgId: string; inicial: ProjectRiskInput; seq: number }
    | { modo: 'editar'; risco: ProjectRisk; secao?: SecaoFicha };

export interface EmpreendimentoCurto { id: string; organization_id: string; name: string }
export interface ContratoCurto { id: string; organization_id: string; number: string | null; title: string | null }

interface Props {
    abertura: AberturaFicha | null;
    onClose: () => void;
    podeEditar: boolean;
    motivoSemEdicao: string;
    categorias: RiskCategoryRow[];
    empreendimentos: EmpreendimentoCurto[];
    contratos: ContratoCurto[];
    faixasPorOrg: Record<string, RiskMatrixConfig>;
    onSalvo: (r: ProjectRisk) => void;
    onExcluido: (r: ProjectRisk) => void;
    onAcoesDoRisco: (riskId: string, acoes: RiskAction[]) => void;
}

/** Ficha nova "do zero" (o catálogo usa `fichaDoCatalogo`, com o mesmo `base`). */
export function fichaVazia(base: Pick<ProjectRiskInput, 'owner_user_id' | 'owner_nome'>): ProjectRiskInput {
    return {
        catalog_id: null, catalog_codigo: null, catalog_versao: null, category_id: null, tipo: 'ameaca',
        titulo: '', causa: '', evento: '', consequencia: '', tags: [], dimensoes: [],
        escopo: 'obra', empreendimento_id: null, project_id: null, contract_id: null,
        frente: null, localizacao: null, fase: null, partes_afetadas: null,
        avaliador_user_id: null, aprovador_user_id: null,
        data_identificacao: hojeLocalISO(), proxima_revisao: '',
        controles_existentes: null, estrategia: null, plano_resposta: null, contingencia: null, justificativa_aceite: null,
        status: 'identificado', encerramento_motivo: null, gatilho_critico: false, gatilho_motivo: null,
        sst_document_tipo: null, sst_document_id: null,
        ...base,
    };
}

const inputDoRisco = (r: ProjectRisk): ProjectRiskInput => ({
    catalog_id: r.catalog_id, catalog_codigo: r.catalog_codigo, catalog_versao: r.catalog_versao, category_id: r.category_id,
    tipo: r.tipo, titulo: r.titulo, causa: r.causa, evento: r.evento, consequencia: r.consequencia, tags: [...r.tags],
    dimensoes: [...r.dimensoes], escopo: r.escopo, empreendimento_id: r.empreendimento_id, project_id: r.project_id,
    contract_id: r.contract_id, frente: r.frente, localizacao: r.localizacao, fase: r.fase, partes_afetadas: r.partes_afetadas,
    owner_user_id: r.owner_user_id, owner_nome: r.owner_nome, avaliador_user_id: r.avaliador_user_id,
    aprovador_user_id: r.aprovador_user_id, data_identificacao: r.data_identificacao, proxima_revisao: r.proxima_revisao,
    controles_existentes: r.controles_existentes, estrategia: r.estrategia, plano_resposta: r.plano_resposta,
    contingencia: r.contingencia, justificativa_aceite: r.justificativa_aceite, status: r.status,
    encerramento_motivo: r.encerramento_motivo, gatilho_critico: r.gatilho_critico, gatilho_motivo: r.gatilho_motivo,
    sst_document_tipo: r.sst_document_tipo, sst_document_id: r.sst_document_id,
});

const vazioParaNull = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null);

/** Ordem VISUAL dos campos obrigatórios — o foco vai para o primeiro com erro. */
const ORDEM_DOS_ERROS = ['titulo', 'causa', 'evento', 'consequencia', 'gatilho_motivo', 'contexto', 'owner', 'proxima', 'justificativa_aceite'] as const;

export function validarFicha(f: ProjectRiskInput): Partial<Record<typeof ORDEM_DOS_ERROS[number], string>> {
    const e: Partial<Record<typeof ORDEM_DOS_ERROS[number], string>> = {};
    if (!f.titulo.trim()) e.titulo = 'Dê um título curto ao risco.';
    if (!f.causa.trim()) e.causa = 'Descreva a causa: o que pode provocar o evento.';
    if (!f.evento.trim()) e.evento = 'Descreva o evento de risco.';
    if (!f.consequencia.trim()) e.consequencia = 'Descreva a consequência, se o evento acontecer.';
    if (f.gatilho_critico && !f.gatilho_motivo?.trim()) e.gatilho_motivo = 'Diga por que o gatilho crítico vale para este risco.';
    if (f.escopo === 'obra' && !f.project_id) e.contexto = 'Escolha a obra.';
    if (f.escopo === 'empreendimento' && !f.empreendimento_id) e.contexto = 'Escolha o empreendimento.';
    if (f.escopo === 'contrato' && !f.contract_id) e.contexto = 'Escolha o contrato.';
    if (!f.owner_user_id) e.owner = 'Escolha o dono do risco.';
    if (!f.proxima_revisao) e.proxima = 'Informe a data da próxima revisão.';
    if (f.estrategia === 'aceitar' && !f.justificativa_aceite?.trim()) e.justificativa_aceite = 'Aceitar o risco exige justificativa.';
    return e;
}

const STATUS_EDITAVEIS: RiskStatus[] = ['identificado', 'em_avaliacao', 'em_tratamento', 'monitorado'];

/** Envolve um botão desligado para o motivo aparecer no hover (o `disabled` engole o `title`). */
const ComMotivo: React.FC<{ motivo?: string; children: React.ReactNode }> = ({ motivo, children }) =>
    <span className="inline-flex" title={motivo}>{children}</span>;

export const RiscoFicha: React.FC<Props> = (props) => {
    if (!props.abertura) return null;
    const chave = props.abertura.modo === 'novo' ? `novo:${props.abertura.orgId}:${props.abertura.seq}` : props.abertura.risco.id;
    return <FichaConteudo key={chave} {...props} abertura={props.abertura} />;
};

const FichaConteudo: React.FC<Props & { abertura: AberturaFicha }> = ({
    abertura, onClose, podeEditar, motivoSemEdicao, categorias, empreendimentos, contratos, faixasPorOrg,
    onSalvo, onExcluido, onAcoesDoRisco,
}) => {
    const { showToast } = useToast();
    const confirm = useConfirm();
    const { dirty, markDirty, markSaved, confirmDiscard } = useUnsavedChanges();
    const organizations = useStore(s => s.organizations);

    const [risco, setRisco] = React.useState<ProjectRisk | null>(abertura.modo === 'editar' ? abertura.risco : null);
    const orgId = risco?.organization_id ?? (abertura.modo === 'novo' ? abertura.orgId : '');
    const membros = useMembrosComConta(orgId);
    const eu = useEuNaOrg(orgId);
    const obras = useObrasDaOrg(orgId);
    const empsDaOrg = React.useMemo(() => empreendimentos.filter(e => e.organization_id === orgId), [empreendimentos, orgId]);
    const contratosDaOrg = React.useMemo(() => contratos.filter(c => c.organization_id === orgId), [contratos, orgId]);
    const faixas = faixasDe(faixasPorOrg, orgId);

    const [form, setForm] = React.useState<ProjectRiskInput>(() => (abertura.modo === 'editar' ? inputDoRisco(abertura.risco) : abertura.inicial));
    const [tagsTexto, setTagsTexto] = React.useState(() => form.tags.join(', '));
    const [erros, setErros] = React.useState<Partial<Record<typeof ORDEM_DOS_ERROS[number], string>>>({});
    const [salvando, setSalvando] = React.useState(false);
    const [savedAt, setSavedAt] = React.useState<number | null>(null);
    const [aba, setAba] = React.useState<SecaoFicha>(abertura.modo === 'editar' ? abertura.secao ?? 'ficha' : 'ficha');

    const [avaliacoes, setAvaliacoes] = React.useState<RiskEvaluation[]>([]);
    const [carregandoAval, setCarregandoAval] = React.useState(abertura.modo === 'editar');
    const [acoes, setAcoes] = React.useState<RiskAction[]>([]);
    const [carregandoAcoes, setCarregandoAcoes] = React.useState(abertura.modo === 'editar');
    const [historico, setHistorico] = React.useState<RiskAuditLog[]>([]);
    const [carregandoHist, setCarregandoHist] = React.useState(false);
    const [docsSst, setDocsSst] = React.useState<DocumentoSst[]>([]);

    const [encerrando, setEncerrando] = React.useState(false);
    const [motivoEnc, setMotivoEnc] = React.useState('');
    const [erroEnc, setErroEnc] = React.useState<string | null>(null);

    // O gatilho crítico vem do catálogo e só pode ser LIGADO (CA04): desligar tiraria o risco do painel de críticos.
    const gatilhoTravado = abertura.modo === 'editar' ? abertura.risco.gatilho_critico : abertura.inicial.gatilho_critico;
    const somenteLeitura = !podeEditar;
    const encerrado = risco?.status === 'encerrado';
    const riskId = risco?.id ?? null;

    // Avaliações e ações carregam na abertura (contam nas abas); o histórico, quando a aba abre.
    React.useEffect(() => {
        if (!riskId) return;
        let vivo = true;
        riskService.listarAvaliacoes(riskId)
            .then(a => { if (vivo) setAvaliacoes(a); })
            .catch(err => { if (vivo) showToast(errorMessage(err, 'Não foi possível carregar as avaliações.'), 'error'); })
            .finally(() => { if (vivo) setCarregandoAval(false); });
        riskService.listarAcoes({ riskId })
            .then(a => { if (vivo) setAcoes(a); })
            .catch(err => { if (vivo) showToast(errorMessage(err, 'Não foi possível carregar as ações.'), 'error'); })
            .finally(() => { if (vivo) setCarregandoAcoes(false); });
        return () => { vivo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [riskId]);

    const carregarHistorico = React.useCallback(() => {
        if (!riskId) return;
        setCarregandoHist(true);
        riskService.listarHistorico(riskId)
            .then(setHistorico)
            .catch(err => showToast(errorMessage(err, 'Não foi possível carregar o histórico.'), 'error'))
            .finally(() => setCarregandoHist(false));
    }, [riskId, showToast]);
    React.useEffect(() => { if (aba === 'historico') carregarHistorico(); }, [aba, carregarHistorico]);

    // Vínculo SST (F1.12): só risco da categoria R14 com escopo obra.
    const categoria = categorias.find(c => c.id === form.category_id) ?? null;
    const sstAplica = categoria?.codigo === 'R14' && form.escopo === 'obra' && !!form.project_id;
    React.useEffect(() => {
        if (!sstAplica || !form.project_id || !orgId) { setDocsSst([]); return; }
        let vivo = true;
        riskService.listarDocumentosSst(orgId, form.project_id)
            .then(d => { if (vivo) setDocsSst(d); })
            .catch(() => { if (vivo) setDocsSst([]); });
        return () => { vivo = false; };
    }, [sstAplica, form.project_id, orgId]);

    const set = <K extends keyof ProjectRiskInput>(k: K, v: ProjectRiskInput[K]) => { setForm(p => ({ ...p, [k]: v })); markDirty(); };

    const handleBack = async () => { if (await confirmDiscard()) onClose(); };

    const normalizar = (): ProjectRiskInput => {
        const dono = membros.find(m => m.userId === form.owner_user_id);
        return {
            ...form,
            titulo: form.titulo.trim(), causa: form.causa.trim(), evento: form.evento.trim(), consequencia: form.consequencia.trim(),
            tags: tagsTexto.split(',').map(t => t.trim()).filter(Boolean),
            category_id: form.category_id || null,
            empreendimento_id: form.escopo === 'empreendimento' ? form.empreendimento_id : null,
            project_id: form.escopo === 'obra' ? form.project_id : null,
            contract_id: form.escopo === 'contrato' ? form.contract_id : null,
            frente: vazioParaNull(form.frente), localizacao: vazioParaNull(form.localizacao), partes_afetadas: vazioParaNull(form.partes_afetadas),
            fase: form.fase || null,
            owner_nome: dono?.name ?? form.owner_nome ?? null,
            avaliador_user_id: form.avaliador_user_id || null, aprovador_user_id: form.aprovador_user_id || null,
            controles_existentes: vazioParaNull(form.controles_existentes), estrategia: form.estrategia || null,
            plano_resposta: vazioParaNull(form.plano_resposta), contingencia: vazioParaNull(form.contingencia),
            justificativa_aceite: vazioParaNull(form.justificativa_aceite),
            gatilho_motivo: form.gatilho_critico ? vazioParaNull(form.gatilho_motivo) : null,
            sst_document_tipo: sstAplica ? form.sst_document_tipo : null,
            sst_document_id: sstAplica ? form.sst_document_id : null,
        };
    };

    const salvar = async () => {
        if (somenteLeitura) return;
        const e = validarFicha(form);
        setErros(e);
        const primeiro = ORDEM_DOS_ERROS.find(k => e[k]);
        if (primeiro) {
            setAba('ficha');
            requestAnimationFrame(() => document.getElementById(`rf-${primeiro}`)?.focus());
            return;
        }
        setSalvando(true);
        try {
            if (!risco) {
                const criado = await riskService.criarRisco(orgId, normalizar());
                markSaved();
                onSalvo(criado);
                showToast(`Risco ${criado.codigo} registrado. Abra a ficha para registrar a avaliação inerente.`);
                onClose();
                return;
            }
            const salvo = await riskService.atualizarRisco(risco, normalizar());
            setRisco(salvo);
            markSaved();
            setSavedAt(Date.now());
            onSalvo(salvo);
            showToast('Alterações salvas.');
        } catch (err) {
            showToast(errorMessage(err, 'Não foi possível salvar o risco.'), 'error');
        } finally {
            setSalvando(false);
        }
    };

    const encerrar = async () => {
        if (!risco) return;
        if (!motivoEnc.trim()) { setErroEnc('Informe o motivo do encerramento.'); document.getElementById('rf-motivo-enc')?.focus(); return; }
        try {
            const r = await riskService.atualizarRisco(risco, { status: 'encerrado', encerramento_motivo: motivoEnc.trim() });
            setRisco(r);
            setForm(p => ({ ...p, status: r.status, encerramento_motivo: r.encerramento_motivo }));
            setEncerrando(false);
            onSalvo(r);
            showToast(`Risco ${r.codigo} encerrado.`);
        } catch (err) {
            showToast(errorMessage(err, 'Não foi possível encerrar o risco.'), 'error');
        }
    };

    const reabrir = async () => {
        if (!risco) return;
        const ok = await confirm({
            title: `Reabrir ${risco.codigo}?`,
            message: 'O risco volta para "Identificado" e entra de novo no painel e nos alertas. O motivo do encerramento continua no histórico.',
            variant: 'warning', confirmLabel: 'Reabrir risco',
        });
        if (!ok) return;
        try {
            const r = await riskService.atualizarRisco(risco, { status: 'identificado' });
            setRisco(r);
            setForm(p => ({ ...p, status: r.status }));
            onSalvo(r);
            showToast(`Risco ${r.codigo} reaberto.`);
        } catch (err) {
            showToast(errorMessage(err, 'Não foi possível reabrir o risco.'), 'error');
        }
    };

    const excluir = async () => {
        if (!risco) return;
        if (risco.ultima_avaliacao_em || avaliacoes.length > 0) {
            const encerrarEmVez = await confirm({
                title: 'Este risco não pode ser excluído',
                message: 'Ele tem avaliação registrada, e avaliação é histórico: não se apaga. Para tirá-lo da gestão, encerre o risco informando o motivo.',
                variant: 'warning', confirmLabel: 'Encerrar o risco', cancelLabel: 'Voltar',
            });
            if (encerrarEmVez && !encerrado) { setAba('ficha'); setEncerrando(true); }
            return;
        }
        const ok = await confirm({
            title: `Excluir ${risco.codigo}?`,
            message: 'Use só para risco registrado por engano. As ações de tratamento saem junto; a exclusão fica na auditoria.',
            variant: 'danger', confirmLabel: 'Excluir risco',
        });
        if (!ok) return;
        try {
            await riskService.excluirRisco(risco);
            markSaved();
            onExcluido(risco);
            showToast(`Risco ${risco.codigo} excluído.`);
            onClose();
        } catch (err) {
            showToast(errorMessage(err, 'Não foi possível excluir o risco.'), 'error');
        }
    };

    const acoesMudaram = (lista: RiskAction[]) => { setAcoes(lista); if (risco) onAcoesDoRisco(risco.id, lista); };

    const nivel = risco ? nivelNaOrg(risco, faixasPorOrg) : null;
    const orgNome = organizations.find(o => o.id === orgId)?.name;
    const temErro = (k: typeof ORDEM_DOS_ERROS[number]) => (erros[k] ? COM_ERRO : '');
    const ariaErro = (k: typeof ORDEM_DOS_ERROS[number]) => ({ 'aria-invalid': !!erros[k], 'aria-describedby': erros[k] ? `rf-${k}-erro` : undefined });
    const donoFora = !!form.owner_user_id && !membros.some(m => m.userId === form.owner_user_id);
    const obraFora = !!form.project_id && !obras.some(o => o.id === form.project_id);

    const tabs = [
        { id: 'ficha' as const, label: 'Ficha' },
        { id: 'avaliacoes' as const, label: 'Avaliações', badge: avaliacoes.length || undefined, badgeTitulo: 'avaliações registradas' },
        { id: 'acoes' as const, label: 'Ações', badge: acoes.length || undefined, badgeTitulo: 'ações de tratamento' },
        { id: 'historico' as const, label: 'Histórico' },
    ];

    const motivoSalvar = somenteLeitura ? motivoSemEdicao : risco && !dirty ? 'Nada foi alterado desde o último salvamento.' : undefined;

    return (
        <Sheet open onClose={onClose} size="2xl" dirty={dirty}>
            <SheetHeader onClose={handleBack}>
                <SheetTitle>{risco ? `${risco.codigo} · ${risco.titulo}` : 'Novo risco'}</SheetTitle>
                <SheetDescription>
                    {risco ? (
                        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                            <NivelTexto nivel={nivel} gatilho={risco.gatilho_critico} />
                            <span>· {RISK_ROTULO.status[risco.status]}</span>
                            {orgNome && <span>· {orgNome}</span>}
                        </span>
                    ) : (
                        <>
                            {form.catalog_codigo ? `A partir do catálogo ${form.catalog_codigo} (versão ${form.catalog_versao}). ` : ''}
                            {orgNome ? `Organização: ${orgNome}.` : ''}
                        </>
                    )}
                </SheetDescription>
            </SheetHeader>

            <SheetPanel className="px-6 py-5 space-y-5">
                {risco ? (
                    <TabsBar bare tabs={tabs} value={aba} onChange={setAba} />
                ) : (
                    <p className="text-sm text-gray-600">Avaliações, ações e histórico ficam disponíveis depois de registrar o risco.</p>
                )}

                {somenteLeitura && (
                    <div className="flex items-start gap-2 text-sm text-gray-700 bg-gray-50 border border-gray-100 rounded-[10px] px-4 py-3">
                        <Lock className="w-4 h-4 shrink-0 mt-0.5 text-gray-500" aria-hidden="true" />
                        <p>{motivoSemEdicao}</p>
                    </div>
                )}

                {aba === 'ficha' && (
                    <>
                        {encerrado && risco && (
                            <div className="flex flex-wrap items-start justify-between gap-3 bg-gray-50 border border-gray-100 rounded-[10px] px-4 py-3">
                                <p className="text-sm text-gray-700">
                                    Encerrado em {formatDateBR(risco.encerrado_em)}. <span className="text-gray-500">Motivo:</span> {risco.encerramento_motivo}
                                </p>
                                {!somenteLeitura && (
                                    <button type="button" onClick={() => void reabrir()} className={BOTAO_SECUNDARIO}>
                                        <RotateCcw className="w-[15px] h-[15px]" /> Reabrir
                                    </button>
                                )}
                            </div>
                        )}

                        {encerrando && risco && (
                            <div className="bg-white p-6 rounded-[10px] border border-red-100 shadow-sm space-y-4">
                                <SecaoTitulo icon={Archive} titulo="Encerrar o risco" resumo="sai do painel e dos alertas; tudo fica no histórico" />
                                <div className="space-y-1.5">
                                    <label className={ROTULO} htmlFor="rf-motivo-enc">Motivo do encerramento</label>
                                    <textarea id="rf-motivo-enc" className={`${AREA} ${erroEnc ? COM_ERRO : ''}`} value={motivoEnc}
                                        aria-invalid={!!erroEnc} onChange={e => { setMotivoEnc(e.target.value); setErroEnc(null); }}
                                        placeholder="Ex.: fundação concluída e laudo de recalques dentro do limite." />
                                    <ErroDoCampo id="rf-motivo-enc-erro" erro={erroEnc ?? undefined} />
                                </div>
                                <div className="flex items-center justify-end gap-2">
                                    <button type="button" onClick={() => { setEncerrando(false); setErroEnc(null); }} className={BOTAO_SECUNDARIO}>Cancelar</button>
                                    <button type="button" onClick={() => void encerrar()} className={BOTAO_PERIGO}>
                                        <Archive className="w-[15px] h-[15px]" /> Encerrar risco
                                    </button>
                                </div>
                            </div>
                        )}

                        <fieldset disabled={somenteLeitura} className="min-w-0">
                            <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-8">
                                {/* ── Identificação ── */}
                                <div className="space-y-4">
                                    <SecaoTitulo icon={FileText} titulo="Identificação" />
                                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                        <div className="space-y-1.5 col-span-2">
                                            <label className={ROTULO} htmlFor="rf-titulo">Título</label>
                                            <input id="rf-titulo" type="text" className={`${CAMPO} ${temErro('titulo')}`} value={form.titulo} {...ariaErro('titulo')}
                                                onChange={e => set('titulo', e.target.value)} placeholder="Ex.: Recalque diferencial na torre B" />
                                            <ErroDoCampo id="rf-titulo-erro" erro={erros.titulo} />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className={ROTULO} htmlFor="rf-tipo">Tipo</label>
                                            <select id="rf-tipo" className={CAMPO} value={form.tipo} onChange={e => set('tipo', e.target.value as ProjectRiskInput['tipo'])}>
                                                <option value="ameaca">Ameaça</option>
                                                <option value="oportunidade">Oportunidade</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className={ROTULO} htmlFor="rf-categoria">Categoria</label>
                                            <select id="rf-categoria" className={CAMPO} value={form.category_id ?? ''} onChange={e => set('category_id', e.target.value || null)}>
                                                <option value="">Sem categoria</option>
                                                {categorias.map(c => <option key={c.id} value={c.id}>{c.codigo} · {c.nome}</option>)}
                                            </select>
                                        </div>
                                        <div className="space-y-1.5 col-span-2">
                                            <label className={ROTULO} htmlFor="rf-causa">Causa</label>
                                            <textarea id="rf-causa" className={`${AREA} ${temErro('causa')}`} value={form.causa} {...ariaErro('causa')}
                                                onChange={e => set('causa', e.target.value)} placeholder="O que pode provocar o evento." />
                                            <ErroDoCampo id="rf-causa-erro" erro={erros.causa} />
                                        </div>
                                        <div className="space-y-1.5 col-span-2">
                                            <label className={ROTULO} htmlFor="rf-evento">Evento</label>
                                            <textarea id="rf-evento" className={`${AREA} ${temErro('evento')}`} value={form.evento} {...ariaErro('evento')}
                                                onChange={e => set('evento', e.target.value)} placeholder="O que pode acontecer." />
                                            <ErroDoCampo id="rf-evento-erro" erro={erros.evento} />
                                        </div>
                                        <div className="space-y-1.5 col-span-2">
                                            <label className={ROTULO} htmlFor="rf-consequencia">Consequência</label>
                                            <textarea id="rf-consequencia" className={`${AREA} ${temErro('consequencia')}`} value={form.consequencia} {...ariaErro('consequencia')}
                                                onChange={e => set('consequencia', e.target.value)} placeholder="O que acontece se o evento se materializar." />
                                            <ErroDoCampo id="rf-consequencia-erro" erro={erros.consequencia} />
                                        </div>
                                        <div className="space-y-1.5 col-span-2">
                                            <span className={ROTULO}>Dimensões afetadas</span>
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
                                                {RISK_DIMENSOES.map(d => (
                                                    <label key={d} className="inline-flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                                                        <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-blue-600"
                                                            checked={form.dimensoes.includes(d)}
                                                            onChange={e => set('dimensoes', e.target.checked ? [...form.dimensoes, d] : form.dimensoes.filter(x => x !== d) as RiskDimensao[])} />
                                                        {RISK_ROTULO.dimensao[d]}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="space-y-1.5 col-span-2">
                                            <label className={ROTULO} htmlFor="rf-tags">Tags</label>
                                            <input id="rf-tags" type="text" className={CAMPO} value={tagsTexto} placeholder="Separe por vírgula: subsolo, chuva, fornecedor único"
                                                onChange={e => { setTagsTexto(e.target.value); markDirty(); }} />
                                        </div>
                                        <div className="space-y-1.5 col-span-2">
                                            <label className={`inline-flex items-center gap-2 text-sm text-gray-800 ${gatilhoTravado ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                                                title={gatilhoTravado ? 'O gatilho crítico veio do catálogo e só pode ser ligado: desligar tiraria o risco dos críticos.' : undefined}>
                                                <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-red-600" checked={form.gatilho_critico}
                                                    disabled={gatilhoTravado}
                                                    onChange={e => set('gatilho_critico', e.target.checked)} />
                                                Gatilho crítico — tratar como crítico qualquer que seja a pontuação
                                            </label>
                                            {gatilhoTravado && <p className="text-xs text-gray-600">Veio do catálogo e só pode ser ligado: desligar tiraria o risco do painel de críticos.</p>}
                                        </div>
                                        {form.gatilho_critico && (
                                            <div className="space-y-1.5 col-span-2">
                                                <label className={ROTULO} htmlFor="rf-gatilho_motivo">Motivo do gatilho</label>
                                                <input id="rf-gatilho_motivo" type="text" className={`${CAMPO} ${temErro('gatilho_motivo')}`} value={form.gatilho_motivo ?? ''}
                                                    {...ariaErro('gatilho_motivo')} onChange={e => set('gatilho_motivo', e.target.value)}
                                                    placeholder="Ex.: risco à vida, obrigação legal, colapso estrutural" />
                                                <ErroDoCampo id="rf-gatilho_motivo-erro" erro={erros.gatilho_motivo} />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* ── Contexto ── */}
                                <div className="space-y-4">
                                    <SecaoTitulo icon={MapPin} titulo="Contexto" />
                                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                        <div className="space-y-1.5">
                                            <label className={ROTULO} htmlFor="rf-escopo">Escopo</label>
                                            <select id="rf-escopo" className={CAMPO} value={form.escopo} onChange={e => set('escopo', e.target.value as RiskEscopo)}>
                                                {(Object.keys(RISK_ROTULO.escopo) as RiskEscopo[]).map(s => <option key={s} value={s}>{RISK_ROTULO.escopo[s]}</option>)}
                                            </select>
                                        </div>
                                        {form.escopo === 'obra' && (
                                            <div className="space-y-1.5">
                                                <label className={ROTULO} htmlFor="rf-contexto">Obra</label>
                                                <select id="rf-contexto" className={`${CAMPO} ${temErro('contexto')}`} value={form.project_id ?? ''} {...ariaErro('contexto')}
                                                    onChange={e => { set('project_id', e.target.value || null); set('sst_document_id', null); set('sst_document_tipo', null); }}>
                                                    <option value="">Escolha a obra…</option>
                                                    {obraFora && <option value={form.project_id ?? ''}>Obra atual (fora da lista desta organização)</option>}
                                                    {obras.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                                                </select>
                                                <ErroDoCampo id="rf-contexto-erro" erro={erros.contexto} />
                                                {obras.length === 0 && <p className="text-xs text-gray-600">Esta organização não tem obra cadastrada.</p>}
                                            </div>
                                        )}
                                        {form.escopo === 'empreendimento' && (
                                            <div className="space-y-1.5">
                                                <label className={ROTULO} htmlFor="rf-contexto">Empreendimento</label>
                                                <select id="rf-contexto" className={`${CAMPO} ${temErro('contexto')}`} value={form.empreendimento_id ?? ''} {...ariaErro('contexto')}
                                                    onChange={e => set('empreendimento_id', e.target.value || null)}>
                                                    <option value="">Escolha o empreendimento…</option>
                                                    {form.empreendimento_id && !empsDaOrg.some(x => x.id === form.empreendimento_id) && <option value={form.empreendimento_id}>Empreendimento atual (fora da lista)</option>}
                                                    {empsDaOrg.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                                                </select>
                                                <ErroDoCampo id="rf-contexto-erro" erro={erros.contexto} />
                                            </div>
                                        )}
                                        {form.escopo === 'contrato' && (
                                            <div className="space-y-1.5">
                                                <label className={ROTULO} htmlFor="rf-contexto">Contrato</label>
                                                <select id="rf-contexto" className={`${CAMPO} ${temErro('contexto')}`} value={form.contract_id ?? ''} {...ariaErro('contexto')}
                                                    onChange={e => set('contract_id', e.target.value || null)}>
                                                    <option value="">Escolha o contrato…</option>
                                                    {form.contract_id && !contratosDaOrg.some(x => x.id === form.contract_id) && <option value={form.contract_id}>Contrato atual (fora da lista)</option>}
                                                    {contratosDaOrg.map(x => <option key={x.id} value={x.id}>{[x.number, x.title].filter(Boolean).join(' · ') || 'Contrato sem número'}</option>)}
                                                </select>
                                                <ErroDoCampo id="rf-contexto-erro" erro={erros.contexto} />
                                            </div>
                                        )}
                                        <div className="space-y-1.5">
                                            <label className={ROTULO} htmlFor="rf-fase">Fase</label>
                                            <select id="rf-fase" className={CAMPO} value={form.fase ?? ''} onChange={e => set('fase', (e.target.value || null) as RiskFase | null)}>
                                                <option value="">Sem fase</option>
                                                {RISK_FASES.map(f => <option key={f} value={f}>{RISK_ROTULO.fase[f]}</option>)}
                                            </select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className={ROTULO} htmlFor="rf-frente">Frente de serviço</label>
                                            <input id="rf-frente" type="text" className={CAMPO} value={form.frente ?? ''} onChange={e => set('frente', e.target.value)} placeholder="Ex.: contenção, subsolo 2" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className={ROTULO} htmlFor="rf-localizacao">Localização</label>
                                            <input id="rf-localizacao" type="text" className={CAMPO} value={form.localizacao ?? ''} onChange={e => set('localizacao', e.target.value)} placeholder="Ex.: divisa norte, eixo C" />
                                        </div>
                                        <div className="space-y-1.5 col-span-2">
                                            <label className={ROTULO} htmlFor="rf-partes">Partes afetadas</label>
                                            <input id="rf-partes" type="text" className={CAMPO} value={form.partes_afetadas ?? ''} onChange={e => set('partes_afetadas', e.target.value)} placeholder="Ex.: vizinho do lote 12, equipe de escavação" />
                                        </div>
                                    </div>
                                </div>

                                {/* ── Responsabilidade ── */}
                                <div className="space-y-4">
                                    <SecaoTitulo icon={UserCheck} titulo="Responsabilidade" />
                                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                        <div className="space-y-1.5">
                                            <label className={ROTULO} htmlFor="rf-owner">Dono do risco</label>
                                            <select id="rf-owner" className={`${CAMPO} ${temErro('owner')}`} value={form.owner_user_id} {...ariaErro('owner')}
                                                onChange={e => set('owner_user_id', e.target.value)}>
                                                <option value="">Escolha…</option>
                                                {donoFora && <option value={form.owner_user_id}>{form.owner_nome ?? 'Dono atual'} (fora da lista)</option>}
                                                {membros.map(m => <option key={m.userId} value={m.userId}>{m.name}{eu?.userId === m.userId ? ' (você)' : ''}</option>)}
                                            </select>
                                            <ErroDoCampo id="rf-owner-erro" erro={erros.owner} />
                                            {membros.length === 0 && <p className="text-xs text-gray-600">Nenhum membro desta organização tem conta de acesso — convite sem conta não pode ser dono.</p>}
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className={ROTULO} htmlFor="rf-avaliador">Avaliador</label>
                                            <select id="rf-avaliador" className={CAMPO} value={form.avaliador_user_id ?? ''} onChange={e => set('avaliador_user_id', e.target.value || null)}>
                                                <option value="">Ninguém definido</option>
                                                {membros.map(m => <option key={m.userId} value={m.userId}>{m.name}</option>)}
                                            </select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className={ROTULO} htmlFor="rf-aprovador">Aprovador</label>
                                            <select id="rf-aprovador" className={CAMPO} value={form.aprovador_user_id ?? ''} onChange={e => set('aprovador_user_id', e.target.value || null)}>
                                                <option value="">Ninguém definido</option>
                                                {membros.map(m => <option key={m.userId} value={m.userId}>{m.name}</option>)}
                                            </select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className={ROTULO} htmlFor="rf-identificacao">Data de identificação</label>
                                            <input id="rf-identificacao" type="date" className={CAMPO} value={form.data_identificacao}
                                                onChange={e => set('data_identificacao', e.target.value || hojeLocalISO())} />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className={ROTULO} htmlFor="rf-proxima">Próxima revisão</label>
                                            <input id="rf-proxima" type="date" className={`${CAMPO} ${temErro('proxima')}`} value={form.proxima_revisao} {...ariaErro('proxima')}
                                                onChange={e => set('proxima_revisao', e.target.value)} />
                                            <ErroDoCampo id="rf-proxima-erro" erro={erros.proxima} />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className={ROTULO} htmlFor="rf-status">Status</label>
                                            {STATUS_EDITAVEIS.includes(form.status) ? (
                                                <select id="rf-status" className={CAMPO} value={form.status} onChange={e => set('status', e.target.value as RiskStatus)}>
                                                    {STATUS_EDITAVEIS.map(s => <option key={s} value={s}>{RISK_ROTULO.status[s]}</option>)}
                                                </select>
                                            ) : (
                                                <>
                                                    <input id="rf-status" type="text" readOnly className={CAMPO.replace('bg-white', 'bg-gray-50')} value={RISK_ROTULO.status[form.status]} />
                                                    <p className="text-xs text-gray-600">{form.status === 'encerrado' ? 'Para mudar, reabra o risco.' : 'Materialização é tratada na fase 2 do módulo.'}</p>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* ── Resposta ── */}
                                <div className="space-y-4">
                                    <SecaoTitulo icon={ShieldCheck} titulo="Resposta" />
                                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                        <div className="space-y-1.5 col-span-2">
                                            <label className={ROTULO} htmlFor="rf-controles">Controles existentes</label>
                                            <textarea id="rf-controles" className={AREA} value={form.controles_existentes ?? ''} onChange={e => set('controles_existentes', e.target.value)} />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className={ROTULO} htmlFor="rf-estrategia">Estratégia</label>
                                            <select id="rf-estrategia" className={CAMPO} value={form.estrategia ?? ''} onChange={e => set('estrategia', (e.target.value || null) as RiskEstrategia | null)}>
                                                <option value="">Ainda não definida</option>
                                                {(Object.keys(RISK_ROTULO.estrategia) as RiskEstrategia[]).map(s => <option key={s} value={s}>{RISK_ROTULO.estrategia[s]}</option>)}
                                            </select>
                                        </div>
                                        {form.estrategia === 'aceitar' && (
                                            <div className="space-y-1.5 col-span-2">
                                                <label className={ROTULO} htmlFor="rf-justificativa_aceite">Justificativa do aceite</label>
                                                <textarea id="rf-justificativa_aceite" className={`${AREA} ${temErro('justificativa_aceite')}`} value={form.justificativa_aceite ?? ''}
                                                    {...ariaErro('justificativa_aceite')} onChange={e => set('justificativa_aceite', e.target.value)}
                                                    placeholder="Por que aceitar em vez de tratar (custo do controle maior que a perda esperada, risco residual já baixo…)." />
                                                <ErroDoCampo id="rf-justificativa_aceite-erro" erro={erros.justificativa_aceite} />
                                            </div>
                                        )}
                                        <div className="space-y-1.5 col-span-2">
                                            <label className={ROTULO} htmlFor="rf-plano">Plano de resposta</label>
                                            <textarea id="rf-plano" className={AREA} value={form.plano_resposta ?? ''} onChange={e => set('plano_resposta', e.target.value)} />
                                        </div>
                                        <div className="space-y-1.5 col-span-2">
                                            <label className={ROTULO} htmlFor="rf-contingencia">Contingência</label>
                                            <textarea id="rf-contingencia" className={AREA} value={form.contingencia ?? ''} onChange={e => set('contingencia', e.target.value)} />
                                        </div>
                                    </div>
                                </div>

                                {/* ── Vínculo com o SST (F1.12) ── */}
                                {sstAplica && (
                                    <div className="space-y-4">
                                        <SecaoTitulo icon={HardHat} titulo="Vínculo com o SST" resumo="PGR/APR ou documento regulatório da mesma obra" />
                                        <div className="space-y-1.5">
                                            <label className={ROTULO} htmlFor="rf-sst">Documento do SST</label>
                                            <select id="rf-sst" className={CAMPO}
                                                value={form.sst_document_id ? `${form.sst_document_tipo}:${form.sst_document_id}` : ''}
                                                onChange={e => {
                                                    const [tipo, id] = e.target.value ? e.target.value.split(':') : [null, null];
                                                    setForm(p => ({ ...p, sst_document_tipo: (tipo as ProjectRiskInput['sst_document_tipo']) ?? null, sst_document_id: id ?? null }));
                                                    markDirty();
                                                }}>
                                                <option value="">Sem vínculo</option>
                                                {form.sst_document_id && !docsSst.some(d => d.id === form.sst_document_id) && (
                                                    <option value={`${form.sst_document_tipo}:${form.sst_document_id}`}>Documento atual (não encontrado nesta obra)</option>
                                                )}
                                                {docsSst.map(d => (
                                                    <option key={`${d.tipo}:${d.id}`} value={`${d.tipo}:${d.id}`}>
                                                        {d.rotulo}{d.data ? ` · ${d.tipo === 'risk_assessment' ? 'revisão' : 'vigência até'} ${formatDateBR(d.data)}` : ''}
                                                    </option>
                                                ))}
                                            </select>
                                            {docsSst.length === 0 && <p className="text-xs text-gray-600">Nenhum PGR/APR nem documento regulatório cadastrado para esta obra no SST (Recursos Humanos).</p>}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </fieldset>
                    </>
                )}

                {aba === 'avaliacoes' && risco && (
                    <RiscoAvaliacoes risco={risco} avaliacoes={avaliacoes} carregando={carregandoAval} faixas={faixas}
                        podeEditar={podeEditar && !encerrado} motivoSemEdicao={encerrado ? 'Risco encerrado: reabra para registrar nova avaliação.' : motivoSemEdicao}
                        autorNome={eu?.name ?? null}
                        onAvaliado={(a, r) => { setAvaliacoes(prev => [a, ...prev]); setRisco(r); onSalvo(r); }} />
                )}

                {aba === 'acoes' && risco && (
                    <RiscoAcoes risco={risco} acoes={acoes} carregando={carregandoAcoes}
                        podeEditar={podeEditar} motivoSemEdicao={motivoSemEdicao} onAcoes={acoesMudaram} />
                )}

                {aba === 'historico' && risco && (
                    <RiscoHistorico riskId={risco.id} eventos={historico} carregando={carregandoHist} />
                )}
            </SheetPanel>

            <SheetFooter className="flex-wrap">
                {aba === 'ficha' && risco && !somenteLeitura && (
                    <div className="flex items-center gap-2 mr-auto">
                        <ComMotivo motivo={risco.ultima_avaliacao_em || avaliacoes.length ? 'Tem avaliação registrada: não pode ser excluído (avaliação é histórico). Clique para encerrar em vez de excluir.' : 'Excluir — só para risco registrado por engano'}>
                            <button type="button" onClick={() => void excluir()} className={BOTAO_PERIGO}>
                                <Trash2 className="w-[15px] h-[15px]" /> Excluir
                            </button>
                        </ComMotivo>
                        {!encerrado && !encerrando && (
                            <button type="button" onClick={() => setEncerrando(true)} className={BOTAO_SECUNDARIO}>
                                <Archive className="w-[15px] h-[15px]" /> Encerrar
                            </button>
                        )}
                    </div>
                )}
                {risco && <SaveStatus dirty={dirty} savedAt={savedAt} className={aba === 'ficha' && !somenteLeitura ? '' : 'mr-auto'} />}
                {somenteLeitura && aba === 'ficha' && <p className="text-xs text-gray-600 mr-auto">{motivoSemEdicao}</p>}
                <button type="button" onClick={() => void handleBack()} className={BOTAO_SECUNDARIO}>{risco ? 'Voltar' : 'Cancelar'}</button>
                {aba === 'ficha' && !somenteLeitura && (
                    <ComMotivo motivo={motivoSalvar}>
                        <button type="button" onClick={() => void salvar()} disabled={salvando || (!!risco && !dirty)} className={BOTAO_PRIMARIO}>
                            {salvando ? 'Salvando…' : risco ? 'Salvar alterações' : 'Registrar risco'}
                        </button>
                    </ComMotivo>
                )}
            </SheetFooter>
        </Sheet>
    );
};

export default RiscoFicha;
