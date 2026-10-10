import React from 'react';
import { FileUp, Loader2, AlertCircle } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useToast } from '../../hooks/useToast';
import type { DocGenDocumento } from '../../types/docGen';
import type { OpuraDocumentCategoria } from '../../types/documents';
import { listarCandidatos, obrasDaOrganizacao, type CandidatoDestinatario } from '../../services/docGen/resolverContexto';
import { registrarRecebido, type OficioRecebido } from '../../services/docGen/tramitacao';
import { hojeIso } from '../../services/docGen/dataExtenso';
import { useStore } from '../../store/useStore';
import { CATEGORIA_GED_LABEL, CATEGORIAS_GED } from './rotulos';

/**
 * Registrar um ofício RECEBIDO de terceiro (prefeitura, concessionária…): o PDF
 * vai para o GED (Ofícios / ano / Recebidos), CONGELADO com hash — é prova do
 * que chegou. Se for a resposta a um ofício nosso, os dois ficam vinculados e o
 * nosso passa a Respondido. Prazo para responder vira tarefa.
 *
 * Drawer transitório (formulário curto, guia §4.3) — não substitui a tela.
 */
interface Props {
    open: boolean;
    onClose: () => void;
    organizationId: string;
    /** Ofícios nossos que ainda esperam resposta (para "é resposta a"). */
    emitidos: DocGenDocumento[];
    /** Aberto a partir de um ofício nosso ("Registrar resposta"). */
    respostaA?: DocGenDocumento | null;
    emailUsuario: string | null;
    onRegistrado: (r: OficioRecebido, respondeu: DocGenDocumento | null) => void;
}

const INPUT = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';
const LABEL = 'text-xs font-semibold text-slate-500';

interface Form {
    numero: string;
    assunto: string;
    remetente: string;
    supplierId: string;
    dataDocumento: string;
    recebidoEm: string;
    responderAte: string;
    categoria: OpuraDocumentCategoria;
    projectId: string;
    respondeAo: string;
}

export default function RegistrarRecebidoSheet({ open, onClose, organizationId, emitidos, respostaA, emailUsuario, onRegistrado }: Props) {
    const { showToast } = useToast();
    const organizations = useStore(s => s.organizations);
    const projects = useStore(s => s.projects);
    const [form, setForm] = React.useState<Form | null>(null);
    const [arquivo, setArquivo] = React.useState<File | null>(null);
    const [fornecedores, setFornecedores] = React.useState<CandidatoDestinatario[]>([]);
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!open) return;
        const d = respostaA?.destinatario_snapshot;
        setForm({
            numero: '', assunto: respostaA ? `Resposta ao ofício ${respostaA.numero ?? ''}`.trim() : '',
            remetente: d?.razao_social ?? '', supplierId: d?.tipo === 'FORNECEDOR' ? d.id ?? '' : '',
            dataDocumento: '', recebidoEm: hojeIso(), responderAte: '', categoria: 'juridico',
            projectId: respostaA?.project_id ?? '', respondeAo: respostaA?.id ?? '',
        });
        setArquivo(null);
        setErro(null);
        let vivo = true;
        listarCandidatos('FORNECEDOR', organizationId, organizations).then(l => vivo && setFornecedores(l)).catch(() => vivo && setFornecedores([]));
        return () => { vivo = false; };
    }, [open, respostaA, organizationId, organizations]);

    if (!open || !form) return null;
    const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => (f ? { ...f, [k]: v } : f));
    // Só OBRAS da organização (REGRA #2/#3) — o mesmo recorte do Novo ofício.
    const obras = obrasDaOrganizacao(projects, organizationId);

    const motivo = !arquivo ? 'Anexe o PDF do ofício recebido.'
        : !form.remetente.trim() ? 'Informe quem enviou (remetente).'
        : !form.assunto.trim() ? 'Informe o assunto.'
        : !form.recebidoEm ? 'Informe a data de recebimento.'
        : undefined;

    const salvar = async () => {
        if (!arquivo || motivo) return;
        setSalvando(true);
        setErro(null);
        try {
            const alvo = emitidos.find(d => d.id === form.respondeAo) ?? null;
            const r = await registrarRecebido({
                organizationId, arquivo,
                numero: form.numero, assunto: form.assunto, remetente: form.remetente,
                remetenteSupplierId: form.supplierId || null,
                dataDocumento: form.dataDocumento || null, recebidoEm: form.recebidoEm, responderAte: form.responderAte || null,
                categoria: form.categoria, projectId: form.projectId || null,
                respondeAoOficio: alvo, emailUsuario,
            });
            showToast(alvo ? `Resposta arquivada e vinculada ao ofício ${alvo.numero ?? ''}.` : 'Ofício recebido arquivado no GED.', 'success');
            onRegistrado(r, alvo);
            onClose();
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Falha ao arquivar o ofício recebido.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={open} onClose={onClose} size="2xl" dirty={!!arquivo}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>{respostaA ? `Resposta ao ofício ${respostaA.numero ?? ''}` : 'Registrar ofício recebido'}</SheetTitle>
                <SheetDescription>O PDF é arquivado no GED, congelado e com hash — é o registro do que chegou.</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-5 space-y-4">
                {erro && (
                    <div className="flex items-start gap-2 rounded-[10px] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {erro}
                    </div>
                )}
                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                    <div className="space-y-1.5 col-span-2">
                        <label className={LABEL} htmlFor="rec-arquivo">PDF do ofício recebido *</label>
                        <input id="rec-arquivo" type="file" accept="application/pdf" onChange={e => setArquivo(e.target.files?.[0] ?? null)}
                            className="block w-full text-sm text-gray-700 file:mr-3 file:h-9 file:px-3.5 file:rounded-[6px] file:border file:border-gray-200 file:bg-white file:text-[13px] file:font-medium file:text-gray-700 hover:file:bg-gray-50" />
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL} htmlFor="rec-numero">Número do ofício</label>
                        <input id="rec-numero" value={form.numero} onChange={e => set('numero', e.target.value)} placeholder="Ex.: 312/2026" className={INPUT} />
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL} htmlFor="rec-data">Data do ofício</label>
                        <input id="rec-data" type="date" value={form.dataDocumento} min="2000-01-01" max="2099-12-31" onChange={e => set('dataDocumento', e.target.value)} className={INPUT} />
                    </div>
                    <div className="space-y-1.5 col-span-2">
                        <label className={LABEL} htmlFor="rec-assunto">Assunto *</label>
                        <input id="rec-assunto" value={form.assunto} onChange={e => set('assunto', e.target.value)} className={INPUT} />
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL} htmlFor="rec-fornecedor">Remetente do cadastro</label>
                        <select id="rec-fornecedor" value={form.supplierId}
                            onChange={e => {
                                const f = fornecedores.find(x => x.id === e.target.value);
                                setForm(x => (x ? { ...x, supplierId: e.target.value, remetente: f ? f.nome : x.remetente } : x));
                            }} className={INPUT}>
                            <option value="">— Não está em Meus Fornecedores —</option>
                            {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL} htmlFor="rec-remetente">Remetente *</label>
                        <input id="rec-remetente" value={form.remetente} onChange={e => set('remetente', e.target.value)} placeholder="Ex.: Prefeitura Municipal de Cambuí" className={INPUT} />
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL} htmlFor="rec-recebido">Recebido em *</label>
                        <input id="rec-recebido" type="date" value={form.recebidoEm} min="2000-01-01" max="2099-12-31" onChange={e => set('recebidoEm', e.target.value)} className={INPUT} />
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL} htmlFor="rec-prazo">Responder até</label>
                        <input id="rec-prazo" type="date" value={form.responderAte} min="2000-01-01" max="2099-12-31" onChange={e => set('responderAte', e.target.value)} className={INPUT} />
                        <p className="text-[11px] text-gray-400">Com prazo, entra uma tarefa na sua agenda.</p>
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL} htmlFor="rec-categoria">Categoria no GED</label>
                        <select id="rec-categoria" value={form.categoria} onChange={e => set('categoria', e.target.value as OpuraDocumentCategoria)} className={INPUT}>
                            {CATEGORIAS_GED.map(c => <option key={c} value={c}>{CATEGORIA_GED_LABEL[c]}</option>)}
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label className={LABEL} htmlFor="rec-obra">Obra</label>
                        <select id="rec-obra" value={form.projectId} onChange={e => set('projectId', e.target.value)} className={INPUT}>
                            <option value="">— Nenhuma —</option>
                            {obras.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                    <div className="space-y-1.5 col-span-2">
                        <label className={LABEL} htmlFor="rec-responde">É a resposta a um ofício nosso?</label>
                        <select id="rec-responde" value={form.respondeAo} onChange={e => set('respondeAo', e.target.value)} disabled={!!respostaA} className={`${INPUT} disabled:bg-gray-50 disabled:text-gray-600`}>
                            <option value="">— Não —</option>
                            {emitidos.map(d => <option key={d.id} value={d.id}>{`Ofício ${d.numero ?? ''} — ${d.assunto}`}</option>)}
                        </select>
                    </div>
                </div>
            </SheetPanel>
            <SheetFooter>
                <button type="button" onClick={onClose} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">Cancelar</button>
                <button type="button" onClick={salvar} disabled={salvando || !!motivo} title={motivo}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                    {salvando ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <FileUp className="w-[15px] h-[15px]" />}
                    {salvando ? 'Arquivando…' : 'Arquivar no GED'}
                </button>
            </SheetFooter>
        </Sheet>
    );
}
