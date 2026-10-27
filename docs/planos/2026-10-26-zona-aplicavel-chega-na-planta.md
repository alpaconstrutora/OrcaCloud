# Zona aplicável do empreendimento chega à Planta (26/10/2026)

## Pedido original

> verififque se ao se na gaveta Dados do lote, zona e topografia >Zona urbanística, ao selecionar
> empreendimento esta trazendo os dados do mapa regulatorio selecionado em empreendimentos corretamente

Resposta à verificação (código no `main` d5eb5f66 + banco): **não trazia**. Proposta aprovada ("Sim"):
corrigir o código e juntar as zonas repetidas no banco.

## O que estava errado

1. **Zona apagada continuava em vigor, calada.** A planta "Garden" (vinculada ao 011 - Garden Cambuhy)
   aplicou em 21/10 a ZEPEC 2 · Urbanização Consolidada (11,6 m, 6 pav., C.A. 4, T.O. 70%, frente 5 m).
   A reimportação de 26/10 (#190, "Substituir as zonas atuais") apagou essa linha. A planta seguia com os
   números velhos: `derivou` trata zona sumida como "nada a comparar" e a zona aplicável só entra em
   planta SEM contexto salvo.
2. **Escolher o empreendimento não trazia a zona marcada como aplicável** quando a planta já tinha
   contexto (inclusive desligado).
3. **A zona aplicável vinha sem T.O./T.P.** O mapa "Plano Diretor" (Cambuí-MG) recebeu a TABELA 1 da
   LC 12/2020 três vezes (19-20/07/2026; a 1ª sem T.O./T.P.) — 175 linhas para 59 zonas × macroárea.
   O Garden herdou a repetição; a linha marcada é a da 1ª leitura.
4. O aviso da aplicação automática dizia "é a única cadastrada" também quando entrou por ser a aplicável.

## O que muda

### Código (`hooks/useBlueprintZonaUrbanistica.ts`, `components/blueprint/PainelZonaUrbanistica.tsx`)
- Escolher um empreendimento no seletor aplica a zona dele que está marcada como aplicável (ou a única),
  quando as zonas chegam — **exceto** se há valor ajustado à mão (aí só o aviso abaixo, com botão).
- Aviso novo: a zona em vigor não existe mais na origem (mapa/empreendimento) → diz que os valores são os
  de quando foi aplicada, com botão para aplicar a zona aplicável do empreendimento.
- Aviso novo: o empreendimento marca uma zona aplicável diferente da que está em vigor (ou nenhuma em
  vigor) → botão "Aplicar".
- Texto da aplicação automática diz o motivo certo (única × marcada como aplicável).

### Dados (`supabase/migrations/aplicar_20271027100000_mapa_regulatorio_juntar_importacoes_repetidas.sql`)
- Por dono e zona × macroárea repetida, sem valores conflitantes: fica uma linha (a aplicável; senão a
  usada por planta; senão a de menor ordem), com os campos vazios preenchidos pelas irmãs; planta que
  apontava para irmã é repontada; irmãs copiadas para o schema `arquivo_mapa_regulatorio` e apagadas.
- **ZC · Urbanização Consolidada fica como está** (T.O. 0,7 numa importação, 0,9 em outra): a lei decide.
- Ensaio com ROLLBACK (26/10): catálogo e Garden 175 → 61 linhas; ZEPEC 2 · UC aplicável com
  T.O. 0,9, T.P. 0,05, gabarito 18 m, C.A. 3.

## Verificação
- Testes do hook (`__tests__/blueprintZonaAutopreencher.test.ts`) e do painel.
- `bash scripts/check-ui-standard.sh components/blueprint/PainelZonaUrbanistica.tsx`.
- PR → CI verde → merge. Banco: contagens depois de aplicar o script.
