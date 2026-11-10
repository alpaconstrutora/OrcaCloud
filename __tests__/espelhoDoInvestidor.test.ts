/**
 * ESPELHO DE VENDAS 3D NO PORTAL DO INVESTIDOR (F4, 10/11/2026): da obra que a RPC entrega para a cena e os números.
 * E a trava do que NÃO pode sair do banco para o investidor: nada de negociação, nada de comprador.
 * Plano: docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { montarEspelhoDoInvestidor, statusDoInvestidor, type ObraDoEspelho, type UnidadeDoInvestidor } from '../utils/espelhoDoInvestidor';
import { ETAPAS_VENDIDA, saleUnitClassifier } from '../lib/salesAnalysis';

const unidade = (id: string, floor: number | null, extra: Partial<UnidadeDoInvestidor> = {}): UnidadeDoInvestidor => ({
  id, name: id, floor, floor_tipo: null, typology: '2 quartos', private_area: 80, bedrooms: 2, bathrooms: 2, parking_spaces: 1,
  position_type: null, sun_orientation: null, sort_order: 0, vaga_na_planta: null, is_vendavel: true, price: 500_000, status: 'available', ...extra,
});

const OBRA: ObraDoEspelho = {
  project_id: 'p1',
  project_name: 'Bella Vista',
  vgv_vendido: 930_000,
  torres: [
    {
      id: 't1', name: 'Torre Única', sort_order: 0, floors_count: 3, units_per_floor: 2, pe_direito_padrao_m: 3, elevacao_terreo_m: null,
      ordem_das_unidades_na_planta: 'POSICAO', blueprint_quadra_uid: null, distancias_entre_torres: null, floors: [],
      units: [
        unidade('101', 1, { status: 'sold' }),
        unidade('102', 1, { status: 'sold', price: 480_000 }),
        unidade('201', 2, { status: 'reserved', price: 510_000 }),
        unidade('202', 2, { status: 'available', price: 520_000 }),
        unidade('301', 3, { status: 'exchanged' }),
        unidade('302', 3, { status: 'available', price: null }),
        unidade('Salão', 0, { is_vendavel: false, price: null, status: 'available' }),
      ],
    },
  ],
};

describe('montarEspelhoDoInvestidor', () => {
  const r = montarEspelhoDoInvestidor(OBRA);

  it('um prisma por unidade vendável, com o status que veio do banco', () => {
    expect(r.cena.torres.map((t) => t.nome)).toEqual(['Torre Única']);
    expect(Object.fromEntries(r.cena.prismas.filter((p) => p.unitId).map((p) => [p.unitId, p.status]))).toEqual({
      '101': 'sold', '102': 'sold', '201': 'reserved', '202': 'available', '301': 'exchanged', '302': 'available',
    });
  });

  it('unidade não vendável (salão, zeladoria) guarda o lugar, neutra — e não entra nos números', () => {
    const terreo = r.cena.prismas.filter((p) => p.andar === 0);
    expect(terreo).toHaveLength(1);
    expect(terreo[0]).toMatchObject({ unitId: null, status: null });
    expect(r.resumo.unidades).toBe(6);
    expect(r.dados.has('Salão')).toBe(false);
  });

  it('os números: vendidas de vendáveis, VGV vendido do banco, VGV em estoque pelo preço de tabela', () => {
    expect(r.resumo).toMatchObject({ unidades: 6, vendidas: 2, vgvVendido: 930_000, foraDoDesenho: 0 });
    expect(r.resumo.taxaVendida).toBeCloseTo(2 / 6, 5);
    // Em estoque = vendável ainda não vendida nem permutada, com preço: 201 + 202. A 302 não tem preço: fica fora e é contada.
    expect(r.resumo.vgvEstoque).toBe(510_000 + 520_000);
    expect(r.resumo.semPreco).toBe(1);
  });

  it('a ficha traz o preço de tabela e os dados do cadastro', () => {
    expect(r.dados.get('202')).toEqual({ tipologia: '2 quartos', plantaUrl: null, areaPrivativaM2: 80, dormitorios: 2, banheiros: 2, vagas: 1, preco: 520_000 });
  });

  // F5 (10/11/2026): a planta baixa da tipologia, que vem com a obra.
  it('a ficha leva a planta da tipologia da unidade quando a obra a traz', () => {
    const comPlantas = montarEspelhoDoInvestidor({ ...OBRA, plantas: [{ tipologia: '2 QUARTOS', tipologia_chave: '2 quartos', imagem_url: 'https://x/2q.png' }] });
    expect(comPlantas.dados.get('202')!.plantaUrl).toBe('https://x/2q.png');
    expect(montarEspelhoDoInvestidor({ ...OBRA, plantas: null }).dados.get('202')!.plantaUrl).toBeNull();
  });

  it('unidade vendável sem andar conta nos números e é dita fora do desenho', () => {
    const obra = { ...OBRA, torres: [{ ...OBRA.torres[0], units: [...OBRA.torres[0].units, unidade('Lote 9', null)] }] };
    const x = montarEspelhoDoInvestidor(obra);
    expect(x.resumo.unidades).toBe(7);
    expect(x.resumo.foraDoDesenho).toBe(1);
  });

  it('torre com o contorno enviado pela Planta sai com a forma do desenho', () => {
    const anel = [{ x: 0, y: 0 }, { x: 26000, y: 0 }, { x: 26000, y: 12000 }, { x: 14000, y: 12000 }, { x: 14000, y: 22000 }, { x: 0, y: 22000 }];
    const x = montarEspelhoDoInvestidor({ ...OBRA, torres: [{ ...OBRA.torres[0], contorno_na_planta: anel, contorno_frente: null, contorno_norte_deg: null }] });
    expect(x.cena.torres[0]).toMatchObject({ origem: 'PLANTA', caixa: { minX: 0, minY: 0, maxX: 26000, maxY: 22000 } });
    expect(r.cena.torres[0].origem).toBe('ESQUEMATICA');
  });

  it('obra sem torre: cena vazia e números zerados, sem estourar', () => {
    const x = montarEspelhoDoInvestidor({ project_id: 'p', project_name: 'X', vgv_vendido: null, torres: [] });
    expect(x.cena.prismas).toEqual([]);
    expect(x.resumo).toEqual({ unidades: 0, vendidas: 0, taxaVendida: null, vgvVendido: 0, vgvEstoque: 0, semPreco: 0, foraDoDesenho: 0 });
  });

  it('status que o banco não conhece vira "outro" — nunca uma cor inventada', () => {
    expect(['sold', 'reserved', 'available', 'exchanged', 'other', 'VENDIDO', '', null].map(statusDoInvestidor)).toEqual([
      'sold', 'reserved', 'available', 'exchanged', 'other', 'other', 'other', 'other',
    ]);
  });
});

/**
 * O que a função do banco pode entregar ao investidor. O CI não tem credencial do banco: a trava é no TEXTO da
 * migration (como `segurancaMigrations.test.ts`); a postura real foi conferida no banco ao aplicar.
 */
/** A migration sem os comentários de linha. */
const lerMigration = (arquivo: string) => fs.readFileSync(path.join(process.cwd(), 'supabase', 'migrations', arquivo), 'utf-8').replace(/^\s*--.*$/gm, ' ');

describe('fn_investor_portal_get_espelho — o que sai do banco', () => {
  const sql = lerMigration('aplicar_20271110100000_investor_portal_espelho.sql');
  /** As chaves de todo `jsonb_build_object` da migration: é tudo o que chega ao navegador. */
  const chaves = [...sql.matchAll(/'([a-z_]+)'\s*,\s*(?=[a-zA-Z(])/g)].map((m) => m[1]);

  it('nenhuma chave de negociação, comprador ou corretor no retorno', () => {
    expect(chaves.length).toBeGreaterThan(30);
    const proibidas = chaves.filter((k) => /client|buyer|comprador|cliente|deal|negoc|broker|corretor|document|cpf|cnpj|email|phone|contract|property_id|commercial_property/.test(k));
    expect(proibidas).toEqual([]);
  });

  it('o retorno da unidade é exatamente a lista combinada com o usuário (status, preço de tabela, geometria e ficha)', () => {
    const daUnidade = sql.slice(sql.indexOf("'units', COALESCE"), sql.indexOf('FROM unidades u WHERE u.tower_id = t.id'));
    expect([...daUnidade.matchAll(/'([a-z_]+)'\s*,/g)].map((m) => m[1]).filter((k) => k !== 'units').sort()).toEqual([
      'bathrooms', 'bedrooms', 'floor', 'floor_tipo', 'id', 'is_vendavel', 'name', 'parking_spaces', 'position_type', 'price',
      'private_area', 'sort_order', 'status', 'sun_orientation', 'typology', 'vaga_na_planta',
    ]);
  });

  it('"vendida" no SQL são as MESMAS etapas da regra do front (`ETAPAS_VENDIDA`)', () => {
    const listas = [...sql.matchAll(/n\.status IN \(([^)]*)\)/g)].map((m) => m[1].split(',').map((x) => x.trim().replace(/'/g, '')));
    expect(listas.length).toBe(2);
    for (const l of listas) expect(l).toEqual(ETAPAS_VENDIDA);
  });

  it('a ordem do CASE do status é a de `saleUnitClassifier.statusOf`: venda, permuta, negociação, disponível', () => {
    // Até o ELSE (e não até "END": 'VENDIDO' tem "END" dentro).
    const inicio = sql.indexOf("'status', CASE");
    const caso = sql.slice(inicio, sql.indexOf("ELSE 'other'", inicio) + "ELSE 'other'".length);
    const ordem = [...caso.matchAll(/THEN '([a-z]+)'/g)].map((m) => m[1]);
    expect(ordem).toEqual(['sold', 'exchanged', 'reserved', 'available']);
    expect(caso).toMatch(/ELSE 'other'/);
    // A mesma precedência, do lado do front: negociação aberta numa unidade permutada continua permutada.
    const c = saleUnitClassifier([{ id: 'd', property_id: 'x', status: 'PENDING' }]);
    expect(c.statusOf({ id: 'x', status: 'EXCHANGED' })).toBe('exchanged');
    expect(c.statusOf({ id: 'x', status: 'AVAILABLE' })).toBe('reserved');
  });

  it('as internas não têm GRANT; a do link vai a anon; a do app só a authenticated', () => {
    expect(sql).not.toMatch(/GRANT[^;]*fn_espelho_de_vendas_das_obras/);
    expect(sql).not.toMatch(/GRANT[^;]*fn_obras_do_investidor/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.fn_investor_portal_get_espelho\(TEXT\) TO anon, authenticated;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.fn_investor_get_espelho\(UUID\) TO authenticated;/);
  });
});

/**
 * F1b (10/11/2026): a migration do contorno REESCREVE `fn_espelho_de_vendas_das_obras` (e a do corretor) para trazer
 * o contorno da torre. É a definição que vale no banco — a mesma trava tem de valer para ela.
 */
describe('migration do contorno da torre — as funções reescritas continuam sem dado de pessoa', () => {
  const sql = lerMigration('aplicar_20271110200000_torre_contorno_na_planta.sql');
  const chaves = [...sql.matchAll(/'([a-z_]+)'\s*,\s*(?=[a-zA-Z(])/g)].map((m) => m[1]);

  it('entram só as três chaves do contorno; nada de negociação, comprador ou corretor', () => {
    expect(chaves.filter((k) => k.startsWith('contorno_')).sort()).toEqual([
      'contorno_frente', 'contorno_frente', 'contorno_na_planta', 'contorno_na_planta', 'contorno_norte_deg', 'contorno_norte_deg',
    ]);
    expect(chaves.filter((k) => /client|buyer|comprador|cliente|deal|negoc|broker|corretor|document|cpf|cnpj|email|phone|contract/.test(k))).toEqual([]);
  });

  it('a unidade do investidor segue com as mesmas 16 chaves, e a do corretor sem preço nem status', () => {
    const doInvestidor = sql.slice(sql.lastIndexOf("'units', COALESCE"), sql.indexOf('FROM unidades u WHERE u.tower_id = t.id'));
    expect([...doInvestidor.matchAll(/'([a-z_]+)'\s*,/g)].map((m) => m[1]).filter((k) => k !== 'units').sort()).toEqual([
      'bathrooms', 'bedrooms', 'floor', 'floor_tipo', 'id', 'is_vendavel', 'name', 'parking_spaces', 'position_type', 'price',
      'private_area', 'sort_order', 'status', 'sun_orientation', 'typology', 'vaga_na_planta',
    ]);
    const doCorretor = sql.slice(sql.indexOf("'units', COALESCE"), sql.indexOf('FROM public.empreendimento_units u\n                        WHERE u.tower_id = tw.id'));
    const chavesDoCorretor = [...doCorretor.matchAll(/'([a-z_]+)'\s*,/g)].map((m) => m[1]);
    expect(chavesDoCorretor).toContain('property_id');
    expect(chavesDoCorretor.filter((k) => k === 'price' || k === 'status')).toEqual([]);
  });

  it('"vendida" continua sendo as etapas da regra do front, e as internas seguem sem GRANT', () => {
    const listas = [...sql.matchAll(/n\.status IN \(([^)]*)\)/g)].map((m) => m[1].split(',').map((x) => x.trim().replace(/'/g, '')));
    expect(listas.length).toBe(2);
    for (const l of listas) expect(l).toEqual(ETAPAS_VENDIDA);
    expect(sql).not.toMatch(/GRANT[^;]*fn_espelho_de_vendas_das_obras/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.fn_broker_portal_get_espelho\(TEXT\) TO anon, authenticated;/);
  });
});

/**
 * F5 (10/11/2026): a migration das plantas por tipologia REESCREVE de novo as duas funções do espelho, para trazer
 * `plantas`. É a definição que vale no banco — a mesma trava tem de valer para ela.
 */
describe('migration das plantas por tipologia — tabela fechada, bucket sem listagem, funções sem dado de pessoa', () => {
  const sql = lerMigration('aplicar_20271110500000_empreendimento_tipologia_plantas.sql');
  const anterior = lerMigration('aplicar_20271110200000_torre_contorno_na_planta.sql');
  const chavesDe = (texto: string) => [...texto.matchAll(/'([a-z_]+)'\s*,\s*(?=[a-zA-Z(])/g)].map((m) => m[1]);
  const funcao = (texto: string, nome: string) => {
    const i = texto.indexOf(`CREATE OR REPLACE FUNCTION public.${nome}`);
    return texto.slice(i, texto.indexOf('$X$;', i));
  };

  it('a tabela nasce com RLS, policy só para authenticated pela organização do empreendimento, e fechada para anon', () => {
    expect(sql).toMatch(/ALTER TABLE public\.empreendimento_tipologia_plantas ENABLE ROW LEVEL SECURITY;/);
    expect(sql).toMatch(/CREATE POLICY org_access_empr_tipologia_plantas ON public\.empreendimento_tipologia_plantas\s+FOR ALL TO authenticated/);
    expect(sql.match(/e\.organization_id IN \(SELECT public\.empr_user_org_ids\(\)\)/g)).toHaveLength(2);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.empreendimento_tipologia_plantas FROM anon;/);
    expect(sql).not.toMatch(/GRANT[^;]*empreendimento_tipologia_plantas[^;]*anon/);
    expect(sql).toMatch(/UNIQUE \(empreendimento_id, tipologia_chave\)/);
  });

  it('o bucket é público pela URL, mas ninguém sem sessão lista, sobe, troca ou apaga', () => {
    const policies = [...sql.matchAll(/CREATE POLICY "empreendimento_midia_[a-z_]+" ON storage\.objects\s+FOR (\w+) TO ([a-z, ]+)/g)].map((m) => [m[1], m[2].trim()]);
    expect(policies).toEqual([['SELECT', 'authenticated'], ['INSERT', 'authenticated'], ['UPDATE', 'authenticated'], ['DELETE', 'authenticated']]);
    // Toda policy do bucket prende a primeira pasta do caminho à organização de quem pede (USING e WITH CHECK).
    expect(sql.match(/\(storage\.foldername\(name\)\)\[1\] IN \(SELECT o::text FROM public\.empr_user_org_ids\(\) o\)/g)).toHaveLength(5);
  });

  it('nas funções entra só `plantas` (e o empreendimento da planta, no corretor); nada de negociação, comprador ou corretor', () => {
    const novas = (nome: string) => {
      const antes = chavesDe(funcao(anterior, nome));
      const depois = chavesDe(funcao(sql, nome));
      // Nenhuma chave de antes saiu.
      for (const k of antes) expect(depois).toContain(k);
      return [...new Set(depois.filter((k) => !antes.includes(k)))].sort();
    };
    // `commercial_building_id` da planta já era chave da torre: não conta como nova.
    expect(novas('fn_broker_portal_get_espelho')).toEqual(['empreendimento_id', 'imagem_url', 'plantas', 'tipologia', 'tipologia_chave']);
    expect(novas('fn_espelho_de_vendas_das_obras')).toEqual(['imagem_url', 'plantas', 'tipologia', 'tipologia_chave']);
    expect(chavesDe(sql).filter((k) => /client|buyer|comprador|cliente|deal|negoc|broker|corretor|document|cpf|cnpj|email|phone|contract/.test(k))).toEqual([]);
  });

  it('as plantas do corretor são só as dos prédios que ele vê (o mesmo `visiveis` das unidades)', () => {
    const doCorretor = funcao(sql, 'fn_broker_portal_get_espelho');
    const trecho = doCorretor.slice(doCorretor.indexOf("'plantas'"), doCorretor.indexOf("'torres'"));
    expect(trecho).toMatch(/e2\.commercial_building_id IN \(\s*SELECT COALESCE\(p\.parent_id, p\.id\)\s+FROM public\.commercial_properties p\s+WHERE p\.id IN \(SELECT id FROM visiveis\)/);
  });

  it('a unidade do investidor segue com as mesmas 16 chaves, "vendida" com as etapas do front, e as internas sem GRANT', () => {
    const doInvestidor = sql.slice(sql.lastIndexOf("'units', COALESCE"), sql.indexOf('FROM unidades u WHERE u.tower_id = t.id'));
    expect([...doInvestidor.matchAll(/'([a-z_]+)'\s*,/g)].map((m) => m[1]).filter((k) => k !== 'units').sort()).toEqual([
      'bathrooms', 'bedrooms', 'floor', 'floor_tipo', 'id', 'is_vendavel', 'name', 'parking_spaces', 'position_type', 'price',
      'private_area', 'sort_order', 'status', 'sun_orientation', 'typology', 'vaga_na_planta',
    ]);
    const listas = [...sql.matchAll(/n\.status IN \(([^)]*)\)/g)].map((m) => m[1].split(',').map((x) => x.trim().replace(/'/g, '')));
    expect(listas.length).toBe(2);
    for (const l of listas) expect(l).toEqual(ETAPAS_VENDIDA);
    expect(sql).not.toMatch(/GRANT[^;]*fn_espelho_de_vendas_das_obras/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.fn_broker_portal_get_espelho\(TEXT\) TO anon, authenticated;/);
  });
});
