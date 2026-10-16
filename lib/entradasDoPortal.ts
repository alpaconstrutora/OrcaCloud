import type { LucideIcon } from 'lucide-react';
import {
    Award, BookOpen, Briefcase, Building2, ClipboardList, DollarSign, FileSignature, FileText,
    FolderOpen, GraduationCap, HardHat, History, Package, Receipt, Truck, Users, Wallet,
} from 'lucide-react';
import { ProfileGroup } from '../types';

/**
 * Entradas próprias dos portais: cada portal com página de login EXCLUSIVA no
 * seu endereço (sem token), por e-mail e senha.
 *
 * Nasceu em 16/10/2026 com o Portal de Treinamentos (`lib/rotaDeEntradaDoPortal.ts`,
 * um portal só) e no mesmo dia ganhou Cliente, Fornecedor, Parceiro B2B e Corretor
 * (docs/planos/2026-10-16-portais-login-exclusivo-convite.md).
 *
 * Quem consome:
 *  - `App.tsx`: o efeito de rota força o grupo em memória quando o pathname bate
 *    com `rota` e não há `?token=`; o cartão do seletor troca o endereço para a
 *    rota ANTES de escolher o grupo; sem sessão, renderiza `PortalLogin` com a
 *    entrada do grupo; um login recusado volta o endereço para "/".
 *  - `components/portal/PortalLogin.tsx`: identidade (cor, ícone, textos).
 *  - `store/useStore.ts` (`logout`): "Sair" volta à página do próprio portal.
 *
 * ⚠️ As classes de cor estão escritas POR EXTENSO: o JIT do Tailwind não enxerga
 * classe montada em runtime (`bg-${cor}-600` nunca entraria no CSS).
 *
 * Investidor, Crédito, Colaborador e Desenvolvedor NÃO têm entrada própria: entram
 * pelo seletor e pelo `Auth` genérico. Incluir um deles aqui é decisão de produto —
 * o teste `__tests__/entradasDoPortal.test.ts` trava o conjunto.
 */

export interface DestaqueDaEntrada {
    icone: LucideIcon;
    titulo: string;
    texto: string;
}

export interface CoresDaEntrada {
    /** Painel esquerdo (desktop). */
    painel: string;
    /** Texto secundário sobre o painel. */
    painelTexto: string;
    /** Rodapé do painel. */
    painelRodape: string;
    /** Caixa do ícone no celular (fundo sólido + texto branco). */
    iconeMovel: string;
    /** Botão primário (fundo + hover). */
    botao: string;
    /** Links de texto (esqueci a senha, voltar, primeiro acesso). */
    link: string;
    /** Foco dos campos. */
    foco: string;
}

export interface EntradaDoPortal {
    grupo: ProfileGroup;
    rota: string;
    /** Nome do portal — o mesmo do cartão do seletor (`LoginGateway`). */
    titulo: string;
    /** Rótulo pequeno no topo do painel. */
    assinatura: string;
    /** Frase sob o título, no painel. */
    descricao: string;
    /** Sob o "Entrar", no formulário. */
    dica: string;
    icone: LucideIcon;
    destaques: readonly [DestaqueDaEntrada, DestaqueDaEntrada, DestaqueDaEntrada];
    /** Mostra "Primeiro acesso? Crie sua senha" (signUp). Só onde a empresa cadastra a
     *  pessoa e ela pode criar a própria conta; onde há convite obrigatório, não. */
    permitePrimeiroAcesso: boolean;
    /** Rodapé do formulário. */
    rodape: string;
    cores: CoresDaEntrada;
}

const EMERALD: CoresDaEntrada = {
    painel: 'bg-emerald-700', painelTexto: 'text-emerald-100', painelRodape: 'text-emerald-200',
    iconeMovel: 'bg-emerald-600', botao: 'bg-emerald-600 hover:bg-emerald-700',
    link: 'text-emerald-700 hover:text-emerald-900', foco: 'focus:border-emerald-500 focus:ring-emerald-500/30',
};
const AMBER: CoresDaEntrada = {
    painel: 'bg-amber-700', painelTexto: 'text-amber-100', painelRodape: 'text-amber-200',
    iconeMovel: 'bg-amber-600', botao: 'bg-amber-600 hover:bg-amber-700',
    link: 'text-amber-700 hover:text-amber-900', foco: 'focus:border-amber-500 focus:ring-amber-500/30',
};
const ORANGE: CoresDaEntrada = {
    painel: 'bg-orange-600', painelTexto: 'text-orange-100', painelRodape: 'text-orange-200',
    iconeMovel: 'bg-orange-500', botao: 'bg-orange-500 hover:bg-orange-600',
    link: 'text-orange-600 hover:text-orange-800', foco: 'focus:border-orange-500 focus:ring-orange-500/30',
};
const INDIGO: CoresDaEntrada = {
    painel: 'bg-indigo-700', painelTexto: 'text-indigo-100', painelRodape: 'text-indigo-200',
    iconeMovel: 'bg-indigo-600', botao: 'bg-indigo-600 hover:bg-indigo-700',
    link: 'text-indigo-700 hover:text-indigo-900', foco: 'focus:border-indigo-500 focus:ring-indigo-500/30',
};
const TEAL: CoresDaEntrada = {
    painel: 'bg-teal-700', painelTexto: 'text-teal-100', painelRodape: 'text-teal-200',
    iconeMovel: 'bg-teal-600', botao: 'bg-teal-600 hover:bg-teal-700',
    link: 'text-teal-700 hover:text-teal-900', foco: 'focus:border-teal-500 focus:ring-teal-500/30',
};

const RODAPE_CONVITE = 'Não recebeu o convite? Fale com a construtora.';

export const ENTRADAS_DO_PORTAL: Readonly<Partial<Record<ProfileGroup, EntradaDoPortal>>> = {
    [ProfileGroup.CLIENT]: {
        grupo: ProfileGroup.CLIENT,
        rota: '/portal-cliente',
        titulo: 'Portal do Cliente',
        assinatura: 'ÒPURA',
        descricao: 'Acompanhe sua obra, seus pagamentos e os documentos do contrato.',
        dica: 'Use o e-mail cadastrado na construtora.',
        icone: Building2,
        destaques: [
            { icone: HardHat, titulo: 'Sua obra', texto: 'Andamento, diário e fotos do canteiro.' },
            { icone: Wallet, titulo: 'Pagamentos', texto: 'Parcelas, recibos e segunda via.' },
            { icone: FileText, titulo: 'Documentos e contrato', texto: 'Tudo o que foi assinado, em um só lugar.' },
        ],
        permitePrimeiroAcesso: true,
        rodape: RODAPE_CONVITE,
        cores: EMERALD,
    },
    [ProfileGroup.SUPPLIER]: {
        grupo: ProfileGroup.SUPPLIER,
        rota: '/portal-fornecedor',
        titulo: 'Portal do Fornecedor',
        assinatura: 'ÒPURA',
        descricao: 'Cotações, pedidos e notas fiscais das construtoras que você atende.',
        dica: 'Use o e-mail cadastrado na construtora.',
        icone: Truck,
        destaques: [
            { icone: ClipboardList, titulo: 'Cotações e lances', texto: 'Responda pedidos de cotação e negocie.' },
            { icone: Package, titulo: 'Pedidos', texto: 'Acompanhe pedidos de compra e entregas.' },
            { icone: Receipt, titulo: 'Notas fiscais', texto: 'Envie a NF-e e acompanhe o pagamento.' },
        ],
        permitePrimeiroAcesso: true,
        rodape: RODAPE_CONVITE,
        cores: AMBER,
    },
    [ProfileGroup.PARTNER]: {
        grupo: ProfileGroup.PARTNER,
        rota: '/portal-parceiro',
        titulo: 'Portal do Parceiro B2B',
        assinatura: 'ÒPURA',
        descricao: 'Área de colaboração para prestadores de serviço e contratos.',
        dica: 'Use o e-mail em que recebeu o convite.',
        icone: Users,
        destaques: [
            { icone: FileSignature, titulo: 'Contratos e medições', texto: 'Aditivos, retenções e medições aprovadas.' },
            { icone: Wallet, titulo: 'Financeiro', texto: 'O que está a receber, pago e retido.' },
            { icone: FolderOpen, titulo: 'Documentos', texto: 'Envie e receba documentos do contrato.' },
        ],
        permitePrimeiroAcesso: false,
        rodape: RODAPE_CONVITE,
        cores: ORANGE,
    },
    [ProfileGroup.BROKER]: {
        grupo: ProfileGroup.BROKER,
        rota: '/portal-corretor',
        titulo: 'Portal do Corretor',
        assinatura: 'ÒPURA',
        descricao: 'Estoque, propostas e comissões dos empreendimentos que você vende.',
        dica: 'Use o e-mail cadastrado na construtora.',
        icone: Briefcase,
        destaques: [
            { icone: Building2, titulo: 'Estoque', texto: 'Unidades disponíveis e tabela de preços.' },
            { icone: FileText, titulo: 'Propostas e leads', texto: 'Registre propostas e acompanhe o andamento.' },
            { icone: DollarSign, titulo: 'Comissões', texto: 'O que já foi pago e o que está previsto.' },
        ],
        permitePrimeiroAcesso: true,
        rodape: RODAPE_CONVITE,
        cores: INDIGO,
    },
    [ProfileGroup.TRAINEE]: {
        grupo: ProfileGroup.TRAINEE,
        rota: '/portal-treinamentos',
        titulo: 'Portal de Treinamentos',
        assinatura: 'Academia ÒPURA',
        descricao: 'Acesso de colaboradores e terceirizados aos treinamentos da sua empresa.',
        dica: 'Use o e-mail em que recebeu o convite.',
        icone: GraduationCap,
        destaques: [
            { icone: BookOpen, titulo: 'Aulas e provas', texto: 'Assista no seu ritmo e faça a avaliação ao final.' },
            { icone: Award, titulo: 'Certificados', texto: 'Baixe o PDF e compartilhe o link de validação.' },
            { icone: History, titulo: 'Histórico de treinamentos', texto: 'Presenciais e a distância, com validade e reciclagem.' },
        ],
        permitePrimeiroAcesso: false,
        rodape: 'Não recebeu o convite? Fale com o RH da sua empresa.',
        cores: TEAL,
    },
};

/** Entrada própria do grupo, ou `null` quando o grupo entra pelo seletor comum. */
export function entradaDoPortal(grupo: ProfileGroup | null | undefined): EntradaDoPortal | null {
    return (grupo && ENTRADAS_DO_PORTAL[grupo]) || null;
}

/** Rota de entrada própria do grupo, ou `null`. */
export function rotaDeEntradaDoPortal(grupo: ProfileGroup | null | undefined): string | null {
    return entradaDoPortal(grupo)?.rota ?? null;
}

/** A entrada cujo endereço é `pathname`, ou `null` (ex.: "/" ou uma rota pública). */
export function entradaDaRota(pathname: string): EntradaDoPortal | null {
    const limpo = pathname.replace(/\/+$/, '') || '/';
    return Object.values(ENTRADAS_DO_PORTAL).find(e => e.rota === limpo) ?? null;
}

/**
 * A entrada própria do endereço ATUAL — lido NA HORA, a cada chamada.
 * `null` quando o endereço não é uma entrada ou traz `?token=` (aí o gate do link manda).
 *
 * ⚠️ Nunca memorizar (useMemo/useRef) o resultado no App: um login recusado troca o
 * endereço para "/" com `replaceState`, e o efeito de rota precisa ver a troca para
 * PARAR de forçar o portal. Em 16/10/2026 a primeira versão genérica memorizava a
 * entrada na carga e, depois da recusa, a tela voltava ao login do mesmo portal com
 * o endereço já em "/" — o seletor nunca aparecia (medido em produção, Playwright).
 * O código antigo de /portal-parceiro lia `window.location.pathname` a cada execução.
 */
export function entradaDaUrlAtual(): EntradaDoPortal | null {
    if (typeof window === 'undefined') return null;
    if (new URLSearchParams(window.location.search).get('token')) return null;
    return entradaDaRota(window.location.pathname);
}

/** Para onde "Sair" leva: a página do próprio portal, ou o seletor de portais. */
export function destinoAposSair(grupo: ProfileGroup | null | undefined): string {
    return rotaDeEntradaDoPortal(grupo) ?? '/';
}
