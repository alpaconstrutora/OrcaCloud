import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Building2, Lock, Mail, Loader2, AlertCircle, User, TrendingUp, Code, ArrowLeft } from 'lucide-react';
import { ProfileGroup } from '../types';

interface AuthProps {
    group?: ProfileGroup;
    onBack?: () => void;
}

const Auth: React.FC<AuthProps> = ({ group = ProfileGroup.USER, onBack }) => {
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [view, setView] = useState<'login' | 'signup' | 'forgot-password'>('login');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const getTheme = () => {
        switch (group) {
            case ProfileGroup.CLIENT:
                return {
                    primary: 'bg-emerald-600',
                    ring: 'focus:ring-emerald-500',
                    text: 'text-emerald-600',
                    icon: Building2,
                    title: 'Portal do Cliente',
                    subtitle: 'Acompanhe seu contrato e obra'
                };
            case ProfileGroup.INVESTOR:
                return {
                    primary: 'bg-purple-600',
                    ring: 'focus:ring-purple-500',
                    text: 'text-purple-600',
                    icon: TrendingUp,
                    title: 'Portal do Investidor',
                    subtitle: 'Gestão de participações e cotas'
                };
            case ProfileGroup.DEVELOPER:
                return {
                    primary: 'bg-slate-800',
                    ring: 'focus:ring-slate-700',
                    text: 'text-slate-800',
                    icon: Code,
                    title: 'Área do Desenvolvedor',
                    subtitle: 'Acesso técnico ao ecossistema'
                };
            default:
                return {
                    primary: 'bg-blue-600',
                    ring: 'focus:ring-blue-500',
                    text: 'text-blue-600',
                    icon: User,
                    title: 'Portal do Colaborador',
                    subtitle: 'Gestão de Orçamentos Profissionais'
                };
        }
    };

    const theme = getTheme();

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setErrorMessage(null);
        setSuccessMessage(null);

        try {
            if (view === 'login') {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
            } else if (view === 'signup') {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                });
                if (error) throw error;
                alert('Cadastro realizado com sucesso! Você já pode fazer login.');
                setView('login');
            } else if (view === 'forgot-password') {
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: `${window.location.origin}/`,
                });
                if (error) throw error;
                setSuccessMessage('Instruções de recuperação enviadas para o seu e-mail.');
            }
        } catch (error: any) {
            console.error('Authentication error:', error);
            setErrorMessage(error.message || 'Ocorreu um erro na autenticação.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-4 relative overflow-hidden">
            {onBack && (
                <button
                    onClick={onBack}
                    className="absolute top-8 left-8 flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Voltar para Portais
                </button>
            )}

            <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-10 border border-gray-100">
                <div className="flex flex-col items-center mb-10">
                    <div className={`${theme.primary} p-4 rounded-2xl mb-4 shadow-lg shadow-gray-200`}>
                        <theme.icon className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">{theme.title}</h1>
                    <p className="text-gray-500 mt-1 font-medium">{theme.subtitle}</p>
                </div>

                <form onSubmit={handleAuth} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className={`w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 ${theme.ring} outline-none transition-all font-medium`}
                                placeholder="seu@email.com"
                                required
                            />
                        </div>
                    </div>

                    {view !== 'forgot-password' && (
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <label className="block text-sm font-medium text-gray-700">Senha</label>
                                {view === 'login' && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setView('forgot-password');
                                            setErrorMessage(null);
                                            setSuccessMessage(null);
                                        }}
                                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                                    >
                                        Esqueceu a senha?
                                    </button>
                                )}
                            </div>
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
                    )}

                    {errorMessage && (
                        <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg text-sm flex items-start gap-2">
                            <AlertCircle className="w-5 h-5 shrink-0" />
                            <span>{errorMessage}</span>
                        </div>
                    )}

                    {successMessage && (
                        <div className="bg-green-50 border border-green-200 text-green-600 p-3 rounded-lg text-sm flex items-start gap-2">
                            <AlertCircle className="w-5 h-5 shrink-0 text-green-600" />
                            <span>{successMessage}</span>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className={`w-full ${theme.primary} hover:opacity-90 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-70 disabled:cursor-not-allowed transform active:scale-[0.98]`}
                    >
                        {loading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            view === 'login' ? 'Entrar Agora' :
                                view === 'signup' ? 'Criar Minha Conta' :
                                    'Recuperar Acesso'
                        )}
                    </button>
                </form>

                <div className="mt-6 text-center text-sm text-gray-600 border-t border-gray-100 pt-6">
                    {view === 'forgot-password' ? (
                        <button
                            onClick={() => {
                                setView('login');
                                setErrorMessage(null);
                                setSuccessMessage(null);
                            }}
                            className="text-blue-600 hover:text-blue-800 font-semibold transition-colors"
                        >
                            Voltar para o Login
                        </button>
                    ) : (
                        <>
                            {view === 'login' ? 'Não tem uma conta?' : 'Já tem uma conta?'}
                            <button
                                onClick={() => {
                                    setView(view === 'login' ? 'signup' : 'login');
                                    setErrorMessage(null);
                                    setSuccessMessage(null);
                                }}
                                className="ml-1 text-blue-600 hover:text-blue-800 font-semibold transition-colors"
                            >
                                {view === 'login' ? 'Cadastre-se' : 'Fazer Login'}
                            </button>
                        </>
                    )}
                </div>
            </div>
            <p className="mt-8 text-xs text-center text-gray-400 max-w-sm">
                Ao continuar, você concorda com nossos Termos de Serviço e Política de Privacidade.
            </p>
        </div>
    );
};

export default Auth;
