/**
 * Ajuda dos portais externos — conteúdo PADRÃO e a regra que o junta com o que a
 * construtora editou.
 *
 * Pedido de 03/10/2026 ("sistema de ajuda ao parceiro no uso do portal"):
 * central de ajuda + tour guiado + perguntas frequentes + contato, editável pela
 * construtora, nos portais do Parceiro, do Fornecedor e do Corretor.
 *
 * Fonte única: seções (= abas de cada portal), artigos e perguntas padrão com
 * chave estável, passos do tour com âncora fixa. A tabela `portal_help_items`
 * guarda só sobrescritas (por `default_key`) e itens próprios; `mergePortalHelp`
 * resolve. Texto padrão melhorado aqui chega a toda construtora que não
 * sobrescreveu aquela chave.
 *
 * Os corpos são HTML simples (p, ul/li, strong). Quem renderiza passa por
 * `sanitizeHtml` na mesma linha do sink (scripts/check-xss-sinks.sh).
 */

export type Portal = 'parceiro' | 'fornecedor' | 'corretor';
export type HelpKind = 'artigo' | 'faq' | 'tour';

export const PORTAL_LABELS: Record<Portal, string> = {
  parceiro: 'Portal do Parceiro',
  fornecedor: 'Portal do Fornecedor',
  corretor: 'Portal do Corretor',
};

export interface PortalSection { id: string; label: string }

/** Ids = ids das abas de cada portal (conferido por teste contra os componentes). */
export const PORTAL_SECTIONS: Record<Portal, PortalSection[]> = {
  parceiro: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'conversas', label: 'Conversas' },
    { id: 'documentos', label: 'Documentos' },
    { id: 'contratos', label: 'Contratos' },
    { id: 'financeiro', label: 'Financeiro' },
    { id: 'solicitacoes', label: 'Solicitações' },
  ],
  fornecedor: [
    { id: 'overview', label: 'Estatísticas' },
    { id: 'negotiations', label: 'Lances' },
    { id: 'quotations', label: 'Cotações' },
    { id: 'orders', label: 'Pedidos' },
    { id: 'documents', label: 'Nota Fiscal' },
    { id: 'financeiro', label: 'Financeiro' },
  ],
  corretor: [
    { id: 'analytics', label: 'Analytics' },
    { id: 'estoque', label: 'Estoque' },
    { id: 'empreendimentos', label: 'Empreendimentos' },
    { id: 'propostas', label: 'Propostas' },
    { id: 'leads', label: 'Leads' },
    { id: 'comissoes', label: 'Comissões' },
    { id: 'materiais', label: 'Materiais' },
    { id: 'ranking', label: 'Ranking' },
    { id: 'treinamento', label: 'Treinamento' },
    { id: 'agenda', label: 'Agenda' },
    { id: 'chat', label: 'Chat' },
    { id: 'saude', label: 'Saúde' },
    { id: 'integracoes', label: 'Integrações' },
  ],
};

export const GENERAL_SECTION_LABEL = 'Geral';

export interface DefaultHelpItem {
  key: string;
  kind: 'artigo' | 'faq';
  /** id de aba do portal; null = Geral. */
  section: string | null;
  title: string;
  body_html: string;
}

/** 'geral' = tour do portal; qualquer outro valor = id da aba (mini-tour "como usar esta tela"). */
export type TourId = string;

export interface TourStep {
  key: string;
  /** Valor do atributo `data-tour` no elemento do portal. Fixo no código. */
  anchor: string;
  /**
   * Aba onde o elemento está; null = cromo (sidebar, header). O tour usa para
   * NAVEGAR até a aba antes de procurar a âncora, e `visibleSections` usa para
   * tirar passo de aba oculta.
   */
  section: string | null;
  /** a que tour o passo pertence */
  tour: TourId;
  title: string;
  body: string;
  /**
   * Pré-requisito em texto ("quando houver um contrato"). Com ele, se o
   * elemento não existir (falta dado), o passo aparece centralizado com a nota
   * "Disponível quando…"; sem ele, passo sem elemento é pulado em silêncio.
   */
  quando?: string;
}

const p = (...paras: string[]) => paras.map(t => `<p>${t}</p>`).join('');
const ul = (...items: string[]) => `<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>`;

// ── Perguntas frequentes comuns aos três portais (acesso) ────────────────────
const FAQ_ACESSO = (portal: Portal, rota: string): DefaultHelpItem[] => [
  {
    key: `${portal}.faq.link-vencido`,
    kind: 'faq', section: null,
    title: 'Meu link de acesso parou de funcionar. O que faço?',
    body_html: p(
      'O link de acesso vale por 90 dias e pode ser revogado pela construtora. Quando vence, a tela diz "Link inválido ou expirado".',
      'Peça à construtora um novo link. Ela gera outro no mesmo lugar em que gerou o primeiro.',
    ),
  },
  {
    key: `${portal}.faq.senha`,
    kind: 'faq', section: null,
    title: 'Como entro com e-mail e senha?',
    body_html: p(
      `Abra <strong>${rota}</strong> e entre com o seu e-mail e a senha que você criou pelo e-mail de convite.`,
      'Se ainda não criou a senha, peça à construtora para reenviar o convite. Cada link de convite funciona uma vez só.',
    ),
  },
  {
    key: `${portal}.faq.esqueci-senha`,
    kind: 'faq', section: null,
    title: 'Esqueci a senha.',
    body_html: p(
      'Na tela de entrada, use "Esqueceu a senha?" para receber um e-mail de redefinição. Se o e-mail não chegar, peça à construtora para reenviar o convite: o link do convite também serve para definir uma nova senha.',
    ),
  },
  {
    key: `${portal}.faq.dados-cadastrais`,
    kind: 'faq', section: null,
    title: 'Como altero meus dados cadastrais ou meu e-mail de acesso?',
    body_html: p(
      'Os dados da sua empresa e o e-mail de acesso são mantidos pela construtora. Peça a alteração a ela.',
    ),
  },
];

// ── Portal do Parceiro ───────────────────────────────────────────────────────
const PARCEIRO: DefaultHelpItem[] = [
  {
    key: 'parceiro.geral.o-que-e', kind: 'artigo', section: null,
    title: 'O que é o Portal do Parceiro',
    body_html: p(
      'Este portal é o canal direto entre a sua empresa e a construtora. Aqui você acompanha seus contratos, medições e pagamentos, recebe e envia documentos, conversa com a equipe e abre solicitações.',
      'Tudo o que você vê aqui foi liberado pela construtora para a sua empresa. Se uma seção não aparece no menu, é porque não está liberada.',
    ),
  },
  {
    key: 'parceiro.dashboard.visao', kind: 'artigo', section: 'dashboard',
    title: 'Dashboard: o resumo da sua relação com a construtora',
    body_html: p(
      'O Dashboard mostra, de relance, quantos contratos assinados você tem, quantas solicitações estão abertas, quantos documentos foram compartilhados e o valor total contratado.',
      'A lista "Atividades Recentes" reúne as últimas solicitações e os últimos documentos compartilhados com você.',
    ),
  },
  {
    key: 'parceiro.conversas.como-usar', kind: 'artigo', section: 'conversas',
    title: 'Conversas: fale com a equipe da obra',
    body_html: p(
      'Cada canal à esquerda é uma conversa aberta pela construtora. Escolha o canal, escreva a mensagem e envie. A equipe responde pelo mesmo canal.',
      'Pedidos formais (prazo, alteração de escopo, documento faltante) devem ir pela aba <strong>Solicitações</strong>, que gera um registro com número e status.',
    ),
  },
  {
    key: 'parceiro.documentos.consultar', kind: 'artigo', section: 'documentos',
    title: 'Documentos: consultar e baixar o que a construtora compartilhou',
    body_html: p(
      'A tabela lista os documentos do GED que a construtora compartilhou com a sua empresa: projetos, contratos, memoriais.',
    ) + ul(
      'Use a busca para achar por nome, tipo ou código.',
      'Filtre por pasta e por disciplina; o botão "Filtros" filtra por status (ativos, em alerta, vencidos).',
      'Clique na seta para baixar e no ícone de QR para a etiqueta do documento.',
      'A engrenagem escolhe as colunas visíveis; o botão ao lado ajusta a largura das colunas.',
    ),
  },
  {
    key: 'parceiro.documentos.enviar', kind: 'artigo', section: 'documentos',
    title: 'Documentos: enviar um arquivo para a construtora',
    body_html: p(
      'Clique em <strong>Enviar Documento</strong>, escolha o arquivo e, se quiser, escreva uma observação.',
      'O arquivo fica em "Enviados por você" com o status <strong>Aguardando revisão</strong>. Quando a construtora o incluir no GED, o status muda para <strong>Incluído no GED</strong>. Você pode baixar o que enviou a qualquer momento.',
    ),
  },
  {
    key: 'parceiro.contratos.detalhe', kind: 'artigo', section: 'contratos',
    title: 'Contratos: o que há no detalhe de um contrato',
    body_html: p(
      'Clique em <strong>Ver Detalhes</strong> para abrir o contrato. Dependendo do que a construtora liberou, você encontra:',
    ) + ul(
      '<strong>Visão Geral</strong>: datas, andamento do prazo, valor atual e original, total medido, retenções e saldo a faturar.',
      '<strong>Itens</strong>: os serviços contratados, com quantidade, unidade e preço.',
      '<strong>Execução &amp; Entrega</strong>: escopo (o que inclui e o que não inclui), pré-mobilização, matriz de documentos exigidos e termos de recebimento.',
      '<strong>Aditivos</strong>, <strong>Medições</strong>, <strong>Retenção de Garantia</strong> e <strong>Penalidades</strong>.',
    ) + p('"Ver PDF" abre o contrato assinado ou a última minuta emitida.'),
  },
  {
    key: 'parceiro.financeiro.parcelas', kind: 'artigo', section: 'financeiro',
    title: 'Financeiro: parcelas, medições e retenção',
    body_html: p(
      'A aba Financeiro mostra as parcelas a receber dos seus contratos, com vencimento, valor e status (pago ou pendente), as medições com valor bruto, retenção e líquido, e o saldo retido de garantia.',
      'Quando um pagamento é feito, o recibo fica disponível na linha da parcela.',
    ),
  },
  {
    key: 'parceiro.financeiro.nota-fiscal', kind: 'artigo', section: 'financeiro',
    title: 'Financeiro: anexar a nota fiscal de uma medição',
    body_html: p(
      'Em cada medição há a ação <strong>Anexar NF</strong>. Envie o PDF ou XML da nota fiscal correspondente. Depois de anexada, "Ver Nota" abre o arquivo.',
      'A nota fiscal é o que libera o pagamento da medição; sem ela, a parcela não segue.',
    ),
  },
  {
    key: 'parceiro.solicitacoes.abrir', kind: 'artigo', section: 'solicitacoes',
    title: 'Solicitações: como abrir um pedido para a construtora',
    body_html: p(
      'Clique em <strong>Nova Solicitação</strong>, dê um título, descreva o pedido, escolha o tipo (técnica, dúvida contratual, financeira, envio de documentação ou alteração) e a prioridade. Você pode anexar arquivos.',
      'A solicitação aparece na lista com o status <strong>Aberto</strong>. A construtora analisa e muda o status conforme avança. Você acompanha tudo por aqui.',
    ),
  },
  {
    key: 'parceiro.geral.minha-conta', kind: 'artigo', section: null,
    title: 'Meus dados e Minha conta',
    body_html: p(
      'No menu do canto superior direito, <strong>Meus dados</strong> mostra o cadastro que a construtora tem da sua empresa, inclusive contas bancárias. <strong>Minha conta</strong> mostra os dados do seu usuário.',
      'Para alterar qualquer um deles, fale com a construtora.',
    ),
  },
  ...FAQ_ACESSO('parceiro', '/portal-parceiro'),
  {
    key: 'parceiro.faq.secao-sumiu', kind: 'faq', section: null,
    title: 'Uma seção que eu usava sumiu do menu.',
    body_html: p('A construtora escolhe quais seções ficam visíveis para cada parceiro. Se precisa de uma que não aparece, peça a ela para liberar.'),
  },
  {
    key: 'parceiro.faq.pagamento', kind: 'faq', section: 'financeiro',
    title: 'Minha medição foi aprovada. Quando recebo?',
    body_html: p('A parcela correspondente aparece em Financeiro com a data de vencimento. Confira se a nota fiscal da medição está anexada: sem ela o pagamento não é liberado.'),
  },
];

// ── Portal do Fornecedor ─────────────────────────────────────────────────────
const FORNECEDOR: DefaultHelpItem[] = [
  {
    key: 'fornecedor.geral.o-que-e', kind: 'artigo', section: null,
    title: 'O que é o Portal do Fornecedor',
    body_html: p(
      'Este portal reúne o que a construtora negocia e compra da sua empresa: cotações a responder, lances, pedidos de compra com a logística de entrega, notas fiscais e o financeiro dos pedidos.',
      'As seções visíveis são as que a construtora liberou para a sua empresa.',
    ),
  },
  {
    key: 'fornecedor.overview.visao', kind: 'artigo', section: 'overview',
    title: 'Estatísticas: seu resumo com a construtora',
    body_html: p('A primeira tela mostra os indicadores do relacionamento: negociações ativas, cotações pendentes, pedidos em andamento e volume faturado.'),
  },
  {
    key: 'fornecedor.quotations.responder', kind: 'artigo', section: 'quotations',
    title: 'Cotações: responder a um pedido de preço',
    body_html: p(
      'Cada cotação lista os itens que a construtora quer comprar. Abra a cotação, informe preço e prazo por item e envie a resposta.',
      'Respostas enviadas podem ser consultadas depois; a construtora compara as propostas e emite o pedido para a vencedora.',
    ),
  },
  {
    key: 'fornecedor.negotiations.lances', kind: 'artigo', section: 'negotiations',
    title: 'Lances: negociações em andamento',
    body_html: p('Em Lances você acompanha as negociações abertas, vê a posição da sua proposta e pode melhorar a oferta enquanto a negociação estiver aberta.'),
  },
  {
    key: 'fornecedor.orders.logistica', kind: 'artigo', section: 'orders',
    title: 'Pedidos: acompanhar e atualizar a entrega',
    body_html: p(
      'A lista traz os pedidos de compra emitidos para a sua empresa, com status e data prevista de entrega. Abra um pedido para ver os itens e o histórico.',
      'Na logística do pedido você informa separação, envio e entrega. Manter essas datas em dia evita cobrança da obra.',
    ),
  },
  {
    key: 'fornecedor.documents.nota-fiscal', kind: 'artigo', section: 'documents',
    title: 'Nota Fiscal: enviar a nota de um pedido',
    body_html: p('Anexe a nota fiscal ao pedido correspondente. A nota é conferida com o pedido e é o que libera o pagamento.'),
  },
  {
    key: 'fornecedor.financeiro.parcelas', kind: 'artigo', section: 'financeiro',
    title: 'Financeiro: parcelas e recibos',
    body_html: p('A aba Financeiro mostra as parcelas dos seus pedidos, com vencimento, valor e status. Quando um pagamento é feito, o recibo fica disponível na linha da parcela.'),
  },
  ...FAQ_ACESSO('fornecedor', '/portal-fornecedor'),
  {
    key: 'fornecedor.faq.secao-sumiu', kind: 'faq', section: null,
    title: 'Uma seção que eu usava sumiu do menu.',
    body_html: p('A construtora escolhe quais seções ficam visíveis para cada fornecedor. Se precisa de uma que não aparece, peça a ela para liberar.'),
  },
];

// ── Portal do Corretor ───────────────────────────────────────────────────────
const CORRETOR: DefaultHelpItem[] = [
  {
    key: 'corretor.geral.o-que-e', kind: 'artigo', section: null,
    title: 'O que é o Portal do Corretor',
    body_html: p(
      'Este portal é a sua base de trabalho com a incorporadora: estoque e tabela de preços, empreendimentos, propostas, leads, comissões, materiais de venda, treinamentos e agenda.',
      'As seções visíveis são as que a incorporadora liberou para você.',
    ),
  },
  {
    key: 'corretor.analytics.visao', kind: 'artigo', section: 'analytics',
    title: 'Analytics: seus números de relance',
    body_html: p('A primeira tela resume o seu desempenho: unidades disponíveis, propostas enviadas e aprovadas e a comissão acumulada. Os números seguem as abas Propostas e Comissões.'),
  },
  {
    key: 'corretor.empreendimentos.conhecer', kind: 'artigo', section: 'empreendimentos',
    title: 'Empreendimentos: o que você pode vender',
    body_html: p(
      'A lista traz os empreendimentos que a incorporadora liberou para você, com endereço, estágio da obra e tipologias. Abra um empreendimento para ver as unidades e seguir para a proposta.',
      'Se um empreendimento que você atende não aparece, peça à incorporadora para liberar o acesso.',
    ),
  },
  {
    key: 'corretor.estoque.consultar', kind: 'artigo', section: 'estoque',
    title: 'Estoque: unidades disponíveis e preços',
    body_html: p('Consulte as unidades disponíveis de cada empreendimento, com área, posição, vagas e preço vigente. As colunas mostradas são definidas pela incorporadora.'),
  },
  {
    key: 'corretor.propostas.enviar', kind: 'artigo', section: 'propostas',
    title: 'Propostas: enviar uma proposta de compra',
    body_html: p(
      'Escolha a unidade, informe os dados do comprador e as condições (entrada, parcelas) e envie. A incorporadora recebe a proposta na hora e responde por aqui.',
      'Acompanhe o status de cada proposta na lista.',
    ),
  },
  {
    key: 'corretor.leads.gerir', kind: 'artigo', section: 'leads',
    title: 'Leads: seus interessados',
    body_html: p('Cadastre e acompanhe os interessados que você está atendendo, com etapa do funil e próximos passos.'),
  },
  {
    key: 'corretor.comissoes.acompanhar', kind: 'artigo', section: 'comissoes',
    title: 'Comissões: o que está previsto e o que foi pago',
    body_html: p('Veja as comissões de cada venda, o status (prevista, liberada, paga) e as datas.'),
  },
  {
    key: 'corretor.materiais.baixar', kind: 'artigo', section: 'materiais',
    title: 'Materiais: tabelas, plantas e peças de venda',
    body_html: p('Baixe os materiais oficiais do empreendimento publicados pela incorporadora. Use sempre a versão mais recente.'),
  },
  {
    key: 'corretor.ranking.acompanhar', kind: 'artigo', section: 'ranking',
    title: 'Ranking: sua posição entre os corretores',
    body_html: p('O ranking compara vendas e propostas aprovadas no período. Serve para acompanhar metas e campanhas da incorporadora.'),
  },
  {
    key: 'corretor.treinamento.assistir', kind: 'artigo', section: 'treinamento',
    title: 'Treinamento: conteúdo da incorporadora',
    body_html: p('Vídeos e materiais de capacitação publicados pela incorporadora: produto, argumentos de venda, processo de proposta. Conclua os módulos para manter o cadastro em dia quando a incorporadora exigir.'),
  },
  {
    key: 'corretor.agenda.usar', kind: 'artigo', section: 'agenda',
    title: 'Agenda: eventos, plantões e visitas',
    body_html: p('Aqui ficam os eventos da incorporadora (lançamentos, plantões, treinamentos) e as visitas agendadas. Confirme presença pelo próprio evento.'),
  },
  {
    key: 'corretor.chat.conversar', kind: 'artigo', section: 'chat',
    title: 'Chat: fale com a equipe comercial',
    body_html: p(
      'Use o chat para dúvidas rápidas com a equipe comercial da incorporadora: disponibilidade de unidade, condição de pagamento, documentação do comprador.',
      'Propostas formais não vão pelo chat — envie pela aba <strong>Propostas</strong>, que registra data, status e resposta.',
    ),
  },
  {
    key: 'corretor.saude.entender', kind: 'artigo', section: 'saude',
    title: 'Saúde: como a incorporadora vê a sua carteira',
    body_html: p('Indicadores de qualidade do seu atendimento: tempo de resposta a leads, propostas convertidas, visitas realizadas. Ajudam a entender onde a carteira está travando.'),
  },
  {
    key: 'corretor.integracoes.conectar', kind: 'artigo', section: 'integracoes',
    title: 'Integrações: conectar seus canais',
    body_html: p('Conecte CRM, WhatsApp ou portais imobiliários para receber leads direto aqui. Cada integração explica o que é compartilhado antes de ativar.'),
  },
  ...FAQ_ACESSO('corretor', '/portal-corretor'),
  {
    key: 'corretor.faq.secao-sumiu', kind: 'faq', section: null,
    title: 'Uma seção que eu usava sumiu do menu.',
    body_html: p('A incorporadora escolhe quais seções ficam visíveis para cada corretor. Se precisa de uma que não aparece, peça a ela para liberar.'),
  },
];

export const DEFAULT_ITEMS: Record<Portal, DefaultHelpItem[]> = {
  parceiro: PARCEIRO,
  fornecedor: FORNECEDOR,
  corretor: CORRETOR,
};

type PassoSemTour = Omit<TourStep, 'tour'>;
const tourDe = (tour: TourId, passos: PassoSemTour[]): TourStep[] => passos.map(x => ({ ...x, tour }));

/**
 * Tours guiados. `geral` = tour do portal (primeiro acesso); `porAba` =
 * mini-tour "como usar esta tela" na primeira visita a cada aba.
 *
 * Âncoras = `data-tour` nos portais: `menu` (sidebar / barra inferior),
 * `aba-<id>` (botão de cada aba), `ajuda` (botão ?), `conta` (menu da conta) e
 * `<aba>-<elemento>` no conteúdo das abas. Teste: __tests__/portalTourAnchors.test.ts.
 *
 * Chaves antigas (`parceiro.tour.menu`…) foram MANTIDAS: sobrescritas já
 * gravadas pela construtora continuam valendo. Novas: `<portal>.tour.<geral|aba>.<slug>`.
 * Passos de telas de detalhe (dentro de um contrato/pedido/cotação) não entram
 * no padrão: só existem depois de uma ação do usuário.
 */
export const TOURS: Record<Portal, { geral: TourStep[]; porAba: Partial<Record<string, TourStep[]>> }> = {
  parceiro: {
    geral: tourDe('geral', [
      { key: 'parceiro.tour.menu', anchor: 'menu', section: null, title: 'Bem-vindo ao Portal do Parceiro', body: 'Este menu leva às seções liberadas para a sua empresa: contratos, documentos, financeiro, solicitações e conversas.' },
      { key: 'parceiro.tour.documentos', anchor: 'aba-documentos', section: 'documentos', title: 'Documentos', body: 'Aqui ficam os projetos e contratos que a construtora compartilhou. Também é por aqui que você envia arquivos para ela.' },
      { key: 'parceiro.tour.geral.documentos-enviar', anchor: 'documentos-enviar', section: 'documentos', title: 'Enviar um arquivo', body: 'Por este botão você manda um documento para a construtora. Ele fica em "Enviados por você" até ser incluído no GED.' },
      { key: 'parceiro.tour.geral.contratos', anchor: 'aba-contratos', section: 'contratos', title: 'Contratos', body: 'Seus contratos com a construtora: valor, prazo, medições e aditivos.' },
      { key: 'parceiro.tour.geral.contratos-lista', anchor: 'contratos-lista', section: 'contratos', title: 'Seus contratos', body: 'Clique em um contrato para abrir a visão geral, os itens, as medições e o PDF assinado.' },
      { key: 'parceiro.tour.solicitacoes', anchor: 'aba-solicitacoes', section: 'solicitacoes', title: 'Solicitações', body: 'Pedidos formais à construtora saem daqui, com número e status para acompanhar.' },
      { key: 'parceiro.tour.geral.solicitacoes-nova', anchor: 'solicitacoes-nova', section: 'solicitacoes', title: 'Nova Solicitação', body: 'Prazo, escopo, documento faltante: abra o pedido por aqui e ele ganha número e status.' },
      { key: 'parceiro.tour.ajuda', anchor: 'ajuda', section: null, title: 'Ajuda sempre à mão', body: 'Este botão abre a central de ajuda, com artigos por seção, perguntas frequentes e o contato da construtora.' },
      { key: 'parceiro.tour.conta', anchor: 'conta', section: null, title: 'Sua conta', body: 'No menu da conta você vê os dados da sua empresa e do seu usuário e, no acesso por e-mail, sai do portal.' },
    ]),
    porAba: {
      dashboard: tourDe('dashboard', [
        { key: 'parceiro.tour.dashboard.kpis', anchor: 'dashboard-kpis', section: 'dashboard', title: 'Seus números', body: 'Contratos ativos, solicitações abertas, documentos compartilhados e valor contratado, de relance.' },
        { key: 'parceiro.tour.dashboard.atividades', anchor: 'dashboard-atividades', section: 'dashboard', title: 'Atividades recentes', body: 'As últimas solicitações e os últimos documentos que a construtora compartilhou com você.' },
      ]),
      conversas: tourDe('conversas', [
        { key: 'parceiro.tour.conversas.canais', anchor: 'conversas-canais', section: 'conversas', title: 'Canais', body: 'Cada canal é uma conversa aberta pela construtora. Escolha um para ver as mensagens.' },
        { key: 'parceiro.tour.conversas.enviar', anchor: 'conversas-enviar', section: 'conversas', title: 'Enviar mensagem', body: 'Escreva e envie; a equipe responde pelo mesmo canal. Pedidos formais vão pela aba Solicitações.', quando: 'quando a construtora abrir um canal' },
      ]),
      documentos: tourDe('documentos', [
        { key: 'parceiro.tour.documentos.busca', anchor: 'documentos-busca', section: 'documentos', title: 'Buscar', body: 'Ache um documento por nome, tipo ou código. Ao lado ficam os filtros por pasta, disciplina e status.' },
        { key: 'parceiro.tour.documentos.tabela', anchor: 'documentos-tabela', section: 'documentos', title: 'Documentos compartilhados', body: 'Baixe pela seta e gere a etiqueta pelo QR. A engrenagem escolhe as colunas visíveis.' },
        { key: 'parceiro.tour.documentos.enviar', anchor: 'documentos-enviar', section: 'documentos', title: 'Enviar documento', body: 'Mande um arquivo para a construtora, com uma observação se quiser.' },
      ]),
      contratos: tourDe('contratos', [
        { key: 'parceiro.tour.contratos.lista', anchor: 'contratos-lista', section: 'contratos', title: 'Seus contratos', body: 'Status, valor e prazo de cada contrato. Clique para abrir o detalhe.' },
        { key: 'parceiro.tour.contratos.detalhes', anchor: 'contratos-detalhes', section: 'contratos', title: 'Ver Detalhes', body: 'Abre a visão geral, os itens, as medições, os aditivos e a retenção do contrato.', quando: 'quando a construtora liberar um contrato' },
      ]),
      financeiro: tourDe('financeiro', [
        { key: 'parceiro.tour.financeiro.kpis', anchor: 'financeiro-kpis', section: 'financeiro', title: 'Resumo financeiro', body: 'O que você tem a receber, o que já recebeu e o que está retido de garantia.' },
        { key: 'parceiro.tour.financeiro.parcelas', anchor: 'financeiro-parcelas', section: 'financeiro', title: 'Parcelas', body: 'Vencimento, valor e status de cada parcela. O recibo aparece quando o pagamento é feito.' },
        { key: 'parceiro.tour.financeiro.medicoes', anchor: 'financeiro-medicoes', section: 'financeiro', title: 'Medições', body: 'Valor bruto, retenção e líquido de cada medição.' },
        { key: 'parceiro.tour.financeiro.anexar-nf', anchor: 'financeiro-anexar-nf', section: 'financeiro', title: 'Anexar a nota fiscal', body: 'Envie a NF da medição por aqui. Sem ela a parcela não é liberada.', quando: 'quando houver uma medição sem nota fiscal' },
      ]),
      solicitacoes: tourDe('solicitacoes', [
        { key: 'parceiro.tour.solicitacoes.nova', anchor: 'solicitacoes-nova', section: 'solicitacoes', title: 'Nova Solicitação', body: 'Dê um título, escolha o tipo e a prioridade e anexe arquivos se precisar.' },
        { key: 'parceiro.tour.solicitacoes.lista', anchor: 'solicitacoes-lista', section: 'solicitacoes', title: 'Acompanhe', body: 'Cada solicitação mostra o status, que muda conforme a construtora analisa.' },
      ]),
    },
  },
  fornecedor: {
    geral: tourDe('geral', [
      { key: 'fornecedor.tour.menu', anchor: 'menu', section: null, title: 'Bem-vindo ao Portal do Fornecedor', body: 'O menu leva às seções liberadas para a sua empresa: cotações, lances, pedidos, notas fiscais e financeiro.' },
      { key: 'fornecedor.tour.geral.cotacoes', anchor: 'aba-quotations', section: 'quotations', title: 'Cotações', body: 'Pedidos de preço da construtora. Você responde item a item, com preço e prazo.' },
      { key: 'fornecedor.tour.geral.cotacoes-tabela', anchor: 'cotacoes-tabela', section: 'quotations', title: 'Suas cotações', body: 'As que aguardam resposta aparecem primeiro. "Responder" abre o formulário da cotação.' },
      { key: 'fornecedor.tour.pedidos', anchor: 'aba-orders', section: 'orders', title: 'Pedidos', body: 'Aqui você acompanha os pedidos de compra e atualiza a logística de entrega.' },
      { key: 'fornecedor.tour.geral.pedidos-tabela', anchor: 'pedidos-tabela', section: 'orders', title: 'Seus pedidos', body: 'Status, valor e entrega prevista de cada pedido. Clique para ver os itens e o histórico.' },
      { key: 'fornecedor.tour.geral.notas', anchor: 'aba-documents', section: 'documents', title: 'Nota Fiscal', body: 'Envie a nota fiscal do pedido por aqui; é ela que libera o pagamento.' },
      { key: 'fornecedor.tour.geral.mais', anchor: 'mobile-mais', section: null, title: 'Mais seções', body: 'No celular, as outras seções e a Ajuda ficam aqui.' },
      { key: 'fornecedor.tour.ajuda', anchor: 'ajuda', section: null, title: 'Ajuda sempre à mão', body: 'Este botão abre a central de ajuda, com artigos por seção, perguntas frequentes e o contato da construtora.' },
      { key: 'fornecedor.tour.geral.conta', anchor: 'conta', section: null, title: 'Sua conta', body: 'No menu da conta você vê os dados da sua empresa.' },
    ]),
    porAba: {
      overview: tourDe('overview', [
        { key: 'fornecedor.tour.overview.kpis', anchor: 'overview-kpis', section: 'overview', title: 'Indicadores', body: 'Negociações, cotações pendentes, pedidos em andamento e volume faturado com a construtora.' },
        { key: 'fornecedor.tour.overview.recentes', anchor: 'overview-recentes', section: 'overview', title: 'Mais recentes', body: 'Os últimos pedidos, cotações e notas. Troque pelas abas do cartão e clique para abrir.' },
      ]),
      negotiations: tourDe('negotiations', [
        { key: 'fornecedor.tour.lances.tabela', anchor: 'lances-tabela', section: 'negotiations', title: 'Negociações', body: 'As negociações abertas com a construtora e a situação da sua proposta em cada uma.' },
        { key: 'fornecedor.tour.lances.negociar', anchor: 'lances-negociar', section: 'negotiations', title: 'Negociar', body: 'Enquanto a negociação estiver aberta, você pode melhorar a oferta por aqui.', quando: 'quando houver uma negociação aberta' },
      ]),
      quotations: tourDe('quotations', [
        { key: 'fornecedor.tour.cotacoes.busca', anchor: 'cotacoes-busca', section: 'quotations', title: 'Buscar', body: 'Ache uma cotação pelo número, pela obra ou pelo item. Os filtros ao lado separam por situação.' },
        { key: 'fornecedor.tour.cotacoes.tabela', anchor: 'cotacoes-tabela', section: 'quotations', title: 'Cotações', body: 'Situação e prazo de resposta de cada pedido de preço.' },
        { key: 'fornecedor.tour.cotacoes.responder', anchor: 'cotacoes-responder', section: 'quotations', title: 'Responder', body: 'Abre a cotação para você informar preço e prazo por item e enviar a proposta.', quando: 'quando houver uma cotação para responder' },
      ]),
      orders: tourDe('orders', [
        { key: 'fornecedor.tour.pedidos.busca', anchor: 'pedidos-busca', section: 'orders', title: 'Buscar', body: 'Ache um pedido pelo número ou pela obra. Os filtros ao lado separam por situação.' },
        { key: 'fornecedor.tour.pedidos.tabela', anchor: 'pedidos-tabela', section: 'orders', title: 'Pedidos', body: 'Status, valor e entrega prevista. Clique no pedido para ver itens, financeiro e recebimento.' },
        { key: 'fornecedor.tour.pedidos.logistica', anchor: 'pedidos-logistica', section: 'orders', title: 'Logística', body: 'Informe separação, envio e entrega do pedido. Datas em dia evitam cobrança da obra.', quando: 'quando houver um pedido em andamento' },
      ]),
      documents: tourDe('documents', [
        { key: 'fornecedor.tour.notas.enviar', anchor: 'notas-enviar', section: 'documents', title: 'Enviar nota fiscal', body: 'Arraste o PDF, XML ou imagem da nota (até 5 MB) ou clique para escolher o arquivo.' },
        { key: 'fornecedor.tour.notas.vincular', anchor: 'notas-vincular', section: 'documents', title: 'Vincular ao pedido', body: 'Escolha o pedido da nota antes de enviar: ela é conferida com ele.' },
        { key: 'fornecedor.tour.notas.tabela', anchor: 'notas-tabela', section: 'documents', title: 'Notas enviadas', body: 'Situação de conferência de cada nota que você mandou.' },
      ]),
      financeiro: tourDe('financeiro', [
        { key: 'fornecedor.tour.financeiro.kpis', anchor: 'financeiro-kpis', section: 'financeiro', title: 'Resumo financeiro', body: 'O que você tem a receber e o que já recebeu nos seus pedidos.' },
        { key: 'fornecedor.tour.financeiro.parcelas', anchor: 'financeiro-parcelas', section: 'financeiro', title: 'Parcelas', body: 'Vencimento, valor e status de cada parcela. O recibo aparece quando o pagamento é feito.' },
      ]),
    },
  },
  corretor: {
    geral: tourDe('geral', [
      { key: 'corretor.tour.menu', anchor: 'menu', section: null, title: 'Bem-vindo ao Portal do Corretor', body: 'O menu leva às seções liberadas para você: estoque, propostas, leads, comissões, materiais e mais.' },
      { key: 'corretor.tour.geral.estoque', anchor: 'aba-estoque', section: 'estoque', title: 'Estoque', body: 'As unidades disponíveis de cada empreendimento, com o preço vigente.' },
      { key: 'corretor.tour.geral.estoque-mapa', anchor: 'estoque-mapa', section: 'estoque', title: 'Mapa de unidades', body: 'Clique numa unidade para fazer a proposta, ou marque várias para propor juntas.' },
      { key: 'corretor.tour.propostas', anchor: 'aba-propostas', section: 'propostas', title: 'Propostas', body: 'Envie propostas de compra e acompanhe a resposta da incorporadora por aqui.' },
      { key: 'corretor.tour.geral.propostas-lista', anchor: 'propostas-lista', section: 'propostas', title: 'Suas propostas', body: 'Situação e resposta de cada proposta. Dá para baixar o PDF e compartilhar o link.' },
      { key: 'corretor.tour.geral.leads', anchor: 'aba-leads', section: 'leads', title: 'Leads', body: 'Os interessados que você está atendendo, por etapa do funil.' },
      { key: 'corretor.tour.ajuda', anchor: 'ajuda', section: null, title: 'Ajuda sempre à mão', body: 'Este botão abre a central de ajuda, com artigos por seção, perguntas frequentes e o contato da incorporadora.' },
      { key: 'corretor.tour.geral.conta', anchor: 'conta', section: null, title: 'Sua conta', body: 'No menu da conta você vê os seus dados.' },
    ]),
    porAba: {
      analytics: tourDe('analytics', [
        { key: 'corretor.tour.analytics.kpis', anchor: 'analytics-kpis', section: 'analytics', title: 'Seus números', body: 'Unidades disponíveis, propostas enviadas e aprovadas e a comissão acumulada.' },
        { key: 'corretor.tour.analytics.graficos', anchor: 'analytics-graficos', section: 'analytics', title: 'Evolução', body: 'Gráficos de vendas e propostas para acompanhar o seu desempenho.' },
      ]),
      estoque: tourDe('estoque', [
        { key: 'corretor.tour.estoque.finalidade', anchor: 'estoque-finalidade', section: 'estoque', title: 'Venda ou locação', body: 'Filtre as unidades pela finalidade.' },
        { key: 'corretor.tour.estoque.mapa', anchor: 'estoque-mapa', section: 'estoque', title: 'Mapa de unidades', body: 'Cada unidade com área, situação e preço. Clique para propor; marque várias para uma proposta só.' },
        { key: 'corretor.tour.estoque.cesta', anchor: 'cesta-barra', section: 'estoque', title: 'Unidades marcadas', body: 'A barra mostra as unidades marcadas e abre o simulador da proposta.', quando: 'quando você marcar uma unidade no mapa' },
      ]),
      empreendimentos: tourDe('empreendimentos', [
        { key: 'corretor.tour.empreendimentos.lista', anchor: 'empreendimentos-lista', section: 'empreendimentos', title: 'Empreendimentos', body: 'Os empreendimentos liberados para você. Abra um para ver a tabela de preços e propor.' },
      ]),
      propostas: tourDe('propostas', [
        { key: 'corretor.tour.propostas.lista', anchor: 'propostas-lista', section: 'propostas', title: 'Suas propostas', body: 'Situação e resposta da incorporadora; baixe o PDF ou compartilhe o link de cada uma.' },
      ]),
      leads: tourDe('leads', [
        { key: 'corretor.tour.leads.busca', anchor: 'leads-busca', section: 'leads', title: 'Buscar', body: 'Ache um lead pelo nome, telefone ou e-mail.' },
        { key: 'corretor.tour.leads.novo', anchor: 'leads-novo', section: 'leads', title: 'Novo Lead', body: 'Cadastre o interessado com contato e o que ele procura.' },
      ]),
      comissoes: tourDe('comissoes', [
        { key: 'corretor.tour.comissoes.totais', anchor: 'comissoes-totais', section: 'comissoes', title: 'Totais', body: 'Comissão prevista, liberada e paga.' },
        { key: 'corretor.tour.comissoes.lista', anchor: 'comissoes-lista', section: 'comissoes', title: 'Por venda', body: 'Valor, situação e datas de cada comissão.' },
      ]),
      materiais: tourDe('materiais', [
        { key: 'corretor.tour.materiais.grade', anchor: 'materiais-grade', section: 'materiais', title: 'Materiais de venda', body: 'Tabelas, plantas e peças publicadas pela incorporadora. Use sempre a versão mais recente.' },
      ]),
      chat: tourDe('chat', [
        { key: 'corretor.tour.chat.enviar', anchor: 'chat-enviar', section: 'chat', title: 'Enviar mensagem', body: 'Dúvidas rápidas com a equipe comercial. Propostas vão pela aba Propostas.' },
      ]),
    },
  },
};

/** Compat: o tour do portal (geral). */
export const TOUR_STEPS: Record<Portal, TourStep[]> = {
  parceiro: TOURS.parceiro.geral,
  fornecedor: TOURS.fornecedor.geral,
  corretor: TOURS.corretor.geral,
};

/** Todos os passos padrão de um portal (geral + por aba), na ordem de declaração. */
export function todosOsPassos(portal: Portal): TourStep[] {
  const porAba = Object.values(TOURS[portal].porAba).flatMap(l => l ?? []);
  return [...TOURS[portal].geral, ...porAba];
}

/** Nome de um tour para o usuário. */
export function tourLabel(portal: Portal, tourId: TourId): string {
  return tourId === 'geral' ? 'Tour do portal' : `Como usar: ${sectionLabel(portal, tourId)}`;
}

// ── Junção padrão + banco ────────────────────────────────────────────────────

/** Linha de `portal_help_items` como a RPC/serviço devolve. */
export interface PortalHelpRow {
  id: string;
  kind: HelpKind;
  default_key: string | null;
  section: string | null;
  title: string;
  body_html: string;
  sort_order: number;
  is_published: boolean;
  updated_at?: string;
}

export type HelpOrigin = 'padrao' | 'personalizado' | 'proprio';

export interface HelpItem {
  /** chave do padrão (quando houver) — identifica o item para sobrescrever */
  key: string | null;
  /** id da linha no banco (sobrescrita ou item próprio) */
  rowId: string | null;
  kind: 'artigo' | 'faq';
  section: string | null;
  title: string;
  body_html: string;
  origin: HelpOrigin;
  sort_order: number;
  /** o padrão mudou depois da sobrescrita (comparação de hash) */
  defaultChanged?: boolean;
}

export interface MergedTourStep extends TourStep {
  rowId: string | null;
  origin: HelpOrigin;
  hidden: boolean;
}

export interface MergedHelp {
  articles: HelpItem[];
  faqs: HelpItem[];
  /** compat: = tours.geral */
  tour: MergedTourStep[];
  /** `geral` sempre; abas só quando têm ao menos um passo visível */
  tours: Record<TourId, MergedTourStep[]>;
}

/** Hash curto e estável (djb2) do corpo padrão — para "o padrão mudou". */
export function hashText(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const visivel = (section: string | null, visibleSections?: readonly string[] | null) =>
  !visibleSections || section === null || visibleSections.includes(section);

/**
 * Junta padrão (código) + linhas da organização (banco).
 *  - sobrescrita publicada substitui título/corpo/seção do padrão;
 *  - sobrescrita despublicada OCULTA o padrão;
 *  - item próprio entra se publicado;
 *  - `visibleSections` tira itens de abas ocultas (seção null = geral, fica);
 *  - ordem: `sort_order`, depois a ordem de declaração.
 * Pura: a mesma função serve ao portal (qualquer modo) e ao editor.
 */
export function mergePortalHelp(
  portal: Portal,
  rows: readonly PortalHelpRow[] | null | undefined,
  opts: { visibleSections?: readonly string[] | null; includeHidden?: boolean } = {},
): MergedHelp {
  const porChave = new Map<string, PortalHelpRow>();
  const proprios: PortalHelpRow[] = [];
  for (const r of rows ?? []) {
    if (r.default_key) porChave.set(r.default_key, r);
    else proprios.push(r);
  }

  const itens: HelpItem[] = [];
  DEFAULT_ITEMS[portal].forEach((d, i) => {
    const o = porChave.get(d.key);
    if (o && !o.is_published && !opts.includeHidden) return;
    itens.push({
      key: d.key,
      rowId: o?.id ?? null,
      kind: d.kind,
      section: o?.section !== undefined && o ? o.section : d.section,
      title: o ? o.title : d.title,
      body_html: o ? o.body_html : d.body_html,
      origin: o ? 'personalizado' : 'padrao',
      sort_order: o ? o.sort_order : i,
      defaultChanged: undefined,
    });
  });
  proprios.forEach((r, i) => {
    if (!r.is_published && !opts.includeHidden) return;
    if (r.kind === 'tour') return;
    itens.push({
      key: null, rowId: r.id, kind: r.kind, section: r.section,
      title: r.title, body_html: r.body_html, origin: 'proprio',
      sort_order: r.sort_order || 1000 + i,
    });
  });

  const ordenar = (a: HelpItem, b: HelpItem) => a.sort_order - b.sort_order;
  const filtrar = (it: HelpItem) => visivel(it.section, opts.visibleSections);

  const juntarPasso = (s: TourStep): MergedTourStep => {
    const o = porChave.get(s.key);
    return {
      ...s,
      title: o ? o.title : s.title,
      body: o ? htmlToText(o.body_html) || o.body_html : s.body,
      rowId: o?.id ?? null,
      origin: o ? 'personalizado' : 'padrao',
      hidden: !!o && !o.is_published,
    };
  };
  const passoEntra = (s: MergedTourStep) => (opts.includeHidden || !s.hidden) && visivel(s.section, opts.visibleSections);

  const tours: Record<TourId, MergedTourStep[]> = { geral: TOURS[portal].geral.map(juntarPasso).filter(passoEntra) };
  for (const [aba, passos] of Object.entries(TOURS[portal].porAba)) {
    if (!passos || !visivel(aba, opts.visibleSections)) continue;
    const lista = passos.map(juntarPasso).filter(passoEntra);
    if (lista.length > 0) tours[aba] = lista;
  }

  return {
    articles: itens.filter(i => i.kind === 'artigo').filter(filtrar).sort(ordenar),
    faqs: itens.filter(i => i.kind === 'faq').filter(filtrar).sort(ordenar),
    tour: tours.geral,
    tours,
  };
}

/** Texto puro de um HTML simples — para busca e para o popover do tour. Não é sink. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<\s*(br|\/p|\/li|\/div|\/h[1-6])\s*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Rótulo de uma seção (ou "Geral"). */
export function sectionLabel(portal: Portal, section: string | null): string {
  if (!section) return GENERAL_SECTION_LABEL;
  return PORTAL_SECTIONS[portal].find(s => s.id === section)?.label ?? GENERAL_SECTION_LABEL;
}
