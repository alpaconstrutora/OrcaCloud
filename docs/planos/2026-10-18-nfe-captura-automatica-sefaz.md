# Captura automática de NF-e pela SEFAZ (NFeDistribuicaoDFe) → Documentos fiscais

## Pedido original

> existe alguma sistema gratuito para puxarmos as notas fiscais emitidas diretamente para o modulo documentos fiscais?

> Sessão: f812e674-a197-49fa-85e7-2dc65f5b7169 · 18/10/2026

Resposta dada na sessão (resumo): o caminho gratuito é o web service oficial
**NFeDistribuicaoDFe** do Ambiente Nacional, com o certificado A1 da empresa e a
**Ciência da Operação** (manifestação do destinatário) para liberar o XML
completo. CT-e, NFS-e nacional e XML por e-mail ficam como complementos. Foi
oferecido fazer o plano, e o usuário respondeu:

> sim

> 18/10/2026, mesma sessão.

## O que já existe (levantado no código e no banco em 18/10/2026)

| Peça | Onde | Estado |
|---|---|---|
| Upload manual de XML | `services/nfeService.ts` › `uploadNFe` | Storage `fiscal-documents` → `raw_documents` → `processing_jobs` (`parse_nfe`, `queued`) |
| Processamento | `supabase/functions/fiscal-nfe-processor` | gate `chamadaDeCron`; `acquire_job`; parse com `fast-xml-parser`; lê `nfeProc`/`NFe` |
| Idempotência | `raw_documents` | `UNIQUE (access_key)` e `UNIQUE (source_hash)` — **globais, não por organização** |
| Quem enviou | `raw_documents.upload_user_id` | `UUID NOT NULL` — um robô não tem usuário |
| Certificado A1 | `companyService.uploadCertificado` → bucket `company-certificates` | colunas `companies.certificado_digital_url`, `certificado_validade`, `sefaz_integrada` |
| Certificados enviados | banco | **0 de 3 empresas** têm certificado; nenhuma com `sefaz_integrada` |
| Senha do certificado | — | **não existe onde guardar** |
| Cofre de segredos | `email_capture_guardar_segredo` / `email_capture_ler_segredo` (Vault) | modelo a copiar |
| Cron autenticado | `aplicar_20271015110200_email_capture_cron.sql` | `net.http_post` + `fn_cron_secret()` |
| mTLS em Edge Function | — | **nenhuma função usa `Deno.createHttpClient`**; não está provado que o runtime do Supabase aceite certificado de cliente |
| Notas hoje | `nfe_invoices` | 124 notas, 1 organização, emissão de 24/09/2014 a 28/06/2026 |

⚠️ **Achado de segurança:** a policy `cert_select_org_member`
(`20260702000001_company_finance_tax_config.sql`) deixa **qualquer membro** da
organização baixar o `.pfx`, e não só owner/admin. Sem senha o arquivo vale
pouco, mas quando a senha passar a existir no sistema esse desenho precisa
estar fechado (REGRA #7, pergunta 1). Corrigir ANTES de guardar a senha (item 1.1).

## Decisões pendentes com o usuário

| # | Pergunta | Recomendação |
|---|---|---|
| D1 | Ciência da Operação automática para toda nota que chegar só como resumo? | **Sim, automática.** Ciência não confirma nem recusa a operação, só libera o XML. Confirmação, Desconhecimento e Operação não Realizada **nunca** automáticos. |
| D2 | `UNIQUE (access_key)` global: mudar para `(organization_id, access_key)`? | Mudar. Num SaaS, uma organização não pode impedir outra de importar a mesma nota. Hoje há só 1 organização com notas, então a troca é barata. |
| D3 | Quem pode enviar o certificado e a senha? | Só owner/admin da organização dona da empresa. |
| D4 | Escopo da Fase 1 | Só NF-e de entrada (empresa como destinatária). CT-e, NFS-e e e-mail na Fase 5. |
| D5 | (nova, 18/10, depois do spike) Onde roda a chamada à SEFAZ, já que a Edge Function não serve? | Pendente. Opções: Function Node na Vercel (`api/`, o projeto já publica lá; conferir se o plano da Vercel permite uso comercial e o tempo máximo de execução) ou um servidor Node próprio. O resto do desenho (Storage → `raw_documents` → `processing_jobs`) não muda. |

| Data | Pergunta | Resposta |
|---|---|---|
| 18/10/2026 | D1 — Ciência automática para nota que chega só como resumo? | **Sim.** |
| 18/10/2026 | D2 — Duplicidade por organização (`organization_id, access_key`)? | **Sim.** |
| 18/10/2026 | D3 — Certificado e senha só por owner/admin? | **Sim.** |
| 18/10/2026 | D4 — Primeira entrega só NF-e de entrada; CT-e e NFS-e depois? | **Sim.** |

## Plano

### Fase 0 — Spike: provar que dá para falar com a SEFAZ de dentro de uma Edge Function

Este é o maior risco técnico. Se ele falhar, o desenho muda, então vem antes de tudo.

> **Resultado 18/10/2026 — Edge Function do Supabase NÃO serve.** A SEFAZ pede o
> certificado do cliente por renegociação TLS, e o Deno (rustls) não renegocia:
> a conexão é derrubada. Em Node (OpenSSL) a renegociação acontece. Detalhes e
> medições em `docs/spikes/sefaz-dfe/README.md`. Pendente: decisão D5 (onde roda) e
> a prova final com um A1 real.

- [~] **0.1 `docs/spikes/sefaz-dfe/` — mTLS no runtime do Supabase.** ❌ No Supabase
  não funciona (rustls sem renegociação). ✅ Em Node 24 a renegociação acontece, com o
  certificado passado como PEM via `node-forge` (o OpenSSL 3 recusa PFX antigo) e
  HTTP/1.1. **Falta:** resposta 200 com `cStat`, que só sai com certificado A1 ICP-Brasil real.
  Texto original do item: uma função
  descartável abre um `.pfx` de teste (`node-forge` via esm.sh), gera PEM e chama
  `NFeDistribuicaoDFe` com `Deno.createHttpClient({ cert, key })`.
  **Terminou quando** a função publicada recebe um `retDistDFeInt` com `cStat`
  da SEFAZ (137, 138 ou até uma rejeição de schema), e não um erro de TLS.
  **Se falhar:** registrar aqui e decidir entre uma Function Node na Vercel
  (`https.Agent({ pfx, passphrase })`) e outro host. Não seguir para a Fase 2 sem essa decisão.
- [ ] **0.2 Mesmo spike — assinatura XML (XMLDSig) do evento de Ciência.** O evento
  210210 precisa ser assinado (RSA-SHA1 + C14N).
  **Terminou quando** um evento assinado no spike é aceito pela SEFAZ
  (`cStat` 135/136), ou recusado por regra de negócio e não por assinatura.
- [~] **0.3 Confirmar endpoints e limites na Nota Técnica vigente** (Portal da NF-e):
  URL de distribuição e de RecepcaoEvento do Ambiente Nacional, janela de 90 dias,
  regra de consumo indevido (656), e se o e-CNPJ da matriz consulta as filiais
  (CNPJ raiz). **Terminou quando** os quatro pontos estão escritos aqui, com a fonte.
  Levantado em 18/10/2026, por fontes secundárias (a NT oficial ainda precisa ser lida):
  - **Distribuição:** `https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx`
    respondeu no spike (TLS ok, cadeia SERPRO). RecepcaoEvento do AN: ainda não conferido.
  - **Janela:** documentos ficam disponíveis por até 3 meses após a recepção no AN
    (Focus NFe, resumo da NT 2014.002). Relato da comunidade ACBr: CNPJ que passa
    mais de 60 dias sem consultar tem a distribuição interrompida.
  - **656 (consumo indevido):** depois de `cStat` 137, ou com `ultNSU = maxNSU`, esperar
    1 hora. Consultar antes bloqueia o CNPJ por 1 hora. `consChNFe`/`consNSU`: no
    máximo 20 por hora (Focus NFe, NT 2014.002, vigência 10/03/2022).
  - **Filiais:** relatos da comunidade dizem que cada CNPJ precisa do próprio
    certificado e do próprio `ultNSU`; também há relato de 656 ao alternar CNPJs de
    mesma raiz. **Não confirmado em fonte oficial**; o desenho guarda o NSU por CNPJ.
  - Fontes: focusnfe.com.br/notas-tecnicas/nfe/2014-002/ ·
    focusnfe.com.br/blog/rejeicao-656/ · projetoacbr.com.br/forum (tópicos de distribuição DF-e).

### Fase 1 — Certificado e senha guardados com segurança

- [ ] **1.1 Migration: fechar `cert_select_org_member`** para owner/admin, ou tirar
  a leitura do navegador de vez, se só a Edge Function precisar do arquivo.
  **Terminou quando** um membro comum recebe 403 ao pedir URL assinada do `.pfx`
  (prova com o usuário de leitura) e `check-rls-postura.sh` passa.
- [ ] **1.2 Migration: senha no Vault** — `fiscal_cert_guardar_senha(company_id, senha)`
  e `fiscal_cert_ler_senha(company_id)`, no molde de `email_capture_*_segredo`.
  `REVOKE … FROM PUBLIC, anon, authenticated`; execução só por `service_role`.
  **Terminou quando** `segurancaMigrations.test.ts` passa e uma chamada com a
  chave anon/authenticated é recusada.
- [ ] **1.3 Edge Function `fiscal-certificado`** (gate `exigirGestor`). Recebe `.pfx` + senha,
  abre o certificado, lê CNPJ e validade, **confere que o CNPJ bate com o da
  empresa**, grava o arquivo, a senha no cofre e `certificado_validade`.
  Senha errada ou CNPJ divergente = erro claro, nada gravado.
  **Terminou quando** os três caminhos (ok, senha errada, CNPJ de outra empresa)
  respondem como descrito, e a sonda sem Authorization dá 401.
- [ ] **1.4 `components/CompanyDetailPage.tsx`** — campo de senha junto do upload;
  mostrar CNPJ e validade **lidos do certificado** (o formulário preenche sozinho).
  **Terminou quando** `check-ui-standard.sh` passa e a tela foi vista no navegador.

### Fase 2 — Consulta periódica à SEFAZ

- [ ] **2.1 Migration: estado por empresa** — `fiscal_dfe_sync` (`company_id`, `organization_id`,
  `cnpj`, `ult_nsu`, `max_nsu`, `proxima_consulta_em`, `ultimo_cstat`, `ultimo_erro`,
  `ativo`). RLS de leitura para membros; escrita só pelo service.
  **Terminou quando** a tabela existe e `segurancaMigrations.test.ts` passa.
- [ ] **2.2 Migration: origem do documento** — `raw_documents.upload_user_id` passa a
  aceitar NULL e ganha `origem` (`upload` | `sefaz_dfe`), com CHECK que exige
  usuário quando `origem = 'upload'`. Aplicar D2 aqui, se aprovada.
  **Terminou quando** um insert com origem `sefaz_dfe` e sem usuário passa, e um
  `upload` sem usuário é recusado.
- [ ] **2.3 `supabase/functions/_shared/sefazDfe.ts`** — funções puras: montar o
  `distDFeInt` (distNSU), ler o `retDistDFeInt`, descompactar `docZip`
  (base64 + gzip) e classificar por schema (`procNFe`, `resNFe`, `procEventoNFe`, `resEvento`).
  **Terminou quando** os testes Vitest em `__tests__/sefazDfe.test.ts` cobrem os
  quatro schemas e os `cStat` 137/138/656 com XML de exemplo.
- [ ] **2.4 Edge Function `fiscal-dfe-sync`** (gate `chamadaDeCron` ou `exigirGestor`
  para o botão "Buscar agora"). Por empresa ativa e fora do intervalo de espera:
  consulta lotes até `ult_nsu = max_nsu` (teto de lotes por execução); `procNFe`
  entra pela **mesma porta do upload** (Storage → `raw_documents` → `processing_jobs`);
  chave já existente = duplicada, não erro; `resNFe` vai para a fila de ciência (3.1);
  `137` → espera 1 h; `656` → espera mais longa e registra.
  **Terminou quando** uma nota real emitida contra o CNPJ aparece em Documentos
  fiscais sem upload manual, e a sonda sem header dá 401.
- [ ] **2.5 Migration: `cron.schedule` de hora em hora** com `fn_cron_secret()`.
  **Terminou quando** `cron.job_run_details` mostra execuções com sucesso e
  `net._http_response` traz 200.

### Fase 3 — Ciência da Operação (depende de D1)

- [ ] **3.1 Migration: `fiscal_dfe_resumos`** — chave, emitente, CNPJ, valor, emissão,
  situação, `ciencia_em`, `ciencia_cstat`, `xml_recebido_em`.
  **Terminou quando** os resumos da 2.4 são gravados lá.
- [ ] **3.2 `_shared/sefazEvento.ts` + passo no `fiscal-dfe-sync`** — assina e envia o
  evento 210210 para os resumos sem ciência; o XML completo chega numa consulta seguinte.
  **Terminou quando** uma nota que chegou só como resumo vira `procNFe` em Documentos fiscais.

### Fase 4 — Tela

- [ ] **4.1 `components/fiscal/FiscalDocuments.tsx`** — coluna/indicador de origem
  (Upload | SEFAZ); botão "Buscar na SEFAZ agora", que, desligado, diz o motivo
  (sem certificado, vencido, aguardando o intervalo da SEFAZ); data da última consulta;
  lista "Aguardando XML" com os resumos.
  **Terminou quando** `check-ui-standard.sh` passa, a tela foi vista no navegador
  e o relatório lista o CHECKLIST DE APLICAÇÃO item a item (REGRA #1).
- [ ] **4.2 Aviso de certificado vencendo** (30 dias antes) e de sincronização parada.
  **Terminou quando** o aviso aparece com um certificado de validade próxima.

### Fase 5 — Complementos (fora da primeira entrega; cada um ganha plano próprio)

- [ ] CT-e pela distribuição de CT-e (mesmo certificado).
- [ ] NFS-e pelo Padrão Nacional (API do ADN), conferindo a adesão dos municípios das obras.
- [ ] XML recebido por e-mail: reaproveitar `email-capture-sync` para mandar anexos `.xml` ao módulo fiscal.

## Estado

- [x] Levantamento do que existe — 18/10/2026
- [x] Decisões D1–D4 com o usuário — 18/10/2026, as quatro aprovadas como recomendado
- [ ] Fase 0 — 0 de 3 concluídos; 0.1 e 0.3 parciais (ver itens); 0.2 não iniciado.
  Bloqueado por D5 e por um certificado A1 real para a prova final.
- [ ] Fase 1 — 0 de 4
- [ ] Fase 2 — 0 de 5
- [ ] Fase 3 — 0 de 2
- [ ] Fase 4 — 0 de 2

## Verificação de ponta a ponta

1. Empresa com certificado A1 válido e senha guardada (Fase 1).
2. Um fornecedor emite NF-e contra o CNPJ da empresa.
3. Em até 1 h, sem nenhum upload, a nota aparece em Documentos fiscais com origem
   SEFAZ, itens e classificação feitos pelo `fiscal-nfe-processor`.
4. Se ela veio só como resumo, a ciência é enviada e o XML completo chega na consulta seguinte.
5. Subir à mão o mesmo XML resulta em "já importada", não em nota duplicada.
6. Sondas sem Authorization em `fiscal-certificado` e `fiscal-dfe-sync` respondem 401.

## Limites conhecidos (não são defeito)

- A SEFAZ só entrega documentos dos últimos **90 dias**; o histórico entra por upload.
- Consultar sem documentos novos antes do intervalo gera bloqueio temporário (656).
- Sem certificado A1 da empresa, nada disso funciona — hoje nenhuma das 3 empresas tem.
