import React from 'react';
import { AlertCircle, AlertTriangle, Landmark, Loader2, Plus } from 'lucide-react';
import {
    CardHeader, GhostButton, PortalCard, PortalEmpty, PortalLoading, PrimaryButton, StatusPill, Td, TextLinkButton, Th,
    fmtBRLCents, fmtDate,
} from '../portal/PortalKit';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useConfirm } from '../ui/confirm';
import MoneyCentsInput from '../ui/MoneyCentsInput';
import { sindicoPortalService, type IdentidadeDoSindico } from '../../services/sindicoPortalService';
import { motivoNaoSalvaConta, type ContaDoCondominio } from '../../utils/financeiroDoSindico';

/**
 * Portal do Síndico › Financeiro › Contas bancárias (G2a, 24/10/2026).
 * O síndico cadastra a conta (ou o caixa) do condomínio — é ela que aparece
 * para escolher ao pagar e ao receber. Conta nunca é apagada: desativa.
 * A conta do Asaas (gateway) nasce e muda pela configuração do Asaas (G2c).
 * Plano: docs/planos/2026-10-24-portal-sindico-gestao-completa.md
 */

const ROTULO = 'text-xs font-semibold text-slate-500';
const CAMPO = 'w-full h-10 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#E1553C]/20 focus:border-[#E1553C]';
const MOTIVO_GATEWAY = 'A conta do Asaas muda pela configuração do Asaas, não por aqui.';

const ROTULO_TIPO: Record<ContaDoCondominio['tipo'], string> = { banco: 'Banco', caixa: 'Caixa', gateway: 'Asaas' };

interface Props {
    identidade: IdentidadeDoSindico;
    condominioId: string | null;
    condominioNome: string;
    /** Motivo de não poder gravar (link sem senha, prévia, condomínio sem org própria). */
    motivoBase: string | null;
    notify: (m: string, t?: 'success' | 'error') => void;
    /** A lista do formulário de baixa vem da leitura do financeiro: recarregar depois de mudar. */
    onAlterado: () => void;
}

const Acao: React.FC<{ motivo: string | null; onClick: () => void; children: React.ReactNode }> = ({ motivo, onClick, children }) => (
    <span title={motivo ?? undefined} className={motivo ? 'cursor-not-allowed' : undefined}>
        <TextLinkButton onClick={onClick} disabled={!!motivo} className={motivo ? 'pointer-events-none text-gray-300 disabled:opacity-100' : ''}>
            {children}
        </TextLinkButton>
    </span>
);

const PainelContasDoSindico: React.FC<Props> = ({ identidade, condominioId, condominioNome, motivoBase, notify, onAlterado }) => {
    const confirm = useConfirm();
    const [contas, setContas] = React.useState<ContaDoCondominio[] | null>(null);
    const [erro, setErro] = React.useState<string | null>(null);
    const [editando, setEditando] = React.useState<ContaDoCondominio | 'nova' | null>(null);
    const [versao, setVersao] = React.useState(0);

    React.useEffect(() => {
        if (!condominioId) return;
        let vivo = true;
        setErro(null);
        sindicoPortalService.getContas(identidade, condominioId)
            .then(c => { if (vivo) setContas(c); })
            .catch(e => { if (vivo) { setContas(null); setErro(e instanceof Error ? e.message : 'Não foi possível carregar as contas.'); } });
        return () => { vivo = false; };
    }, [identidade, condominioId, versao]);

    const depoisDeGravar = (m: string) => { setEditando(null); notify(m); setVersao(v => v + 1); onAlterado(); };

    const alternarAtiva = async (c: ContaDoCondominio) => {
        if (!condominioId) return;
        if (c.ativa) {
            const ok = await confirm({
                title: `Desativar "${c.nome}"?`,
                message: 'A conta some da lista ao pagar e ao receber. O que já foi baixado nela continua como está — dá para reativar depois.',
                confirmLabel: 'Desativar', variant: 'warning',
            });
            if (!ok) return;
        }
        try {
            await sindicoPortalService.salvarConta(identidade, condominioId, c.id, {
                nome: c.nome, tipo: c.tipo === 'caixa' ? 'caixa' : 'banco', banco: c.banco ?? '', agencia: c.agencia ?? '',
                numero: c.numero ?? '', descricao: c.descricao ?? '', saldoInicial: Number(c.saldoInicial) || 0,
                saldoInicialEm: c.saldoInicialEm, ativa: !c.ativa,
            });
            depoisDeGravar(c.ativa ? 'Conta desativada.' : 'Conta reativada.');
        } catch (e) {
            notify(e instanceof Error ? e.message : 'Não foi possível salvar a conta.', 'error');
        }
    };

    return (
        <>
            <PortalCard>
                <CardHeader
                    title="Contas bancárias"
                    subtitle={`Onde o dinheiro de ${condominioNome || 'condomínio'} entra e sai — escolhidas ao pagar e ao receber`}
                    right={
                        <span title={motivoBase ?? undefined}>
                            <PrimaryButton onClick={() => setEditando('nova')} disabled={!!motivoBase} className={motivoBase ? 'pointer-events-none' : ''}>
                                <Plus className="w-4 h-4" /> Nova conta
                            </PrimaryButton>
                        </span>
                    }
                />
                {erro ? (
                    <p className="px-5 pb-5 text-sm text-[#4A505C] flex items-start gap-2"><AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" /> {erro}</p>
                ) : !contas ? (
                    <PortalLoading label="Carregando as contas..." />
                ) : contas.length === 0 ? (
                    <PortalEmpty icon={<Landmark className="w-8 h-8" />} title="Nenhuma conta cadastrada"
                        subtitle="Cadastre a conta bancária do condomínio para registrar onde cada pagamento e recebimento aconteceu." />
                ) : (
                    <div className="overflow-x-auto border-t border-[#ECECEF]">
                        <table className="w-full min-w-[720px]">
                            <thead className="border-b border-[#ECECEF]">
                                <tr>
                                    <Th>Código</Th><Th>Conta</Th><Th>Banco · agência · número</Th>
                                    <Th className="text-right">Saldo inicial</Th><Th>Situação</Th><Th>Ações</Th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#ECECEF]">
                                {contas.map(c => {
                                    const mEditar = motivoBase ?? (c.tipo === 'gateway' ? MOTIVO_GATEWAY : null);
                                    return (
                                        <tr key={c.id} className="hover:bg-gray-50/70 transition-colors">
                                            <Td className="text-[#8A8F9A] tabular-nums">{c.codigo ?? '—'}</Td>
                                            <Td className="text-[#1F2430]">
                                                {c.nome}
                                                <span className="block text-[11px] text-gray-400">{ROTULO_TIPO[c.tipo]}{c.descricao ? ` · ${c.descricao}` : ''}</span>
                                            </Td>
                                            <Td>{[c.banco, c.agencia, c.numero].filter(Boolean).join(' · ') || '—'}</Td>
                                            <Td className="text-right tabular-nums text-[#1F2430] whitespace-nowrap">
                                                {fmtBRLCents(Number(c.saldoInicial) || 0)}
                                                {c.saldoInicialEm && <span className="block text-[11px] text-gray-400">em {fmtDate(c.saldoInicialEm)}</span>}
                                            </Td>
                                            <Td><StatusPill tone={c.ativa ? 'good' : 'muted'}>{c.ativa ? 'Ativa' : 'Inativa'}</StatusPill></Td>
                                            <Td className="whitespace-nowrap">
                                                <span className="inline-flex items-center gap-3">
                                                    <Acao motivo={mEditar} onClick={() => setEditando(c)}>Editar</Acao>
                                                    <Acao motivo={mEditar} onClick={() => alternarAtiva(c)}>{c.ativa ? 'Desativar' : 'Reativar'}</Acao>
                                                </span>
                                            </Td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                {motivoBase && <p className="px-5 py-3 text-xs text-gray-500">{motivoBase}</p>}
            </PortalCard>

            <ContaSheet
                conta={editando}
                identidade={identidade}
                condominioId={condominioId}
                onClose={() => setEditando(null)}
                onSalvo={depoisDeGravar}
            />
        </>
    );
};

// ── Criar / editar ───────────────────────────────────────────────────────────
const ContaSheet: React.FC<{
    conta: ContaDoCondominio | 'nova' | null;
    identidade: IdentidadeDoSindico;
    condominioId: string | null;
    onClose: () => void;
    onSalvo: (m: string) => void;
}> = ({ conta, identidade, condominioId, onClose, onSalvo }) => {
    const nova = conta === 'nova';
    const atual = conta && conta !== 'nova' ? conta : null;
    const [nome, setNome] = React.useState('');
    const [tipo, setTipo] = React.useState<'banco' | 'caixa'>('banco');
    const [banco, setBanco] = React.useState('');
    const [agencia, setAgencia] = React.useState('');
    const [numero, setNumero] = React.useState('');
    const [descricao, setDescricao] = React.useState('');
    const [saldoTexto, setSaldoTexto] = React.useState('');
    const [saldoEm, setSaldoEm] = React.useState('');
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    const [snapshot, setSnapshot] = React.useState('');

    React.useEffect(() => {
        if (!conta) return;
        const v = {
            nome: atual?.nome ?? '', tipo: (atual?.tipo === 'caixa' ? 'caixa' : 'banco') as 'banco' | 'caixa',
            banco: atual?.banco ?? '', agencia: atual?.agencia ?? '', numero: atual?.numero ?? '', descricao: atual?.descricao ?? '',
            saldo: atual && Number(atual.saldoInicial) ? String(atual.saldoInicial) : '', saldoEm: atual?.saldoInicialEm ?? '',
        };
        setNome(v.nome); setTipo(v.tipo); setBanco(v.banco); setAgencia(v.agencia); setNumero(v.numero); setDescricao(v.descricao);
        setSaldoTexto(v.saldo); setSaldoEm(v.saldoEm); setErro(null); setSnapshot(JSON.stringify(v));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conta]);

    const saldo = saldoTexto === '' ? 0 : Number(saldoTexto);
    const atualJson = JSON.stringify({ nome, tipo, banco, agencia, numero, descricao, saldo: saldoTexto, saldoEm });
    const sujo = !!conta && atualJson !== snapshot;
    const motivo = salvando ? 'Gravando…' : !condominioId ? 'Escolha o condomínio.'
        : motivoNaoSalvaConta({ nome, saldoInicial: saldo, saldoInicialEm: saldoEm || null });

    const salvar = async () => {
        if (!condominioId || motivo) return;
        setSalvando(true);
        setErro(null);
        try {
            await sindicoPortalService.salvarConta(identidade, condominioId, atual?.id ?? null, {
                nome: nome.trim(), tipo, banco: banco.trim(), agencia: agencia.trim(), numero: numero.trim(), descricao: descricao.trim(),
                saldoInicial: saldo, saldoInicialEm: saldoEm || null, ativa: atual?.ativa ?? true,
            });
            onSalvo(nova ? 'Conta cadastrada. Ela já aparece ao pagar e ao receber.' : 'Conta salva.');
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível salvar a conta.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={!!conta} onClose={onClose} size="md" dirty={sujo && !salvando}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>{nova ? 'Nova conta' : 'Editar conta'}</SheetTitle>
                <SheetDescription>{nova ? 'Conta bancária ou caixa do condomínio' : atual?.codigo ? `Conta ${atual.codigo}` : ''}</SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-4 md:p-6">
                <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5 sm:col-span-2">
                            <label className={ROTULO} htmlFor="conta-nome">Nome *</label>
                            <input id="conta-nome" className={CAMPO} value={nome} maxLength={120} placeholder="Ex.: Sicredi — conta do condomínio"
                                onChange={e => setNome(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="conta-tipo">Tipo</label>
                            <select id="conta-tipo" className={CAMPO} value={tipo} onChange={e => setTipo(e.target.value as 'banco' | 'caixa')}>
                                <option value="banco">Banco</option>
                                <option value="caixa">Caixa (dinheiro)</option>
                            </select>
                        </div>
                        {tipo === 'banco' && (
                            <>
                                <div className="space-y-1.5">
                                    <label className={ROTULO} htmlFor="conta-banco">Banco</label>
                                    <input id="conta-banco" className={CAMPO} value={banco} maxLength={80} placeholder="Ex.: 748 — Sicredi" onChange={e => setBanco(e.target.value)} />
                                </div>
                                <div className="space-y-1.5">
                                    <label className={ROTULO} htmlFor="conta-agencia">Agência</label>
                                    <input id="conta-agencia" className={CAMPO} value={agencia} maxLength={20} onChange={e => setAgencia(e.target.value)} />
                                </div>
                                <div className="space-y-1.5">
                                    <label className={ROTULO} htmlFor="conta-numero">Número da conta</label>
                                    <input id="conta-numero" className={CAMPO} value={numero} maxLength={30} onChange={e => setNumero(e.target.value)} />
                                </div>
                            </>
                        )}
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="conta-saldo">Saldo inicial (R$)</label>
                            <MoneyCentsInput id="conta-saldo" value={saldoTexto} onChange={setSaldoTexto} className={CAMPO} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="conta-saldo-em">Saldo em</label>
                            <input id="conta-saldo-em" type="date" className={CAMPO} value={saldoEm} onChange={e => setSaldoEm(e.target.value)} />
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                            <label className={ROTULO} htmlFor="conta-desc">Observação</label>
                            <input id="conta-desc" className={CAMPO} value={descricao} maxLength={300} onChange={e => setDescricao(e.target.value)} />
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
                            {nova ? 'Cadastrar conta' : 'Salvar'}
                        </PrimaryButton>
                    </span>
                </div>
            </SheetFooter>
        </Sheet>
    );
};

export default PainelContasDoSindico;
