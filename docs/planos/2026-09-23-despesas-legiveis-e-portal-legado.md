# Descrições de despesa legíveis · Aposentar o Portal do Condômino

## Pedido original

Sessão de 23/09/2026. Ao fim da entrega anterior eu deixei duas pendências
registradas como decisão do usuário; a resposta foi, literal:

> implementar os dois

As duas, como eu as havia descrito:

1. **As descrições do rateio.** "Agora que o condômino vê as despesas, ele lê
   `documento_3054431_21_05_2020.pdf` e `BENEFICIÁRIO:ENERGISA…`. É cadastro,
   não renderização — mas ganhou plateia hoje."
2. **O portal legado do condômino.** "Zero links ativos, e a prévia agora cobre
   o caminho novo. Aposentá-lo (rota, componente, tabela e 3 RPCs) seria uma
   frente própria."

---

## Item 1 — Descrição de despesa legível

**O que estava gravado**, medido no rateio 08/2026 de Galeria Altavista:

| `description` | `party_name` | `category_id` |
|---|---|---|
| `download (98).pdf` | null | null |
| `MN CONSERVACAO DE ELEVADORES … - CNPJ: 07604526000120 Ven` | (o mesmo blob) | null |
| `ENERGISA SUL-SUDESTE … CADASTRE SUA FATURA EM DÉBITO` | (o mesmo blob) | null |

A origem é `source_system = 'BOLETO'`: a descrição é o nome do arquivo ou o
bloco que o leitor de boleto extraiu da linha do beneficiário, com CNPJ,
endereço e chamada publicitária. **Não há campo limpo de onde derivar** —
`category_id` é nulo em 100% dessas linhas. Então a correção é em duas pernas:

- `utils/despesaCondominio.ts` — `rotuloDeDespesa()` e `podarRuidoDeBoleto()`,
  puras. Podam o ruído conhecido (CNPJ, VENCIMENTO, CADASTRE, BENEFICIÁRIO…),
  normalizam o espaçamento do OCR, recusam nome de arquivo como rótulo e caem
  no credor quando a descrição não presta. Devolvem `null` quando não sobra nada
  legível — quem chama decide o texto do vazio. **Pronto quando:** os casos reais
  da base viram rótulo legível e o teste cobre os dois sentidos. ✔ (10 casos)
- Aplicado em três pontos, uma implementação só: na **criação** do rateio (nasce
  legível), na **leitura** do snapshot (os rateios que já existem, e que o
  condômino já vê) e no **portal**. ✔
- `condominioRateioService.atualizarDescricaoDespesa()` + edição inline no
  detalhe do rateio, em Condomínios › Financeiro. **Só em RASCUNHO**: fechado é
  prestação de contas, e reescrever a linha depois muda o documento que o
  condômino já recebeu. **Pronto quando:** clicar na descrição edita, Enter
  salva, Esc cancela, e a lista local é costurada (§22) sem recarregar o Sheet. ✔

> A poda é o **default até o síndico escrever o certo** — não substitui. Por isso
> a edição, e por isso descrição escrita à mão passa intacta pela poda (testado).

## Item 2 — Aposentar o Portal do Condômino

**Medido antes de mexer:** `condomino_portal_access` com 2 linhas e **0 ativas**;
`condominio_aviso_leituras` com `access_id` não nulo: **0**; chamados vindos do
portal legado: **0**. Nada vivo depende dele.

Removidos:

- `App.tsx` — a rota pública `/portal-condomino?token=` e o guard. Link antigo
  que ainda circule cai no app normal, não numa rota quebrada. ✔
- `components/condominio/CondominoPortal.tsx` e
  `services/condominoPortalService.ts` — apagados. ✔
- `utils/acessoAoCondominio.ts` — some o segundo parâmetro e os estados
  `LINK_CONDOMINO`, `EXPIRADO` e `REVOGADO`. Sobra um caminho: o Portal do
  Cliente. **`AGUARDA_ABA` permanece** — é o coração do arquivo, e é o estado
  real de Reginaldo hoje. ✔
- `OcupacoesTab` — o estado `acessos`, o `revogarAcesso`, o item de kebab
  "Revogar link de condômino" e o ramo `LINK_CONDOMINO` do interruptor. ✔
- `ComunicacaoTab` — o "alcance" do aviso passa a ler só o Portal do Cliente
  (uma consulta a menos por carga). ✔
- `PortalCondominoAdmin` — a prévia do portal legado e o "copiar link". A tela
  **fica**: a pergunta "o que essa pessoa enxerga do condomínio?" continua de pé,
  e agora ela responde com a aba Condomínio do Portal do Cliente. O id da view
  (`condomino-portal`) não mudou, para não quebrar deep-link nem preferência
  salva. ✔
- `supabase/migrations/20270923000003_...sql` — derruba as **três RPCs**
  (`condomino_portal_get_data`, `..._marcar_lido`, `..._abrir_chamado`), todas
  executáveis por `anon`. **PENDENTE DE APLICAÇÃO** — ver abaixo.

### O que a migration deliberadamente NÃO faz

Não apaga `condomino_portal_access` nem `condominio_aviso_leituras.access_id`.
Sem código, sem RPC e sem rota, as duas viram dado histórico inerte. Apagar 2
tokens vencidos não devolve nada ao sistema e é irreversível; as duas ganharam
`COMMENT` dizendo que estão aposentadas. Se o usuário quiser limpar, é uma
migration própria com a decisão dele escrita nela.

*(Nota de processo: a primeira versão desta migration tinha `DROP TABLE` e
`DROP COLUMN`, e a escrita do arquivo foi barrada pelo classificador de
segurança do harness. A versão sem os DROPs não é contorno — é a decisão
melhor, e foi ela que ficou.)*

---

## Estado — feito, publicado e provado

| | |
|---|---|
| Item 1 — descrições legíveis | ✔ no ar |
| Item 2 — portal legado aposentado | ✔ no ar, migration aplicada |

**A prova pegou um defeito que o papel não pegou.** A 1ª versão da poda cortava
no *rótulo* "CNPJ", e o texto real do boleto traz só o **número**: o portal
seguiu mostrando "…ENERGIA S.A. 07.282.377/0001-20 47 61". Pior: o detector de
sujeira da própria prova procurava a palavra "CNPJ" e me devolveu "0 linhas com
ruído" — verde falso, do mesmo gênero que a memória
`portao_copiado_inverte_sinal` registra.

Corrigidos os dois: a poda passou a cortar também no CNPJ/CPF **formatado**
(específico de propósito — um `\d{6,}` genérico decapitaria "Energia — áreas
comuns 08/2026"), e o detector da prova passou a procurar o número. O portão foi
então testado nas DUAS direções: acusa 3/3 dos textos antigos e 0/3 dos novos.

Prova final no portal por link (Dynamis, escritas bloqueadas, 0 erro de página):
as 14 despesas leem "ENERGISA SUL-SUDESTE - DISTRIBUIDORA DE ENERGIA S.A." e
"Despesa sem descrição" (o boleto cuja descrição era só `download (98).pdf`).
A rota `/portal-condomino` não existe mais: cai na seleção de portal do app.

Banco: as 3 RPCs do legado somem (`condomino_portal_get_data` responde
`PGRST202` para `anon`), a do Portal do Cliente segue em 200, e as 2 linhas
históricas continuam lá com o `COMMENT` de aposentadoria.

Portões: `tsc` sem erro, `check-ui-standard` limpo, `check-xss-sinks` limpo,
suíte cheia **5129 testes**.

## Nota de incidente — Supabase fora entre ~21h e 21:35

Durante o trabalho o projeto passou a responder **HTTP 522**. O log do Postgres
que o usuário trouxe mostrou `pg_cron` e checkpoints completando normalmente, e
minhas sondas mostraram `rest/v1/` respondendo **401** e `functions/v1/` **404**
enquanto qualquer consulta real e o `auth/v1/health` davam 522 — ou seja:
**Postgres vivo; o caminho de conexão externo travado.** Os cron jobs seguiam
porque rodam DENTRO do banco, sem passar pela borda. Resolvido com restart
completo do projeto pelo usuário.

⚠️ **Hipótese não descartada:** rodei `supabase db query --linked` ~40 vezes na
sessão, e cada chamada cria uma login role temporária. Pode ter contribuído para
esgotar conexões. O `pg_stat_activity` depois do restart estava limpo — mas o
restart apagou a evidência, então isso **não inocenta**. Usar o CLI com
parcimônia em sessão longa, e conferir `pg_stat_activity` ANTES de reiniciar na
próxima vez.
