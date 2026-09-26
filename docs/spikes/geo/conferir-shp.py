"""A3 — o pyshp (leitor independente) lê o .zip que o NOSSO escritor gerou.

Portão: sai com 1 se tipo, geometria, Z, atributo acentuado ou o sentido do
anel não baterem. O pyshp não vem no repositório: `pip install --target <pasta> pyshp`
e PYTHONPATH=<pasta>.
"""
import sys, zipfile, io
import shapefile

zip_path = sys.argv[1]
z = zipfile.ZipFile(zip_path)
falhas = 0
def ok(cond, msg):
    global falhas
    print(("OK  " if cond else "FALHOU ") + msg)
    if not cond: falhas += 1

def abrir(nome):
    return shapefile.Reader(shp=io.BytesIO(z.read(nome + '.shp')), shx=io.BytesIO(z.read(nome + '.shx')), dbf=io.BytesIO(z.read(nome + '.dbf')), encoding='utf-8')

r = abrir('lote')
ok(r.shapeType == shapefile.POLYGONZ, f'lote: PolygonZ ({r.shapeTypeName})')
s = r.shape(0)
pts = s.points
ok(pts[0] == pts[-1], 'lote: anel fechado')
area2 = sum(pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1] for i in range(len(pts) - 1))
ok(area2 < 0, 'lote: anel externo horário')
ok(abs(abs(area2) / 2 - 600) < 1e-6, f'lote: área 600 m² ({abs(area2) / 2})')
rec = r.record(0).as_dict()
ok(rec.get('NOME') == 'Lote Ação', f"lote: NOME acentuado ({rec.get('NOME')!r})")
ok(abs(rec.get('AREA_M2') - 600) < 1e-9, f"lote: AREA_M2 ({rec.get('AREA_M2')})")

c = abrir('curvas')
ok(c.shapeType == shapefile.POLYLINEZ and len(c) == 2, f'curvas: 2 PolyLineZ ({c.shapeTypeName}, {len(c)})')
ok(list(c.shape(1).z) == [800.5, 800.5], f'curvas: Z da 2ª ({list(c.shape(1).z)})')
ok(c.record(0).as_dict().get('MESTRA') == 'sim', 'curvas: MESTRA')

p = abrir('pontos')
sp = p.shape(0)
ok(p.shapeType == shapefile.POINTZ, f'pontos: PointZ ({p.shapeTypeName})')
ok(tuple(sp.points[0]) == (611001.5, 7797002.25) and sp.z[0] == 800.125, f'pontos: XYZ ({sp.points[0]}, {sp.z})')
ok(p.record(0).as_dict().get('NOME') == 'Poço', 'pontos: NOME acentuado')
ok('PROJCS["SIRGAS_2000_UTM_Zone_23S"' in z.read('lote.prj').decode(), 'prj: SIRGAS 2000 / UTM 23S')
print('\nTUDO OK' if falhas == 0 else f'\n{falhas} FALHA(S)')
sys.exit(1 if falhas else 0)
