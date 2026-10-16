/**
 * Conectar (ou reconectar) uma caixa Gmail à captura de boletos.
 *
 * Plano: docs/planos/2026-10-15-captura-boletos-por-email.md (item 4.3).
 * A senha de app vai direto para a Edge Function, que a testa no Gmail antes de
 * guardar no cofre — e ela nunca volta para a tela.
 */
import React, { useEffect, useState } from 'react';
import { Loader2, Mail, KeyRound, Info } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { emailCaptureService, ROTULO_MODO, AJUDA_MODO, type ContaCaptura, type ModoCaptura } from '../../services/emailCaptureService';

const ROTULO = 'text-xs font-semibold text-slate-500';
const CAMPO = 'w-full px-3 h-9 bg-gray-50 border border-gray-100 rounded-[6px] text-sm text-gray-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all disabled:opacity-60';

interface Props {
    open: boolean;
    onClose: () => void;
    /** Organização dona da caixa (já resolvida pela tela — REGRA #5). */
    organizationId: string | null;
    /** Reconectar: só pede a nova senha desta conta. */
    reconectar?: ContaCaptura | null;
    onPronta: (conta: ContaCaptura) => void;
}

/** Data LOCAL em AAAA-MM-DD — `toISOString()` é UTC e, depois das 21h em Brasília, já dá o dia seguinte. */
const dataLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hoje = () => dataLocal(new Date());

const EmailCaptureAccountSheet: React.FC<Props> = ({ open, onClose, organizationId, reconectar, onPronta }) => {
    const [usuario, setUsuario] = useState('');
    const [senha, setSenha] = useState('');
    const [modo, setModo] = useState<ModoCaptura>('hibrido');
    const [dataInicial, setDataInicial] = useState(hoje());
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setUsuario(reconectar?.usuario ?? '');
        setSenha('');
        setModo(reconectar?.modo ?? 'hibrido');
        setDataInicial(reconectar?.data_inicial ?? hoje());
        setErro(null);
    }, [open, reconectar]);

    const dirty = !!senha || (!reconectar && !!usuario);

    const motivoDesligado: string | null = enviando
        ? 'Testando a conexão com o Gmail…'
        : !reconectar && !organizationId
            ? 'Escolha a organização dona da caixa.'
            : !reconectar && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(usuario.trim())
                ? 'Informe o endereço de e-mail da caixa.'
                : !senha.trim()
                    ? 'Informe a senha de app gerada no Google.'
                    : null;

    async function enviar() {
        if (motivoDesligado) return;
        setEnviando(true);
        setErro(null);
        try {
            const conta = reconectar
                ? await emailCaptureService.reautenticar(reconectar.id, senha)
                : await emailCaptureService.conectar({ organizationId: organizationId!, usuario: usuario.trim(), senha, modo, dataInicial });
            setSenha('');
            onPronta(conta);
            onClose();
        } catch (e) {
            setErro(e instanceof Error ? e.message : String(e));
        } finally {
            setEnviando(false);
        }
    }

    if (!open) return null;

    return (
        <Sheet open={open} onClose={onClose} size="md" dirty={dirty && !enviando}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>{reconectar ? 'Reconectar caixa' : 'Conectar caixa do Gmail'}</SheetTitle>
                <SheetDescription>
                    {reconectar
                        ? `Nova senha de app para ${reconectar.usuario}.`
                        : 'Os PDFs de boleto recebidos nesta caixa entram em Boletos a Pagar para revisão.'}
                </SheetDescription>
            </SheetHeader>

            <SheetPanel className="px-6 py-5 space-y-8">
                <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-y-4">
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="ecap-usuario">E-mail da caixa</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input id="ecap-usuario" type="email" autoComplete="off" value={usuario}
                                    onChange={e => setUsuario(e.target.value)} disabled={!!reconectar}
                                    placeholder="financeiro@gmail.com" className={`${CAMPO} pl-9`} />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO} htmlFor="ecap-senha">Senha de app</label>
                            <div className="relative">
                                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input id="ecap-senha" type="password" autoComplete="new-password" value={senha}
                                    onChange={e => setSenha(e.target.value)}
                                    placeholder="xxxx xxxx xxxx xxxx" className={`${CAMPO} pl-9`} />
                            </div>
                            <p className="text-xs text-gray-500">
                                Não é a senha do Gmail. Na Conta Google: Segurança › Verificação em duas etapas (precisa estar ativa) › Senhas de app › criar uma para “ÒPURA”.
                            </p>
                        </div>
                    </div>
                </div>

                {!reconectar && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="ecap-modo">Quais remetentes ler</label>
                                <select id="ecap-modo" value={modo} onChange={e => setModo(e.target.value as ModoCaptura)} className={CAMPO}>
                                    {(Object.keys(ROTULO_MODO) as ModoCaptura[]).map(m => <option key={m} value={m}>{ROTULO_MODO[m]}</option>)}
                                </select>
                                <p className="text-xs text-gray-500">{AJUDA_MODO[modo]}</p>
                            </div>
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="ecap-data">Ler e-mails a partir de</label>
                                <input id="ecap-data" type="date" value={dataInicial} max={hoje()}
                                    onChange={e => setDataInicial(e.target.value)} className={CAMPO} />
                            </div>
                        </div>
                        <div className="flex gap-2 rounded-[10px] border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs text-blue-800">
                            <Info className="w-4 h-4 shrink-0 mt-px" />
                            <p>
                                A caixa nasce em <strong>modo piloto</strong>: todo boleto capturado vai para “Em revisão”, mesmo de remetente
                                monitorado. Importar nunca cria título nem paga nada — quem lança é “Aprovar e Lançar”.
                            </p>
                        </div>
                    </div>
                )}

                {erro && (
                    <p className="rounded-[10px] border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-700">{erro}</p>
                )}
            </SheetPanel>

            <SheetFooter>
                <button onClick={onClose} disabled={enviando} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px] disabled:opacity-50">
                    Cancelar
                </button>
                <button onClick={enviar} disabled={!!motivoDesligado} title={motivoDesligado ?? undefined}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                    {enviando && <Loader2 className="w-4 h-4 animate-spin" />}
                    {reconectar ? 'Reconectar caixa' : 'Conectar caixa'}
                </button>
            </SheetFooter>
        </Sheet>
    );
};

export default EmailCaptureAccountSheet;
