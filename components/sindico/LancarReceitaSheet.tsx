import React from 'react';
import { AlertCircle, CalendarClock, Landmark, Loader2, Tag, User } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import MoneyCentsInput from '../ui/MoneyCentsInput';
import CostCenterSelect from '../CostCenterSelect';
import PlanoContasSelect from '../PlanoContasSelect';
import HierarchicalSelect from '../HierarchicalSelect';
import { GhostButton, PrimaryButton } from '../portal/PortalKit';
import {
    sindicoPortalService, type CondominioDoFinanceiro, type IdentidadeDoSindico, type UnidadeParaSindico,
} from '../../services/sindicoPortalService';
import { FORMAS_PAGAMENTO } from '../../utils/baixaRecebivel';
import { hojeEmBrasilia } from '../../utils/mandatoSindico';

/**
 * Portal do Síndico › Financeiro › Contas a receber › Lançar receita (G2a, 24/10/2026).
 * Receita avulsa do condomínio (multa, aluguel do salão, reembolso). Quem paga
 * é um ocupante do prédio — ou um nome livre. A cota do rateio NÃO nasce aqui:
 * ela vem de Prestação de contas › Gerar cotas.
 * Plano: docs/planos/2026-10-24-portal-sindico-gestao-completa.md
 */

const ROTULO = 'text-xs font-semibold text-slate-500';
const CAMPO = 'w-full h-10 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#E1553C]/20 focus:border-[#E1553C] disabled:bg-gray-50 disabled:cursor-not-allowed';

const Secao: React.FC<{ icon: React.ComponentType<{ className?: string }>; titulo: string }> = ({ icon: Icon, titulo }) => (
    <div className="flex items-center gap-2 text-[13px] font-semibold text-[#1F2430]">
        <Icon className="w-4 h-4 text-[#E1553C]" /> {titulo}
    </div>
);

const Campo: React.FC<React.PropsWithChildren<{ label: string; dica?: React.ReactNode; htmlFor?: string; className?: string }>> = ({ label, dica, htmlFor, className = '', children }) => (
    <div className={`space-y-1.5 ${className}`}>
        <label className={ROTULO} htmlFor={htmlFor}>{label}</label>
        {children}
        {dica ? <p className="text-xs text-gray-500 leading-snug">{dica}</p> : null}
    </div>
);

const OUTRO = '__outro__';

interface Props {
    open: boolean;
    identidade: IdentidadeDoSindico;
    condominio: CondominioDoFinanceiro | null;
    unidades: UnidadeParaSindico[];
    onClose: () => void;
    onSalvo: (mensagem: string) => void;
}

const LancarReceitaSheet: React.FC<Props> = ({ open, identidade, condominio, unidades, onClose, onSalvo }) => {
    const hoje = hojeEmBrasilia();
    const raiz = condominio?.centros.find(c => !c.parentId) ?? condominio?.centros[0];

    const [pagador, setPagador] = React.useState('');
    const [nomeLivre, setNomeLivre] = React.useState('');
    const [descricao, setDescricao] = React.useState('');
    const [valorTexto, setValorTexto] = React.useState('');
    const [vencimento, setVencimento] = React.useState(hoje);
    const [competencia, setCompetencia] = React.useState('');
    const [centro, setCentro] = React.useState<string | null>(raiz?.id ?? null);
    const [categoria, setCategoria] = React.useState<string | null>(null);
    const [plano, setPlano] = React.useState<string | null>(null);
    const [forma, setForma] = React.useState('');
    const [conta, setConta] = React.useState('');
    const [jaRecebido, setJaRecebido] = React.useState(false);
    const [dataRecebimento, setDataRecebimento] = React.useState(hoje);
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!open) return;
        setPagador(''); setNomeLivre(''); setDescricao(''); setValorTexto(''); setVencimento(hoje); setCompetencia('');
        setCentro(raiz?.id ?? null); setCategoria(null); setPlano(null); setForma(''); setConta('');
        setJaRecebido(false); setDataRecebimento(hoje); setErro(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // Ocupantes do prédio, uma vez cada (a mesma pessoa pode estar em várias unidades).
    const ocupantes = React.useMemo(() => {
        const mapa = new Map<string, { id: string; nome: string; unidades: string[] }>();
        for (const u of unidades.filter(x => x.condominioId === condominio?.id)) {
            for (const o of u.ocupacoes) {
                const atual = mapa.get(o.clientId) ?? { id: o.clientId, nome: o.nome, unidades: [] };
                const rotulo = [u.torre, u.unidade].filter(Boolean).join(' · ');
                if (!atual.unidades.includes(rotulo)) atual.unidades.push(rotulo);
                mapa.set(o.clientId, atual);
            }
        }
        return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    }, [unidades, condominio?.id]);

    const valor = valorTexto === '' ? 0 : Number(valorTexto);
    const centros = (condominio?.centros ?? []).map(c => ({ id: c.id, code: c.code, name: c.name, parent_id: c.parentId }));
    const contas = condominio?.contas ?? [];
    const sujo = !!(pagador || descricao.trim() || valorTexto || categoria);

    const motivo = salvando ? 'Gravando…'
        : !condominio ? 'Nenhum condomínio disponível para lançar.'
            : !pagador ? 'Escolha quem paga.'
                : pagador === OUTRO && !nomeLivre.trim() ? 'Escreva o nome de quem paga.'
                    : !descricao.trim() ? 'Informe a descrição.'
                        : !(valor >= 0.01) ? 'Informe um valor maior que zero.'
                            : !vencimento ? 'Informe o vencimento.'
                                : !centro ? 'Escolha o centro de custo.'
                                    : !categoria ? 'Escolha a conta financeira.'
                                        : jaRecebido && (!dataRecebimento || dataRecebimento > hoje) ? 'Informe a data do recebimento (não pode ser futura).'
                                            : null;

    const salvar = async () => {
        if (!condominio || motivo) return;
        setSalvando(true);
        setErro(null);
        try {
            await sindicoPortalService.lancarReceber(identidade, condominio.id, {
                description: descricao.trim(), amount: valor, due_date: vencimento,
                competencia_date: competencia ? `${competencia}-01` : null,
                cost_center_id: centro!, category_id: categoria!, plano_de_contas_id: plano,
                client_id: pagador === OUTRO ? null : pagador, party_name: pagador === OUTRO ? nomeLivre.trim() : null,
                payment_type: forma || null, payment_account_id: conta || null,
            }, { jaRecebido, dataRecebimento: jaRecebido ? dataRecebimento : null });
            onSalvo(jaRecebido ? 'Receita lançada e recebida.' : 'Receita lançada em Contas a receber.');
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível lançar a receita.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={open} onClose={onClose} size="lg" dirty={sujo && !salvando}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Lançar receita</SheetTitle>
                <SheetDescription>Valor que o condomínio tem a receber, fora das cotas do rateio</SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-4 md:p-6">
                <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-8">
                    <div className="space-y-4">
                        <Secao icon={User} titulo="Quem paga e o quê" />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                            <Campo label="Quem paga *" htmlFor="receita-pagador" className="sm:col-span-2">
                                <select id="receita-pagador" className={CAMPO} value={pagador} onChange={e => setPagador(e.target.value)}>
                                    <option value="">—</option>
                                    {ocupantes.map(o => <option key={o.id} value={o.id}>{o.nome} · {o.unidades.join(', ')}</option>)}
                                    <option value={OUTRO}>Outra pessoa (digitar o nome)</option>
                                </select>
                            </Campo>
                            {pagador === OUTRO && (
                                <Campo label="Nome de quem paga *" htmlFor="receita-nome" className="sm:col-span-2">
                                    <input id="receita-nome" className={CAMPO} value={nomeLivre} maxLength={200} onChange={e => setNomeLivre(e.target.value)} />
                                </Campo>
                            )}
                            <Campo label="Descrição *" htmlFor="receita-desc" className="sm:col-span-2">
                                <input id="receita-desc" className={CAMPO} value={descricao} maxLength={300}
                                    placeholder="Ex.: aluguel do salão de festas — 12/10" onChange={e => setDescricao(e.target.value)} />
                            </Campo>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <Secao icon={CalendarClock} titulo="Valor e datas" />
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-4">
                            <Campo label="Valor (R$) *" htmlFor="receita-valor">
                                <MoneyCentsInput id="receita-valor" value={valorTexto} onChange={setValorTexto} className={CAMPO} />
                            </Campo>
                            <Campo label="Vencimento *" htmlFor="receita-venc">
                                <input id="receita-venc" type="date" className={CAMPO} value={vencimento} onChange={e => setVencimento(e.target.value)} />
                            </Campo>
                            <Campo label="Competência" htmlFor="receita-comp" dica="Vazia = o mês do vencimento.">
                                <input id="receita-comp" type="month" className={CAMPO} value={competencia} onChange={e => setCompetencia(e.target.value)} />
                            </Campo>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <Secao icon={Tag} titulo="Classificação" />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                            <Campo label="Centro de custo *">
                                <CostCenterSelect costCenters={centros} value={centro ?? ''}
                                    onChange={v => setCentro(v || null)} hoverCls="hover:bg-[#FDEDE8]" size="sm" />
                            </Campo>
                            <Campo label="Conta financeira *">
                                <HierarchicalSelect
                                    // Receita se classifica em conta de RECEITA (o inverso do lançamento a pagar).
                                    items={(condominio?.categorias ?? []).filter(c => c.nature === 'REVENUE' || c.nature == null || c.id === categoria)
                                        .map(c => ({ id: c.id, name: c.name, parentId: c.parentId ?? null }))}
                                    value={categoria ?? ''}
                                    onChange={v => setCategoria(v || null)}
                                    valueField="id" placeholder="—" hoverCls="hover:bg-[#FDEDE8]" size="sm"
                                    panelVariant="drawer" drawerTitle="Selecionar Conta Financeira"
                                />
                            </Campo>
                            {(condominio?.planos.length ?? 0) > 0 && (
                                <Campo label="Plano de contas">
                                    <PlanoContasSelect
                                        planoContas={(condominio?.planos ?? []).map(p => ({ id: p.id, code: p.code, name: p.name }))}
                                        value={plano ?? ''} onChange={v => setPlano(v || null)}
                                        placeholder="—" hoverCls="hover:bg-[#FDEDE8]" size="sm" />
                                </Campo>
                            )}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <Secao icon={Landmark} titulo="Recebimento" />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                            <Campo label="Forma" htmlFor="receita-forma">
                                <select id="receita-forma" className={CAMPO} value={forma} onChange={e => setForma(e.target.value)}>
                                    <option value="">—</option>
                                    {FORMAS_PAGAMENTO.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                                </select>
                            </Campo>
                            <Campo label="Conta onde entra" htmlFor="receita-conta"
                                dica={contas.length === 0 ? 'Cadastre a conta em Financeiro › Contas bancárias.' : undefined}>
                                <select id="receita-conta" className={CAMPO} value={conta} onChange={e => setConta(e.target.value)} disabled={contas.length === 0}
                                    title={contas.length === 0 ? 'O condomínio ainda não tem conta bancária cadastrada.' : undefined}>
                                    <option value="">—</option>
                                    {contas.map(a => <option key={a.id} value={a.id}>{a.name}{a.bank ? ` · ${a.bank}` : ''}</option>)}
                                </select>
                            </Campo>
                            <label className="sm:col-span-2 flex items-center gap-2 text-sm text-[#1F2430] cursor-pointer">
                                <input type="checkbox" className="h-4 w-4 accent-[#E1553C]" checked={jaRecebido} onChange={e => setJaRecebido(e.target.checked)} />
                                Já recebido
                            </label>
                            {jaRecebido && (
                                <Campo label="Data do recebimento *" htmlFor="receita-receb">
                                    <input id="receita-receb" type="date" className={CAMPO} value={dataRecebimento} max={hoje}
                                        onChange={e => setDataRecebimento(e.target.value)} />
                                </Campo>
                            )}
                        </div>
                    </div>
                </div>
            </SheetPanel>
            <SheetFooter>
                <div className="flex items-center justify-end gap-3 w-full">
                    {erro && <p className="mr-auto flex items-center gap-1.5 text-sm text-red-600"><AlertCircle className="w-4 h-4 shrink-0" /> {erro}</p>}
                    <GhostButton onClick={onClose}>Cancelar</GhostButton>
                    <span title={motivo ?? undefined}>
                        <PrimaryButton onClick={salvar} disabled={!!motivo} className={motivo ? 'pointer-events-none' : ''}>
                            {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
                            Lançar receita
                        </PrimaryButton>
                    </span>
                </div>
            </SheetFooter>
        </Sheet>
    );
};

export default LancarReceitaSheet;
