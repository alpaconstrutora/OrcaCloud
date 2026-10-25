# DARF emitido pela Receita, direto do app (Integra Contador / SERPRO)

## Pedido original

Sessão `b6d95c39`, 25/10/2026:

> é possivel entrar no site da receita e preencher um darf automaticamente?

Respondi com três caminhos (robô no Sicalc Web — barrado por captcha; API oficial
Integra Contador do SERPRO; "copiar para o Sicalc" manual), recomendando a API, e
perguntei se a Alpa tem certificado e-CNPJ A1. Resposta, mesma sessão:

> Se quiser seguir, antes de qualquer código eu confirmo na documentação do SERPRO os nomes dos serviços, o preço por chamada e o fluxo de procuração, e monto o plano em docs/planos/. resposta: sim.
> Antes disso, uma pergunta: a Alpa já tem certificado e-CNPJ A1, o arquivo .pfx? É ele que a API usa.
> resposta: sim A1

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 25/10/2026 | Seguir pela API oficial (Integra Contador), com plano antes de código? | **Sim** |
| 25/10/2026 | A Alpa tem certificado e-CNPJ A1 (.pfx)? | **Sim, A1** |

### Decisões pendentes (perguntar antes da Fase 1)

| # | Pergunta | Minha recomendação |
|---|---|---|
| D1 | Quem contrata o Integra Contador, e de qual CNPJ é o A1? | **Um contrato só, da Alpa Construtora**, com o A1 dela. As outras empresas (ALPA Empreendimentos, Garden SPE, condomínios que tiverem folha) dão **autorização de acesso no e-CAC** à Alpa para o serviço 00103 "Acessar o sistema DCTFWeb". Sicalc não pede autorização. |
| D2 | Escopo da v1 | **DCTFWeb primeiro** (guia da competência: folha, retenções e, desde 01/2025, PIS/COFINS/IRPJ/CSLL pelo MIT). Sicalc em seguida, para o tributo avulso ou atrasado (um código de receita por guia). |
| D3 | Quem transmite a DCTFWeb hoje (contador externo?) | O app **não transmite declaração** na v1. Só emite a guia: da declaração ativa (`GERARGUIA31`) ou da em andamento (`GERARGUIAANDAMENTO313`). Transmitir (`TRANSDECLARACAO310`) fica fora. |
| D4 | Guia da Receita com total diferente do DARF agrupado no app | **Mostrar as duas somas e pedir confirmação.** Nunca alterar o valor dos tributos para "bater" com a guia. A divergência é informação (o contador declarou diferente do que o app calculou). |

## O que a pesquisa confirmou (25/10/2026)

Fonte principal: documentação oficial da API, `apicenter.estaleiro.serpro.gov.br/documentacao/api-integra-contador/`.

### Serviços (catálogo oficial)

| idSistema | idServico | O que faz | Tipo | Situação |
|---|---|---|---|---|
| SICALC | `CONSOLIDARGERARDARF51` | Calcula multa/juros e emite o DARF em **PDF** (`versaoSistema` 2.9) | Emitir | produção desde 23/09/2022 |
| SICALC | `GERARDARFCODBARRA53` | Idem, devolvendo o **código de barras** | Emitir | produção desde 04/12/2023 |
| SICALC | `CONSOLIDAR54` | Só calcula multa/juros, **sem emitir** | Consultar | produção desde 15/10/2026 |
| SICALC | `CONSULTAAPOIORECEITAS52` | Consulta códigos de receita do Sicalc | Apoiar | produção |
| DCTFWEB | `GERARGUIA31` | Guia (DARF) da declaração **ATIVA** — `categoria` (GERAL_MENSAL/40, GERAL_13o_SALARIO/41…), `anoPA`, `mesPA`, `idsSistemaOrigem` opcional | Emitir | produção |
| DCTFWEB | `GERARGUIAANDAMENTO313` | Guia de declaração **em andamento** (antes de transmitir) | Emitir | produção desde 28/03/2025 |
| DCTFWEB | `CONSRECIBO32`, `CONSDECCOMPLETA33`, `CONSXMLDECLARACAO38` | Recibo, declaração completa, XML | Consultar | produção |
| PAGTOWEB | `PAGAMENTOS71`, `COMPARRECADACAO72` | Pagamentos feitos e comprovante de arrecadação | Consultar/Emitir | produção |

Saída do `CONSOLIDARGERARDARF51`: `consolidado` (principal, multa, juros, total, `dataValidadeCalculo`),
`darf` (PDF base64), `numeroDocumento`, `qrCode` (PIX). Saída do `GERARGUIA31`: só `PDFByteArrayBase64`.

### Autenticação

1. `POST https://autenticacao.sapi.serpro.gov.br/authenticate`, `Authorization: Basic base64(consumerKey:consumerSecret)`,
   `Role-Type: TERCEIROS`, corpo `grant_type=client_credentials`, **com o e-CNPJ A1 do contratante na conexão TLS**.
   Devolve `access_token` + `jwt_token` (~2000 s; 401 = renovar).
2. Chamadas: `POST https://gateway.apiserpro.serpro.gov.br/integra-contador/v1/{Emitir|Consultar|Apoiar|Declarar}`,
   `Authorization: Bearer <access_token>`, `jwt_token: <jwt_token>`. Corpo: `contratante`, `autorPedidoDados`,
   `contribuinte` (`{numero, tipo: 2}`) e `pedidoDados` (`idSistema`, `idServico`, `versaoSistema`, `dados` = JSON em texto).
3. Chaves (consumer key/secret) ficam na Área do Cliente SERPRO até 10 min depois de assinar o contrato
   (`loja.serpro.gov.br/integracontador`). Cobrança por consumo, cancelável a qualquer momento.

**Teste de TLS feito em 25/10 (`openssl s_client`):** o servidor de autenticação manda "Acceptable client
certificate CA names" **no primeiro handshake** (TLS 1.2). O problema que impediu a SEFAZ na Edge Function
(certificado pedido por renegociação, que o Deno não faz — `docs/spikes/sefaz-dfe/README.md`) **não deve se
repetir aqui**. O gateway não pede certificado (só Bearer). Falta a prova com A1 e chave reais (item 0.1).

### Procuração

- Tabela oficial "Serviços × Procurações": Sicalc = **n/a**. DCTFWeb = procuração **00103 "Acessar o sistema DCTFWeb"**,
  exigida "quando o autor do pedido de dados não é o próprio contribuinte".
- Contratante = autor do pedido (Alpa) → **não precisa do Termo de Autorização** (`AUTENTICAPROCURADOR`, XML assinado),
  que é para o caso em que o autor é um terceiro diferente do contratante.
- Desde 05/12/2025 a procuração eletrônica do e-CAC virou **"autorização de acesso"**, e quem recebe precisa
  **aceitar em até 30 dias**, senão ela cai (fonte: blog e-Auditoria, não oficial — conferir no e-CAC na Fase 0).

### Preço

**Não confirmado.** A Loja SERPRO recusou a leitura automática (403). Única referência: o suporte do Domínio
(sem data) cita, na Faixa 1 (até 100 guias/mês), **Emitir R$ 0,32 · Consultar R$ 0,24 · Declarar R$ 0,40**.
Na escala da Alpa (6 empresas, ~1 a 3 guias por empresa por mês) seriam **poucos reais por mês**. A tabela real
é conferida na Loja durante a contratação (item 0.2).

### DCTFWeb × Sicalc (o que decide o desenho)

- Desde 01/2025, PIS/COFINS/IRPJ/CSLL entram na DCTFWeb pelo **MIT**. A guia da DCTFWeb (DARF numerado)
  junta, na mesma competência, eSocial (folha), EFD-Reinf (retenções) e MIT. Guia do Sicalc continua aceita
  **se usar o mesmo código de receita declarado**, mas não fica vinculada à declaração sozinha.
- **Guia do Sicalc = um código de receita.** Um DARF do app que agrupa PIS + COFINS não cabe numa guia do Sicalc,
  só na guia da DCTFWeb.
- **A guia da DCTFWeb reflete o que foi declarado** (pelo contador, via eSocial/Reinf/MIT), não o que o app calculou.
  Daí a D4.
- **FGTS não é DARF** (FGTS Digital/GFD). Nunca entra nesta integração.

## Contexto no app (lido de `origin/main` em 25/10/2026)

- **DARF agrupado já existe** (PR #80, `docs/planos/2026-10-21-agrupar-tributos-em-darf.md`): tabela `darfs` com
  `codigo_barras`, `numero_documento`, `documento_path` (bucket `financeiro-anexos`). Escrita só pelas RPCs `fn_darf_*`
  (SECURITY INVOKER, RLS `is_org_member`). Tela: `components/financeiro/DarfSheet.tsx` e `DarfsTab.tsx`;
  serviço: `services/darfService.ts`.
- **Certificado A1 já tem infraestrutura** (plano da NF-e SEFAZ, itens 1.1–1.4): `.pfx` no bucket
  `company-certificates` (só owner/admin), senha no Vault (`fiscal_cert_ler_senha`, só service_role),
  Edge Function `fiscal-certificado` que abre o `.pfx` com node-forge e confere senha, validade e CNPJ.
  **Em 25/10, nenhuma das 6 empresas tem certificado enviado.**
- **Tributo não tem código de receita.** O tipo está em `party_name` (`PIS`, `COFINS`, `INSS`, `IRRF`,
  `INSS (segurados)`, `INSS patronal (CPP)`, `RAT/GILRAT`, `Terceiros (outras entidades)`, `FGTS`…) e
  `source_system` (`COMMERCIAL`, `LABOR`, `PROLABORE`). Contagem em 25/10: 281 PIS, 281 COFINS, 195 INSS e
  30 IRRF comerciais; 9 de cada encargo da folha; nenhum em DARF ainda.
- O CNPJ da organização mora na **empresa matriz** (`companies.is_headquarters`). Cada org hoje tem uma empresa.

## Desenho

```
DarfSheet ─ "Emitir pela Receita" ─▶ Edge Function receita-darf (JWT do usuário)
                                      ├─ exigirGestor(org do DARF, lida da linha)
                                      ├─ contratante: A1 + senha (Vault) + consumer key/secret (Vault)
                                      ├─ POST /authenticate (mTLS) ─▶ token (cache em memória até expirar)
                                      ├─ DCTFWeb GERARGUIA31/313  ou  Sicalc CONSOLIDARGERARDARF51/53
                                      └─ devolve { pdf, numeroDocumento, codigoBarras?, total, multa, juros }
DarfSheet ─ compara total da guia × DARF do app (D4) ─▶ usuário confirma
          ─▶ darfService.editar(...)  (caminho que já existe: anexo + nº + código de barras pelas RPCs fn_darf_*)
```

- A Edge Function **não grava no DARF**: devolve a guia e o cliente grava pelo caminho de sempre (`darfService.editar`),
  sob as mesmas travas e RLS. Service role só para ler o A1, a senha e as chaves do SERPRO.
- Multa e juros calculados pelo Sicalc **preenchem os campos de multa/juros** do DARF (que já viram lançamento próprio).
  Nunca sobrescrevem um valor digitado sem mostrar a diferença (regra "o app já tem a informação, não sobrescreve o manual").
- Código de receita: **tabela de-para editável por organização** (tributo → código + extensão), com padrão sugerido e
  conferido pelo `CONSULTAAPOIORECEITAS52`. Nunca constante escondida no código.

## Plano

### Fase 0 — contratação e prova (sem código de produto)

| # | Arquivo / ação | O que muda | Como sei que terminou |
|---|---|---|---|
| 0.1 | `docs/spikes/serpro-integra-contador/README.md` + script descartável | Edge Function de teste autentica no SERPRO com o A1 real (`Deno.createHttpClient({cert, key})`, PEM via node-forge) e chama `CONSRECIBO32` de uma competência conhecida | `access_token` recebido **dentro da Edge Function** (não só no Node local) e resposta 200 do gateway, registrados no README sem dado fiscal |
| 0.2 | Loja SERPRO (usuário) | Contrato assinado pelo CNPJ decidido em D1; tabela de preços copiada para este plano | Chaves visíveis na Área do Cliente; preço por Emitir/Consultar anotado aqui com a data |
| 0.3 | e-CAC (usuário, em cada CNPJ ≠ contratante) | Autorização de acesso 00103 para o contratante, **aceita** dentro dos 30 dias | `CONSRECIBO32` de cada CNPJ responde 200 (não erro de permissão) |
| 0.4 | Certificado (usuário) | `.pfx` da Alpa enviado pela tela da empresa (`fiscal-certificado`) | `companies.certificado_vault_secret_id` preenchido na matriz da Alpa |

### Fase 1 — base

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1.1 | `supabase/migrations/aplicar_<prefixo>_serpro_credenciais.sql` | Consumer key/secret no Vault (`serpro_guardar/ler_credenciais`, só service_role, REVOKE + `auth.role()` por dentro, Regra #7) e qual empresa é a contratante | `SELECT` como `authenticated` em `fn` de leitura = 42501; como service_role devolve |
| 1.2 | `supabase/migrations/aplicar_<prefixo>_darf_codigo_receita.sql` | Tabela `darf_codigos_receita` (org, tributo, `codigo_receita`, `extensao`, `meio` DCTFWEB/SICALC), RLS `is_org_member` sem OR, padrão sugerido semeado | Query lista o de-para da Alpa; policy passa nas 3 perguntas da Regra #7 |
| 1.3 | `supabase/functions/_shared/serpro.ts` + `__tests__/serpro.test.ts` | Montagem pura do corpo (`contratante`/`autor`/`contribuinte`/`pedidoDados`), leitura da resposta (`dados` em texto, `mensagens`), classificação de erro (sem autorização, declaração inexistente, token vencido) | Vitest cobre corpo do 31, 313, 51 e 53 com os exemplos da documentação e os erros |
| 1.4 | `supabase/functions/receita-darf/index.ts` | Edge Function: `exigirGestor` pela org do DARF lida da linha; autentica (mTLS), chama o serviço, devolve a guia. Publicada com `--no-verify-jwt` + gate próprio | Sem credencial = 401; com anon = 401; membro não gestor = 403; gestor = guia |

### Fase 2 — DCTFWeb (D2)

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 2.1 | `services/receitaDarfService.ts` | Chama `receita-darf` com o DARF; escolhe 31 (declaração ativa) ou 313 (em andamento) | Teste com o cliente Supabase simulado cobre os dois caminhos e o erro "sem declaração" |
| 2.2 | `components/financeiro/DarfSheet.tsx` | Botão "Emitir pela Receita" (desligado com motivo quando falta certificado, contrato ou autorização); painel com total da guia × total do app (D4); "Usar esta guia" grava pelo `darfService.editar` | No navegador: DARF de teste recebe PDF e nº do documento; divergência aparece antes de gravar; `check-ui-standard.sh` limpo |
| 2.3 | `utils/darfPdf.ts` + teste | Extrai a linha digitável do PDF da DCTFWeb (o `GERARGUIA31` não devolve código de barras) | Teste com PDF real anonimizado devolve 48 dígitos que passam no `normalizarLinhaDigitavel`; se não der, o item vira "código digitado à mão" registrado aqui |

### Fase 3 — Sicalc (tributo avulso / atrasado)

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 3.1 | `services/receitaDarfService.ts` | DARF com **um** código de receita: `CONSOLIDAR54` para prévia de multa/juros, `CONSOLIDARGERARDARF51` + `53` para emitir | DARF com mais de um código de receita recusa o Sicalc com motivo ("use a guia da DCTFWeb") |
| 3.2 | `components/financeiro/DarfSheet.tsx` | Multa/juros do Sicalc propostos nos campos do DARF, mostrando a diferença para o digitado | No navegador: tributo vencido gera prévia; aceitar preenche multa/juros; o lançamento de multa/juros aparece em Contas a Pagar |

### Fora da v1

Transmitir declaração (`TRANSDECLARACAO310`); conferir pagamento pelo `PAGAMENTOS71` (candidato à v2, para baixa
automática); pagar o DARF pela Asaas; FGTS.

## Riscos

- **Edge Function × mTLS:** o handshake do SERPRO é padrão (testado), mas só a 0.1 prova. Plano B: Node no
  GitHub Actions (como a NF-e), que perde o "clicar e receber na hora".
- **Chave privada da empresa num serviço de terceiros:** o A1 só sai do Vault/bucket para a Edge Function, nunca
  para o navegador nem para log. Os logs da função não imprimem corpo de resposta (tem CNPJ e valores).
- **Divergência declarada × calculada** é esperada no começo. A D4 a mostra, não a esconde.
- **Autorização de acesso não aceita em 30 dias** cai em silêncio. O botão mostra o erro de permissão do SERPRO com
  o nome do CNPJ.

## Estado

- [x] Pesquisa da documentação, TLS do SERPRO testado (25/10/2026)
- [ ] D1–D4 respondidas
- [ ] Fase 0: 0 de 4
- [ ] Fase 1: 0 de 4
- [ ] Fase 2: 0 de 3
- [ ] Fase 3: 0 de 2

## Verificação (ponta a ponta)

1. Agrupar os tributos de uma competência já declarada num DARF → "Emitir pela Receita" → PDF anexado, nº do
   documento e código de barras preenchidos; total da guia igual ao do app, ou divergência mostrada antes de gravar.
2. Abrir o PDF anexado e conferir CNPJ, competência e valor contra o e-CAC.
3. Tributo vencido sozinho → prévia do Sicalc com multa/juros → emitir → multa/juros viram lançamento próprio.
4. Usuário não gestor: botão desligado com motivo; chamada direta à função = 403.

## Fontes

- [Documentação Integra Contador (SERPRO)](https://apicenter.estaleiro.serpro.gov.br/documentacao/api-integra-contador/): catálogo de serviços, quick start, Serviços × Procurações, AUTENTICAPROCURADOR, `GERARGUIA31`, `CONSOLIDARGERARDARF51`
- [Loja SERPRO — Integra Contador](https://www.loja.serpro.gov.br/integracontador)
- [Domínio — custos da API Integra Contador](https://suporte.dominioatendimento.com/central/faces/solucao.html?codigo=10776) (preço da Faixa 1, sem data)
- [e-Auditoria — autorização de acesso e-CAC](https://www.e-auditoria.com.br/blog/api-do-e-cac-via-integra-contador-guia-completo/) (mudança de 12/2025, fonte não oficial)
- [Foco Tributário — DARF numerado no SicalcWeb](https://focotributario.com.br/sicalcweb-disponib-darf-numerado-dctf/) (DCTFWeb × Sicalc)
