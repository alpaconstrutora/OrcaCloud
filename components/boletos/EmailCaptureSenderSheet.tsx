/**
 * Remetente monitorado ("favorito") da captura de boletos por e-mail — e os
 * PADRÕES dos boletos que ele manda.
 *
 * Plano: docs/planos/2026-10-15-captura-boletos-por-email.md (item 4.4) e
 * docs/planos/2026-10-16-captura-padroes-do-remetente.md (padrões, 16/10/2026:
 * "Ao cadastrar o e-mail do remetente, criar campo para cadastrar também os
 * dados para cadastro do boleto (cards Cobrança, Quem recebe, Classificação e
 * Observações)"). Os padrões só preenchem o que o PDF não traz.
 *
 * Favorito NÃO torna o boleto confiável: a importação automática ainda exige
 * DMARC, linha digitável válida, vencimento e o beneficiário ser o fornecedor
 * cadastrado (utils/emailCaptureRegras.ts). O texto da tela diz isso.
 *
 * Organização dos padrões = a da caixa (o banco recusa id de outra org, 23503).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, ShieldCheck, KeyRound, AlertTriangle, Mail, Receipt, UserPlus, Tag, StickyNote, Info } from 'lucide-react';
import { pareceSenhaDePdf, descricaoComMes, vencimentoPeloDia } from '../../utils/emailCaptureRegras';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import SecaoTitulo from '../ui/SecaoTitulo';
import MoneyCentsInput from '../ui/MoneyCentsInput';
import { useConfirm } from '../ui/confirm';
import SupplierSelect, { type SupplierOption } from '../SupplierSelect';
import CostCenterSelect, { type CostCenterOption } from '../CostCenterSelect';
import PlanoContasSelect, { type PlanoContasOption } from '../PlanoContasSelect';
import HierarchicalSelect from '../HierarchicalSelect';
import MultaJurosFields from './MultaJurosFields';
import { useStore } from '../../store/useStore';
import { projectService } from '../../services/projectService';
import { financialRegistryService } from '../../services/financialRegistryService';
import { boletoService } from '../../services/boletoService';
import type { Boleto } from '../../types';
import {
    emailCaptureService,
    type ContaCaptura,
    type RemetenteCaptura,
    type RemetenteRascunho,
} from '../../services/emailCaptureService';

export type FornecedorDaOrg = SupplierOption & { organization_id: string | null };

const ROTULO = 'text-xs font-semibold text-slate-500';
const CAMPO = 'w-full px-3 h-9 bg-gray-50 border border-gray-100 rounded-[6px] text-sm text-gray-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all disabled:opacity-60';
const CAMPO_AREA = 'w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-[6px] text-sm text-gray-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all';

const DIAS = Array.from({ length: 31 }, (_, i) => i + 1);

/** Data LOCAL em AAAA-MM-DD (prévia da descrição). */
const hojeLocal = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export interface ResultadoDosPadroes {
    atualizados: Boleto[];
    pulados: number;
}

interface Props {
    open: boolean;
    onClose: () => void;
    contas: ContaCaptura[];
    /** Fornecedores com a org de cada um — o campo só oferece os da org da caixa. */
    fornecedores: FornecedorDaOrg[];
    remetente?: RemetenteCaptura | null;
    /** "Monitorar remetente" pela revisão do boleto: já vem com e-mail, caixa, fornecedor e padrões. */
    prefill?: Partial<RemetenteRascunho> | null;
    /** `resultado`: boletos em revisão que receberam os padrões ao salvar (quando o usuário aceitou). */
    onSalvo: (r: RemetenteCaptura, resultado?: ResultadoDosPadroes) => void;
}

const SEM_PADROES = {
    padrao_descricao: null, padrao_observacoes: null, padrao_project_id: null, padrao_cost_center_id: null,
    padrao_plano_de_contas_id: null, padrao_category_id: null, padrao_dia_vencimento: null, padrao_valor: null,
    padrao_multa: null, padrao_multa_percentual: null, padrao_juros_dia: null, padrao_juros_dia_tipo: null,
} as const;

function vazio(contas: ContaCaptura[], prefill?: Partial<RemetenteRascunho> | null): RemetenteRascunho {
    const conta = contas.find(c => c.id === prefill?.account_id) ?? contas[0];
    return {
        organization_id: conta?.organization_id ?? '',
        account_id: conta?.id ?? '',
        supplier_id: null,
        nome: null,
        tipo: 'exato',
        email: null,
        dominio: null,
        palavras_chave: [],
        importacao: 'revisao',
        exigir_dmarc: true,
        ativo: true,
        ...SEM_PADROES,
        ...prefill,
    };
}

/** Algum padrão preenchido? (só então vale procurar boletos em revisão para aplicar). */
function temPadroes(r: Partial<RemetenteRascunho>): boolean {
    return (Object.keys(SEM_PADROES) as Array<keyof typeof SEM_PADROES>).some(k => r[k] != null && r[k] !== '');
}

const textoNumero = (v: number | null | undefined) => (v == null ? '' : String(v));
const numeroTexto = (v: string) => (v.trim() === '' || Number.isNaN(Number(v)) ? null : Number(v));

const EmailCaptureSenderSheet: React.FC<Props> = ({ open, onClose, contas, fornecedores, remetente, prefill, onSalvo }) => {
    const confirm = useConfirm();
    const organizations = useStore(s => s.organizations);
    const emailDoUsuario = useStore(s => s.currentProfile?.email);
    const [form, setForm] = useState<RemetenteRascunho>(() => vazio(contas, prefill));
    const [palavras, setPalavras] = useState('');
    const [dirty, setDirty] = useState(false);
    // Senha dos PDFs: nunca vem do banco; o campo é só para gravar/trocar.
    const [senhaPdf, setSenhaPdf] = useState('');
    const [trocandoSenha, setTrocandoSenha] = useState(false);
    const [removerSenha, setRemoverSenha] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [avisoTrocaCaixa, setAvisoTrocaCaixa] = useState(false);
    // Já gravado nesta abertura (a aplicação dos padrões falhou depois): salvar de novo é edição.
    const [salvoId, setSalvoId] = useState<string | null>(null);

    // Listas da classificação — sempre da org da CAIXA (o banco confere).
    const [obras, setObras] = useState<Array<{ id: string; name: string }>>([]);
    const [centros, setCentros] = useState<CostCenterOption[]>([]);
    const [planos, setPlanos] = useState<PlanoContasOption[]>([]);
    const [contasFinanceiras, setContasFinanceiras] = useState<Array<{ id: string; name: string; parent_id?: string | null }>>([]);
    const seqListas = useRef(0);

    useEffect(() => {
        if (!open) return;
        const base: RemetenteRascunho = remetente ? { ...remetente } : vazio(contas, prefill);
        setForm(base);
        setPalavras((base.palavras_chave ?? []).join(', '));
        setSenhaPdf('');
        setTrocandoSenha(false);
        setRemoverSenha(false);
        setDirty(false);
        setErro(null);
        setAvisoTrocaCaixa(false);
        setSalvoId(null);
    }, [open, remetente, prefill, contas]);

    const conta = contas.find(c => c.id === form.account_id) ?? null;
    const orgDaCaixa = conta?.organization_id ?? null;

    useEffect(() => {
        if (!open || !conta) return;
        const org = conta.organization_id;
        const seq = ++seqListas.current;
        Promise.all([
            projectService.listProjects({ organizationId: org, lean: true }).catch(() => []),
            financialRegistryService.listCostCenters(org).catch(() => []),
            financialRegistryService.listPlanoContas(org).catch(() => []),
            financialRegistryService.listChartOfAccounts(org).catch(() => []),
        ]).then(([projs, cc, pc, cf]) => {
            if (seq !== seqListas.current) return;
            setObras((projs as Array<{ id: string; name: string }>).map(p => ({ id: p.id, name: p.name })));
            setCentros(cc as CostCenterOption[]);
            setPlanos(pc as PlanoContasOption[]);
            // Conta financeira: as da organização da caixa ou globais (o banco aceita as duas).
            setContasFinanceiras((cf as Array<{ id: string; name: string; parent_id?: string | null; organization_id?: string | null }>)
                .filter(c => !c.organization_id || c.organization_id === org));
        });
    }, [open, conta]);

    const set = <K extends keyof RemetenteRascunho>(k: K, v: RemetenteRascunho[K]) => {
        setForm(f => ({ ...f, [k]: v }));
        setDirty(true);
    };

    /** Trocar para caixa de OUTRA organização limpa fornecedor e classificação (são cadastros da org). */
    function trocarCaixa(id: string) {
        const nova = contas.find(c => c.id === id);
        const mudouOrg = !!nova && nova.organization_id !== orgDaCaixa;
        setForm(f => ({
            ...f,
            account_id: id,
            ...(mudouOrg ? {
                supplier_id: null, padrao_project_id: null, padrao_cost_center_id: null,
                padrao_plano_de_contas_id: null, padrao_category_id: null,
            } : {}),
        }));
        if (mudouOrg && (form.supplier_id || form.padrao_project_id || form.padrao_cost_center_id || form.padrao_plano_de_contas_id || form.padrao_category_id)) {
            setAvisoTrocaCaixa(true);
        }
        setDirty(true);
    }

    // Fornecedor tem de ser da organização da caixa (o banco também confere).
    const fornecedoresDaOrg = useMemo(
        () => (conta ? fornecedores.filter(f => f.organization_id === conta.organization_id) : []),
        [fornecedores, conta],
    );
    const nomeDaOrg = (organizations ?? []).find(o => o.id === orgDaCaixa)?.name ?? '—';

    const alvo = form.tipo === 'exato' ? (form.email ?? '').trim() : (form.dominio ?? '').trim();
    const dia = form.padrao_dia_vencimento;
    const motivoDesligado: string | null = salvando
        ? 'Salvando…'
        : !conta
            ? 'Conecte uma caixa de e-mail antes de cadastrar remetentes.'
            : form.tipo === 'exato' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alvo)
                ? 'Informe o e-mail do remetente.'
                : form.tipo === 'dominio' && !/^@?[^\s@]+\.[^\s@]+$/.test(alvo)
                    ? 'Informe o domínio (ex.: fornecedor.com.br).'
                    : dia != null && (dia < 1 || dia > 31)
                        ? 'Dia do vencimento: de 1 a 31.'
                        : form.padrao_valor != null && form.padrao_valor <= 0
                            ? 'Valor fixo: maior que zero.'
                            : null;

    // Número puro em Palavras-chave quase sempre é a senha do PDF no campo errado.
    const palavrasNumericas = palavras.split(',').map(p => p.trim()).filter(pareceSenhaDePdf);

    function moverParaSenha() {
        const [senha] = palavrasNumericas;
        if (!senha) return;
        setPalavras(palavras.split(',').map(p => p.trim()).filter(p => p && !pareceSenhaDePdf(p)).join(', '));
        setSenhaPdf(senha);
        setTrocandoSenha(true);   // mostra o campo mesmo se já houver senha cadastrada
        setRemoverSenha(false);
        setDirty(true);
    }

    // Prévia da descrição: "Energia – {mês}" → como fica no próximo boleto.
    const previaDescricao = form.padrao_descricao?.trim()
        ? descricaoComMes(form.padrao_descricao.trim(), dia ? vencimentoPeloDia(dia, hojeLocal()) : null, hojeLocal())
        : null;

    async function salvar() {
        if (motivoDesligado || !conta) return;
        setSalvando(true);
        setErro(null);
        try {
            const salvo = await emailCaptureService.salvarRemetente(remetente?.id ?? salvoId, {
                ...form,
                organization_id: conta.organization_id,
                palavras_chave: palavras.split(',').map(p => p.trim()).filter(Boolean),
            });
            setSalvoId(salvo.id);
            if (senhaPdf.trim()) {
                await emailCaptureService.definirSenhaPdf(salvo.id, senhaPdf.trim());
                salvo.pdf_senha_atualizada_em = new Date().toISOString();
            } else if (removerSenha) {
                await emailCaptureService.definirSenhaPdf(salvo.id, null);
                salvo.pdf_senha_atualizada_em = null;
            }
            setSenhaPdf('');
            setDirty(false);

            // Boletos já em revisão deste remetente: aplicar os padrões só nos campos vazios?
            let resultado: ResultadoDosPadroes | undefined;
            if (temPadroes(salvo) && salvo.ativo) {
                try {
                    const previa = await emailCaptureService.previaDosPadroes(salvo);
                    if (previa.length) {
                        const ok = await confirm({
                            title: `Aplicar aos ${previa.length} boleto(s) em revisão deste remetente?`,
                            message: 'Só os campos vazios são preenchidos. Nada do que veio do PDF ou foi digitado muda.',
                            confirmLabel: 'Aplicar',
                            cancelLabel: 'Agora não',
                            variant: 'default',
                        });
                        if (ok) resultado = await boletoService.preencherComPadroesDoRemetente(previa, salvo.id, emailDoUsuario);
                    }
                } catch (e) {
                    // O remetente já está salvo; só a aplicação falhou.
                    onSalvo(salvo);
                    setErro(`Remetente salvo, mas os padrões não foram aplicados aos boletos em revisão: ${e instanceof Error ? e.message : String(e)}`);
                    return;
                }
            }
            onSalvo(salvo, resultado);
            onClose();
        } catch (e) {
            setErro(e instanceof Error ? e.message : String(e));
        } finally {
            setSalvando(false);
        }
    }

    if (!open) return null;

    return (
        <Sheet open={open} onClose={onClose} size="xl" dirty={dirty && !salvando}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>{remetente ? 'Editar remetente monitorado' : 'Novo remetente monitorado'}</SheetTitle>
                <SheetDescription>Mensagens deste remetente são priorizadas na captura de boletos.</SheetDescription>
            </SheetHeader>

            <SheetPanel className="px-6 py-5 space-y-8">
                <div className="space-y-4">
                    <SecaoTitulo icon={Mail} titulo="Remetente" />
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5 col-span-2">
                            <label className={ROTULO} htmlFor="erem-nome">Nome</label>
                            <input id="erem-nome" value={form.nome ?? ''} onChange={e => set('nome', e.target.value || null)}
                                placeholder="Ex.: Cobrança Energisa" className={CAMPO} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="erem-tipo">Monitorar por</label>
                            <select id="erem-tipo" value={form.tipo} onChange={e => set('tipo', e.target.value as 'exato' | 'dominio')} className={CAMPO}>
                                <option value="exato">Endereço exato</option>
                                <option value="dominio">Domínio inteiro</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="erem-conta">Caixa monitorada</label>
                            <select id="erem-conta" value={form.account_id} onChange={e => trocarCaixa(e.target.value)} className={CAMPO}>
                                {contas.map(c => <option key={c.id} value={c.id}>{c.usuario}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5 col-span-2">
                            <label className={ROTULO} htmlFor="erem-alvo">{form.tipo === 'exato' ? 'E-mail' : 'Domínio'}</label>
                            <input id="erem-alvo" value={(form.tipo === 'exato' ? form.email : form.dominio) ?? ''}
                                onChange={e => set(form.tipo === 'exato' ? 'email' : 'dominio', e.target.value || null)}
                                placeholder={form.tipo === 'exato' ? 'cobranca@fornecedor.com.br' : 'fornecedor.com.br'} className={CAMPO} />
                        </div>
                        {form.tipo === 'dominio' && (
                            <p className="col-span-2 text-xs text-amber-700">
                                Domínio inteiro casa qualquer endereço dele, inclusive caixas que o fornecedor não usa para cobrança — confiança menor que um endereço exato.
                            </p>
                        )}
                        <div className="space-y-1.5 col-span-2">
                            <label className={ROTULO} htmlFor="erem-palavras">Palavras-chave (opcional)</label>
                            <input id="erem-palavras" value={palavras} onChange={e => { setPalavras(e.target.value); setDirty(true); }}
                                placeholder="boleto, fatura, cobrança" className={CAMPO} />
                            <p className="text-xs text-gray-500">Separadas por vírgula. Com palavras, só casa mensagem cujo assunto ou nome do anexo tenha uma delas.</p>
                            {palavrasNumericas.length > 0 && (
                                <div className="flex items-start gap-2 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                                    <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                                    <div className="space-y-1.5">
                                        <p>
                                            {palavrasNumericas.length === 1 ? 'O número digitado aqui parece' : 'Os números digitados aqui parecem'} a senha do PDF, não uma palavra-chave.
                                            Como palavra-chave, o remetente só é reconhecido se o assunto ou o anexo tiver esses dígitos.
                                        </p>
                                        <button type="button" onClick={moverParaSenha} className="font-medium text-amber-900 underline hover:text-amber-950">
                                            Mover para Senha dos PDFs
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <SecaoTitulo icon={KeyRound} titulo="Senha dos PDFs" />
                    {remetente?.pdf_senha_atualizada_em && !trocandoSenha && !removerSenha ? (
                        <div className="flex items-center gap-3 text-sm">
                            <span className="text-emerald-700">Senha cadastrada</span>
                            <span className="text-gray-400">em {new Date(remetente.pdf_senha_atualizada_em).toLocaleDateString('pt-BR')}</span>
                            <button type="button" onClick={() => setTrocandoSenha(true)} className="ml-auto text-blue-600 hover:text-blue-800 font-medium">Trocar</button>
                            <button type="button" onClick={() => { setRemoverSenha(true); setDirty(true); }} className="text-red-600 hover:text-red-700 font-medium">Remover</button>
                        </div>
                    ) : removerSenha ? (
                        <div className="flex items-center gap-3 text-sm">
                            <span className="text-red-600">A senha será removida ao salvar.</span>
                            <button type="button" onClick={() => setRemoverSenha(false)} className="ml-auto text-blue-600 hover:text-blue-800 font-medium">Desfazer</button>
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="erem-senha-pdf">{remetente?.pdf_senha_atualizada_em ? 'Nova senha' : 'Senha (opcional)'}</label>
                            <input id="erem-senha-pdf" type="password" autoComplete="new-password" value={senhaPdf}
                                onChange={e => { setSenhaPdf(e.target.value); setDirty(true); }}
                                placeholder="Só se os PDFs deste remetente pedirem senha" className={CAMPO} />
                            <p className="text-xs text-gray-500">
                                Contas de energia, água e telefone costumam vir com senha — em geral os primeiros dígitos do CPF ou CNPJ do titular
                                (o e-mail da concessionária diz a regra). Fica guardada no cofre e não aparece de novo. Se outro remetente da mesma
                                caixa mandar PDF com senha, esta também é tentada; boletos parados por falta de senha são lidos de novo na próxima leitura.
                            </p>
                        </div>
                    )}
                </div>

                <div className="space-y-4">
                    <SecaoTitulo icon={ShieldCheck} titulo="Importação" />
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="erem-imp">Boleto deste remetente</label>
                            <select id="erem-imp" value={form.importacao} onChange={e => set('importacao', e.target.value as 'automatica' | 'revisao')} className={CAMPO}>
                                <option value="revisao">Sempre revisar</option>
                                <option value="automatica">Rascunho automático</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="erem-ativo">Situação</label>
                            <select id="erem-ativo" value={form.ativo ? 'sim' : 'nao'} onChange={e => set('ativo', e.target.value === 'sim')} className={CAMPO}>
                                <option value="sim">Ativo</option>
                                <option value="nao">Inativo</option>
                            </select>
                        </div>
                        <label className="col-span-2 flex items-start gap-2 text-sm text-gray-700">
                            <input type="checkbox" checked={form.exigir_dmarc} onChange={e => set('exigir_dmarc', e.target.checked)}
                                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                            <span>Exigir autenticação do e-mail (DMARC) — sem ela, o boleto vai para revisão.</span>
                        </label>
                    </div>
                    {form.importacao === 'automatica' && (
                        <p className="text-xs text-gray-500">
                            Mesmo assim o boleto só sai da revisão se a linha digitável for válida, tiver vencimento e o beneficiário for o fornecedor cadastrado na organização.
                            {conta?.modo_piloto ? ' Esta caixa está em modo piloto: por enquanto tudo vai para revisão.' : ''}
                            {' '}Só gestores da organização podem gravar esta opção.
                        </p>
                    )}
                </div>

                {/* ── Padrões dos boletos deste remetente (16/10/2026) ───────────── */}
                <div className="flex gap-2 rounded-[10px] border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs text-blue-800">
                    <Info className="w-4 h-4 shrink-0 mt-px" />
                    <p>
                        <strong>Padrões dos boletos deste remetente</strong> — usados só quando o PDF não traz o dado; nunca substituem o que veio no boleto.
                        Boleto com vencimento ou valor do padrão continua em revisão, com o aviso.
                    </p>
                </div>

                <div className="space-y-4">
                    <SecaoTitulo icon={Receipt} titulo="Cobrança" />
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="erem-dia">Dia do vencimento</label>
                            <select id="erem-dia" value={dia ?? ''} onChange={e => set('padrao_dia_vencimento', e.target.value ? Number(e.target.value) : null)} className={CAMPO}>
                                <option value="">—</option>
                                {DIAS.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                            <p className="text-xs text-gray-500">O próximo dia {dia ?? 'N'} a partir da data do e-mail; mês sem esse dia usa o último dia.</p>
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="erem-valor">Valor fixo (R$)</label>
                            <MoneyCentsInput id="erem-valor" value={form.padrao_valor ?? ''}
                                onChange={v => { const n = numeroTexto(v); set('padrao_valor', n && n > 0 ? n : null); }}
                                className={CAMPO} />
                            <p className="text-xs text-gray-500">Só para cobrança de valor sempre igual. Conta que varia (energia, água): deixe vazio.</p>
                        </div>
                    </div>
                    <MultaJurosFields
                        multa={textoNumero(form.padrao_multa)} setMulta={v => set('padrao_multa', numeroTexto(v))}
                        multaPercentual={textoNumero(form.padrao_multa_percentual)} setMultaPercentual={v => set('padrao_multa_percentual', numeroTexto(v))}
                        jurosDia={textoNumero(form.padrao_juros_dia)} setJurosDia={v => set('padrao_juros_dia', numeroTexto(v))}
                        jurosDiaTipo={form.padrao_juros_dia_tipo ?? 'valor'} setJurosDiaTipo={v => set('padrao_juros_dia_tipo', v)}
                        ajuda="Só se o PDF não trouxer multa nem juros."
                        classeCampo={CAMPO} classeRotulo={ROTULO}
                    />
                </div>

                <div className="space-y-4">
                    <SecaoTitulo icon={UserPlus} titulo="Quem recebe" />
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5 col-span-2">
                            <label className={ROTULO}>Fornecedor</label>
                            <SupplierSelect suppliers={fornecedoresDaOrg} value={form.supplier_id ?? ''}
                                onChange={id => set('supplier_id', id || null)} size="sm" placeholder="Sem vínculo" />
                            <p className="text-xs text-gray-500">Entra como fornecedor sugerido no boleto; quem confirma é a revisão.</p>
                        </div>
                        <div className="space-y-1.5 col-span-2">
                            <label className={ROTULO} htmlFor="erem-descricao">Descrição</label>
                            <input id="erem-descricao" value={form.padrao_descricao ?? ''} maxLength={200}
                                onChange={e => set('padrao_descricao', e.target.value || null)}
                                placeholder="Ex.: Energia – {mês}" className={CAMPO} />
                            <p className="text-xs text-gray-500">
                                {'{mês}'} vira o mês do vencimento (MM/AAAA).{previaDescricao ? <> Fica: <span className="text-gray-700">{previaDescricao}</span></> : null}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <SecaoTitulo icon={Tag} titulo="Classificação" />
                    {avisoTrocaCaixa && (
                        <p className="rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                            Fornecedor e classificação foram limpos: eram cadastros da organização da caixa anterior.
                        </p>
                    )}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <div className="space-y-1.5">
                            <label className={ROTULO}>Organização</label>
                            <div className="px-3 h-9 flex items-center bg-gray-50 border border-gray-100 rounded-[6px] text-sm text-gray-700" title="É a organização da caixa monitorada">
                                <span className="truncate">{nomeDaOrg}</span>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="erem-obra">Obra / projeto</label>
                            <select id="erem-obra" value={form.padrao_project_id ?? ''} onChange={e => set('padrao_project_id', e.target.value || null)} className={CAMPO}>
                                <option value="">— Sem vínculo —</option>
                                {obras.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO}>Centro de custo</label>
                            <CostCenterSelect costCenters={centros} value={form.padrao_cost_center_id ?? ''}
                                onChange={id => set('padrao_cost_center_id', id || null)} hoverCls="hover:bg-blue-50" size="sm" />
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO}>Plano de contas</label>
                            <PlanoContasSelect planoContas={planos} value={form.padrao_plano_de_contas_id ?? ''}
                                onChange={id => set('padrao_plano_de_contas_id', id || null)} placeholder="—" hoverCls="hover:bg-blue-50" size="sm" />
                        </div>
                        <div className="space-y-1.5 col-span-2">
                            <label className={ROTULO}>Conta financeira</label>
                            <HierarchicalSelect
                                items={contasFinanceiras.map(c => ({ id: c.id, name: c.name, parentId: c.parent_id ?? null }))}
                                value={form.padrao_category_id ?? ''}
                                onChange={id => set('padrao_category_id', id || null)}
                                valueField="id"
                                placeholder="—"
                                hoverCls="hover:bg-blue-50"
                                size="sm"
                                panelVariant="drawer"
                                drawerTitle="Selecionar conta financeira"
                            />
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <SecaoTitulo icon={StickyNote} titulo="Observações" />
                    <div className="space-y-1.5">
                        <label className={ROTULO} htmlFor="erem-obs">Anotações internas</label>
                        <textarea id="erem-obs" rows={3} maxLength={2000} value={form.padrao_observacoes ?? ''}
                            onChange={e => set('padrao_observacoes', e.target.value || null)}
                            placeholder="Ex.: débito automático — conferir no extrato" className={CAMPO_AREA} />
                    </div>
                </div>

                {erro && <p className="rounded-[10px] border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-700">{erro}</p>}
            </SheetPanel>

            <SheetFooter>
                <button onClick={onClose} disabled={salvando} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px] disabled:opacity-50">
                    Cancelar
                </button>
                <button onClick={salvar} disabled={!!motivoDesligado} title={motivoDesligado ?? undefined}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                    {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
                    Salvar remetente
                </button>
            </SheetFooter>
        </Sheet>
    );
};

export default EmailCaptureSenderSheet;
