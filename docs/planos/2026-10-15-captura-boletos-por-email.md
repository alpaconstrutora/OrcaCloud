# Captura Automática de Boletos por E-mail

## Pedido original

> avalie

> Sessão: e2e77851-8821-4e81-bd89-3c55afa48fc8 · 15/10/2026
>
> Anexo da mensagem, transcrito literalmente (`OPURA_PRD_Captura_Automatica_Boletos_v1.1.md`):

> # ÒPURA — PRD Técnico e Plano de Implementação
>
> **Funcionalidade:** Captura Automática de Boletos por E-mail  
> **Módulo:** Financeiro → Contas a Pagar → Boletos a Pagar → Captura Automática  
> **Versão:** 1.1 (consolidada, incluindo Remetentes Monitorados)  
> **Data:** 15/10/2026  
> **Volume inicial:** menos de 100 boletos por mês  
> **Estado:** especificação para implementação
>
> ## 1. Visão geral
>
> Desenvolver funcionalidade nativa do ÒPURA capaz de conectar contas de e-mail autorizadas, identificar mensagens com boletos, extrair e validar dados e encaminhar documentos para **Financeiro → Contas a Pagar → Boletos a Pagar**. O MVP deverá ter baixo custo operacional, usar a infraestrutura existente e ser preparado para expansão multiempresa e SaaS.
>
> ### 1.1 Objetivos
>
> - Eliminar a consulta manual a e-mails para localizar boletos.
> - Reduzir digitação e cadastro manual de contas a pagar.
> - Evitar duplicidades, lançamentos incorretos e cobranças suspeitas.
> - Centralizar documentos e rastreabilidade no ÒPURA.
> - Preservar a relação entre e-mail, anexo, fornecedor e título financeiro.
> - Utilizar bibliotecas gratuitas e infraestrutura já contratada sempre que viável.
>
> ### 1.2 Indicadores e metas iniciais
>
> | Indicador | Meta |
> |---|---|
> | Captura de boletos elegíveis | ≥ 98% |
> | Extração correta dos campos obrigatórios | ≥ 95% |
> | Duplicidades não detectadas | Zero nos cenários homologados |
> | Intervalo de sincronização | 15 minutos |
> | Disponibilidade mensal | ≥ 99% |
> | Títulos importados sem autorizar pagamentos | 100% |
> | Custo incremental de infraestrutura | Próximo de R$ 0, sujeito à capacidade disponível |
>
> As metas serão verificadas em piloto com documentos reais e não representam garantias prévias.
>
> ## 2. Escopo do MVP
>
> | Recurso | Fase |
> |---|---|
> | Gmail OAuth 2.0 | MVP |
> | Múltiplas contas de e-mail | MVP |
> | Sincronização periódica de 15 minutos | MVP |
> | Busca retroativa por período | MVP |
> | Cadastro de remetentes favoritos/monitorados | MVP |
> | Regras por endereço, domínio e palavras-chave | MVP |
> | Listas de remetentes permitidos e bloqueados | MVP |
> | Captura de PDFs anexados | MVP |
> | Extração de texto nativo de PDF | MVP |
> | OCR local de documentos digitalizados | MVP |
> | Leitura de linha digitável e código de barras | MVP |
> | Extração de beneficiário, valor, vencimento e demais campos | MVP |
> | Identificação de fornecedor | MVP |
> | Detecção de duplicidades | MVP |
> | Validação de cobrança e sinais de fraude | MVP |
> | Importação de títulos para Contas a Pagar | MVP |
> | Caixa de revisão | MVP |
> | Histórico, auditoria e reprocessamento | MVP |
> | Classificação por organização, obra e centro de custo | MVP |
> | Microsoft 365/Outlook | Fase 2 |
> | Conciliação automática com NF-e, pedidos e contratos | Fase 2 |
> | IA generativa como fallback de interpretação | Fase 2 |
> | Captura de cobranças Pix e outros documentos financeiros | Evolução |
> | Pagamento automático | Fora do escopo |
>
> ## 3. Fluxo funcional e estados
>
> 1. Conectar e autorizar a conta Gmail.
> 2. Sincronizar mensagens e anexos, com filtros configuráveis.
> 3. Classificar os documentos elegíveis.
> 4. Extrair dados por parser PDF, leitura de código e OCR, quando necessário.
> 5. Validar estrutura bancária, fornecedor, beneficiário, valor, vencimento e duplicidade.
> 6. Aplicar política de automação conforme remetente e risco.
> 7. Importar título financeiro como pendente de aprovação ou enviar para revisão.
> 8. Preservar histórico, vínculo com o e-mail e trilha de auditoria.
>
> **Fluxo principal de estados:** `RECEIVED → CLASSIFIED → EXTRACTED → VALIDATED → IMPORTED`.
>
> **Estados alternativos:** `REVIEW_REQUIRED`, `DUPLICATE`, `REJECTED`, `FAILED`, `RETRY_PENDING`.
>
> O estado do documento é independente do status do título financeiro. Não importar automaticamente documentos com dados obrigatórios ausentes, inconsistentes ou suspeitos.
>
> ## 4. Requisitos funcionais
>
> ### RF-01 — Gerenciamento de contas de e-mail
>
> - Conectar uma ou mais contas Gmail por OAuth 2.0, sem armazenar senha.
> - Exibir nome, organização, status, última sincronização, início da captura e quantidade de mensagens processadas.
> - Permitir conectar, desconectar, pausar, reativar e sincronizar manualmente.
> - Utilizar escopos mínimos e proteger tokens; tratar expiração e revogação.
>
> ### RF-02 — Monitoramento e filtros
>
> - Sincronização a cada 15 minutos; futura parametrização.
> - Filtros por remetente, assunto, período, presença de anexos PDF, palavras-chave e marcadores Gmail.
> - Listas de remetentes permitidos e bloqueados.
> - Não depender exclusivamente das palavras “boleto”, “cobrança” ou “vencimento”, pois assuntos podem ser genéricos.
> - Permitir busca retroativa por período sem criar títulos duplicados.
>
> ### RF-03 — Processamento de documentos
>
> 1. Baixar o anexo com segurança.
> 2. Verificar formato real, tamanho e integridade.
> 3. Calcular SHA-256 do arquivo.
> 4. Extrair texto nativo do PDF.
> 5. Ler linha digitável e códigos de barras.
> 6. Acionar OCR local apenas quando necessário.
> 7. Normalizar dados para o modelo financeiro existente.
> 8. Processar múltiplos anexos de um mesmo e-mail individualmente.
> 9. Reconhecer o mesmo documento reenviado por remetentes diferentes.
>
> ### RF-04 — Extração de dados
>
> | Campo | Regra |
> |---|---|
> | Linha digitável ou código de barras válido | Obrigatório para importação automática |
> | Valor nominal | Obrigatório |
> | Vencimento | Obrigatório |
> | Beneficiário | Obrigatório |
> | CPF/CNPJ do beneficiário | Obrigatório para importação automática |
> | Pagador e CPF/CNPJ | Quando disponível |
> | Número do documento | Quando disponível |
> | Nosso número | Quando disponível |
> | Banco emissor | Quando identificável |
> | Juros, multa e descontos | Quando disponíveis |
> | E-mail e remetente original | Obrigatório |
> | Arquivo original | Obrigatório |
>
> Diferenciar valor nominal, valor codificado na linha digitável e valor atualizado; não pressupor igualdade entre eles.
>
> ### RF-05 — Identificação do fornecedor
>
> - Procurar fornecedor cadastrado por CPF/CNPJ do beneficiário.
> - Vincular automaticamente somente quando houver correspondência segura.
> - Encaminhar fornecedores não encontrados à revisão.
> - Permitir selecionar fornecedor existente ou iniciar cadastro.
> - Não criar fornecedor definitivo somente a partir de PDF.
>
> ### RF-06 — Antiduplicidade
>
> Verificar em camadas: identificador de mensagem/anexo, SHA-256, linha digitável normalizada, beneficiário + nosso número + valor + vencimento e títulos já cadastrados manualmente. Garantir idempotência na importação e no reprocessamento, inclusive sob concorrência.
>
> ### RF-07 — Integração com Contas a Pagar
>
> Usar o serviço financeiro já existente para criar títulos contendo organização, fornecedor, documento, valor, vencimento, categoria financeira, centro de custo, obra, origem da captura, arquivo e status. Estado inicial recomendado: `PENDENTE_APROVACAO`, ou equivalente do módulo. A criação deverá ser transacional e idempotente. **Importar não autoriza nem executa pagamento.**
>
> ### RF-08 — Caixa de revisão
>
> - Exibir PDF original lado a lado com dados extraídos.
> - Permitir corrigir campos, vincular fornecedor, importar, rejeitar e reprocessar.
> - Registrar usuário, data, valor anterior e novo valor.
> - Em mobile, substituir visualização lado a lado por abas.
> - Oferecer ação “Adicionar aos favoritos” diretamente na revisão.
>
> ### RF-09 — Auditoria
>
> Registrar conexão, sincronização, recebimento, extração, validação, correção, importação, rejeição e reprocessamento. Permitir rastrear título até mensagem e anexo originais.
>
> ### RF-10 — Cadastro de Remetentes Monitorados (favoritos)
>
> **Local:** Financeiro → Boletos a Pagar → Captura Automática → Remetentes Monitorados.
>
> O sistema permitirá cadastrar fornecedores e endereços de e-mail para monitoramento prioritário.
>
> **Campos do cadastro:**
>
> | Campo | Descrição |
> |---|---|
> | Fornecedor | Vínculo opcional com cadastro existente |
> | Nome do remetente | Nome amigável |
> | E-mail | Ex.: financeiro@fornecedor.com.br |
> | Domínio | Ex.: fornecedor.com.br |
> | Conta monitorada | Caixa Gmail na qual procurar mensagens |
> | Tipo de monitoramento | Endereço exato ou domínio |
> | Palavras-chave | Boleto, cobrança, fatura etc. |
> | Capturar anexos | PDF e imagens, conforme suporte do processador |
> | Data inicial | Busca retroativa |
> | Importação | Automática ou mediante revisão |
> | Status | Ativo ou inativo |
>
> **Modalidades:**
>
> 1. **Somente favoritos:** processar boletos apenas de remetentes cadastrados.
> 2. **Todos os remetentes:** analisar todas as mensagens elegíveis e usar favoritos para priorizar/classificar.
> 3. **Híbrido (recomendado):** permitir importação automática dos documentos válidos de favoritos que passem todas as validações; encaminhar remetentes desconhecidos para revisão.
>
> **Regras complementares:**
>
> - Um fornecedor poderá ter vários e-mails cadastrados.
> - Permitir regras por domínio, com confirmação adicional e menor confiança que endereço específico.
> - Permitir ativar, desativar e excluir entradas, respeitando histórico/auditoria.
> - Permitir adicionar remetente diretamente da Caixa de Revisão.
> - Remetente favorito **não** torna boleto confiável: validar beneficiário, valor, linha digitável, duplicidade e sinais de autenticação da mensagem quando disponíveis.
> - As regras de favoritos deverão respeitar isolamento por organização e conta de e-mail.
>
> ## 5. Políticas de automação
>
> **Modo automático:** captura, valida e cadastra títulos que satisfaçam todas as regras, mantendo aprovação financeira separada.
>
> **Modo semiautomático:** captura e extrai dados, mas exige conferência antes de importar.
>
> **Modo manual assistido:** lista documentos identificados para seleção e importação.
>
> **Recomendação inicial:** modo híbrido por remetente, com revisão obrigatória para novos fornecedores, divergência de beneficiário/valor, dados incompletos ou indícios de fraude. Durante o piloto, operar inicialmente sem importação automática.
>
> ## 6. Arquitetura técnica
>
> **Pipeline:** `Gmail API → Sync Worker → Document Processing Worker → Validation Engine → Supabase + Serviços Financeiros ÒPURA`.
>
> | Componente | Tecnologia sugerida |
> |---|---|
> | Frontend | React + TypeScript |
> | Backend | Serviços existentes do ÒPURA |
> | Banco | Supabase PostgreSQL |
> | Arquivos | Supabase Storage privado |
> | Gmail | OAuth 2.0 + Gmail API |
> | Agendamento | Supabase Cron ou scheduler existente |
> | PDF | pdf-parse / PDF.js |
> | OCR | Tesseract |
> | Código de barras | ZXing |
> | Validação | Motor próprio conforme padrões bancários aplicáveis |
> | Fila | PostgreSQL/jobs ou fila existente |
> | Auditoria | Eventos persistidos no PostgreSQL |
>
> Não executar necessariamente OCR pesado dentro de Edge Functions. Usar worker dedicado para evitar limites de memória e tempo; inicialmente um worker leve e sequencial pode ser suficiente.
>
> ### 6.1 Modelo de dados
>
> | Tabela | Responsabilidade |
> |---|---|
> | `email_capture_accounts` | Contas conectadas |
> | `email_capture_rules` | Filtros e regras de captura |
> | `email_capture_messages` | Metadados das mensagens |
> | `email_capture_documents` | Documentos e extrações |
> | `email_capture_jobs` | Fila e tentativas |
> | `email_capture_events` | Auditoria |
> | `email_capture_supplier_rules` | Regras recorrentes por fornecedor |
> | `email_capture_senders` | Favoritos/remetentes monitorados |
>
> Campos estruturais recomendados: `id`, `organization_id`, `created_at`, `updated_at`, `created_by` e campos específicos. Em `email_capture_documents`:
>
> ```sql
> id
> organization_id
> email_message_id
> storage_path
> file_sha256
> document_type
> processing_status
> extracted_data_json
> validation_results_json
> beneficiary_tax_id
> barcode
> digitable_line
> nominal_amount
> due_date
> supplier_id
> payable_id
> reviewed_by
> reviewed_at
> created_at
> updated_at
> ```
>
> Utilizar `NUMERIC` para valores financeiros, não ponto flutuante. Aplicar políticas de acesso, retenção e RLS. O título existente em Contas a Pagar permanece a fonte oficial; a captura guarda origem e processamento.
>
> ### 6.2 Endpoints sugeridos
>
> | Endpoint | Função |
> |---|---|
> | `POST /email-capture/accounts/connect` | Iniciar OAuth |
> | `GET /email-capture/accounts` | Listar conexões |
> | `POST /email-capture/accounts/:id/sync` | Sincronizar manualmente |
> | `PATCH /email-capture/accounts/:id` | Alterar configuração |
> | `GET /email-capture/documents` | Listar documentos |
> | `GET /email-capture/documents/:id` | Consultar extração |
> | `POST /email-capture/documents/:id/reprocess` | Reprocessar |
> | `POST /email-capture/documents/:id/import` | Criar título |
> | `POST /email-capture/documents/:id/reject` | Rejeitar |
> | `GET /email-capture/metrics` | Indicadores |
>
> Complementar endpoints CRUD de `email_capture_senders` e gerenciamento das políticas de favoritos. Todos exigem autenticação, autorização e segregação por organização.
>
> ## 7. Segurança e antifraude
>
> | Verificação | Ação |
> |---|---|
> | Dígitos verificadores inválidos | Bloquear importação automática |
> | Valor codificado diferente do impresso | Revisar |
> | CPF/CNPJ do beneficiário | Conferir com fornecedor |
> | Beneficiário divergente | Revisar |
> | Título existente | Bloquear duplicidade |
> | Fornecedor desconhecido | Revisar |
> | Mudança de beneficiário habitual | Alertar |
> | Vencimento não confiável | Revisar |
> | Arquivo inválido/suspeito | Rejeitar ou colocar em quarentena |
>
> A consistência matemática da linha digitável **não prova legitimidade**. Consulta à cobrança registrada, quando disponibilizada por banco/parceiro autorizado, é evolução futura.
>
> Controles adicionais: criptografia de tokens OAuth, RLS por organização, Storage privado, URLs temporárias autorizadas, sanitização e proteção contra arquivos maliciosos, escopos mínimos Gmail, logs sem segredos, política LGPD e separação entre importação, aprovação e pagamento.
>
> ## 8. Interface UI/UX
>
> **Navegação:** Financeiro → Contas a Pagar → Boletos a Pagar → Captura Automática.
>
> **Abas principais:** Caixa de Entrada, Histórico, Contas Conectadas e Configurações. Incluir seção ou subaba **Remetentes Monitorados** para favoritos.
>
> **Indicadores sugeridos:** capturados, importados, em revisão, duplicados, com alerta, falhas.
>
> **Caixa de Entrada:** priorizar documentos que exigem intervenção; importados automaticamente vão para histórico e financeiro. Revisão com PDF à esquerda e campos à direita (mobile em abas). Filtros por organização, conta, fornecedor, período, status, valor e vencimento.
>
> **Remetentes Monitorados:** listagem com nome, e-mail, fornecedor, conta, modalidade, status, ações de adicionar/editar/ativar/desativar/excluir. Disponibilizar botão “Adicionar aos favoritos” na revisão.
>
> **Exemplo ilustrativo de cadastro:**
>
> | Fornecedor | Remetente | Status |
> |---|---|---|
> | Fornecedor ABC | financeiro@fornecedorabc.com.br | Ativo |
> | Materiais Silva | cobranca@materiaissilva.com.br | Ativo |
>
> Dados ilustrativos, não representam contas conectadas.
>
> ## 9. Plano de implementação
>
> | Etapa | Duração estimada | Entregas |
> |---|---|---|
> | 1. Preparação/modelagem | 1–2 dias | Mapear Contas a Pagar, tabelas, RLS, estados e contratos |
> | 2. Integração Gmail | 2–4 dias | OAuth, sincronização incremental, anexos, checkpoints e retentativas |
> | 3. Motor de leitura | 3–5 dias | PDF, linha digitável, OCR, normalização e dígitos |
> | 4. Validação/financeiro | 2–4 dias | Fornecedor, duplicidade, títulos, revisão e auditoria |
> | 5. Interface | 2–3 dias | Caixa de Entrada, visualizador, histórico, filtros, contas e favoritos |
> | 6. Testes/homologação | 3–5 dias | Documentos reais, segurança, erros, reprocessamento e piloto |
>
> **Estimativa:** 13–23 dias úteis para desenvolvedor familiarizado com o ÒPURA; não inclui eventual espera por verificação OAuth do Google ou alterações extensas no financeiro. O cadastro de favoritos deverá ser incluído no planejamento detalhado e pode alterar o esforço após refinamento.
>
> ## 10. Critérios de aceite
>
> - [ ] Conectar Gmail via OAuth e sincronizar mensagens autorizadas.
> - [ ] Capturar e processar vários anexos de uma mesma mensagem.
> - [ ] Extrair valor, vencimento e linha digitável de PDF textual.
> - [ ] Processar PDF digitalizado com OCR local.
> - [ ] Bloquear linha digitável com dígitos inválidos.
> - [ ] Detectar duplicidade inclusive contra títulos manuais.
> - [ ] Enviar inconsistências à revisão sem lançamento automático.
> - [ ] Criar título válido com vínculo ao fornecedor e arquivo original.
> - [ ] Reprocessar sem duplicar lançamentos.
> - [ ] Impedir acesso entre organizações.
> - [ ] Manter auditoria e tratamento de falhas recuperáveis.
> - [ ] Garantir que importação não autorize nem execute pagamento.
> - [ ] Cadastrar, editar, ativar, desativar e excluir remetentes favoritos.
> - [ ] Vincular múltiplos endereços a um fornecedor.
> - [ ] Filtrar por endereço exato, domínio e conta monitorada.
> - [ ] Operar modos somente favoritos, todos e híbrido.
> - [ ] Adicionar remetente aos favoritos pela Caixa de Revisão.
> - [ ] Exigir validação antifraude mesmo para remetente favorito.
>
> ## 11. Riscos e mitigação
>
> | Risco | Mitigação |
> |---|---|
> | OAuth revogado/expirado | Reconexão assistida e alertas |
> | OCR incorreto | Validação e revisão |
> | Boleto fraudulento | Conferência de beneficiário e aprovação |
> | Sincronização interrompida | Checkpoints e retentativas |
> | Duplicidade concorrente | Idempotência e constraints |
> | Vazamento de documento | Storage privado, RLS e URLs temporárias |
> | Aumento de volume | Workers e filas desacoplados |
> | Domínio favorito abrangente | Confirmação adicional e regras de confiança |
>
> ## 12. Estratégia de implantação
>
> Iniciar com uma conta Gmail e uma organização. Nos primeiros dias, operar em modo supervisionado, sem importação automática. Testar boletos reais já conferidos para medir precisão, segurança e duplicidade. Depois, liberar importação automática apenas para documentos que passem todas as regras, especialmente de remetentes favoritos confiáveis. Expandir posteriormente para múltiplas organizações, Microsoft 365 e IA seletiva.
>
> ## 13. Custos e dimensionamento
>
> **Premissa:** menos de 100 boletos/mês, com infraestrutura ÒPURA/Supabase existente e capacidade ociosa suficiente.
>
> | Componente | Custo adicional esperado |
> |---|---|
> | Gmail API | Normalmente sem cobrança por chamada dentro das condições/cotas aplicáveis |
> | Leitura de PDF | Sem licença, com bibliotecas open source |
> | Código de barras | Sem licença, com bibliotecas open source |
> | Tesseract | Sem licença de OCR |
> | Duplicidade e cadastro financeiro | Sem licença adicional, usando sistema existente |
> | Supabase e worker | Pode ser zero incremental se couber no plano/infraestrutura |
> | IA externa | Não necessária no MVP |
>
> **Estimativa ilustrativa anterior para 100 boletos/mês:** R$ 0–10 sem IA externa; R$ 1–15 com IA seletiva. Não é cotação nem garantia. Não inclui desenvolvimento, manutenção, licença do provedor de e-mail ou ampliação de infraestrutura. Cotas e condições dos provedores devem ser verificadas antes da implantação.
>
> Para esse volume, não há justificativa inicial para contratar plataforma externa especializada. O maior investimento é desenvolvimento e validação antifraude, não leitura de PDFs.
>
> ## 14. Integrações futuras
>
> - **Suprimentos:** pedidos e contratos.
> - **Fiscal:** NF-e/NFS-e.
> - **Obras:** classificação por obra e centro de custo.
> - **GED:** arquivamento e vínculo com mensagem original.
> - **Financeiro:** aprovação, pagamento e conciliação bancária.
> - **Expansão:** Microsoft Graph, IMAP, cobranças Pix, faturas, recibos, IA seletiva e verificação bancária quando disponível.
>
> ## 15. Princípios e decisões finais
>
> 1. Reutilizar serviços, cadastros, autenticação e armazenamento existentes.
> 2. Não criar um segundo cadastro oficial de contas a pagar.
> 3. Manter Caixa de Entrada Financeira separada dos títulos efetivamente lançados.
> 4. Não depender de IA ou OCR pagos no fluxo principal.
> 5. Preservar rastreabilidade e segregação por organização.
> 6. Não confundir captura/importação com autorização de pagamento.
> 7. Projetar conectores e motor de processamento de modo desacoplado para expansão.
> 8. Incluir favoritos/remetentes monitorados desde o MVP, com modalidade híbrida como padrão recomendado.
>
> **Ordem recomendada de execução:** modelagem e contrato de integração com Contas a Pagar → Gmail OAuth/sincronização → cadastro de favoritos e filtros → extração/validação → importação e revisão → interface → testes/piloto.
>
> ---
>
> **Fim do PRD consolidado v1.1.**

Depois da avaliação (Parte 1), o usuário respondeu às perguntas da tabela de decisões e aprovou o
plano da Parte 2 em 15/10/2026.

### Pedido posterior — 15/10/2026, mesma sessão (senha de PDF)

Contexto: a primeira leitura real da caixa `alpaconstrutora@gmail.com` criou o boleto nº 1423 (Energisa,
"ESS - Reaviso Digital") sem valor nem vencimento. O PDF é criptografado (`/Encrypt`; o leitor recebe
`PasswordException: No password given`), e o aviso gravado dizia "PDF sem camada de texto" — errado.
Propus duas melhorias; resposta do usuário, literal:

> Duas melhorias que proponho, sob sua decisão:
> 1. Aviso correto (pequena): de acordo
> 2. Senha por remetente (maior): criar campo para cadastro de senha
> 3

(O "3" veio solto; tratado como mensagem cortada e perguntado ao usuário.)

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 15/10/2026 | Como as mensagens entram (Gmail OAuth Internal / External / IMAP / encaminhamento)? | Gmail OAuth app Internal |
| 15/10/2026 | O MX de alpaconstrutora.com.br é Hostinger (sem Workspace). Onde fica a caixa? | Conta Gmail comum (@gmail.com) → **IMAP com senha de app** (Internal impossível; External exige verificação do Google) |
| 15/10/2026 | PDF escaneado no MVP? | Vai para revisão manual (sem Tesseract/worker) |
| 15/10/2026 | Incluir as 4 correções do módulo atual? | Sim, as 4 |
| 15/10/2026 | Reescrever como v1.2 em cima do módulo existente ou manter 8 tabelas? | Reescrever v1.2 em cima do existente |

### Ajuste de implementação — 15/10/2026

Item 1.4(c) do plano dizia que `uploadBoleto` gravaria `revisao` quando faltasse vencimento. Lido o
código: o formulário manual sobe o arquivo e **logo em seguida** grava o vencimento digitado
(`associar`), então o boleto ficaria preso em `revisao` mesmo com vencimento preenchido. A trava
passou para onde ela não falha: `aprovarECriarInvoice` recusa sem vencimento, o botão "Aprovar e
Lançar" fica desabilitado dizendo por quê, e o conector de e-mail (que não tem ninguém olhando) grava
`revisao`. O efeito pedido — nenhum título nasce com `transaction_date = hoje` — é o mesmo.

Também: as colunas novas de `boletos` (`origem`, `email_message_id`, `nosso_numero`) só entram nos
`select` do front **depois** de a migration 2.1 estar aplicada no banco — select de coluna inexistente
derruba a tela inteira com 42703.

## Parte 1 — Avaliação do PRD

**Veredito:** o PRD desenha um módulo paralelo (8 tabelas, estados próprios, caixa de revisão, dedup e
auditoria próprias) para algo que o módulo **Boletos a Pagar já tem em ~80%**. A tabela
`email_capture_documents` repete coluna a coluna a `boletos` existente — é o "segundo cadastro" que o
próprio PRD proíbe (§15.2). O que falta de verdade: **entrada por e-mail** e **extração no servidor**.

### 1.1 Já existe (reutilizar, não reconstruir)

| PRD | Existe em `origin/main` | Evidência |
|---|---|---|
| Texto nativo de PDF | `boletoParser.extractFromPdfFile` (pdfjs no navegador) | `utils/boletoParser.ts:78-106,260-333` |
| Linha digitável/código de barras, DV mod10/mod11, 47/48 dígitos | `febrabanRules.ts` (25 testes, zero imports) | `utils/febrabanRules.ts:53-92,339,379-468` |
| Valor, vencimento, banco, CNPJ/nome do beneficiário, multa/juros | idem, com `confidence_score` | `boletoParser.ts:121-202,232-237,305-322` |
| SHA-256 + idempotência | `UNIQUE (organization_id, documento_hash)` | `boletoService.ts:224-240`; `20260515000000:74-75` |
| Dedup por linha digitável | índice único parcial `boletos_org_linha_digitavel_uq` | `aplicar_20270919000018:240-242` |
| Fornecedor por CNPJ, sem criar fornecedor do PDF | `sugerirFornecedor` grava sugestão; usuário confirma | `boletoService.ts:756-775`; `BoletoFormModal.tsx:168-201` |
| PDF à esquerda × campos à direita, mobile empilhado | `lg:grid-cols-2` com iframe | `BoletoFormModal.tsx:913-1018` |
| Auditoria por campo (antes/depois/usuário) | `boletos_auditoria` + `registrarAuditoria`; `listAuditoria` existe e **nenhuma tela chama** | `20260515000000:103-114`; `boletoService.ts:184-202,857-865` |
| Importado pendente de aprovação, sem pagar | `aprovarECriarInvoice` → título PENDING + alçada `approval_status` | `boletoService.ts:504-711`; `financialApprovalService.ts:91-98` |
| Status de revisão | `revisao` no CHECK e na UI — **ninguém o usa hoje** | `types/boletos.ts:1-7`; `BoletoManager.tsx:887,1121-1136` |
| Vários anexos | `BoletoLoteModal` (fila sequencial) | `components/BoletoLoteModal.tsx:95-152` |
| Cron autenticado | `pg_cron` + `net.http_post` + `fn_cron_secret()` (Vault) + `chamadaDeCron` | `aplicar_20270918000023:40-72,85`; `_shared/auth.ts:215-230` |
| Edge Function importando utils do front sem bundle | `reconciliation-engine` importa `../../../utils/reconciliationRules.ts` | `reconciliation-engine/index.ts:11-27` |
| OCR por IA (PRD: Fase 2) | precedente `read-matricula` (PDF/imagem → Anthropic; 503 `SEM_CHAVE`) | `read-matricula/index.ts:99-117` |

### 1.2 Não existe (escopo real)
OAuth/Gmail/IMAP/e-mail de entrada (zero no repo; e-mail é só saída via Resend) · segredo por
conta no Vault (só há segredos globais) · extração no servidor · remetentes monitorados · `nosso_numero`
· dedup contra títulos manuais (só dá para **alertar**, nunca bloquear: `aplicar_20270919000018:132-133`)
· DV de CNPJ (`lib/validators.ts` só tem CPF) · tela de auditoria.

### 1.3 Conflitos com o produto real
1. `PENDENTE_APROVACAO` não existe. Vocabulário real: boleto `rascunho/revisao` → "Aprovar e Lançar"
   cria o título; alçada grava `approval_status` (`RASCUNHO|PENDENTE|APROVADO|REJEITADO`), com
   `semFaixa:'liberar'`. Decisão em `docs/planos/2026-08-15-boleto-para-contas-a-pagar-4-defeitos.md:69-84`.
2. Importação automática = `aprovarECriarInvoice`, que **exige `supplier_id`** (`:512-514`) → só
   automática quando o CNPJ casou com fornecedor da org.
3. Máquina de estados do §3 é redundante: `RECEIVED` = linha de mensagem; `EXTRACTED/VALIDATED` =
   `boletos` com `metodo_extracao/checksum_valido/erros_validacao`; `REVIEW_REQUIRED` = `revisao`;
   `IMPORTED` = `aprovado`; `DUPLICATE` = os UNIQUE; `REJECTED` = `cancelado`.
4. Pagamento **já existe** (Asaas, `ContasPagarManager.tsx:1100-1197`) e `asaas-payment` não confere
   `approval_status` (`:186-188`). "Importar não paga" vale enquanto pagar for clique manual.
5. REGRA #5: conta de e-mail tem org dona (`'single'`); boleto nasce nela; catálogo é o da org dona.
6. "Worker dedicado" + Tesseract + ZXing contradizem o "custo zero" e são desnecessários: PDF textual
   já traz a linha digitável como texto; escaneado cai no caminho manual que existe (`BoletoFormModal.tsx:941-963`).
7. `ocr_local/ocr_cloud` já estão reservados no CHECK de `metodo_extracao` — usar esses nomes.

### 1.4 Riscos subestimados
- **Google.** MX de `alpaconstrutora.com.br` é Hostinger (não há Workspace) e a caixa é **@gmail.com**.
  App OAuth só pode ser *External*: `gmail.readonly` é escopo restrito → verificação + avaliação de
  segurança; em *Testing* o refresh token **expira em 7 dias**. Gmail API está fora do MVP.
- **Defeitos atuais que o automático amplifica:** `sugerirFornecedor` usa `ilike('%digitos%')` sem
  filtrar org sobre `suppliers.document` gravado **com máscara** (`20270716000002:2`) → não casa, ou casa
  fornecedor de outra org (FK cross-tenant); `BoletoFormModal.tsx:266-295` chama `associar` mesmo com
  `duplicate:true` e **sobrescreve o boleto existente**; boleto sem vencimento vira título com
  `transaction_date=hoje` (`boletoService.ts:615`; 29% dos boletos).
- Fila fiscal: `acquire_job` só aceita `queued` e o retry é `failed` → retry nunca roda
  (`20260519000002:24-29`). Copiar o desenho, não esse detalhe.

### 1.5 Decisões tomadas com o usuário (15/10/2026)

| Pergunta | Resposta |
|---|---|
| Entrada | Primeiro: Gmail OAuth Internal. Depois do MX/Hostinger: a caixa é **Gmail comum (@gmail.com)** → **IMAP com senha de app do Google** (sem OAuth). Gmail API fica como evolução SaaS, após verificação. |
| PDF escaneado | **Vai para `revisao`** (campo de colar linha digitável já existe). Sem Tesseract/worker. `ocr_cloud` via Anthropic é Fase 2. |
| Correções do módulo atual | **As 4** (fornecedor por RPC restrita à org; não associar duplicado; sem vencimento → revisão; DV de CNPJ). |
| Desenho | **PRD v1.2 em cima do módulo existente**: 3 tabelas + 3 colunas em `boletos`, sem tela "Caixa de Entrada". |

---

## Parte 2 — Plano de implementação (v1.2)

**Princípio:** o conector é um **produtor de uploads**. Termina quando a linha em `boletos` existe.
Revisão, fornecedor, aprovar, alçada, pagar e auditoria são o módulo atual. Piloto: tudo em `revisao`.

### Fase 0 — Spikes (decidem a arquitetura; 1 dia)

0.1 **IMAP em Deno** — `supabase/functions/email-capture-sync/index.ts` esqueleto com `chamadaDeCron`
e modo temporário `spike`: conecta `imap.gmail.com:993` com `npm:imapflow` (plano A) ou cliente mínimo
sobre `Deno.connectTls` (LOGIN, SELECT INBOX, UID SEARCH SINCE, UID FETCH BODYSTRUCTURE/BODY[part]);
lista UIDs com anexo PDF desde uma data. **Pronto quando:** `functions serve` E o deploy real listam
assunto/remetente/UID de um e-mail de teste com PDF; sem header → 401. Se `imapflow` não subir no Edge
Runtime, plano B = workflow do GitHub Actions a cada 15 min (o repo já roda `conferir-producao.yml`
nesse ritmo) com Node + imapflow postando os anexos numa Edge Function `email-capture-ingest`
autenticada por `CRON_SECRET`. Plano C = Gmail API External com verificação (meses).

0.2 **Texto de PDF em Deno** — no mesmo esqueleto, `npm:unpdf` (build serverless do pdf.js; `npm:` já é
usado em `doc-gen-ia/index.ts:6`) + `extractFromPdfText` importado de `../../../utils/boletoTexto.ts`
(item 1.2). **Pronto quando:** boleto textual devolve a mesma linha que o navegador e
`parseLinhaDigitavel(...).valida===true`; escaneado devolve `textoLen<50` sem exceção; <1 s por arquivo.
Plano B: `scripts/build-email-capture-parser.mjs` clonado de `scripts/build-topografia-copernicus.mjs:15-44`
+ teste de frescor clonado de `__tests__/topografiaCopernicusBundle.test.ts`.

0.3 **Conta Gmail (fora do repo)** — ativar verificação em 2 etapas e gerar **senha de app**; IMAP
habilitado. **Pronto quando:** o spike 0.1 autentica com essa senha.

### Fase 1 — Correções do módulo atual (1 dia)

1.1 `lib/validators.ts` — `validateCNPJ` (mod-11, rejeita repetidos) e `validateCpfCnpj`.
**Pronto:** `__tests__/validators.test.ts` (válido com/sem máscara, DV errado, `11111111111111`).

1.2 `utils/boletoTexto.ts` (novo, puro, imports só com `.ts`: `./febrabanRules.ts`, `../lib/validators.ts`,
`import type` de `../types/boletos.ts`) — extrai de `boletoParser.ts:29-61,108-254,262-333`:
`findLinhaDigitavelInText`, `extractMultaJurosFromText`, `buildExtractionFromLinhaDigitavel`,
`extractFromPdfText(texto, paginas, referenceDate)` (= `extractFromPdfFile` sem pdf.js); CNPJ só aceito
se `validateCNPJ` (senão confiança 30). **Pronto:** `__tests__/febrabanRules.test.ts` segue verde;
`__tests__/boletoTexto.test.ts` cobre linha, CNPJ, multa/juros e "PDF sem camada de texto".

1.3 `utils/boletoParser.ts` — fica com `sha256File`, `extractTextFromPdf` (pdf.js) e
`extractFromPdfFile = extractTextFromPdf + extractFromPdfText`; re-exporta as puras. **Pronto:**
`typecheck` verde, call-sites intactos (`BoletoFormModal.tsx:16`, `boletoService.ts`).

1.4 `services/boletoService.ts` — (a) `sugerirFornecedor` (:756-775) → `rpc('find_supplier_in_org_by_document',
{p_organization_id, p_document})` (item 2.2); (c) `aprovarECriarInvoice` lança
`'Informe o vencimento antes de aprovar.'` se `!vencimento` (remove `?? hoje` de :615); (o upload MANUAL segue nascendo `rascunho` — ver "Ajuste de implementação" acima); listas de colunas
(:229, :507) ganham `origem, email_message_id, nosso_numero`; `BoletoFilters.origem` em :39-48.
**Pronto:** `__tests__/boletoAprovarSemVencimento.test.ts` (mock como `__tests__/boletoExcluir.test.ts`)
prova a exceção e que `aprovarEmLote` reporta o id em `errors`.

1.5 `components/BoletoFormModal.tsx` — (b) em `handleUploadAndSave` (:266-300): se `result.duplicate`,
**não** chama `associar`, só `setBoleto(result.boleto)` + aviso; (c) "Aprovar e Lançar" (:659-667)
desabilitado sem vencimento **com o motivo no `title`** (REGRA: botão desligado diz por quê).
**Pronto:** teste jsdom em `__tests__/components/BoletoFormModalDuplicado.test.tsx` prova que
`associar` não é chamado; `bash scripts/check-ui-standard.sh components/BoletoFormModal.tsx` limpo.

1.6 `types/boletos.ts` — `origem: 'upload'|'email'`, `email_message_id?`, `nosso_numero?`,
`BoletoFilters.origem?`. **Pronto:** `typecheck` verde.

### Fase 2 — Banco (1 dia). Prefixos após `aplicar_20271015100000_blueprint_study_casa.sql`

2.1 `supabase/migrations/aplicar_20271015110000_email_capture_tabelas.sql` — cabeçalho-modelo
`aplicar_20271013180000_boleto_nomenclatura.sql:10-13` (`db query -f`, NUNCA `db push`; `lock_timeout`).
- `email_capture_accounts`: `organization_id` FK, `provedor` CHECK (`'imap'`), `host`, `porta`,
  `usuario` (endereço), `vault_secret_id uuid`, `status` CHECK (`'ativa','reautenticar','desconectada'`),
  `last_sync_at`, `uid_validity bigint`, `last_uid bigint` (checkpoint IMAP), `modo` CHECK
  (`'favoritos','todos','hibrido'`), `data_inicial date`, `modo_piloto bool default true`, `ultimo_erro`,
  `created_by_email`, timestamps; `UNIQUE (organization_id, usuario)`.
- `email_capture_senders`: `organization_id`, `account_id` FK, `supplier_id` FK null, `nome`, `email`,
  `dominio`, `tipo` CHECK (`'exato','dominio'`), `palavras_chave text[]`, `importacao` CHECK
  (`'automatica','revisao'`), `ativo`, `exigir_dmarc bool default true`; UNIQUE parcial
  `(account_id, lower(email))` e `(account_id, lower(dominio))`.
- `email_capture_messages` (uma linha por **anexo**; é fila e trilha RF-09): `organization_id`,
  `account_id`, `uid bigint`, `message_id text` (header), `attachment_index int`, `remetente`, `assunto`,
  `data_email`, `auth_results jsonb` (SPF/DKIM/DMARC do `Authentication-Results`), `documento_nome`,
  `sha256`, `resultado` CHECK (`'processando','criado','duplicado','ignorado','erro'`), `boleto_id` FK
  `ON DELETE SET NULL`, `erro`, `tentativas int default 0`, `next_retry_at`, `created_at`;
  `UNIQUE (account_id, uid_validity, uid, attachment_index)`.
- `ALTER TABLE boletos ADD origem text NOT NULL DEFAULT 'upload' CHECK (origem IN ('upload','email')),
  email_message_id uuid REFERENCES email_capture_messages ON DELETE SET NULL, nosso_numero text`.
- RLS `FOR ALL TO authenticated USING/WITH CHECK (is_org_member(organization_id))` nas 3 tabelas;
  `REVOKE ALL FROM anon`; `GRANT TO authenticated` (modelo `aplicar_20271007000020_employee_bank_accounts.sql:37-74`).
**Pronto:** aplica 2× idempotente; `segurancaMigrations` e `migrationsPrefixo` verdes; usuário de outra
org lê 0 linhas.

2.2 `aplicar_20271015110100_email_capture_rpcs.sql` —
- `email_capture_guardar_segredo(p_account uuid, p_senha text) returns uuid` (`vault.create_secret`/
  `update_secret`, nome `email_capture:<account>`), `email_capture_ler_segredo(p_account) returns text`,
  `email_capture_apagar_segredo(p_account)`: `SECURITY DEFINER`, `search_path = public, vault, pg_temp`,
  `IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE 42501`, `REVOKE EXECUTE … FROM PUBLIC, anon,
  authenticated` **literal** no arquivo, `GRANT TO service_role` (modelo `fn_cron_secret`,
  `aplicar_20270918000023:40-72`).
- `find_supplier_in_org_by_document(p_organization_id uuid, p_document text) returns table(id,name,document)`:
  compara `regexp_replace(document,'\D','','g')`, **`WHERE organization_id = p_organization_id`**,
  `IF auth.role()<>'service_role' AND NOT is_org_member(p_organization_id) THEN RAISE 42501`;
  `REVOKE FROM PUBLIC, anon; GRANT TO authenticated, service_role`.
- Verificação embutida com `has_function_privilege` (modelo `aplicar_20270918000023:200-204`).
**Pronto:** `ler_segredo` com JWT de usuário → 42501; `find_supplier_in_org_by_document` com CNPJ
mascarado e sem máscara devolve o mesmo fornecedor e nada de outra org.

2.3 `aplicar_20271015110200_email_capture_cron.sql` — `cron.schedule('email-capture-sync',
'*/15 * * * *', …net.http_post(url, 'Bearer '||public.fn_cron_secret(), '{"modo":"agendado"}'))`
(modelo `aplicar_20270919000024:84-101`). **Pronto:** `cron.job` tem a linha; `cron.job_run_details`
mostra sucesso após a Fase 3.

### Fase 3 — Edge Functions (3–4 dias)

3.1 `utils/emailCaptureRegras.ts` (novo, puro) — `parseAuthenticationResults(header)→{spf,dkim,dmarc}`,
`remetenteCasa(from, assunto, senders)→sender|null` (exato/domínio/palavras-chave),
`decidirDestino({sender, auth, checksumValido, supplierId, vencimento, modoPiloto})→{status, supplierId?,
motivos[]}`: `rascunho` só se favorito + `dmarc==='pass'` (quando `exigir_dmarc`) + checksum + fornecedor
casado + `vencimentoPlausivel` + `importacao==='automatica'` + `!modoPiloto`; senão `revisao` com motivos.
**Pronto:** `__tests__/emailCaptureRegras.test.ts` cobre cada perna negativa e a positiva; piloto sempre `revisao`.

3.2 `supabase/functions/email-capture-sync/logica.ts` (novo, sem rede; padrão
`opura-market-import/logica.ts:1-7`) — parse de BODYSTRUCTURE para achar partes `application/pdf` (ou
nome `.pdf`, aninhadas), decodificação base64/quoted-printable, path do storage, backoff de
`next_retry_at`. **Pronto:** `__tests__/emailCaptureSyncLogica.test.ts` com BODYSTRUCTURE real anonimizado.

3.3 `supabase/functions/email-capture-sync/index.ts` — modos `agendado` (`chamadaDeCron`) e `agora`
(`exigirMembro(req, conta.organization_id)`; a org vem da linha, nunca do corpo). Por conta `ativa`:
`ler_segredo` → IMAP LOGIN → SELECT INBOX (confere `uid_validity`; mudou → recomeça de `data_inicial`)
→ `UID SEARCH UID last_uid+1:* SINCE data_inicial` → por mensagem: headers (`From/Subject/Date/
Message-ID/Authentication-Results`) → por parte PDF: pular se já há linha → bytes → SHA-256 → dedup
`(org, documento_hash)` → upload no bucket `boletos` em `${org}/${ano}/${Date.now()}_${nome}`
(mesmo path de `boletoService.ts:243`) → `unpdf` + `extractFromPdfText` → dedup `linha_digitavel`
(como `boletoService.ts:293-312`, removendo o arquivo) → `find_supplier_in_org_by_document` →
`decidirDestino` → `INSERT boletos` (`origem='email'`, `email_message_id`, `status`, `metodo_extracao`,
`created_by_email = usuario da conta`) → `boletos_auditoria` `upload`/`sistema` → `UPDATE
email_capture_messages` (`boleto_id`, `resultado`). Teto ~20 anexos/execução; checkpoint `last_uid`
só ao fim; erro por anexo → `tentativas+1`, backoff, para em 3; LOGIN recusado → `status='reautenticar'`.
Modo `testar` (gestor): LOGIN + LOGOUT, sem gravar. **Pronto:** publicada `--no-verify-jwt`; `curl`
sem header → 401; com `CRON_SECRET` → `{contas, mensagens, criados, duplicados, erros}`; e-mail de
teste com PDF vira linha + boleto `origem='email'` em `revisao` cujo PDF abre pela URL assinada;
reenvio do mesmo PDF → `duplicado` sem boleto novo.

3.4 `supabase/functions/email-capture-accounts/index.ts` — `conectar` (`exigirGestor`; valida
LOGIN no IMAP antes de `guardar_segredo` + INSERT `ativa`), `reautenticar` (nova senha), `desconectar`
(`apagar_segredo` + `status='desconectada'`). A senha trafega uma vez, do formulário para a function,
e nunca volta ao cliente. **Pronto:** sem JWT → 401; membro não-gestor → 403; senha errada → 400 com
mensagem; sucesso → `vault_secret_id` preenchido e `select decrypted_secret from vault.decrypted_secrets`
só pelo SQL editor.

3.5 `supabase/config.toml` — `[functions.email-capture-sync]` e `[functions.email-capture-accounts]`
`verify_jwt=false` com comentário (modelo :419-426). **Pronto:** redeploy preserva o 401.

### Fase 4 — UI (2 dias; REGRA #1: ler `docs/ui_ux_guia_unificado.md` inteiro antes; REGRA #4: Sheet)

4.1 `services/emailCaptureService.ts` (novo) — CRUD de contas/remetentes (`organizationId?: string|null`,
`.eq` só se houver org — REGRA #5), `listMessages(accountId)`, `conectar/testar/reautenticar/desconectar/
sincronizarAgora` (fetch às functions com o JWT da sessão). **Pronto:** `typecheck` verde.

4.2 `components/boletos/EmailCapturaConfig.tsx` (novo) — cards "Contas conectadas" (usuário, status
texto §8, última sincronização, modo, ações `ActionIconButton`: Sincronizar agora / Reautenticar /
Desconectar via `useConfirm`) e "Remetentes monitorados" (`useTableColumns` + `ColumnConfigButton`,
busca `usePersistedState`). "Conectar caixa" usa `resolveWriteOrg('single')` + `orgTargetModal`.
**Pronto:** `check-ui-standard.sh` limpo; com topo em "Todas" o botão pergunta a org.

4.3 `components/boletos/EmailCaptureAccountSheet.tsx` (novo) — `Sheet`: usuário (e-mail), senha de
app, host/porta pré-preenchidos para Gmail, modo, data inicial, botão "Testar conexão". **Pronto:**
conta aparece `ativa` após salvar; senha errada mostra a mensagem da function.

4.4 `components/boletos/EmailCaptureSenderSheet.tsx` (novo) — `Sheet`: nome, e-mail ou domínio,
fornecedor (`SupplierSelect`), palavras-chave, importação (automática desabilitada enquanto
`modo_piloto`, com motivo), exigir DMARC, ativo; aceita `prefill`. **Pronto:** cria/edita; `dirty`
pede confirmação ao fechar.

4.5 `components/BoletoManager.tsx` — `TabsBar` (`components/ui/TabsBar.tsx:34`; uso em
`FinancialApprovalModule.tsx:661,738`) `boletos | captura` persistido, badge = contagem de `revisao`
de origem e-mail; coluna `origem` em `BOLETO_COLUMNS`/headers/larguras (:44-61, :450) + célula texto;
`origem` no filtro avançado; texto "E-mail" no card em grade (:337-346). **Pronto:**
`check-ui-standard.sh` limpo; filtro `Em revisão` + origem e-mail lista o boleto do item 3.3.

4.6 `components/BoletoFormModal.tsx` — header (:607-616): "Recebido de <remetente>" + "Adicionar aos
favoritos" (abre 4.4 com `prefill` lido por `boleto.email_message_id`); painel "Histórico" no fim do
corpo chamando `listAuditoria` (:857-865). **Pronto:** boleto de e-mail mostra remetente e histórico
com a linha `upload/sistema`; boleto manual não mostra o botão.

### Fase 5 — Testes e piloto (2–3 dias)

5.1 `__tests__/validators.test.ts` · 5.2 `__tests__/boletoTexto.test.ts` · 5.3 `__tests__/emailCaptureRegras.test.ts`
· 5.4 `__tests__/emailCaptureSyncLogica.test.ts` · 5.5 `__tests__/boletoAprovarSemVencimento.test.ts`
· 5.6 `__tests__/components/BoletoFormModalDuplicado.test.tsx`
· 5.7 `__tests__/emailCaptureMigrations.test.ts` — lê as 3 migrations e exige RLS nas 3 tabelas,
`REVOKE … FROM PUBLIC, anon, authenticated` nas 3 RPCs de Vault, CHECK de `origem`, cron com `fn_cron_secret`.
5.8 **Piloto:** 1 conta, modo `favoritos`, 3 remetentes reais, 2 semanas, tudo `revisao`; medir
`resultado` por dia, acerto de fornecedor, boletos sem vencimento, duplicados (esperado 0). Só então
`modo_piloto=false` nos remetentes `automatica`.

### Estimativa
| Fase | dias |
|---|---|
| 0 Spikes | 1 |
| 1 Correções | 1 |
| 2 Banco | 1 |
| 3 Edge Functions | 3–4 |
| 4 UI | 2 |
| 5 Testes/piloto | 2–3 |
| **Total** | **10–12** (PRD v1.1: 13–23, mais a verificação do Google) |

### Riscos restantes
1. **IMAP no Edge Runtime** (`imapflow`/`node:tls`) é a aposta do spike 0.1; plano B = GitHub Actions.
2. **CPU da Edge Function**: extração é CPU-bound → lote de ~20 anexos, checkpoint no fim.
3. **Senha de app** depende de 2 etapas ativa e pode ser revogada → `reautenticar` + botão.
4. **`UIDVALIDITY` muda** (raro no Gmail) → recomeça da `data_inicial`; a UNIQUE da mensagem evita duplicar.
5. **Anexo não-PDF / link de 2ª via no corpo** → `ignorado` com motivo (fora do MVP; vai aparecer no piloto).
6. **Mudança no upload manual (1.4c)**: boleto sem vencimento passa a nascer `revisao` — avisar no piloto.
7. **Gmail API** fica como evolução SaaS (exige verificação do Google); o desenho de `accounts.provedor`
   já reserva o lugar.

### Verificação final
```bash
npx vitest run __tests__/febrabanRules.test.ts __tests__/boletoTexto.test.ts __tests__/emailCaptureRegras.test.ts \
  __tests__/emailCaptureSyncLogica.test.ts __tests__/validators.test.ts __tests__/boletoAprovarSemVencimento.test.ts \
  __tests__/emailCaptureMigrations.test.ts __tests__/segurancaMigrations.test.ts __tests__/migrationsPrefixo.test.ts \
  __tests__/orgContextGuard.test.ts
bash scripts/check-ui-standard.sh components/BoletoManager.tsx components/BoletoFormModal.tsx components/boletos/*.tsx
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$URL/functions/v1/email-capture-sync" -d '{}'      # 401
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$URL/functions/v1/email-capture-accounts" -d '{}'  # 401
bash scripts/check-rls-postura.sh
```
Depois: e-mail real com boleto → aparece em Boletos a Pagar › Em revisão com origem "E-mail", PDF abre,
"Aprovar e Lançar" cria o título como hoje. Deploy = push em `main`; conferir com `scripts/conferir-producao.sh`.

## Estado

Atualizado em 15/10/2026, ao fim da sessão de implementação.

- [x] **Fase 0 — spikes: 2 de 3.**
  - [x] 0.1 IMAP no Deno: imapflow 1.0.164 chega ao LOGIN de `imap.gmail.com:993` no Deno 2.1 local **e** no Edge Runtime publicado (function de spike temporária, 0,9 s, `AUTHENTICATIONFAILED` reconhecido; function apagada em seguida, OPTIONS → 404).
  - [x] 0.2 PDF no Deno: `npm:unpdf@0.12.1` + `extractFromPdfText` leram 3 boletos reais (VR, Santander, escaneado) local e no runtime publicado (123 ms). O spike achou 3 defeitos do leitor, corrigidos (abaixo).
  - [ ] 0.3 Senha de app da caixa Gmail — **depende do usuário** (ativar 2 etapas, gerar senha de app, conectar pela tela).
- [x] **Fase 1 — correções: 6 de 6** (commit `6f682cc7`).
- [x] **Fase 2 — banco: 3 de 3**, aplicadas 2× cada no remoto (idempotentes), conferidas de fora (RLS, privilégios, cron `*/15` só com caixa ativa).
- [x] **Fase 3 — Edge Functions: 5 de 5** (commit `ba5351eb`). `email-capture-sync` e `email-capture-accounts` publicadas `--no-verify-jwt`; sem header → 401, token falso → 401, cron → 200 `{contas:0}`.
- [x] **Fase 4 — UI: 6 de 6.** Verificada em harness sem login (`docs/spikes/captura-email/`) e,
  depois que o usuário passou a senha, **em produção com login** (usuário de leitura, commit `c479a6e`,
  15/10/2026), sem erro de console nem HTTP 4xx/5xx:
  - topo em **"Todas"**: aba abre (título, 4 KPIs, 3 seções; as 3 tabelas respondem 200); "Conectar
    caixa" pergunta a organização (Alpa / Garden Cambuhy SPE) — REGRA #5, a caixa tem dona;
  - topo na **ALPA**: "Conectar caixa" abre o painel direto, sem perguntar;
  - lista de boletos com a coluna **Origem**; formulário do boleto #1422 com o painel **Histórico**
    mostrando os eventos reais (Capturado · Sistema; Campos alterados · usuário e campos).
- [ ] **Fase 5 — testes e piloto: 7 de 8.** 5.1–5.7 escritos e verdes; 5.8 (piloto de 2 semanas com caixa real) depende da 0.3.

### Desvios do plano registrados na execução (15/10/2026)

- **Leitor (item 1.2), três defeitos achados pelo spike com PDFs reais**, corrigidos com teste:
  linha digitável colada a um dígito vizinho (bloco de 48 inválido) devolvia lixo; CNPJ sem máscara
  ("CNPJ: 07604526000120") não era visto; o CNPJ do PAGADOR podia ser tomado pelo do beneficiário.
  Agora: formato impresso reconhecido primeiro, janela de 47/48 só nas bordas do bloco (janela de 44
  dava falso positivo ~1 em 11), CNPJ rotulado aceito, dono do CNPJ pelo rótulo mais próximo.
- **Conversão extração → colunas** saiu de `boletoService` para `utils/boletoTexto.ts`
  (`colunasDaExtracao`): o boleto da tela e o do e-mail gravam igual.
- **Tela:** em vez de "badge", a lista ganhou a **coluna Origem** (Upload/E-mail) + filtro avançado
  "Origem". A aba "Captura por e-mail" ganhou também o **Histórico da captura** (um anexo por linha,
  com DMARC, resultado e "Ver boleto"), que cobre a rastreabilidade do RF-09 sem tela nova.
- **Formulário do boleto:** além de "Recebido por e-mail de… · Monitorar remetente", o painel
  **Histórico** passou a mostrar `boletos_auditoria` para QUALQUER boleto (antes nenhuma tela lia).
- **Larguras das tabelas** da aba corrigidas depois do print: com a soma original (1.360–1.470 px)
  as ações saíam pela borda.

### Efeito medido na base (15/10/2026)

| | boletos |
|---|---|
| com CNPJ do beneficiário | 529 |
| com sugestão de fornecedor (ILIKE antigo) | 165 |
| que a busca nova encontraria | 473 |
| em aberto sem vencimento — "Aprovar e Lançar" passa a pedir a data | 147 |

## Plano — senha de PDF por remetente (15/10/2026)

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| S1 | `utils/boletoTexto.ts` | `ERRO_PDF_COM_SENHA` + resultado próprio para PDF protegido | teste: o resultado traz o erro novo, não o de "sem camada de texto" |
| S2 | `utils/boletoParser.ts` | upload na tela: `PasswordException` do pdf.js vira o aviso de senha | teste com pdf.js simulado lançando `PasswordException` |
| S3 | `supabase/migrations/aplicar_20271015120000_email_capture_senha_pdf.sql` | `email_capture_senders.pdf_senha_atualizada_em`; senha no Vault por NOME (`email_capture_pdf:<remetente>`), nunca em coluna; RPC `email_capture_definir_senha_pdf` (membro da org; vazio apaga) e `email_capture_ler_senha_pdf` (só service_role); gatilho apaga a senha quando o remetente é excluído; `email_capture_messages.reprocessado_em`; INSERT/UPDATE de remetente por coluna (authenticated não grava a data da senha) | aplicada 2×; `segurancaMigrations` + `emailCaptureMigrations` verdes; authenticated lendo a senha → 42501 |
| S4 | `supabase/functions/email-capture-sync/` | abre PDF com as senhas do remetente casado e, se faltar, as dos demais remetentes da caixa; sem senha certa → boleto em revisão com o aviso de senha; **reprocessa** boletos em revisão sem linha digitável quando uma senha de remetente muda depois da última tentativa | PDF criptografado de teste (jsPDF) abre só com a senha certa no runtime publicado; 401 sem header |
| S5 | `services/emailCaptureService.ts` + `components/boletos/EmailCaptureSenderSheet.tsx` + `EmailCapturaConfig.tsx` | campo "Senha dos PDFs" (gravar / trocar / remover; nunca exibida de volta) e coluna "Senha do PDF" | harness + tela em produção; senha gravada aparece só como "Cadastrada" |

### Estado — senha de PDF (15/10/2026)

- [x] S1 aviso "PDF protegido por senha" no leitor (`ERRO_PDF_COM_SENHA`, `resultadoPdfComSenha`) — teste `boletoParserSenha`.
- [x] S2 upload na tela: `PasswordException` do pdf.js vira o aviso — teste com pdf.js simulado.
- [x] S3 migration aplicada 2×; conferido no banco: ler senha = só service_role; definir = authenticated sim, anon não; authenticated **não** atualiza `pdf_senha_atualizada_em`; gatilho de exclusão criado.
- [x] S4 sincronização publicada: 401 sem header e com token falso; execução real 200 (1 conta, 0 reprocessados — nenhuma senha ainda). `abrirPdf` provado com PDF criptografado de verdade (jsPDF, senha 12345): sem senha e senha errada → protegido sem leitura; senha de OUTRO remetente da caixa → lê linha, valor e CNPJ.
- [x] S5 tela: typecheck e `check-ui-standard` limpos; vista em produção com login (domínio em `0feacdb`): coluna "Senha do PDF" e campo "Senha dos PDFs" no remetente Energisa, sem erro de console nem HTTP 4xx/5xx; CI do commit `5b986196` verde.
- [ ] Prova de ponta a ponta com o boleto nº 1423 — **depende do usuário** cadastrar a senha do PDF da Energisa no remetente.

## Pedido posterior — 15/10/2026 (busca por período)

> atualmente o app busca por email somente do dia ou consigo buscar por data especifica ou periodo especifico?

Resposta: hoje só "a partir de uma data" (definida ao conectar), sem data final, sem editar pela tela, e
o marcador (`last_uid`) impede reler e-mails anteriores à última leitura. Proposta: ação "Buscar período".
Resposta do usuário, literal:

> sim

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| P1 | `supabase/migrations/aplicar_20271015130000_email_capture_buscas.sql` | tabela `email_capture_buscas` (período, cursor, contadores, status); uma ativa por caixa; membro só lê | aplicada 2×; travas de migration verdes; anon não lê |
| P2 | `supabase/functions/email-capture-sync/index.ts` | modo `periodo` (cria e avança a busca), `cancelar_busca`; o cron continua busca ativa; leitura por `SINCE de` + `BEFORE até+1`, cursor próprio — o `last_uid` da leitura automática não muda | 401 sem header; busca real de 1 dia na caixa da ALPA conclui sem boleto duplicado |
| P3 | `services/emailCaptureService.ts` + `components/boletos/EmailCaptureBuscaSheet.tsx` + `EmailCapturaConfig.tsx` | botão "Buscar período" na caixa; painel com De/Até, progresso que avança sozinho enquanto aberto, cancelar; seção "Buscas por período" | harness + produção com login |

### Estado — busca por período (15/10/2026)

- [x] P1 `email_capture_buscas` aplicada 2×; travas de migration verdes (membro só lê, uma ativa por caixa).
- [x] P2 sincronização publicada (`5e2df16e`, `b38c4c7c`): modos `periodo` e `cancelar_busca`; cron continua
  busca ativa; 401 sem header, 200 no cron (um 503 passageiro logo após o deploy, 200 nas chamadas seguintes).
  E-mail já lido passa a contar como "já existia" — a 1ª busca real mostrou tudo zerado e parecia não achar nada.
- [x] P3 tela em produção com login (domínio em `b38c4c7`, CI verde): busca de 15/10 na caixa da ALPA concluída
  pelo painel — 26 de 26 e-mails, 0 criados, 1 já existia (o boleto nº 1423), 0 falhas; nenhum boleto duplicado
  (continua 1 boleto com origem e-mail). Datas padrão dos painéis em horário local (`1e057196`): `toISOString()`
  dava o dia seguinte depois das 21h de Brasília.

## Pedido posterior — 16/10/2026 (senha no campo errado)

> Boleto 1234 : senha foi cadastrada

Conferido no banco: o cofre não tinha senha; o remetente Energisa estava com UMA palavra-chave de 4 dígitos
(salvo às 00h41). O valor foi digitado em "Palavras-chave" (o campo logo acima de "Senha dos PDFs") e,
testado contra o PDF do boleto nº 1423, deu "senha incorreta" (RC4 128 bits, V2/R3 — formato suportado).
Efeito colateral: o remetente passou a só reconhecer e-mails com esses dígitos no assunto/anexo.
Proposto (1) apagar a palavra-chave pelo banco e (2) aviso na tela. Resposta do usuário, literal:

> sim

- [x] Palavra-chave apagada (UPDATE condicionado a "ainda é a única e só dígitos, sem senha"), 03:54 UTC.
- [x] `utils/emailCaptureRegras.ts` › `pareceSenhaDePdf` (3–14 dígitos) + `EmailCaptureSenderSheet`: aviso
  abaixo de Palavras-chave com "Mover para Senha dos PDFs" — testes `emailCaptureRegras` e
  `components/EmailCaptureSenderSheetSenhaNoCampoErrado` (3 casos).
- [ ] Senha certa do PDF da Energisa — **depende do usuário** (o valor de 4 dígitos não abre o arquivo).
