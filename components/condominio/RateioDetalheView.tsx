// components/condominio/RateioDetalheView.tsx
// Detalhe de um rateio — TELA, não painel.
//
// Era um `Sheet size="2xl"`. Virou tela a pedido do usuário (25/09/2026), e
// "tela" tem significado específico neste app: **troca de conteúdo IN-FLOW**,
// sem overlay de espécie alguma — nem `fixed inset-0`, nem `Sheet`, nem
// `Modal`. A sidebar e o cromo do app continuam visíveis, o scroll é o da
// página. Referência canônica: `ContractDetailView.tsx`.
//
// Quem monta faz o early return: `CondominioDetail` devolve esta tela no lugar
// do seu próprio conteúdo. Não precisa da caixa `absolute inset-0` porque a
// cadeia inteira até aqui é in-flow (`CondominiosModule` → `CondominioDetail`).
//
// O `h1` é **2xl**, não 3xl: 3xl é só o topo de uma lista-raiz (§20). E a raiz
// NÃO declara `px-*` — o gutter é o do `<main>` (§20.2).

import React from 'react';
import { ArrowLeft, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import Breadcrumb from '../ui/Breadcrumb';
// As MESMAS tabelas da prévia e do relatório. Reimplementá-las aqui criaria um
// terceiro desenho para o mesmo dado — foi o defeito corrigido em 24/09.
import { TabelaCotas, TabelaDespesas } from './FinanceiroTab';
// A identidade do condomínio tem um helper canônico — montar "code - name"
// à mão aqui daria um rótulo que diverge do cabeçalho de onde se veio.
import { identidadeDoCondominio } from '../../utils/condominioIdentidade';
import {
    condominioRateioService, CRITERIO_LABEL,
    type Rateio, type DespesaRateio, type CotaDoRateio,
} from '../../services/condominioRateioService';
import type { Empreendimento } from '../../types/empreendimento';

const STATUS_LABEL: Record<string, string> = {
    RASCUNHO: 'Rascunho', FECHADO: 'Fechado', CANCELADO: 'Cancelado',
};
// §8 — texto colorido, sem pílula.
const STATUS_COR: Record<string, string> = {
    RASCUNHO: 'text-amber-600', FECHADO: 'text-emerald-600', CANCELADO: 'text-gray-500',
};

const dinheiro = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** `YYYY-MM-DD` → `MM/AAAA`, sem passar por `Date` (fuso). */
const competenciaBR = (iso: string) => {
    const [a, m] = String(iso).slice(0, 10).split('-');
    return `${m}/${a}`;
};
const dataBR = (iso?: string | null) => {
    if (!iso) return null;
    const [a, m, d] = String(iso).slice(0, 10).split('-');
    return d ? `${d}/${m}/${a}` : null;
};

interface Props {
    empreendimento: Empreendimento;
    rateio: Rateio;
    /** Volta para a aba Financeiro do condomínio. */
    onBack: () => void;
    /** Volta para a LISTA de condomínios — o primeiro salto da migalha. */
    onBackParaLista: () => void;
    /** Ação da linha do título (§17) — o relatório em PDF, quando o pai oferece. */
    acaoDoTitulo?: { label: string; onClick: () => void; icone?: React.ReactNode };
}

const RateioDetalheView: React.FC<Props> = ({
    empreendimento, rateio, onBack, onBackParaLista, acaoDoTitulo,
}) => {
    const [carregando, setCarregando] = React.useState(true);
    const [erro, setErro] = React.useState<string | null>(null);
    const [despesas, setDespesas] = React.useState<DespesaRateio[]>([]);
    const [cotas, setCotas] = React.useState<CotaDoRateio[]>([]);
    // Aviso INLINE, e não toast: esta tela não tem provedor de toast montado, e
    // um `useToast()` sem o renderer na árvore falha calado — já aconteceu.
    const [aviso, setAviso] = React.useState<{ texto: string; erro?: boolean } | null>(null);

    React.useEffect(() => {
        let vivo = true;
        setCarregando(true);
        setErro(null);
        // As duas metades do documento, em paralelo: o que se gastou e quem
        // paga o quê. Uma sem a outra não é prestação de contas.
        Promise.all([
            condominioRateioService.listarDespesas(rateio.id),
            condominioRateioService.listarCotas(rateio.id),
        ])
            .then(([ds, cs]) => { if (vivo) { setDespesas(ds); setCotas(cs); } })
            .catch((e: any) => { if (vivo) setErro(e?.message || 'Erro ao carregar o rateio.'); })
            .finally(() => { if (vivo) setCarregando(false); });
        return () => { vivo = false; };
    }, [rateio.id]);

    /**
     * Corrige a descrição de uma despesa do rascunho. §22: costura no array
     * local — recarregar a tela por causa de um texto perderia a rolagem e
     * piscaria a lista.
     */
    const editarDescricao = async (d: DespesaRateio, nova: string) => {
        if (!d.id) return;
        try {
            // A correção vai para o LANÇAMENTO, não para este rateio: uma
            // descrição, um lugar. Sem `transaction_id` (rateio montado à mão)
            // o serviço grava no snapshot, que é o único lugar que existe.
            await condominioRateioService.atualizarDescricaoDespesa(d.id, nova, d.transaction_id);
            setDespesas(prev => prev.map(x => (x.id === d.id ? { ...x, descricao: nova.trim() } : x)));
            setAviso({ texto: d.transaction_id
                ? 'Descrição corrigida no lançamento — vale também em Contas a Pagar, na aba Despesas e no portal.'
                : 'Descrição corrigida neste rateio.' });
        } catch (e: any) {
            setAviso({ texto: e?.message || 'Erro ao salvar a descrição.', erro: true });
        }
    };

    const identidade = identidadeDoCondominio(empreendimento.name, empreendimento.code);
    const titulo = rateio.number ? `Rateio ${rateio.number}` : `Rateio de ${competenciaBR(rateio.competencia)}`;
    const fechadoEm = dataBR(rateio.fechado_em);
    const diferenca = Number(rateio.total_despesas || 0) - Number(rateio.total_rateado || 0);

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* §23 — a migalha agora tem DOIS saltos (Condomínios → condomínio →
                rateio), que é exatamente o critério canônico da seção. Quando o
                condomínio tinha um salto só, ela foi usada por escolha do
                usuário e registrada como divergência consciente; aqui deixa de
                ser divergência. */}
            <div>
                <Breadcrumb
                    className="mb-1.5"
                    items={[
                        { label: 'Condomínios', onClick: onBackParaLista },
                        { label: identidade, onClick: onBack },
                        { label: titulo },
                    ]}
                />
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                        {/* A seta fica na LINHA do título, não acima dele — foi o
                            pedido de 23/09 que trouxe a migalha para esta tela. */}
                        <button
                            onClick={onBack}
                            title="Voltar para o Financeiro do condomínio"
                            className="p-2.5 bg-white border border-gray-200 rounded-[6px] text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-all shrink-0"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                        <div className="min-w-0">
                            <h1 className="text-2xl font-black text-gray-900 tracking-tight">{titulo}</h1>
                            <p className="text-gray-400 text-sm mt-1.5 font-medium">
                                {identidade}
                                {' · '}{competenciaBR(rateio.competencia)}
                                {' · '}{rateio.tipo === 'EXTRAORDINARIO' ? 'Extraordinário' : 'Ordinário'}
                            </p>
                        </div>
                    </div>
                    {/* §17 — botão primário compacto, o único azul sólido da tela. */}
                    {acaoDoTitulo && (
                        <button
                            onClick={acaoDoTitulo.onClick}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0"
                        >
                            {acaoDoTitulo.icone}
                            {acaoDoTitulo.label}
                        </button>
                    )}
                </div>
            </div>

            {/* Identificação — o que o `SheetDescription` carregava numa linha só
                e agora cabe inteiro. §30: par rótulo/valor em grade. */}
            <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4">
                <div className="border-b border-gray-100 pb-3">
                    <h3 className="text-sm font-semibold text-gray-900">Identificação</h3>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
                    <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-slate-500">Critério</p>
                        <p className="text-sm font-normal text-gray-700">{CRITERIO_LABEL[rateio.criterio]}</p>
                    </div>
                    <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-slate-500">Situação</p>
                        <p className={`text-sm font-normal ${STATUS_COR[rateio.status] ?? 'text-gray-700'}`}>
                            {STATUS_LABEL[rateio.status] ?? rateio.status}
                            {fechadoEm ? ` em ${fechadoEm}` : ''}
                        </p>
                    </div>
                    <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-slate-500">Total das despesas</p>
                        <p className="text-sm font-medium text-gray-800">{dinheiro(rateio.total_despesas)}</p>
                    </div>
                    <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-slate-500">Total rateado</p>
                        <p className="text-sm font-medium text-gray-800">{dinheiro(rateio.total_rateado)}</p>
                    </div>
                    {/* A diferença só aparece quando existe: zero é o caso normal,
                        e um "R$ 0,00" permanente ensina o olho a ignorar o campo
                        justamente quando ele passa a ter conteúdo. */}
                    {Math.abs(diferenca) >= 0.005 && (
                        <div className="space-y-1.5">
                            <p className="text-xs font-semibold text-slate-500">Diferença</p>
                            <p className="text-sm font-medium text-amber-600">{dinheiro(diferenca)}</p>
                        </div>
                    )}
                    {rateio.cobranca_gerada_em && (
                        <div className="space-y-1.5">
                            <p className="text-xs font-semibold text-slate-500">Cobrança</p>
                            <p className="text-sm font-normal text-emerald-600">
                                Gerada{dataBR(rateio.cobranca_gerada_em) ? ` em ${dataBR(rateio.cobranca_gerada_em)}` : ''}
                            </p>
                        </div>
                    )}
                </div>
                {rateio.observacoes && (
                    <div className="space-y-1.5 pt-1">
                        <p className="text-xs font-semibold text-slate-500">Observações</p>
                        <p className="text-sm font-normal text-gray-700 whitespace-pre-line">{rateio.observacoes}</p>
                    </div>
                )}
            </div>

            {erro && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-[10px] px-4 py-3 text-sm">{erro}</div>
            )}

            {carregando ? (
                <div className="text-center py-16">
                    <Loader2 className="w-8 h-8 text-blue-600 mx-auto animate-spin" />
                    <p className="mt-2 text-gray-500">Carregando o rateio...</p>
                </div>
            ) : (
                <>
                    {/* COTAS primeiro: a pergunta que se faz a um rateio é "quanto
                        minha unidade deve", e a resposta ficava inalcançável
                        depois que a cobrança era gerada (a sheet de cobrança some
                        com o botão). */}
                    <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4">
                        <div className="border-b border-gray-100 pb-3">
                            <h3 className="text-sm font-semibold text-gray-900">Quem paga quanto</h3>
                        </div>
                        {cotas.length === 0 ? (
                            <p className="text-sm text-gray-500 py-4">
                                Nenhuma cota gravada — nenhuma unidade recebeu valor neste rateio.
                            </p>
                        ) : (
                            <TabelaCotas
                                storageKey="condominio:rateio:detalhe:cotas"
                                dense={false}
                                cotas={cotas.map(c => ({
                                    chave: c.id,
                                    unidade: c.unitLabel,
                                    pagador: c.clientNome,
                                    valor: c.valor,
                                }))}
                            />
                        )}
                    </div>

                    <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4">
                        <div className="border-b border-gray-100 pb-3">
                            <h3 className="text-sm font-semibold text-gray-900">Despesas do rateio</h3>
                        </div>
                        {aviso && (
                            <p className={`text-sm flex items-start gap-1.5 ${aviso.erro ? 'text-red-600' : 'text-emerald-600'}`}>
                                {aviso.erro
                                    ? <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                                    : <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />}
                                {aviso.texto}
                            </p>
                        )}
                        {despesas.length === 0 ? (
                            <p className="text-sm text-gray-500 py-4">Nenhuma despesa gravada neste rateio.</p>
                        ) : (
                            /* A edição da descrição só existe em RASCUNHO. Fechado
                               é prestação de contas: o condômino já recebeu aquele
                               documento. */
                            <TabelaDespesas
                                despesas={despesas}
                                comData={false}
                                storageKey="condominio:rateio:detalhe:despesas"
                                dense={false}
                                onEditarDescricao={rateio.status === 'RASCUNHO' ? editarDescricao : undefined}
                            />
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default RateioDetalheView;
