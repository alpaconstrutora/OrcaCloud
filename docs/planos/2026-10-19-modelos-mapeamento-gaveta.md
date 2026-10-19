# Modelos de documento — mapeamento do marcador em gaveta com grupos e busca

## Pedido original

> o dropdown de cada campo na tela de Modelos de documento esta muito longo.
> minha sugestão e abrir um a gaveta com separacao por grupo e campo de busca. avalie

(com print do `<select>` aberto: Minha Organização › …, Cliente › …)

Avaliação apresentada (277 campos em 13 grupos, sem busca; fechado mostrava só "Número" sem
dizer de qual grupo; reaproveitar o `HierarchicalSelect` em gaveta, padrão de Plano de Contas /
Centro de Custo; não esconder grupos de Locação). Resposta do usuário: **"sim"**.

Sessão: Claude Code (VS Code) · 19/10/2026.

## Plano

### 1. `components/HierarchicalSelect.tsx` — opção `manterOrdem`
- **Muda:** prop aditiva que mantém a ordem de `items` em vez de ordenar por código/nome.
- **Pronto quando:** teste mostra os grupos/campos na ordem recebida com a prop, e a ordem
  antiga sem ela (nenhum uso existente muda).

### 2. `components/DocxTemplateManager.tsx` — `MappingSelect` vira gaveta
- **Muda:** `<select>` → `HierarchicalSelect` `panelVariant="drawer"`: "Texto fixo" no topo,
  um grupo por origem (sanfona), busca por campo ou grupo, título "Campo do marcador {NNN}".
  Gatilho mostra "Grupo › Campo". Valor gravado igual (`origem.campo`) — `token_map` intacto.
- **Pronto quando:** teste abre a gaveta de um marcador, busca, escolhe, e o mapeamento gravado
  é `{ source, field, label }`; o gatilho mostra o grupo; Texto fixo continua abrindo o campo.

### 3. Portões + tela + publicação
- **Pronto quando:** testes da tela (`DocxTemplateManagerDuplicar`) e novos verdes;
  `check-ui-standard` = 0 nos dois arquivos; `tsc` limpo; suíte com a conta fechando; gaveta
  conferida na tela real; push e prova de produção.

## Estado

- [x] 1. `manterOrdem` — `__tests__/components/HierarchicalSelectManterOrdem.test.tsx` (com e sem a prop)
- [x] 2. Gaveta — `__tests__/components/DocxTemplateMapeamentoGaveta.test.tsx` (4) + `DocxTemplateManagerDuplicar` verdes.
      Achado do teste: "CPF do cônjuge" existe em Cliente E em Fiador — na busca cada linha leva o grupo ao lado.
- [x] 3. Portões e tela: `check-ui-standard` 0 no `DocxTemplateManager.tsx`; no `HierarchicalSelect.tsx` acusa só a
      linha 154 (busca do seletor em `useState`), que já existia e é a exceção §3.1 do guia — não mexida. `tsc` 0
      erros. Suíte 10.493 + 10 (`blueprintCasaDeBombas`, worker fork caiu; 11/11 com `--pool=threads`) = 10.503
      passaram + 34 puladas = 10.537, 0 falhas. Tela real (Playwright, só leitura,
      `c:/tmp/pwtest/verificar-mapeamento-gaveta.cjs`): sem `<select>`; {002} fechado = "Contrato de Serviço ›
      Número"; gaveta "Campo do marcador {010}" abre com o grupo do valor atual expandido; busca "cpf" lista 10
      campos com o grupo ao lado; nada gravado. Publicação: abaixo.
