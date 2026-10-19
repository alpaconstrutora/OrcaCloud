# Gerar pelo modelo — Credor vem do contrato, e a gaveta vira modal

## Pedido original

> ao clicar em gerar pelo modelo, abre-se o drawer (Gerar pelo modelo ):
> 1. trocar o nome do campo cliente para Credor.
> 2. O contrato ja sabe quem é o credor então não ha necessidade de perguntar para usuário novamente.
> 3. campo o drawer tela apenas um item (campo Modelo), substituir drawer por modal

(com print da gaveta "Gerar pelo modelo — CTS-010-036-0002": Modelo *, Cliente "Sem cliente")

Esclarecimento do usuário, mesma sessão:

> 1. Pedidos numca tera cliente, sera sempre fornecedor.
> 2. Aba dados gerais > campo Fornecedor é onde informado o Fornecedor
> 3. Com o passo 2, o app pode buscar em minha organizacao > fornecedor todos os dados referente ao credor / fornecedor

Sessão: Claude Code (VS Code) · 19/10/2026.

## Diagnóstico

- A gaveta (`components/EmitDocumentModal.tsx`) oferecia um seletor de **cliente** (tabela
  `clients`). Contrato de Suprimentos não tem cliente: tem `supplier_id` (Dados Gerais ›
  Fornecedor). CTS-010-036-0002: fornecedor Débora Cristina Duarte, `client_id` nulo.
- O catálogo de campos (`services/docxFieldCatalog.ts`) não tinha grupo de fornecedor. O
  modelo ativo mapeia a parte contratada ({010}–{018}) pelo grupo "Compradores", que cai no
  `client` — vazio em Suprimentos. Escolher alguém no seletor não resolvia: só clientes.

## Decisões

| Data | Pergunta | Resposta |
|---|---|---|
| 19/10/2026 | De onde vem o credor? | Do contrato: Dados Gerais › Fornecedor, dados completos do cadastro em Minha Organização › Fornecedores (resposta do usuário acima) |
| 19/10/2026 | Modelos já mapeados em "Cliente/Compradores" | Em contrato COM fornecedor e SEM cliente, essas origens leem o fornecedor — o modelo atual preenche sem remapear. Grupo novo "Credor (fornecedor)" para modelos novos |

## Plano

### 1. `services/docxFieldCatalog.ts`
- **Muda:** `ResolveContext.supplier`; grupo novo `supplier` "Credor (fornecedor)" (nome,
  CPF/CNPJ, tipo, contato, e-mail, telefone, endereço por partes e completo, qualificação);
  `fornecedorComoCliente(s)` — o fornecedor no formato de `Client`, para as origens
  `client`/`buyers`.
- **Pronto quando:** teste unitário resolve os campos do grupo novo e o "Compradores ›
  Nomes" a partir de um fornecedor.

### 2. `components/EmitDocumentModal.tsx`
- **Muda:** `Sheet` → `Modal` (UI_PATTERNS §5.2). Com `contract.supplier_id`: busca o
  fornecedor (`supplierService.getById`) e mostra **Credor** só leitura com o texto de apoio
  "Dados Gerais › Fornecedor"; sem seletor. Com cliente no contrato: **Cliente** só leitura.
  Seletor só quando o contrato não tem nenhuma das duas partes.
- **Pronto quando:** teste com contrato de fornecedor mostra "Credor" + nome, nenhum seletor
  de cliente, e a pré-visualização com os campos do credor preenchidos.

### 3. Testes e portões
- **Pronto quando:** `EmitDocumentModalPadrao`, `GerarPeloModeloVersaoPdf` e os novos
  verdes; `check-ui-standard` = 0; `tsc` sem erro; suíte com a conta fechando.

### 4. Tela real + publicação
- **Pronto quando:** CTS-010-036-0002 › Emissão › Gerar pelo modelo abre modal com Credor =
  Débora Cristina Duarte e {010}–{018} preenchidos na pré-visualização; push e prova de produção.

## Estado

- [x] 1. Catálogo — grupo `supplier` "Credor (fornecedor)" + `fornecedorComoCliente`
      (`contact_name` NÃO vira representante legal: contato não é quem assina)
- [x] 2. Modal + Credor só-leitura (cliente só-leitura quando o contrato tem cliente; seletor só
      sem nenhuma parte); a lista de clientes nem é consultada em contrato de fornecedor; gerar
      fica desligado com o motivo enquanto o credor carrega
- [x] 3. Testes `__tests__/docxFieldCatalogCredor.test.ts` (6) e
      `__tests__/components/GerarPeloModeloCredor.test.tsx` (4) verdes, com os antigos da gaveta;
      `check-ui-standard` = 0; `tsc` exit 0; suíte 10.491 + 34 puladas = 10.525, 0 falhas
- [ ] 4. Tela real ✅ · publicação pendente

### Tela real (19/10/2026, Playwright, `c:/tmp/pwtest/verificar-gerar-credor.cjs`, só leitura)

CTS-010-036-0002 › Emissão › Gerar pelo modelo: modal central (role=dialog, aria-modal); Credor =
Débora Cristina Duarte; sem campo/seletor de cliente; nenhuma consulta a `clients`. Com o modelo
r1: {010} Débora Cristina Duarte, {011} Pessoa Física, {015} Cambuí, {016} MG, {018}
321.952.978-08. {012}–{014} vazios porque o cadastro da fornecedora só tem cidade/UF (rua,
número, bairro e CEP nulos em `suppliers`) — dado, não código.
