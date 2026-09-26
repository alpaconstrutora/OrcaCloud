"""A4 — o .ods que o NAVEGADOR gerou, lido por um leitor INDEPENDENTE (zipfile +
ElementTree da biblioteca padrão do Python), contra o modelo oficial do INCRA.

    python docs/spikes/geo/conferir-ods.py <gerado.ods> <modelo.ods>

Portão: sai com 1 se o zip não for um ODS válido, se alguma aba ou parâmetro do
modelo sumiu/mudou, ou se as células de identificação e de vértices não trazem
o que o formato do manual pede.
"""
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

T = '{urn:oasis:names:tc:opendocument:xmlns:table:1.0}'
gerado, modelo = sys.argv[1], sys.argv[2]
falhas = 0


def ok(c, m):
    global falhas
    print(("OK  " if c else "FALHOU ") + m)
    if not c:
        falhas += 1


def abas(caminho):
    z = zipfile.ZipFile(caminho)
    raiz = ET.fromstring(z.read('content.xml'))
    return z, {t.get(T + 'name'): t for t in raiz.iter(T + 'table')}


def celula(tabela, a1):
    m = re.match(r'([A-Z]+)(\d+)$', a1)
    col = 0
    for ch in m.group(1):
        col = col * 26 + ord(ch) - 64
    col -= 1
    lin = int(m.group(2)) - 1
    r = 0
    for row in tabela.findall(T + 'table-row'):
        rep = int(row.get(T + 'number-rows-repeated', '1'))
        if lin < r + rep:
            c = 0
            for cel in row:
                if cel.tag not in (T + 'table-cell', T + 'covered-table-cell'):
                    continue
                rc = int(cel.get(T + 'number-columns-repeated', '1'))
                if col < c + rc:
                    return '\n'.join(''.join(p.itertext()) for p in cel if p.tag.endswith('}p'))
                c += rc
            return ''
        r += rep
    return ''


zg, g = abas(gerado)
zm, m = abas(modelo)
ok(zg.namelist()[0] == 'mimetype' and zg.getinfo('mimetype').compress_type == zipfile.ZIP_STORED, 'mimetype primeiro e sem compressão')
ok(zg.read('mimetype') == b'application/vnd.oasis.opendocument.spreadsheet', 'mimetype de planilha ODS')
ok(list(g) == list(m), f'as {len(m)} abas do modelo, na mesma ordem')
ok(sorted(n for n in zg.namelist() if n != 'content.xml') == sorted(n for n in zm.namelist() if n != 'content.xml'), 'os demais arquivos do modelo (estilos, macros, manifesto) intactos')
for aba in ['parametros_controles', 'parametros_vertice', 'parametros_vertice_validacao', 'parametros_vertice_validacao_excecao', 'parametros_imovel_validacao', 'sobre']:
    ok(ET.tostring(g[aba]) == ET.tostring(m[aba]), f'aba {aba} idêntica ao modelo')

idt, per = g['identificacao'], g['perimetro_1']
ok(celula(idt, 'B6') == 'João da Silva', f"identificacao.B6 = {celula(idt, 'B6')!r}")
ok(celula(idt, 'B10') == 'Fazenda Santa Luzia', 'identificacao.B10 = denominação')
ok(celula(idt, 'B16') == 'Belo Horizonte-MG', 'identificacao.B16 = município')
ok(celula(per, 'B9') == 'Geográfica' and celula(per, 'F9') == 'Sul', 'perimetro_1: coordenada geográfica, hemisfério sul')
ok(celula(per, 'A11') == 'Vértice', 'cabeçalho da tabela de vértices intacto')
codigos = [celula(per, f'A{12 + i}') for i in range(5)]
ok(codigos[:4] == ['ABC1-M-0002', 'ABC1-P-0001', 'ABC1-M-0001', 'ABC1-P-0002'] and codigos[4] == '', f'4 vértices a partir da linha 12: {codigos}')
lon, lat = celula(per, 'B12'), celula(per, 'D12')
ok(re.fullmatch(r'\d{1,3} \d{2} \d{2},\d{3} W', lon) is not None, f'longitude no formato do manual: {lon!r}')
ok(re.fullmatch(r'\d{1,2} \d{2} \d{2},\d{3} S', lat) is not None, f'latitude no formato do manual: {lat!r}')
ok(celula(per, 'C12') == '0,02', f"sigma long com 2 casas e vírgula: {celula(per, 'C12')!r}")
ok(re.fullmatch(r'\d+,\d{2}', celula(per, 'F12')) is not None, f"altitude com 2 casas: {celula(per, 'F12')!r}")
ok(celula(per, 'H12') == 'PG6' and celula(per, 'I12') == 'LA3', f"método e limite: {celula(per, 'H12')!r} {celula(per, 'I12')!r}")
ok(celula(per, 'L12') == 'Estrada Municipal MG-10', f"confrontante: {celula(per, 'L12')!r}")
print('\nTUDO OK' if falhas == 0 else f'\n{falhas} FALHA(S)')
sys.exit(1 if falhas else 0)
