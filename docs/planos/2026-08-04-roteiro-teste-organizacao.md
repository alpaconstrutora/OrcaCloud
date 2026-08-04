# Roteiro de teste — telas alteradas na refatoração de organização

## Pedido original

> **registre e vamos testar as 35. liste qusis sao**

2026-08-04 · sessão `6226446f-75e0-49ca-878f-7f1fd4103f2f`

Contexto: `docs/planos/2026-08-03-organizacao-seletor-do-topo.md` (Fase B).
São **30 telas** alteradas entre `7af8e18` e `cae960f` (+ 1 hook e 1 arquivo removido).

## Como testar cada uma

Para toda tela, com o seletor do topo em **uma organização específica**:

1. A tela **carrega** e mostra dados? (não pode ficar em branco)
2. Ao **criar** algo: **nenhum modal de organização deve aparecer**
3. O registro nasce na organização do topo?

Depois, com o topo em **"Todas as organizações"**:

4. A tela continua carregando? (não pode esconder nada)
5. Ao criar: o modal aparece — e nas telas de catálogo tem a opção "Todas as organizações"

**Regra de ouro:** organização escolhida no topo → nunca perguntar. "Todas" → perguntar.

---

## PRIORIDADE ALTA — mudei a gravação (risco de gravar na org errada)

| # | Tela | Onde fica | O que testar |
|---|---|---|---|
| 1 | Tipos de Empreendimento | Configurações do Sistema | ✅ testado 04/08 — criar funciona |
| 2 | Tipos de Clientes | Configurações do Sistema › Categorias | criar, duplicar, importar padrões |
| 3 | Categorias de Fornecedores | Configurações do Sistema › Categorias | criar, duplicar, importar padrões |
| 4 | Tipos de Contrato | Configurações do Sistema › Categorias | criar, duplicar, importar padrões |
| 5 | Tipos de Pagamento | Configurações do Sistema › Categorias | criar, duplicar, importar padrões |
| 6 | Tributos e Impostos | Configurações do Sistema › Tributos | criar + "Criar tributos padrão" |
| 7 | Índices de Reajuste | Configurações do Sistema | lançar valor de INCC/IPCA |
| 8 | Regras Fiscais | Fiscal › Regras | nova regra de classificação |
| 9 | Centro de Custo | Organizações › Centro de custo | criar + **importar planilha** |
| 10 | **Criar Obra** | botão Nova Obra | ⚠️ nascia sempre na 1ª org — conferir que nasce na org do topo |
| 11 | Pedido de Compra | Suprimentos › Novo pedido | ⚠️ oferecia conta bancária/centro de custo de OUTRA empresa |
| 12 | Detalhe financeiro do Pedido | Suprimentos › Pedido › Financeiro | idem (contas e centros de custo) |
| 13 | Contas a Receber | Financeiro | listar + Novo lançamento |
| 14 | Tributos a Pagar | Financeiro | listar + Novo + **Gerar tributos** (era botão mudo) |
| 15 | Almoxarifado | Suprimentos › Almoxarifado | Entrada/Saída/Ajuste, Transferência, Novo Almoxarifado, **aba Requisições** (ficava escondida) |
| 16 | Pós-Obra & Garantia | Qualidade | Abrir Chamado |
| 17 | Processos | ÒPURA Processos | Iniciar Processo + Novo Template (eram botões mudos) |
| 18 | Contratos de Serviço | Serviços › Contratos | Novo contrato (era botão mudo) |
| 19 | Áreas NBR 12721 | Engenharia › Áreas | criar projeto de área (era botão mudo) |
| 20 | Governança / Empresas | ÒPURA Governança | criar empresa padrão (era botão mudo) |
| 21 | Pipeline de Serviços | Serviços | Novo Lead |
| 22 | Academia — Catálogo | RH › Treinamentos | Novo treinamento |
| 23 | Oportunidades | Portal do Investidor | Nova Oportunidade |
| 24 | Inteligência Financeira | Financeiro › Inteligência › Agendamentos | Novo agendamento (o botão **não fazia nada**) |

## PRIORIDADE MÉDIA — mudei a leitura ou o contexto

| # | Tela | O que testar |
|---|---|---|
| 25 | **Seletor do topo** (Layout) | com obra aberta, escolher "Todas as organizações" → rótulo deve virar "Todas", não o nome da obra |
| 26 | Meus Corretores | lista carrega na org do topo |
| 27 | Investidores | lista carrega na org do topo |
| 28 | Modal de Cliente | vínculo de organização ao salvar |
| 29 | Modelos .docx | Documentos › Modelos — salvar modelo vai para a org certa |
| 30 | Relatório de Diário de Obra | ⚠️ cabeçalho/logo eram da 1ª org — conferir que é a organização **da obra** |
| 31 | Relatório de Orçamento | seletor próprio deve vir com a org do topo por padrão |
| 32 | Estimativa Paramétrica | dados da organização do topo |
| 33 | Alocação de Recursos | seletor próprio deve vir com a org do topo por padrão |

## Ordem sugerida

1. **10, 11, 30** — os três que gravavam/exibiam a organização errada em silêncio
2. **14, 15, 17, 18, 19, 20, 24** — os botões que não faziam nada
3. **25** — o seletor do topo com obra aberta
4. o resto, conforme for usando o sistema

## Como reportar

Para cada problema: **tela + o que fez + o que aconteceu**. Se aparecer erro, o texto
agora vem completo do banco (`errorMessage`), então cole a mensagem inteira.
