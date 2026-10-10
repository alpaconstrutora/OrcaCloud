import React from 'react';
import { Link2, Search, Reply, FileText, Inbox } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from '../ui/sheet';
import ActionIconButton from '../ui/ActionIconButton';
import type { DocGenDocumento, DocGenVinculo, DocGenVinculoTipo } from '../../types/docGen';
import { ROTULO_VINCULO, referenciaDeOficio, type OficioRecebido } from '../../services/docGen/tramitacao';
import { dataCurta } from '../../services/docGen/dataExtenso';

/**
 * Relacionamento entre documentos (F4): "em resposta a", retifica, encaminha,
 * faz referência. Cada ponta é um ofício do sistema OU um ofício recebido
 * (documento do GED). Quem grava é a tela-mãe; aqui é a lista e o seletor.
 */
export type AlvoVinculo = { documentoId: string } | { gedId: string };

/** Vínculo ainda não gravado (ofício novo, antes do primeiro "Salvar"). */
export interface VinculoPendente { tipo: DocGenVinculoTipo; alvo: AlvoVinculo }

interface Props {
    documentoId: string | null;
    vinculos: DocGenVinculo[];
    pendentes: VinculoPendente[];
    documentos: DocGenDocumento[];
    recebidos: OficioRecebido[];
    /** Rascunho: pode escolher o "em resposta a" (vai impresso no PDF). */
    rascunho: boolean;
    onAdicionar: (tipo: DocGenVinculoTipo, alvo: AlvoVinculo) => void;
    onRemover: (v: DocGenVinculo | VinculoPendente) => void;
    onAbrirOficio: (id: string) => void;
    onAbrirGed: (id: string) => void;
}

const TIPOS_LIVRES: { value: DocGenVinculoTipo; label: string }[] = [
    { value: 'REFERENCIA', label: 'Faz referência a' },
    { value: 'RETIFICA', label: 'Retifica' },
    { value: 'ENCAMINHA', label: 'Encaminha' },
];

export default function VinculosPainel({ documentoId, vinculos, pendentes, documentos, recebidos, rascunho, onAdicionar, onRemover, onAbrirOficio, onAbrirGed }: Props) {
    const [seletor, setSeletor] = React.useState<DocGenVinculoTipo | null>(null);
    const [tipoLivre, setTipoLivre] = React.useState<DocGenVinculoTipo>('REFERENCIA');

    const porDoc = React.useMemo(() => new Map(documentos.map(d => [d.id, d])), [documentos]);
    const porGed = React.useMemo(() => new Map(recebidos.map(r => [r.documento.id, r])), [recebidos]);

    const descrever = (alvo: { documentoId?: string | null; gedId?: string | null }): { texto: string; abrir?: () => void } => {
        if (alvo.documentoId) {
            const d = porDoc.get(alvo.documentoId);
            const texto = d ? `${d.numero ? `Ofício ${d.numero}` : 'Ofício em elaboração'} — ${d.assunto || 'sem assunto'}` : 'Ofício do sistema';
            return { texto, abrir: () => onAbrirOficio(alvo.documentoId!) };
        }
        if (alvo.gedId) {
            const r = porGed.get(alvo.gedId);
            const texto = r ? `${referenciaDeOficio({ numero: r.meta.numero, remetente: r.meta.remetente, data: r.meta.data_documento ?? r.meta.recebido_em })} — ${r.meta.assunto}` : 'Documento do GED';
            return { texto, abrir: () => onAbrirGed(alvo.gedId!) };
        }
        return { texto: '—' };
    };

    const linhas = [
        ...vinculos.map(v => {
            const saida = !!documentoId && v.de_documento_id === documentoId;
            const outra = saida ? { documentoId: v.para_documento_id, gedId: v.para_ged_id } : { documentoId: v.de_documento_id, gedId: v.de_ged_id };
            // Depois da emissão, "em resposta a" (impresso no PDF) e "respondido por" (a
            // prova da resposta) não se desfazem — o banco trava a primeira; a tela, as duas.
            const fixo = v.tipo === 'RESPONDE' && !rascunho;
            return { chave: v.id, rotulo: saida ? ROTULO_VINCULO[v.tipo].de : ROTULO_VINCULO[v.tipo].para, ...descrever(outra), remover: fixo ? undefined : () => onRemover(v) };
        }),
        ...pendentes.map((p, i) => ({
            chave: `pendente-${i}`, rotulo: `${ROTULO_VINCULO[p.tipo].de} (grava ao salvar)`,
            ...descrever('documentoId' in p.alvo ? { documentoId: p.alvo.documentoId } : { gedId: p.alvo.gedId }),
            remover: () => onRemover(p),
        })),
    ];

    const temRespostaA = vinculos.some(v => v.tipo === 'RESPONDE' && v.de_documento_id === documentoId) || pendentes.some(p => p.tipo === 'RESPONDE');

    return (
        <div className="space-y-3">
            {linhas.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhum documento relacionado.{rascunho ? ' Se este ofício responde a outro, escolha em "Em resposta a" — a referência sai no texto pela variável {{documento.em_resposta_a}}.' : ''}</p>
            ) : (
                <ul className="divide-y divide-gray-100 rounded-[10px] border border-gray-100">
                    {linhas.map(l => (
                        <li key={l.chave} className="flex items-center gap-3 px-3 py-2.5">
                            <Link2 className="w-4 h-4 text-gray-400 shrink-0" />
                            <div className="min-w-0 flex-1">
                                <p className="text-xs text-gray-500">{l.rotulo}</p>
                                <p className="text-sm text-gray-800 truncate" title={l.texto}>{l.texto}</p>
                            </div>
                            <div className="flex items-center gap-1">
                                {l.abrir && <ActionIconButton kind="view" title="Abrir" icon={<FileText className="w-4 h-4" />} onClick={l.abrir} />}
                                {l.remover && <ActionIconButton kind="delete" title="Desfazer o vínculo" onClick={l.remover} />}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            <div className="flex flex-wrap items-center gap-2">
                {rascunho && !temRespostaA && (
                    <button type="button" onClick={() => setSeletor('RESPONDE')}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px]">
                        <Reply className="w-[15px] h-[15px]" /> Em resposta a…
                    </button>
                )}
                <select value={tipoLivre} onChange={e => setTipoLivre(e.target.value as DocGenVinculoTipo)}
                    className="h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                    {TIPOS_LIVRES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <button type="button" onClick={() => setSeletor(tipoLivre)}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px]">
                    <Link2 className="w-[15px] h-[15px]" /> Vincular documento
                </button>
            </div>

            <EscolherDocumentoSheet
                tipo={seletor}
                documentoId={documentoId}
                documentos={documentos}
                recebidos={recebidos}
                onClose={() => setSeletor(null)}
                onEscolher={alvo => { if (seletor) onAdicionar(seletor, alvo); setSeletor(null); }}
            />
        </div>
    );
}

function EscolherDocumentoSheet({ tipo, documentoId, documentos, recebidos, onClose, onEscolher }: {
    tipo: DocGenVinculoTipo | null;
    documentoId: string | null;
    documentos: DocGenDocumento[];
    recebidos: OficioRecebido[];
    onClose: () => void;
    onEscolher: (alvo: AlvoVinculo) => void;
}) {
    const [busca, setBusca] = React.useState('');
    React.useEffect(() => { if (tipo) setBusca(''); }, [tipo]);
    const t = busca.trim().toLowerCase();


    const linhas = React.useMemo(() => {
        const nossos = documentos
            .filter(d => d.id !== documentoId && d.status !== 'RASCUNHO')
            .map(d => ({
                chave: d.id, alvo: { documentoId: d.id } as AlvoVinculo, origem: 'Emitido' as const,
                titulo: d.numero ? `Ofício ${d.numero}` : 'Ofício', detalhe: `${d.assunto} · ${d.destinatario_snapshot?.razao_social ?? ''}`,
                data: d.data_documento,
            }));
        const deles = recebidos.map(r => ({
            chave: r.documento.id, alvo: { gedId: r.documento.id } as AlvoVinculo, origem: 'Recebido' as const,
            titulo: referenciaDeOficio({ numero: r.meta.numero, remetente: r.meta.remetente }), detalhe: r.meta.assunto,
            data: r.meta.data_documento ?? r.meta.recebido_em,
        }));
        const todas = [...deles, ...nossos];
        return t ? todas.filter(l => `${l.titulo} ${l.detalhe}`.toLowerCase().includes(t)) : todas;
    }, [documentos, recebidos, documentoId, t]);

    if (!tipo) return null;

    return (
        <Sheet open={!!tipo} onClose={onClose} size="lg">
            <SheetHeader onClose={onClose}>
                <SheetTitle>{tipo ? ROTULO_VINCULO[tipo].de : ''}</SheetTitle>
                <SheetDescription>Ofícios recebidos (arquivados no GED) e ofícios emitidos pela organização.</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-5 space-y-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input autoFocus value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por número, remetente ou assunto..."
                        className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
                </div>
                {linhas.length === 0 ? (
                    <div className="text-center py-12">
                        <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum documento</h3>
                        <p className="text-sm text-gray-500">Registre o ofício recebido na aba Recebidos para poder respondê-lo.</p>
                    </div>
                ) : (
                    <ul className="divide-y divide-gray-100 rounded-[10px] border border-gray-100">
                        {linhas.map(l => (
                            <li key={l.chave}>
                                <button type="button" onClick={() => onEscolher(l.alvo)} className="w-full text-left px-4 py-3 hover:bg-blue-50/50">
                                    <span className="block text-sm text-gray-800">{l.titulo}</span>
                                    <span className="block text-xs text-gray-500 truncate">{[l.origem, l.data ? dataCurta(l.data) : null, l.detalhe].filter(Boolean).join(' · ')}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </SheetPanel>
        </Sheet>
    );
}
