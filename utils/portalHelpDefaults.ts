/**
 * Ajuda dos portais externos — conteúdo PADRÃO e a regra que o junta com o que a
 * construtora editou.
 *
 * Pedido de 03/10/2026 ("sistema de ajuda ao parceiro no uso do portal"):
 * central de ajuda + tour guiado + perguntas frequentes + contato, editável pela
 * construtora, nos portais do Parceiro, do Fornecedor e do Corretor. Desde
 * 14/10/2026 também no do Cliente (docs/planos/2026-10-14-ajuda-tour-portal-cliente.md).
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

export type Portal = 'parceiro' | 'fornecedor' | 'corretor' | 'cliente' | 'treinamentos';
export type HelpKind = 'artigo' | 'faq' | 'tour' | 'checklist';

export const PORTAL_LABELS: Record<Portal, string> = {
  parceiro: 'Portal do Parceiro',
  fornecedor: 'Portal do Fornecedor',
  corretor: 'Portal do Corretor',
  cliente: 'Portal do Cliente',
  treinamentos: 'Portal de Treinamentos',
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
  ],
  // Rótulos de components/ClientArea.tsx › ALL_TABS. "Obra" vira "Andamento do
  // Serviço" para cliente de Serviços — a ajuda usa o nome genérico.
  cliente: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'jornada', label: 'Minha Jornada' },
    { id: 'unidade', label: 'Dados da Unidade' },
    { id: 'obra', label: 'Obra' },
    { id: 'cronograma-ff', label: 'Cronograma Físico-Financeiro' },
    { id: 'visual', label: 'Visual' },
    { id: 'personalizacao', label: 'Personalização' },
    { id: 'diario', label: 'Diário de Obra' },
    { id: 'documentos', label: 'Documentos' },
    { id: 'contratos', label: 'Contratos' },
    { id: 'financeiro', label: 'Financeiro' },
    { id: 'suporte', label: 'Suporte' },
    { id: 'manutencao', label: 'Manutenção' },
    { id: 'condominio', label: 'Condomínio' },
    // Subseções do Condomínio (utils/clientPortalTabs.ts › CONDOMINIO_SECOES):
    // cada uma tem artigos e "como usar esta tela" próprios.
    { id: 'condominio.dados', label: 'Condomínio › Dados gerais' },
    { id: 'condominio.avisos', label: 'Condomínio › Avisos' },
    { id: 'condominio.documentos', label: 'Condomínio › Documentos' },
    { id: 'condominio.financeiro', label: 'Condomínio › Financeiro' },
    { id: 'condominio.manutencao', label: 'Condomínio › Manutenção' },
    { id: 'condominio.equipamentos', label: 'Condomínio › Equipamentos' },
  ],
  // utils/trainingPortalTabs.ts › TRAINING_PORTAL_TAB_IDS (15/10/2026)
  treinamentos: [
    { id: 'treinamentos', label: 'Meus treinamentos' },
    { id: 'catalogo', label: 'Catálogo' },
    { id: 'certificados', label: 'Certificados' },
    { id: 'historico', label: 'Histórico' },
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
  ...FAQ_ACESSO('corretor', '/portal-corretor'),
  {
    key: 'corretor.faq.secao-sumiu', kind: 'faq', section: null,
    title: 'Uma seção que eu usava sumiu do menu.',
    body_html: p('A incorporadora escolhe quais seções ficam visíveis para cada corretor. Se precisa de uma que não aparece, peça a ela para liberar.'),
  },
];

// ── Portal do Cliente ────────────────────────────────────────────────────────
// Pessoa física, não empresa: as perguntas de acesso são próprias (FAQ_ACESSO
// fala de "sua empresa" e de convite por e-mail, que o cliente não recebe).
const CLIENTE: DefaultHelpItem[] = [
  {
    key: 'cliente.geral.o-que-e', kind: 'artigo', section: null,
    title: 'O que é o Portal do Cliente',
    body_html: p(
      'Este portal é a sua área exclusiva com a construtora: acompanhe a obra ou o serviço contratado, os seus contratos, parcelas e recibos, os documentos do seu imóvel e os chamados de manutenção.',
      'As seções do menu são as que a construtora liberou para você. Se uma seção não aparece, é porque não está liberada.',
    ),
  },
  {
    key: 'cliente.dashboard.visao', kind: 'artigo', section: 'dashboard',
    title: 'Dashboard: o resumo do seu imóvel',
    body_html: p(
      'A primeira tela reúne, de relance, o que mais importa para você: andamento da obra, situação dos pagamentos, contratos e chamados abertos.',
      'Os atalhos levam direto à seção de cada assunto.',
    ),
  },
  {
    key: 'cliente.jornada.etapas', kind: 'artigo', section: 'jornada',
    title: 'Minha Jornada: as etapas da sua compra',
    body_html: p('A linha do tempo mostra cada etapa, do contrato à entrega das chaves: o que já foi concluído, o que está em andamento e o que vem a seguir.'),
  },
  {
    key: 'cliente.unidade.ficha', kind: 'artigo', section: 'unidade',
    title: 'Dados da Unidade: a ficha do seu imóvel',
    body_html: p('Aqui fica a ficha do imóvel comprado ou alugado: empreendimento, unidade, áreas e demais características registradas pela construtora.'),
  },
  {
    key: 'cliente.obra.acompanhar', kind: 'artigo', section: 'obra',
    title: 'Obra: acompanhe o avanço',
    body_html: p(
      'A seção mostra o avanço físico geral, o prazo restante e as etapas do cronograma, com o que está concluído, em andamento e a iniciar.',
      'Os números vêm do planejamento publicado pela construtora. Enquanto ele não é publicado, a tela avisa que o cronograma ainda não está disponível.',
    ),
  },
  {
    key: 'cliente.cronograma-ff.ler', kind: 'artigo', section: 'cronograma-ff',
    title: 'Cronograma Físico-Financeiro: como ler',
    body_html: p('O gráfico compara, período a período, o avanço físico da obra com o desembolso previsto. Troque a escala no seletor para ver mais ou menos detalhe.'),
  },
  {
    key: 'cliente.visual.fotos', kind: 'artigo', section: 'visual',
    title: 'Visual: fotos da obra',
    body_html: p('Fotos do canteiro publicadas pela construtora. Clique numa foto para ampliar.'),
  },
  {
    key: 'cliente.personalizacao.escolher', kind: 'artigo', section: 'personalizacao',
    title: 'Personalização: escolha dos acabamentos',
    body_html: p('Quando a construtora abre a personalização, você escolhe aqui os acabamentos da sua unidade entre as opções oferecidas. Confira prazos e valores antes de confirmar.'),
  },
  {
    key: 'cliente.diario.registros', kind: 'artigo', section: 'diario',
    title: 'Diário de Obra: o dia a dia do canteiro',
    body_html: p('Os registros diários da obra: clima, atividades realizadas, fotos e vídeos. Clique num registro para ver o detalhe.'),
  },
  {
    key: 'cliente.documentos.baixar', kind: 'artigo', section: 'documentos',
    title: 'Documentos: consultar e baixar',
    body_html: p(
      'A lista traz os arquivos que a construtora compartilhou com você: contratos, plantas, manuais, memoriais.',
      'Clique na seta de cada documento para baixar. No computador, você pode trocar entre lista e grade.',
    ),
  },
  {
    key: 'cliente.contratos.consultar', kind: 'artigo', section: 'contratos',
    title: 'Contratos: seus contratos e a assinatura',
    body_html: p('Veja os contratos firmados com a construtora, o valor e o status de assinatura de cada um. Contrato "Em elaboração" ainda é minuta: a versão final aparece aqui quando for emitida.'),
  },
  {
    key: 'cliente.financeiro.parcelas', kind: 'artigo', section: 'financeiro',
    title: 'Financeiro: parcelas, pagamentos e recibos',
    body_html: p(
      'A seção mostra o total do contrato, o que já foi pago e o saldo, além da lista de parcelas com vencimento, valor e situação.',
      'Quando uma parcela é paga, o recibo fica disponível para baixar na própria linha da parcela.',
    ),
  },
  {
    key: 'cliente.suporte.posobra', kind: 'artigo', section: 'suporte',
    title: 'Suporte: assistência e pós-obra',
    body_html: p('Depois da entrega das chaves, é por aqui que você acompanha a assistência técnica e a garantia do imóvel. Para defeitos e reparos, use a seção <strong>Manutenção</strong>.'),
  },
  {
    key: 'cliente.manutencao.chamado', kind: 'artigo', section: 'manutencao',
    title: 'Manutenção: como abrir um chamado',
    body_html: p(
      'Clique em <strong>Abrir Chamado</strong>, dê um título, escolha a categoria e a prioridade, a unidade (se você tiver mais de uma) e descreva o problema com detalhes.',
      'O chamado aparece na lista com o status <strong>Aberto</strong> e muda conforme a construtora atende: Em Andamento, Aguardando, Resolvido.',
    ),
  },
  {
    key: 'cliente.condominio.secoes', kind: 'artigo', section: 'condominio',
    title: 'Condomínio: o que há em cada seção',
    body_html: p('O Condomínio reúne o que é do prédio, separado em seções (no computador, os subitens do menu; no celular, as abas no topo do cartão):') + ul(
      '<strong>Dados gerais</strong>: as unidades que você ocupa no prédio.',
      '<strong>Avisos</strong>: comunicados da administração. O número no menu mostra os que você ainda não leu.',
      '<strong>Documentos</strong>: convenção, regulamento interno e atas.',
      '<strong>Financeiro</strong>: o rateio das despesas, mês a mês.',
      '<strong>Manutenção</strong>: o plano de manutenção do prédio e as ordens de serviço.',
      '<strong>Equipamentos</strong>: elevadores, bombas e demais ativos, com a garantia.',
    ),
  },
  {
    key: 'cliente.condominio.dados', kind: 'artigo', section: 'condominio.dados',
    title: 'Dados gerais: as suas unidades no prédio',
    body_html: p('No topo do cartão aparecem o nome do condomínio, quantas unidades suas há nele e o CNPJ. Com unidades em mais de um condomínio, elas vêm agrupadas por prédio.') + ul(
      'O <strong>cartão de cada unidade</strong> traz o número, a torre, o pavimento e a tipologia.',
      '<strong>Fração ideal</strong>: a parte da unidade no condomínio, que costuma definir a sua cota no rateio.',
      '<strong>Área privativa</strong> e <strong>seu papel</strong>: proprietário, inquilino, morador ou responsável financeiro.',
      '<strong>Quem consta na unidade</strong>: as outras pessoas registradas nela, só com nome e papel.',
    ) + p('Sem unidade registrada, a tela diz "Nenhuma unidade de condomínio". Se algo estiver errado, fale com a administração.'),
  },
  {
    key: 'cliente.condominio.avisos', kind: 'artigo', section: 'condominio.avisos',
    title: 'Avisos: os comunicados da administração',
    body_html: ul(
      'O topo da seção e o <strong>número vermelho do menu</strong> mostram quantos avisos você ainda não leu.',
      'Os avisos vêm do mais novo para o mais antigo.',
      'Aviso não lido vem destacado, com <strong>Não lido</strong>. Clique nele para marcá-lo como lido: o destaque some, aparece <strong>Lido</strong> e a contagem diminui.',
      'Abaixo de cada aviso ficam a <strong>categoria</strong> e a <strong>data</strong> de publicação; com mais de um condomínio, também o prédio.',
    ) + p('A administração acompanha quem já leu cada comunicado. Sem nenhum aviso, a tela diz "Nenhum aviso publicado".'),
  },
  {
    key: 'cliente.condominio.documentos', kind: 'artigo', section: 'condominio.documentos',
    title: 'Documentos: convenção, regulamento e atas',
    body_html: ul(
      'A lista traz os documentos publicados pela administração: convenção, regulamento interno, atas e outros.',
      'Cada linha mostra o nome, a <strong>categoria</strong> e a descrição (e o prédio, com mais de um condomínio).',
      'Clique na linha para abrir o documento numa <strong>aba nova</strong>.',
      'Se o documento não abrir, uma mensagem aparece abaixo da lista. Confira se o navegador bloqueou a janela; se não, peça à administração para conferir o arquivo.',
    ),
  },
  {
    key: 'cliente.condominio.rateio', kind: 'artigo', section: 'condominio.financeiro',
    title: 'Financeiro: o rateio das despesas',
    body_html: ul(
      '<strong>Competência</strong>: escolha o mês na lista ou ande pelas setas. Só aparecem os meses que têm rateio.',
      'No cabeçalho de cada rateio: o número, o <strong>tipo da taxa</strong> (ordinária ou extraordinária) e o <strong>critério</strong> da divisão. Pode haver mais de um rateio no mesmo mês.',
      '<strong>Prévia — pode mudar</strong>: a administração ainda pode corrigir. <strong>Fechado em</strong>: definitivo.',
      '<strong>Incluir os comprovantes</strong> (marcado de início): o PDF vem com os comprovantes das despesas.',
      '<strong>Baixar PDF</strong> gera o documento do rateio e mostra o andamento enquanto junta os anexos.',
      '<strong>Despesas do mês</strong> e <strong>Sua cota</strong>: o total do prédio e o que coube a você.',
      '<strong>O que entrou no rateio</strong>: cada despesa, com o valor.',
      '<strong>Rateio por unidade</strong>: a cota de todas as unidades; a sua vem destacada, com "sua unidade".',
    ),
  },
  {
    key: 'cliente.condominio.manutencao', kind: 'artigo', section: 'condominio.manutencao',
    title: 'Manutenção do prédio: o plano e as ordens de serviço',
    body_html: ul(
      '<strong>O que é mantido</strong>: o plano de manutenção do prédio (NBR 5674). Cada item mostra o que é mantido, o sistema do prédio, a periodicidade e a <strong>próxima data</strong>.',
      '<strong>Ordens de serviço</strong>: os serviços da administração, com o código, o tipo, o sistema, a data agendada ou executada e a <strong>situação</strong>.',
    ) + p('Para um reparo na SUA unidade, abra um chamado em <strong>Manutenção</strong> do menu principal.'),
  },
  {
    key: 'cliente.condominio.equipamentos', kind: 'artigo', section: 'condominio.equipamentos',
    title: 'Equipamentos do prédio',
    body_html: ul(
      'A lista traz os equipamentos do condomínio (elevadores, bombas e demais ativos), com o sistema, a marca e o modelo.',
      'Ao lado, <strong>garantia até</strong>: até quando vale a garantia do fornecedor.',
      'Clique num equipamento para abrir a <strong>ficha</strong>: identificação (código patrimonial, categoria, sistema, situação, marca, modelo, número de série, localização), aquisição e garantia (data e valor de aquisição, vida útil, valor residual, garantia) e observações.',
    ),
  },
  {
    key: 'cliente.geral.meus-dados', kind: 'artigo', section: null,
    title: 'Meus dados',
    body_html: p('Em <strong>Meus dados</strong> (no menu da conta, no canto superior direito) você vê o cadastro que a construtora tem de você. Para alterar qualquer informação, fale com a construtora.'),
  },
  {
    key: 'cliente.faq.email-senha', kind: 'faq', section: null,
    title: 'Como entro com e-mail e senha?',
    body_html: p(
      'Abra <strong>/portal-cliente</strong> e entre com o e-mail que a construtora cadastrou. Se recebeu um e-mail de convite, crie a senha pelo link dele; se não recebeu, use <strong>Primeiro acesso? Crie sua senha</strong> na própria tela.',
      'Esqueceu a senha? Use <strong>Esqueci minha senha</strong>: o link chega no seu e-mail e volta para o portal.',
    ),
  },
  {
    key: 'cliente.faq.link-vencido', kind: 'faq', section: null,
    title: 'Meu link de acesso parou de funcionar. O que faço?',
    body_html: p(
      'O link de acesso vale por 90 dias e pode ser revogado pela construtora. Quando vence, a tela diz "Link inválido ou expirado".',
      'Peça à construtora um novo link.',
    ),
  },
  {
    key: 'cliente.faq.dados-cadastrais', kind: 'faq', section: null,
    title: 'Como altero meus dados cadastrais ou meu e-mail?',
    body_html: p('O seu cadastro é mantido pela construtora. Peça a alteração a ela.'),
  },
  {
    key: 'cliente.faq.secao-sumiu', kind: 'faq', section: null,
    title: 'Uma seção que eu usava sumiu do menu.',
    body_html: p('A construtora escolhe quais seções ficam visíveis para cada cliente. Se precisa de uma que não aparece, peça a ela para liberar.'),
  },
  {
    key: 'cliente.faq.pagamento-pendente', kind: 'faq', section: 'financeiro',
    title: 'Paguei uma parcela e ela ainda aparece como pendente.',
    body_html: p('A baixa depende da confirmação do pagamento pelo banco, o que pode levar alguns dias úteis. Se passar disso, fale com a construtora com o comprovante em mãos.'),
  },
  {
    key: 'cliente.faq.recibo', kind: 'faq', section: 'financeiro',
    title: 'Onde encontro o recibo de uma parcela paga?',
    body_html: p('Em <strong>Financeiro</strong>, na linha da parcela paga. Se o recibo ainda não aparece, peça à construtora para emiti-lo.'),
  },
  {
    key: 'cliente.faq.condominio-sem-unidade', kind: 'faq', section: 'condominio.dados',
    title: 'O Condomínio diz "Nenhuma unidade de condomínio".',
    body_html: p('O seu cadastro ainda não consta como proprietário, inquilino, morador ou responsável financeiro de nenhuma unidade. Peça à administração para registrar a sua ocupação.'),
  },
  {
    key: 'cliente.faq.condominio-dado-errado', kind: 'faq', section: 'condominio.dados',
    title: 'A fração ideal ou a área da minha unidade está errada.',
    body_html: p('Esses dados vêm do cadastro do condomínio. Fale com a administração; a correção aparece aqui assim que ela atualizar.'),
  },
  {
    key: 'cliente.faq.condominio-aviso-lido', kind: 'faq', section: 'condominio.avisos',
    title: 'Como marco um aviso como lido?',
    body_html: p('Clique no aviso. Ele deixa de aparecer como <strong>Não lido</strong> e sai da contagem do menu.'),
  },
  {
    key: 'cliente.faq.condominio-documento-nao-abre', kind: 'faq', section: 'condominio.documentos',
    title: 'Cliquei no documento e nada abriu.',
    body_html: p('O documento abre numa aba nova; confira se o navegador não bloqueou a janela. Se aparecer uma mensagem de erro abaixo da lista, peça à administração para conferir o arquivo.'),
  },
  {
    key: 'cliente.faq.condominio-rateio-mes', kind: 'faq', section: 'condominio.financeiro',
    title: 'O rateio deste mês ainda não aparece.',
    body_html: p('O rateio aparece quando a administração o publica. Enquanto ela ainda pode corrigi-lo, ele vem marcado como <strong>Prévia — pode mudar</strong>; depois de fechado, mostra <strong>Fechado em</strong> e a data.'),
  },
  {
    key: 'cliente.faq.condominio-cotas-outras', kind: 'faq', section: 'condominio.financeiro',
    title: 'Por que vejo a cota das outras unidades?',
    body_html: p('O rateio é mostrado inteiro, como numa prestação de contas de assembleia: todos veem como as despesas foram divididas. A sua unidade vem destacada.'),
  },
  {
    key: 'cliente.faq.condominio-reparo', kind: 'faq', section: 'condominio.manutencao',
    title: 'Onde peço um reparo: no Condomínio ou em Manutenção?',
    body_html: p('Reparo na sua unidade vai em <strong>Manutenção</strong> do menu principal, como chamado. A Manutenção dentro do Condomínio mostra o que a administração cuida nas áreas comuns do prédio.'),
  },
  {
    key: 'cliente.faq.condominio-garantia', kind: 'faq', section: 'condominio.equipamentos',
    title: 'Um equipamento do prédio quebrou dentro da garantia.',
    body_html: p('A data da garantia está na lista e na ficha do equipamento. Avise a administração: é ela quem aciona o fornecedor.'),
  },
  {
    key: 'cliente.faq.chamado-andamento', kind: 'faq', section: 'manutencao',
    title: 'Abri um chamado. Como acompanho?',
    body_html: p('O chamado fica na lista de <strong>Manutenção</strong> com o status atualizado pela construtora. Chamados das unidades que você ocupa também aparecem ali.'),
  },
];

// ── Portal de Treinamentos (15/10/2026) ──────────────────────────────────────
// Só entra por e-mail e senha (convite do RH): as FAQs de link não se aplicam.
const TREINAMENTOS: DefaultHelpItem[] = [
  {
    key: 'treinamentos.geral.o-que-e', kind: 'artigo', section: null,
    title: 'O que é o Portal de Treinamentos',
    body_html: p(
      'Este portal é a sua sala de treinamento com a empresa: os treinamentos atribuídos a você, as aulas e as provas, os certificados emitidos e o histórico do que você já fez, com as datas de validade.',
      'Colaboradores e terceirizados entram pelo mesmo lugar, com o e-mail e a senha criados a partir do convite enviado pelo RH.',
    ),
  },
  {
    key: 'treinamentos.treinamentos.visao', kind: 'artigo', section: 'treinamentos',
    title: 'Meus treinamentos: o que fazer e até quando',
    body_html: p(
      'Cada cartão é um treinamento atribuído a você (pelo RH, pela sua função, equipe ou obra) ou em que você se inscreveu pelo Catálogo. Ele mostra a versão do conteúdo, a carga horária, o prazo e o andamento.',
      '"Começar" ou "Continuar" abre a sala de aula no ponto em que você parou. Um treinamento concluído fica com "Rever treinamento" e o certificado passa a aparecer na seção Certificados.',
    ),
  },
  {
    key: 'treinamentos.treinamentos.conclusao', kind: 'artigo', section: 'treinamentos',
    title: 'Como um treinamento é considerado concluído',
    body_html: p(
      'Abrir o vídeo não conclui a aula. O sistema credita o tempo realmente assistido; dependendo do treinamento, também exige nota mínima na prova e um aceite formal.',
      'Esses critérios são definidos pela empresa na versão do conteúdo, e a conclusão é decidida pelo servidor, com registro de cada acesso — é a evidência numa fiscalização.',
    ),
  },
  {
    key: 'treinamentos.treinamentos.reciclagem', kind: 'artigo', section: 'treinamentos',
    title: 'Reciclagem e prazo vencido',
    body_html: p(
      'Treinamentos com validade (NRs, por exemplo) geram uma nova matrícula de reciclagem antes de vencer. O cartão mostra "reciclagem" e o novo prazo.',
      'Quando o prazo passa, o cartão fica com "Em atraso". Ele continua podendo ser feito; fale com o RH se o prazo precisar ser revisto.',
    ),
  },
  {
    key: 'treinamentos.catalogo.visao', kind: 'artigo', section: 'catalogo',
    title: 'Catálogo: treinamentos abertos para inscrição',
    body_html: p(
      'A empresa pode abrir alguns treinamentos para quem quiser fazer. Eles aparecem aqui com a descrição, a carga horária e, quando houver, o prazo para concluir a partir da inscrição.',
      '"Inscrever-se" cria a sua matrícula na hora e o treinamento passa a aparecer em Meus treinamentos. Os treinamentos obrigatórios não passam pelo catálogo: o RH atribui e eles já chegam prontos.',
    ),
  },
  {
    key: 'treinamentos.certificados.visao', kind: 'artigo', section: 'certificados',
    title: 'Certificados: baixar e validar',
    body_html: p(
      'Cada treinamento EAD concluído emite um certificado numerado, com a carga horária, a nota (quando há prova) e a validade.',
      '"PDF" abre o arquivo, quando a empresa já o gerou. "Validação" copia o link público que confirma a autenticidade do certificado — é o mesmo endereço do QR impresso no PDF.',
    ),
  },
  {
    key: 'treinamentos.historico.visao', kind: 'artigo', section: 'historico',
    title: 'Histórico e vencimentos',
    body_html: p(
      'Aqui está tudo o que foi registrado para você: treinamentos presenciais lançados pelo RH (com nota e instrutor) e os EAD concluídos no portal.',
      'A situação diz se o registro está válido, vencendo nos próximos 30 dias ou vencido. Treinamento vencido normalmente vira uma reciclagem em Meus treinamentos.',
    ),
  },
  {
    key: 'treinamentos.faq.senha', kind: 'faq', section: null,
    title: 'Como entro no portal?',
    body_html: p(
      'Abra <strong>/portal-treinamentos</strong> e entre com o seu e-mail e a senha que você criou pelo e-mail de convite.',
      'Se ainda não criou a senha, peça ao RH para reenviar o convite. Cada link de convite funciona uma vez só.',
    ),
  },
  {
    key: 'treinamentos.faq.esqueci-senha', kind: 'faq', section: null,
    title: 'Esqueci a senha.',
    body_html: p(
      'Na tela de entrada, use "Esqueceu a senha?" para receber um e-mail de redefinição. Se o e-mail não chegar, peça ao RH para reenviar o convite: o link do convite também serve para definir uma nova senha.',
    ),
  },
  {
    key: 'treinamentos.faq.video-nao-conta', kind: 'faq', section: null,
    title: 'Assisti o vídeo e a aula não ficou concluída. Por quê?',
    body_html: p(
      'O sistema credita o tempo realmente assistido e, em alguns treinamentos, não aceita pular trechos. Adiantar o vídeo ou deixá-lo rodando em outra aba não conta.',
      'Assista a aula até o fim na velocidade normal; se o treinamento tiver prova ou aceite, eles também precisam ser feitos.',
    ),
  },
  {
    key: 'treinamentos.faq.dados-cadastrais', kind: 'faq', section: null,
    title: 'Como altero meus dados ou meu e-mail de acesso?',
    body_html: p(
      'Nome, CPF, empresa e o e-mail de acesso são mantidos pelo RH da empresa que liberou o seu acesso. Peça a alteração a ele.',
    ),
  },
];

export const DEFAULT_ITEMS: Record<Portal, DefaultHelpItem[]> = {
  treinamentos: TREINAMENTOS,
  parceiro: PARCEIRO,
  fornecedor: FORNECEDOR,
  corretor: CORRETOR,
  cliente: CLIENTE,
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
  treinamentos: {
    geral: tourDe('geral', [
      { key: 'treinamentos.tour.geral.menu', anchor: 'menu', section: null, title: 'Bem-vindo ao Portal de Treinamentos', body: 'Este menu leva às suas seções: Meus treinamentos, Catálogo, Certificados e Histórico.' },
      { key: 'treinamentos.tour.geral.treinamentos', anchor: 'aba-treinamentos', section: 'treinamentos', title: 'Meus treinamentos', body: 'Os treinamentos atribuídos a você, com prazo e andamento. É daqui que você abre a sala de aula.' },
      { key: 'treinamentos.tour.geral.treinamentos-lista', anchor: 'treinamentos-lista', section: 'treinamentos', title: 'Começar ou continuar', body: 'Cada cartão é um treinamento. "Começar" ou "Continuar" abre as aulas no ponto em que você parou.', quando: 'quando houver um treinamento atribuído a você' },
      { key: 'treinamentos.tour.geral.catalogo', anchor: 'aba-catalogo', section: 'catalogo', title: 'Catálogo', body: 'Treinamentos que a empresa abriu para inscrição. Ao se inscrever, ele passa para Meus treinamentos.' },
      { key: 'treinamentos.tour.geral.certificados', anchor: 'aba-certificados', section: 'certificados', title: 'Certificados', body: 'Os certificados dos treinamentos concluídos: baixe o PDF ou copie o link de validação.' },
      { key: 'treinamentos.tour.geral.historico', anchor: 'aba-historico', section: 'historico', title: 'Histórico', body: 'Tudo o que foi registrado para você, presencial e EAD, com validade e vencimento.' },
      { key: 'treinamentos.tour.geral.ajuda', anchor: 'ajuda', section: null, title: 'Ajuda sempre à mão', body: 'Este botão abre a central de ajuda, com artigos por seção, perguntas frequentes e o contato da empresa.' },
      { key: 'treinamentos.tour.geral.conta', anchor: 'conta', section: null, title: 'Sua conta', body: 'No menu da conta você vê seus dados cadastrais e sai do portal.' },
    ]),
    porAba: {
      treinamentos: tourDe('treinamentos', [
        { key: 'treinamentos.tour.treinamentos.kpis', anchor: 'treinamentos-kpis', section: 'treinamentos', title: 'Seus números', body: 'Quantos treinamentos estão pendentes, em atraso e concluídos.' },
        { key: 'treinamentos.tour.treinamentos.lista', anchor: 'treinamentos-lista', section: 'treinamentos', title: 'Os treinamentos', body: 'Prazo, versão do conteúdo e andamento de cada um. Concluído fica verde e ganha "Rever treinamento".', quando: 'quando houver um treinamento atribuído a você' },
      ]),
      catalogo: tourDe('catalogo', [
        { key: 'treinamentos.tour.catalogo.lista', anchor: 'catalogo-lista', section: 'catalogo', title: 'Treinamentos abertos', body: 'Descrição, carga horária e prazo de cada treinamento. "Inscrever-se" cria a matrícula na hora.', quando: 'quando a empresa abrir um treinamento para inscrição' },
      ]),
      certificados: tourDe('certificados', [
        { key: 'treinamentos.tour.certificados.lista', anchor: 'certificados-lista', section: 'certificados', title: 'Seus certificados', body: 'Número, validade e situação. "PDF" abre o arquivo e "Validação" copia o link público de autenticidade.' },
      ]),
      historico: tourDe('historico', [
        { key: 'treinamentos.tour.historico.kpis', anchor: 'historico-kpis', section: 'historico', title: 'Válidos, vencendo e vencidos', body: 'O resumo das validades dos seus registros.' },
        { key: 'treinamentos.tour.historico.lista', anchor: 'historico-lista', section: 'historico', title: 'Os registros', body: 'Presencial e EAD, com data, validade, nota e situação.' },
      ]),
    },
  },
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
        // 'corretor.tour.analytics.graficos' saiu em 16/10/2026: os gráficos eram demonstração (D9 do plano 2026-10-16-portal-corretor-mobile).
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
  // Passos de aba oculta saem sozinhos (visibleSections): o tour de um
  // locatário não fala de Obra.
  cliente: {
    geral: tourDe('geral', [
      { key: 'cliente.tour.geral.menu', anchor: 'menu', section: null, title: 'Bem-vindo ao Portal do Cliente', body: 'Este menu leva às seções liberadas para você: obra, documentos, financeiro, manutenção e mais.' },
      { key: 'cliente.tour.geral.obra', anchor: 'aba-obra', section: 'obra', title: 'Obra', body: 'Acompanhe o avanço físico, o prazo e as etapas do cronograma.' },
      { key: 'cliente.tour.geral.documentos', anchor: 'aba-documentos', section: 'documentos', title: 'Documentos', body: 'Contratos, plantas e manuais que a construtora compartilhou com você, prontos para baixar.' },
      { key: 'cliente.tour.geral.financeiro', anchor: 'aba-financeiro', section: 'financeiro', title: 'Financeiro', body: 'Suas parcelas, o que já foi pago e os recibos.' },
      { key: 'cliente.tour.geral.financeiro-resumo', anchor: 'financeiro-resumo', section: 'financeiro', title: 'Resumo financeiro', body: 'Total do contrato, valor pago e saldo. As parcelas e os recibos vêm logo abaixo.' },
      { key: 'cliente.tour.geral.manutencao', anchor: 'aba-manutencao', section: 'manutencao', title: 'Manutenção', body: 'Precisa de um reparo? Abra o chamado por aqui e acompanhe o atendimento.' },
      { key: 'cliente.tour.geral.condominio', anchor: 'aba-condominio', section: 'condominio', title: 'Condomínio', body: 'Tudo o que é do prédio, em seis seções. O número vermelho mostra os avisos que você ainda não leu.' },
      { key: 'cliente.tour.geral.condominio-dados', anchor: 'aba-condominio.dados', section: 'condominio.dados', title: 'Dados gerais', body: 'As unidades em que você consta no prédio: fração ideal, área, o seu papel e quem mais está registrado nelas.' },
      { key: 'cliente.tour.geral.condominio-avisos', anchor: 'aba-condominio.avisos', section: 'condominio.avisos', title: 'Avisos', body: 'Os comunicados da administração. O número ao lado conta os que você ainda não leu.' },
      { key: 'cliente.tour.geral.condominio-documentos', anchor: 'aba-condominio.documentos', section: 'condominio.documentos', title: 'Documentos', body: 'Convenção, regulamento interno e atas publicados pela administração.' },
      { key: 'cliente.tour.geral.condominio-financeiro', anchor: 'aba-condominio.financeiro', section: 'condominio.financeiro', title: 'Financeiro', body: 'O rateio das despesas do prédio, mês a mês, com a sua cota e o PDF.' },
      { key: 'cliente.tour.geral.condominio-manutencao', anchor: 'aba-condominio.manutencao', section: 'condominio.manutencao', title: 'Manutenção', body: 'O plano de manutenção do prédio e as ordens de serviço da administração.' },
      { key: 'cliente.tour.geral.condominio-equipamentos', anchor: 'aba-condominio.equipamentos', section: 'condominio.equipamentos', title: 'Equipamentos', body: 'Elevadores, bombas e demais ativos do prédio, com a garantia e a ficha de cada um.' },
      { key: 'cliente.tour.geral.mais', anchor: 'mobile-mais', section: null, title: 'Mais seções', body: 'No celular, as outras seções e a Ajuda ficam aqui.' },
      { key: 'cliente.tour.geral.ajuda', anchor: 'ajuda', section: null, title: 'Ajuda sempre à mão', body: 'Este botão abre a central de ajuda, com artigos por seção, perguntas frequentes e o contato da construtora.' },
      { key: 'cliente.tour.geral.conta', anchor: 'conta', section: null, title: 'Sua conta', body: 'No menu da conta você vê o cadastro que a construtora tem de você.' },
    ]),
    porAba: {
      dashboard: tourDe('dashboard', [
        { key: 'cliente.tour.dashboard.resumo', anchor: 'dashboard-resumo', section: 'dashboard', title: 'Seu resumo', body: 'Andamento, pagamentos, contratos e chamados de relance. Os atalhos levam à seção de cada assunto.' },
      ]),
      obra: tourDe('obra', [
        { key: 'cliente.tour.obra.progresso', anchor: 'obra-progresso', section: 'obra', title: 'Avanço da obra', body: 'Avanço geral, prazo restante e ritmo. Abaixo, as etapas do cronograma.', quando: 'quando a construtora publicar o cronograma' },
      ]),
      documentos: tourDe('documentos', [
        { key: 'cliente.tour.documentos.lista', anchor: 'documentos-lista', section: 'documentos', title: 'Seus documentos', body: 'Os arquivos compartilhados com você. Clique na seta para baixar.' },
      ]),
      financeiro: tourDe('financeiro', [
        { key: 'cliente.tour.financeiro.resumo', anchor: 'financeiro-resumo', section: 'financeiro', title: 'Resumo financeiro', body: 'Total, pago e saldo. Logo abaixo, cada parcela com vencimento, situação e o recibo das que já foram pagas.' },
      ]),
      manutencao: tourDe('manutencao', [
        { key: 'cliente.tour.manutencao.abrir', anchor: 'manutencao-abrir', section: 'manutencao', title: 'Abrir Chamado', body: 'Descreva o problema, escolha a categoria e a prioridade. A construtora recebe na hora.' },
        { key: 'cliente.tour.manutencao.lista', anchor: 'manutencao-lista', section: 'manutencao', title: 'Seus chamados', body: 'Cada chamado mostra a prioridade e o status, que muda conforme o atendimento avança.' },
      ]),
      // Um "como usar esta tela" por SUBSEÇÃO do Condomínio — é nelas que a
      // pessoa está (a aba sozinha nunca é a seção atual).
      'condominio.dados': tourDe('condominio.dados', [
        { key: 'cliente.tour.condominio.predio', anchor: 'condominio-predio', section: 'condominio.dados', title: 'Seu condomínio', body: 'O nome do prédio, quantas unidades suas há nele e o CNPJ do condomínio. Com mais de um condomínio, diz quantos são.', quando: 'quando você tiver uma unidade num condomínio' },
        { key: 'cliente.tour.condominio.secoes', anchor: 'condominio-secoes', section: 'condominio.dados', title: 'As seções', body: 'Dados gerais, Avisos, Documentos, Financeiro, Manutenção e Equipamentos: cada assunto do prédio na sua seção.' },
        { key: 'cliente.tour.condominio.dados.grupo', anchor: 'condominio-dados-grupo', section: 'condominio.dados', title: 'Cada condomínio', body: 'Com unidades em mais de um condomínio, elas aparecem agrupadas por prédio, com o nome, as unidades e o CNPJ.', quando: 'quando você tiver unidades em mais de um condomínio' },
        { key: 'cliente.tour.condominio.dados.unidade', anchor: 'condominio-dados-unidade', section: 'condominio.dados', title: 'Sua unidade', body: 'Cada cartão é uma unidade: o número, a torre, o pavimento e a tipologia.', quando: 'quando você tiver uma unidade num condomínio' },
        { key: 'cliente.tour.condominio.dados.fracao', anchor: 'condominio-dados-fracao', section: 'condominio.dados', title: 'Fração ideal', body: 'A parte da unidade no condomínio. É ela que costuma definir a sua cota no rateio das despesas.', quando: 'quando você tiver uma unidade num condomínio' },
        { key: 'cliente.tour.condominio.dados.papel', anchor: 'condominio-dados-papel', section: 'condominio.dados', title: 'Área e seu papel', body: 'A área privativa da unidade e o seu papel nela: proprietário, inquilino, morador ou responsável financeiro.', quando: 'quando você tiver uma unidade num condomínio' },
        { key: 'cliente.tour.condominio.dados.ocupantes', anchor: 'condominio-dados-ocupantes', section: 'condominio.dados', title: 'Quem consta na unidade', body: 'As outras pessoas registradas na unidade, só com nome e papel.', quando: 'quando houver outra pessoa registrada na unidade' },
      ]),
      'condominio.avisos': tourDe('condominio.avisos', [
        { key: 'cliente.tour.condominio.avisos.contador', anchor: 'condominio-avisos-contador', section: 'condominio.avisos', title: 'Não lidos', body: 'Aqui, e no número vermelho do menu, você vê quantos avisos ainda não leu.', quando: 'quando você tiver uma unidade num condomínio' },
        { key: 'cliente.tour.condominio.avisos.lista', anchor: 'condominio-avisos-lista', section: 'condominio.avisos', title: 'Comunicados', body: 'Os avisos da administração, do mais novo para o mais antigo.', quando: 'quando a administração publicar um aviso' },
        { key: 'cliente.tour.condominio.avisos.aviso', anchor: 'condominio-aviso', section: 'condominio.avisos', title: 'Lido e não lido', body: 'Aviso não lido vem destacado, com "Não lido". Clique nele para marcá-lo como lido: o destaque some e a contagem diminui.', quando: 'quando a administração publicar um aviso' },
        { key: 'cliente.tour.condominio.avisos.categoria', anchor: 'condominio-aviso-categoria', section: 'condominio.avisos', title: 'Categoria e data', body: 'O assunto do aviso e quando foi publicado. Com mais de um condomínio, diz também de qual prédio é.', quando: 'quando a administração publicar um aviso' },
      ]),
      'condominio.documentos': tourDe('condominio.documentos', [
        { key: 'cliente.tour.condominio.documentos.lista', anchor: 'condominio-documentos-lista', section: 'condominio.documentos', title: 'Documentos do condomínio', body: 'Convenção, regulamento interno e atas publicados pela administração.', quando: 'quando a administração publicar um documento' },
        { key: 'cliente.tour.condominio.documentos.documento', anchor: 'condominio-documento', section: 'condominio.documentos', title: 'Abrir um documento', body: 'Cada linha mostra o nome, a categoria e a descrição. Clique para abrir o documento numa aba nova. Se ele não abrir, uma mensagem aparece abaixo da lista.', quando: 'quando a administração publicar um documento' },
      ]),
      'condominio.financeiro': tourDe('condominio.financeiro', [
        { key: 'cliente.tour.condominio.financeiro.competencia', anchor: 'condominio-competencia', section: 'condominio.financeiro', title: 'Competência', body: 'O mês do rateio. Escolha na lista ou ande pelas setas; só aparecem os meses que têm rateio.', quando: 'quando houver um rateio publicado' },
        { key: 'cliente.tour.condominio.financeiro.cabecalho', anchor: 'condominio-rateio-cabecalho', section: 'condominio.financeiro', title: 'O rateio do mês', body: 'O número do rateio, o tipo da taxa (ordinária ou extraordinária) e o critério da divisão entre as unidades. Pode haver mais de um rateio no mesmo mês.', quando: 'quando houver um rateio publicado' },
        { key: 'cliente.tour.condominio.financeiro.status', anchor: 'condominio-rateio-status', section: 'condominio.financeiro', title: 'Prévia ou fechado', body: '"Prévia — pode mudar": a administração ainda pode corrigir os valores. "Fechado em": o rateio é definitivo.', quando: 'quando houver um rateio publicado' },
        { key: 'cliente.tour.condominio.financeiro.comprovantes', anchor: 'condominio-rateio-comprovantes', section: 'condominio.financeiro', title: 'Incluir os comprovantes', body: 'Marcado, o PDF vem com os comprovantes das despesas anexados.', quando: 'quando alguma despesa do rateio tiver comprovante' },
        { key: 'cliente.tour.condominio.financeiro.pdf', anchor: 'condominio-rateio-pdf', section: 'condominio.financeiro', title: 'Baixar PDF', body: 'Gera o documento do rateio. Enquanto junta os anexos, o botão mostra o andamento.', quando: 'quando houver um rateio publicado' },
        { key: 'cliente.tour.condominio.financeiro.cota', anchor: 'condominio-rateio-cota', section: 'condominio.financeiro', title: 'Despesas e sua cota', body: 'O total de despesas do prédio no mês e o que coube à sua unidade.', quando: 'quando houver um rateio publicado' },
        { key: 'cliente.tour.condominio.financeiro.despesas', anchor: 'condominio-rateio-despesas', section: 'condominio.financeiro', title: 'O que entrou no rateio', body: 'Cada despesa do mês, com o valor.', quando: 'quando o rateio tiver despesas' },
        { key: 'cliente.tour.condominio.financeiro.unidades', anchor: 'condominio-rateio-unidades', section: 'condominio.financeiro', title: 'Rateio por unidade', body: 'A cota de cada unidade do prédio. A sua vem destacada, com "sua unidade".', quando: 'quando o rateio tiver cotas' },
      ]),
      'condominio.manutencao': tourDe('condominio.manutencao', [
        { key: 'cliente.tour.condominio.manutencao.plano', anchor: 'condominio-manutencao-plano', section: 'condominio.manutencao', title: 'O que é mantido', body: 'O plano de manutenção do prédio (NBR 5674).', quando: 'quando a administração publicar o plano de manutenção' },
        { key: 'cliente.tour.condominio.manutencao.item', anchor: 'condominio-manutencao-item', section: 'condominio.manutencao', title: 'Cada item do plano', body: 'O que é mantido, o sistema do prédio a que pertence e de quanto em quanto tempo.', quando: 'quando a administração publicar o plano de manutenção' },
        { key: 'cliente.tour.condominio.manutencao.proxima', anchor: 'condominio-manutencao-proxima', section: 'condominio.manutencao', title: 'Próxima data', body: 'Quando o item deve ser feito de novo.', quando: 'quando um item do plano tiver próxima data' },
        { key: 'cliente.tour.condominio.manutencao.ordens', anchor: 'condominio-manutencao-ordens', section: 'condominio.manutencao', title: 'Ordens de serviço', body: 'Os serviços da administração no prédio. Reparo na sua unidade é chamado em Manutenção, no menu principal.', quando: 'quando houver uma ordem de serviço' },
        { key: 'cliente.tour.condominio.manutencao.ordem', anchor: 'condominio-ordem', section: 'condominio.manutencao', title: 'Cada ordem', body: 'O código, o tipo do serviço, o sistema do prédio e a data agendada ou executada.', quando: 'quando houver uma ordem de serviço' },
        { key: 'cliente.tour.condominio.manutencao.situacao', anchor: 'condominio-ordem-situacao', section: 'condominio.manutencao', title: 'Situação', body: 'Em que pé está a ordem de serviço.', quando: 'quando houver uma ordem de serviço' },
      ]),
      'condominio.equipamentos': tourDe('condominio.equipamentos', [
        { key: 'cliente.tour.condominio.equipamentos.lista', anchor: 'condominio-equipamentos-lista', section: 'condominio.equipamentos', title: 'Equipamentos', body: 'Elevadores, bombas e demais ativos do prédio.', quando: 'quando houver equipamentos cadastrados' },
        { key: 'cliente.tour.condominio.equipamentos.equipamento', anchor: 'condominio-equipamento', section: 'condominio.equipamentos', title: 'A ficha', body: 'Cada linha mostra o nome, o sistema, a marca e o modelo. Clique para abrir a ficha: identificação (código, categoria, situação, número de série, localização), aquisição e garantia (data, valor, vida útil) e observações.', quando: 'quando houver equipamentos cadastrados' },
        { key: 'cliente.tour.condominio.equipamentos.garantia', anchor: 'condominio-equipamento-garantia', section: 'condominio.equipamentos', title: 'Garantia', body: 'Até quando vale a garantia do fornecedor. Dentro dela, avise a administração: é ela quem aciona o fornecedor.', quando: 'quando um equipamento tiver garantia informada' },
      ]),
    },
  },
};

/**
 * Checklist "Primeiros passos" (F8). Cada item se marca sozinho quando o
 * externo abre a aba (`aba:<id>`) ou faz a ação (`acao:<PortalAcao>`,
 * utils/portalEventos.ts). Chaves `<portal>.checklist.<slug>`; no banco o
 * progresso fica em portal_tour_progress com tour_id `checklist:<chave>`.
 * A construtora só renomeia ou oculta (kind='checklist').
 */
export interface ChecklistItem {
  key: string;
  title: string;
  /** aba para onde o "Ir" leva (e que precisa estar liberada para o item aparecer) */
  section: string;
  evento: string;
}

export const CHECKLIST_ITEMS: Record<Portal, ChecklistItem[]> = {
  treinamentos: [
    { key: 'treinamentos.checklist.abrir', title: 'Abra um treinamento', section: 'treinamentos', evento: 'acao:abriu-treinamento' },
    { key: 'treinamentos.checklist.catalogo', title: 'Conheça o catálogo', section: 'catalogo', evento: 'aba:catalogo' },
    { key: 'treinamentos.checklist.inscricao', title: 'Inscreva-se em um treinamento', section: 'catalogo', evento: 'acao:inscreveu-treinamento' },
    { key: 'treinamentos.checklist.certificado', title: 'Baixe um certificado', section: 'certificados', evento: 'acao:baixou-certificado' },
    { key: 'treinamentos.checklist.historico', title: 'Confira seu histórico', section: 'historico', evento: 'aba:historico' },
  ],
  parceiro: [
    { key: 'parceiro.checklist.contratos', title: 'Conheça seus contratos', section: 'contratos', evento: 'aba:contratos' },
    { key: 'parceiro.checklist.abrir-contrato', title: 'Abra um contrato', section: 'contratos', evento: 'acao:abriu-contrato' },
    { key: 'parceiro.checklist.enviar-documento', title: 'Envie um documento', section: 'documentos', evento: 'acao:enviou-documento' },
    { key: 'parceiro.checklist.solicitacao', title: 'Abra uma solicitação', section: 'solicitacoes', evento: 'acao:abriu-solicitacao' },
    { key: 'parceiro.checklist.financeiro', title: 'Veja o Financeiro', section: 'financeiro', evento: 'aba:financeiro' },
  ],
  fornecedor: [
    { key: 'fornecedor.checklist.pedidos', title: 'Veja seus pedidos', section: 'orders', evento: 'aba:orders' },
    { key: 'fornecedor.checklist.cotacao', title: 'Responda uma cotação', section: 'quotations', evento: 'acao:respondeu-cotacao' },
    { key: 'fornecedor.checklist.logistica', title: 'Atualize a logística de um pedido', section: 'orders', evento: 'acao:atualizou-logistica' },
    { key: 'fornecedor.checklist.nota-fiscal', title: 'Envie uma nota fiscal', section: 'documents', evento: 'acao:enviou-nf' },
    { key: 'fornecedor.checklist.financeiro', title: 'Veja o Financeiro', section: 'financeiro', evento: 'aba:financeiro' },
  ],
  corretor: [
    { key: 'corretor.checklist.estoque', title: 'Veja o estoque', section: 'estoque', evento: 'aba:estoque' },
    { key: 'corretor.checklist.empreendimentos', title: 'Conheça os empreendimentos', section: 'empreendimentos', evento: 'aba:empreendimentos' },
    { key: 'corretor.checklist.proposta', title: 'Envie uma proposta', section: 'propostas', evento: 'acao:enviou-proposta' },
    { key: 'corretor.checklist.lead', title: 'Cadastre um lead', section: 'leads', evento: 'acao:criou-lead' },
    { key: 'corretor.checklist.material', title: 'Baixe um material', section: 'materiais', evento: 'acao:baixou-material' },
  ],
  cliente: [
    { key: 'cliente.checklist.obra', title: 'Acompanhe a obra', section: 'obra', evento: 'aba:obra' },
    { key: 'cliente.checklist.documentos', title: 'Veja seus documentos', section: 'documentos', evento: 'aba:documentos' },
    { key: 'cliente.checklist.baixar-documento', title: 'Baixe um documento', section: 'documentos', evento: 'acao:baixou-documento' },
    { key: 'cliente.checklist.financeiro', title: 'Confira o Financeiro', section: 'financeiro', evento: 'aba:financeiro' },
    { key: 'cliente.checklist.chamado', title: 'Abra um chamado de manutenção', section: 'manutencao', evento: 'acao:abriu-chamado' },
    { key: 'cliente.checklist.condominio', title: 'Leia os avisos do condomínio', section: 'condominio.avisos', evento: 'aba:condominio.avisos' },
    { key: 'cliente.checklist.rateio', title: 'Confira o rateio do condomínio', section: 'condominio.financeiro', evento: 'aba:condominio.financeiro' },
  ],
};

/** Compat: o tour do portal (geral). */
export const TOUR_STEPS: Record<Portal, TourStep[]> = {
  parceiro: TOURS.parceiro.geral,
  fornecedor: TOURS.fornecedor.geral,
  corretor: TOURS.corretor.geral,
  cliente: TOURS.cliente.geral,
  treinamentos: TOURS.treinamentos.geral,
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

export interface AncoraDoTour {
  anchor: string;
  /** o que o gestor lê no seletor */
  label: string;
  /** aba onde o elemento está; null = cromo (menu, ajuda, conta) */
  section: string | null;
}

const ANCORAS_DE_CROMO: Record<string, string> = {
  menu: 'Menu do portal',
  ajuda: 'Botão de ajuda (?)',
  conta: 'Menu da conta',
  'mobile-mais': 'Botão "Mais" (celular)',
};

/**
 * Catálogo de elementos que um passo PRÓPRIO pode realçar. Só entra o que
 * existe de verdade nos portais: as âncoras dos passos padrão (o teste de
 * âncoras garante que estão no DOM) e o botão de cada aba. A construtora
 * escolhe daqui — nunca digita um `data-tour`.
 */
export function ancorasDoTour(portal: Portal): AncoraDoTour[] {
  const vistas = new Map<string, AncoraDoTour>();
  for (const passo of todosOsPassos(portal)) {
    if (vistas.has(passo.anchor) || passo.anchor.startsWith('aba-')) continue;
    const label = ANCORAS_DE_CROMO[passo.anchor] ?? passo.title;
    vistas.set(passo.anchor, { anchor: passo.anchor, label, section: passo.section });
  }
  for (const aba of PORTAL_SECTIONS[portal]) {
    vistas.set(`aba-${aba.id}`, { anchor: `aba-${aba.id}`, label: `Botão da aba ${aba.label}`, section: aba.id });
  }
  const ordemDaSecao = (sec: string | null) => sec === null ? -1 : PORTAL_SECTIONS[portal].findIndex(x => x.id === sec);
  return [...vistas.values()].sort((a, b) =>
    ordemDaSecao(a.section) - ordemDaSecao(b.section) || a.label.localeCompare(b.label, 'pt-BR'));
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
  /** só kind=tour: `data-tour` do passo próprio */
  anchor?: string | null;
  /** só kind=tour: null = tour do portal; id da aba = mini-tour */
  tour_id?: string | null;
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

export interface MergedTourStep extends Omit<TourStep, 'key'> {
  /** chave do passo padrão; null = passo próprio da construtora */
  key: string | null;
  rowId: string | null;
  /** 'personalizado' só quando o TEXTO (ou a visibilidade) mudou — mover não personaliza */
  origin: HelpOrigin;
  hidden: boolean;
  /** posição efetiva no tour (padrão = (i+1)*10; sobrescrita/próprio podem mudar) */
  sort_order: number;
}

export interface MergedChecklistItem extends ChecklistItem {
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
  /** itens do checklist "Primeiros passos" (só abas liberadas) */
  checklist: MergedChecklistItem[];
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
    if (r.kind !== 'artigo' && r.kind !== 'faq') return;
    itens.push({
      key: null, rowId: r.id, kind: r.kind, section: r.section,
      title: r.title, body_html: r.body_html, origin: 'proprio',
      sort_order: r.sort_order || 1000 + i,
    });
  });

  const ordenar = (a: HelpItem, b: HelpItem) => a.sort_order - b.sort_order;
  const filtrar = (it: HelpItem) => visivel(it.section, opts.visibleSections);

  // Tours: padrão (código) + sobrescritas (texto/oculto/posição) + passos
  // próprios (linha kind='tour' sem default_key, com âncora).
  const juntarPasso = (s: TourStep, i: number): MergedTourStep => {
    const o = porChave.get(s.key);
    const titulo = o ? o.title : s.title;
    const corpo = o ? htmlToText(o.body_html) || o.body_html : s.body;
    const hidden = !!o && !o.is_published;
    return {
      ...s,
      title: titulo,
      body: corpo,
      rowId: o?.id ?? null,
      origin: o && (hidden || titulo !== s.title || corpo !== s.body) ? 'personalizado' : 'padrao',
      hidden,
      sort_order: o && o.sort_order > 0 ? o.sort_order : (i + 1) * 10,
    };
  };
  const passoEntra = (s: MergedTourStep) => (opts.includeHidden || !s.hidden) && visivel(s.section, opts.visibleSections);

  const porTour = new Map<TourId, { passo: MergedTourStep; decl: number }[]>();
  const pôr = (t: TourId, passo: MergedTourStep, decl: number) => {
    porTour.set(t, [...(porTour.get(t) ?? []), { passo, decl }]);
  };
  TOURS[portal].geral.forEach((x, i) => pôr('geral', juntarPasso(x, i), i));
  for (const [aba, passos] of Object.entries(TOURS[portal].porAba)) {
    (passos ?? []).forEach((x, i) => pôr(aba, juntarPasso(x, i), i));
  }
  proprios.filter(r => r.kind === 'tour' && r.anchor).forEach((r, i) => {
    const t = r.tour_id || 'geral';
    pôr(t, {
      key: null, rowId: r.id, anchor: r.anchor!, section: r.section, tour: t,
      title: r.title, body: htmlToText(r.body_html) || r.body_html,
      origin: 'proprio', hidden: !r.is_published,
      sort_order: r.sort_order > 0 ? r.sort_order : 100000 + i,
    }, 100000 + i);
  });

  const tours: Record<TourId, MergedTourStep[]> = { geral: [] };
  for (const [t, lista] of porTour) {
    if (t !== 'geral' && !visivel(t, opts.visibleSections)) continue;
    const ordenada = [...lista]
      .sort((a, b) => a.passo.sort_order - b.passo.sort_order || a.decl - b.decl)
      .map(x => x.passo)
      .filter(passoEntra);
    if (t === 'geral' || ordenada.length > 0) tours[t] = ordenada;
  }

  return {
    articles: itens.filter(i => i.kind === 'artigo').filter(filtrar).sort(ordenar),
    faqs: itens.filter(i => i.kind === 'faq').filter(filtrar).sort(ordenar),
    tour: tours.geral,
    checklist: CHECKLIST_ITEMS[portal]
      .map((c): MergedChecklistItem => {
        const o = porChave.get(c.key);
        const titulo = o?.title || c.title;
        const hidden = !!o && !o.is_published;
        return { ...c, title: titulo, rowId: o?.id ?? null, hidden, origin: o && (hidden || titulo !== c.title) ? 'personalizado' : 'padrao' };
      })
      .filter(c => (opts.includeHidden || !c.hidden) && visivel(c.section, opts.visibleSections)),
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
