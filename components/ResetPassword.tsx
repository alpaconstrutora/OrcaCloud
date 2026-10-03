import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Lock, Loader2, AlertCircle, CheckCircle, Mail, ShieldAlert } from 'lucide-react';
import Button from './ui/Button';

interface ResetPasswordProps {
    onComplete: () => void;
    /** E-mail da conta que chegou pelo link — mostrado já preenchido, sem edição:
     *  o link identifica a pessoa, ela não precisa digitar (pedido de 03/10/2026). */
    email?: string;
    /** E-mail que o PRÓPRIO link identifica (lib/linkDeAcesso.ts). Quando a sessão
     *  corrente é de outra conta — outra aba entrou ou renovou a sessão
     *  compartilhada —, a tela não grava: gravaria a senha da conta errada
     *  (aconteceu em 03/10/2026, mostrando o e-mail do desenvolvedor). */
    emailDoLink?: string | null;
    /** Convite = conta nova criando a primeira senha; recovery = redefinição. */
    tipo?: 'invite' | 'recovery';
}

const ResetPassword: React.FC<ResetPasswordProps> = ({ onComplete, email, emailDoLink, tipo = 'recovery' }) => {
    const ehConvite = tipo === 'invite';
    const emailDaSessao = (email || '').trim().toLowerCase();
    const emailMostrado = emailDoLink || emailDaSessao;
    const sessaoDeOutraConta = !!emailDoLink && !!emailDaSessao && emailDaSessao !== emailDoLink;
    const [loading, setLoading] = useState(false);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            setErrorMessage('As senhas não coincidem.');
            return;
        }

        setLoading(true);
        setErrorMessage(null);

        try {
            // Confere com o servidor, na hora de gravar, de quem é a sessão: entre a
            // tela abrir e o clique, outra aba pode ter trocado a conta.
            if (emailDoLink) {
                const { data } = await supabase.auth.getUser();
                const atual = (data.user?.email || '').toLowerCase();
                if (atual !== emailDoLink) {
                    setErrorMessage(`Este navegador está conectado como ${atual || 'outra conta'}, não como ${emailDoLink}. Nada foi gravado. Feche as outras abas do sistema e abra o link do e-mail de novo.`);
                    return;
                }
            }
            const { error } = await supabase.auth.updateUser({
                password: password,
            });
            if (error) throw error;
            setSuccess(true);
            setTimeout(() => {
                onComplete();
            }, 2000);
        } catch (error: any) {
            console.error('Password reset error:', error);
            setErrorMessage(error.message || 'Ocorreu um erro ao redefinir a senha.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-4">
            <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 border border-gray-100">
                <div className="flex flex-col items-center mb-8">
                    <div className="bg-blue-600 p-3 rounded-xl mb-4 shadow-lg shadow-blue-200">
                        <Lock className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900">{ehConvite ? 'Criar sua senha' : 'Nova senha'}</h1>
                    <p className="text-gray-500 mt-1">{ehConvite ? 'Defina a senha para entrar com o seu e-mail' : 'Defina sua nova senha de acesso'}</p>
                </div>

                {sessaoDeOutraConta ? (
                    <div className="space-y-4">
                        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-lg text-sm flex items-start gap-2">
                            <ShieldAlert className="w-5 h-5 shrink-0" />
                            <span>
                                Este link é para criar a senha de <strong>{emailDoLink}</strong>, mas este navegador
                                está conectado como <strong>{emailDaSessao}</strong> em outra aba. Para não alterar a senha
                                da conta errada, nada será gravado aqui.
                            </span>
                        </div>
                        <p className="text-sm text-gray-600">
                            Feche as outras abas do sistema e abra o link do e-mail de novo — ou abra o link numa janela anônima.
                        </p>
                    </div>
                ) : success ? (
                    <div className="text-center py-4">
                        <div className="flex justify-center mb-4">
                            <CheckCircle className="w-12 h-12 text-green-500" />
                        </div>
                        <p className="text-gray-700 font-medium">{ehConvite ? 'Senha criada com sucesso!' : 'Senha alterada com sucesso!'}</p>
                        <p className="text-sm text-gray-500 mt-2">Redirecionando para o painel...</p>
                    </div>
                ) : (
                    <form onSubmit={handleReset} className="space-y-4">
                        {emailMostrado && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                                    <input
                                        type="email"
                                        value={emailMostrado}
                                        readOnly
                                        autoComplete="username"
                                        title="O e-mail vem do link que você recebeu"
                                        className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-600 cursor-not-allowed outline-none"
                                    />
                                </div>
                            </div>
                        )}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{ehConvite ? 'Senha' : 'Nova Senha'}</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    placeholder="******"
                                    required
                                    minLength={6}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar Senha</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    placeholder="******"
                                    required
                                    minLength={6}
                                />
                            </div>
                        </div>

                        {errorMessage && (
                            <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg text-sm flex items-start gap-2">
                                <AlertCircle className="w-5 h-5 shrink-0" />
                                <span>{errorMessage}</span>
                            </div>
                        )}

                        <Button
                            type="submit"
                            disabled={loading}
                            className="w-full shadow-md hover:shadow-lg disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                ehConvite ? 'Criar senha e entrar' : 'Salvar Nova Senha'
                            )}
                        </Button>
                    </form>
                )}
            </div>
        </div>
    );
};

/**
 * O servidor recusou o link de convite/redefinição (já usado ou vencido) e voltou
 * com `#error=…&error_code=otp_expired`. Diz isso em vez de cair calado num login.
 */
export const LinkDeAcessoInvalido: React.FC<{ onContinuar: () => void }> = ({ onContinuar }) => (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 border border-gray-100 text-center space-y-4">
            <div className="flex justify-center">
                <div className="bg-amber-500 p-3 rounded-xl shadow-lg shadow-amber-200">
                    <AlertCircle className="w-8 h-8 text-white" />
                </div>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Link expirado ou já usado</h1>
            <p className="text-gray-600 text-sm leading-relaxed">
                Cada link de acesso funciona uma vez só. Se você já criou sua senha, entre com o seu e-mail e a senha.
                Se ainda não criou, peça à construtora para reenviar o convite.
            </p>
            <Button onClick={onContinuar} className="w-full">Ir para o login</Button>
        </div>
    </div>
);

export default ResetPassword;
