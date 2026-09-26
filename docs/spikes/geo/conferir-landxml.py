"""C3 — o LandXML que o NOSSO escritor gerou, lido por um parser XML de verdade
(ElementTree da biblioteca padrão, com o namespace do LandXML 1.2).

    python docs/spikes/geo/conferir-landxml.py <arquivo.xml>

Portão: sai com 1 se o XML não for bem formado, se faltar o namespace, se a
superfície não fechar (face apontando ponto inexistente) ou se vias, perfis e
parcelas não tiverem o que foi escrito.
"""
import sys
import xml.etree.ElementTree as ET

NS = {'lx': 'http://www.landxml.org/schema/LandXML-1.2'}
falhas = 0


def ok(c, m):
    global falhas
    print(("OK  " if c else "FALHOU ") + m)
    if not c:
        falhas += 1


raiz = ET.parse(sys.argv[1]).getroot()
ok(raiz.tag == '{http://www.landxml.org/schema/LandXML-1.2}LandXML' and raiz.get('version') == '1.2', 'raiz LandXML 1.2 com o namespace')
ok(raiz.find('lx:Units/lx:Metric', NS).get('linearUnit') == 'meter', 'unidades métricas')
cs = raiz.find('lx:CoordinateSystem', NS)
ok(cs is not None and cs.get('epsgCode') == '31983', 'CoordinateSystem EPSG 31983')
ok(raiz.find('lx:Project', NS).get('name') == 'Loteamento Alvorada & Cia', 'nome do projeto com & escapado e lido de volta')

pnts = raiz.findall('lx:Surfaces/lx:Surface/lx:Definition/lx:Pnts/lx:P', NS)
faces = raiz.findall('lx:Surfaces/lx:Surface/lx:Definition/lx:Faces/lx:F', NS)
ids = {p.get('id') for p in pnts}
ok(len(pnts) == 21 * 13 - 1, f'{len(pnts)} pontos (a grade menos o nó sem cota)')
ok(len(faces) == 2 * 239 + 1, f'{len(faces)} faces (2 por célula; 1 na do canto sem cota)')
ok(all(all(i in ids for i in f.text.split()) for f in faces), 'toda face aponta pontos que existem')
n, e, z = map(float, pnts[0].text.split())
ok(abs(e - 611005) < 1e-6 and abs(n - 7797000) < 1e-6 and abs(z - 800) < 1e-6, f'1º ponto na ordem NORTE ESTE COTA: {pnts[0].text}')

al = raiz.findall('lx:Alignments/lx:Alignment', NS)
ok([a.get('name') for a in al] == ['Rua A', 'Rua B', 'Rua C'], 'três alinhamentos, pelos nomes')
ok(abs(float(al[0].get('length')) - 100) < 1e-6, f"comprimento da Rua A = {al[0].get('length')}")
pvi = al[0].findall('lx:Profile/lx:ProfAlign/*', NS)
ok([p.tag.split('}')[1] for p in pvi] == ['PVI', 'ParaCurve', 'PVI'] and pvi[1].get('length') == '30.000', 'perfil da Rua A: PVI, curva vertical de 30 m, PVI')
ok(al[1].find('lx:Profile', NS) is None, 'Rua B sem greide sai sem perfil')

par = raiz.findall('lx:Parcels/lx:Parcel', NS)
ok([p.get('name') for p in par] == ['Gleba', 'Quadra A · Lote 1', 'Quadra A · Lote 2'], 'a gleba primeiro, depois os lotes (UTF-8)')
ok(abs(float(par[1].get('area')) - 580) < 1e-6, f"área do lote 1 = {par[1].get('area')} m²")
linhas = par[1].findall('lx:CoordGeom/lx:Line', NS)
ok(len(linhas) == 4 and linhas[-1].find('lx:End', NS).text == linhas[0].find('lx:Start', NS).text, 'lote fechado: 4 lados, o último termina no primeiro')

print('\nTUDO OK' if falhas == 0 else f'\n{falhas} FALHA(S)')
sys.exit(1 if falhas else 0)
