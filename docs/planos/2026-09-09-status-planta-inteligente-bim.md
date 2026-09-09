# Planta Inteligente → BIM: status e pendências

## Pedido original

> Atualize o status de implementação do plano e pendências

Status consolidado do roadmap que nasceu do pedido *"o que falta implementar para
transformar o módulo planta inteligente em um BIM completo"*, com "BIM completo"
definido pelo usuário como: **modelo arquitetônico completo + interoperar com
Revit/Archicad + 4D/5D ligado ao ÒPURA + instalações (MEP)**.

Este documento **não replaneja nada**. Ele diz o que está feito, o que está
provado, e — a parte que mais importa — **o que está feito e ainda não foi
provado**.

## As seis etapas

| # | etapa | situação | onde está o registro |
|---|---|---|---|
| 1 | Identidade de elemento + IFC de coordenação | ✅ | kernel `identity.ts`, `blueprint_objects.element_uid` |
| 2 | Modelo arquitetônico completo | ✅ | telhado, escada, forro/piso, tipos de esquadria, corte, 3D útil |
| 3 | 5D e 4D ligados ao ÒPURA | ✅ | custo por elemento, vínculo com tarefa, outbox, ponte com ferragem |
| 4 | Interoperabilidade Revit/Archicad | ✅ | viewer IFC, importar IFC e DXF, classificação, georreferência |
| 5 | Colaboração e governança | ✅ | comentário ancorado, aprovação, GED e Portal |
| 6 | Instalações (MEP) e clash | ✅ | replanejada e executada em 5 fatias |

**O kernel está em `blueprint-kernel-ts-0.19.0`, com 15 famílias no modelo.**

## O que a Etapa 6 virou, depois de replanejada

O plano antigo pedia **25 dias**; a execução levou **13**, e a diferença não foi
otimismo — foi medição:

- os 5 dias de "absorver o elétrico" **já tinham sido gastos** no arranjo único;
- o "grafo de trechos" (15 dias) **existia como código** e nunca carregara uma
  rede: **zero eletrodutos** no banco;
- o clash **não partia do zero**: `sobreposicao.ts` já media interseção
  volumétrica.

E ela terminou com o que o plano não previa: o módulo elétrico **saiu**
(5.812 linhas), depois de o kernel ganhar `Quadro`, `Circuito` e o quadro de
cargas — na ordem que transformou "apagar e perder" em "apagar e não perder".

## Depois das seis etapas

| o quê | situação |
|---|---|
| **BCF 2.1 — exportar** | ✅ conflitos e comentários, com `Header/File` apontando o IFC |
| **BCF 2.1 — importar** | ✅ leitor, casamento com o modelo, tela e persistência idempotente |

---

## ⚠️ PENDÊNCIAS — e a distinção que importa

### A. Feito, mas NÃO PROVADO no uso

**Esta é a maior pendência do módulo, e não é uma funcionalidade.**

Tudo o que saiu em 07–09/09/2026 — instalações, clash, BCF nos dois sentidos,
quadro de cargas — está verificado por **teste**, por **norma** e pelo **harness**,
e **nunca foi usado por uma pessoa num desenho real**. Isso pega o defeito que
existe no código; não pega o que existe no uso: a cota padrão errada para como a
empresa constrói, o gesto que atrapalha, a lista de conflitos vazia ou
barulhenta, o painel no lugar errado.

⚠️ A sessão inteira mostrou que medir vence raciocinar — abrir o IFC no Revit
achou **cinco** defeitos; comparar com o arquivo do buildingSMART achou **dois**;
consultar o banco do elétrico **reescreveu um plano**. Nenhum deles apareceria
por inspeção.

**O que pedir a quem usar**: 20 minutos desenhando instalação num projeto real —
um quadro, dois circuitos, algumas tomadas, um eletroduto. As perguntas: a cota
padrão faz sentido? prumada com dois cliques no mesmo ponto é natural? o clash
trouxe algo útil ou só ruído? o quadro de cargas tem o que se preencheria?

### B. A mão da porta — metade fechada

✅ Conferido no BIMvision: as portas saem com `SINGLE_SWING_LEFT` e
`SINGLE_SWING_RIGHT` — **a mão não se perde**, e o pior cenário está eliminado.

⚠️ **Não conferido**: se o nosso `LEFT` é o `LEFT` da norma. Um espelho GLOBAL
passaria por aquela leitura sem rastro. Duas tentativas de decidir medindo os
arquivos reais foram **negativas** (a assimetria de massa não tem sentido
consistente; o que parecia ferragem é o batente). Só decide um receptor que
**desenhe o arco** — no Revit, criando a planta do pavimento à mão, porque o
importador traz os níveis e **não cria as vistas de planta** deles.

Risco: se estiver espelhado, é **uma linha** em `operacaoIfcDaAbertura`.

### C. O BCF num receptor de verdade — risco baixo, não zero

Não achamos software: o Solibri Anywhere foi descontinuado e o BIMcollab não
abriu o arquivo. Em compensação há **três provas independentes**:

1. o arquivo é válido contra o **XSD oficial** do buildingSMART (7 casos);
2. os guids dos tópicos estão **dentro do IFC** do mesmo desenho;
3. um leitor construído pela especificação entende o **arquivo real** do
   buildingSMART, e o nosso.

⏳ Falta só o que um receptor mostraria: **clicar no tópico destaca a peça**.
Arquivos de prova em `C:/Users/altai/Desktop/prova-bcf/`. Gratuitos que leem
BCF hoje: **BCFier** (plugin de Revit) e **usBIM**.

### D. Lacunas declaradas, cada uma com o motivo

| o quê | por que ficou de fora |
|---|---|
| **Quadro e circuito no IFC** | o desenho passou a saber mais do que exporta. A cobertura já declara a omissão, então não há mentira no arquivo — mas `IfcDistributionBoard` e `IfcDistributionCircuit` existem e o caminho é o da F4 |
| **Dimensionamento elétrico** | queda de tensão, seção por corrente, demanda normativa. É cálculo de projeto, com norma e ART atrás — somar é registro, decidir é projeto |
| **Conexões MEP** (joelho, tê, luva), registro, ar-condicionado, gás, incêndio | a estrutura de `disciplina` os aceita sem mudança; entram quando alguém os pedir |
| **Snapshot PNG no tópico BCF** | o canvas sabe gerar imagem; falta decidir o recorte, e um recorte errado é pior que nenhuma imagem |
| ~~Arrastar e apagar trecho~~ | ✅ feito em 09/09 — e ⚠️ **não era miudeza**: `DeleteTrecho`, `DeleteTerminal` e `DeleteQuadro` **não existiam**. Publiquei famílias que só saíam apagando o pavimento inteiro |
| **Trecho em elevação e corte** | as vistas não mostram instalação; meia fatia |
| **Botão de compartilhar a planta com o cliente** dentro do editor | a função existe e a escrita está provada; escolher o cliente pede uma tela, e o caminho por Documentos já funciona |
| **As 11 tabelas do módulo elétrico** | o código saiu; as tabelas ficam. Apagar código é reversível por git, `DROP TABLE` não é — e tabela vazia não custa nada |

---

## O que este módulo passou a garantir, e que não garantia

- **Identidade estável**: a mesma parede tem o mesmo `GlobalId` na revisão
  seguinte. É o que sustenta IFC, BCF, comentário ancorado, 4D e clash.
- **Hash de versão neutro a mudanças de forma**: cinco famílias novas entraram
  (telhado, escada, corte, instalações, quadro/circuito) e o payload de todo
  desenho sem elas continuou byte a byte o mesmo — provado ANTES de cada bump.
- **Nada que o desenho não saiba é inventado**: cota, bitola, disjuntor e seção
  são declarados; o que falta aparece como faltando.
- **O que o arquivo NÃO contém está escrito dentro dele** — a cobertura do IFC é
  requisito, não cortesia.

## Verificação desta sessão

| o quê | número |
|---|---|
| suíte | **3.247** casos, 0 falhas |
| publicações em `main` | 80 desde 07/09 |
| kernel | 0.17.0 → **0.19.0**, cada bump com as goldens passando na versão ANTIGA primeiro |
| migrations | aplicadas com `db query -f`, conferidas de fora, com a escrita provada por sessão autenticada e revertida |
