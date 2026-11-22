import React from 'react';
import { FileText, ShieldAlert } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { formatDateBR } from '../ui/Format';
import { errorMessage } from '../../hooks/useOrgContext';
import { creditRoomService } from '../../services/creditRoomService';
import type { CreditRoom, CreditRoomDocument, CreditRoomVersion } from '../../types/creditRoom';
import type { DocumentoSugerido, GrupoDeSugestoes } from '../../utils/creditRoomSugestoes';

/**
 * "Sugerir documentos" do Data Room (capacidade F3, Task 4) — lado interno.
 *
 * Lê do GED os documentos ligados à carteira da VERSÃO ativa (contratos,
 * empreendimentos, obra e, à parte, clientes) e deixa a pessoa marcar o que vai
 * para o Data Room. Nada é compartilhado sem o clique em "Compartilhar".
 *
 * Privacidade:
 *  - nome de cliente nunca aparece aqui nem vai ao credor: a referência é o
 *    rótulo mascarado do contrato;
 *  - documento do CLIENTE é dado pessoal → grupo próprio, DESMARCADO, com o aviso
 *    de LGPD que vem do agrupador;
 *  - documento do CONTRATO (assinado) que também tem vínculo com cliente segue marcado e leva o
 *    aviso "contém dados do cliente"; já o de empreendimento/obra com dado do cliente nasce
 *    DESMARCADO (só se marca um a um, com o mesmo aviso).
 */

const rotuloDoCampo = 'text-xs font-semibold text-slate-500';

interface Props {
    open: boolean;
    onClose: () => void;
    room: CreditRoom;
    versao: CreditRoomVersion;
    /** Lista do Data Room já recarregada depois de compartilhar. */
    onShared: (documentos: CreditRoomDocument[]) => void;
}

/**
 * Entra na marcação em lote (pré-marcado e "todos do grupo"): fora o que já está no Data Room, o vencido e o
 * documento com dado do cliente que não é o contrato assinado (CONTRATO). Esses só se marcam um a um.
 */
const entraEmLote = (i: DocumentoSugerido) => !i.jaCompartilhado && !i.vencido && !(i.temDadosDoCliente && i.origem !== 'CONTRATO');

/** Caixa de grupo: marcada / desmarcada / parcial (traço). */
const CaixaDoGrupo: React.FC<{ marcados: number; total: number; titulo: string; motivoDesligada: string; onChange: () => void }> = ({ marcados, total, titulo, motivoDesligada, onChange }) => {
    const ref = React.useRef<HTMLInputElement>(null);
    React.useEffect(() => {
        if (ref.current) ref.current.indeterminate = marcados > 0 && marcados < total;
    }, [marcados, total]);
    const semNada = total === 0;
    return (
        <input
            ref={ref} type="checkbox"
            aria-label={`Selecionar todos: ${titulo}`}
            checked={total > 0 && marcados === total}
            disabled={semNada}
            title={semNada ? motivoDesligada : undefined}
            onChange={onChange}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        />
    );
};

const CreditRoomSugerirDocumentos: React.FC<Props> = ({ open, onClose, room, versao, onShared }) => {
    const [grupos, setGrupos] = React.useState<GrupoDeSugestoes[]>([]);
    const [marcados, setMarcados] = React.useState<Set<string>>(new Set());
    const [carregando, setCarregando] = React.useState(false);
    const [compartilhando, setCompartilhando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    const [tentativa, setTentativa] = React.useState(0);

    const grupoEscopo = room.escopo === 'GRUPO';
    const nomeDaOrg = React.useMemo(() => {
        const m = new Map<string, string>();
        for (const o of versao.snapshot.escopo?.organizacoes ?? []) m.set(o.id, o.nome);
        return m;
    }, [versao]);

    React.useEffect(() => {
        if (!open) return;
        let vivo = true;
        setCarregando(true);
        setErro(null);
        setGrupos([]);
        setMarcados(new Set());
        creditRoomService.sugerirDocumentos(room, versao)
            .then(g => {
                if (!vivo) return;
                setGrupos(g);
                // Pré-marcado: grupos "bons" (não CLIENTE), sem o que já está no Data Room, sem o vencido
                // (vencido só entra marcado um a um, de propósito) e sem dado do cliente fora do contrato assinado.
                setMarcados(new Set(g.filter(x => x.marcadoPorPadrao).flatMap(x => x.itens).filter(entraEmLote).map(i => i.documentId)));
            })
            .catch(e => { if (vivo) setErro(errorMessage(e, 'Não foi possível ler os documentos do GED.')); })
            .finally(() => { if (vivo) setCarregando(false); });
        return () => { vivo = false; };
        // Por id: o pai pode recriar o objeto `room` ao salvar algo e isso apagaria as marcas da pessoa.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, room.id, versao.id, tentativa]);

    const alternarItem = (id: string) => setMarcados(prev => {
        const n = new Set(prev);
        if (n.has(id)) n.delete(id); else n.add(id);
        return n;
    });

    const alternarGrupo = (g: GrupoDeSugestoes) => {
        // "Todos" = os que não estão no Data Room, não estão vencidos e não trazem dado do cliente fora do contrato;
        // esses só se marcam um a um.
        const ids = g.itens.filter(entraEmLote).map(i => i.documentId);
        setMarcados(prev => {
            const n = new Set(prev);
            const todos = ids.length > 0 && ids.every(id => n.has(id));
            for (const id of ids) { if (todos) n.delete(id); else n.add(id); }
            return n;
        });
    };

    const compartilhar = async () => {
        if (marcados.size === 0) return;
        setCompartilhando(true);
        setErro(null);
        try {
            await creditRoomService.shareDocuments(room, [...marcados]);
            onShared(await creditRoomService.listDocuments(room.id));
            onClose();
        } catch (e) {
            setErro(errorMessage(e, 'Não foi possível compartilhar os documentos.'));
        } finally {
            setCompartilhando(false);
        }
    };

    // Durante o compartilhamento o painel não fecha (nem por Esc/véu/X): o resultado ainda não voltou.
    const fecharSeLivre = () => { if (!compartilhando) onClose(); };

    const total = grupos.reduce((n, g) => n + g.itens.length, 0);
    const n = marcados.size;
    const motivoDesligado = compartilhando ? undefined
        : carregando ? 'Aguarde a leitura do GED'
            : n === 0 ? 'Marque ao menos um documento para compartilhar' : undefined;

    const linhaDoItem = (d: DocumentoSugerido) => {
        const empresa = grupoEscopo ? (nomeDaOrg.get(d.organizationId) ?? '—') : null;
        const meta = [d.categoria, d.tipoDocumento, d.referencia].filter(Boolean).join(' · ');
        return (
            <li key={d.documentId} className="px-4 py-2.5">
                <label className={`flex items-start gap-3 ${d.jaCompartilhado ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                    <input
                        type="checkbox"
                        aria-label={`Selecionar ${d.nome || 'documento sem nome'}`}
                        checked={!d.jaCompartilhado && marcados.has(d.documentId)}
                        disabled={d.jaCompartilhado}
                        title={d.jaCompartilhado ? 'Este documento já está no Data Room' : undefined}
                        onChange={() => alternarItem(d.documentId)}
                        className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-normal text-gray-700" title={d.nome}>{d.nome || '(sem nome)'}</span>
                        <span className="block text-xs text-gray-500">
                            {meta}
                            {empresa != null && <>{meta ? ' · ' : ''}Empresa: {empresa}</>}
                        </span>
                        <span className="flex flex-wrap items-center gap-x-3 text-xs">
                            {d.vencido && <span className="text-red-600">Vencido em {formatDateBR(d.dataValidade)}</span>}
                            {!d.vencido && d.dataValidade && <span className="text-gray-500">Validade {formatDateBR(d.dataValidade)}</span>}
                            {d.jaCompartilhado && <span className="text-gray-500">já no Data Room</span>}
                            {d.temDadosDoCliente && d.origem !== 'CLIENTE' && <span className="text-amber-700">contém dados do cliente</span>}
                        </span>
                    </span>
                </label>
            </li>
        );
    };

    return (
        <Sheet open={open} onClose={fecharSeLivre} size="xl">
            <SheetHeader onClose={fecharSeLivre}>
                <SheetTitle>Sugerir documentos</SheetTitle>
                <SheetDescription>
                    Documentos do GED ligados à carteira desta versão. Nada vai para a instituição sem o seu clique em Compartilhar.
                </SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-5 space-y-5">
                {erro && (
                    <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[10px] px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                        <span>{erro}</span>
                        {grupos.length === 0 && !carregando && (
                            <button type="button" onClick={() => setTentativa(t => t + 1)} className="text-sm font-medium text-blue-600 hover:text-blue-800">Tentar de novo</button>
                        )}
                    </div>
                )}

                {carregando ? (
                    <div className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div><p className="mt-2 text-gray-500">Lendo o GED...</p></div>
                ) : !erro && total === 0 ? (
                    <div className="text-center py-12">
                        <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum documento para sugerir</h3>
                        <p className="text-sm text-gray-500">Nenhum documento do GED está ligado aos contratos, empreendimentos ou à obra desta versão.</p>
                    </div>
                ) : (
                    grupos.map(g => {
                        const naoCompartilhados = g.itens.filter(i => !i.jaCompartilhado);
                        const emLote = naoCompartilhados.filter(entraEmLote);
                        const marcadosEmLote = emLote.filter(i => marcados.has(i.documentId)).length;
                        const marcadosNoGrupo = naoCompartilhados.filter(i => marcados.has(i.documentId)).length;
                        const motivoDesligada = naoCompartilhados.length === 0
                            ? 'Todos os documentos deste grupo já estão no Data Room'
                            : 'Só há documentos vencidos neste grupo: marque um a um';
                        return (
                            <section key={g.origem} aria-label={g.titulo} className="space-y-2">
                                <div className="flex items-center gap-3 px-1">
                                    <CaixaDoGrupo marcados={marcadosEmLote} total={emLote.length} titulo={g.titulo} motivoDesligada={motivoDesligada} onChange={() => alternarGrupo(g)} />
                                    <h3 className="text-sm font-semibold text-gray-900">{g.titulo}</h3>
                                    <span className={rotuloDoCampo}>
                                        {naoCompartilhados.length === 0
                                            ? 'todos já no Data Room'
                                            : `${marcadosNoGrupo} de ${naoCompartilhados.length} marcado${naoCompartilhados.length === 1 ? '' : 's'}`}
                                    </span>
                                </div>
                                {g.aviso && (
                                    <p className="flex items-start gap-2 text-sm text-amber-700 px-1">
                                        <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                                        <span>{g.aviso}</span>
                                    </p>
                                )}
                                <ul className="rounded-[10px] border border-gray-100 divide-y divide-gray-100 bg-white">
                                    {g.itens.map(linhaDoItem)}
                                </ul>
                            </section>
                        );
                    })
                )}
            </SheetPanel>
            <SheetFooter>
                <button onClick={onClose} disabled={compartilhando} title={compartilhando ? 'Aguarde: compartilhando os documentos' : undefined} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px] disabled:opacity-50">Cancelar</button>
                <span className="inline-flex" title={motivoDesligado}>
                    <button
                        onClick={() => void compartilhar()}
                        disabled={n === 0 || compartilhando || carregando}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                    >
                        {compartilhando ? 'Compartilhando…' : `Compartilhar ${n} documento${n === 1 ? '' : 's'}`}
                    </button>
                </span>
            </SheetFooter>
        </Sheet>
    );
};

export default CreditRoomSugerirDocumentos;
