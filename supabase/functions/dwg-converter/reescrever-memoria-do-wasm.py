"""Reescreve a seção de memória do libredwg-web.wasm: initial 1024 MB → 64 MB (o máximo fica).

O pacote foi compilado com -sINITIAL_MEMORY=1GB; o worker da Edge Function não
tem isso e recusa com WORKER_RESOURCE_LIMIT. A memória cresce sob demanda
(ALLOW_MEMORY_GROWTH, máximo 4 GB), então começar menor só muda o arranque.
"""
import gzip, sys

ORIG = 'node_modules/@mlightcad/libredwg-web/wasm/libredwg-web.wasm'  # após npm i @mlightcad/libredwg-web@0.7.14 numa pasta à parte
DEST_GZ = 'supabase/functions/dwg-converter/libredwg-web.wasm.gz'
NOVO_INICIAL_PAGINAS = 1024  # 64 MB

data = open(ORIG, 'rb').read()


def leb_read(buf, p):
    r = 0
    s = 0
    while True:
        b = buf[p]
        p += 1
        r |= (b & 0x7F) << s
        s += 7
        if not b & 0x80:
            return r, p


def leb_write(n):
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)


out = bytearray(data[:8])
pos = 8
achou = False
while pos < len(data):
    sid = data[pos]
    inicio = pos
    pos += 1
    size, pos = leb_read(data, pos)
    corpo = data[pos:pos + size]
    if sid == 5:
        n, p = leb_read(corpo, 0)
        assert n == 1
        flags = corpo[p]
        p += 1
        ini, p = leb_read(corpo, p)
        resto = corpo[p:]  # máximo (se houver)
        assert ini == 16384, ini
        novo = leb_write(n) + bytes([flags]) + leb_write(NOVO_INICIAL_PAGINAS) + resto
        out += bytes([sid]) + leb_write(len(novo)) + novo
        achou = True
        print('memória: initial', ini, '->', NOVO_INICIAL_PAGINAS, 'páginas; flags', flags)
    else:
        out += data[inicio:pos + size]
    pos += size
assert achou
with gzip.open(DEST_GZ, 'wb', compresslevel=9) as f:
    f.write(bytes(out))
print('ok', len(out), 'bytes')
