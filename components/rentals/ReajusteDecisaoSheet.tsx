import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import MoneyCentsInput from '../ui/MoneyCentsInput';
import { reajusteLocacaoService, PreviaReajuste } from '../../services/reajusteLocacaoService';
import { valorAposReajuste, motivoDaDataDeReajuste, DecisaoReajuste } from '../../utils/reajusteAniversario';

/**
 * Decisão do reajuste de UM aniversário (Locações › Reajustes). O usuário escolhe
 * 100% do índice, outro percentual, o valor novo, ou não reajustar — pedido de
 * 24/11/2026. A data do reajuste vem pré-preenchida com a calculada e pode ser
 * trocada (pedido do mesmo dia); índice, parcelas e próximo reajuste seguem a
 * data escolhida. A regra mora em reajusteLocacaoService/utils/reajusteAniversario.
 */

const fmtDate = (iso?: string | null) => {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
};
const fmtMes = (iso?: string | null) => (iso ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const fmtCur = (n?: number | null) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

const ROTULO = 'block text-xs font-semibold text-slate-500';
const CAMPO = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all';

type Tipo = DecisaoReajuste['tipo'];

interface Props {
    /** Contrato a decidir; null = fechado. */
    contractId: string | null;
    onClose: () => void;
    /** Depois de gravar: mensagem para o aviso e o contrato que mudou. */
    onDecidido: (mensagem: string, contractId: string) => void;
    onErro: (mensagem: string) => void;
}

const ReajusteDecisaoSheet: React.FC<Props> = ({ contractId, onClose, onDecidido, onErro }) => {
    const [previa, setPrevia] = useState<PreviaReajuste | null>(null);
    const [carregando, setCarregando] = useState(false);
    const [falha, setFalha] = useState<string | null>(null);
    const [gravando, setGravando] = useState(false);
    const [tipo, setTipo] = useState<Tipo>('INDICE');
    const [percentual, setPercentual] = useState('');
    const [valor, setValor] = useState('');
    const [observacao, setObservacao] = useState('');
    /** Data do reajuste: começa na calculada pelo app; o usuário pode trocar. */
    const [dataReajuste, setDataReajuste] = useState('');
    const [dataCalculada, setDataCalculada] = useState<string | null>(null);
    const [recalculando, setRecalculando] = useState(false);

    useEffect(() => {
        if (!contractId) return;
        let vivo = true;
        setPrevia(null); setFalha(null); setCarregando(true);
        setPercentual(''); setValor(''); setObservacao('');
        setDataReajuste(''); setDataCalculada(null);
        reajusteLocacaoService.previa(contractId)
            .then(p => {
                if (!vivo) return;
                setPrevia(p);
                setDataCalculada(p.aniversario.aniversario);
                setDataReajuste(p.aniversario.aniversario);
                setTipo(p.fatorIndice ? 'INDICE' : 'PERCENTUAL');
            })
            .catch(e => { if (vivo) setFalha(e instanceof Error ? e.message : 'Não foi possível calcular o reajuste.'); })
            .finally(() => { if (vivo) setCarregando(false); });
        return () => { vivo = false; };
    }, [contractId]);

    const motivoData = previa ? motivoDaDataDeReajuste(previa.contrato, dataReajuste) : null;

    // Data trocada (e válida): refaz a prévia — índice do mês escolhido, parcelas a partir dela.
    useEffect(() => {
        if (!contractId || !previa || motivoData || dataReajuste === previa.aniversario.aniversario) return;
        let vivo = true;
        setRecalculando(true);
        reajusteLocacaoService.previa(contractId, dataReajuste)
            .then(p => {
                if (!vivo) return;
                setPrevia(p);
                if (!p.fatorIndice) setTipo(t => (t === 'INDICE' ? 'PERCENTUAL' : t));
            })
            .catch(e => { if (vivo) onErro(e instanceof Error ? e.message : 'Não foi possível recalcular o reajuste.'); })
            .finally(() => { if (vivo) setRecalculando(false); });
        return () => { vivo = false; };
    // onErro fora das dependências: o pai recria a função a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [contractId, previa, motivoData, dataReajuste]);

    const decisao: DecisaoReajuste | null = useMemo(() => {
        if (tipo === 'INDICE' || tipo === 'NAO_APLICADO') return { tipo };
        if (tipo === 'PERCENTUAL') return percentual.trim() ? { tipo, percentual: Number(percentual.replace(',', '.')) } : null;
        return valor.trim() ? { tipo, valor: Number(valor.replace(',', '.')) } : null;
    }, [tipo, percentual, valor]);

    // Resultado ao vivo — o mesmo cálculo que o serviço grava.
    const resultado = useMemo(() => {
        if (!previa || !decisao) return null;
        try { return { ...valorAposReajuste(previa.valorAtual, previa.fatorIndice, decisao), erro: null as string | null }; }
        catch (e) { return { valorNovo: previa.valorAtual, percentualAplicado: 0, erro: e instanceof Error ? e.message : 'Valor inválido.' }; }
    }, [previa, decisao]);

    const motivoNaoGrava = gravando ? 'Gravando…'
        : !previa ? 'Aguarde o cálculo do reajuste.'
        : motivoData ?? (recalculando || dataReajuste !== previa.aniversario.aniversario ? 'Recalculando o reajuste para a data escolhida…' : null)
        ?? (!previa.aniversario.dentroDaVigencia ? 'Este aniversário é depois do fim da vigência — o caso é de renovação.'
        : !decisao ? (tipo === 'PERCENTUAL' ? 'Informe o percentual.' : 'Informe o valor novo do aluguel.')
        : resultado?.erro ?? null);

    const gravar = async () => {
        if (!contractId || !decisao || motivoNaoGrava) return;
        setGravando(true);
        try {
            const { contrato, registro } = await reajusteLocacaoService.decidir(contractId, decisao, observacao, dataReajuste);
            onDecidido(
                registro.decisao === 'NAO_APLICADO'
                    ? `Reajuste de ${fmtDate(registro.aniversario)} do contrato ${contrato.number} registrado sem reajuste.`
                    : `Contrato ${contrato.number} reajustado para ${fmtCur(registro.valor_novo)} (${fmtPct(registro.percentual_aplicado)}); ${registro.parcelas_atualizadas} parcela(s) atualizada(s).`,
                contractId,
            );
        } catch (e) {
            onErro(e instanceof Error ? e.message : 'Erro ao gravar o reajuste.');
        } finally {
            setGravando(false);
        }
    };

    const a = previa?.aniversario;
    const pctIndice = previa?.fatorIndice ? (previa.fatorIndice - 1) * 100 : null;
    const opcoes: { id: Tipo; titulo: string; texto: string; desligado?: string }[] = [
        {
            id: 'INDICE', titulo: '100% do índice',
            texto: pctIndice != null ? `${previa?.indice} ${fmtMes(previa?.base?.mes)} → ${fmtMes(previa?.atual?.mes)}: ${fmtPct(pctIndice)}` : 'Índice não cadastrado para as datas do reajuste.',
            desligado: pctIndice == null ? `Cadastre o ${previa?.indice ?? 'índice'} de ${fmtMes(a?.aniversario)} em Configurações do Sistema › Índices de Reajuste.` : undefined,
        },
        { id: 'PERCENTUAL', titulo: 'Outro percentual', texto: 'O percentual acordado, maior ou menor que o índice.' },
        { id: 'VALOR', titulo: 'Valor novo do aluguel', texto: 'Digitar o aluguel que passa a valer.' },
        { id: 'NAO_APLICADO', titulo: 'Não reajustar', texto: 'O aluguel continua o mesmo; fica registrado e passa para o próximo aniversário.' },
    ];

    return (
        <Sheet open={!!contractId} onClose={onClose} size="lg">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Reajuste {previa ? `do contrato ${previa.contrato.number}` : ''}</SheetTitle>
                <SheetDescription>
                    {a ? `Aniversário em ${fmtDate(a.aniversario)} · período de ${fmtDate(a.dataBase)} a ${fmtDate(a.aniversario)}` : 'Calculando…'}
                </SheetDescription>
            </SheetHeader>

            <SheetPanel className="p-6">
                {carregando ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando…</p>
                    </div>
                ) : falha ? (
                    <div className="flex items-start gap-2 bg-red-50 border border-red-100 text-red-700 rounded-[10px] p-4 text-sm">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span>{falha}</span>
                    </div>
                ) : previa && (
                    <div className="space-y-6">
                        <div className="bg-white rounded-[10px] border border-gray-200 px-4 py-3">
                            <p className="text-sm font-semibold text-gray-900">Aluguel atual: {fmtCur(previa.valorAtual)}</p>
                            <p className="text-xs text-gray-500 mt-1">
                                {previa.indice ?? 'Sem índice'} · próximo aniversário depois deste: {fmtDate(a?.proximo)}
                                {previa.contrato.end_date ? ` · vigência até ${fmtDate(previa.contrato.end_date)}` : ''}
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="reajuste-data" className={ROTULO}>Data do reajuste</label>
                            <div className="w-44">
                                <input
                                    id="reajuste-data" type="date"
                                    value={dataReajuste}
                                    onChange={e => setDataReajuste(e.target.value)}
                                    aria-invalid={!!motivoData}
                                    aria-describedby="reajuste-data-ajuda"
                                    className={CAMPO}
                                />
                            </div>
                            {motivoData && <p className="text-xs text-red-600 px-1">{motivoData}</p>}
                            <p id="reajuste-data-ajuda" className="text-xs text-gray-500 px-1">
                                Calculada pelo app: {fmtDate(dataCalculada)} (data-base {fmtDate(a?.dataBase)} + periodicidade).
                                {' '}O índice, as parcelas e o próximo reajuste seguem a data escolhida.
                                {dataCalculada && dataReajuste !== dataCalculada && (
                                    <>
                                        {' '}
                                        <button type="button" onClick={() => setDataReajuste(dataCalculada)} className="text-blue-600 hover:text-blue-700 hover:underline">
                                            Usar a calculada
                                        </button>
                                    </>
                                )}
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            <p id="reajuste-decisao" className={ROTULO}>Como reajustar</p>
                            <div role="radiogroup" aria-labelledby="reajuste-decisao" className="space-y-2">
                                {opcoes.map(op => (
                                    <div key={op.id} title={op.desligado}>
                                        <button
                                            type="button"
                                            role="radio"
                                            aria-checked={tipo === op.id}
                                            disabled={!!op.desligado}
                                            onClick={() => setTipo(op.id)}
                                            className={`w-full text-left px-4 py-3 rounded-[10px] border transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                                                tipo === op.id ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/20' : 'border-gray-200 bg-white hover:border-gray-300'
                                            }`}
                                        >
                                            <span className="block text-sm font-semibold text-gray-900">{op.titulo}</span>
                                            <span className="block text-xs text-gray-500 mt-1">{op.desligado ?? op.texto}</span>
                                        </button>
                                        {tipo === op.id && op.id === 'PERCENTUAL' && (
                                            <div className="relative w-40 mt-2 ml-4">
                                                <input
                                                    type="number" step="0.01" inputMode="decimal" autoFocus
                                                    aria-label="Percentual de reajuste"
                                                    value={percentual} onChange={e => setPercentual(e.target.value)}
                                                    placeholder="0,00"
                                                    className={`${CAMPO} pr-8 placeholder:text-gray-400`}
                                                />
                                                <span aria-hidden="true" className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none">%</span>
                                            </div>
                                        )}
                                        {tipo === op.id && op.id === 'VALOR' && (
                                            <div className="w-48 mt-2 ml-4">
                                                <MoneyCentsInput aria-label="Valor novo do aluguel" value={valor} onChange={v => setValor(v)} className={CAMPO} />
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="reajuste-obs" className={ROTULO}>Observação</label>
                            <input id="reajuste-obs" type="text" value={observacao} onChange={e => setObservacao(e.target.value)}
                                placeholder="Opcional — ex.: acordo com o locatário" className={`${CAMPO} placeholder:text-gray-400`} />
                        </div>

                        {resultado && !resultado.erro && !motivoNaoGrava && (
                            <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 text-blue-800 rounded-[10px] p-4 text-sm">
                                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                                {tipo === 'NAO_APLICADO' ? (
                                    <span>O aluguel continua {fmtCur(previa.valorAtual)}. O próximo reajuste passa a ser em {fmtDate(a?.proximo)}.</span>
                                ) : (
                                    <span>
                                        Aluguel de {fmtCur(previa.valorAtual)} para <strong>{fmtCur(resultado.valorNovo)}</strong> ({fmtPct(resultado.percentualAplicado)}).
                                        {' '}{previa.parcelasEmAberto} parcela(s) em aberto com vencimento a partir de {fmtDate(a?.aniversario)} passam
                                        ao valor novo; pagas, conciliadas e com valor alterado à mão não mudam. Próximo reajuste: {fmtDate(a?.proximo)}.
                                    </span>
                                )}
                            </div>
                        )}
                        {resultado?.erro && <p className="text-xs text-red-600">{resultado.erro}</p>}
                    </div>
                )}
            </SheetPanel>

            <SheetFooter>
                <button type="button" onClick={onClose} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">
                    Voltar
                </button>
                <span className="inline-flex" title={motivoNaoGrava ?? undefined}>
                    <button
                        type="button"
                        onClick={gravar}
                        disabled={!!motivoNaoGrava}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {gravando ? 'Gravando…' : tipo === 'NAO_APLICADO' ? 'Registrar sem reajuste' : 'Aplicar reajuste'}
                    </button>
                </span>
            </SheetFooter>
        </Sheet>
    );
};

export default ReajusteDecisaoSheet;
