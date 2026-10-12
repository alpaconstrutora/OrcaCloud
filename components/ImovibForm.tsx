import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ImovibStudy, ImovibStudyInsert, ImovibStudyUpdate } from '../types';
import { imovibService } from '../services/imovibService';
import { useOrgWriteTarget } from '../hooks/useOrgContext';
import { useToast } from '../hooks/useToast';
import { useImovibPermissaoPorOrg } from '../hooks/useImovibEdicao';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';
import {
    IMOVIB_SEGMENTOS, IMOVIB_SUBCLASSIFICACOES, IMOVIB_FASES, IMOVIB_MODALIDADES,
    opcoesComValorAtual, imovibCnpj, imovibIncorporadora, imovibGestor, imovibIdentificacaoParaGravar,
} from '../constants/imovibClassificacao';

/**
 * Criar e editar o estudo de viabilidade — drawer (`Sheet`), não página cheia
 * (UI_PATTERNS.md §3: criar/editar registro simples = lateral). Plano
 * docs/planos/2026-10-12-imovib-viabilidade-correcoes.md, item 5.1.
 *
 * Só identificação e classificação. Zoneamento/CA/TO saíram daqui: o Mapa
 * Regulatório mora no empreendimento (Premissas › 4. Mapa Regulatório), e as
 * colunas `zoning`/`ca_basic`/`ca_max`/`occupancy_rate`/`needs_eiv` do estudo
 * não entram em nenhum cálculo (conferido por grep em 2026-10-12: só este
 * formulário as gravava; a listagem só EXIBE `zoning`, coluna oculta por padrão).
 *
 * Colunas canônicas: `cnpj`, `developer`, `manager` (item 5.2). Na edição a
 * leitura cai para `spe_cnpj`/`developer_name`/`project_manager` quando a
 * canônica está vazia; a gravação vai sempre para a canônica.
 */
interface ImovibFormProps {
    open: boolean;
    /** Estudo a editar. Ausente = criar. */
    study?: ImovibStudy | null;
    onClose: () => void;
    /** Recebe o estudo gravado. Criar: o pai abre o estudo. Editar: o pai recarrega. */
    onSaved: (study: ImovibStudy) => void;
}

interface Campos {
    name: string;
    version: string;
    segment: string;
    sub_classification: string;
    phase: string;
    development_modality: string;
    cnpj: string;
    developer: string;
    manager: string;
}

const camposDoEstudo = (s?: ImovibStudy | null): Campos => ({
    name: s?.name ?? '',
    version: s?.version || '1.0',
    segment: s?.segment ?? '',
    sub_classification: s?.sub_classification ?? '',
    phase: s?.phase ?? '',
    development_modality: s?.development_modality ?? '',
    cnpj: s ? imovibCnpj(s) : '',
    developer: s ? imovibIncorporadora(s) : '',
    manager: s ? imovibGestor(s) : '',
});

// §21 (rótulo) + §30 (malha) + §16 (raio/altura compactos).
const LABEL = 'text-xs font-semibold text-slate-500';
const FIELD = 'w-full px-3 h-9 bg-gray-50 border border-gray-200 rounded-[6px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';

const ImovibForm: React.FC<ImovibFormProps> = ({ open, study, onClose, onSaved }) => {
    const editando = !!study;
    const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
    const { showToast } = useToast();
    // canEditImovib (item 4.6): na edição, pela org DONA do estudo; na criação,
    // pela org alvo, depois que o topo (ou o modal, em "Todas") a decide.
    const avaliarEdicao = useImovibPermissaoPorOrg();
    const edicao = editando ? avaliarEdicao(study!.organization_id) : { pode: true as const, motivo: undefined };
    const { dirty, markDirty, markSaved, confirmDiscard } = useUnsavedChanges();
    const [form, setForm] = useState<Campos>(() => camposDoEstudo(study));
    const [erroNome, setErroNome] = useState<string | null>(null);
    const [salvando, setSalvando] = useState(false);

    // O drawer fica montado (para a transição); cada abertura recomeça do estudo.
    useEffect(() => {
        if (!open) return;
        setForm(camposDoEstudo(study));
        setErroNome(null);
        markSaved();
    }, [open, study, markSaved]);

    const set = (campo: keyof Campos, valor: string) => {
        setForm(prev => ({ ...prev, [campo]: valor }));
        if (campo === 'name' && valor.trim()) setErroNome(null);
        markDirty();
    };

    // X/Cancelar não passam pelo requestClose do Sheet (§25): guarda própria.
    const fechar = async () => {
        if (await confirmDiscard()) onClose();
    };

    const salvar = async () => {
        if (!form.name.trim()) {
            setErroNome('Informe o nome do estudo.');
            return;
        }
        const campos = {
            name: form.name.trim(),
            version: form.version.trim() || '1.0',
            segment: form.segment,
            sub_classification: form.sub_classification,
            phase: form.phase,
            development_modality: form.development_modality,
            ...imovibIdentificacaoParaGravar(form),
        };
        try {
            setSalvando(true);
            let salvo: ImovibStudy;
            if (editando) {
                if (!edicao.pode) { showToast(edicao.motivo ?? 'Sem permissão para editar este estudo.', 'error'); return; }
                salvo = await imovibService.updateStudy(study!.id, campos as ImovibStudyUpdate);
                showToast('Estudo atualizado.', 'success');
            } else {
                // REGRA #5: o topo manda. Org ou empresa selecionada → usa a org
                // dela, sem perguntar; "Todas" → pergunta (estudo é de UMA org).
                const target = await resolveWriteOrg('single');
                if (!target || target.kind !== 'org') return;
                const permissao = avaliarEdicao(target.orgId);
                if (!permissao.pode) { showToast(permissao.motivo ?? 'Sem permissão para criar estudos nesta organização.', 'error'); return; }
                salvo = await imovibService.createStudy({ ...campos, organization_id: target.orgId } as ImovibStudyInsert);
                showToast('Estudo criado.', 'success');
            }
            markSaved();
            onSaved(salvo);
        } catch (error) {
            console.error('Error saving study:', error);
            showToast(`Erro ao salvar o estudo: ${(error as Error).message}`, 'error');
        } finally {
            setSalvando(false);
        }
    };

    const motivoBotao = !edicao.pode
        ? edicao.motivo
        : salvando
            ? 'Salvando...'
            : editando && !dirty
                ? 'Nada foi alterado.'
                : undefined;

    const select = (campo: keyof Campos, lista: readonly string[]) => (
        <select value={form[campo]} onChange={e => set(campo, e.target.value)} className={`${FIELD} cursor-pointer`}>
            <option value="">Selecione...</option>
            {opcoesComValorAtual(lista, form[campo]).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
    );

    return (
        <>
            <Sheet open={open} onClose={onClose} dirty={dirty} size="xl">
                <SheetHeader onClose={fechar}>
                    <SheetTitle>{editando ? 'Editar estudo' : 'Novo estudo'}</SheetTitle>
                    <SheetDescription>
                        {editando ? study!.name : 'Identificação e classificação do estudo de viabilidade.'}
                    </SheetDescription>
                </SheetHeader>
                <SheetPanel className="p-6">
                    {!edicao.pode && (
                        <div role="status" className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-[10px] text-sm text-amber-800">
                            Somente leitura — {edicao.motivo}
                        </div>
                    )}
                    <form
                        onSubmit={e => { e.preventDefault(); salvar(); }}
                        className="space-y-8"
                    >
                        <fieldset disabled={!edicao.pode} title={!edicao.pode ? edicao.motivo : undefined} className="imovib-ro min-w-0 border-0 p-0 m-0 space-y-8">
                            <div className="space-y-4">
                                <div className="border-b border-gray-100 pb-3">
                                    <h3 className="text-sm font-semibold text-gray-900">Identificação</h3>
                                </div>
                                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                    <div className="col-span-2 space-y-1.5">
                                        <label className={LABEL} htmlFor="imovib-nome">Nome do empreendimento / SPE *</label>
                                        <input
                                            id="imovib-nome"
                                            type="text"
                                            value={form.name}
                                            onChange={e => set('name', e.target.value)}
                                            aria-invalid={!!erroNome}
                                            className={`${FIELD} ${erroNome ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20' : ''}`}
                                            placeholder="Ex: Residencial Vista Parque"
                                        />
                                        {erroNome && <p className="text-xs text-red-600">{erroNome}</p>}
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className={LABEL}>Versão do modelo</label>
                                        <input type="text" value={form.version} onChange={e => set('version', e.target.value)} className={FIELD} placeholder="1.0" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className={LABEL}>CNPJ da SPE</label>
                                        <input type="text" value={form.cnpj} onChange={e => set('cnpj', e.target.value)} className={FIELD} placeholder="00.000.000/0000-00" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className={LABEL}>Incorporadora / desenvolvedor</label>
                                        <input type="text" value={form.developer} onChange={e => set('developer', e.target.value)} className={FIELD} placeholder="Nome da construtora/incorporadora" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className={LABEL}>Gestor do projeto</label>
                                        <input type="text" value={form.manager} onChange={e => set('manager', e.target.value)} className={FIELD} placeholder="Nome do analista" />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="border-b border-gray-100 pb-3">
                                    <h3 className="text-sm font-semibold text-gray-900">Classificação</h3>
                                </div>
                                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                    <div className="space-y-1.5">
                                        <label className={LABEL}>Segmento</label>
                                        {select('segment', IMOVIB_SEGMENTOS)}
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className={LABEL}>Subclassificação padrão</label>
                                        {select('sub_classification', IMOVIB_SUBCLASSIFICACOES)}
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className={LABEL}>Fase do empreendimento</label>
                                        {select('phase', IMOVIB_FASES)}
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className={LABEL}>Modalidade de desenvolvimento</label>
                                        {select('development_modality', IMOVIB_MODALIDADES)}
                                    </div>
                                </div>
                                <p className="text-xs text-gray-500">
                                    Zoneamento, coeficientes e taxa de ocupação ficam em Premissas › 4. Mapa Regulatório (do empreendimento vinculado).
                                </p>
                            </div>
                        </fieldset>
                    </form>
                </SheetPanel>
                <SheetFooter>
                    <button
                        type="button"
                        onClick={fechar}
                        className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px] transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={salvar}
                        disabled={!!motivoBotao}
                        title={motivoBotao}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600 disabled:active:scale-100"
                    >
                        {salvando && <Loader2 className="w-[15px] h-[15px] animate-spin" />}
                        {salvando ? 'Salvando...' : editando ? 'Salvar estudo' : 'Criar estudo'}
                    </button>
                </SheetFooter>
            </Sheet>
            {/* Fora do Sheet: o painel tem transform, e um modal `fixed` dentro dele ficaria preso. */}
            {orgTargetModal}
        </>
    );
};

export default ImovibForm;
