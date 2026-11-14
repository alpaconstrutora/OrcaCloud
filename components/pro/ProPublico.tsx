import React from 'react';
import type { Session } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { proService } from '../../services/proService';
import { ProModule } from '../ProModule';
import { ProEntrada } from './ProEntrada';
import { ProApresentacao } from './ProApresentacao';
import { ProPrimeiroAcesso } from './ProPrimeiroAcesso';
import { ORIGEM_PRO, ENDERECO_PRO } from '../../utils/proPublico';

/**
 * ÒPURA Pro público — a casca de `/pro` (14/11/2026, docs/planos/2026-11-14-opura-pro-publico.md).
 *
 * Fica FORA do <Layout> do ÒPURA (o App.tsx monta isto antes dos guards de login, como os
 * portais): sem sidebar, sem seletor de organização, sem sino. Sessão própria, lida direto
 * do Supabase. Sem sessão → entrada; sem cadastro do Pro → primeiro acesso; senão → o Pro.
 *
 * O isolamento de DADOS é do banco (pro_* por auth.uid(); nada de organização). O de TELA é
 * este componente + `destinoDaContaSoPro` no App.tsx.
 */

const VIEW_INICIAL = 'pro-dashboard';
// Sem sessão: `/pro` é a apresentação; `/pro/entrar` vai direto à entrada (link de "Entrar").
const ENDERECO_ENTRAR = `${ENDERECO_PRO}/entrar`;
const MANIFESTO_PRO = '/pro.webmanifest';

// Conta nova vinda do Google não traz `origem` (o OAuth não aceita metadados no cadastro).
// Se ela acabou de nascer e entrou pelo /pro, é conta do Pro.
const JANELA_CONTA_NOVA_MS = 10 * 60 * 1000;

export const ProPublico: React.FC = () => {
  const [session, setSession] = React.useState<Session | null>(null);
  const [carregando, setCarregando] = React.useState(true);
  const [temCadastro, setTemCadastro] = React.useState<boolean | null>(null);
  const [view, setView] = React.useState(VIEW_INICIAL);
  const [naEntrada, setNaEntrada] = React.useState(() => window.location.pathname.startsWith(ENDERECO_ENTRAR));

  // Apresentação ↔ entrada no histórico: o "voltar" do celular volta para a apresentação.
  React.useEffect(() => {
    const aoVoltar = () => setNaEntrada(window.location.pathname.startsWith(ENDERECO_ENTRAR));
    window.addEventListener('popstate', aoVoltar);
    return () => window.removeEventListener('popstate', aoVoltar);
  }, []);

  // Só volta no histórico se FOI a apresentação que empurrou a entrada; quem chegou direto em
  // /pro/entrar (link) troca o endereço no lugar — senão o "voltar" sairia do site.
  const empurrouEntrada = React.useRef(false);
  const irParaEntrada = () => {
    window.history.pushState(null, '', ENDERECO_ENTRAR);
    empurrouEntrada.current = true;
    setNaEntrada(true);
    window.scrollTo(0, 0);
  };
  const voltarParaApresentacao = () => {
    if (empurrouEntrada.current) window.history.back();
    else window.history.replaceState(null, '', ENDERECO_PRO);
    empurrouEntrada.current = false;
    setNaEntrada(false);
  };

  // Instalável como "ÒPURA Pro" (manifesto próprio), não como o app da construtora.
  React.useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) {
      const novo = document.createElement('link');
      novo.rel = 'manifest';
      novo.href = MANIFESTO_PRO;
      document.head.appendChild(novo);
    } else {
      link.href = MANIFESTO_PRO;
    }
    document.title = 'ÒPURA Pro';
  }, []);

  React.useEffect(() => {
    let vivo = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return;
      setSession(data.session);
      setCarregando(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_evento, nova) => {
      setSession(nova);
      setCarregando(false);
    });
    return () => { vivo = false; data.subscription.unsubscribe(); };
  }, []);

  // Marca a conta nova do Google como do Pro (a do e-mail já nasce marcada em ProEntrada).
  React.useEffect(() => {
    const usuario = session?.user;
    if (!usuario || usuario.user_metadata?.origem) return;
    const criadaHaPouco = Date.now() - new Date(usuario.created_at).getTime() < JANELA_CONTA_NOVA_MS;
    if (criadaHaPouco) supabase.auth.updateUser({ data: { origem: ORIGEM_PRO } }).catch(() => undefined);
  }, [session]);

  const userId = session?.user?.id || '';

  const conferirCadastro = React.useCallback(async () => {
    if (!userId) return;
    setTemCadastro(null);
    try {
      const config = await proService.getConfig(userId);
      setTemCadastro(!!config);
    } catch (err) {
      console.error('Erro ao conferir o cadastro do Pro:', err);
      // Sem conseguir ler, não força o primeiro acesso por cima de um cadastro que pode existir.
      setTemCadastro(true);
    }
  }, [userId]);

  React.useEffect(() => { conferirCadastro(); }, [conferirCadastro]);

  const sair = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setTemCadastro(null);
    setView(VIEW_INICIAL);
  };

  if (carregando || (session && temCadastro === null)) {
    return (
      <div className="min-h-[100dvh] bg-slate-50 flex items-center justify-center" role="status">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" aria-hidden />
        <span className="sr-only">Carregando…</span>
      </div>
    );
  }

  if (!session) {
    return naEntrada
      ? <ProEntrada onVoltar={voltarParaApresentacao} />
      : <ProApresentacao onCriarConta={irParaEntrada} onEntrar={irParaEntrada} />;
  }

  if (!temCadastro) {
    return (
      <ProPrimeiroAcesso
        userId={userId}
        onConcluir={() => { setTemCadastro(true); setView('pro-orcamento-form'); }}
        onSair={sair}
      />
    );
  }

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <main className="px-4 pt-[max(1rem,env(safe-area-inset-top))] md:px-6 md:pt-6 md:mx-auto md:max-w-3xl">
        <ProModule activeView={view} onChangeView={setView} userId={userId} onSair={sair} />
      </main>
    </div>
  );
};

export default ProPublico;
