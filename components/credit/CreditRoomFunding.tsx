import React from 'react';
import { Plus, Scale, Trash2 } from 'lucide-react';
import { formatMoney } from '../ui/Format';
import { errorMessage } from '../../hooks/useOrgContext';
import { creditRoomService } from '../../services/creditRoomService';
import {
    FUNDING_KIND_PT,
    FUNDING_SOURCE_KINDS,
    FUNDING_USE_KINDS,
    type CreditRoom,
    type CreditRoomFundingEntry,
    type CreditRoomSide,
    type CreditRoomVersion,
} from '../../types/creditRoom';

/**
 * Quadro de Fontes e Usos — PRD §47.
 *
 * De onde vem o dinheiro e para onde vai. O que o banco checa não são as
 * linhas, é o **fechamento**: Σ fontes = Σ usos. Um quadro que não fecha é uma
 * operação sem resposta para "de onde sai o resto", então a diferença fica no
 * topo, colorida, e não escondida no rodapé de uma tabela.
 *
 * ── Os dois lados leem coisas DIFERENTES, e é o ponto ───────────────────────
 *
 *   TOMADOR  edita o quadro vivo (`credit_rooms.funding_*`).
 *   CREDOR   lê o quadro CONGELADO na versão (`snapshot.fontes_usos`) — nunca
 *            o vivo. É o que faz o banco discutir o mesmo número que foi
 *            enviado, e não o que a empresa editou depois (R2).
 *
 * Por isso o credor não recebe `onSave` nem os campos: não é permissão de
 * tela, é ausência da própria fonte editável do lado dele.
 */

type Accent = 'indigo' | 'portal';

const ACCENTS: Record<Accent, { btn: string; ring: string }> = {
    indigo: { btn: 'bg-blue-600 text-white hover:bg-blue-700', ring: 'focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500' },
    portal: { btn: 'bg-[#E1553C] text-white hover:bg-[#C8452E]', ring: 'focus:ring-2 focus:ring-[#E1553C]/25 focus:border-[#E1553C]' },
};

const th = 'px-6 py-2 border-r border-gray-100 text-table-header font-semibold text-gray-500';
const td = 'px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal';
const campo = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal outline-none transition-all';

const soma = (xs: { amount: number }[]) => xs.reduce((a, e) => a + (Number(e.amount) || 0), 0);
const novoId = () => `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const Tabela: React.FC<{
    titulo: string; lista: 'fontes' | 'usos';
    linhas: { id?: string; label: string; kind: string; amount: number }[];
    total: number; kinds: readonly string[];
    // Içados como props porque este componente vive FORA do pai de propósito:
    // definido lá dentro, ele seria uma função nova a cada render, e o React
    // desmontaria os <input> a cada tecla — o cursor saltaria para fora do
    // campo no meio da digitação.
    editavel: boolean; ring: string;
    mudar: (l: 'fontes' | 'usos', id: string, c: keyof CreditRoomFundingEntry, v: string) => void;
    adicionar: (l: 'fontes' | 'usos') => void;
    remover: (l: 'fontes' | 'usos', id: string) => void;
}> = ({ titulo, lista, linhas, total, kinds, editavel, ring, mudar, adicionar, remover }) => (
    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-2.5 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">{titulo}</h3>
            <span className="text-sm font-semibold text-gray-700">{formatMoney(total)}</span>
        </div>
        <div className="overflow-x-auto">
            <table className="w-full">
                <thead className="bg-gray-50/70 border-b border-gray-100">
                    <tr>
                        <th className={`${th} text-left w-[42%]`}>Descrição</th>
                        <th className={`${th} text-left w-[32%]`}>Natureza</th>
                        <th className={`${th} text-right ${editavel ? '' : 'border-r-0'}`}>Valor</th>
                        {editavel && <th className={`${th} border-r-0 w-12`} />}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {linhas.map((e, idx) => (
                        <tr key={e.id ?? idx} className="hover:bg-gray-50/50">
                            <td className={td}>
                                {editavel ? (
                                    <input
                                        value={e.label}
                                        onChange={ev => mudar(lista, e.id!, 'label', ev.target.value)}
                                        placeholder={lista === 'fontes' ? 'Aporte dos sócios' : 'Execução da obra'}
                                        className={`${campo} ${ring}`}
                                    />
                                ) : (e.label || '—')}
                            </td>
                            <td className={td}>
                                {editavel ? (
                                    <select
                                        value={e.kind}
                                        onChange={ev => mudar(lista, e.id!, 'kind', ev.target.value)}
                                        className={`${campo} ${ring}`}
                                    >
                                        {kinds.map(k => <option key={k} value={k}>{FUNDING_KIND_PT[k] ?? k}</option>)}
                                    </select>
                                ) : (FUNDING_KIND_PT[e.kind] ?? e.kind)}
                            </td>
                            <td className={`${td} text-right ${editavel ? '' : 'border-r-0'}`}>
                                {editavel ? (
                                    <input
                                        type="number" min={0} step="0.01" value={e.amount || ''}
                                        onChange={ev => mudar(lista, e.id!, 'amount', ev.target.value)}
                                        className={`${campo} ${ring} text-right`}
                                    />
                                ) : formatMoney(e.amount)}
                            </td>
                            {editavel && (
                                <td className={`${td} border-r-0 text-center`}>
                                    <button
                                        onClick={() => remover(lista, e.id!)}
                                        title="Remover linha"
                                        className="text-gray-400 hover:text-red-600 transition-colors"
                                    >
                                        <Trash2 className="w-[15px] h-[15px]" />
                                    </button>
                                </td>
                            )}
                        </tr>
                    ))}
                    {!linhas.length && (
                        <tr>
                            <td colSpan={editavel ? 4 : 3} className="px-6 py-6 text-center text-sm text-gray-400">
                                Nenhuma linha.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
        {editavel && (
            <div className="px-6 py-2 border-t border-gray-100">
                <button
                    onClick={() => adicionar(lista)}
                    className="flex items-center gap-1.5 text-[13px] font-medium text-gray-500 hover:text-gray-800 transition-colors"
                >
                    <Plus className="w-[15px] h-[15px]" />
                    Adicionar linha
                </button>
            </div>
        )}
    </div>
);

interface Props {
    room: CreditRoom;
    side: CreditRoomSide;
    /** Obrigatório para o CREDOR: é dele que sai o quadro congelado. */
    versao?: CreditRoomVersion | null;
    accent?: Accent;
    onSaved?: (room: CreditRoom) => void;
}

const CreditRoomFunding: React.FC<Props> = ({ room, side, versao, accent = 'indigo', onSaved }) => {
    const a = ACCENTS[accent];
    const editavel = side === 'TOMADOR';

    const congelado = versao?.snapshot?.fontes_usos ?? null;

    const [fontes, setFontes] = React.useState<CreditRoomFundingEntry[]>(room.fundingSources ?? []);
    const [usos, setUsos] = React.useState<CreditRoomFundingEntry[]>(room.fundingUses ?? []);
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    const [sujo, setSujo] = React.useState(false);

    React.useEffect(() => {
        setFontes(room.fundingSources ?? []);
        setUsos(room.fundingUses ?? []);
        setSujo(false);
    }, [room.id, room.fundingSources, room.fundingUses]);

    // O credor lê o congelado; o tomador, o que está na tela agora — inclusive
    // o que ainda não salvou, senão o total mentiria enquanto ele digita.
    const linhasFontes = editavel ? fontes : (congelado?.fontes ?? []);
    const linhasUsos = editavel ? usos : (congelado?.usos ?? []);
    const totalFontes = editavel ? soma(fontes) : (congelado?.total_fontes ?? 0);
    const totalUsos = editavel ? soma(usos) : (congelado?.total_usos ?? 0);
    const diferenca = Math.round((totalFontes - totalUsos) * 100) / 100;
    // ⚠️ Zero contra zero NÃO é um quadro que fecha, é um quadro sem valores.
    // Dizer "fecha" ali seria a tranquilização mais barata possível — e foi o
    // que a tela dizia em 07/09/2026, com duas linhas cadastradas e R$ 0,00
    // nos dois lados.
    const semValores = totalFontes === 0 && totalUsos === 0;
    const fecha = !semValores && Math.abs(diferenca) < 0.01;

    const mudar = (
        lista: 'fontes' | 'usos', id: string, campoNome: keyof CreditRoomFundingEntry, valor: string,
    ) => {
        const set = lista === 'fontes' ? setFontes : setUsos;
        set(prev => prev.map(e => (e.id === id
            ? { ...e, [campoNome]: campoNome === 'amount' ? Number(valor) || 0 : valor }
            : e)));
        setSujo(true);
    };

    const adicionar = (lista: 'fontes' | 'usos') => {
        const kind = lista === 'fontes' ? FUNDING_SOURCE_KINDS[0] : FUNDING_USE_KINDS[0];
        const nova: CreditRoomFundingEntry = { id: novoId(), label: '', kind, amount: 0 };
        (lista === 'fontes' ? setFontes : setUsos)(prev => [...prev, nova]);
        setSujo(true);
    };

    const remover = (lista: 'fontes' | 'usos', id: string) => {
        (lista === 'fontes' ? setFontes : setUsos)(prev => prev.filter(e => e.id !== id));
        setSujo(true);
    };

    const salvar = async () => {
        setSalvando(true);
        setErro(null);
        try {
            const limpo = (xs: CreditRoomFundingEntry[]) =>
                xs.filter(e => e.label.trim() !== '' || (Number(e.amount) || 0) !== 0)
                  .map(e => ({ ...e, label: e.label.trim(), amount: Number(e.amount) || 0 }));
            const atualizado = await creditRoomService.saveFunding(room, limpo(fontes), limpo(usos));
            setSujo(false);
            onSaved?.(atualizado);
        } catch (e) {
            setErro(errorMessage(e, 'Não foi possível salvar o quadro.'));
        } finally {
            setSalvando(false);
        }
    };

    const vazio = !linhasFontes.length && !linhasUsos.length;

    if (!editavel && !congelado) {
        return (
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm px-6 py-8 text-center">
                <Scale className="w-5 h-5 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">
                    O quadro de Fontes e Usos ainda não foi incluído em uma versão congelada.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm">
                <p className="text-sm font-normal text-gray-500 px-1">
                    {vazio ? 'Quadro ainda não preenchido' : (
                        <>
                            Fontes {formatMoney(totalFontes)} · Usos {formatMoney(totalUsos)} ·{' '}
                            <span className={fecha ? 'text-green-700 font-semibold' : semValores ? 'text-amber-700 font-semibold' : 'text-red-600 font-semibold'}>
                                {fecha ? 'o quadro fecha'
                                    : semValores ? 'nenhum valor lançado'
                                        : `${diferenca > 0 ? 'sobram' : 'faltam'} ${formatMoney(Math.abs(diferenca))}`}
                            </span>
                        </>
                    )}
                    {!editavel && congelado && (
                        <span className="text-gray-400"> · congelado na versão V{versao?.versionNo}</span>
                    )}
                </p>
                {editavel && (
                    <button
                        onClick={() => void salvar()}
                        disabled={salvando || !sujo}
                        className={`flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] font-medium text-[13px] transition-all active:scale-95 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${a.btn}`}
                    >
                        {salvando ? 'Salvando...' : sujo ? 'Salvar quadro' : 'Salvo'}
                    </button>
                )}
            </div>

            {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[10px] px-4 py-3">{erro}</div>}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <Tabela
                    titulo="Fontes" lista="fontes" linhas={linhasFontes} total={totalFontes}
                    kinds={FUNDING_SOURCE_KINDS}
                    editavel={editavel} ring={a.ring} mudar={mudar} adicionar={adicionar} remover={remover}
                />
                <Tabela
                    titulo="Usos" lista="usos" linhas={linhasUsos} total={totalUsos}
                    kinds={FUNDING_USE_KINDS}
                    editavel={editavel} ring={a.ring} mudar={mudar} adicionar={adicionar} remover={remover}
                />
            </div>

            {editavel && (
                <p className="text-xs text-gray-400 px-1">
                    O credor só enxerga este quadro depois que ele entrar em uma versão congelada — o que
                    estiver aqui agora não chega ao banco até o próximo congelamento.
                </p>
            )}
        </div>
    );
};

export default CreditRoomFunding;
