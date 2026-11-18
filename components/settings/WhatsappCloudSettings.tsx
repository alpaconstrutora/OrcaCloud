/**
 * Configurações › WhatsApp & Integrações — token da Cloud API (Meta), por organização.
 *
 * Achado F75 (18/11/2026; plano docs/planos/2026-11-18-seguranca-fase2-achados-restantes.md,
 * PR I). Até aqui o token permanente da Meta era gravado no localStorage deste navegador, em
 * texto puro, e voltava preenchido (com botão de revelar) para quem abrisse esta tela depois.
 * Decisão do usuário: um token POR ORGANIZAÇÃO, no servidor.
 *
 *   • A tela lista as organizações do usuário (só a do topo, quando o topo aponta uma) com
 *     "Configurado / Não configurado" e o que não é segredo: número exibido e nome verificado.
 *   • Configurar/trocar/remover: só proprietário ou administrador (`pode_configurar`, a mesma
 *     regra da Edge Function `whatsapp-cloud`, que é quem decide de verdade).
 *   • O token é digitado, testado na Meta pela function e guardado no Vault. Ele nunca volta
 *     para esta tela — o campo nasce vazio, sempre.
 *   • Se este navegador tinha o token antigo, ele foi apagado no boot (`lib/whatsappLegado.ts`)
 *     e aqui aparece o aviso para o gestor recadastrar uma vez.
 */
import React from 'react';
import { AlertTriangle, CheckCircle, Loader2, MessageCircle } from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useOrgContext } from '../../hooks/useOrgContext';
import { useToast } from '../../hooks/useToast';
import { useStore } from '../../store/useStore';
import { whatsappService, TEMPLATE_PEDIDO_SUGERIDO, type SituacaoWhatsapp } from '../../services/whatsappService';
import { avisoDeTokenLegado, descartarAvisoDeTokenLegado } from '../../lib/whatsappLegado';
import { nomeDeTemplateValido, phoneNumberIdValido } from '../../utils/whatsappPedido';

export const MOTIVO_NAO_GESTOR = 'Só proprietário ou administrador desta organização configura o WhatsApp.';

const CAMPO = 'w-full px-3 h-9 bg-gray-50 border border-gray-200 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all';
const ROTULO = 'block text-xs font-semibold text-slate-500';
const BOTAO_SECUNDARIO = 'flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed';

interface Formulario {
    phoneNumberId: string;
    token: string;
    template: string;
}

function formatarData(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
}

const WhatsappCloudSettings: React.FC = () => {
    const { orgId } = useOrgContext();
    const organizations = useStore(state => state.organizations);
    const confirm = useConfirm();
    const { showToast } = useToast();

    const [situacoes, setSituacoes] = React.useState<SituacaoWhatsapp[] | null>(null);
    const [erro, setErro] = React.useState<string | null>(null);
    const [aviso, setAviso] = React.useState<string | null>(() => avisoDeTokenLegado());
    const [editando, setEditando] = React.useState<SituacaoWhatsapp | null>(null);
    const [form, setForm] = React.useState<Formulario>({ phoneNumberId: '', token: '', template: '' });
    const [salvando, setSalvando] = React.useState(false);
    const [erroForm, setErroForm] = React.useState<string | null>(null);
    const [removendo, setRemovendo] = React.useState<string | null>(null);

    React.useEffect(() => {
        let vivo = true;
        whatsappService.situacao()
            .then(lista => { if (vivo) { setSituacoes(lista); setErro(null); } })
            .catch(e => { if (vivo) { setSituacoes([]); setErro(e instanceof Error ? e.message : String(e)); } });
        return () => { vivo = false; };
    }, []);

    const nomeDaOrg = React.useCallback(
        (id: string) => organizations.find(o => o.id === id)?.name ?? 'Organização',
        [organizations],
    );

    // Topo numa organização → só ela. "Todas" → todas as do usuário (REGRA #5: nunca esconder).
    const linhas = React.useMemo(
        () => (situacoes ?? [])
            .filter(s => !orgId || s.organizationId === orgId)
            .sort((a, b) => nomeDaOrg(a.organizationId).localeCompare(nomeDaOrg(b.organizationId), 'pt-BR')),
        [situacoes, orgId, nomeDaOrg],
    );

    const inicial = React.useMemo<Formulario>(() => ({
        phoneNumberId: editando?.phoneNumberId ?? '',
        token: '',
        template: editando?.templatePedido ?? TEMPLATE_PEDIDO_SUGERIDO,
    }), [editando]);
    const dirty = !!editando && (form.phoneNumberId !== inicial.phoneNumberId || form.token !== '' || form.template !== inicial.template);

    const abrir = (s: SituacaoWhatsapp) => {
        setEditando(s);
        setForm({ phoneNumberId: s.phoneNumberId ?? '', token: '', template: s.templatePedido ?? TEMPLATE_PEDIDO_SUGERIDO });
        setErroForm(null);
    };
    const fechar = () => { setEditando(null); setErroForm(null); };
    // O `dirty` do Sheet cobre o véu e o Esc; o X e o Cancelar passam por aqui.
    const pedirFechar = async () => {
        if (dirty && !salvando) {
            const ok = await confirm({
                title: 'Sair sem salvar?',
                message: 'Há alterações não salvas. Se sair agora, elas serão perdidas.',
                variant: 'warning',
                confirmLabel: 'Sair e descartar',
                cancelLabel: 'Continuar editando',
            });
            if (!ok) return;
        }
        fechar();
    };

    const motivoSalvar: string | null = !editando ? null
        : !phoneNumberIdValido(form.phoneNumberId) ? 'Informe o Phone Number ID (só dígitos).'
        : !editando.configurado && !form.token.trim() ? 'Cole o token para salvar.'
        : !nomeDeTemplateValido(form.template) ? 'Template: use o nome exato aprovado na Meta (minúsculas, dígitos e _).'
        : null;

    const dispensarAviso = () => { descartarAvisoDeTokenLegado(); setAviso(null); };

    const salvar = async () => {
        if (!editando || motivoSalvar || salvando) return;
        const alvo = editando;
        const trocouToken = !!form.token.trim();
        setSalvando(true);
        setErroForm(null);
        try {
            const r = await whatsappService.salvar({
                organizationId: alvo.organizationId,
                phoneNumberId: form.phoneNumberId,
                token: form.token,
                templatePedido: form.template,
            });
            const agora = new Date().toISOString();
            // §22: atualiza a linha, sem recarregar a lista.
            setSituacoes(prev => (prev ?? []).map(s => s.organizationId !== alvo.organizationId ? s : {
                ...s,
                configurado: true,
                phoneNumberId: form.phoneNumberId.trim(),
                templatePedido: form.template.trim(),
                numeroExibicao: r.numeroExibicao,
                nomeVerificado: r.nomeVerificado,
                tokenAtualizadoEm: trocouToken ? agora : s.tokenAtualizadoEm,
                // Quem trocou o token é o próprio usuário; o e-mail volta da RPC na próxima leitura.
                tokenAtualizadoPor: trocouToken ? null : s.tokenAtualizadoPor,
            }));
            setForm(f => ({ ...f, token: '' }));
            dispensarAviso();
            setEditando(null);
            showToast(`WhatsApp de ${nomeDaOrg(alvo.organizationId)}: token testado na Meta e guardado no servidor.`);
        } catch (e) {
            setErroForm(e instanceof Error ? e.message : String(e));
        } finally {
            setSalvando(false);
        }
    };

    const remover = async (s: SituacaoWhatsapp) => {
        const ok = await confirm({
            title: 'Remover o token do WhatsApp?',
            message: `O token de ${nomeDaOrg(s.organizationId)} é apagado do servidor e o envio automático de pedidos para de funcionar em todos os navegadores desta organização.`,
            variant: 'danger',
            confirmLabel: 'Remover',
        });
        if (!ok) return;
        setRemovendo(s.organizationId);
        try {
            await whatsappService.remover(s.organizationId);
            setSituacoes(prev => (prev ?? []).map(x => x.organizationId !== s.organizationId ? x : {
                ...x, configurado: false, phoneNumberId: null, numeroExibicao: null, nomeVerificado: null,
                templatePedido: null, tokenAtualizadoEm: null, tokenAtualizadoPor: null,
            }));
            showToast('Token do WhatsApp removido.');
        } catch (e) {
            showToast(e instanceof Error ? e.message : String(e), 'error');
        } finally {
            setRemovendo(null);
        }
    };

    return (
        <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 p-6">
            <div className="flex items-start gap-4">
                <div className="p-3 bg-green-50 rounded-[10px]">
                    <MessageCircle className="w-6 h-6 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-semibold text-gray-800">WhatsApp Business (API oficial)</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Envio automático via <strong>Meta Cloud API</strong> ao marcar pedidos como "Enviado". O token fica
                        guardado no servidor, um por organização, e vale para todos os navegadores dela. Só proprietário ou
                        administrador configura. Token e Phone Number ID ficam em{' '}
                        <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">developers.facebook.com</a>.
                    </p>
                </div>
            </div>

            {/* Só enquanto alguma organização da lista ainda está sem token — depois do
                recadastro o aviso não tem mais o que pedir. */}
            {aviso && linhas.some(s => !s.configurado) && (
                <div role="status" className="mt-6 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-[10px] p-4">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-amber-900">O token do WhatsApp salvo neste navegador foi apagado</p>
                        <p className="text-sm text-amber-800 mt-1">
                            Ele ficava guardado no navegador, à vista de quem usasse este computador depois. Foi apagado daqui
                            e não foi enviado a lugar nenhum. Para o envio automático de pedidos voltar, um proprietário ou
                            administrador cadastra o token de novo abaixo — uma vez por organização, e passa a valer em todos os
                            navegadores dela.
                        </p>
                    </div>
                    <button type="button" onClick={dispensarAviso} className="shrink-0 text-sm font-medium text-amber-900 hover:underline">
                        Entendi
                    </button>
                </div>
            )}

            <div className="mt-6 border-t border-gray-100">
                {situacoes === null ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : erro ? (
                    <p role="alert" className="pt-4 text-sm text-red-600">Não foi possível ler a configuração do WhatsApp: {erro}</p>
                ) : linhas.length === 0 ? (
                    <p className="pt-4 text-sm text-gray-500">
                        {orgId ? 'Você não é membro da organização selecionada no topo.' : 'Você não é membro de nenhuma organização.'}
                    </p>
                ) : (
                    <ul className="divide-y divide-gray-100">
                        {linhas.map(s => {
                            const nome = nomeDaOrg(s.organizationId);
                            const detalhe = [s.numeroExibicao, s.nomeVerificado].filter(Boolean).join(' · ');
                            const trocado = formatarData(s.tokenAtualizadoEm);
                            return (
                                <li key={s.organizationId} className="py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-900 truncate">{nome}</p>
                                        <p className="text-sm mt-0.5">
                                            <span className={s.configurado ? 'text-green-700' : 'text-gray-600'}>
                                                {s.configurado ? 'Configurado' : 'Não configurado'}
                                            </span>
                                            {s.configurado && detalhe && <span className="text-gray-600"> · {detalhe}</span>}
                                        </p>
                                        {s.configurado && trocado && (
                                            <p className="text-xs text-gray-500 mt-0.5">
                                                Token cadastrado em {trocado}{s.tokenAtualizadoPor ? ` por ${s.tokenAtualizadoPor}` : ''}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <span className="inline-flex" title={s.podeConfigurar ? undefined : MOTIVO_NAO_GESTOR}>
                                            <button
                                                type="button"
                                                disabled={!s.podeConfigurar}
                                                onClick={() => abrir(s)}
                                                className={BOTAO_SECUNDARIO}
                                            >
                                                {s.configurado ? 'Trocar token' : 'Configurar'}
                                            </button>
                                        </span>
                                        {s.configurado && (
                                            <span
                                                className="inline-flex"
                                                title={!s.podeConfigurar ? MOTIVO_NAO_GESTOR : removendo === s.organizationId ? 'Removendo…' : undefined}
                                            >
                                                <ActionIconButton
                                                    kind="delete"
                                                    title="Remover o token desta organização"
                                                    disabled={!s.podeConfigurar || removendo === s.organizationId}
                                                    onClick={() => void remover(s)}
                                                />
                                            </span>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            <Sheet open={!!editando} onClose={fechar} size="md" dirty={dirty && !salvando}>
                {editando && (
                    <>
                        <SheetHeader onClose={() => void pedirFechar()}>
                            <SheetTitle>WhatsApp de {nomeDaOrg(editando.organizationId)}</SheetTitle>
                            <SheetDescription>
                                {editando.configurado
                                    ? 'Troque o token, o número ou o template. Token em branco mantém o que está guardado.'
                                    : 'O token é testado na Meta antes de ser guardado no servidor.'}
                            </SheetDescription>
                        </SheetHeader>
                        <SheetPanel className="px-6 py-5">
                            <form
                                id="form-whatsapp-cloud"
                                onSubmit={e => { e.preventDefault(); void salvar(); }}
                                className="space-y-4"
                            >
                                <div className="space-y-1.5">
                                    <label htmlFor="wa-phone-number-id" className={ROTULO}>Phone Number ID</label>
                                    <input
                                        id="wa-phone-number-id"
                                        inputMode="numeric"
                                        autoComplete="off"
                                        value={form.phoneNumberId}
                                        onChange={e => setForm(f => ({ ...f, phoneNumberId: e.target.value }))}
                                        placeholder="ex.: 123456789012345"
                                        className={CAMPO}
                                    />
                                    <p className="text-xs text-gray-500">Meta for Developers › seu app › WhatsApp › API Setup.</p>
                                </div>
                                <div className="space-y-1.5">
                                    <label htmlFor="wa-token" className={ROTULO}>Token de acesso</label>
                                    <input
                                        id="wa-token"
                                        type="password"
                                        autoComplete="new-password"
                                        value={form.token}
                                        onChange={e => setForm(f => ({ ...f, token: e.target.value }))}
                                        placeholder={editando.configurado ? 'Em branco: mantém o token guardado' : 'Token permanente do System User'}
                                        className={CAMPO}
                                    />
                                    <p className="text-xs text-gray-500">Guardado só no servidor. Não volta para esta tela, para ninguém.</p>
                                </div>
                                <div className="space-y-1.5">
                                    <label htmlFor="wa-template" className={ROTULO}>Template de pedido enviado</label>
                                    <input
                                        id="wa-template"
                                        autoComplete="off"
                                        value={form.template}
                                        onChange={e => setForm(f => ({ ...f, template: e.target.value }))}
                                        className={CAMPO}
                                    />
                                    <p className="text-xs text-gray-500">Nome exato do template aprovado na conta WhatsApp Business desta organização.</p>
                                </div>
                                {erroForm && <p role="alert" className="text-sm text-red-600">{erroForm}</p>}
                            </form>
                        </SheetPanel>
                        <SheetFooter>
                            <button type="button" onClick={() => void pedirFechar()} className={BOTAO_SECUNDARIO}>Cancelar</button>
                            <span className="inline-flex" title={motivoSalvar ?? (salvando ? 'Testando o token na Meta…' : undefined)}>
                                <button
                                    type="submit"
                                    form="form-whatsapp-cloud"
                                    disabled={!!motivoSalvar || salvando}
                                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {salvando
                                        ? <Loader2 className="w-[15px] h-[15px] animate-spin" />
                                        : <CheckCircle className="w-[15px] h-[15px]" />}
                                    {salvando ? 'Testando na Meta…' : 'Testar e salvar'}
                                </button>
                            </span>
                        </SheetFooter>
                    </>
                )}
            </Sheet>
        </div>
    );
};

export default WhatsappCloudSettings;
