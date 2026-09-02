# Auditoria de segurança — ORÇACLOUD / ÒPURA

Auditoria de 2026-09-01 sobre as cinco categorias pedidas: isolamento de tenant,
permissão definida no navegador, IDOR, segredos expostos e XSS.

| Arquivo | O que é |
|---|---|
| `relatorio-auditoria-seguranca.pdf` | O relatório (35 páginas, A4). Entregável principal. |
| `issues-github.md` | As mesmas issues da seção 7 do PDF, em Markdown puro, para colar no GitHub. |
| `achados.py` | **Fonte da verdade.** Achados, pontos fortes/fracos, recomendações e agrupamento das issues. |
| `gerar_relatorio.py` | Só desenha o PDF e o `.md` a partir de `achados.py`. |
| `provas/` | Os três scripts SQL executados contra produção que sustentam os achados críticos. Ver `provas/README.md`. |

## Regerar

```bash
cd docs/security-audit
python -m venv .venv                                   # só na primeira vez
./.venv/Scripts/python.exe -m pip install reportlab matplotlib
./.venv/Scripts/python.exe gerar_relatorio.py
```

No Linux/macOS troque `./.venv/Scripts/python.exe` por `./.venv/bin/python`.

## Como atualizar depois de corrigir algo

Edite **`achados.py`**, não o PDF nem o `.md`: remova o achado corrigido (ou
acrescente um novo) e rode o gerador. Contagens, gráfico de rosca, gráfico de
barras, índice, tabela de detalhe e issues são todos derivados dessa lista — não
há número escrito à mão em lugar nenhum.

## Verificação do PDF

Conferido após a geração: 39 páginas, todas A4 (595×842 pt), nenhuma página
vazia, gráficos renderizados, tabelas legíveis e camada de texto sem espaços
não-quebráveis (o Markdown das issues cola limpo).

## Nota sobre os dados

Nenhum dado foi criado, alterado ou removido no banco durante a auditoria: as
provas que escrevem rodam dentro de `BEGIN ... RAISE EXCEPTION`, que aborta a
transação por construção. PII obtida durante a prova do C3-01 (CPF de um titular
real) foi **redigida** do relatório — o PDF descreve o que foi obtido, sem
reproduzir o dado.
