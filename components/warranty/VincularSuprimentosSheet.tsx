import React from 'react';
import { Search, Link2 } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from '../ui/sheet';
import { warrantySuprimentosService, type Vinculavel } from '../../services/warrantySuprimentosService';
import { useFocoAoAbrir } from '../../hooks/useSeletorEmGaveta';

/**
 * Pós-Obra & Garantia › chamado › Suprimentos › "Vincular existente" (2026-10-11, Fase 4.3).
 *
 * Lista SCs e contratos de fornecedor da organização do chamado ainda sem
 * vínculo. Abre recortado na obra do chamado ("Ver de todas as obras" desfaz).
 * Busca e recorte são transitórios (§3.1 do guia — seletor de drawer): zeram
 * ao fechar. Clicar na linha vincula; a trava de organização é do banco.
 *
 * Montado só quando aberto: o `Sheet` mantém os filhos no DOM fechado.
 */
interface Props {
    organizationId: string;
    projectId: string | null;
    nomeDaObra: (projectId: string | null) => string;
    onClose: () => void;
    onEscolher: (item: Vinculavel) => Promise<void>;
}

const TIPO: Record<Vinculavel['tipo'], string> = { solicitacao: 'Solicitação de compra', contrato: 'Contrato' };
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const VincularSuprimentosSheet: React.FC<Props> = ({ organizationId, projectId, nomeDaObra, onClose, onEscolher }) => {
    const [shown, setShown] = React.useState(false);
    React.useEffect(() => { const r = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(r); }, []);
    // Busca focada ao ABRIR: `autoFocus` disparava na montagem, com o Sheet
    // ainda fechado (`inert` desde o #213), e o navegador recusava o foco.
    const buscaRef = React.useRef<HTMLInputElement>(null);
    useFocoAoAbrir(shown, buscaRef);
    const [itens, setItens] = React.useState<Vinculavel[]>([]);
    const [carregando, setCarregando] = React.useState(true);
    const [erro, setErro] = React.useState<string | null>(null);
    const [busca, setBusca] = React.useState('');
    const [todasAsObras, setTodasAsObras] = React.useState(!projectId);
    const [vinculando, setVinculando] = React.useState<string | null>(null);

    React.useEffect(() => {
        let cancelled = false;
        warrantySuprimentosService.listarVinculaveis(organizationId)
            .then(d => { if (!cancelled) setItens(d); })
            .catch(e => { console.error('[Vincular existente]', e); if (!cancelled) setErro('Não foi possível carregar as solicitações e contratos.'); })
            .finally(() => { if (!cancelled) setCarregando(false); });
        return () => { cancelled = true; };
    }, [organizationId]);

    const daObra = itens.filter(i => i.projectId === projectId).length;
    const visiveis = React.useMemo(() => {
        const q = busca.trim().toLowerCase();
        return itens
            .filter(i => todasAsObras || i.projectId === projectId)
            .filter(i => !q || i.numero.toLowerCase().includes(q) || i.descricao.toLowerCase().includes(q)
                || nomeDaObra(i.projectId).toLowerCase().includes(q));
    }, [itens, busca, todasAsObras, projectId, nomeDaObra]);

    const fechar = () => { setShown(false); window.setTimeout(onClose, 250); };
    const escolher = async (i: Vinculavel) => {
        if (vinculando) return;
        setVinculando(i.id);
        try { await onEscolher(i); fechar(); } finally { setVinculando(null); }
    };

    const th = 'px-3 py-2 border-r border-gray-100 last:border-r-0 text-left';
    const td = 'px-3 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700';

    return (
        <Sheet open={shown} onClose={fechar} side="right" size="2xl" zIndex={10000}>
            <SheetHeader onClose={fechar}>
                <SheetTitle>Vincular solicitação ou contrato existente</SheetTitle>
                <SheetDescription>Clique na linha para ligar ao chamado. Só aparecem os que ainda não têm chamado.</SheetDescription>
            </SheetHeader>
            <div className="p-4 border-b border-gray-100 shrink-0 space-y-3">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        ref={buscaRef}
                        value={busca}
                        onChange={e => setBusca(e.target.value)}
                        aria-label="Buscar por número, descrição ou obra"
                        placeholder="Buscar por número, descrição ou obra..."
                        className="w-full h-9 pl-9 pr-3 rounded-[6px] bg-slate-50 border border-slate-200 outline-none focus:border-slate-300 placeholder-slate-400 text-sm text-slate-700"
                    />
                </div>
                {projectId && (
                    <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>{todasAsObras ? `Mostrando todas as obras (${itens.length}).` : `Mostrando os ${daObra} da obra do chamado.`}</span>
                        <button className="text-blue-600 hover:text-blue-800 font-medium" onClick={() => setTodasAsObras(v => !v)}>
                            {todasAsObras ? 'Só da obra do chamado' : 'Ver de todas as obras'}
                        </button>
                    </div>
                )}
            </div>
            <SheetPanel className="p-0">
                {erro && <p className="p-4 text-sm text-red-600" role="alert">{erro}</p>}
                <table className="w-full table-fixed">
                    <colgroup>
                        <col style={{ width: 150 }} />
                        <col style={{ width: 140 }} />
                        <col />
                        <col style={{ width: 120 }} />
                        <col style={{ width: 120 }} />
                    </colgroup>
                    <thead className="bg-white sticky top-0 z-10 text-xs font-semibold text-gray-700">
                        <tr>
                            <th className={th}>Tipo</th>
                            <th className={th}>Número</th>
                            <th className={th}>Descrição / obra</th>
                            <th className={th}>Status</th>
                            <th className={`${th} text-right`}>Valor</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {carregando ? (
                            <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">Carregando...</td></tr>
                        ) : visiveis.length === 0 ? (
                            <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                                {itens.length === 0 ? 'Nenhuma solicitação ou contrato sem chamado nesta organização.' : 'Nada encontrado com esse recorte.'}
                            </td></tr>
                        ) : visiveis.map(i => (
                            <tr
                                key={`${i.tipo}:${i.id}`}
                                onClick={() => escolher(i)}
                                aria-disabled={!!vinculando || undefined}
                                className={`cursor-pointer transition-colors hover:bg-blue-50/50 ${vinculando === i.id ? 'opacity-50' : ''}`}
                            >
                                <td className={td}>{TIPO[i.tipo]}</td>
                                <td className={`${td} text-blue-600`}>
                                    <span className="inline-flex items-center gap-1"><Link2 className="w-3.5 h-3.5" />{i.numero}</span>
                                </td>
                                <td className={td}>
                                    <p className="break-words">{i.descricao}</p>
                                    <p className="text-xs text-gray-400 truncate">{nomeDaObra(i.projectId)}</p>
                                </td>
                                <td className={`${td} text-gray-600`}>{i.status}</td>
                                <td className={`${td} text-right font-medium text-gray-800`}>{brl(i.valor)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </SheetPanel>
        </Sheet>
    );
};

export default VincularSuprimentosSheet;
