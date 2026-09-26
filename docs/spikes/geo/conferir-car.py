import sys, zipfile, io, os
# uso: python conferir-car.py <car.zip>  (pyshp instalado: pip install pyshp)
import shapefile

z = zipfile.ZipFile(sys.argv[1])
nomes = sorted(z.namelist())
print('arquivos:', nomes)
bases = sorted({n.rsplit('.', 1)[0] for n in nomes})
for b in bases:
    r = shapefile.Reader(shp=io.BytesIO(z.read(b + '.shp')), shx=io.BytesIO(z.read(b + '.shx')), dbf=io.BytesIO(z.read(b + '.dbf')), encoding='utf-8')
    prj = z.read(b + '.prj').decode()
    campos = [f[0] for f in r.fields[1:]]
    for sr in r.shapeRecords():
        xs = [p[0] for p in sr.shape.points]; ys = [p[1] for p in sr.shape.points]
        print(f"{b}: tipo={sr.shape.shapeTypeName} campos={campos} attrs={list(sr.record)} lon=[{min(xs):.5f},{max(xs):.5f}] lat=[{min(ys):.5f},{max(ys):.5f}] SIRGAS={'SIRGAS' in prj and 'PROJCS' not in prj}")
