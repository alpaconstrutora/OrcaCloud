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

**Implementada e APLICADA em 13/08/2026** — `aplicar_20270905000018_condominio_manutencao_nbr5674.sql`. Bloco 10 conferido: `tabelas=4, com_rls=4, policies=16, anon_policies=0, uidx_plano_vigente=1, trigger_ciclo=1, fn_next_due=1, cols_assets=4`. ⏳ Falta a semente do bloco 9 (12 sistemas prediais) e o teste do ciclo em runtime.

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

Portal novo, irmão de `/portal-cliente`, **com autenticação real** (não token de 90 dias). Eixo `usuário → ocupação → unidade`. Abas: chamados (reusar `client_requests`/`client_service_orders`), documentos, manual do proprietário, garantias, avisos. Sem financeiro.

Pronto quando: dois moradores de unidades diferentes logam e cada um vê só a própria unidade — verificado no navegador, não por `tsc`.

### 🚪 Portão

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
