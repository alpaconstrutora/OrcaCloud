# Assinatura eletrônica interna (sem certificado) no Comercial: assinar dentro do portal

## Pedido original

> Sessão `d12c6c25-fdaa-4188-b647-1264b3ad933a` · 21/11/2026

**1ª mensagem (transcrição literal):**

> avalie implementar assinatura digital sem certificado no módulo comercial:
>
> Sim, no Brasil, a assinatura eletrônica sem certificado digital ICP-Brasil tem validade jurídica, desde que permita comprovar a autoria e a integridade do documento. A legislação (como a MP nº 2.200-2/2001 e a Lei nº 14.063/2020) e decisões do STJ reconhecem essas assinaturas, embora o nível de segurança e presunção de veracidade varie conforme o método utilizado.
>
> Tipos de assinatura e validade
>
> • Assinatura simples (sem certificado): identifica quem assinou e associa os dados ao documento (ex.: aceite eletrônico, confirmação por e-mail). É válida em contratos e atos de menor risco, mas exige mais evidências se houver contestação.
> • Assinatura avançada: usa mecanismos mais robustos para vincular o signatário ao documento e detectar alterações posteriores (como autenticação por SMS, biometria, token ou conta Gov.br), sem exigir certificado ICP-Brasil.
> • Assinatura qualificada (com certificado ICP-Brasil): oferece presunção legal máxima de autenticidade e inverte o ônus da prova em caso de contestação.
>
> O que reforça a validade sem certificado
>
> Para que uma assinatura sem certificado digital seja mais segura em eventual disputa judicial, costuma ser importante contar com:
> • Trilha de auditoria ou manifesto de assinatura: registro de endereço IP, data e hora (carimbo do tempo), geolocalização e dados do dispositivo.
> • Autenticação adicional: validação por e-mail, código SMS, biometria facial ou aceite explícito das partes.
> • Integridade do arquivo: mecanismos (como hash criptográfico) que mostrem que o documento não foi alterado após a assinatura.
>
> Quando o certificado costuma ser exigido ou recomendado
>
> Mesmo quando a assinatura sem certificado é válida entre particulares, alguns órgãos públicos, procedimentos específicos ou atos com exigência legal expressa podem pedir assinatura qualificada (ICP-Brasil) ou nível específico definido em norma. Como o STJ já analisou a validade de assinaturas eletrônicas sem certificação ICP-Brasil quando há meios idôneos de verificação, o ponto central costuma ser a prova da autoria e da integridade. Você pode conferir mais detalhes sobre o tema em Assinaturas Eletrônicas Sem ICP-Brasil Têm Validade Jurídica.
> Se você quiser, me diga qual tipo de documento você pretende assinar e se há algum órgão ou parte exigindo regra específica para eu avaliar o nível de segurança mais indicado.

**2ª mensagem (resposta à pergunta "o que te leva a querer assinatura sem certificado?"):**

> Para decidir: o que te leva a querer assinatura sem certificado?
> 1. Custo por documento. Vamos manter o zapsign para documentos mais importantes. Os menos relevantes, fariamos via sem certificado. De qualquer forma vamos manter o zapsign.
> 2. Assinar dentro do portal sem sair do app: Isso é muito interessante.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 21/11 | Quais documentos entram primeiro? | As versões da aba Emissão, PDFs avulsos na negociação e a proposta (as três opções) |
| 21/11 | Quem assina além dos compradores? | Representante da empresa, testemunhas e corretor |
| 21/11 | Como confirmar que é o próprio comprador? | Código de 6 dígitos por e-mail, mais CPF e aceite |
| 21/11 | E o comprador sem portal? | Convidar ao portal na hora do envio |
| 22/11 | Texto do termo de aceite (`TERMO_DE_ACEITE`, v2026-11-21.1) | "de acordo" — aprovado como está |
| 22/11 | Quem faz o teste de ponta a ponta com e-mail real? | "eu mesmo" — o usuário, depois de publicar F4–F6 |
| 21/11 | O ZapSign fica? | Fica, para os documentos importantes. O caminho interno é um segundo provedor, escolhido documento a documento |

## Contexto

O ZapSign já existe (`supabase/functions/sign-contract`). A função está publicada, mas falta o secret `ZAPSIGN_API_TOKEN`, então hoje ela responde 503. Ele continua sendo o caminho dos documentos importantes.

O caminho interno é **assinatura eletrônica avançada sem ICP-Brasil** (MP 2.200-2/2001, art. 10 §2º; Lei 14.063/2020). A prova se apoia em quatro pontos:

- **Autoria:** código enviado por e-mail, CPF digitado, aceite explícito, IP e navegador.
- **Integridade:** SHA-256 da cópia congelada do PDF e SHA-256 do PDF final.
- **Trilha de eventos:** os eventos são imutáveis e cada um carrega o hash do anterior.
- **Cópia final:** o PDF final vai por e-mail a todos os signatários.

⚠️ O texto do termo de aceite (`TERMO_DE_ACEITE` em `supabase/functions/assinatura-interna/regras.ts`) passa pelo jurídico antes da F4, que é quando o envio fica disponível ao usuário.

## Plano

### F1: Banco (`supabase/migrations/aplicar_20271122100000_assinatura_interna.sql`)

`contract_document_versions` **não é ampliada para receber documentos da negociação**. O `contract_id` é NOT NULL e sustenta cinco coisas: a RLS, a projeção `_syncMinutaMirror`, a pasta do bucket, o `portal-documentos-download` e o Portal do Parceiro.

| Item | O que muda | Como sei que terminou |
|---|---|---|
| `contract_document_versions` | Duas colunas novas: `assinatura_envelope_id` e `signature_provider` (ZAPSIGN ou PORTAL) | `\d` mostra as duas colunas |
| `commercial_deal_documents` | Tabela nova, a casa dos documentos da negociação. RLS de membro e trigger que recusa apagar documento com envelope | Teste SQL: apagar documento com envelope falha |
| `assinatura_envelopes`, `assinatura_signatarios`, `assinatura_eventos` | Tabelas novas. RLS só de SELECT, sem nenhuma policy de escrita. Os eventos são imutáveis e encadeados por hash | Teste SQL: UPDATE em evento falha; o hash do evento seguinte bate com o anterior |
| Bucket `assinaturas` | Privado, sem nenhuma policy, só PDF | `storage.buckets` mostra `public = false`, e `storage.objects` não tem policy citando o bucket |
| RPCs `assinatura_*` | Máquina de estados com `FOR UPDATE`, mais autorização por canal. Executável só pela service_role | Teste SQL e `segurancaMigrations.test.ts` |
| `fn_portal_assinaturas` e `fn_broker_portal_assinaturas` | Leitura dos portais por token | Token falso devolve `valid:false` |
| `assinatura_validar` | Validação pública (anon), com CPF mascarado | Não devolve caminho de arquivo |
| Triggers de nova versão | Versão nova do mesmo tipo cancela o envelope ativo | Teste SQL |
| `scripts/teste-assinatura-interna.sql` | Prova dos itens acima em BEGIN…ROLLBACK | Roda sem erro e imprime todos os OK |
| Reversão (`scripts/reverter-assinatura-interna.sql`) | Arquivo de DROPs versionado. **Só roda com autorização** | O arquivo existe |

### F2: Edge Function `assinatura-interna` e helpers compartilhados

| Item | O que muda | Como sei que terminou |
|---|---|---|
| `supabase/functions/_shared/assinaturaPropagar.ts` | Lógica de propagação extraída de `processarWebhook`, e usada também pelo webhook do ZapSign | `__tests__/assinaturaPropagar.test.ts` |
| `supabase/functions/_shared/portalAcesso.ts` | `garantirTokenDoPortal` e `linkDeAcesso`, extraídos de `portal-invite-user` | O convite continua igual, e a suíte do convite passa |
| `supabase/functions/_shared/resend.ts` | `enviarEmail` | Usado pela função nova |
| `supabase/functions/assinatura-interna/` | `index.ts` com as ações `criar`, `ver`, `pedir_codigo`, `assinar`, `finalizar` e `cancelar`; `regras.ts` (puro); `pdf.ts` (manifesto e QR); `emails.ts` | `__tests__/assinaturaInternaRegras.test.ts`; curls no bundle publicado (sem header → 401; só a chave anon → 401; token falso → 403; 6 pedidos de código → 429) |
| `supabase/config.toml` | `verify_jwt = false` para a função nova | Diff |

### F3: Lado de quem assina

| Item | O que muda | Como sei que terminou |
|---|---|---|
| `components/assinatura/FluxoDeAssinatura.tsx` | Passos: ler o PDF, digitar CPF, pedir código, digitar os 6 dígitos, marcar o aceite, assinar | `check-ui-standard`; Playwright a 390 px |
| `services/assinaturaInternaService.ts` | Chama a função nova. Não manda `organizationId` | Testes unitários |
| `components/ClientArea.tsx` | Cartão "N documentos para assinar" e lista dos assinados | Roteiro no portal |
| Rota `/assinar` (testemunha) e `?assinar=` (membro) | Testemunha assina sem login; membro abre o fluxo dentro do app | Roteiro |
| `/publico/validar-assinatura/<id>` | Validação pública, reaproveitando `PublicDocumentoChecker` | O PDF baixado confere com o hash |

### F4: Lado de quem envia, na Emissão

| Item | O que muda | Como sei que terminou |
|---|---|---|
| `components/assinatura/EnviarParaAssinaturaSheet.tsx` e `EnvelopeStatusCard.tsx` | Envio e acompanhamento | Roteiro |
| `components/ContractDetailView.tsx` e `components/contracts/DocumentVersionsPanel.tsx` | Escolha "No portal (sem custo)" ou "ZapSign" | O ZapSign fica intacto |
| `services/contractDocumentVersionService.ts › remove` | Recusa apagar versão com envelope | Teste |

### F5: Negociação

| Item | O que muda | Como sei que terminou |
|---|---|---|
| `components/DealModal.tsx` | Aba "Documentos" para venda e locação: upload por tipo e envio para assinatura | Roteiro com venda de 2 compradores, representante, 2 testemunhas e corretor |
| `propertyExportService.generateProposalPDF` | Passa a devolver Blob, e `baixarProposta` mantém o download | Teste |

### F6: Portal do Corretor

| Item | O que muda | Como sei que terminou |
|---|---|---|
| `components/BrokerPortal.tsx` e `components/broker/BrokerPortalMobile.tsx` | Cartão de documentos para assinar | O corretor assina pelo portal |

### F7: opcional, depois

Selo PAdES com o certificado A1 da empresa. Não muda a validade jurídica e tem custo técnico alto.

## Estado

- [x] F1: Banco. Migration aplicada em 21/11/2026 via `db query -f`. A prova `scripts/teste-assinatura-interna.sql` dá TUDO OK (18 itens), e `check-rls-postura.sh` passa limpo nas 9 verificações
  - Ajuste: `profiles` está vazia, então o CPF do representante vem de `employees.user_id`; sem cadastro no RH, vale o CPF informado no envio
  - `assinatura_validar` entrou na lista de funções públicas permitidas do `check-rls-postura.sh`, com o mesmo critério do `doc_gen_validar`
- [x] F2: Edge Function. `assinatura-interna` v1, `sign-contract` v7 e `portal-invite-user` v6 publicadas em 21/11/2026, sem mudar o `verify_jwt` de nenhuma
  - Curls na versão publicada: `criar` sem header → 401; só com a chave anon → 401; token de portal falso → 403; membro ou cancelar sem header → 401
  - Sonda 8 do `check-rls-postura.sh` inclui a função; postura limpa nas 9 verificações
  - `deno check` limpo; o carimbo foi conferido em PDF real (rodapé, manifesto, QR)
  - **Não feito por curl:** os 6 pedidos de código → 429. Precisaria de um envelope real em produção, que é imutável e não se apaga. O limite está provado no SQL (item 8) e no mapa 54000 → 429 (`assinaturaInternaRegras.test.ts`)
  - Ajuste: o e-mail do comprador leva o link do portal **com o token** (`/portal-cliente?token=…&assinar=…`), o mesmo mecanismo do link do portal. Ele não precisa criar senha, e o código por e-mail é o fator extra. Por isso o `portalAcesso.ts` não gera link de convite
- [x] F3: Lado de quem assina. Telas prontas:
  - `FluxoDeAssinatura` e `DocumentosParaAssinar`;
  - Portal do Cliente: pendências em qualquer aba, assinados só em Contratos;
  - `/assinar` (testemunha), `?assinar=` (membro) e `/publico/validar-assinatura/<id>`.

  Verificado:
  - `tsc` sem erros; `check-ui-standard` limpo nos 5 componentes novos; travas de UI e `orgContextGuard` passam.
  - Playwright no Vite da frente, a 390 px e a 1440 px, com a Edge e as RPCs **simuladas**: 19 checagens no fluxo da testemunha e na validação, mais 8 no cartão do portal.
  - **O que não foi visto:** a ida e volta real com e-mail e banco. Fica para o roteiro de ponta a ponta depois da F4, quando dá para enviar pela tela.

  Encontrado e corrigido na tela:
  - O roteador de abas (`syncViewToUrl`) reescrevia o `#` para `#/central` antes de a página da testemunha ler o token. Agora o `App` captura o fragmento na 1ª renderização.
  - O tour de primeiro acesso abria por cima do painel de assinar. Quem chega por `?assinar=` vê o tour na próxima visita.
  - Desvio do plano: a validação pública é um componente próprio (`PublicAssinaturaChecker`), porque os campos do ofício (tipo, número, destinatário) não se aplicam. Os dois usam o mesmo `sha256DeArquivo`.
- [~] F4: Emissão — código pronto; **falta** o roteiro na tela real, que precisa de login (ver Verificação)
  - Na tabela de versões: coluna "Assinatura" com o provedor (ZapSign ou portal) e ação "Enviar para assinatura no portal", só em versão emitida; o motivo aparece quando a ação está desligada.
  - "Acompanhar a assinatura": signatários, cancelar (`useConfirm`), finalizar de novo, "Assinar agora" para o representante e abrir a via assinada.
  - `remove` e a lixeira recusam versão com envelope.
  - O cartão do ZapSign recusa versão em assinatura no portal.
  - Verificado: `tsc` sem erros, `check-ui-standard` limpo, `ContractDocumentosTabela` e `ContractEmissaoDocumentoUnico` passam, e o teste novo `assinaturaEnvioComprador` também.
- [~] F5: Negociação — código pronto; **falta** o roteiro na tela real, que precisa de login
  - Aba "Documentos" no `DealModal`, para venda e locação, só com a negociação gravada. Tabela `DocumentosDaNegociacaoPanel` com tipo, documento, versão, assinatura e data.
  - "Novo documento" (só PDF) e "Gravar proposta", que exige a negociação salva: a proposta gravada é a prova do que foi proposto.
  - Ações "Enviar para assinar" e "Acompanhar".
  - `propertyExportService.proposalPdfBlob` gera a mesma proposta do botão, como arquivo (teste `propostaComoArquivo`).
  - Verificado: `tsc` sem erros, `check-ui-standard` limpo, os 3 testes do `DealModal` e o `orgContextGuard` passam.
- [~] F6: Portal do Corretor — código pronto; **falta** o roteiro na tela real
  - `DocumentosParaAssinar portal="corretor"` no desktop (`BrokerPortal`) e no celular (`BrokerPortalMobile`), com pendências e assinados.
  - O tour não abre na visita que chega por `?assinar=`.
  - Verificado: `tsc` sem erros; `BrokerPortalMobile` e `brokerPortalTabsMobile` passam.

## Verificação

Roteiro de ponta a ponta, rodado depois da F5:

- Um comprador no celular (390 px) assina pelo portal.
- A testemunha assina numa aba anônima.
- Quando o último assina, sai o e-mail com o PDF final.
- O QR do PDF abre a validação, e o PDF baixado confere com o hash.
- Uma versão nova do documento cancela o envelope.
- Um CONTRATO assinado aparece como "Assinado" no portal; uma MINUTA assinada não muda o contrato.

## Ajuste de 22/11/2026: bloco "Assinatura eletrônica" da negociação

### Pedido original

> "em comercial > locacoes : veja print que so existe a opcao com o zapsign."

O print mostra o bloco "Assinatura Eletrônica — Powered by ZapSign" em Negociação › Contrato › Dados do contrato.

### Causa

O bloco (`DealSignaturePanel`) ficou de fora da F4/F5. A opção sem custo existia só em dois lugares:
- na linha da versão emitida, em Contrato › Documentos (sub-aba que só existe na locação);
- na aba "Documentos" da negociação.

No lugar onde o usuário assina o contrato, só aparecia o ZapSign, e o ZapSign continua sem `ZAPSIGN_API_TOKEN`.

### Correção

- O bloco agora tem duas opções: **"No portal (sem custo)"**, que é o padrão, e **"ZapSign"**. Uma negociação que já tem `signature_token` abre no ZapSign.
- **No portal:** assina uma **versão** do documento do contrato (`origem CDV`), a mesma da Emissão, e o "assinado" sobe para o contrato pela regra única de `_shared/assinaturaPropagar.ts`.
  - O usuário escolhe a versão. Abre escolhida a que está em assinatura; se não houver, a última emitida do tipo Contrato.
  - Sem versão, o bloco oferece "Gerar documento do contrato".
  - Sem contrato, o bloco diz para gerá-lo.
- O motivo de não poder enviar (`motivoNaoEnviaAoPortal`) e o rótulo do status (`assinaturaDaVersao`) mudaram de `DocumentVersionsPanel` para `contractDocumentVersionService`: é uma regra só para a Emissão e para a negociação.
- **ZapSign:** a lógica não mudou; o visual passou ao guia (§8, §17, §21, sem caixa alta e sem roxo).
- Teste: `__tests__/components/DealSignaturePanel.test.tsx`.

## Tela de assinatura (22/11/2026)

### Pedido original

> "assinar contrato no portal do cliente em formato de drawer deixa a tela pequena dificultado a visualizacao pelo cliente muito ruim com UX ruim. sugiro transformar em tela. Faça sua sugestão"

Sugestão aceita: "Aprovado. inclusive o opcional". O opcional é exigir a leitura até a última página e registrá-la na trilha.

### O que mudou

- **`FluxoDeAssinatura` virou tela.** Ocupa a tela inteira por cima de tudo (portal no `<body>`, `z-[1000]`).
  - Computador: documento à esquerda e painel de assinar fixo à direita (400 px).
  - Celular: documento em tela cheia com barra fixa "Assinar →" e uma etapa própria para confirmar.
  - As 5 entradas (portais Cliente e Corretor, testemunha, representante, Acompanhar) não mudaram: a interface do componente é a mesma.
- **`PaginasDoPdf`:** desenha as páginas com o `pdfjs-dist`, na largura do espaço, com zoom e só as páginas perto da área visível. Informa a página atual, a última vista e se chegou ao fim (`leituraDoScroll`, função pura).
- **Leitura obrigatória:** o "Assinar" só libera depois da última página, e o motivo aparece à vista.
  - Se o PDF não desenhar, abrir o arquivo à parte libera a assinatura, e isso fica registrado como `PDF_EXTERNO`.
  - A Edge (`validarLeitura`) exige `modo: TELA` com `ultima_pagina >= paginas` e `chegou_ao_fim`.
  - O banco grava a leitura em `assinatura_eventos.dados.leitura` do evento `ASSINOU` (migration `aplicar_20271122400000_assinatura_leitura.sql`, `p_leitura jsonb DEFAULT NULL`).
- **Histórico do navegador:** a tela empilha uma entrada. "Voltar" do navegador, a seta, o Esc e "Voltar aos documentos" fecham a tela e devolvem à lista. A página da testemunha limpa o token num `useLayoutEffect`, antes desse empilhamento.

### Verificado

- `scripts/teste-assinatura-interna.sql` no banco remoto (ROLLBACK): TUDO OK, incluindo a prova nova de que a leitura chega ao evento `ASSINOU`.
- Vitest:
  - `TelaDeAssinatura`: tela, leitura, PDF externo, voltar e `leituraDoScroll`;
  - `assinaturaInternaRegras`: `validarLeitura`;
  - mais 16 arquivos das telas que abrem a assinatura e das travas.
- `deno check` da Edge.
- Chrome real (Playwright, Edge simulada, PDF fictício de 6 páginas), a 1440 px e a 390 px:
  - o PDF desenha;
  - o "Assinar" fica desligado até o fim;
  - a leitura enviada foi `{modo: TELA, paginas: 6, ultima_pagina: 6, chegou_ao_fim: true}`;
  - "voltar" fecha a tela e a URL fica sem token;
  - nenhum erro de página.
