/**
 * HARNESS VISUAL do Espelho de Vendas 3D (F2, 09/11/2026): o desenho é WebGL e não sobe em jsdom. Isto monta o
 * `<Espelho3D>` com uma cena de mentira — uma torre com o contorno da Planta (em L) e outra esquemática — e o CSS do
 * app, para olhar e tocar. Plano: docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 *
 *   npx vite --port 3147 → http://localhost:3147/docs/spikes/espelho-vendas-3d/index.html
 *   ?torres=1 mostra só a torre esquemática; ?sem3d=1 força a tela sem WebGL;
 *   ?corretor=1 monta o Estoque do Portal do Corretor (seletor 2D | 3D + desenho pelo estoque, F3);
 *   ?investidor=1 monta a aba Espelho de Vendas do Portal do Investidor (F4), com o serviço trocado por dados de mentira;
 *   ?investidor=1&obra=<url> troca os dados de mentira por uma obra real gravada em JSON (nunca no git).
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import Espelho3D from '../../../components/espelho3d/Espelho3D';
import type { DadosDaUnidade } from '../../../components/espelho3d/FichaDaUnidade';
import { montarCenaDoEspelho, type TorreDoEspelho } from '../../../utils/espelhoDeVendas3d';
import { EstoqueEm3D, SeletorDaVisaoDoEstoque, type EstoqueEm3DState } from '../../../components/broker/EstoqueEm3D';
import { montarEspelhoDoEstoque, type ImovelDoEstoque } from '../../../utils/espelhoDoEstoque';
import PortalEspelho from '../../../components/investor/portal/PortalEspelho';
import { investorPortalTokenService } from '../../../services/investorPortalTokenService';
import type { ObraDoEspelho } from '../../../utils/espelhoDoInvestidor';

const q = new URLSearchParams(location.search);
if (q.get('sem3d')) HTMLCanvasElement.prototype.getContext = (() => null) as never;

const STATUS = ['DISPONIVEL', 'DISPONIVEL', 'VENDIDO', 'RESERVADO', 'VENDIDO', 'DISPONIVEL', 'PERMUTADO', 'VENDIDO'];
const dados = new Map<string, DadosDaUnidade>();

/** F5: uma planta baixa de mentira por tipologia (SVG embutido), para ver a ficha e a ampliação. */
const plantaDeExemplo = (quartos: number) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260"><rect width="400" height="260" fill="#fff"/><g fill="none" stroke="#111827" stroke-width="4"><rect x="20" y="20" width="360" height="220"/><path d="M20 140H220M220 20V240${quartos > 2 ? 'M300 20V140' : ''}M220 140H380"/></g><g font-family="sans-serif" font-size="14" fill="#374151"><text x="80" y="85">Sala</text><text x="70" y="195">Cozinha</text><text x="235" y="85">Quarto 1</text>${quartos > 2 ? '<text x="312" y="85">Qto 3</text>' : ''}<text x="265" y="195">Quarto 2</text></g></svg>`,
  )}`;

/** F6: uma vista de mentira (SVG embutido) para os andares altos; os baixos ficam sem, para ver o botão desligado. */
const VISTA_DE_EXEMPLO = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 340"><rect width="600" height="340" fill="#bfdbfe"/><circle cx="470" cy="80" r="34" fill="#fde68a"/><path d="M0 250L120 150L220 220L340 110L470 210L600 140V340H0Z" fill="#64748b"/><path d="M0 290L600 260V340H0Z" fill="#166534"/></svg>',
)}`;

/** F8: o decorado de mentira só da tipologia "3 quartos" (corte + 2 ambientes); a de 2 quartos mostra o botão desligado. */
const imagemDeExemplo = (fundo: string, texto: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400"><rect width="640" height="400" fill="${fundo}"/><rect x="60" y="60" width="520" height="280" fill="none" stroke="#78350f" stroke-width="6"/><text x="320" y="210" font-family="sans-serif" font-size="32" text-anchor="middle" fill="#78350f">${texto}</text></svg>`,
  )}`;
const DECORADO_3Q = {
  imagens: [
    { url: imagemDeExemplo('#fef3c7', 'Corte 3D mobiliado'), titulo: 'Corte 3D mobiliado', origem: 'ENVIADA' as const },
    { url: imagemDeExemplo('#fde68a', 'Sala'), titulo: 'Sala', origem: 'ENVIADA' as const },
    { url: imagemDeExemplo('#fcd34d', 'Suíte'), titulo: 'Suíte', origem: 'ENVIADA' as const },
  ],
};

function torre(id: string, nome: string, andares: number, porAndar: number, areas: number[], extra: Partial<TorreDoEspelho> = {}): TorreDoEspelho {
  const units = [];
  for (let n = 1; n <= andares; n++) {
    for (let k = 0; k < porAndar; k++) {
      const uid = `${id}-${n}-${k + 1}`;
      const area = areas[k % areas.length];
      units.push({ id: uid, name: `${n}0${k + 1}`, floor: n, floor_tipo: 'TIPO' as const, private_area: area, status: STATUS[(n * 3 + k * 5) % STATUS.length] as never, sort_order: k });
      dados.set(uid, { tipologia: area > 100 ? '3 quartos' : '2 quartos', plantaUrl: plantaDeExemplo(area > 100 ? 3 : 2), vista: n >= 4 ? { url: VISTA_DE_EXEMPLO, legenda: 'Vista para a serra', cobre: '4º ao 19º pavimento · qualquer face' } : null, decorado: area > 100 ? DECORADO_3Q : null, areaPrivativaM2: area, dormitorios: area > 100 ? 3 : 2, banheiros: 2, vagas: area > 100 ? 2 : 1, preco: Math.round(area * (9000 + n * 120)) });
    }
  }
  return { id, name: nome, sort_order: 0, pe_direito_padrao_m: 3, units: units as never, ...extra };
}

const EM_L = [{ x: 0, y: 0 }, { x: 26000, y: 0 }, { x: 26000, y: 12000 }, { x: 14000, y: 12000 }, { x: 14000, y: 22000 }, { x: 0, y: 22000 }];
const A = torre('A', 'Torre A', 18, 4, [127.4, 127.4, 81.2, 81.2], { contorno: { anel: EM_L, frenteParaFora: { x: 0, y: -1 }, rotacaoNorteDeg: 0 } });
const B = torre('B', 'Torre B', 12, 6, [64, 64, 72, 72, 58, 58], { sort_order: 1 });
// Uma garagem em cada torre: o andar 0 fica sem unidade (o térreo de lazer, volume neutro) e o -1 aparece abaixo do
// chão translúcido (desde 10/11/2026). A Torre B tem ainda um apartamento no -2, como os do Garden Cambuhy em desnível.
const comTerreo = (t: TorreDoEspelho): TorreDoEspelho => ({
  ...t,
  units: [
    ...(t.units ?? []),
    { id: `${t.id}-g`, name: 'Garagem', floor: -1, floor_tipo: 'GARAGEM' as never, status: 'DISPONIVEL' as never },
    ...(t.id === 'B' ? [{ id: 'B-ss', name: 'SS201', floor: -2, floor_tipo: 'TIPO' as never, private_area: 64, status: 'RESERVADO' as never }] : []),
  ],
});

const torres = q.get('torres') === '1' ? [comTerreo(B)] : [comTerreo(A), comTerreo(B)];
const cena = montarCenaDoEspelho({ torres, distancias: [{ torre_a: 'A', torre_b: 'B', distancia_m: 18 }] });

function Harness() {
  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Espelho de Vendas 3D</h1>
        <p className="text-sm text-gray-500 mt-1.5">Harness: Torre A com contorno da Planta (em L), Torre B esquemática.</p>
      </div>
      <Espelho3D
        cena={cena}
        dados={dados}
        mostrarPreco
        acoesDaFicha={(p) => (
          <button type="button" className="h-9 px-4 rounded-[8px] bg-blue-600 text-white text-sm font-medium hover:bg-blue-700" onClick={() => console.log('proposta', p.unitId)}>
            Fazer proposta
          </button>
        )}
      />
      {cena.avisos.length > 0 && <pre className="text-xs text-gray-500 whitespace-pre-wrap">{cena.avisos.join('\n')}</pre>}
    </div>
  );
}

/** O Estoque do corretor (F3): dois blocos tirados do próprio estoque, com negócios, sem andar em 3 imóveis. */
function HarnessDoCorretor() {
  const imoveis = React.useMemo<ImovelDoEstoque[]>(() => {
    const out: ImovelDoEstoque[] = [];
    for (const [bloco, andares, porAndar] of [['A', 14, 4], ['B', 9, 3]] as const) {
      for (let n = 1; n <= andares; n++) {
        for (let k = 1; k <= porAndar; k++) {
          const id = `${bloco}${n}0${k}`;
          out.push({ id, name: `${n}0${k}`, number: '1201', type: 'APARTMENT', parent_id: 'predio', block: bloco, floor: n, private_area: k % 2 ? 92.4 : 68, typology: k % 2 ? '3 quartos' : '2 quartos', bedrooms: k % 2 ? 3 : 2, bathrooms: 2, parking_spaces: 1, price: 380_000 + n * 9_000 + k * 14_000, status: STATUS[(n * 3 + k * 5) % STATUS.length] === 'VENDIDO' ? 'SOLD' : STATUS[(n * 3 + k * 5) % STATUS.length] === 'PERMUTADO' ? 'EXCHANGED' : 'AVAILABLE' } as never);
        }
      }
    }
    for (const id of ['Box 1', 'Box 2', 'Loja']) out.push({ id, name: id, type: 'COMMERCIAL', parent_id: 'predio', status: 'AVAILABLE' } as never);
    return out;
  }, []);
  const negocios = [{ property_id: 'A302', status: 'PENDING' }, { property_id: 'A502', status: 'IN_NEGOTIATION' }, { property_id: 'B402', status: 'COMPLETED' }];
  const [visao, setVisao] = React.useState<'2D' | '3D'>('3D');
  const [cesta, setCesta] = React.useState<ImovelDoEstoque[]>([]);
  const [aviso, setAviso] = React.useState('');
  const h: EstoqueEm3DState = {
    visaoDoEstoque: visao,
    setVisaoDoEstoque: setVisao as never,
    motivoSem3d: null,
    estoqueEm3d: visao === '3D',
    espelhoDoEstoque: React.useMemo(() => montarEspelhoDoEstoque({ imoveis, negocios }), [imoveis]),
    visibleUnits: imoveis as never,
    cart: cesta as never,
    handleMakeProposal: (u) => setAviso(`proposta: ${u.id}`),
    handleReserve: async (u) => setAviso(`reserva: ${u.id}`),
    handleToggleCart: (u) => setCesta((c) => (c.some((x) => x.id === u.id) ? c.filter((x) => x.id !== u.id) : [...c, u as never])),
  };
  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Estoque do corretor em 3D</h1>
        <p className="text-sm text-gray-500 mt-1.5">Harness: dois blocos tirados do estoque; 3 imóveis sem andar. <span data-testid="aviso">{aviso}</span></p>
      </div>
      <SeletorDaVisaoDoEstoque h={h} />
      {h.estoqueEm3d ? <EstoqueEm3D h={h} /> : <p className="text-sm text-gray-600">(aqui entra o espelho 2D)</p>}
    </div>
  );
}

/** A aba do investidor (F4): duas obras; a função do banco é trocada por dados de mentira — nada vai à rede. */
function HarnessDoInvestidor() {
  const obra = (id: string, nome: string, andares: number, porAndar: number, vgv: number): ObraDoEspelho => ({
    project_id: id,
    project_name: nome,
    vgv_vendido: vgv,
    torres: [{
      id: `t-${id}`, name: 'Torre Única', sort_order: 0, floors_count: andares + 1, units_per_floor: porAndar, pe_direito_padrao_m: 3, elevacao_terreo_m: null,
      ordem_das_unidades_na_planta: 'POSICAO', blueprint_quadra_uid: null, distancias_entre_torres: null, floors: [],
      units: [
        { id: `${id}-salao`, name: 'Salão de festas', floor: 0, floor_tipo: 'TERREO', typology: null, private_area: 180, bedrooms: null, bathrooms: null, parking_spaces: null, position_type: null, sun_orientation: null, sort_order: 0, vaga_na_planta: null, is_vendavel: false, price: null, status: 'available' },
        ...Array.from({ length: andares * porAndar }, (_, i) => {
          const n = Math.floor(i / porAndar) + 1;
          const k = (i % porAndar) + 1;
          const st = ['sold', 'available', 'sold', 'reserved', 'available', 'sold', 'exchanged'][(n * 3 + k * 5) % 7];
          return { id: `${id}-${n}0${k}`, name: `${n}0${k}`, floor: n, floor_tipo: 'TIPO' as const, typology: k % 2 ? '3 quartos' : '2 quartos', private_area: k % 2 ? 92.4 : 68, bedrooms: k % 2 ? 3 : 2, bathrooms: 2, parking_spaces: 1, position_type: null, sun_orientation: null, sort_order: k, vaga_na_planta: null, is_vendavel: true, price: 420_000 + n * 8_000 + k * 12_000, status: st };
        }),
      ],
    }],
  });
  // `?obra=<url de um JSON>` reproduz uma obra real (a saída de `fn_espelho_de_vendas_das_obras`, salva à parte e fora
  // do git): foi assim que se viu o Garden Cambuhy com as torres separadas (10/11/2026).
  const real = q.get('obra');
  investorPortalTokenService.getEspelho = async () =>
    real ? [await (await fetch(real)).json()] : [obra('p1', 'Bella Vista', 9, 4, 6_840_000), obra('p2', 'Galeria Altavista', 3, 6, 1_250_000)];
  return (
    <div className="max-w-6xl mx-auto">
      <PortalEspelho portalToken="harness" />
    </div>
  );
}

createRoot(document.getElementById('raiz')!).render(q.get('corretor') ? <HarnessDoCorretor /> : q.get('investidor') ? <HarnessDoInvestidor /> : <Harness />);
