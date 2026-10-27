---
version: 1
slug: "components-laborportal-tsx"
primary_target: "components/LaborPortal.tsx"
related_targets: []
---

# Portal do Colaborador (PortalView)

Modo: Operate. Público: colaborador de obra no celular, no canteiro, ao sol, perto de colegas.
Tarefa principal: conferir o holerite. Depois: ponto, férias, documentos, treinamentos.
Marca: a da EMPRESA do colaborador (`organizations.logo_url`, ou o nome) com a paleta Alpa.
Fora deste brief: tipografia (item 5), auditoria a11y completa (item 6), PaystubModal.

## Direction contract

THESIS: o portal abre no dinheiro do colaborador — o último holerite é a tela, não um atalho; recusa o cabeçalho-dashboard de indicadores coloridos sobre degradê com abas no topo.

OWN-WORLD: chão off-white #EDEDE8, cartões brancos, texto grafite #4B4B4D; laranja Alpa #FF884C só como preenchimento (item ativo do rodapé, faixa do cartão do holerite), nunca como texto; texto em laranja = #A84A1C; secundário = #566375; botão primário grafite com texto branco; cantos arredondados largos como o símbolo da marca; nada de degradê, glass ou índigo.

STORY: a pessoa vê a marca da empresa dela, o próprio nome e "desde dd/mm/aaaa"; entende em um olhar qual é o último holerite e abre; o valor só aparece quando ela pede.

FIRST VIEWPORT: (390px) cabeçalho branco — logo da empresa à esquerda, altura fixa, largura livre; nome + cargo · desde; "Sair" em texto à direita (só no link real). Abaixo, cartão grande "Último holerite · {Mês de AAAA}" com faixa laranja, tipo da folha, "R$ ••••" + olho, botão grafite "Abrir holerite". Depois "Anteriores". Rodapé fixo com 5 itens: Holerites · Ponto · Férias · Documentos · Treinamentos.

FORM: brief-pinned pelo usuário (logo, paleta, estrutura e rodapé decididos nas respostas de 26/10/2026) — a direção fixada prevalece sobre o sorteio; concept-seed rodou depois só para registrar a referência. seed:52c12df2b4c9433e
Interação-assinatura: o olho do valor — troca "R$ ••••" pelo líquido com um desfoque curto que assenta (respeita prefers-reduced-motion), lembrado no aparelho.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
