# Síndico como operador do condomínio — organização própria por condomínio

## Pedido original

Sessão de 21/10/2026, transcrito literalmente (continuação do Portal do Síndico,
`docs/planos/2026-10-20-portal-do-sindico.md`):

```
O sindico, sera o operador do sistema.
ele que vai lancar as notas, contas a pagar, cadastro de fornecedores. etc.
tudo isto deve estar disponivel para ele e tudo que for necessario para o funcionamento do condomnio
```

## Context

Pedido (21/10/2026, literal): "O sindico, sera o operador do sistema. ele que vai lancar as
notas, contas a pagar, cadastro de fornecedores. etc. tudo isto deve estar disponivel para ele
e tudo que for necessario para o funcionamento do condomnio"

O Portal do Síndico (20–21/10, no ar) é externo: ele lê o prédio, publica aviso, responde
chamado e aprova rateio. Operar o condomínio é usar o app interno (Contas a Pagar, Boletos,
Notas, Fornecedores, Contratos, Contas a Receber, Conciliação, Folha). Medido em produção:
o banco só isola por ORGANIZAÇÃO (`is_org_member`); as permissões por usuário do Financeiro
não têm efeito; o 010 e o 007 operam dentro da org da Alpa (2.476 lançamentos, 283
fornecedores). Logo: cada condomínio ganha organização própria, o síndico é membro só dela.

Plano versionado (REGRA #6): `docs/planos/2026-10-21-sindico-operador-org-condominio.md`
(pedido literal + decisões), com ponteiro no plano do Portal do Síndico. Frente: continuar
`C:\D\frentes\portal-sindico` (atualizar com origin/main antes).

## Decisões do usuário (21/10)

| Pergunta | Resposta |
|---|---|
| Isolamento | Organização própria por condomínio; síndico membro só dela; equipe da Alpa também membro |
| Histórico do 010/007 | Migrar tudo |
| Conta bancária | Condomínio terá conta própria (CNPJ dele) |
| Áreas do síndico | Contas a pagar + notas/boletos; Fornecedores + contratos; Contas a receber + cobrança; Conciliação + contas + folha |
| Cadastro do prédio | Fica na Alpa (empreendimento, torres, unidades, imóveis de locação); só a OPERAÇÃO migra, via `empreendimentos.condominio_org_id` |
| Caixa do histórico | Fica como está: títulos migrados seguem conciliados com o extrato da Alpa (conta "atende todas"); DRE da Alpa deixa de mostrar R$ 49,9 mil (010) e R$ 59,0 mil (007) |
| Papel do síndico | `admin` na org do condomínio; construtora `owner`, protegida por gatilho |
| CNPJ | Criar sem CNPJ por ora; preenche depois na matriz |

Recomendações adotadas (sem pergunta, registradas no plano versionado): 9 títulos do 007 na
org 003 ficam lá (5 linhas digitáveis/4 hashes são cópias); processos abertos ligados aos
títulos ficam na Alpa e são cancelados com motivo (nunca apagados) — **confirmar no ensaio a
lista antes de cancelar**; memórias de classificação da conciliação vão junto; "Todas" da
equipe passa a somar condomínios (REGRA #5 mantida).

## F1 — Fundação no banco + migração do 010 com reversão

Migrations (prefixos `aplicar_20271021500000…` a reconferir com `git ls-tree` + testes de
prefixo/segurança; aplicar com `db query -f`; REVOKE em toda função, REGRA #7):

1. `…500000_condominio_org_fundacao.sql`
   - `companies_tipo_check` aceita `condominio`; `fn_org_cria_matriz` usa esse tipo quando
     `settings.tipo='CONDOMINIO'`; `fn_org_preserva_tipo` impede usuário trocar `settings.tipo`
     (o `updateOrganization` regrava o settings inteiro); `fn_org_eh_condominio(uuid)`.
   - `empreendimentos.condominio_org_id` (FK, SET NULL) + `fn_org_do_condominio(emp)` =
     `coalesce(condominio_org_id, organization_id)`; policies SÓ DE LEITURA de empreendimento/
     torres/unidades para membro da org do condomínio (escrita segue com a Alpa).
   - `fn_unit_occupancies_org` passa a usar `fn_org_do_condominio`.
   - **Fecha vazamentos:** `fn_share_com_minhas_orgs` e `fn_incluir_org_nos_catalogos` pulam
     org de condomínio; ramo "todas" de `fn_orgs_atendidas_pela_conta` exclui org de condomínio
     (o Asaas/contas da Alpa não atendem o condomínio).
   - RPC `condominio_salvar_ficha` (lista fechada: CNPJ, razão social, instalação, multa/juros;
     síndico/mandato/exigência só para membro da org dona do prédio).
   - `fn_org_members_protege_owner` (admin não remove/rebaixa owner).
2. `…500100_condominio_migracao_funcoes.sql` — `condominio_migracao_registro` (lote, tabela,
   id, coluna, valor antigo/novo; nunca apagar), `fn_condominio_migracao_inventario` (ensaio:
   contagens, somas por CC, conflitos de UNIQUE, competências fechadas, o que fica de fora),
   `fn_condominio_migrar` e `fn_condominio_migracao_reverter`; só `service_role`.
   Ordem do migrar: checagens → CC 010 vira raiz da org nova (mantém código) → vínculo →
   dados por empreendimento (avisos, documentos, rateios+filhos, manutenção, ativos,
   building_systems copiados, ocupações, acessos, tokens do síndico, chamados) → financeiro
   pelo CC (contratos+filhos, internal_transactions, boletos+auditoria, invoices, recibos,
   dunning, supplier_payments, purchase_orders; `project_id` de projeto da Alpa vira NULL com
   registro) → compartilha os 5 fornecedores e os clientes das ocupações + síndico
   (`*_org_shares` + `is_shared`) → conferência (contagens = ensaio, somas por CC iguais, nada
   do CC 010 sobra na Alpa). Contrato e títulos SEMPRE juntos (UNIQUE `reference_id` e o sync
   recorrente buscam pela org).
   **Não migra:** `bank_transactions` (extrato é da conta; matches seguem válidos), empreendimento/
   torres/unidades/`commercial_properties`, garantias, audit logs, captura de e-mail, CCs
   019/029/008/014/017/027.
3. `…500200_portal_sindico_org_do_condominio.sql` — RPCs `sindico_portal_*` trocam
   `e.organization_id` por `fn_org_do_condominio(e.id)` (copiar do banco conferindo md5).
4. `…500300_condominio_010_executa.sql` — cria a org "Condomínio Galeria Altavista" (sem CNPJ,
   `settings.tipo='CONDOMINIO'`), membros da equipe (lista a confirmar na execução), plano de
   contas de condomínio, `asaas_charge_config`, numeração copiada pelo maior valor; chama
   `fn_condominio_migrar` com conferência embutida. Rodado antes em BEGIN…ROLLBACK.
5. `scripts/condominio-mover-anexos.mjs` — move arquivos dos buckets (`boletos`,
   `financial-receipts`, `condominio-documentos`, `financeiro-anexos`) da pasta da Alpa para a
   da org nova, atualiza paths, registra no lote; modo ensaio.
6. Código: `services/boletoService.ts:570-582` e `services/invoiceService.ts:24` mandam
   `organization_id` da origem ao criar nota (defeito que levaria nota do condomínio à Alpa);
   `services/empreendimentoService.ts` (coluna nova, `listCondominios` por
   `organization_id` OU `condominio_org_id`); `utils/orgDoCondominio.ts` + teste-catraca
   `__tests__/orgDoCondominioGuard.test.ts` (proíbe `empreendimento.organization_id` em
   `components/condominio/`); telas do módulo Condomínio passam a ler/gravar pela org do
   condomínio (`AtivosTab`, `ComunicacaoTab`, `CondominioDetail`, `DocumentosTab`,
   `FinanceiroTab`, `ManutencaoTab`, `OcupacoesTab`, `PortalCondominoAdmin`,
   `CondominiosModule`, `condominioRateioService`); Ficha salva pela RPC.

## F2 — Síndico operador + menu do condomínio

- `utils/menuDoCondominio.ts` + teste: contexto de condomínio (org ativa é condomínio, ou
  "Todas" com todas as orgs do usuário sendo condomínio) e a lista: Condomínios; Financeiro
  (pagar, boletos, receber, boletos ao cliente, conciliação, cobrança, aprovações,
  calendário); Contratos; Fornecedores; RH (colaboradores, folha, ponto, férias, rubricas);
  Fiscal/NF-e; Documentos; Ativos; Notificações/Tarefas; Minha Organização › Contas e Usuários.
- `components/Layout.tsx` (desktop e celular) e `components/AppRouter.tsx`: aplica a lista
  (também para admin); rota fora dela vai para Condomínios. Visual — o isolamento é do banco.
- Convite do síndico como operador: botão no `SindicoAcessoCard` chamando Edge `invite-member`
  (org do condomínio, papel `admin`, e-mail de `clients.email`); `invite-member` passa a recusar
  `owner` no corpo. Ele entra pelo Portal do Colaborador e continua podendo usar o Portal do
  Síndico (o resolver autoriza pelo e-mail, não pela membresia).
- `…500400_politicas_globais_escrita.sql`: escrita em `financial_categories`, `contract_types`,
  `supplier_categories` só da própria org (leitura de globais continua).
- `scripts/sonda-isolamento-condominio.sql`: com claims do síndico em bloco desfeito, contar
  linhas da Alpa visíveis nas tabelas de negócio → zero, salvo o compartilhado de propósito.

## F3 — 007

`…500500_condominio_007_executa.sql`: mesmo fluxo para o CC 011; 9 títulos da org 003 ficam;
ensaio em bloco desfeito primeiro; anexos pelo script.

## F4 — Conta própria, Asaas, folha, captura de e-mail, tela para os próximos

- Conta do condomínio cadastrada pelo gestor da org (`serves_all_organizations=false`);
  `fn_conta_asaas_da_org(org)` devolve a conta do condomínio, nunca a da Alpa.
- Asaas: **o usuário fornece** a chave da conta aberta no CNPJ do condomínio e os dados bancários.
- `…500600_condominio_rh_prerequisitos.sql`: `fn_condominio_copiar_rubricas` (cópia, não
  compartilhamento); FPAS/RAT de condomínio a confirmar com o contador.
- Captura de e-mail própria do condomínio.
- Botão "Criar organização do condomínio" na Ficha (016 e próximos sem migration).

## Verificação

1. Ensaio (`fn_condominio_migracao_inventario`) com números anotados no plano versionado.
2. Prova em BEGIN…ROLLBACK: migrar → conferir contagens/somas → reverter → diferença zero.
3. Execução real com conferência embutida; `count(*)` por org nas tabelas do inventário.
4. Sonda de isolamento = zero.
5. Playwright com conta de síndico de teste combinada com o usuário: menu reduzido, lançar
   conta a pagar, aprovar boleto (nota nasce na org certa), conciliar na conta própria, emitir
   cota, abrir anexo antigo; depois Portal do Síndico aprovando rateio. Zero erro JS/4xx/5xx.
6. Testes: catraca `orgDoCondominioGuard`, `menuDoCondominio`, migrations (prefixo/segurança),
   suíte inteira com a conta fechando; tipos pelo checador por arquivo; `check-ui-standard.sh`
   nos arquivos tocados; push em main e `conferir-producao.sh`.

## Estado

- [ ] F1 — fundação + migração do 010 (4 de 6, em 21/10/2026)
  - [x] `aplicar_20271021500000` APLICADA e conferida (tipo `condominio` no CHECK, coluna
    `condominio_org_id`, 3 políticas de leitura, 2 gatilhos; anon sem acesso à Ficha; o Asaas da
    Alpa segue atendendo as mesmas 4 orgs — nenhuma de condomínio ainda).
  - [x] `aplicar_20271021500100` APLICADA (só funções e a tabela de registro). **Ensaio do 010:**
    86 títulos = R$ 48.933,39; 24 boletos (+203 auditoria); 38 notas; 1 contrato (+11 filhos);
    3 rateios (+36 itens); 21 ocupações; 2 CCs (010 vira raiz, 029 filho); token do síndico;
    5 fornecedores e 8 clientes compartilhados; 1 sistema predial copiado. **0 bloqueios.**
    Fica: 22 linhas de extrato, 40 alertas "Título a pagar vencido" (process_instances, Alpa).
    Achado: 2 notas de boletos do 010 estão na org Garden (defeito da nota na org do
    fornecedor) — a migração só move o que está na Alpa.
    **Prova em bloco desfeito (21/10):** org criada com matriz `condominio`; migrar = 460 trocas +
    14 linhas criadas, 0 divergências; soma na org nova = R$ 48.933,39; Asaas da Alpa NÃO atende
    o condomínio; reverter = 0 divergências e contagens idênticas; nada ficou no banco.
  - [x] `aplicar_20271021500200` APLICADA (RPCs do síndico pela org do condomínio; sem efeito
    até existir o vínculo).
  - [x] Código (não publicado): `utils/orgDoCondominio` + catraca `orgDoCondominioGuard`, telas do
    condomínio pela org da operação, `listParaCondominios`, Ficha pela RPC (campos do síndico
    travados para quem não é da org dona, com o motivo), nota do boleto na org do boleto.
    Tipos 0 erros (227 arquivos), 144 testes verdes, UI limpa.
  - [x] `aplicar_20271021500300_condominio_010_executa.sql` — bloqueada pelo classificador em
    21/10; executada depois (lote `CONDO-010`, 599 registros; org "Condomínio Galeria Altavista",
    código 005 — conferido no banco em 24/10). Equipe decidida: owners altair.rosa@ e desenvolvedor@; membros bruna.pereira@
    e agente-leitura@.
  - [ ] Anexos (script de mover arquivos dos buckets).
- [ ] ~~F2 — síndico operador + menu~~ **DESCARTADA em 24/10/2026** pelo usuário: *"o sindico nao
  faz parte da construtora, e nao vai entrar no app. ele vai ter acesso ao que ele precisa para
  gerenciar o condominio apartir do portal do sindico"*. O síndico NÃO vira membro da org do
  condomínio. A gestão vai para o portal: `docs/planos/2026-10-24-portal-sindico-gestao-completa.md`.
- [x] F3 — 007 (24/10/2026): `aplicar_20271024905000_condominio_007_executa.sql` (renomeado de …900000 em 24/10: colidiu com `acesso_total_superadmins`, #147). Ensaio: 0
  bloqueios. **Achado na prova:** `fn_condominio_migrar` desliga os gatilhos (`fn_cm_gatilhos`) e
  a FK composta de Marcas e Modelos (`opura_assets (brand_id, organization_id)`, 13/10, depois da
  função) recusou levar 3 equipamentos com marca da Alpa (23503). Resolvido no roteiro: marca a
  NULL antes (lote `CONDO-007-MARCAS-A`), cópia das 2 marcas para a org nova e religação depois
  (`CONDO-007-MARCAS-B`). ⚠️ Vale para o 016 e os próximos (ou corrigir a função). Prova em bloco
  desfeito: migrar → 138 títulos = R$ 56.472,95, 187 boletos, 167 notas, nada do CC 011 na Alpa →
  reverter B, CONDO-007, A → contagens/somas da Alpa e equipamentos idênticos; nada ficou.
  Execução real: org "Condomínio Bella Vista" (código 006, `ba88199a…`), lotes CONDO-007 (3.323),
  MARCAS-A (3), MARCAS-B (5); `sindico_portal_financeiro` devolve o 007 com `podeOperar = true`.
  Desfazer: reverter `CONDO-007-MARCAS-B`, `CONDO-007`, `CONDO-007-MARCAS-A`, apagar a org.
  Anexos dos buckets não movidos (como no 010 — o resolvedor abre pelo caminho antigo).
- [ ] F4 — conta própria, Asaas, folha, captura, tela para os próximos
