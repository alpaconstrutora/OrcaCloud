import React, { useEffect, useState } from 'react';
import { ClipboardCheck, Loader2, AlertCircle } from 'lucide-react';
import { ImovibStudy, ImovibLandChecklistItem } from '../types';
import { imovibService } from '../services/imovibService';
import { useImovibEdicao } from '../hooks/useImovibEdicao';
import { useToast } from '../hooks/useToast';
import { IMOVIB_DUE_DILIGENCE } from '../constants/imovibDueDiligence';
import StandardTable, { type StandardTableColumn } from './ui/StandardTable';

export const ROTULO_DA_SITUACAO_DD: Record<ImovibLandChecklistItem['status'], string> = {
    pendente: 'Pendente', ok: 'Ok', problema: 'Com problema', nao_se_aplica: 'Não se aplica',
};

/** "x de 14 ok, y com problema" — o mesmo resumo no cartão e no Resumo Executivo. */
export const resumoDaDueDiligence = (itens: Pick<ImovibLandChecklistItem, 'status'>[]) => ({
    total: itens.length,
    ok: itens.filter(i => i.status === 'ok' || i.status === 'nao_se_aplica').length,
    problema: itens.filter(i => i.status === 'problema').length,
});

const COLUNAS: StandardTableColumn[] = [
    { key: 'label', label: 'Item', width: 280 },
    { key: 'status', label: 'Situação', width: 180 },
    { key: 'notes', label: 'Observação', width: 380 },
];

const CAMPO = 'h-9 w-full px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

/**
 * Due diligence do terreno (item 5.9 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). Os itens nascem pelo
 * botão "Criar checklist"; cada mudança grava na hora e atualiza o contador.
 */
const ImovibDueDiligenceCard: React.FC<{ study: ImovibStudy }> = ({ study }) => {
    const { pode, motivo } = useImovibEdicao();
    const { showToast } = useToast();
    const [itens, setItens] = useState<ImovibLandChecklistItem[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [criando, setCriando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    useEffect(() => {
        let vivo = true;
        setCarregando(true);
        imovibService.listarDueDiligence(study.id)
            .then(l => { if (vivo) { setItens(l); setErro(null); } })
            .catch(e => { if (vivo) setErro((e as Error).message); })
            .finally(() => { if (vivo) setCarregando(false); });
        return () => { vivo = false; };
    }, [study.id]);

    const criar = async () => {
        setCriando(true);
        try {
            setItens(await imovibService.criarDueDiligence(study.id, IMOVIB_DUE_DILIGENCE));
        } catch (e) {
            showToast((e as Error).message, 'error');
        } finally {
            setCriando(false);
        }
    };

    // Erro ao gravar: a observação (campo não controlado) remonta com o valor gravado —
    // sem isso, o texto digitado ficava no campo como se tivesse gravado (pendência da Fase 5).
    const [revisao, setRevisao] = useState(0);
    const salvar = async (item: ImovibLandChecklistItem, campos: Partial<Pick<ImovibLandChecklistItem, 'status' | 'notes'>>) => {
        const antes = item;
        // Só o campo que mudou: a observação não mexe em quem conferiu nem quando.
        const gravar = 'notes' in campos ? { notes: campos.notes?.trim() || null } : { status: campos.status };
        setItens(prev => prev.map(x => (x.id === item.id ? { ...item, ...gravar } : x)));
        try {
            const salvo = await imovibService.salvarItemDaDueDiligence(item.id, gravar);
            setItens(prev => prev.map(x => (x.id === salvo.id ? salvo : x)));
        } catch (e) {
            setItens(prev => prev.map(x => (x.id === antes.id ? antes : x)));
            setRevisao(r => r + 1);
            showToast((e as Error).message, 'error');
        }
    };

    const r = resumoDaDueDiligence(itens);
    const faltam = IMOVIB_DUE_DILIGENCE.length - itens.length;
    const motivoCriar = !pode ? motivo : carregando ? 'Carregando…' : faltam <= 0 ? 'O checklist já tem todos os itens.' : undefined;

    return (
        <section className="bg-white rounded-[10px] p-6 border border-slate-100 shadow-sm space-y-4" aria-labelledby="imovib-dd-titulo">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 id="imovib-dd-titulo" className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                        <ClipboardCheck className="w-5 h-5 text-indigo-500" />
                        Due diligence do terreno
                    </h2>
                    <p className="text-slate-500 text-sm mt-1">
                        {itens.length
                            ? `${r.ok} de ${r.total} ok${r.problema ? `, ${r.problema} com problema` : ''}. Cada mudança grava na hora.`
                            : 'Documentos e verificações antes de comprar o terreno.'}
                    </p>
                </div>
                {faltam > 0 && (
                    <button
                        type="button"
                        onClick={() => void criar()}
                        disabled={!!motivoCriar || criando}
                        title={motivoCriar}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {criando && <Loader2 className="w-[15px] h-[15px] animate-spin" />}
                        {itens.length ? `Completar checklist (${faltam})` : 'Criar checklist'}
                    </button>
                )}
            </div>

            {erro && (
                <div className="flex items-start gap-2 rounded-[10px] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {erro}
                </div>
            )}

            <fieldset disabled={!pode} title={!pode ? motivo : undefined} className="imovib-ro min-w-0 border-0 p-0 m-0">
                <StandardTable<ImovibLandChecklistItem>
                    storageKey="imovib:due-diligence"
                    columns={COLUNAS}
                    rows={itens}
                    rowKey={i => i.id}
                    loading={carregando}
                    dense
                    bare
                    renderCell={(k, i) => {
                        switch (k) {
                            case 'label': return <span className={`text-sm ${i.status === 'problema' ? 'text-rose-700 font-medium' : 'text-gray-700'}`}>{i.label}</span>;
                            case 'status': return (
                                <select
                                    aria-label={`Situação de ${i.label}`}
                                    value={i.status}
                                    onChange={e => void salvar(i, { status: e.target.value as ImovibLandChecklistItem['status'] })}
                                    className={`${CAMPO} cursor-pointer`}
                                >
                                    {(Object.keys(ROTULO_DA_SITUACAO_DD) as ImovibLandChecklistItem['status'][]).map(s => <option key={s} value={s}>{ROTULO_DA_SITUACAO_DD[s]}</option>)}
                                </select>
                            );
                            case 'notes': return (
                                <input
                                    key={`${i.id}-${revisao}`}
                                    aria-label={`Observação de ${i.label}`}
                                    defaultValue={i.notes ?? ''}
                                    onBlur={e => { if ((e.target.value.trim() || null) !== (i.notes ?? null)) void salvar(i, { notes: e.target.value }); }}
                                    className={CAMPO}
                                />
                            );
                            default: return null;
                        }
                    }}
                    empty={{
                        icon: <ClipboardCheck className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                        title: 'Nenhum item ainda',
                        subtitle: '"Criar checklist" grava os 14 itens: matrícula, cadeia dominial, ônus, certidões, IPTU, uso do solo, ambiental, contaminação, tombamento, cone aeroportuário, faixas e servidões, topografia, sondagem e concessionárias.',
                    }}
                />
            </fieldset>
        </section>
    );
};

export default ImovibDueDiligenceCard;
