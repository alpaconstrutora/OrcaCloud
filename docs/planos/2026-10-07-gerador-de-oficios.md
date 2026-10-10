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

### Pedido posterior — 2026-10-07 ~21:10, resposta à lista de lacunas da avaliação

> Lacunas que a proposta assume prontas e não existem:
>
> Nenhum editor rich text nem PDF declarativo. O .docx atual gera PDF rasterizado: ok
> Não há perfil de usuário com cargo ou CREA: claro que existe usuário - minha organizacao > Usuários
> Não há cadastro de órgão público: usar os cadastros de minha organizacao > meus fornecedores ou opcao de preencher manualmente
> A Nomenclatura não tem ano, departamento nem separador /.: criar
> O GED não tem hash, metadados nem versão congelada: criar
> A assinatura eletrônica está morta em produção (ZapSign nunca publicado): salvar como pendencias para criar futuramente
> Os links de notificação do GED não levam a lugar nenhum hoje: corrigir

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-10-07 | Editor e motor de PDF (não há editor rich text nem PDF declarativo; o .docx atual sai rasterizado) | **TipTap + pdfmake** (duas dependências novas). Modelo = JSON do TipTap com variáveis como nós; PDF com texto selecionável, cabeçalho/rodapé/paginação nativos; nada de html2canvas |
| 2026-10-07 | Numeração `ENG-047/2026` com reinício anual (a Nomenclatura não tem ANO, `/` nem seq fora da última posição) | **Estender a Nomenclatura** (Configurações › Nomenclatura): tipo `OFICIO`, token `DEPARTAMENTO`, sufixo `/{ano}` com reinício anual. Não criar série paralela |
| 2026-10-07 | Destinatário que não existe no ERP (prefeitura, concessionária, órgão público, pessoa física) | **Como fornecedor**, com tipo de contraparte. ⚠️ `counterparty_kind` existe em `debt_contracts`, não em `suppliers` — vira coluna nova `suppliers.kind` |
| 2026-10-07 | Tamanho da primeira entrega (o MVP tem 16 itens) | **MVP em 3 frentes publicáveis**: F1 modelos+motor+preview · F2 Novo Ofício · F3 emissão. Fases 2 e 3 só planejadas |
| 2026-10-07 ~21:10 | Signatário: cadastro próprio ou o usuário? | **O usuário de Minha Organização › Usuários** (`organization_members`). A tela ganha os campos que faltam para assinar documento: cargo (texto, pré-preenchido pelo cargo customizado), departamento, telefone, registro profissional (CREA/CAU) e imagem de assinatura. Sem tabela `doc_gen_signatarios` |
| 2026-10-07 ~21:10 | Órgão público / concessionária / pessoa física | **Meus Fornecedores ou preenchimento manual.** Sem coluna nova em `suppliers`: o seletor de destinatário lista todos os fornecedores, e "Destinatário manual" cobre o resto. (Substitui a resposta anterior "fornecedor com counterparty_kind".) |
| 2026-10-07 ~21:10 | Hash, metadados e versão congelada | **Criar no GED**, não só na tabela do ofício: `opura_document_versions.sha256` + `congelada` (trigger recusa UPDATE/DELETE), `opura_documents.metadados JSONB`. Todo documento gerado pelo sistema passa a nascer com hash |
| 2026-10-07 ~21:10 | Assinatura eletrônica (ZapSign morto) | **Pendência futura**, registrada na seção "Pendências futuras" deste plano. O MVP assina com imagem + registro interno |
| 2026-10-07 ~21:10 | Links de notificação do GED mortos | **Corrigir na F1**: `documentService` grava `/opura-docs?docId=…`, `destinoDoLinkDeNotificacao` entende `docId`, e o GED abre o documento pelo `viewFocus` |

### Pedido posterior — 2026-10-08, ao abrir a F3

> 1. de acordo
> 2. autorizado

Respostas às duas perguntas feitas antes da F3: (1) "documento emitido no GED não se exclui, só se cancela";
(2) emitir um ofício de teste na Alpa (que consome o `001/2026`), depois apagá-lo e zerar o contador para o
primeiro ofício real também sair `001/2026`.

| 2026-10-08 | Documento emitido (versão congelada) pode ser excluído do GED? | **Não — só cancelado.** A trava vale para todo documento do GED que nascer congelado |
| 2026-10-08 | A prova da emissão consome numeração real | **Autorizado:** emitir ofício de teste, apagar e zerar o contador depois |

### Pedido posterior — 2026-10-10, depois do MVP no ar

> implementar fases 2 e 3

A sessão foi retomada com a instrução de seguir sem novas perguntas. Decisões tomadas por
padrão (registradas aqui para o usuário corrigir se quiser):

| Data | Pergunta | Decisão (padrão, sem perguntar) |
|---|---|---|
| 2026-10-10 | Como dividir as Fases 2 e 3 | **4 frentes publicáveis:** F4 tramitação (aprovação, assinatura interna, envio/recebimento/resposta/encerramento, prazo com tarefa, vínculos, ofício-resposta, ofícios recebidos) · F5 envio por e-mail/WhatsApp + QR/validação pública + anexos dentro do PDF · F6 motor avançado (condicional, tabela dinâmica, blocos, campos calculados) · F7 assistente de IA |
| 2026-10-10 | Prova do envio por e-mail | Para `delivered@resend.dev` (destinatário de teste do próprio Resend) — nenhuma pessoa real recebe e-mail de teste |
| 2026-10-10 | Chave da IA | **Não existe** `ANTHROPIC_API_KEY` nos segredos do projeto (o `bi-narrative` também está sem). A F7 sai pronta e responde "IA não configurada" até a chave ser cadastrada — cadastrar é decisão (e custo) do usuário |
| 2026-10-10 | Dados de teste da conferência | Mesma autorização da F3: dados "PW —" na Alpa, apagados no fim, contador zerado |
| 2026-10-10 | Protocolo (`doc_gen_envios` do plano) | **Não virou tabela:** envio, recebimento (protocolo, quem recebeu), resposta e encerramento são eventos da tramitação (`doc_gen_eventos.dados`), gravados pela RPC que muda a situação — um lugar só, e ninguém grava evento à mão |
| 2026-10-10 | Situação ASSINADO do plano | **Não virou situação:** a assinatura vale para a VERSÃO salva do rascunho (salvar de novo invalida) e aparece por signatário; o modelo diz se a emissão exige todas |

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
3. **Perfil de usuário**: Minha Organização › Usuários edita `organization_members` (name,
   email, role, cargo customizado = template de permissões, código). Não há departamento,
   telefone, CREA/CAU nem imagem de assinatura. **Resposta do usuário:** o signatário É esse
   usuário → a tela ganha os campos que faltam (migration em `organization_members`).
4. **Órgão público / concessionária / pessoa física**: sem cadastro próprio. **Resposta do
   usuário:** Meus Fornecedores ou preenchimento manual; nenhuma coluna nova.
5. **Nomenclatura sem ANO nem `/`**: `separator` tem CHECK `('-', '.')`, `{seq}` é sempre o
   último bloco, não há token de departamento nem ano. **Resposta:** criar (F3).
6. **GED sem metadados JSONB, hash ou congelamento**: versão não é imutável (qualquer
   membro altera `storage_path`). **Resposta:** criar no GED (F3): `sha256` e `congelada`
   em `opura_document_versions`, `metadados` em `opura_documents`, trigger de
   congelamento. As 5 categorias (CHECK) não mudam.
7. **Assinatura eletrônica**: `sign-contract` (ZapSign) nunca foi publicada; não há imagem
   de assinatura de usuário. **Resposta:** pendência futura (seção própria abaixo). MVP =
   imagem de assinatura do usuário + registro "assinado eletronicamente por X em Y" + hash.
8. **E-mail com anexo**: Resend aceita `attachments` base64, mas nenhuma function faz →
   function nova na Fase 2.
9. **Links de notificação do GED estão mortos** (`#/documentos?…` não começa com `/`, e
   `documentos` é a Área do Cliente; `destinoDoLinkDeNotificacao` devolve `null`).
   **Resposta:** corrigir (F1, item 16).

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
       abas (TabsBar): Ofícios | Modelos | Numeração (atalho p/ Nomenclatura)
       signatários = Minha Organização › Usuários (sem aba própria)

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
| `organization_members` (colunas novas) | cargo TEXT, department_id → company_departments (SET NULL), phone TEXT, registro_profissional TEXT (CREA/CAU), assinatura_path TEXT (bucket privado `doc-gen-assets`, 1ª pasta = org). Editadas em Minha Organização › Usuários | F1 |
| `opura_document_versions` (colunas novas) | sha256 TEXT, congelada BOOL DEFAULT false; trigger `trg_opura_version_congelada` recusa UPDATE de `storage_path`/`sha256`/`mime_type` e DELETE quando `congelada` | F3 |
| `opura_documents.metadados` | JSONB DEFAULT '{}' (número, assunto, destinatário, modelo, emitido_por… do ofício; livre para outros produtores) | F3 |
| `doc_gen_documentos` | id, organization_id, company_id? (emitente), modelo_id, modelo_versao, tipo_documental, status (RASCUNHO → EMITIDO; Fase 2 acrescenta EM_APROVACAO/APROVADO/ASSINADO/ENVIADO/RECEBIDO/RESPONDIDO/ENCERRADO), numero (NULL até emitir), assunto NOT NULL, data_documento DATE, destinatario_tipo (CLIENTE/FORNECEDOR/ORGANIZACAO/COLABORADOR/CORRETOR/INVESTIDOR/MANUAL), destinatario_id?, destinatario_snapshot JSONB, project_id?, empreendimento_id?, contract_id?, client_id?, supplier_id?, valores JSONB (campos resolvidos + overrides "só neste documento"), conteudo JSONB (por `campoLivre`), signatarios JSONB[] ({member_id, nome, cargo, registro_profissional, …} — snapshot do usuário no momento), anexos JSONB[] ({tipo:'GED'\|'ARQUIVO', document_id?, nome}), documento_relacionado_id?, resposta_esperada_ate?, versao INT, ged_document_id?, ged_version_id? (o hash vive na versão do GED), emitido_por?, emitido_em?, created_by, timestamps. UNIQUE parcial (organization_id, tipo_documental, numero) WHERE numero IS NOT NULL | F2 (emissão em F3) |
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
services/docGenModeloService.ts, docGenDocumentoService.ts
services/organizationService.ts  ← membro ganha cargo/departamento/telefone/registro/assinatura (upload da imagem)
components/oficios/
  OficiosModule.tsx (casca + TabsBar), OficiosList.tsx (StandardTable + KpiCard + abas),
  ModelosList.tsx, ModeloEditorTela.tsx (in-flow), EditorRico.tsx (TipTap + nós variavel/campoLivre + painel de variáveis), LayoutModeloForm.tsx,
  NovoOficioTela.tsx (in-flow), SeletorDestinatario.tsx (drawer), CamposPendentesPainel.tsx, SeletorSignatario.tsx (lista os usuários da org), PreviewPdf.tsx (iframe com blob URL)
components/OrganizationUsers.tsx  ← seção "Assinatura de documentos" no painel do membro
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
3. Migration `aplicar_20271007000400_doc_gen_modelos.sql` — `doc_gen_modelos`,
   `doc_gen_modelo_versoes`, colunas novas em `organization_members` (cargo,
   department_id, phone, registro_profissional, assinatura_path), bucket `doc-gen-assets`
   (privado, 5 MB, imagem; policies com 1ª pasta = org), RLS, índices, trigger de
   `updated_at`. Ler a policy vigente de `organization_members` antes (memória
   `feedback_policy_vigente_antes_de_reescrever`): as colunas novas não mudam policy.
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
   `update` que sobe `versao` e grava `doc_gen_modelo_versoes`, `setStatus`, `duplicate`).
   `services/organizationService.ts` + `types/users.ts` (`OrganizationMember` ganha
   `cargo`, `departmentId`, `phone`, `registroProfissional`, `assinaturaPath`): gravação
   **só do membro** (caminho de `OrganizationUsers.tsx:731`, nunca o upsert da organização
   inteira — memória `project_organizacao_upsert_inteira_a_cada_clique`) + upload da
   imagem de assinatura no bucket `doc-gen-assets`.
10. `components/oficios/EditorRico.tsx` — TipTap com nós `variavel {chave}` (chip
    `{{chave}}`, não editável, apagável) e `campoLivre {nome, rotulo}`; painel de variáveis
    por grupo com busca; colar com/sem formatação. Nenhum `innerHTML` manual.
11. `components/oficios/ModeloEditorTela.tsx` — tela in-flow (`useScrollAoTopo`, seta
    voltar, `h1`): dados do modelo, `LayoutModeloForm`, editor, botão **Prévia** (PDF com
    valores de exemplo) em `PreviewPdf`. `useUnsavedChanges`, rodapé sticky §25.
12. `components/oficios/ModelosList.tsx` — StandardTable (Nome · Categoria · Departamento ·
    Status · Versão · Atualizado em · Ações), busca persistida, estado local pós-ação (§22).
13. `components/OrganizationUsers.tsx` — o painel de editar membro (≈ l.1499) ganha a seção
    "Assinatura de documentos": cargo (pré-preenchido com o nome do cargo customizado, se
    houver), departamento (`company_departments` da org), telefone, registro profissional
    (CREA/CAU), imagem da assinatura (input escondido + botão "Escolher arquivo", prévia).
    **Pronto quando:** salvar o membro grava só a linha dele; `check-ui-standard.sh` sai 0.
14. `components/oficios/OficiosModule.tsx` + `components/AppRouter.tsx` (`case
    'opura-oficios'`, permissão ao lado de `opura-docs`) + `components/Layout.tsx` (NavItem
    "Gestão de Documentos" l.915 vira `NavDropdown` "Documentos" com os dois itens; menu
    móvel l.1341; paleta l.532).
    **Pronto quando:** sidebar mostra Documentos › Ofícios, a rota abre o módulo, e
    `check-ui-standard.sh` sai 0 nos arquivos de tela.
15. **Links de notificação do GED** (pedido de 21:10):
    - `services/documentService.ts:1396,1459,1524` — `link` passa a
      `/opura-docs?docId=<id>[&pending=true]` (a categoria vem do documento, não da URL).
    - `utils/linkNotificacao.ts` — `destinoDoLinkDeNotificacao` entende `docId` para a view
      `opura-docs` → `foco: {ref: docId, source: 'GED_DOCUMENTO'}` (pending vai no `source`
      como `GED_DOCUMENTO_PENDENTE`); teste `__tests__/linkNotificacao*.test.ts` cobre os
      3 formatos (antigo `#/documentos` → `null`, novo sem/with pending).
    - `components/OpuraDocsModule.tsx` — consome `viewFocus` do store (além do `hash`
      atual, l.680-725): carrega o documento, troca a aba pela `categoria` dele, abre o
      histórico/aprovação, e limpa o foco. Notificações antigas já gravadas continuam
      mortas (não há backfill de `notifications.link`; registrar no plano se o usuário
      quiser um UPDATE).
    **Pronto quando:** clicar numa notificação de aprovação abre o GED na aba certa com o
    documento selecionado (conferido no app).
16. Verificação F1 e publicação por push.

### Frente F2 — `oficios-f2-novo-oficio` (criar o documento, sem número)

**Entrega:** "Novo Ofício" leva do modelo ao rascunho validado com prévia de dados reais.

1. Migration `aplicar_2027…_doc_gen_documentos.sql` — `doc_gen_documentos`,
   `doc_gen_documento_versoes`, RLS. (Sem mudança em `suppliers` — decisão de 21:10.)
2. — (item retirado: não há coluna nova em fornecedores.)
3. `services/docGen/resolverContexto.ts` — por `destinatario_tipo`: CLIENTE, FORNECEDOR
   (Meus Fornecedores, todos), ORGANIZACAO, COLABORADOR, CORRETOR (`broker_profiles`),
   INVESTIDOR, MANUAL (dados digitados ficam só no `destinatario_snapshot`). Devolve o
   snapshot normalizado + contexto de obra/empreendimento/contrato/empresa emitente/usuário.
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
   PDF) → Signatários (1..n, `SeletorSignatario` lista os usuários da org; usuário sem
   cargo/assinatura aparece com a pendência e o atalho para Minha Organização › Usuários)
   → Validação → Prévia. "Salvar rascunho" sempre; "Emitir" desabilitado com o motivo até F3.
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
3. **GED: hash, metadados e versão congelada** (pedido de 21:10) — migration
   `aplicar_2027…_ged_hash_e_congelamento.sql`: `opura_document_versions.sha256 TEXT`,
   `opura_document_versions.congelada BOOL NOT NULL DEFAULT false`,
   `opura_documents.metadados JSONB NOT NULL DEFAULT '{}'`; trigger
   `trg_opura_version_congelada` (BEFORE UPDATE OR DELETE: recusa mudar `storage_path`,
   `sha256`, `mime_type` ou apagar quando `congelada`; a trava de edição existente,
   `trg_enforce_opura_document_lock`, continua intacta). `documentService.uploadNewDocument`
   e `uploadNewVersion` ganham `opcoes?: {sha256?, congelar?, metadados?}` e calculam o
   SHA-256 no cliente (`crypto.subtle`, como `nfeService`) quando não vier; a tela do GED
   mostra o hash e um cadeado na versão congelada; `renameActiveVersionExtension` recusa
   versão congelada. **Pronto quando:** `db query` com UPDATE em `storage_path` de versão
   congelada é recusado; `segurancaMigrations` verde; upload normal pelo GED continua
   funcionando sem hash obrigatório.
4. RPC `doc_gen_registrar_arquivo(p_documento_id, p_ged_document_id, p_ged_version_id)` —
   grava os dois ids e marca a versão do ofício `congelada`.
   Trigger `trg_doc_gen_congelar`: documento fora de RASCUNHO recusa UPDATE em conteúdo,
   valores, destinatário, signatários, anexos, modelo, assunto e data; versão congelada
   recusa UPDATE/DELETE.
5. `services/docGen/gedArquivar.ts` — pasta `Ofícios/<ano>/<departamento>` em
   `opura_folders` (categoria do modelo) + `uploadNewDocument({nome:'OFICIO-047-2026.pdf',
   categoria, tipo_documento:'Ofício', descricao: assunto, data_emissao, tags:['oficio',
   numero, departamento], project_id, contract_id, client_id, supplier_id, folder_id,
   metadados:{numero, assunto, destinatario, modelo, emitido_por, departamento}},
   arquivo, email, {sha256, congelar:true})`.
6. `docGenDocumentoService.emitir(id)` — validar → RPC emitir → render final com número →
   SHA-256 → GED (versão congelada com hash) → RPC registrar. Falha após numerar: número
   consumido, EMITIDO sem PDF e botão "Regerar PDF" (buraco > duplicidade). "Nova revisão"
   = `duplicate` com `documento_relacionado_id`.
7. Tela: "Emitir" habilitado quando a validação passa (senão o motivo), `useConfirm`;
   pós-emissão: número no cabeçalho, Baixar PDF (`documentService.generateDownloadUrl`),
   Imprimir, abrir no GED (`navigateToFocus`), histórico de versões congeladas. Aba
   "Emitidos"; busca por número/assunto/destinatário; filtros.
8. Verificação F3 e publicação.

### Fase 2 — frentes F4 e F5 (pedido de 10/10: "implementar fases 2 e 3")

**F4 — `oficios-f4-tramitacao`** (estado na seção Estado):

- **Aprovação**: `approval_status/approval_chain/approval_required_levels` em `doc_gen_documentos`;
  entidade `doc_gen_documento` no `approvalService` (`amount: 0`, `semFaixa: 'exigir1'`); ramo na
  `fn_approval_action_queue` (critério da planta/SC: está na fila o que alguém ENVIOU); o modelo diz se
  exige (`exige_aprovacao`). Banco: em aprovação o texto não muda; aprovado e alterado volta a RASCUNHO;
  a emissão recusa em aprovação e sem a aprovação exigida.
- **Assinatura interna**: `doc_gen_assinaturas` + RPC `doc_gen_assinar` — o próprio usuário assina a
  VERSÃO salva, só se for signatário; salvar de novo invalida. PDF: "Assinado eletronicamente por X em
  dd/mm/aaaa hh:mm" (hora de Brasília). Modelo pode exigir todas (`exige_assinatura`). Externa
  (ZapSign/ICP) continua em "Pendências futuras".
- **Recebimento / respondido / encerrado**: situações ENVIADO, RECEBIDO, RESPONDIDO, ENCERRADO só pela
  RPC `doc_gen_tramitar` (grafo validado no banco), com os dados no histórico (`doc_gen_eventos`, gravado
  por gatilho e pelas RPCs; sem policy de escrita). O protocolo do destinatário é o evento RECEBIDO.
- **Prazo de resposta**: `resposta_esperada_ate` (livre também depois da emissão) → `create_task`
  (`source_module 'oficios'`), concluída ao responder/encerrar/cancelar; filtro "Aguardando resposta".
- **Relacionamento e ofício-resposta**: `doc_gen_vinculos` (DE <tipo> PARA; cada ponta é ofício do
  sistema ou documento do GED; RESPONDE/ENCAMINHA/RETIFICA/REFERENCIA). Ofício RECEBIDO = documento do
  GED com `metadados.tipo = 'OFICIO_RECEBIDO'`, congelado com hash; "Responder" cria o rascunho vinculado e
  `{{documento.em_resposta_a}}` imprime a referência.

**F5 — `oficios-f5-envio-validacao`** (planejada):

- **Envio por e-mail**: Edge Function `doc-gen-enviar` (Resend com o PDF em `attachments` base64, gate
  `exigirMembro`, prova 401 sem header e 403 de outra org; prova de envio para `delivered@resend.dev`);
  registra o envio como evento (ENVIADO na 1ª vez; reenvio também fica no histórico).
- **WhatsApp**: só link `wa.me` com o texto e o link de validação (sem provedor).
- **QR + hash**: QR no rodapé do PDF definitivo (padrão `academyCertificadoService`), rota pública
  `/publico/validar-documento/:uuid`, RPC pública SECURITY DEFINER com REVOKE que devolve número,
  emitente, data, situação e SHA-256 — sem `storage_path` (a `fn_get_document_status_public` expõe o
  caminho ao anon, não copiar); a página confere o hash de um PDF escolhido pelo visitante no navegador.
- **Anexos dentro do PDF**: PDFs do GED rasterizados com pdfjs e anexados depois do ofício (como
  `relatorioRateioPdf`); sem `pdf-lib`.

### Fase 3 — frentes F6 e F7 (planejadas)

- **F6 — `oficios-f6-motor-avancado`**: nó `condicional {expressao}` no TipTap (avaliador puro, sem
  `eval`: comparações de variável com texto/número, e/ou/não); nó `tabelaDinamica {fonte}` com
  resolvedores (`medicoes_pendentes`, `parcelas_em_aberto`, `anexos`); biblioteca `doc_gen_blocos` por
  organização (inserir no editor); campos calculados como resolvedores do catálogo (`contrato.saldo`,
  `obra.percentual_executado`, `documento.dias_ate_prazo`).
- **F7 — `oficios-f7-ia`**: assistente de redação e de resposta via API Claude numa Edge Function
  (`exigirMembro`, ler a skill `claude-api` antes); sem `ANTHROPIC_API_KEY` responde 503 "IA não
  configurada" e o botão diz o motivo.

## Pendências futuras (fora do MVP e das Fases 2–3, por decisão de 2026-10-07)

- **Assinatura eletrônica externa do ofício** (ZapSign / ICP-Brasil / certificado):
  depende de publicar a Edge Function `sign-contract` (nunca foi publicada — memória
  `project_edge_function_sign_contract_nao_publicada`, decisão de 2026-07-26 de não
  ativar) e de estendê-la para aceitar `docGenDocumentoId` (hoje aceita `dealId`,
  `contractId`, `addendumId`, `documentVersionId`). Quando chegar a hora: secret
  `ZAPSIGN_API_TOKEN`, webhook, status ASSINADO alimentado pelo retorno, e o PDF assinado
  vira nova versão congelada no GED.
- Backfill de `notifications.link` antigas do GED (`#/documentos…`), se o usuário quiser
  que notificações já emitidas passem a abrir.
- PDF/A e saída DOCX do ofício.
- Fonte livre (upload de `.ttf`) nos modelos.

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

- [x] F1 · 1 — plano registrado nesta frente (`oficios-f1-modelos`, base `e999e3b9`);
      revisado em 07/10 ~21:10 com as 7 respostas do usuário à lista de lacunas
- [x] F1 · 2 — deps: `@tiptap/*` 3.31, `pdfmake` 0.3.11, `@types/pdfmake`. `vite build` ✓ em 45 s:
      `OficiosModule` em chunk próprio (520 kB, TipTap dentro), `pdfmake` (1,0 MB) e `vfs_fonts`
      (855 kB) em chunks separados, carregados só na prévia; o chunk principal não mudou
- [x] F1 · 3 — migration `aplicar_20271007000400_doc_gen_modelos.sql` (o prefixo 000200 já era do
      Market — `migrationsPrefixo.test` acusou) **aplicada em 07/10 ~23:50** e provada no banco:
      `doc_gen_modelos` + `doc_gen_modelo_versoes`, 5 colunas em `organization_members`, bucket
      `doc-gen-assets` privado (png/jpeg/webp), 6 policies nas tabelas + 4 no bucket;
      `segurancaMigrations` ✓, `check-rls-postura.sh` ✓ (9/9 limpas)
- [x] F1 · 4 — `types/docGen.ts` (+ `OrganizationMember` ganha cargo/departmentId/phone/
      registroProfissional/assinaturaPath em `types/users.ts`)
- [x] F1 · 5 — `services/docGen/catalogoCampos.ts`: 10 grupos novos em português (104 chaves) + os 12
      legados como "Avançado"; `contextoDeExemplo` preenche 100 % dos campos novos (teste prova)
- [x] F1 · 6 — `services/docGen/dataExtenso.ts` + `variaveis.ts` (puros, testados)
- [x] F1 · 7 — `services/docGen/motorRender.ts` (TipTap → pdfmake; 9 testes: nós, pendências em
      âmbar, cabeçalho/rodapé/paginação, determinismo)
- [x] F1 · 8 — `services/docGen/pdf.ts` (`import()` dinâmico; `creationDate` fixa) — teste em node
      prova bytes idênticos para o mesmo input e bytes diferentes ao mudar a data (o PDFKit deriva o
      `/ID` da data de criação)
- [x] F1 · 9 — `docGenModeloService` (update sobe `versao` e grava a cópia anterior só quando
      conteúdo/layout mudam) + `organizationService.updateMemberSignatario`/`uploadAssinaturaMembro`/
      `urlAssinaturaMembro` (grava SÓ a linha do membro; `.select('id')` denuncia RLS)
- [x] F1 · 10 — `EditorRico` (TipTap: nós `variavel`/`campoLivre`/`assinaturas`/`anexos` em
      `editorExtensoes.ts`; painel de variáveis com busca; link por campo inline, sem `prompt()`;
      estilos em `index.css` `.editor-rico`)
- [x] F1 · 11 — `ModeloEditorTela` (in-flow; §30; §25 salvar permanece; criar com "Todas" pergunta
      e replica; campos obrigatórios = chaves usadas; prévia em `PreviewPdf` = `Sheet` 2xl com iframe)
- [x] F1 · 12 — `ModelosList` (`StandardTable`, clique na linha edita, menu com duplicar/
      ativar-inativar/excluir com `useConfirm`)
- [x] F1 · 13 — `OrganizationUsers`: seção "Assinatura de documentos" no painel Editar Membro
      (cargo pré-preenchido pelo cargo customizado, departamento, telefone, registro, imagem com
      input escondido + prévia); modal alargado para `max-w-2xl`
- [x] F1 · 14 — `OficiosModule` + `AppRouter` (`opura-oficios`) + `Layout` (`NavDropdown`
      "Documentos" com GED e Ofícios, menu móvel, paleta)
- [x] F1 · 15 — links de notificação do GED: `documentService` grava `/opura-docs?docId=…`,
      `linkNotificacao` resolve `GED_DOCUMENTO[_PENDENTE]` (3 testes novos), `OpuraDocsModule`
      consome o `viewFocus` (categoria vem do documento) e limpa o foco
- [x] F1 · 16 — verificação mecânica: tipos por arquivo 0 erros (3ª rodada; as duas primeiras acharam
      6 erros de tipo do pdfmake no motor, corrigidos), `check-ui-standard` ✓ nos 7 arquivos de tela,
      `check-system-projects` ✓, `check-project-classification` ✓, `check-xss-sinks` ✓, suíte inteira
      2.877 arquivos / 7.823 testes = 7.789 + 34 pendentes + 0 falhas (conta fechando), `vite build` ✓
- [x] F1 · 16 — **conferência no app com login** (08/10 ~00:10, `C:/tmp/pwtest/oficios_f1.js`, conta
      de leitura, org Alpa, gravação autorizada pelo usuário): sidebar Documentos › Gestão de Documentos /
      Ofícios; abas Ofícios e Modelos; "Novo ofício" desligado com o motivo; editor de modelo é TELA
      (0 `[role=dialog]` envolvendo o `h1`), nasce com 5 variáveis + 1 campo livre + assinaturas + anexos
      e 5 obrigatórias; busca "cnpj" no painel de variáveis acha 13; inserir `{{empresa.cnpj}}` vira chip;
      **prévia**: PDF de 1 página no `Sheet`, texto extraído pelo pdf.js com logo, endereço e CNPJ reais
      da Alpa, assinatura, anexos e "Página 1 de 1"; **gravação real**: criar → volta à lista com a
      linha; editar descrição → permanece na tela (§25) e NÃO sobe a versão (só conteúdo/layout sobem);
      repetir o mesmo texto deixa "Salvar" desligado com o motivo; excluir pelo menu da linha apagou as
      4 linhas de teste (3 sobras de rodadas interrompidas) — banco conferido depois: 0 modelos, 0
      versões. Usuários › Editar Membro mostra "Assinatura de documentos" com os 34 departamentos.
      0 erros de JS/console, 0 respostas 4xx/5xx do PostgREST. Achado e corrigido: excluir pedia
      confirmação duas vezes (`useConfirm` por cima do "Excluir → Confirmar" do menu)
- [ ] F1 · 16 — **NÃO exercitado**: gravar os dados de signatário de um membro pela tela (a conta de
      leitura é Membro, e a RLS de `organization_members` só deixa gestor gravar). O caminho é o mesmo
      de `updateMemberAccess`, que já denuncia RLS por `.select('id')`; falta um admin salvar um
      membro com cargo/assinatura e conferir a linha no banco
- [x] F1 · publicada em 08/10: `e2e4cc47` (ci **vermelho**: `npm ci` do CI — Node 20/npm 10 — recusou o
      lock sem `@floating-ui/dom`, dependência par do TipTap que o npm 11 local omite) → corrigido em
      `2b132196` declarando a dependência, provado antes com `npx npm@10 ci --dry-run`. Check-run `ci`
      **success** em `2b132196`; Vercel "Deployment has completed"; `conferir-producao.sh` ✓ — o domínio
      serve exatamente `2b13219` e o bundle contém "Modelos de ofício" e "Assinatura de documentos"
- [ ] F1 · fechar a frente (`fechar-frente.sh oficios-f1-modelos`)
- [x] F2 · 1 — migration `aplicar_20271008000100_doc_gen_documentos.sql` **aplicada em 08/10** e provada:
      `doc_gen_documentos` + `doc_gen_documento_versoes`, 6 policies, exclusão só de RASCUNHO
      (`is_org_member AND status='RASCUNHO'`), FK do modelo `RESTRICT`, demais `SET NULL`, índice único
      parcial do número; `segurancaMigrations` ✓, `migrationsPrefixo` ✓
- [x] F2 · 2 — retirado (decisão de 07/10 21:10: sem coluna nova em fornecedores). No lugar:
      `supplierService.updateCamposCadastrais` — update estreito de 10 colunas, porque `updateSupplier`
      reescreve `broker_profiles` com `commission_rate=5` (zeraria comissão de corretor)
- [x] F2 · 3 — `services/docGen/destinatario.ts` (puro: `snapshotDe` dos 7 tipos, mapa variável → coluna do
      cadastro, 7 testes) + `resolverContexto.ts` (candidatos por tipo com consultas LEVES — o
      `brokerService.listProfiles` grava antes de listar —, contexto real, valores = cadastro + overrides,
      imagens das assinaturas, busca de documentos do GED). Achado pela suíte: `select('*')` em `contracts`
      é travado (`selectEstrelaSensivel`, `signature_token`) → colunas explícitas
- [x] F2 · 4 — `validarDocumento.ts` (bloqueante × aviso; número nunca é pendência no rascunho; 6 testes)
- [x] F2 · 5 — `docGenDocumentoService` (create = v1; salvar sobe a versão com UPDATE condicionado a
      `status='RASCUNHO'` E à versão lida — outra aba que salvou antes não é sobrescrita; remove só rascunho)
- [x] F2 · 6 — `SeletorDestinatario` (Sheet 2xl, 7 abas, busca transitória §3.1, manual com 13 campos)
- [x] F2 · 7 — `CamposPendentesPainel` ("Só neste documento" × "Atualizar cadastro", este só quando há UMA
      coluna de destino)
- [x] F2 · 8 — `NovoOficioTela` + `AnexosEditor` (do GED, enviar ao GED, descrito) + `SignatariosEditor`
      (usuários da org, aviso de cargo/assinatura faltando) + `EscolherModeloSheet` (só modelos ativos).
      **Decisão registrada:** "Salvar rascunho" de ofício novo NÃO fecha a tela — o §25 fecha na criação
      porque "a tarefa acabou"; aqui o rascunho é ponto de parada no meio da redação
- [x] F2 · 9 — `OficiosList` (4 KPIs: em elaboração, emitidos no mês, aguardando resposta, prazo vencido;
      filtro Situação em popover §5.4) + `OficiosModule` (aba Ofícios por padrão; "Novo ofício" ligado;
      excluir modelo usado por ofício explica a recusa em vez do erro de FK)
- [x] F2 · 10 — **conferência no app com gravação real** (08/10, `C:/tmp/pwtest/oficios_f2.js`, conta de
      leitura, org Alpa; dados de teste "PW —" criados e apagados por SQL): Novo ofício → modelo → assunto →
      destinatário FORNECEDOR "PW — Prefeitura de Teste" (sem CNPJ) → pendência "CPF / CNPJ não está
      preenchido — campo obrigatório" → **Atualizar cadastro** → banco: `suppliers.document =
      18.675.983/0001-61` ✓ → redação, signatário, anexo descrito → "Tudo preenchido" → Salvar = v1 →
      **prévia**: PDF com a prefeitura, o CNPJ, o texto, o signatário, "nº atribuído na emissão", cabeçalho e
      rodapé reais da Alpa → editar e salvar = v2 → Voltar → linha na lista, **sobrevive ao F5** → reabrir traz
      assunto, texto e signatário. **Manual**: só "Só neste documento" (sem "Atualizar cadastro"), e as únicas
      escritas foram `doc_gen_documentos` + `doc_gen_documento_versoes`. "Emitir" desligado com o motivo
      ("6 pendência(s) impede(m) a emissão… chega na F3"). Exclusão pelo menu da linha apagou os 2 rascunhos,
      sem versão órfã. 0 erros de JS/console, 0 respostas 4xx/5xx. Achado e corrigido na conferência: a dica
      "Cidade (local e data)" saía vazia quando o modelo não usava `{{empresa.cidade}}`
- [x] F2 · tipos 0 erros; suíte 2.894 arquivos / 7.873 testes = 7.839 + 34 pendentes + 0 falhas (a 1ª rodada caiu com
      segfault do Node, exit 139 — repetida); `check-ui-standard` ✓ nos 13 arquivos de Ofícios; system-projects,
      classification e xss ✓
- [x] F2 · publicada em 08/10 (`ebe7fe74` + `626af1ee`). O check-run `ci` de `626af1ee` saiu **vermelho**, mas
      não pela F2: falhou só "Planta + 3D lado a lado (E10.3)", teste que entrou com `e989ccd6` (outra sessão) e já
      falhava ali e em `d607c5d6`. A mesma sessão corrigiu em `56c1bc8d` — posterior aos commits da F2 e com `ci`
      **success**. Vercel "success"; `conferir-producao.sh` ✓: o domínio serve `56c1bc8` e o bundle contém
      "Escolher destinatário" e "Atualizar cadastro"
- [ ] F2 · fechar a frente (`fechar-frente.sh oficios-f2-novo-oficio`)
- [x] F3 · 1 — Nomenclatura: `OFICIO` no CHECK e no catálogo (`OF` + `DEPARTAMENTO`, 3 dígitos, `/ano`), variável
      `DEPARTAMENTO` só para o Ofício (`extraVariables`), `year_suffix` por linha (coluna "/Ano" na tela), ano no
      escopo do contador. **Mudança de rumo:** o separador NÃO ganhou `/` — o sufixo `/{ano}` já dá
      `OF-ENG-047/2026`. `fn_format_document_number` de 8 argumentos chama a de 6, que NÃO mudou (banco = arquivo,
      conferido por md5). Departamentos ganham **Sigla** — e o formulário de departamento, que gravava o estado antigo
      (criar saía com nome vazio e desistia calado; editar regravava o que já estava), passou a gravar o que se digita;
      os dois `confirm()` nativos da tela viraram `useConfirm` (REGRA #1)
- [x] F3 · 2 — `doc_gen_emitir` (SECURITY DEFINER, REVOKE PUBLIC/anon, organização conferida dentro, `FOR UPDATE`,
      idempotente, congela a versão salva). `aplicar_20271008000200` **aplicada em 10/10**
- [x] F3 · 3 — GED: `sha256` e `congelada` nas versões, `metadados` no documento; gatilhos recusam alterar/apagar
      versão congelada, nova versão e exclusão do documento emitido. `uploadNewDocument`/`uploadNewVersion` calculam o
      SHA-256 em todo envio; congelar é o ÚLTIMO passo (o rollback do upload continua apagando). `deleteDocument` recusa
      documento congelado ANTES de apagar arquivos do Storage (senão o registro ficaria sem o PDF). Histórico de
      versões mostra cadeado + SHA-256 copiável (§27); excluir desligado com o motivo
- [x] F3 · 4 — gatilho `trg_doc_gen_congelar`: emitido só cancela e registra o arquivo; tirar de RASCUNHO só pela função
      (permissão local à transação). Não precisou de `doc_gen_registrar_arquivo`: o registro é um UPDATE que o gatilho
      deixa passar uma vez
- [x] F3 · 5/6 — `services/docGen/emissao.ts`: número → PDF definitivo (determinístico: id + `emitido_em`) → SHA-256 →
      pasta `Ofícios/<ano>/<departamento>` → GED congelado com metadados → registro; falha depois do número deixa o
      ofício EMITIDO sem arquivo e a tela oferece "Gerar PDF e arquivar no GED" (idempotente)
- [x] F3 · 7 — tela: "Emitir" com `useConfirm` e motivo quando desligado; pós-emissão com número no título, Abrir PDF
      (URL assinada), Abrir no GED, Cancelar ofício (arquivo vira "arquivado" + etiqueta `cancelado`, nada se apaga)
- [x] F3 · 8 — **conferência no app com emissão real** (10/10, `C:/tmp/pwtest/oficios_f3.js`, autorizada em 08/10;
      departamento de teste sigla `PWT` para não tocar em departamento real): `OF-PWT-001/2026`; PDF 59.815 bytes por URL
      assinada; **SHA-256 do arquivo baixado = o gravado na versão do GED** (`fbaf987d…0134`); GED mostra o aviso de
      congelado, o cadeado e o hash; pasta `Ofícios / 2026 / PW — Engenharia (teste)`; cancelar → GED `arquivado` +
      `cancelado`. 0 erros de JS, 0 respostas 4xx/5xx. **Provas no banco** (cada uma desfeita): alterar assunto,
      voltar a rascunho, trocar o arquivo, forjar emissão por UPDATE, mexer/apagar a versão, nova versão e excluir o
      documento — todas recusadas com a mensagem certa; 2º clique devolve o mesmo número; data de 2027 reinicia em
      `001/2027`; cancelado não reemite
- [x] F3 · 9 — **achado da conferência e corrigido:** a Nomenclatura mostrava `OF-ENG-0001/2026` (dígitos da página) e
      a emissão deu `OF-PWT-001/2026` (padrão do catálogo, linha não salva). `aplicar_20271010000100` (aplicada 10/10):
      sem linha salva, a emissão usa separador e dígitos da organização. Provado: o próximo sai `OF-PWT-0002/2026`.
      **Para a Alpa os ofícios saem com 4 dígitos** (`OF-ENG-0001/2026`) — 3 dígitos exigiria mudar "Dígitos do
      Sequencial", que vale para todos os documentos
- [x] F3 · 10 — limpeza autorizada: ofício, PDF (Storage), pastas, modelo e departamento de teste apagados; contadores
      de ofício da Alpa zerados (o 1º real sai `0001/2026`); travas religadas e conferidas. Suíte 2.909 arquivos /
      7.904 testes = 7.870 + 34 pendentes + 0 falhas; tipos 0; RLS 9/9; check-ui 0 nos 4 arquivos de tela
- [x] F3 · publicada em 10/10 (`812c03e9` + `10f1ae41`): check-run `ci` **success** em `10f1ae41`; Vercel "success";
      `conferir-producao.sh`: o domínio serve `10f1ae4` e o bundle contém "Cancelar ofício" e "Gerar PDF e arquivar no
      GED" (os 2 commits "faltando" eram de outras sessões, chegados a `main` depois)
- [x] F3 · frente `oficios-f3-emissao` fechada

**MVP do Gerador de Ofícios (F1 + F2 + F3) no ar em 10/10/2026.** Fases 2 e 3 da proposta seguem planejadas acima;
pendências futuras na seção própria.

### F4 — tramitação (frente `oficios-f4-tramitacao`, base `ad7bd9eb`)

- [x] F4 · 1 — migration `aplicar_20271010000300_oficio_tramitacao.sql` **aplicada em 10/10** e provada no banco como
      `authenticated` com o JWT do usuário de leitura, numa transação desfeita (nada persistiu — contador continuou 0):
      emitir sem aprovação / em aprovação / sem assinatura → recusado com a mensagem certa; editar em aprovação →
      recusado; aprovado e editado → volta a RASCUNHO; ofício PENDENTE aparece na `fn_approval_action_queue`; forjar
      assinatura ou evento por INSERT → RLS recusa; status por PATCH → recusado; transição fora do grafo (ENVIADO→EMITIDO,
      RESPONDIDO→CANCELADO) → recusada; 2º clique em emitir devolve o número; histórico com 10 eventos e os dados; anon
      sem EXECUTE nas 3 RPCs. A fila foi reescrita do ARQUIVO depois de conferir que o corpo no banco era igual
- [x] F4 · 2 — serviços: `docGenDocumentoService` (tramitar, cancelar pela tramitação, prazo, eventos, assinaturas,
      aprovação pela primitiva única, vínculos, tarefa do prazo idempotente por `uq_tasks_source_open`), `approvalService`
      (entidade `doc_gen_documento`), `docGen/tramitacao.ts` (rótulos, histórico legível, "em resposta a", ofícios
      recebidos no GED), `docGen/gedPastas.ts` (pastas do GED fora da emissão, sem import circular), `emissao.ts`
      (carimbo da assinatura no PDF, `{{documento.em_resposta_a}}`, tarefa do recebido concluída ao emitir a resposta),
      `dataHoraCurta` sempre no fuso de Brasília (vai impresso)
- [x] F4 · 3 — telas: card "Aprovação e assinaturas" (enviar/retirar/aprovar/rejeitar, assinar a própria linha, motivo
      em todo botão desligado), card "Tramitação" (envio com canal/rastreio, recebimento com protocolo, resposta com PDF
      arquivado ou só marcação, encerrar, cancelar, prazo com tarefa), "Documentos relacionados", "Histórico"; aba
      **Recebidos** (registrar ofício recebido: PDF no GED congelado com hash em `Ofícios/<ano>/Recebidos`, prazo vira
      tarefa, "Responder" abre ofício novo já vinculado e com o remetente como destinatário); modelo ganha "Exige
      aprovação" e "Exige assinatura"; Central de Controle e Aprovações mostram "Ofício"; Tarefas mostra "Ofícios"
- [x] F4 · 4 — testes `docGenTramitacao.test.ts` (16): grafo de transições da tela = o do SQL (lido do arquivo),
      CHECK de situações = rótulos, todo evento do gatilho tem descrição, assinatura vale só na versão, hora de Brasília,
      PDF com "assinado eletronicamente" só para quem assinou, REVOKE nas funções novas. Tipos 0 erros (1.612 arquivos);
      suíte 2.925 arquivos / 7.937 testes = 7.903 + 34 pendentes + 0 falhas; check-ui 0 nos 10 arquivos de tela;
      sistema/classificação/XSS/seletor de org limpos
- [x] F4 · 5 — **conferência no app com gravação real** (`C:/tmp/pwtest/oficios_f4.js`): registrar recebido (PDF) →
      Responder (assunto e destinatário preenchidos, vínculo pendente gravado ao salvar) → Emitir desligado com o motivo
      certo em cada etapa → enviar para aprovação (texto trava, banner) → aprovar → assinar → emitir `OF-0001/2026` →
      envio Correios → recebimento com protocolo → prazo 15/11 → resposta arquivada pelo próprio ofício (Respondido) →
      encerrar. PDF baixado traz "Em resposta ao Ofício nº 312/2026 de PW — Prefeitura de Teste, de 02/10/2026" e
      "Assinado eletronicamente por Claude Code em 10/10/2026 08:48". Banco: 3 PDFs no GED congelados com hash, vínculos
      nas duas direções, as duas tarefas concluídas. 0 erros de JS, 0 respostas 4xx/5xx. **Achados corrigidos na
      conferência:** Emitir/Salvar sumiam durante a aprovação (agora ficam, desligados com o motivo); painéis fechados
      deixavam o conteúdo no DOM (devolvem `null`); a tarefa "Responder…" do recebido ficava aberta depois da resposta
      emitida; o recebido que é resposta a um ofício nosso aparecia "Sem prazo" (agora "Resposta ao OF-…"); "Validação —
      pronto para emitir" aparecia em ofício já emitido
- [x] F4 · 6 — limpeza: ofício, recebidos, PDFs (Storage), pastas, tarefas, modelo de teste apagados; contador zerado


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
- **F1 (links)**: solicitar aprovação de um documento no GED → a notificação gerada tem
  `link` começando por `/opura-docs?docId=` → clicar abre o GED na aba da categoria com o
  histórico do documento aberto.
- **F1 (usuário)**: Minha Organização › Usuários → editar um membro → preencher cargo,
  departamento, CREA e subir a assinatura → conferir no banco que só a linha dele mudou.
- **F2**: Novo Ofício com destinatário FORNECEDOR (uma prefeitura cadastrada em Meus
  Fornecedores) sem CNPJ → "CNPJ do destinatário não cadastrado" → "Atualizar cadastro"
  grava `suppliers.document` (conferir no banco) → validação passa → rascunho em "Em
  elaboração"; F5 preserva; "Emitir" desabilitado com motivo. Repetir com "Destinatário
  manual": nada é gravado fora de `doc_gen_documentos`.
- **F3**: Emitir → `OF-ENG-001/2026` (conferir `document_number_counters` e a linha em
  `opura_documents` com `folder_id` de `Ofícios/2026/Engenharia` e `metadados.numero`);
  `opura_document_versions.sha256` igual ao SHA-256 do arquivo baixado e `congelada=true`;
  UPDATE em `storage_path` dessa versão e em `conteudo` do ofício recusados pelos
  triggers; segundo clique devolve o mesmo número; `scope_key` do ano seguinte reinicia
  em 001.
- Publicação: `git push origin HEAD:main`, ler o check-run `ci`,
  `bash scripts/conferir-producao.sh "Novo Ofício"`, depois `fechar-frente.sh`.
