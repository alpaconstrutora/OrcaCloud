"""
Migra cabeçalhos de tabela cinza -> branco (REGRA do §6.11 do guia, trava cabecalhoSemCinzaGuard).

  python -I docs/spikes/cabecalhos-sem-cinza/migrar_lote.py <lote> <total_de_lotes>

Só mexe nas LINHAS que a trava marca (as mesmas regex), e dentro do className do elemento marcado:
  bg-{gray|slate|zinc|neutral|stone}-N[/op]      -> bg-white
  text-{gray|slate|zinc|neutral|stone}-400|500|600 -> text-gray-700
`hover:bg-…`/`group-hover:bg-…` não são tocados. Cada linha mudada é conferida: sem os tokens de
cor de fundo/texto, antes e depois têm de ser IGUAIS; senão aborta sem gravar nada.
Depois reescreve o BASELINE da trava com a contagem real de cada arquivo.
"""
import os
import re
import sys

THEAD = re.compile(r'<thead\b[^>]*className=(?:"[^"]*|\{`[^`]*)\bbg-(?:gray|slate|zinc|neutral|stone)-\d+')
TH = re.compile(r'<th\b[^>]*className=(?:"[^"]*|\{`[^`]*)\bbg-(?:gray|slate|zinc|neutral|stone)-\d+')
TR = re.compile(r'<tr\b[^>]*className=(?:"[^"]*|\{`[^`]*)\bbg-(?:gray|slate|zinc|neutral|stone)-(?:50|100|200)\b[^"`]*\b(?:uppercase|sticky|font-semibold|font-medium|font-bold|tracking-wide)')
COMENTARIO = re.compile(r'^\s*(//|\*|\{/\*)')
CLASSE = re.compile(r'(className=(?:"|\{`))([^"`]*)')
BG = re.compile(r'(?<![:\w-])bg-(?:gray|slate|zinc|neutral|stone)-\d+(?:/\d+)?')
TXT = re.compile(r'(?<![:\w-])text-(?:gray|slate|zinc|neutral|stone)-(?:400|500|600)\b')
SEM_CORES = re.compile(r'(?<![:\w-])(?:bg|text)-(?:white|gray-\d+|slate-\d+|zinc-\d+|neutral-\d+|stone-\d+)(?:/\d+)?')


def marcada(l):
    return not COMENTARIO.match(l) and (THEAD.search(l) or TH.search(l) or TR.search(l))


def trocar(linha):
    # Só o className do PRIMEIRO elemento marcado da linha.
    m = CLASSE.search(linha)
    novo = BG.sub('bg-white', m.group(2))
    novo = TXT.sub('text-gray-700', novo)
    return linha[:m.start(2)] + novo + linha[m.end(2):]


def arquivos():
    out = []
    for d, _, fs in os.walk('components'):
        for f in fs:
            if f.endswith('.tsx'):
                out.append(os.path.join(d, f).replace(os.sep, '/'))
    return sorted(out)


def contar(texto):
    return sum(1 for l in texto.split('\n') if marcada(l))


def main():
    lote, total = int(sys.argv[1]), int(sys.argv[2])
    com_divida = [f for f in arquivos() if contar(open(f, encoding='utf-8', newline='').read())]
    tam = -(-len(com_divida) // total)
    meus = com_divida[(lote - 1) * tam: lote * tam]
    gravar = {}
    for f in meus:
        bruto = open(f, encoding='utf-8', newline='').read()
        nl = '\r\n' if '\r\n' in bruto else '\n'
        linhas = bruto.replace('\r\n', '\n').split('\n')
        for i, l in enumerate(linhas):
            if marcada(l):
                n = trocar(l)
                if SEM_CORES.sub('', l) != SEM_CORES.sub('', n):
                    sys.exit(f'ABORTA: {f}:{i + 1} mudou além de bg/text\n  {l.strip()}\n  {n.strip()}')
                linhas[i] = n
        gravar[f] = nl.join(linhas)
    for f, t in gravar.items():
        open(f, 'w', encoding='utf-8', newline='').write(t)
    print(f'lote {lote}/{total}: {len(meus)} arquivos')
    for f in meus:
        print(' ', f, '->', contar(open(f, encoding='utf-8', newline='').read()), 'restantes')

    # BASELINE = contagem real de hoje
    teste = '__tests__/cabecalhoSemCinzaGuard.test.ts'
    bruto = open(teste, encoding='utf-8', newline='').read()
    nl = '\r\n' if '\r\n' in bruto else '\n'
    t = bruto.replace('\r\n', '\n')
    reais = {}
    for f in arquivos():
        n = contar(open(f, encoding='utf-8', newline='').read())
        if n:
            reais[f] = n
    corpo = ''.join(f"    '{f}': {n},\n" for f, n in sorted(reais.items()))
    t2 = re.sub(r'(const BASELINE: Record<string, number> = \{\n).*?(\n\};)', lambda m: m.group(1) + corpo.rstrip('\n') + m.group(2), t, flags=re.S)
    open(teste, 'w', encoding='utf-8', newline='').write(t2.replace('\n', nl) if nl == '\r\n' else t2)
    print('baseline:', len(reais), 'arquivos /', sum(reais.values()), 'linhas')


main()
