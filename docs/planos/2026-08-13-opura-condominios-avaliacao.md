# ÒPURA Condomínios — Avaliação da proposta e caminho recomendado

**Data do pedido:** 2026-08-13
**Estado:** avaliação concluída e aprovada. **Módulo Comercial › Condomínios criado; F1 (manutenção NBR 5674) escrita — migration `...000018` ainda NÃO aplicada.** **F0: migration APLICADA e conferida** (13/08/2026) — bloco 8 devolveu os 8 contadores esperados: `tabela=1, com_rls=1, policies=4, anon_policies=0, fks=2, uidx_responsavel=1, trigger_org=1, status_em_operacao=1`. Falta provar os invariantes em runtime e construir a tela.
**Piloto definido:** `010 - Galeria Altavista`.

---

## Pedido original

Mensagem do usuário, transcrita literalmente (sessão de 2026-08-13):

> avalie:
> ÒPURA Condomínios
> Objetivo
>
> Administrar condomínios residenciais, comerciais e mistos, cobrindo operação, finanças, manutenção, comunicação e governança.
>
> Perfis de usuário
> Administradora de condomínios
> Síndico e subsíndico
> Conselho fiscal
> Porteiro e zelador
> Morador, proprietário ou inquilino
> Prestador de serviço
> Contabilidade
> MVP recomendado
> 1. Cadastro do condomínio
> Blocos, torres, unidades, garagens e áreas comuns
> Proprietários, moradores e inquilinos
> Fração ideal e responsabilidade financeira
> Mandatos de síndico e conselho
> Documentos, convenção e regulamento interno
> 2. Financeiro condominial
> Plano de contas por condomínio
> Orçamento anual
> Rateio ordinário e extraordinário
> Cobranças recorrentes
> Boletos e Pix
> Contas a pagar e receber
> Fundo de reserva e fundos específicos
> Inadimplência, multa, juros e acordos
> Conciliação bancária
> Prestação de contas mensal
> Balancete e demonstrativo por unidade
>
> O rateio precisa aceitar diferentes critérios:
>
> Fração ideal
> Valor igual por unidade
> Consumo individual
> Bloco ou grupo de unidades
> Valor fixo
> Fórmula personalizada
> 3. Comunicação e atendimento
> Mural de avisos
> Notificações por aplicativo, e-mail e WhatsApp
> Chamados e ocorrências
> Enquetes
> Registro de reclamações
> Histórico de comunicação por unidade
> Confirmação de leitura
> 4. Assembleias
> Convocação
> Pauta e documentos
> Controle de presença
> Procurações
> Votação presencial, híbrida ou digital
> Peso de voto configurável
> Geração de ata
> Assinatura eletrônica
> Arquivamento das deliberações
> 5. Reservas
> Salão de festas, churrasqueira, academia e outras áreas
> Agenda e regras de utilização
> Limite por unidade
> Taxa de reserva e caução
> Aprovação automática ou manual
> Checklist de entrega do espaço
> 6. Manutenção e operação
>
> Aqui existe uma vantagem competitiva para o ÒPURA, pois o sistema já possui conhecimento de obras e manutenção:
>
> Plano de manutenção conforme NBR 5674
> Equipamentos e ativos do condomínio
> Manutenções preventivas e corretivas
> Ordens de serviço
> Checklists de inspeção
> Contratos de manutenção
> Alertas de vencimento
> Garantias da construtora e dos fornecedores
> Histórico técnico do edifício
> Integração com módulos existentes
> Módulo existente	Aplicação no condomínio
> Financeiro	Contas, conciliação, cobrança e relatórios
> DMS/Documentos	Convenção, atas, contratos e certificados
> Manutenção NBR 5674	Plano preventivo e histórico técnico
> Gestão de bens	Elevadores, bombas, portões e equipamentos
> Portal de parceiros	Prestadores e empresas de manutenção
> Tarefas	Ocorrências, inspeções e ordens de serviço
> Contratos	Limpeza, segurança, elevadores e seguros
> Portal do cliente	Pode evoluir para Portal do Condômino
> Qualidade/Entrega	Transferência das garantias da obra
> WhatsApp	Avisos, cobranças e atualizações de chamados
> Diferencial estratégico
>
> O diferencial não deveria ser apenas "administrar condomínio". Esse mercado já possui sistemas especializados. A proposta mais defensável seria:
>
> Da construção à operação do edifício, com todo o histórico técnico, documental e financeiro conectado.
>
> Quando a construtora entrega o empreendimento, o ÒPURA poderia criar automaticamente:
>
> Condomínio
> Blocos e unidades
> Cadastro inicial dos proprietários
> Manual do proprietário
> Manual das áreas comuns
> Equipamentos instalados
> Garantias
> Plano inicial de manutenção
> Documentação técnica
> Pendências da entrega
> Fases posteriores
> Controle de acesso e visitantes
> Encomendas e correspondências
> Leitura de água, gás e energia
> Gestão de funcionários e escalas
> Livro de ocorrências da portaria
> Marketplace de serviços
> Aplicativo do morador
> Gestão de múltiplos condomínios para administradoras
> Auditoria financeira com IA
> Previsão de inadimplência
> Assistente para dúvidas sobre convenção e regulamento
> Integração com portarias remotas e dispositivos IoT
> Recomendação de posicionamento
>
> Eu começaria pelo pós-obra e manutenção condominial, conectado ao Portal do Cliente, e não por uma solução completa para administradoras. Isso reduz bastante o escopo e explora uma vantagem que sistemas tradicionais dificilmente têm: receber o edifício diretamente dos módulos de incorporação, engenharia, entrega e garantias do ÒPURA.
>
> Nome interno sugerido: ÒPURA Condomínios.
> Entidade central no sistema: Condomínio → Blocos → Unidades → Ocupações, mantendo separadas a propriedade do imóvel, a ocupação e a responsabilidade financeira.

### Decisões travadas na mesma sessão (respostas do usuário)

- **Caixa condominial:** "Sim, mas depois de um portão." — F1 sai sem dinheiro de condomínio; financeiro condominial só entra como fase pós-portão, se o piloto provar demanda.
- **Cliente pagante do piloto:** "A própria construtora (pós-entrega)."

---

## Veredito

**A recomendação de posicionamento no fim do documento está certa. O "MVP recomendado" no meio dele a contradiz** — os 6 blocos descrevem um concorrente completo da Superlógica, não um MVP. Descartando o MVP e ficando com a recomendação, a ideia é viável e tem vantagem real e verificável no código.

---

## O que já existe (verificado no código, não presumido)

| Peça | Situação real | Onde |
|---|---|---|
| **Fração ideal** | Existe e é **calculada** pelo motor NBR 12721 — ver ressalva abaixo | `empreendimento_units` (`20261231000013_area_engine_empreendimento_writeback.sql`), `services/areaEngineService.ts:1714` |
| Empreendimento → Torre/Bloco → Unidade → Área comum | Cadastro maduro (área privativa/comum/total, pavimento, tipologia) | `components/empreendimento/`, `services/empreendimentoService.ts` |
| Boleto + PIX + webhook | Ponta a ponta, com idempotência | `supabase/functions/asaas-charge/`, `asaas-webhook/` |
| Régua de cobrança (dunning) | Pronta, canal só e-mail | `dunning_rules`/`dunning_events`, `services/dunningService.ts` |
| Conciliação bancária | Alta maturidade, matching contra o razão | `services/bankReconciliationService.ts` + ~11 tabelas |
| Rateio com invariante no servidor | Por **imóvel**; bases `PRIVATE_AREA`/`EQUAL`/`MANUAL`; soma travada = valor do lançamento | `fn_set_property_allocations`, `lib/rentalAllocation.ts` (com teste) |
| Balancete / DRE / orçamento anual | `fn_balancete`, `fn_dre`, módulo FP&A | `components/BalanceteReport.tsx`, `components/fpa/` |
| Assinatura eletrônica (ZapSign) | Madura, mas acoplada a contratos/deals | `supabase/functions/sign-contract/` |
| **Garantia / assistência técnica** | `ABERTO→TRIAGEM→EM_GARANTIA→VISITA_AGENDADA→EM_REPARO→CONCLUÍDO` | `components/WarrantyModule.tsx`, `warranty_terms`/`warranty_claims` |
| **Qualidade / patologias** | O aggregate mais valioso do repo: evidência, SLA por cron, contestação, atribuição de responsabilidade — já modela `empreendimentoId/blocoId/torreId/unidadeId/ambienteId/componenteId` | `20260514000000_create_quality_module.sql`, `20260514000002_quality_sla_cron.sql` |
| Chamados + OS do cliente | `client_requests` + `client_service_orders`, já com categorias prediais | `20261201000001_client_portal_requests_os.sql` |
| Ativos | CRUD completo, com manutenção preventiva/corretiva e documentos | `opura_assets`, `components/OpuraAssetsModule.tsx` |

**A vantagem competitiva real não é "conhecimento de obras" genérico** — é a fração ideal calculada pelo motor de áreas somada ao par Qualidade+Garantia já ancorado na unidade. Nenhum sistema condominial tradicional tem isso, porque nenhum participou da incorporação.

### ⚠️ Ressalva sobre a fração ideal (verificada em 2026-08-13)

`writeBackFractionsToEmpreendimento` tem **um único ponto de chamada**: um botão em `components/AreaEngineModule.tsx:623`. Para `fracao_ideal_decimal` estar preenchida, quatro condições manuais precisam ter acontecido, nessa ordem:

1. o empreendimento foi processado pelo motor de áreas;
2. as unidades da versão têm `source_empreendimento_unit_id` (vieram do importador — unidades criadas à mão no editor são **contadas e ignoradas**, `areaEngineService.ts:1736`);
3. a versão está `calculada`/`aprovada`/`travada` (draft, superseded e cancelled são recusadas);
4. alguém clicou no botão de escrita reversa.

**Não é automático.** Se na prática esse botão nunca foi clicado, o diferencial de F2 vira digitação manual. É a primeira coisa a conferir — ver Verificação.

---

## O que não existe (e a proposta subestima)

1. **Entidade "Condomínio" — não existe.** Hoje "condomínio" é só uma *categoria de cliente/projeto* (`constants/clientCategories.ts`).
2. **Ocupação — não existe, e é o buraco central.** Não há morador, residente, coproprietário, nem vínculo unidade↔usuário do portal. Grep por `morador|inquilino|resident` só retorna RH; grep por `occupanc` só retorna taxa de ocupação/vacância. A proposta identifica isso corretamente no último parágrafo — é o primeiro tijolo.
3. **NBR 5674 — zero ocorrências no repositório.** Pior: **manutenção não tem periodicidade**. `opura_asset_maintenances` tem `scheduled_date`, mas não há coluna de recorrência/próximo vencimento em lugar nenhum. Plano cíclico é construção, não adaptação.
4. **OS de manutenção predial — `work_orders` não serve.** É `project_id NOT NULL`, com `phase`, `budget_item_ref`, `planned_productivity`, `measurement_unit`, `team_id → labor_teams`, e status que termina em `measured`. É OS de **produção de obra medida**. Forçar manutenção predial ali contamina os dois domínios.
5. **Reservas de áreas comuns — inexistente.** `empreendimento_common_areas` é cadastral (nome, categoria, área, pavimento): sem capacidade, horário, regra, taxa. `reservation` no repo é de equipamento/almoxarifado.
6. **Assembleia / ata / quórum / procuração — inexistente.** Único vestígio: `investor_announcements.type='assembleia'`, um rótulo de comunicado com voto sim/não/abstenção.
7. **Mural de avisos condominial — inexistente.** Existem `communications` (RH/obra) e `investor_announcements` — públicos errados.
8. **Multa/juros de inadimplência própria — inexistente.** Os campos `multa`/`juros_dia` em `boletos` são *parse de boleto de terceiro*, não motor de cálculo.
9. **Acordo / parcelamento de dívida — inexistente.**
10. **Prestação de contas condominial — inexistente.** Balancete e DRE existem, mas prestação de contas de condomínio tem forma legal própria e aprovação em assembleia.

---

## Os cinco erros da proposta

1. **O MVP não é um MVP.** Seis blocos; só o financeiro condominial tem 12 itens e o rateio pede 6 critérios. É o produto inteiro, e contradiz a recomendação do próprio documento.

2. **"Portal do Cliente pode evoluir para Portal do Condômino" esconde um bloqueio concreto.** O Portal do Cliente é **token público sem login** (`client_portal_tokens`: 1 token por cliente, 90 dias). Serve para um comprador; **não serve para 200 moradores** com dados financeiros individuais. E o eixo é `cliente → obra/contrato`, nunca `cliente → unidade`. Evoluir exige autenticação real + eixo novo — não é ajuste de aba.

3. **Três linhas da tabela de integração são otimistas.** "Manutenção NBR 5674" não existe (o que existe é manutenção de frota). "Tarefas → ordens de serviço" não se aplica (`work_orders` é de produção). "Gestão de bens" existe como cadastro, mas as categorias são `equipamento|ferramenta|veiculo|tecnologia|imovel|mobiliario` — sem taxonomia de sistemas prediais e sem garantia de fornecedor por equipamento.

4. **Risco arquitetural: uma quinta hierarquia paralela.** O repo já carrega 4 módulos concorrentes de planta e o histórico do "Centro da Verdade" do Empreendimento. Se "Condomínio → Blocos → Unidades" nascer como árvore nova ao lado de `empreendimentos → towers → units`, cria-se divergência permanente entre o prédio-que-foi-vendido e o prédio-que-é-operado. **Condomínio tem que ser um estado do ciclo de vida do empreendimento, não uma entidade irmã.**

5. **Segregação de caixa é requisito legal, não escolha técnica.** Quando o portão do financeiro abrir, dinheiro de condomínio não pode encostar em razão de construtora — e `internal_transactions` é razão único.

   **Resolvido em 13/08/2026, e melhor do que eu supunha:** não é padrão a inventar. **Cada empreendimento já é uma organização-SPE própria** — o caso documentado é `a2c4b292` = "Construção do Edifício Garden Cambuhy SPE", com imóvel, prédio e negociação todos nela. E a cascata "filho herda a org do pai" já está travada no banco por três triggers aplicados (`20270821000001/2/3`). Logo o condomínio nasce como `organization_id` próprio pelo caminho que o sistema já percorre; a segregação de caixa vem de graça.

   **A lição que vem junto** (mesmo diagnóstico, 21/07/2026): recurso "do grupo" precisa de escopo multi-org, não por-org — foi assim que o dropdown de Corretor apareceu vazio, porque os corretores estavam na org do grupo e a negociação na SPE. Vale para o condomínio: prestador de serviço e contrato de facilities provavelmente são do grupo, não do condomínio.

---

## Caminho recomendado

Com o pagante sendo a construtora e o caixa atrás de um portão, o produto **não é administração de condomínio**: é a **operação do edifício entregue**, vendida a quem o entregou. Rótulo interno mais honesto: **ÒPURA Pós-Entrega**; "Condomínios" fica reservado para depois do portão financeiro.

### F0 — Ocupações

**Decisão do usuário (13/08/2026): a pessoa é `clients`.** Morador e inquilino viram registro em `clients`, herdando a dedup por CPF/CNPJ que já existe (`20270716000002_document_duplicate_lookup.sql`) e dando âncora de login para F3. Descartadas: tabela `people` nova (criaria segundo cadastro de pessoa, com o mesmo CPF em dois lugares) e `client_id` opcional com campos soltos (sem dedup, e F3 ficaria sem saber a quem dar login).

| Item | O que muda | Como sei que terminou | Estado |
|---|---|---|---|
| `unit_occupancies` | `unit_id`, `client_id`, `role` (PROPRIETARIO / INQUILINO / MORADOR / RESPONSAVEL_FINANCEIRO), `started_at`, `ended_at`, `organization_id` | Migration aplicada; RLS `is_org_member`; zero policy para `anon`; bloco 8 devolve os 8 contadores esperados | ✅ **APLICADA e conferida** — `aplicar_20270905000017_condominio_ocupacoes.sql` |
| Invariante do responsável financeiro | Índice único parcial: um `RESPONSAVEL_FINANCEIRO` vigente por unidade | Tentar inserir o segundo dá `duplicate key` | ✅ **PROVADO** — `23505` em `uidx_unit_occupancies_um_responsavel` |
| Cascata de org | Trigger `trg_unit_occupancies_org`: herda do empreendimento via tower; `RAISE` se divergente | Inserir com org errada de propósito levanta "Filho herda a org do pai" | ✅ **PROVADO** — `P0001` em `fn_unit_occupancies_org()` linha 19 |
| Estado `EM_OPERACAO` + dados do condomínio | Novo status no CHECK + `condominio_cnpj`, `condominio_razao_social`, síndico e mandato | Empreendimento muda para `EM_OPERACAO` sem quebrar espelho de vendas nem de locações | ✅ CHECK aplicado; ⏳ transição não exercitada na UI |
| Tela de Ocupações | Aba "Ocupações" em `EmpreendimentoDetail`; `components/empreendimento/OcupacoesTab.tsx` + `services/unitOccupancyService.ts` | Cadastrar proprietário que não mora + morador que não paga, e os papéis aparecem distintos na unidade — **verificado no navegador** | ✅ escrita; `tsc` limpo e `check-ui-standard.sh` sem violações; ⏳ **NÃO verificada no navegador** |
| **Não** criar árvore de blocos/unidades | Reusar `empreendimento_towers`/`empreendimento_units` | Nenhuma tabela nova de bloco/unidade na migration | ✅ cumprido |
| Fração ideal | Ler `fracao_ideal_decimal` já gravada; nunca redigitar | Tela mostra a fração do motor e sinaliza "não informada" quando ausente, em vez de campo vazio editável | ⬜ **no piloto ela é sempre ausente** (`com_fracao=0`) — a tela tem de tratar isso como o caso normal, não como exceção; entrada da convenção vai para F2 |

Trava de prefixo (`__tests__/migrationsPrefixo.test.ts`) rodada com a migration nova: **3/3 passando**.

Regras da casa que se aplicam: REGRA #5 (org vem de `useOrgContext`, nunca `organizations[0]`), REGRA #1 (rodar `check-ui-standard.sh` nos arquivos tocados), REGRA #4 (`UI_PATTERNS.md` antes de escolher Sheet/modal/página).

### 🏠 O módulo — Comercial › Condomínios (pedido de 13/08/2026)

Pedido do usuário: *"Vamos criar um espaço dedicado ao condomínio em Comercial < condomínios"*, com escopo **lista + ficha + Ocupações + Manutenção**, e Ocupações **saindo** de Empreendimentos.

Ressalva registrada e vencida pelo usuário: Empreendimentos mora em *Incorporação*, então Condomínios em *Comercial* separa as duas metades da vida do mesmo edifício. Precedente a favor: Locações também é operação pura e já mora em Comercial.

| Item | O que muda | Estado |
|---|---|---|
| `components/condominio/CondominiosModule.tsx` | Lista só os `empreendimentos` EM_OPERACAO; trazer é ação explícita | ✅ **revisto em 14/08/2026** — ver abaixo |

**Correção de 14/08/2026 — "nem todo empreendimento terá condomínio".** Pedido do usuário: *"nem todo impreendimento tera condomínio. Pois tem impreendimento que será servico por exemplo"*. A primeira versão exibia **todo** empreendimento ENTREGUE como candidato, o que enchia a tela de prédios que nunca serão condomínio e obrigava a ignorá-los para sempre.

Agora: botão **"Importar empreendimento"** abre um painel com os disponíveis (estágio, cidade, tipo) e você marca quais viram condomínio — o de serviço é só não marcar. **`EM_OBRAS` entra na lista de propósito**: dá para preparar o condomínio antes da entrega, que é o handoff da F2. **A ação é reversível** ("Tirar de Condomínios" devolve para ENTREGUE) e não destrói nada — não há cópia de torres nem unidades, é o mesmo registro, então ocupações e plano de manutenção continuam gravados.

Duas divergências do guia corrigidas na mesma passagem, ambas apontadas pela verificação estrutural: o botão "Abrir" duplicava o clique na linha (§9.1) e havia duas ações em texto azul lado a lado (§9.2). A coluna "Situação" foi removida — com a lista contendo só condomínios, todo valor era idêntico.

**Dois defeitos encontrados usando o painel com dado real (14/08/2026):**

1. **`ENCERRADO` estava excluído dos disponíveis, e era erro.** Encerrado é a **incorporação**, não o prédio — é justamente quando o empreendimento deixa de ser empreendimento e passa a ser só condomínio, ou seja, o candidato mais maduro. O filtro levou o usuário a **mudar o status de um registro real** (`007 - Bella Vista`) para contornar a tela. Filtro que faz alguém adulterar dado é pior que filtro nenhum. Agora o único critério é "ainda não é condomínio".

2. **O painel não dizia que recorta por organização.** Dos 15 empreendimentos, 6 não apareciam por serem de outras orgs (4 em *Altair Pereira da Rosa*, 2 em *Garden Cambuhy SPE*) — e nada na tela explicava. **O recorte está certo** e não foi alterado: é a REGRA #5, e a lista de condomínios filtra igual; importar um empreendimento de outra org o tornaria condomínio *na org dele*, sumindo da lista atual — pior que o sintoma. O que faltava era **contar**: o painel agora avisa qual organização está mostrando e que há outras em "Todas as organizações", e em modo "Todas" mostra a organização de cada linha, porque o condomínio nasce na org do empreendimento.
| `components/condominio/CondominioDetail.tsx` | Abas Ficha / Ocupações / Manutenção. Ficha grava CNPJ do condomínio, razão social, instalação e mandato do síndico, com aviso de mandato vencido | ✅ |
| Ocupações sai de Empreendimentos | `git mv` para `components/condominio/`; a aba foi removida de `EmpreendimentoDetail` com comentário explicando por quê | ✅ |
| Rota e menu | `case 'condominios'` em `AppRouter` (sem props — lê `useOrgContext`), item em Comercial no `Layout` | ✅ |
| Permissão | Entra sob `canViewSales`/`crm`, a mesma do menu onde mora. **Não** foi criada chave nova: o app já tem ~85 módulos declarados e só ~11 chaves lidas | ⚠️ decisão consciente |

### F1 — Manutenção predial NBR 5674 (a fase pesada)

É onde está a vantagem, e é o que a construtora paga para não ser processada.

**Implementada e APLICADA em 13/08/2026** — `aplicar_20270905000018_condominio_manutencao_nbr5674.sql`. Bloco 10 conferido: `tabelas=4, com_rls=4, policies=16, anon_policies=0, uidx_plano_vigente=1, trigger_ciclo=1, fn_next_due=1, cols_assets=4`. ~~⏳ Falta a semente do bloco 9 (12 sistemas prediais)~~ — ✅ **aplicada** (conferido em 27/08/2026: `building_systems` = 12 linhas). ⏳ Falta o teste do ciclo em runtime (concluir uma OS e ver `next_due_date` andar).

| Item | O que foi feito | Como sei que terminou |
|---|---|---|
| `building_systems` | Taxonomia por organização (elevador, bomba, SPDA, gerador, fachada…), com `norm_ref`. Catálogo, não enum — o rol muda por tipologia. Semente da NBR 14037 comentada no bloco 9 | Catálogo populado e selecionável no item do plano |
| Ativos instalados | **Sem tabela nova**: `opura_assets` ganhou `empreendimento_id`, `building_system_id`, `supplier_id` e `supplier_warranty_until`. `category` é VARCHAR livre, então "sistema_predial" entra sem DDL de constraint | Elevador cadastrado aparece sob o edifício, não sob a frota |
| **Periodicidade** | `periodicity_value` + `periodicity_unit` (DIA/SEMANA/MES/ANO) e `next_due_date`. **É a coluna que não existia em lugar nenhum do repositório** — sem ela, manutenção é agendamento avulso | Item trimestral gera a próxima data ao concluir a ordem |
| `maintenance_orders` | Tabela nova, irmã de `work_orders`: sem `project_id` obrigatório, sem `phase`, sem `planned_productivity`, sem `measurement_unit` e sem status `measured` | OS abre, executa e fecha sem tocar em `work_orders` |
| O ciclo anda sozinho | `trg_maintenance_order_completed` + `fn_maintenance_next_due` recalculam `next_due_date` a partir da execução. O client **relê**, não recalcula — dois lugares calculando a mesma data é um deles errado sem ninguém saber qual | Concluir OS ligada ao plano muda o vencimento; bloco 11 tem o teste |
| Garantia de fornecedor | `supplier_warranty_until` no ativo, distinta da garantia construtora→cliente de `warranty_terms` | ⚠️ coluna existe; **sem tela e sem alerta** |
| Alertas de vencimento por cron | ✅ **Implementado em 14/08/2026** — `aplicar_20270905000020_manutencao_alertas_cron.sql`. SQL puro + `pg_cron` diário às 09h UTC, molde `20261202000002` (não o de Qualidade, que precisa de edge function: aqui a regra é comparação de datas, e função no banco não falha por deploy nem por segredo do vault ausente) | Chamar `fn_maintenance_due_alerts(30)` duas vezes: a 2ª devolve **0** |

**Como o alerta não vira ruído:** a marca é o par (`alerted_for_due_date`, `alerted_stage`), não um `alert_sent_at` solto. Cada vencimento avisa duas vezes no máximo — uma ao entrar na janela de 30 dias (`PROXIMO`) e outra ao passar da data (`VENCIDO`, mais grave, por isso dispara de novo em vez de silenciar). Quando a OS é concluída e `next_due_date` anda, o item volta a ser elegível **sozinho**, sem ninguém limpar marca.

✅ **PROVADO EM RUNTIME (14/08/2026)** com dado real do Galeria Altavista: item vencendo em 27 dias classificado `PROXIMO`, item vencido há 13 dias classificado `VENCIDO`, ambos com `alerted_for_due_date` gravado — e a **2ª chamada devolveu 0**, que é a idempotência funcionando.

**Só plano `VIGENTE` cobra** — alertar sobre rascunho treinaria o usuário a ignorar o alerta. **Destinatário:** membros da organização (`organization_members.email`). O síndico não entra: ainda não tem login, e o Portal do Condômino é F3. **`link` fica nulo de propósito** — o app não tem roteamento por URL, então um link não levaria a lugar nenhum.

**Invariantes do banco:** um plano `VIGENTE` por edifício (índice único parcial) e OS `CONCLUIDA` obriga `executed_date` (CHECK) — sem a data, o ciclo para de andar em silêncio.

| Item | O que muda | Como sei que terminou |
|---|---|---|
| `building_systems` | Taxonomia de sistemas prediais (elevador, bomba, SPDA, gerador, hidráulica, fachada…) | Catálogo populado e selecionável; segue REGRA #5 para "Todas as organizações" |
| Ativos instalados | Reusar `opura_assets` com `parent_asset_id` + categoria nova de sistema predial | Um elevador cadastrado aparece sob o edifício, não sob a frota |
| `maintenance_plans` / `maintenance_plan_items` | **Periodicidade e próximo vencimento** — a coluna que não existe em lugar nenhum do repo | Plano com item trimestral gera a próxima data corretamente ao concluir uma execução |
| `maintenance_orders` | **Tabela nova**, irmã de `work_orders`: sem `project_id` obrigatório, sem medição de produção; ancorada em ativo + sistema + unidade | OS de manutenção abre, executa e fecha sem tocar em `work_orders` |
| Garantia de fornecedor por equipamento | Hoje só existe construtora→cliente em `warranty_terms` | Equipamento com garantia de fornecedor alerta antes do vencimento |
| Alertas de vencimento | Reusar o padrão de cron já provado em `20260514000002_quality_sla_cron.sql` | Cron dispara e o alerta chega; verificado com data forçada |

### 🔗 Ponte com Locações — importar ocupações dos contratos (pedido de 14/08/2026)

**Pedido original, literal:**

> conectar condomínio com locações:
> 1. crie opcao de importar ocupacões dos contratos de locacão

**Decisões travadas pelo usuário na mesma conversa:** o locatário vira **INQUILINO *e* RESPONSÁVEL FINANCEIRO**; contratos **encerrados entram como histórico**, além dos vigentes.

> ### ⚠️ ÂNCORA INVERTIDA EM 14/08/2026 — leia antes do resto desta seção
>
> **Pedido do usuário, literal:** *"a ancora para as unidades vem de empreendimento e nao mais de contratos dos módulos de venda e locacao. destes modulos vem os proprietarios e locatorios apenas"*.
>
> **Por que a versão original falhou.** Percorrendo contratos e resolvendo a unidade no fim, unidade não publicada num eixo simplesmente **não aparecia** — e a tela ainda culpava a falta de contrato. Foi o que fez a importação de vendas parecer quebrada, quando o real era que as 12 unidades do Altavista estavam publicadas só no eixo de locação.
>
> **Como ficou.** O empreendimento manda: **toda unidade aparece na prévia**, e Locação e Venda entram só para responder quem é o locatário e quem é o proprietário. Unidade sem resposta vira **lacuna visível**, que é informação — diz onde falta cadastro.
>
> **Três consequências:**
> 1. **O contrato deixou de ser obrigatório.** Ele é gerado por um botão (`DealModal.handleGenerateContract`), então uma venda pode estar completa sem nunca ter virado `CV-`. A âncora da pessoa passou a ser `commercial_deals` (com `type` SALE/RENTAL); o contrato entra como reforço, dando número e data formal quando existe. **Isso encerra a questão da âncora** sem precisar contar quantos `CV-` existem.
> 2. **Reserva não é posse.** Só `CONTRATO`/`ASSINATURA`/`COMPLETED` geram ocupação; `RESERVA`/`IN_NEGOTIATION`/`PENDING`/`WAITING_PAYMENT` aparecem como "negociação em andamento", visíveis mas sem criar dono errado.
> 3. **O responsável financeiro deixou de depender da ordem de importação** — é decidido numa passagem só: locatário quando existe, senão proprietário. A "ordem decide" que eu tinha documentado como desejável era, na verdade, fragilidade.
>
> **A TABELA da aba também virou ancorada na unidade (14/08/2026).** Pedido do usuário: *"quando importar um impreendimento, importar também as unidades, indepedente se estão locadas ou vendidas. Sempre carregar as unidades"*. A aba listava **ocupações**, então unidade sem ninguém era invisível — e "nenhuma ocupação" e "nenhuma unidade" davam a mesma tela em branco. Agora: unidade sem ocupante vira linha própria marcada "Sem ocupante"; unidade com proprietário e inquilino vira duas linhas; a fração ideal passa a vir da **unidade** (que é onde o dado mora) e não da ocupação; e ocupação órfã — cuja unidade saiu da lista — aparece mesmo assim, em vez de sumir em silêncio.
>
> **Não há importação de unidades, e não vai haver:** o condomínio É o empreendimento, então as unidades já são dele. Carregar é leitura; copiar criaria duas listas do mesmo prédio divergindo com o tempo.
>
> **Duas reversões do que havia sido combinado**, ambas decorrentes da inversão: o **trilho de eixo** (Locações/Vendas) deixou de existir — os dois são resolvidos na mesma prévia; e **contratos encerrados não entram mais como histórico** — a visão por unidade é um retrato do agora. Restaurar o histórico seria uma segunda passagem sobre contratos encerrados, alimentando `ended_at`.

**A corrente já existe inteira** — só nunca foi percorrida até o fim. `EspelhoLocacoesTab.tsx` para no imóvel (status e preço de `commercial_properties`) e **nunca alcança o locatário**:

```
contracts  domain='LOCACAO', number 'CL-{ano}-{seq}'
  ├─ client_id           → o LOCATÁRIO (clients.id)
  ├─ start_date/end_date → vigência da ocupação
  ├─ parent_contract_id  → renovação: o filho SUBSTITUI o pai
  └─ deal_id → commercial_deals ├─ commercial_deal_units.property_id (N unidades)
                                └─ property_id (principal, legado)
                                     ↓ commercial_properties.id
                                     ↓ empreendimento_units.rental_property_id
```

Um contrato reúne apto + vaga + box (é o motivo de `commercial_deal_units` existir), logo **um contrato pode gerar várias ocupações**.

**O achado que mudou o desenho — idempotência.** `uidx_unit_occupancies_vigente` só cobre ocupação **vigente**. Histórico não tem trava, então importar duas vezes duplicaria tudo em silêncio — e o usuário optou justamente por trazer encerrados. Daí `source_contract_id` com índice único: a ocupação sabe de que contrato nasceu.

**Cadeia de renovação colapsa em UMA ocupação.** Renovar cria contrato-filho (`parent_contract_id`), não aditivo; cru, um inquilino de 6 anos viraria 6 linhas idênticas. Como a renovação é a mesma ocupação continuando, agrupa-se a cadeia: `started_at` do mais antigo, `ended_at` do mais recente, `source_contract_id` do contrato vivo.

**Ressalva de escopo:** por lei a taxa condominial é obrigação do **proprietário**; o repasse ao inquilino é cláusula que o sistema não lê. A importação assume o repasse em todos os contratos — onde não valer, a correção é manual.

| Item | O que muda | Como sei que terminou |
|---|---|---|
| `aplicar_20270905000019_ocupacoes_origem_contrato.sql` | `source_contract_id` + FK `ON DELETE SET NULL` (apagar contrato não apaga quem morou lá) + `uidx_unit_occupancies_origem` | ✅ **APLICADA e conferida (14/08/2026)**: `coluna=1, fk=1, uidx_origem=1, fk_on_delete='n'` (SET NULL) |
| `services/rentalOccupancyImportService.ts` | Prévia → aplicar. Reporta 4 situações: sem vínculo de unidade, já importada, unidade já tem responsável, cadeia de renovação | **Importar duas vezes cria ZERO na segunda** |
| Botão em `OcupacoesTab.tsx` | "Importar do Comercial" + `Sheet` de prévia com motivo por linha desmarcada | Responsável já existente é pulado com o nome de quem ocupa o papel, não um `23505` cru |

**Estendido para VENDAS em 14/08/2026** (o service virou `occupancyImportService`, com trilho de eixo no painel). `contracts.domain='VENDAS'` já existia, então a `000019` cobre os dois eixos sem coluna nova. **Os eixos não são simétricos, e a diferença não é cosmética:**

| | LOCAÇÃO | VENDAS |
|---|---|---|
| Coluna da unidade | `rental_property_id` | `commercial_property_id` |
| Papel | INQUILINO | PROPRIETARIO |
| Vigência termina? | **Sim** — contrato encerrado vira ocupação histórica | **Não** — `end_date` no passado só diz que o parcelamento acabou, não que a pessoa deixou de ser dona |
| Contrato cancelado | Vira histórico (a pessoa morou lá) | **Ignorado** (a venda não aconteceu; nunca foi dona) |
| Renovação | Cadeia colapsa em 1 ocupação | Não existe |

**Quem fica com o RESPONSÁVEL FINANCEIRO é decidido pela ORDEM de importação**, e isso é desejável: por lei a taxa é obrigação do proprietário, mas o repasse ao inquilino é a prática. Importando locação antes, a unidade alugada fica com o inquilino pagando e o proprietário é reportado; a unidade só vendida fica com o dono.
| `EspelhoLocacoesTab.tsx` | **Não mexer** — é o eixo de publicação da unidade; ocupação é outra pergunta | — |

### F2 — Handoff da entrega (o diferencial)

**Estado em 14/08/2026 — a fase encolheu, porque 3 dos 5 itens saíram por outro caminho:**

| Item original | Estado |
|---|---|
| Criar o condomínio | ✅ botão *Importar empreendimento* |
| Importar unidades | ✅ resolvido por **desenho** — são compartilhadas, não copiadas |
| Puxar proprietários de `commercial_deals` | ✅ importação ancorada na unidade |
| **Gerar plano de manutenção inicial** | ✅ **feito em 14/08/2026** — ver abaixo |
| Instanciar ativos e garantias | ✅ **feito em 14/08/2026** — aba **Ativos** + `aplicar_20270905000022`, APLICADA e conferida (`colunas=2, funcao=1, job=1`) |

**Ativos e garantia do fornecedor.** Sem tabela nova: é `opura_assets`, que já tem hierarquia, documentos e histórico — a F1 preparou as colunas de vínculo (`empreendimento_id`, `building_system_id`, `supplier_warranty_until`).

- **O código patrimonial deriva do maior sufixo** (`OPR-PRE-0001`), não do aleatório que o módulo de Bens usa: com `UNIQUE (organization_id, code)`, aleatório é colisão esperando acontecer — e quando acontece, o cadastro falha sem o usuário entender por quê. Mesmo raciocínio de `nextRentalNumber` (derivar do máximo, nunca de COUNT).
- **A garantia daqui NÃO é a de `warranty_terms`.** Aquela é da construtora ao comprador e corre da entrega do imóvel; esta é do FORNECEDOR do equipamento e corre da instalação. Confundi-las faz o condomínio cobrar da parte errada e descobrir tarde que o prazo da certa já venceu.
- **O alerta avisa com 90 dias, não 30 como o de manutenção.** Manutenção vencida se resolve executando o serviço; garantia vencida não se resolve de jeito nenhum — só vale antes de expirar, e acionar fornecedor envolve laudo, orçamento e negociação. Descobrir na véspera é o mesmo que descobrir depois.
- **Um job de cron, UMA instrução.** Os dois alertas entram como `fn_maintenance_due_alerts(30) + fn_supplier_warranty_alerts(90)` na mesma query: dois `SELECT` separados por `;` dependeriam de o pg_cron aceitar múltiplas instruções, e se a segunda fosse ignorada o alerta de garantia nunca dispararia — sem erro nenhum para denunciar.
- Dívida técnica registrada: os tipos gerados do Supabase não conhecem as colunas da `000018`, então `buildingAssetService` usa cast explícito.

**Com isso a F2 está COMPLETA.**

**Plano de manutenção inicial (`services/maintenanceCatalog.ts`).** Criar um plano entregava um plano **vazio**, e o usuário digitava item por item — na prática, inventando do zero o que a norma já diz. Um plano que nasce vazio é um plano que ninguém preenche; foi exatamente o que aconteceu no teste do cron, quando um item precisou ser inventado ("cc") só para haver o que alertar.

Agora *Criar plano* abre uma prévia com ~22 itens padrão dos 12 sistemas prediais, cada um com periodicidade, responsável e primeiro vencimento; o usuário desmarca o que não se aplica.

Três decisões:
- **É ponto de partida, não a norma, e a tela diz isso.** A NBR 5674 remete ao manual do proprietário (NBR 14037) e aos manuais dos fabricantes; a periodicidade real muda por equipamento e por exigência local (validade do AVCB varia por estado). Apresentar como "a norma" faria o usuário confiar em número que talvez não sirva.
- **Primeiro vencimento = hoje + periodicidade**, não hoje. Senão o plano nasce com 22 itens vencendo no mesmo dia, o cron dispara 22 alertas de uma vez e o usuário aprende a ignorá-los na primeira semana. Quem sabe que um serviço está atrasado ajusta a data; o contrário não tem conserto fácil.
- **Catálogo em código, não no banco** — conhecimento versionado com a aplicação. Editável por organização é passo seguinte, se houver demanda.

Duas divergências do guia corrigidas na mesma passagem: **exclusão de OS disparava sem confirmação** (§14) — a séria, porque OS concluída é o registro de que o serviço aconteceu e a âncora do vencimento; e **KPIs antes das abas** (§20.1), invertendo a leitura.

Ação única que transforma empreendimento entregue em edifício operado: cria o condomínio, importa unidades e frações, puxa proprietários de `commercial_deals`, instancia ativos e garantias, gera o plano de manutenção inicial a partir dos sistemas. **É a única coisa aqui que a Superlógica não consegue copiar** — e o motivo de F0 e F1 virem antes.

Pronto quando: um empreendimento `ENTREGUE` real vira edifício operado em uma ação, com fração ideal somando 1,0 e sem digitação manual.

### F3 — Portal do Condômino

**IMPLEMENTADO em 14/08/2026** — `/portal-condomino?token=…`, `aplicar_20270905000023_portal_condomino.sql` (⏳ **não aplicada**).

**Correção de premissa.** Este plano dizia "com autenticação real (não token de 90 dias)", e eu repeti isso várias vezes citando o Portal do Corretor como precedente de login. **Errado: nenhum dos seis portais deste app tem autenticação real** — todos usam token em link público, o corretor inclusive. O que a memória registrava ("corretor exige e-mail+org") é sobre o cadastro do perfil, não sobre login.

**Decisão do usuário: "token agora, login depois".** Entrega no padrão da casa, mas desenhada para que trocar por autenticação real **não exija migrar dado**:

> A identidade do condômino **não é o token** — é a linha de `condomino_portal_access`, que liga a PESSOA à UNIDADE. O token é uma credencial pendurada nela, e `auth_user_id` é a outra, reservada desde já. No dia do login real, preenche-se aquele campo e as RPCs aceitam sessão; a linha de acesso, os chamados e as leituras continuam apontando para o mesmo lugar. Se o token FOSSE a identidade (como em `client_portal_tokens`, onde ele é a própria chave), a troca exigiria reescrever tudo que o referencia.

| Decisão | Por quê |
|---|---|
| **Chamados são da UNIDADE**, não da pessoa (`client_requests.unit_id`, nulo nas linhas antigas) | Quem mora hoje precisa ver o vazamento aberto pelo morador anterior; e quem tem duas unidades não pode ver as listas misturadas |
| **Avisos são tabela nova** | `communications` é RH/obra, `investor_announcements` é investidor — misturar comunicado de obra com aviso de síndico na mesma caixa é pior que duplicar estrutura |
| **Leitura confirmada por ACESSO**, não por pessoa | A mesma pessoa pode ter duas unidades; ler numa não é ler na outra |
| **Revogar desativa, não apaga** | A linha é a identidade, e dela dependem as leituras — apagar levaria o histórico junto |
| **Sem dado financeiro** | É o que torna token frágil. Quando o financeiro entrar (pós-portão), a autenticação real deixa de ser opcional |
| Documentos por **URL pública** | O condômino não tem sessão; arquivo em bucket privado não abre. A tela avisa isso em âmbar |

Lado admin: aba **Comunicação** no condomínio (avisos com contagem de leitura + documentos com visibilidade), e botão de gerar/copiar link na linha da ocupação — renovar troca o token e **invalida o anterior**, que é o desejado por quem perdeu o controle do link.

Pronto quando: dois moradores de unidades diferentes abrem seus links e cada um vê só a própria unidade — verificado no navegador, não por `tsc`.

### 💰 Financeiro condominial — fatia 1: o RATEIO (14/08/2026)

O usuário optou por abrir o portão **antes** de rodar o piloto; a ressalva de que as telas seguem sem verificação foi registrada e mantida.

**Decisão do usuário, melhor que as opções oferecidas:** *"Cada condomínio pode ter uma organização própria ou não. Mas **a âncora é o centro de custo**. Cada condomínio, independente de ter organização própria ou não, terá seu próprio centro de custo."*

Isso resolve a segregação sem depender da organização: a despesa do condomínio é a que cai no centro de custo dele, e `internal_transactions.cost_center_id` já aponta para `cost_centers_v2`, que já é dimensão de DRE e balancete. Org própria vira decisão **ortogonal** (fiscal), não pré-requisito.

⚠️ `cost_centers_v2.empreendimento_id` **coexiste** com `project_id`, que outra frente acrescentou em `20270907000000` para derivar empreendimento **a partir da obra**. Aquele caminho não serve aqui: condomínio em operação — ainda mais retrofit — pode não ter obra nenhuma. Dois vínculos para dois casos, não duplicata.

**Critérios (todos, escolhidos pelo síndico):** fração ideal, valor igual, área privativa, grupo de unidades, valor fixo.

| Decisão | Por quê |
|---|---|
| **ORDINÁRIO × EXTRAORDINÁRIO separados desde o começo** | Obra e benfeitoria são juridicamente do PROPRIETÁRIO, não do inquilino. Num valor só, não há como saber de quem cobrar quando a unidade está alugada |
| **Rateio FECHADO não aceita alteração** (trigger) | Vira base de cobrança; se o valor mudar depois, o boleto emitido deixa de bater. Editar exige cancelar e refazer |
| **A soma das cotas fecha ao centavo** | 1000,00 entre 3 daria 999,99 com arredondamento ingênuo — um centavo por rateio vira furo inexplicável na prestação de contas, que é aprovada em assembleia. O resto vai para as maiores frações perdidas (critério do "maior resto"). **8 testes em `__tests__/condominioRateio.test.ts`** |
| **Guarda o PESO usado, não só o valor** | Meses depois a fração pode ter sido averbada e a área corrigida; sem o peso, ninguém reconstrói por que aquela unidade pagou aquilo |
| **Guarda a LISTA de despesas**, não só o total | A prestação de contas precisa mostrar o que compôs a cota, e despesa lançada depois não pode mudar rateio fechado em silêncio |
| **Sem responsável financeiro, não há de quem cobrar** | A cota é calculada e a tela avisa. Cobrar do "provavelmente o dono" é como nasce cobrança para a pessoa errada |

**Fatias seguintes:** cobrança (boleto/PIX via Asaas, que já existe), fundo de reserva e específicos, inadimplência com multa e juros, acordos, e prestação de contas mensal.

**Correções de 14/08/2026, encontradas usando a tela:**
- **Centro de custo nascia como GRUPO de primeiro nível**, lado a lado com Obra/Administrativo/Comercial — que são famílias de despesa, não unidades de caixa. Agora `garantirGrupoCondominios` acha (ou cria) o grupo "Condomínios" e o condomínio entra como FILHO. Somada a isso, a opção de **vincular um centro de custo existente**, que é o caso comum de quem já cadastrou à mão — oferecida ANTES da criação, para não sobrarem dois centros para o mesmo caixa.
- **`internal_transactions.date` não existe.** As colunas são `transaction_date` e `due_date`. Adotado **`transaction_date`**, que é por onde `fn_dre` e `fn_balancete` recortam o período: usar vencimento faria o rateio e o balancete discordarem sobre a qual mês a mesma despesa pertence, e o condômino receberia cota que a contabilidade não confirma.

**Correções de 26/08/2026 — a lista de rateios virou tabela (`FinanceiroTab.tsx`).**

A aba listava os rateios como **cards empilhados**, não como `<table>`. Era a única das seis listagens do módulo fora do padrão — Ocupações, Frações, Ativos, Manutenção e a lista de condomínios já usavam `useTableColumns`/`SortableHeader`/`ColumnConfigButton`. Consequência prática: não dava para ordenar por competência nem por valor, nem esconder coluna. Num livro de competências que só cresce, isso piora com o tempo.

Três coisas mudaram, e a primeira só foi possível por causa da terceira:

1. **O número do rateio finalmente aparece.** `condominio_rateios.number` é atribuído no fechamento desde a migration `20270912000003` (máscara `CONDO_RATEIO`, em Configurações do Sistema › Nomenclatura), vinha no `select` do service e **não era renderizado em lugar nenhum**. O síndico fechava o rateio e não tinha como citá-lo em ata, boleto ou conversa. Agora é a primeira coluna; em rascunho mostra `—` com o motivo no `title`, porque o número nasce no fechamento e não antes.
2. **"Diferença" virou coluna própria**, em vez de uma nota âmbar no fim de uma linha de texto corrida. Ela é o sinal de que a soma das cotas não fechou com a despesa — enterrada dentro da célula de "Rateado", só era vista por quem já suspeitava daquela linha.
3. **Tabela no padrão do guia:** 8 colunas ordenáveis + Ações, `<thead>` sentence case e sticky (§6.2/§6.5), `px-6` + `border-r` por célula (§6.6), tipografia por tipo de dado (§7), status como texto colorido (§8), ação dominante como texto azul com a linha inteira clicável (§9). Sem `useResizableColumns` (§6.1) — nenhuma coluna é de texto livre, então redimensionar não pagaria o próprio custo.

Divergência do guia corrigida na mesma passagem: a tabela de despesas dentro do `Sheet` usava `px-6`, medida de tabela de página inteira. Num painel de ~672px, seis lados de 24px comem mais largura do que sobra para o dado — §6.9 pede `px-3`, com `px-4` na coluna de texto livre.

✅ **VERIFICADA NO NAVEGADOR em 26/08/2026** — o DNS do projeto voltou a resolver, o que destravou a conferência que estava bloqueada desde 24/08. Mecânica: `npx tsc --noEmit` limpo, `check-ui-standard.sh` sem violações, `npm run build` completo, 25 testes passando (`condominioRateio`, `orgContextGuard`, `migrationsPrefixo`).

Na tela, logado como `agente-leitura` (perfil Membro) em **007 - Bella Vista**: os 9 cabeçalhos aparecem na ordem certa e em sentence case com o ícone de ordenação sempre visível (§6.8); ordenar por Número reordena de fato; o painel de colunas lista as 8 colunas de dado e **não** lista "Ações"; o número `RAT-2026-0003` aparece no rateio fechado e `—` no rascunho e no cancelado; a Diferença de R$ 0,50 sai em âmbar e o resto em `—` cinza; o status é texto colorido, sem pílula (§8); a linha cancelada não oferece ação nenhuma; e o clique na linha abre o Sheet "Despesas do rateio" (§9), já com o `px-3`/`px-4` do §6.9. **Zero erro de console.**

> ⚠️ **Como testar tela deste app sem escrever no banco — e a armadilha do PWA.**
> O banco real tem **zero** rateios, então a aba só renderizava o estado vazio.
> A saída foi interceptar as respostas de LEITURA do PostgREST no Playwright e
> injetar três rateios (fechado, rascunho, cancelado) — nada é gravado.
> **`page.route` não intercepta requisição feita de dentro de um service
> worker**, e este app é PWA: sem `browser.newContext({ serviceWorkers: 'block' })`
> a interceptação passa despercebida e o teste mede o banco real achando que
> mede o stub. Foi exatamente o que aconteceu na primeira rodada.
> Roteiro em `c:/tmp/pwtest/teste-financeiro.js`. Duas pegadinhas de seletor:
> a tela de entrada é o **seletor de portal** (clicar "Portal do Colaborador"
> antes do formulário), e "Financeiro" é **também** item do menu lateral — o
> seletor tem de ser escopado à barra de abas do condomínio.

**Deploy:** commit `fdea0c9` empurrado para `main`; confirmado no ar em
`https://orcacloud.vercel.app` (o chunk `CondominiosModule-B3BX5g1p.js` servido
em produção contém o código novo).

**Correção de fato do estado do piloto:** este plano dizia que *"`007 - Bella
Vista` tem o centro de custo `009` solto (a arrumar: desvincular/excluir e
vincular o `007 — Condomínio Bella Vista`)"*. **Já não é verdade** — hoje os
dois condomínios têm centro de custo vinculado e ambos como FILHOS do mesmo
grupo: `010 → 010 - Galeria Altavista` e `011 → 007 - Bella Vista`. Nada a
arrumar aqui.

---

## ▶ ESTADO PARA RETOMAR (14/08/2026)

**Migrations `000017`–`000024`: todas aplicadas e conferidas.** Nenhuma pendente.

**No ar:** Comercial › Condomínios, com 7 abas (Ficha, Ocupações, Frações, Ativos, Manutenção, Financeiro, Comunicação) + Portal do Condômino em `/portal-condomino?token=`.

**Auditoria de schema/RLS das migrations `000017`–`000024` — FECHADA (14/08/2026).** 8 blocos de verificação SQL (itens 17–24, um por migration, o 18 cobrindo as 4 tabelas de Manutenção de uma vez), rodados pelo usuário no SQL Editor:

| # | Migration/área | com_rls | anon_policies | Invariantes específicos conferidos |
|---|---|---|---|---|
| 17 | Ocupações | 1/1 | 0 | 4 policies, 2 FKs, unique de responsável, trigger de cascata de org, filtro `EM_OPERACAO` |
| 18 | Manutenção (4 tabelas) | 4/4 | 0 | 16 policies, unique de plano vigente, trigger de ciclo, `fn_next_due`, 4 colunas em `assets` |
| 19 | **Ocupações — origem do contrato** (não Frações; ver correção abaixo) | — | — | FK presente, unique de origem, `fk_on_delete = n` = **SET NULL, confirmado** |
| 20 | Cron manutenção | — | — | job único, agenda `0 9 * * *` |
| 21 | Frações — trigger origem | — | — | trigger presente; `marcadas_motor=0`, `marcadas_convencao=0` — **confirma por dado real que a aba Frações nunca foi usada no piloto**, não é falha da migration |
| 22 | Cron alertas | — | — | 1 job consolidado rodando `fn_maintenance_due_alerts(30)` + `fn_supplier_warranty_alerts(90)` |
| 23 | Ativos (4 tabelas) | 4/4 | 0 | 3 RPCs, FK de chamado→unidade |
| 24 | Financeiro/rateio (3 tabelas) | 3/3 | 0 | unique de competência, trigger que trava período fechado, coluna de empreendimento |

**Resultado: zero policy de anon em qualquer uma das 24 tabelas novas, e todo invariante de negócio (cascata de org, responsável único, plano vigente único, competência única, trava de período fechado, trava de convenção) existe como trigger ou unique index — não só validação de aplicação.**

✅ **O item 19 estava FECHADO desde sempre — era falso alarme, encerrado em 26/08/2026.** Duas coisas se confundiram na hora de montar a tabela:

1. **O rótulo estava errado.** A migration `000019` é `ocupacoes_origem_contrato` (a coluna `unit_occupancies.source_contract_id`), **não** Frações. Frações é a `000021`, que sequer tem chave estrangeira — `fracao_ideal_origem` é uma coluna `TEXT` com `CHECK (… IN ('MOTOR','CONVENCAO'))`. Não existe, e nunca existiu, FK de origem em Frações para investigar.
2. **`fk_on_delete = n` já era a resposta certa, não a pergunta.** Em `pg_constraint.confdeltype` os códigos são `a` = NO ACTION, `r` = RESTRICT, `c` = CASCADE, **`n` = SET NULL**, `d` = SET DEFAULT. O `n` observado é exatamente o `ON DELETE SET NULL` escrito por extenso no DDL (`aplicar_20270905000019_ocupacoes_origem_contrato.sql`, BLOCO 2), e é a decisão registrada neste plano: apagar o contrato não apaga quem morou lá. A própria linha 353 deste documento já dizia isso — o bloco de auditoria a contradisse por ler `n` como abreviação de "NO ACTION".

Lição que vale além deste item: **código de catálogo do Postgres não se lê por semelhança com a palavra em inglês.** `n` parece "no action" e significa o oposto do que a leitura ingênua sugere. A verificação certa é comparar com o DDL da migration, que está no repositório.

**Com isso a auditoria de schema/RLS das `000017`–`000024` não tem mais nenhum ponto em aberto.**

✅ **Dívida de verificação de UI — FECHADA em 27/08/2026.** Isso é uso de tela, não schema. Exercitados pelo usuário: importação de ocupações de locações, painel de importar empreendimento, cron de manutenção (provado com dado real), e o centro de custo (que revelou os dois defeitos de schema já corrigidos). Verificados no navegador em 26–27/08/2026: **Ficha**, **Financeiro**, **Frações**, **Ativos**, **Comunicação**, a **criação de plano com catálogo** e o **Portal do Condômino**. Não sobra tela por abrir nesta frente. `tsc` e `check-ui-standard.sh` não enxergam bloco fora de ordem, lista renderizando vazia nem separador faltando.

✅ **Ativos, Comunicação e criação de plano — verificadas em 27/08/2026 no `010`** (só leitura: as tabelas estão zeradas, então as respostas de GET foram injetadas no harness e toda escrita foi abortada). Zero erro de console nas três.

- **Ativos** — 8 colunas; os 3 KPIs separam corretamente os três estados de garantia (`vencida=1`, `vence em 90 dias=1`, `sem garantia informada=1`) a partir de 3 equipamentos com `supplier_warranty_until` em -130d, +41d e nulo. O sub que a tela dá para a garantia vencida — *"Conserto passa a ser custo do condomínio"* — é a razão de a aba existir, dita na tela.
- **Comunicação** — sub-abas Avisos/Documentos, cards com categoria colorida (Manutenção âmbar, Assembleia índigo, Urgente vermelho), vigência e contagem de leitura por aviso. **KPI "Documentos no portal" conta só os `visivel_portal = true`**: com 2 documentos injetados e um deles oculto, mostrou `1`. Está certo — é o que o condômino veria.
- **Criação de plano com catálogo** — **24 itens** (o texto acima dizia "~22"), cobrindo os **12 de 12** sistemas prediais, todos pré-marcados, com periodicidade e responsável por item. O aviso âmbar no topo diz *"Ponto de partida, não a norma. A NBR 5674 remete ao manual do proprietário e dos fabricantes"* — a decisão registrada nesta seção, visível na tela.
  **A regra do primeiro vencimento confere ao dia:** rodando em 27/08/2026, item mensal → `27/09/2026`, trimestral → `27/11/2026`, semestral → `27/02/2027`, anual → `27/08/2027`. É `hoje + periodicidade`, nunca `hoje` — exatamente o que evita 24 alertas no mesmo dia.

🔴 **Correção: a semente do bloco 9 JÁ FOI APLICADA.** Este plano ainda dizia "⏳ Falta a semente do bloco 9 (12 sistemas prediais)". `building_systems` tem **12 linhas** (Elevadores, Bombas e recalque, Reservatórios de água, SPDA, Instalações elétricas, Instalações hidrossanitárias, Combate a incêndio, Gerador, Portões e automação, Fachada e revestimentos, Impermeabilização, Esquadrias). Nada a fazer.

✅ **Portal do Condômino — CRITÉRIO DE PRONTO DA F3 CUMPRIDO em 27/08/2026.** Era o último item e o de maior risco: o critério (*"dois moradores de unidades diferentes abrem seus links e cada um vê só a própria unidade — verificado no navegador, não por `tsc`"*) nunca tinha sido cumprido, e `condomino_portal_access` tinha **0 linhas**. Autorizado pelo usuário, foram gerados 2 acessos reais no `010` e depois desativados.

**O par foi escolhido para testar as DUAS cláusulas de isolamento de uma vez:** *Sala - 201* (Defensoria Pública de Minas Gerais, que também é responsável financeiro por **202 e 203**) e *Sala - 304* (Ivana Braga Demier). Cada link foi aberto em **contexto de navegador limpo** — sem sessão, sem storage, como o condômino recebe.

| Verificação | Resultado |
|---|---|
| Cada link mostra a própria unidade | ✅ cabeçalho `010 - Galeria Altavista · Torre Única · Sala - 201 · Defensoria…` e o equivalente da 304 |
| Um vê a unidade/pessoa do outro | ✅ **não** — nas 4 abas varridas |
| **Mesma pessoa, outra unidade** (link da 201 mostra 202/203?) | ✅ **não** — a cláusula mais difícil, e a que prova que a identidade é o ACESSO (pessoa × unidade), não a pessoa |
| Token revogado (`is_active=false`) volta a abrir? | ✅ **não** — "Não foi possível abrir · Link inválido ou expirado. Peça um link novo à administração" |
| Token inexistente | ✅ mesma recusa, sem vazar nada |

Zero erro de console em qualquer um dos acessos. Os 2 acessos ficaram com `is_active = false` (a linha permanece — desativar não apaga, decisão da F3).

🔴 **ACHADO — `revogar` e `listByUnits` são CÓDIGO MORTO.** Ao procurar o botão de revogar para limpar o teste, descobri que `condominoAccessService.revogar()` e `.listByUnits()` existem em `services/condominoPortalService.ts` e **não são chamados por nenhum componente** (grep no repo inteiro: zero call sites). Duas consequências reais, nenhuma detectável por `tsc`:

1. **Não há como revogar um acesso pela UI.** A decisão "Revogar desativa, não apaga" está escrita neste plano, mas o gesto não existe na tela. O único recurso do síndico é **gerar de novo**, que troca o token e invalida o anterior — dá para tirar o link de circulação, mas não para *desligar* o acesso daquela ocupação.
2. **A tela não sabe quais ocupações já têm link.** Como `listByUnits` nunca é chamado, o botão de compartilhar é idêntico com ou sem acesso existente, e não há indicação de acesso ativo/expirado por linha. É por isso que a confirmação precisa hedgear — *"Se já existir um link para esta ocupação, ele deixa de funcionar"*: a UI não tem como saber se existe.

A desativação do teste teve de ser feita por `PATCH` direto na tabela, pelo mesmo caminho que o service usaria. **Fechar esse gap é trabalho pequeno e bem delimitado:** chamar `listByUnits` no carregamento da aba Ocupações, mostrar o estado do acesso na linha, e expor `revogar` como ação. Não foi feito aqui porque é implementação, não verificação.

✅ **Aba Frações — verificada em 27/08/2026 no `010 - Galeria Altavista`** (só leitura; digitou-se para exercitar a conferência, sem salvar, com rota de escrita bloqueada no harness). As 12 unidades carregam com `private_area` real (17,01–39,10 m²), Origem lê "Não informada" nas 12, e os 5 cabeçalhos ordenam. A conferência de soma está **exata**: 11 × 8,3333 + 8,3337 deu `100,0000% · Fecha em 100%` em verde; trocando uma unidade para 1,0000 virou `92,6667% · Falta 7,3333%` em âmbar — e o botão Salvar **continuou habilitado**, que é a decisão registrada no topo do arquivo (soma é conferida, não trava). "Salvar" nasce desabilitado e vira `Salvar 12` com as edições pendentes. Zero erro de console.

> ℹ️ **Detalhe dos KPIs que confunde na primeira vez, e é intencional:** "Soma
> das frações" e "Unidades com fração" saem de `conferencia`, que já conta o que
> está **digitado e não salvo** (`fracaoAtual` lê `edicoes` antes do banco);
> "Transcritas da convenção" lê `fracao_ideal_origem` **salvo**. Por isso, no meio
> da transcrição, a tela mostra `12 / 12 com fração` e `0 transcritas` ao mesmo
> tempo. Convergem depois de salvar. Não é bug — mas quem transcrever precisa
> saber, senão lê o `12/12` como se já estivesse gravado.

~~**Piloto ainda não rodou.** `010 - Galeria Altavista` … sem ocupações, sem frações, sem ativos, sem centro de custo vinculado. `007 - Bella Vista` … centro de custo `009` solto.~~

🔴 **TUDO ACIMA ESTAVA DESATUALIZADO. Estado real conferido no banco em 27/08/2026** (apontado pelo usuário — eu tinha acabado de repetir o texto velho como se fosse fato, em vez de consultar):

| | `010 - Galeria Altavista` | `007 - Bella Vista` |
|---|---|---|
| Ocupações | **21** (17 vigentes, 4 históricas), **16 importadas de contrato** e 5 manuais | 0 |
| Unidades com responsável financeiro | **10 de 12** | 0 de 9 |
| Área privativa | **12 de 12** (17,01–39,10 m²) | — |
| Centro de custo | `010`, vinculado, **23 títulos** | `011`, vinculado |
| Plano de manutenção | 1 | — |
| **Fração ideal** | **0 de 12** | — |
| Ativos | 0 | 0 |

**A consequência que muda o roteiro:** o piloto capaz de rodar um rateio de
verdade **hoje** é o `010`, não o Bella Vista — e por **ÁREA PRIVATIVA** ou
**VALOR IGUAL**, que são os critérios cujos dados existem. O botão "Importar do
Comercial" foi de fato usado ali (16 das 21 ocupações vieram de contrato), o que
também prova aquela ponte em produção.

**E o que falta é exatamente o que este plano previu:** `fracao_ideal_decimal`
está nula nas 12 unidades. Não é esquecimento — é a tese de "O diferencial não
vale para retrofit": num prédio entregue a fração está na **convenção
registrada**, e o motor NBR 12721 não a substitui. Enquanto ninguém transcrever
a convenção pela aba **Frações** (`fracao_ideal_origem = 'CONVENCAO'`), o
critério FRAÇÃO IDEAL — que é o juridicamente correto para taxa condominial —
fica indisponível no único condomínio que tem gente para cobrar.

Sobre rateios: a tabela tem **1 linha, `CANCELADO`** (`a130f81c…`), resíduo da
verificação do plano de 24/08 no Bella Vista. Nenhuma competência foi fechada.

**Próxima fatia sugerida:** cobrança — transformar rateio fechado em boleto/PIX. É costura, não construção: `asaas-charge`, webhook com idempotência, régua de dunning e conciliação já existem.

**Outras frentes ativas no mesmo repo** (não tocar sem combinar): Planta Inteligente (`blueprintKernel`, `BlueprintCanvas`, `BlueprintEditor` + testes golden) e Centro de Custo/Contratos.

### 🚪 Portão — assembleias e reservas (ainda fechado)

Só depois de um piloto real em operação decidir sobre: financeiro condominial (rateio por fração ideal, fundos, multa/juros, acordos, prestação de contas), assembleias e reservas. **Nenhum dos três entra antes.** Assembleia e reserva parecem baratas e não são: assembleia tem quórum, procuração e peso de voto; reserva tem calendário, regra e caução.

---

## Custo aproximado

| Fase | Peso |
|---|---|
| F0 Ocupações | Pequena — schema + CRUD |
| F1 Manutenção NBR 5674 | **A maior** — taxonomia, plano cíclico, OS nova, alertas. Módulo inteiro |
| F2 Handoff | Média — orquestração sobre o que F0/F1 criaram |
| F3 Portal do Condômino | Média-alta — a autenticação real é o custo escondido |
| Pós-portão (financeiro + assembleia + reservas) | Maior que F0–F3 somadas |

A intuição de que começar pelo pós-obra "reduz bastante o escopo" está certa, com uma ressalva: **F1 não é reaproveitamento, é construção.** O que já está pronto (Asaas, conciliação, DRE, ZapSign, Qualidade, Garantia) é excelente, mas quase tudo só é usado *depois* do portão. Antes dele, reusa-se cadastro de unidade, fração ideal, chamados e o padrão de SLA por cron.

---

## Verificação (antes de qualquer código)

1. **Fração ideal com dado real — ✅ FEITA, e o resultado é NEGATIVO.**
   `010 - Galeria Altavista`, status `ENTREGUE`: **12 unidades, `com_fracao = 0`, `soma_fracao = null`, `ultima_escrita_do_motor = null`.** A escrita reversa nunca rodou neste empreendimento. Ver "O diferencial não vale para retrofit", abaixo.
2. **Confirmar o piloto — ✅ resolvido.** `010 - Galeria Altavista` (org `926cf626` = Alpa Construtora, **não** uma SPE própria).
3. **Invariantes de F0 em runtime — ✅ PROVADOS (13/08/2026).**
   - Cascata de org: `P0001 — Ocupação na organização 000…001 mas a unidade 5b4719dd… pertence à organização 926cf626…. Filho herda a org do pai.` (`fn_unit_occupancies_org()` linha 19).
   - Responsável financeiro único: `23505 — duplicate key value violates unique constraint "uidx_unit_occupancies_um_responsavel"`.

   Nota de credencial: o login de `agente-leitura@alpaconstrutora.com.br` devolveu `invalid_credentials` (HTTP 400) — a senha mudou desde 05/08. As verificações acima foram feitas pelo usuário no SQL Editor. Para eu consultar sozinho, redefinir em Supabase Studio → Authentication → Users (a senha não fica guardada, decisão de 05/08).

---

## O diferencial não vale para retrofit — correção de 13/08/2026

A avaliação original vendeu como vantagem "receber a fração ideal já calculada pelo motor NBR 12721". A verificação no piloto mostrou o limite disso, e o limite é **estrutural, não um esquecimento de clicar o botão**:

- O motor NBR 12721 serve à **incorporação** — quadros I/II/IV-B, memorial, averbação.
- Num edifício **já entregue**, a fração ideal não é calculada: está **registrada na convenção de condomínio**, que é o documento com valor legal. Recalcular não a substitui.

Logo a fração ideal passa a ter **duas origens, que não podem ser confundidas**:

| Origem | De onde vem | Pode recalcular? |
|---|---|---|
| `MOTOR` | Escrita reversa do motor de áreas | Sim — nova versão sobrescreve |
| `CONVENCAO` | Transcrição da convenção registrada | **Não** — só muda por averbação |

**Consequências:**

- **F2 muda de escopo.** O handoff automático continua sendo o diferencial, mas só para empreendimentos que o ÒPURA incorporar **daqui para frente**. Para retrofit — que é o caso do piloto — F2 precisa de um caminho de entrada da convenção (importação/transcrição), senão trava.
- **Ordem sugerida dentro de F2:** o caminho `CONVENCAO` vem primeiro, porque é o que o piloto exige; o caminho `MOTOR` já existe e só precisa ser ligado.

  ✅ **IMPLEMENTADO em 14/08/2026** — `aplicar_20270905000021_fracao_ideal_origem.sql` + aba **Frações** em `components/condominio/FracoesTab.tsx`.

  **A trava é o que decide se presta.** Sem marca de origem, o motor sobrescreve silenciosamente uma fração registrada em cartório — trocando o documento por uma conta. Não apareceria como erro de sistema: apareceria como boleto errado, meses depois. Proteção em duas camadas: `areaEngineService` filtra as unidades `CONVENCAO` e as reporta nos avisos da escrita reversa; `trg_fracao_ideal_protege_convencao` recusa se algum caminho novo esquecer o filtro. **Aplicação filtra, banco se recusa.**

  Três decisões da tela: **nenhum botão de distribuir/ratear proporcionalmente** (a tela COPIA um documento; número inventado aqui define peso de voto em assembleia e divisão de rateio); **a soma não trava o salvamento** (transcrever 200 unidades é trabalho em etapas — travar obrigaria a inventar número para fechar, que é o erro que a tela evita), só mostra o desvio; **limpar a fração limpa a origem**, senão a unidade fica travada para o motor para sempre.

  ⚠️ **Ordem de implantação:** `UNIT_COLS` passou a ler as colunas novas, então a migration tem de estar aplicada — sem ela, TODA listagem de unidades falha (espelhos de vendas e locações inclusive).
- **Quando o rateio entrar (pós-portão), a coluna de origem é obrigatória.** Ratear por uma fração de origem desconhecida é erro que só aparece no boleto do condômino.
- Não foi implementada agora: rateio é pós-portão e a ocupação não depende de fração. Fica como primeiro item de F2.

**Sobre a org do piloto:** `926cf626` é a Alpa Construtora, a org do grupo — o Altavista **não** tem SPE própria como o Garden Cambuhy. A cascata de F0 funciona igual, mas em F2 a pergunta "condomínio vira org própria?" não se resolve sozinha por herança: vira decisão explícita.

A cada fase: rodar o cenário no navegador com projeto real antes de declarar pronto — `tsc`/lint não provam comportamento.
