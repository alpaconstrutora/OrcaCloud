/**
 * Harness: Boletos a Pagar › aba "Captura por e-mail", sem login.
 *
 * Monta o componente de PRODUÇÃO (`EmailCapturaConfig`) com o mesmo cabeçalho +
 * barra de abas que o `BoletoManager` desenha em volta dele. Só os services
 * são trocados por dados fabricados (os objetos são singletons — sobrescrever o
 * método aqui vale para o componente). O store aponta para uma organização.
 *
 * Plano: docs/planos/2026-10-15-captura-boletos-por-email.md (Fase 4).
 *   npx vite --port 3117 --strictPort   (na raiz da frente)
 *   node docs/spikes/captura-email/passeio.mjs http://localhost:3117 <pasta-prints>
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import { ConfirmProvider } from '../../../components/ui/confirm';
import { ToastProvider } from '../../../components/ui/toast';
import { TabsBar } from '../../../components/ui/TabsBar';
import EmailCapturaConfig from '../../../components/boletos/EmailCapturaConfig';
import { emailCaptureService } from '../../../services/emailCaptureService';
import { supplierService } from '../../../services/supplierService';
import { useStore } from '../../../store/useStore';

const ORG = 'org-alpa';
const agora = Date.now();
const iso = (diasAtras: number) => new Date(agora - diasAtras * 86400000).toISOString();

useStore.setState({
    activeOrganizationId: ORG,
    activeEmpresaId: null,
    organizations: [{ id: ORG, name: 'ALPA Construtora' }],
} as never);

const contas = [
    { id: 'c1', organization_id: ORG, provedor: 'imap', host: 'imap.gmail.com', porta: 993, usuario: 'financeiro.alpa@gmail.com', status: 'ativa', modo: 'hibrido', data_inicial: '2026-10-01', modo_piloto: true, last_sync_at: iso(0.01), ultimo_erro: null, created_by_email: 'gestor@alpa.com.br', created_at: iso(5) },
    { id: 'c2', organization_id: ORG, provedor: 'imap', host: 'imap.gmail.com', porta: 993, usuario: 'boletos.obras@gmail.com', status: 'reautenticar', modo: 'favoritos', data_inicial: '2026-09-15', modo_piloto: false, last_sync_at: iso(2), ultimo_erro: 'O Gmail recusou o usuário ou a senha de app. Gere uma nova senha de app (Conta Google › Segurança › Senhas de app) e reconecte.', created_by_email: 'gestor@alpa.com.br', created_at: iso(30) },
];
const remetentes = [
    { id: 's1', organization_id: ORG, account_id: 'c1', supplier_id: 'f1', nome: 'Cobrança Energisa', tipo: 'exato', email: 'cobranca@energisa.com.br', dominio: null, palavras_chave: ['fatura'], importacao: 'automatica', exigir_dmarc: true, ativo: true, created_at: iso(4) },
    { id: 's2', organization_id: ORG, account_id: 'c1', supplier_id: 'f2', nome: 'MN Elevadores', tipo: 'dominio', email: null, dominio: 'mnelevadores.com.br', palavras_chave: [], importacao: 'revisao', exigir_dmarc: true, ativo: true, created_at: iso(3) },
];
const mensagens = [
    { id: 'm1', organization_id: ORG, account_id: 'c1', remetente: 'Energisa <cobranca@energisa.com.br>', assunto: 'Sua fatura de outubro', data_email: iso(0.2), documento_nome: 'fatura-out.pdf', resultado: 'criado', motivo: 'Caixa em modo piloto: todo boleto passa pela revisão.', erro: null, tentativas: 0, boleto_id: 'b1', auth_results: { dmarc: 'pass' }, created_at: iso(0.2) },
    { id: 'm2', organization_id: ORG, account_id: 'c1', remetente: 'MN <nf@mnelevadores.com.br>', assunto: 'Boleto manutenção', data_email: iso(1), documento_nome: 'Boleto_00005006.pdf', resultado: 'duplicado', motivo: 'Mesma linha digitável do boleto nº 1021.', erro: null, tentativas: 0, boleto_id: 'b0', auth_results: { dmarc: 'pass' }, created_at: iso(1) },
    { id: 'm3', organization_id: ORG, account_id: 'c1', remetente: 'desconhecido@golpe.com', assunto: 'URGENTE boleto vencido', data_email: iso(1.5), documento_nome: 'boleto.pdf', resultado: 'criado', motivo: 'Remetente não está entre os monitorados. Autenticação do e-mail não confirmada (DMARC: fail).', erro: null, tentativas: 0, boleto_id: 'b2', auth_results: { dmarc: 'fail' }, created_at: iso(1.5) },
    { id: 'm4', organization_id: ORG, account_id: 'c1', remetente: 'Papelaria <vendas@papel.com.br>', assunto: 'Pedido 552', data_email: iso(2), documento_nome: 'catalogo.pdf', resultado: 'erro', motivo: null, erro: 'Anexo maior que 10 MB.', tentativas: 1, boleto_id: null, auth_results: null, created_at: iso(2) },
];

Object.assign(emailCaptureService, {
    listarContas: async () => contas,
    listarRemetentes: async () => remetentes,
    listarMensagens: async () => mensagens,
    conectar: async () => { throw new Error('O Gmail recusou o usuário ou a senha de app. Gere uma nova senha de app (Conta Google › Segurança › Senhas de app) e reconecte.'); },
});
Object.assign(supplierService, {
    listSuppliers: async () => [
        { id: 'f1', name: 'ENERGISA SUL-SUDESTE', nickname: 'Energisa', document: '07.282.377/0001-20', organization_id: ORG },
        { id: 'f2', name: 'MN CONSERVACAO DE ELEVADORES', nickname: 'MN Elevadores', document: '07.604.526/0001-20', organization_id: ORG },
    ],
});

function Pagina() {
    const [aba, setAba] = React.useState<'boletos' | 'captura'>('captura');
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Captura por e-mail</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">
                    Caixas do Gmail lidas a cada 15 minutos: cada PDF de boleto vira um boleto em revisão nesta tela.
                </p>
            </div>
            <TabsBar tabs={[{ id: 'boletos', label: 'Boletos' }, { id: 'captura', label: 'Captura por e-mail' }]} value={aba} onChange={setAba} />
            <EmailCapturaConfig onAbrirBoleto={id => alert(`abrir ${id}`)} />
        </div>
    );
}

createRoot(document.getElementById('raiz')!).render(
    <ToastProvider><ConfirmProvider><Pagina /></ConfirmProvider></ToastProvider>,
);
