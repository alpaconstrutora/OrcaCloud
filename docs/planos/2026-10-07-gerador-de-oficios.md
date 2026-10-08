# Gerador de Ofícios — Motor de Documentos Parametrizados no GED

## Pedido original

> avalie a implementacao deste funcionalidade e prepare um plano de implementacao:
>
> Para o ÒPURA Documentos (GED), eu trataria o Gerador de Ofícios não apenas como um editor de texto, mas como um pequeno motor de documentos parametrizados + workflow + protocolo + rastreabilidade. Os 4 itens que você listou formam o núcleo correto, mas faltam alguns elementos importantes para o recurso ficar realmente utilizável em uma empresa.
> Nova funcionalidade — Gerador de Ofícios
> Objetivo
> Permitir criar ofícios padronizados a partir de modelos, preenchendo automaticamente dados do ÒPURA, mantendo campos livres para redação, controlando numeração, assinatura, destinatários, versões, protocolo e armazenamento automático no GED.
> 1. Gerenciador de modelos de ofício
> Deve existir uma área:
> Documentos > Ofícios > Modelos
> O usuário poderá criar modelos como:
> - Ofício comercial;
> - Ofício para prefeitura;
> - Ofício para fornecedor;
> - Ofício para cliente;
> - Ofício para instituição financeira;
> - Ofício para concessionária;
> - Ofício para órgão público;
> - Ofício de solicitação;
> - Ofício de resposta;
> - Ofício de cobrança;
> - Ofício de encaminhamento;
> - Ofício interno.
> Cada modelo deverá possuir:
> - nome do modelo;
> - descrição;
> - categoria;
> - organização proprietária;
> - departamento;
> - status: rascunho / ativo / inativo;
> - cabeçalho;
> - logomarca;
> - rodapé;
> - fonte;
> - margens;
> - espaçamento;
> - paginação;
> - estrutura padrão;
> - campos dinâmicos;
> - campos obrigatórios;
> - assinatura padrão;
> - regras de numeração;
> - responsável pelo modelo;
> - versão do modelo.
> Editor de modelo
> Um editor visual semelhante a Word/Google Docs.
> Exemplo:
> OFÍCIO Nº {{oficio.numero}}
> Cambuí/MG, {{oficio.data_extenso}}
> À
> {{destinatario.razao_social}}
> A/C: {{destinatario.contato.nome}}
> Assunto: {{oficio.assunto}}
> Prezados Senhores,
> {{oficio.conteudo}}
> Atenciosamente,
> {{assinante.nome}}
> {{assinante.cargo}}
> {{empresa.razao_social}}
>
> 2. Mapeamento de campos
> Esse é um dos componentes mais importantes.
> O sistema deverá permitir inserir variáveis no modelo.
> Organização emissora
> Exemplos:
> {{empresa.razao_social}}
> {{empresa.nome_fantasia}}
> {{empresa.cnpj}}
> {{empresa.endereco}}
> {{empresa.cidade}}
> {{empresa.telefone}}
> {{empresa.email}}
> Cliente
> {{cliente.razao_social}}
> {{cliente.cpf_cnpj}}
> {{cliente.endereco}}
> {{cliente.responsavel}}
> Fornecedor
> {{fornecedor.razao_social}}
> {{fornecedor.cnpj}}
> {{fornecedor.contato}}
> Obra
> Importante no ÒPURA:
> {{obra.nome}}
> {{obra.codigo}}
> {{obra.endereco}}
> {{obra.cno}}
> {{obra.responsavel}}
> {{obra.contrato}}
> Empreendimento
> {{empreendimento.nome}}
> {{empreendimento.endereco}}
> {{empreendimento.spe}}
> Contrato
> {{contrato.numero}}
> {{contrato.objeto}}
> {{contrato.valor}}
> {{contrato.data_inicio}}
> Usuário
> {{usuario.nome}}
> {{usuario.cargo}}
> {{usuario.departamento}}
> 3. Seleção da entidade destinatária
> Na criação do documento:
> Novo Ofício
> O sistema deve perguntar:
> Emitente
> ALPA Construtora e Incorporadora
>
> Destinatário
> Tipo:
> - cliente;
> - fornecedor;
> - organização;
> - instituição financeira;
> - órgão público;
> - pessoa física;
> - colaborador;
> - parceiro;
> - corretor;
> - prestador;
> - destinatário manual.
> Depois:
> Selecione o destinatário
>
> Exemplo:
> Prefeitura Municipal de Cambuí
> Automaticamente o sistema recupera os dados necessários indicados pelo modelo.
> 4. Resolução automática dos campos
> Após escolher o destinatário:
> {{destinatario.razao_social}}
> ↓
> Prefeitura Municipal de Cambuí
>
> {{destinatario.cidade}}
> ↓
> Cambuí/MG
>
> {{destinatario.contato}}
> ↓
> Secretaria Municipal de Obras
>
> Um recurso importante:
> Campos pendentes
> Se algum dado obrigatório estiver ausente:
> ⚠ CNPJ do destinatário não cadastrado.
>
> O sistema permite:
> Preencher somente neste documento
> ou
> Atualizar cadastro do destinatário
> Isso evita documentos incompletos e ao mesmo tempo melhora progressivamente o cadastro do ERP.
> 5. Campos de conteúdo livre
> Deve haver regiões editáveis no modelo.
> Exemplo:
> {{oficio.conteudo}}
> Com editor Rich Text:
> - negrito;
> - itálico;
> - sublinhado;
> - listas;
> - tabelas;
> - alinhamento;
> - links;
> - recuos;
> - espaçamento;
> - colar texto mantendo ou removendo formatação.
> Também seria útil permitir vários campos independentes:
> {{oficio.introducao}}
> {{oficio.contexto}}
> {{oficio.solicitacao}}
> {{oficio.conclusao}}
> Isso facilita modelos mais estruturados.
> 6. Assunto
> Eu incluiria obrigatoriamente um campo:
> Assunto
> Exemplo:
> Solicitação de ligação definitiva de energia – Empreendimento Residencial Central
>
> Campo extremamente importante para:
> - pesquisa;
> - indexação;
> - protocolo;
> - visualização;
> - envio por e-mail;
> - classificação no GED.
> 7. Número automático do ofício
> Este é um recurso essencial que não apareceu nos quatro itens iniciais.
> Exemplo:
> OFÍCIO Nº 047/2026
>
> O sistema deve controlar sequência automaticamente.
> Configuração possível:
> {sequencial}/{ano}
>
> ou
> ALPA-ENG-{sequencial}/{ano}
>
> Resultado:
> ALPA-ENG-047/2026
>
> Pode haver sequências diferentes por:
> - empresa;
> - filial;
> - departamento;
> - obra;
> - tipo de documento.
> Exemplo:
> ENG-023/2026
> FIN-014/2026
> DIR-008/2026
>
> O sistema deve impedir números duplicados.
> 8. Data
> Além da data simples:
> 07/10/2026
> deve permitir:
> Cambuí, 7 de outubro de 2026.
>
> Campos:
> {{oficio.data}}
> {{oficio.data_extenso}}
> {{empresa.cidade}}
> Também permitir:
> - data automática;
> - data manual;
> - data de emissão;
> - data de assinatura;
> - data de envio.
> 9. Assinatura
> Além do campo de assinatura simples, eu criaria uma estrutura mais robusta.
> Selecionar:
> Assinante
> Exemplo:
> João da Silva
> Diretor de Engenharia
>
> Campos automáticos:
> - nome;
> - cargo;
> - empresa;
> - CREA/CAU, quando aplicável;
> - departamento;
> - telefone;
> - e-mail.
> Tipos de assinatura:
> - imagem da assinatura;
> - assinatura eletrônica interna;
> - assinatura digital ICP-Brasil;
> - assinatura via certificado;
> - campo para assinatura física.
> Também permitir:
> múltiplos assinantes.
> 10. Aprovação antes da emissão
> Muito importante em ambiente empresarial.
> Workflow:
> Rascunho → Revisão → Aprovação → Assinatura → Emitido
> Exemplo:
> Engenharia cria → gerente revisa → diretor aprova → documento é numerado.
> A numeração definitiva pode ser atribuída somente na emissão.
> Isso evita "buracos" desnecessários na sequência de ofícios.
> 11. Anexos
> O ofício frequentemente referencia documentos.
> Exemplo:
> Anexo I – Planta
> Anexo II – Memorial Descritivo
> Anexo III – ART
>
> Permitir anexar:
> - PDF;
> - DOCX;
> - XLSX;
> - imagens;
> - documentos já existentes no ÒPURA Docs.
> E gerar automaticamente a seção:
> Anexos
> 1. Memorial Descritivo;
> 2. Planta Arquitetônica;
> 3. ART nº 1234567.
> 12. Referência a outros documentos
> Campo:
> Documento relacionado
> Exemplo:
> Em resposta ao Ofício nº 028/2026...
>
> Relacionamentos:
> Ofício
>   ├── Contrato
>   ├── Processo
>   ├── Obra
>   ├── Empreendimento
>   ├── Cliente
>   ├── Fornecedor
>   └── Documento anterior
>
> Isso é extremamente valioso no GED.
> 13. Controle de versão
> Exemplo:
> v1 — João — 10:32
> v2 — Maria — 11:14
> v3 — João — 13:45
>
> Mostrar alterações entre versões.
> Após emissão:
> versão congelada.
>
> Qualquer alteração posterior gera nova revisão ou novo documento.
> 14. Pré-visualização
> Antes de emitir:
> Visualizar documento
> Mostrando exatamente como ficará o PDF.
> Possibilidade de validar:
> - quebras de página;
> - assinatura;
> - cabeçalho;
> - rodapé;
> - margens;
> - campos não preenchidos.
> 15. Validador de campos
> Antes da emissão:
> Validação automática
> ✓ Destinatário
> ✓ CNPJ
> ✓ Endereço
> ✓ Assunto
> ✓ Conteúdo
> ✓ Assinante
> ✓ Data
> ⚠ Campo CREA não preenchido
>
> Não permitir emissão quando um campo obrigatório estiver vazio.
> 16. Geração de PDF e DOCX
> Ao finalizar:
> Gerar
> - PDF;
> - PDF/A;
> - DOCX;
> - imprimir.
> O documento gerado deve ser automaticamente armazenado no GED.
> 17. Arquivamento automático no ÒPURA Docs
> O usuário não deveria precisar salvar manualmente.
> Exemplo:
> Documentos
> └── Ofícios
>     └── 2026
>         └── Engenharia
>             └── OFICIO-047-2026.pdf
>
> Com metadados:
> - número;
> - assunto;
> - emitente;
> - destinatário;
> - obra;
> - empreendimento;
> - data;
> - responsável;
> - modelo utilizado;
> - status;
> - tags.
> 18. Envio do ofício
> Após emissão:
> Enviar
> Canais:
> - e-mail;
> - WhatsApp;
> - download;
> - impressão;
> - portal do cliente;
> - portal do fornecedor.
> No envio por e-mail:
> assunto e corpo podem ser gerados automaticamente pelo modelo.
>
> O documento enviado deve registrar:
> Enviado em: 07/10/2026 14:32
> Por: João Silva
> Para: engenharia@empresa.com
>
> 19. Protocolo
> Outro recurso que considero essencial.
> O sistema deve registrar:
> - data de envio;
> - meio de envio;
> - destinatário;
> - protocolo;
> - comprovante;
> - usuário responsável.
> Exemplo:
> Protocolo nº 45872
> Recebido em 08/10/2026.
>
> 20. Confirmação de recebimento
> Status:
> Rascunho
> ↓
> Em aprovação
> ↓
> Aprovado
> ↓
> Assinado
> ↓
> Emitido
> ↓
> Enviado
> ↓
> Recebido
> ↓
> Respondido
> ↓
> Encerrado
>
> Isso transforma o ofício em um processo controlável, e não apenas em um arquivo PDF.
> 21. Prazo para resposta
> Muito útil para ofícios enviados a órgãos públicos, fornecedores ou terceiros.
> Campo:
> Resposta esperada até
> Exemplo:
> 22/10/2026
>
> O ÒPURA pode criar:
> - alerta;
> - tarefa;
> - notificação;
> - pendência.
> 22. Ofício resposta
> Em um ofício recebido:
> Responder
> O sistema cria automaticamente:
> Em resposta ao Ofício nº 124/2026...
>
> Mantendo relacionamento entre os documentos.
> Visualmente:
> Ofício recebido 124/2026
>         ↓
> Ofício enviado 047/2026
>         ↓
> Resposta recebida 183/2026
>
> Isso cria uma verdadeira linha de comunicação documental.
> 23. QR Code de autenticidade
> No rodapé:
> QR Code
> Levando para uma página de verificação:
> Documento: OFÍCIO 047/2026
> Emitente: ALPA Construtora
> Data: 07/10/2026
> Hash: 8f91...
> Status: válido
>
> Isso pode ser muito útil para documentos externos.
> 24. Hash e integridade documental
> No momento da emissão:
> SHA-256 do documento
>
> Armazenar o hash no GED.
> Assim o ÒPURA consegue identificar qualquer alteração posterior no arquivo.
> 25. Modelos condicionais
> Um nível mais avançado.
> Exemplo:
> SE destinatário.tipo = "Órgão Público"
> mostrar bloco "Ilustríssimo Senhor"
>
> SE destinatário.tipo = "Empresa"
> mostrar bloco "À empresa"
>
> SE obra.CNO existir
> mostrar CNO
>
> Isso reduz a quantidade de modelos duplicados.
> 26. Campos calculados
> Exemplo:
> {{contrato.saldo}}
> {{parcela.valor}}
> {{medicao.valor}}
> {{obra.percentual_executado}}
>
> O ofício pode trazer informações diretamente dos outros módulos do ÒPURA.
> 27. Inserção de tabelas dinâmicas
> Muito útil.
> Exemplo:
> Medições pendentes
>
> Medição	Competência	Valor
> 03	Ago/26	R$ 45.000
> 04	Set/26	R$ 37.500
>
>
> O modelo poderia conter:
> {{tabela.medicoes_pendentes}}
> 28. Biblioteca de blocos
> Outra funcionalidade que agregaria bastante.
> Exemplos:
> - introduções;
> - cláusulas;
> - solicitações;
> - encerramentos;
> - fundamentações;
> - textos jurídicos;
> - avisos.
> O usuário selecionaria:
> Inserir bloco
> Solicitação padrão de prazo adicional.
>
> Isso cria padronização institucional.
> 29. IA para auxiliar na redação
> Como funcionalidade futura:
> Assistente de redação
> Com ações:
> - melhorar redação;
> - tornar mais formal;
> - resumir;
> - corrigir ortografia;
> - adequar linguagem institucional;
> - criar resposta ao ofício recebido;
> - redigir com base nos documentos relacionados.
> Exemplo:
> "Gerar resposta ao Ofício nº 122/2026 considerando o contrato nº 45/2026."
>
> 30. Pesquisa avançada
> Filtros:
> - número;
> - assunto;
> - destinatário;
> - emitente;
> - período;
> - empresa;
> - obra;
> - empreendimento;
> - departamento;
> - autor;
> - assinante;
> - situação;
> - modelo.
> Arquitetura funcional recomendada
> Eu estruturaria o recurso em 6 componentes, em vez de simplesmente colocar um botão "Gerar Ofício":
> ÒPURA DOCUMENTOS
> │
> └── OFÍCIOS
>     │
>     ├── Ofícios
>     │   ├── Emitidos
>     │   ├── Recebidos
>     │   ├── Em elaboração
>     │   └── Aguardando resposta
>     │
>     ├── Novo Ofício
>     │
>     ├── Modelos
>     │   ├── Editor
>     │   ├── Campos dinâmicos
>     │   ├── Blocos
>     │   └── Versões
>     │
>     ├── Protocolos
>     │
>     ├── Numerações
>     │
>     └── Configurações
>
> Fluxo ideal
> NOVO OFÍCIO
>      ↓
> Escolher modelo
>      ↓
> Escolher empresa emitente
>      ↓
> Escolher destinatário
>      ↓
> Sistema carrega dados
>      ↓
> Preenche campos mapeados
>      ↓
> Usuário escreve conteúdo
>      ↓
> Seleciona anexos
>      ↓
> Seleciona assinante
>      ↓
> Validação automática
>      ↓
> Revisão / aprovação
>      ↓
> Numeração oficial
>      ↓
> Assinatura
>      ↓
> Geração PDF
>      ↓
> Registro no GED
>      ↓
> Envio
>      ↓
> Protocolo
>      ↓
> Aguardar resposta
>
> Priorização que recomendo
> MVP — obrigatório
> 1. Gerenciador de modelos;
> 2. campos dinâmicos/mapeamento;
> 3. seleção de emitente;
> 4. seleção de destinatário;
> 5. preenchimento automático;
> 6. assunto;
> 7. editor de conteúdo;
> 8. data;
> 9. assinatura;
> 10. numeração automática;
> 11. anexos;
> 12. validação;
> 13. preview;
> 14. geração PDF;
> 15. armazenamento automático no GED;
> 16. histórico de versões.
> Fase 2
> 17. aprovação;
> 18. assinatura eletrônica;
> 19. envio por e-mail/WhatsApp;
> 20. protocolo;
> 21. confirmação de recebimento;
> 22. prazo de resposta;
> 23. relacionamento entre documentos;
> 24. ofício-resposta;
> 25. QR Code e hash.
> Fase 3
> 26. regras condicionais nos modelos;
> 27. tabelas dinâmicas;
> 28. biblioteca de blocos;
> 29. campos calculados;
> 30. IA para redação e resposta.
> O ponto estratégico é que eu não criaria o Gerador de Ofícios como uma função isolada. A melhor arquitetura é criar dentro do GED um Motor de Documentos Parametrizados. O Ofício seria apenas o primeiro tipo documental. Depois a mesma infraestrutura poderia gerar cartas, notificações, declarações, memorandos, termos, comunicados, solicitações, propostas, atas, contratos simples e correspondências sem reconstruir toda a tecnologia. Para o ÒPURA, isso transforma a funcionalidade em infraestrutura documental reutilizável, e não em um recurso pontual.

Sessão: `880e0ec8-cfb9-4a42-9417-a1dbf8f43122` · 2026-10-07 ~20:40

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-10-07 | Editor e motor de PDF (não há editor rich text nem PDF declarativo; o .docx atual sai rasterizado) | **TipTap + pdfmake** (duas dependências novas). Modelo = JSON do TipTap com variáveis como nós; PDF com texto selecionável, cabeçalho/rodapé/paginação nativos; nada de html2canvas |
| 2026-10-07 | Numeração `ENG-047/2026` com reinício anual (a Nomenclatura não tem ANO, `/` nem seq fora da última posição) | **Estender a Nomenclatura** (Configurações › Nomenclatura): tipo `OFICIO`, token `DEPARTAMENTO`, sufixo `/{ano}` com reinício anual. Não criar série paralela |
| 2026-10-07 | Destinatário que não existe no ERP (prefeitura, concessionária, órgão público, pessoa física) | **Como fornecedor**, com tipo de contraparte. ⚠️ `counterparty_kind` existe em `debt_contracts`, não em `suppliers` — vira coluna nova `suppliers.kind` |
| 2026-10-07 | Tamanho da primeira entrega (o MVP tem 16 itens) | **MVP em 3 frentes publicáveis**: F1 modelos+motor+preview · F2 Novo Ofício · F3 emissão. Fases 2 e 3 só planejadas |

## Avaliação da proposta contra o que já existe

Árvore lida: `C:\D\frentes\market-fase4` no topo de `origin/main` (`11d42ec7`, 07/10). O
checkout de integração estava 335 commits atrás e não foi usado como fonte.

O núcleo da proposta está certo: tratar o ofício como **motor de documentos parametrizados**
dentro do GED, com numeração só na emissão, e o Ofício como primeiro tipo documental. O
plano abaixo nomeia as tabelas e serviços com prefixo `doc_gen_` por isso.

### O que o ÒPURA já tem e o plano reaproveita (não reescrever)

| Necessidade da proposta | O que existe | Onde |
|---|---|---|
| Arquivar no GED com versão, auditoria, URL assinada | `documentService.uploadNewDocument(docData, file, email)` → bucket `opura-docs`, caminho `${org}/${docId}/${versionId}_${nome}`, cria v1, auditoria, rollback | `services/documentService.ts:689-789`; exemplo em `services/blueprintGedService.ts:139-175` (`publicarNoGed`) |
| Pastas virtuais do GED | `opura_folders` (org, project, parent, categoria) | `20261227000000_opura_docs_virtual_folders.sql` |
| Catálogo de campos `source.field` + resolução | `FIELD_GROUPS` (12 grupos: organization, client, buyers, contract, project, addendum, landlord, unit, rent, guarantee, guarantor, special), `resolveFields`, `valorPorExtenso`, `numeroPorExtenso` | `services/docxFieldCatalog.ts` (extensão só aditiva, aviso l.8-14) |
| Numeração atômica configurável | `generateDocumentNumber(docType, orgId, ctx)` → RPC `fn_next_document_seq` (INSERT…ON CONFLICT, SECURITY DEFINER, REVOKE feito); máscara em `document_numbering_settings`; `formatDocumentNumber` espelhada em SQL `fn_format_document_number` | `services/documentNumbering/*`, migrations `20270912000001..6`, CHECK de doc_type em `aplicar_20270926000130_solicitacoes_compra.sql:264-272`, tela `components/settings/NomenclaturaTable.tsx` |
| Aprovação com alçada e fila | `approvalService` (`approval_status`/`approval_chain`/`approval_required_levels`, `fn_resolve_approval_levels`, `fn_approval_action_queue` com um ramo por entidade) | `services/approvalService.ts`, `aplicar_20270926000131_fila_aprovacao_solicitacao_compra.sql` |
| Departamentos | `company_departments` (company_id, parent_id, nome, responsavel_nome) + `employees.department_id` | `20260706000001`, `services/companyService.ts:393-432` |
| Assinante com cargo | `employees` (name, role, department_id, phone, email, user_id) | `20260324200000`, `20270851000000_employees_user_id.sql` |
| Dados da org emissora + logo | `organizations` (name, cnpj, email, phone, website, logo_url, address JSONB); `financialReceiptService.dadosDaOrganizacao`/`logoComoDataUrl` (hoje privadas) | `services/financialReceiptService.ts:44-94` |
| PDF determinístico | `setCreationDate` + `setFileId(idDoArquivoPdf(id))`, `caberNaCaixa` | `utils/reciboRecebimento.ts` |
| Hash SHA-256 | `crypto.subtle.digest` (`services/nfeService.ts:48-52`); puro em `utils/blueprintKernel/hash.ts` | — |
| QR + validação pública | padrão da Academia: imagem `api.qrserver.com`, rota `/publico/validar-certificado/:uuid`, RPC pública | `services/academyCertificadoService.ts:39-157`, `App.tsx:646-649` |
| E-mail | Resend via fetch em 7 Edge Functions (`RESEND_API_KEY`, `REPORT_FROM_EMAIL`); nenhuma manda anexo | `supabase/functions/*`, `_shared/auth.ts` |
| Tarefa com prazo / notificação | RPC `create_task(p_user_id, p_org_id, p_title, p_due, p_source_module, p_source_ref, …)`; `notificationService.sendNotification` | `services/taskService.ts:94-180`, `services/notificationService.ts:131` |
| Sanitização de HTML | `utils/sanitizeHtml.ts` + `scripts/check-xss-sinks.sh` no build | — |
| UI canônica | `StandardTable`, `TabsBar`, `Sheet`, `KpiCard`, `useConfirm`, `useToast`, `usePersistedState`, `ActionIconButton`; tela de referência `components/suprimentos/SolicitacoesCompraList.tsx` + `SolicitacaoCompraSheet.tsx` | `components/ui/*` |
| Tela in-flow (sem tela cheia) | `DocxTemplateManager` é tela in-flow com seta "voltar" + `h1`, `useScrollAoTopo` | `components/DocxTemplateManager.tsx:24,162,424`, `hooks/useScrollAoTopo.ts` |

### Lacunas reais (o que a proposta assume e não existe)

1. **Editor rich text e PDF declarativo**: nenhum editor no repo; PDF de modelo hoje é
   `.docx` → docx-preview → html2canvas (rasterizado, sem texto). Decisão: TipTap + pdfmake.
2. **Marcadores com ponto**: `detectTokens`/`fillDocx` só aceitam `/^\w+$/`. O motor novo
   não usa `.docx`; o catálogo `source.field` é reaproveitado como ÍNDICE de campos.
3. **Perfil de usuário**: não há `profiles`; `organization_members` tem só name/email/role.
   Cargo, departamento, CREA/CAU e telefone não existem para o usuário → o assinante vem
   de cadastro próprio (`doc_gen_signatarios`), pré-preenchível a partir de `employees`.
4. **Órgão público / concessionária / pessoa física**: sem cadastro → `suppliers.kind`.
5. **Nomenclatura sem ANO nem `/`**: `separator` tem CHECK `('-', '.')`, `{seq}` é sempre o
   último bloco, não há token de departamento nem ano → extensão (F3).
6. **GED sem metadados JSONB, número interno, hash ou congelamento**: as 5 categorias são
   CHECK fixo; versão não é imutável (qualquer membro altera `storage_path`). O ofício
   guarda seus metadados em tabela própria apontando para `opura_documents.id`; o
   congelamento é trigger na tabela própria + hash do PDF.
7. **Assinatura eletrônica**: `sign-contract` (ZapSign) nunca foi publicada; não há imagem
   de assinatura de usuário. MVP = imagem de assinatura do signatário + registro
   "assinado eletronicamente por X em Y" + hash. ICP-Brasil/ZapSign ficam na Fase 2.
8. **E-mail com anexo**: Resend aceita `attachments` base64, mas nenhuma function faz →
   function nova na Fase 2.
9. **Links de notificação do GED estão mortos** (`#/documentos?…` não começa com `/`, e
   `documentos` é a Área do Cliente). O módulo novo usa `navigateToFocus` desde o início.

### Pontos da proposta que o plano ajusta

- Condicionais, tabelas dinâmicas, blocos e IA ficam na Fase 3, como proposto — mas o
  modelo de dados do TipTap já nasce com nós `variavel` e `campoLivre` para que
  `condicional` e `tabelaDinamica` entrem depois sem migrar modelos.
- "Vários campos de conteúdo livre" (`introducao`, `contexto`, …) entram no MVP: são nós
  `campoLivre` nomeados dentro do modelo, não colunas de tabela.
- "Pasta Documentos/Ofícios/2026/Engenharia" é pasta virtual do GED criada sob demanda,
  com a categoria do modelo (uma das 5 do GED — o CHECK não muda).
- "Numeração definitiva só na emissão" é regra: rascunho não tem número; a RPC de emissão
  reserva o sequencial e grava o status num só passo.
- PDF/A e DOCX de saída ficam fora do MVP (pdfmake gera PDF; DOCX exigiria segundo motor).

## Arquitetura

```
Documentos (sidebar: NavDropdown "Documentos")
 ├── Gestão de Documentos  (GED existente, id 'opura-docs')
 └── Ofícios               (novo, id 'opura-oficios')  →  OficiosModule
       abas (TabsBar): Ofícios | Modelos | Signatários | Numeração (atalho p/ Nomenclatura)

Fluxo: Modelo (TipTap JSON + layout) ─┐
       Contexto (org, destinatário, obra, …) ─┤→ motorRender (puro) → pdfmake docDefinition → Blob
       Valores resolvidos + overrides ───────┘            ↓
                                           emissão: RPC reserva nº → PDF → SHA-256 → GED → congela
```

### Modelo de dados (prefixo `doc_gen_`; `tipo_documental='OFICIO'` é o primeiro tipo)

| Tabela | Colunas principais | Frente |
|---|---|---|
| `doc_gen_modelos` | id, organization_id, nome, descricao, tipo_documental, categoria_ged (CHECK nas 5 do GED), department_id → company_departments, status (rascunho/ativo/inativo), conteudo JSONB (doc TipTap), layout JSONB (cabecalho, rodape, logo, fonte, tamanho, margens mm, espacamento, paginacao, assinatura_padrao), campos_obrigatorios TEXT[], signatario_padrao_id, responsavel_email, versao INT, created_by, timestamps | F1 |
| `doc_gen_modelo_versoes` | modelo_id, versao, conteudo, layout, created_by, created_at; UNIQUE(modelo_id, versao) | F1 |
| `doc_gen_signatarios` | id, organization_id, employee_id?, nome, cargo, registro_profissional, department_id?, telefone, email, assinatura_path (bucket privado `doc-gen-assets`, 1ª pasta = org), ativo | F1 |
| `suppliers.kind` | TEXT NOT NULL DEFAULT 'FORNECEDOR' CHECK IN (FORNECEDOR, INSTITUICAO_FINANCEIRA, ORGAO_PUBLICO, CONCESSIONARIA, PESSOA_FISICA, OUTRO) | F2 |
| `doc_gen_documentos` | id, organization_id, company_id? (emitente), modelo_id, modelo_versao, tipo_documental, status (RASCUNHO → EMITIDO; Fase 2 acrescenta EM_APROVACAO/APROVADO/ASSINADO/ENVIADO/RECEBIDO/RESPONDIDO/ENCERRADO), numero (NULL até emitir), assunto NOT NULL, data_documento DATE, destinatario_tipo (CLIENTE/FORNECEDOR/ORGANIZACAO/COLABORADOR/CORRETOR/INVESTIDOR/MANUAL), destinatario_id?, destinatario_snapshot JSONB, project_id?, empreendimento_id?, contract_id?, client_id?, supplier_id?, valores JSONB (campos resolvidos + overrides "só neste documento"), conteudo JSONB (por `campoLivre`), signatarios JSONB[], anexos JSONB[] ({tipo:'GED'\|'ARQUIVO', document_id?, nome}), documento_relacionado_id?, resposta_esperada_ate?, versao INT, ged_document_id?, pdf_sha256?, emitido_por?, emitido_em?, created_by, timestamps. UNIQUE parcial (organization_id, tipo_documental, numero) WHERE numero IS NOT NULL | F2 (emissão em F3) |
| `doc_gen_documento_versoes` | documento_id, versao, snapshot JSONB (tudo que define o PDF), autor, created_at, congelada BOOL | F2 |

RLS: `is_org_member(organization_id)` em tudo (leitura e escrita), sem perna `OR` solta
(REGRA #7 P1). Toda RPC nova com `REVOKE … FROM PUBLIC, anon` na mesma migration e
autorização dentro (REGRA #7 P2). Migrations com prefixo `aplicar_2027MMDD…`, aplicadas
por `db query -f`, nunca `db push`. `__tests__/segurancaMigrations.test.ts` cobre.

### Código novo (visão por pasta)

```
types/docGen.ts
services/docGen/
  catalogoCampos.ts     ← reexporta FIELD_GROUPS e acrescenta grupos: destinatario, empresa (alias de organization + logo/cidade), obra (alias de project), empreendimento, assinante, usuario, documento (numero, data, data_extenso, assunto, anexos)
  resolverContexto.ts   ← carrega entidades a partir dos ids do documento e devolve ResolveContext + snapshot do destinatário
  dataExtenso.ts        ← "Cambuí, 7 de outubro de 2026" (puro, testado)
  motorRender.ts        ← (doc TipTap, valores, layout) → pdfmake docDefinition. PURO. Parágrafos, negrito/itálico/sublinhado, listas, tabelas, alinhamento, recuo, links, nó `variavel` (substitui ou marca pendente), nó `campoLivre` (injeta conteúdo do documento), cabeçalho/rodapé/paginação/margens/fonte, seção "Anexos", bloco de assinatura
  pdf.ts                ← pdfmake (import dinâmico) → Blob; fontes embutidas; determinismo (CreationDate fixa + id do arquivo)
  validarDocumento.ts   ← lista de pendências — puro
  gedArquivar.ts        ← pasta Ofícios/<ano>/<departamento> sob demanda + uploadNewDocument + tags
services/docGenModeloService.ts, docGenDocumentoService.ts, docGenSignatarioService.ts
components/oficios/
  OficiosModule.tsx (casca + TabsBar), OficiosList.tsx (StandardTable + KpiCard + abas),
  ModelosList.tsx, ModeloEditorTela.tsx (in-flow), EditorRico.tsx (TipTap + nós variavel/campoLivre + painel de variáveis), LayoutModeloForm.tsx,
  NovoOficioTela.tsx (in-flow), SeletorDestinatario.tsx (drawer), CamposPendentesPainel.tsx, SignatariosList.tsx, PreviewPdf.tsx (iframe com blob URL)
```

Regras do app que cada tela respeita: REGRA #5 (`useOrgContext`, `useOrgWriteTarget`,
service com `.eq` condicional); REGRA #2/#3 (obras vêm de `useStore().projects`);
REGRA #1 (`check-ui-standard.sh` nos arquivos tocados); REGRA #4 (seletor de destinatário
é drawer transitório; editor de modelo e Novo Ofício são telas in-flow — nunca tela cheia).

---

## Plano

### Frente F1 — `oficios-f1-modelos` (modelos + catálogo + motor + preview)

**Entrega:** o usuário cria um modelo de ofício num editor visual, insere variáveis, define
cabeçalho/rodapé/margens e vê o PDF de prévia com dados de exemplo e texto selecionável.

1. `docs/planos/2026-10-07-gerador-de-oficios.md` — este arquivo.
   **Pronto quando:** existe, versionado, com a proposta de 30 itens transcrita.
2. `package.json` — `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-table`
   (+ row/cell/header), `@tiptap/extension-underline`, `@tiptap/extension-text-align`,
   `@tiptap/extension-link`, `pdfmake`. Ambos por `import()` dinâmico nos pontos de uso.
   **Pronto quando:** `vite build` passa e pdfmake/tiptap saem em chunks próprios.
3. Migration `aplicar_20271007000200_doc_gen_modelos.sql` — `doc_gen_modelos`,
   `doc_gen_modelo_versoes`, `doc_gen_signatarios`, bucket `doc-gen-assets` (privado,
   5 MB, imagem; policies com 1ª pasta = org), RLS, índices, trigger de `updated_at`.
   **Pronto quando:** aplicada por `db query -f`; `segurancaMigrations.test.ts` verde;
   `check-rls-postura.sh` sem achado novo.
4. `types/docGen.ts` — tipos acima + `DocTipTap` + `LayoutModelo`.
5. `services/docGen/catalogoCampos.ts` — grupos novos sobre `FIELD_GROUPS` (aditivo). Chaves
   em português (`empresa.razao_social`, `destinatario.cnpj`, `obra.cno`,
   `documento.numero`, `documento.data_extenso`, `assinante.cargo`…) mapeando para os
   resolvedores existentes (`organization.name`, `project.matriculaCNO`…).
   **Pronto quando:** teste lista todas as chaves e prova que cada uma resolve com um contexto de exemplo.
6. `services/docGen/dataExtenso.ts` + teste.
7. `services/docGen/motorRender.ts` + `__tests__/docGenMotorRender.test.ts`.
   **Pronto quando:** testes cobrem cada tipo de nó e o docDefinition é determinístico.
8. `services/docGen/pdf.ts` — `gerarPdf(docDefinition, {id, criadoEm}) → Blob`.
   **Pronto quando:** teste prova que dois blobs do mesmo input têm os mesmos bytes.
9. `services/docGenModeloService.ts` (`list(orgId?)` com `.eq` condicional, `get`, `create`,
   `update` que sobe `versao` e grava `doc_gen_modelo_versoes`, `setStatus`, `duplicate`) e
   `services/docGenSignatarioService.ts` (CRUD + upload da imagem).
10. `components/oficios/EditorRico.tsx` — TipTap com nós `variavel {chave}` (chip
    `{{chave}}`, não editável, apagável) e `campoLivre {nome, rotulo}`; painel de variáveis
    por grupo com busca; colar com/sem formatação. Nenhum `innerHTML` manual.
11. `components/oficios/ModeloEditorTela.tsx` — tela in-flow (`useScrollAoTopo`, seta
    voltar, `h1`): dados do modelo, `LayoutModeloForm`, editor, botão **Prévia** (PDF com
    valores de exemplo) em `PreviewPdf`. `useUnsavedChanges`, rodapé sticky §25.
12. `components/oficios/ModelosList.tsx` — StandardTable (Nome · Categoria · Departamento ·
    Status · Versão · Atualizado em · Ações), busca persistida, estado local pós-ação (§22).
13. `components/oficios/SignatariosList.tsx` + Sheet de criar/editar (pré-preencher de
    `employees` por busca).
14. `components/oficios/OficiosModule.tsx` + `components/AppRouter.tsx` (`case
    'opura-oficios'`, permissão ao lado de `opura-docs`) + `components/Layout.tsx` (NavItem
    "Gestão de Documentos" l.915 vira `NavDropdown` "Documentos" com os dois itens; menu
    móvel l.1341; paleta l.532).
    **Pronto quando:** sidebar mostra Documentos › Ofícios, a rota abre o módulo, e
    `check-ui-standard.sh` sai 0 nos arquivos de tela.
15. Verificação F1 e publicação por push.

### Frente F2 — `oficios-f2-novo-oficio` (criar o documento, sem número)

**Entrega:** "Novo Ofício" leva do modelo ao rascunho validado com prévia de dados reais.

1. Migration `aplicar_2027…_doc_gen_documentos.sql` — `doc_gen_documentos`,
   `doc_gen_documento_versoes`, `suppliers.kind` (+ backfill: fornecedores apontados por
   `debt_contracts.institution_supplier_id` → `INSTITUICAO_FINANCEIRA`), RLS.
2. `types/users.ts` (`Supplier.kind`), `services/supplierService.ts`, formulário de
   fornecedor (campo "Tipo de cadastro") e lista (coluna/filtro).
3. `services/docGen/resolverContexto.ts` — por `destinatario_tipo`: CLIENTE, FORNECEDOR
   (qualquer `kind`), ORGANIZACAO, COLABORADOR, CORRETOR (`broker_profiles`), INVESTIDOR,
   MANUAL. Devolve `destinatario_snapshot` normalizado + contexto de obra/empreendimento/
   contrato/empresa emitente/usuário.
4. `services/docGen/validarDocumento.ts` + teste.
5. `services/docGenDocumentoService.ts` — `create`, `update` (grava versão a cada "Salvar"),
   `list(orgId?, {status, …})`, `get`, `remove` (só RASCUNHO), `salvarCampoNoCadastro`
   (a opção "Atualizar cadastro do destinatário", via service da entidade).
6. `components/oficios/SeletorDestinatario.tsx` — drawer transitório (exceção de
   `ClientSelect`): tipo → busca → escolha; "Destinatário manual" abre formulário curto.
7. `components/oficios/CamposPendentesPainel.tsx` — "Preencher só neste documento" ou
   "Atualizar cadastro".
8. `components/oficios/NovoOficioTela.tsx` — in-flow; etapas numa só tela com âncoras:
   Modelo → Emitente → Destinatário → Obra/Empreendimento/Contrato → Campos → Assunto e
   data → Conteúdo (um `EditorRico` por `campoLivre`) → Anexos (lista; só a lista entra no
   PDF) → Signatários (1..n) → Validação → Prévia. "Salvar rascunho" sempre; "Emitir"
   desabilitado com o motivo até F3.
9. `components/oficios/OficiosList.tsx` — aba "Em elaboração" (KPIs: rascunhos, emitidos
   no mês, aguardando resposta).
10. Verificação F2 e publicação.

### Frente F3 — `oficios-f3-emissao` (número, PDF, GED, hash, congelamento)

**Entrega:** "Emitir" numera, gera o PDF definitivo, arquiva no GED e congela.

1. **Nomenclatura estendida**: migration `aplicar_2027…_nomenclatura_oficio.sql` — CHECK de
   `doc_type` ganha `OFICIO`; `document_numbering_settings.year_suffix BOOL DEFAULT false`;
   `separator` CHECK ganha `'/'`; `company_departments.sigla TEXT`; `fn_format_document_number`
   recebe `p_year_suffix` (default false) e termina em `{seq}/{ano}` quando true;
   `fn_generate_document_number` repassa; **reinício anual = ano entra no `scope_key`**
   quando `year_suffix` (a RPC `fn_next_document_seq` não muda). Código:
   `services/documentNumbering/{types,catalog,format,resolvers,settingsService}.ts`
   (`OFICIO: {slots:['PREFIX','DEPARTAMENTO'], prefix:'OF', separator:'-', seqPadding:3,
   yearSuffix:true}` → `OF-ENG-047/2026`; `DEPARTAMENTO` → `company_departments.sigla`,
   omitido sem sigla — nunca bloqueia), `components/settings/NomenclaturaTable.tsx` (linha
   OFICIO, variável Departamento, switch "/{ano} no fim — reinicia a cada ano", separador
   `/`), RH › Departamentos ganha o campo Sigla.
   **Pronto quando:** teste `formatDocumentNumber` × SQL com os mesmos casos; prévia na tela
   mostra `OF-ENG-001/2026`; os 12 tipos existentes formatam igual a antes.
2. RPC `doc_gen_emitir(p_documento_id, p_scope_key, p_values)` SECURITY DEFINER: `FOR
   UPDATE`; recusa status ≠ RASCUNHO (idempotente: já emitido devolve o número); confere
   membro; `fn_next_document_seq(org,'OFICIO',scope)`; formata pela máscara; grava
   `numero`, `status='EMITIDO'`, `emitido_por/em`; REVOKE PUBLIC/anon.
3. RPC `doc_gen_registrar_arquivo(p_documento_id, p_ged_document_id, p_sha256)` — grava
   `ged_document_id`, `pdf_sha256`, marca a versão `congelada`.
4. Trigger `trg_doc_gen_congelar`: documento fora de RASCUNHO recusa UPDATE em conteúdo,
   valores, destinatário, signatários, anexos, modelo, assunto e data; versão congelada
   recusa UPDATE/DELETE.
5. `services/docGen/gedArquivar.ts` — pasta `Ofícios/<ano>/<departamento>` em
   `opura_folders` (categoria do modelo) + `uploadNewDocument({nome:'OFICIO-047-2026.pdf',
   categoria, tipo_documento:'Ofício', descricao: assunto, data_emissao, tags:['oficio',
   numero, departamento], project_id, contract_id, client_id, supplier_id, folder_id})`.
6. `docGenDocumentoService.emitir(id)` — validar → RPC emitir → render final com número →
   SHA-256 → GED → RPC registrar. Falha após numerar: número consumido, EMITIDO sem PDF e
   botão "Regerar PDF" (buraco > duplicidade). "Nova revisão" = `duplicate` com
   `documento_relacionado_id`.
7. Tela: "Emitir" habilitado quando a validação passa (senão o motivo), `useConfirm`;
   pós-emissão: número no cabeçalho, Baixar PDF (`documentService.generateDownloadUrl`),
   Imprimir, abrir no GED (`navigateToFocus`), histórico de versões congeladas. Aba
   "Emitidos"; busca por número/assunto/destinatário; filtros.
8. Verificação F3 e publicação.

### Fase 2 (planejada; cada item vira frente própria com plano filho)

- **Aprovação**: colunas `approval_*` em `doc_gen_documentos`; entidade em
  `approvalService.ENTITY_META`; ramo em `fn_approval_action_queue` (recriar a função a
  partir do ARQUIVO); modelo define se exige aprovação; `semFaixa: 'exigir1'`.
- **Assinatura**: imagem do signatário (F1) + registro "assinado eletronicamente por <nome>
  em <data>" (status ASSINADO). ZapSign só se `sign-contract` for publicada; ICP-Brasil fora.
- **Envio e protocolo**: Edge Function `doc-gen-enviar` (Resend com `attachments`, gate
  `exigirMembro`, prova 401 sem header); WhatsApp só link `wa.me`; tabela `doc_gen_envios`
  (canal, para, enviado_por, enviado_em, comprovante_path, protocolo, recebido_em).
- **Recebimento / respondido / encerrado**: transições manuais + `doc_gen_envios`.
- **Prazo de resposta**: `resposta_esperada_ate` → RPC `create_task` (source_module
  'oficios') + aba "Aguardando resposta".
- **Relacionamento e ofício-resposta**: `doc_gen_documentos_vinculos` (RESPONDE/ENCAMINHA/
  RETIFICA); "Responder" cria rascunho com `documento.em_resposta_a`; ofício RECEBIDO =
  registro com PDF externo no GED.
- **QR + hash**: QR no rodapé (padrão Academia), rota `/publico/validar-documento/:uuid`,
  RPC pública com REVOKE e sem expor `storage_path` (a `fn_get_document_status_public`
  atual expõe o caminho ao anon — não copiar).
- **Anexos dentro do PDF**: rasterizar com pdfjs (como `relatorioRateioPdf`); sem `pdf-lib`.
- Consertar os links de notificação do GED (`#/documentos` → `navigateToFocus`).

### Fase 3 (planejada)

Nó `condicional {expressao}` (avaliador puro, sem `eval`); nó `tabelaDinamica {fonte}` com
resolvedores; `doc_gen_blocos`; campos calculados como resolvedores do catálogo;
assistente de redação via API Claude em Edge Function (ler a skill `claude-api` antes).

## Riscos e decisões de projeto

- **Fontes do pdfmake**: só as embutidas no `vfs` (Roboto + até 2 institucionais); "fonte"
  do modelo é um select dessas. Fonte livre = Fase 3.
- **Tamanho**: TipTap e pdfmake entram por `import()`; medir o chunk no `vite build`.
- **`check-xss-sinks.sh`**: prévia é PDF em iframe (blob), não HTML. HTML do editor, se
  renderizado, passa por `sanitizeHtml`.
- **Categoria do GED**: não acrescentar categoria nova; o modelo escolhe entre as 5.
- **Node 24 cai no `tsc`**: checagem por arquivo pela API; suíte só vale com a conta fechando.
- **Gravação real**: cada frente prova o INSERT/upload no banco, não só leitura em harness.

## Estado

- [x] F1 · 1 — plano registrado nesta frente (`oficios-f1-modelos`, base `e999e3b9`)
- [ ] F1 · 2–15
- [ ] F2
- [ ] F3

## Verificação

```bash
npx vitest run __tests__/docGen*.test.ts __tests__/segurancaMigrations.test.ts __tests__/orgContextGuard.test.ts __tests__/documentNumbering*.test.ts
bash scripts/check-ui-standard.sh components/oficios/<cada arquivo>.tsx
bash scripts/check-system-projects.sh components/oficios && bash scripts/check-project-classification.sh components/oficios
bash scripts/check-xss-sinks.sh
npx supabase db query --linked -f supabase/migrations/aplicar_2027…_doc_gen_*.sql   # nunca db push
bash scripts/check-rls-postura.sh
npm run ci
```

Na interface (skill `rodar-app`, Playwright com `serviceWorkers: 'block'`):

- **F1**: Documentos › Ofícios › Modelos → Novo modelo → inserir `{{empresa.razao_social}}`,
  `{{destinatario.razao_social}}`, um `campoLivre` "conteudo" → Prévia: PDF no iframe com
  texto selecionável (extrair com pdfjs e achar "ALPA"), 2 páginas quando estoura, rodapé
  "Página 1 de 2". Salvar → versão 1; editar → versão 2 em `doc_gen_modelo_versoes`.
  Console e Network sem 4xx/5xx.
- **F2**: Novo Ofício com destinatário FORNECEDOR `kind=ORGAO_PUBLICO` sem CNPJ → "CNPJ do
  destinatário não cadastrado" → "Atualizar cadastro" grava `suppliers.document` (conferir
  no banco) → validação passa → rascunho em "Em elaboração"; F5 preserva; "Emitir"
  desabilitado com motivo.
- **F3**: Emitir → `OF-ENG-001/2026` (conferir `document_number_counters` e a linha em
  `opura_documents` com `folder_id` de `Ofícios/2026/Engenharia`); `pdf_sha256` igual ao
  SHA-256 do arquivo baixado; UPDATE em `conteudo` do emitido recusado pelo trigger;
  segundo clique devolve o mesmo número; `scope_key` do ano seguinte reinicia em 001.
- Publicação: `git push origin HEAD:main`, ler o check-run `ci`,
  `bash scripts/conferir-producao.sh "Novo Ofício"`, depois `fechar-frente.sh`.
