/**
 * Harness da ALTURA do ribbon do editor de plantas (24/09/2026, P2.60).
 *
 * POR QUE ELE EXISTE. O usuário mandou o print: *"o menubar está com 4 linhas.
 * Ocupando muito da tela. Sugeria agrupamentos"*. O defeito é de LAYOUT — quantos
 * pixels a barra come — e jsdom não tem retângulo: `getBoundingClientRect`
 * devolve zero para tudo. Nenhum teste de componente pode enxergar isto.
 *
 * Roda em dois modos, como o harness das abas: `?antes=1` monta os MESMOS 20
 * comandos no arranjo antigo (quatro grupos abertos, duas fileiras); sem
 * parâmetro, o arranjo novo (um grupo "Projeto" com quatro menus). A medição só
 * vale se o modo antigo REPROVAR — senão ela não discrimina nada.
 *
 * ⚠️ Os comandos aqui são os de verdade da aba Arquitetura, com os mesmos
 * rótulos e as mesmas contagens do editor em 24/09/2026 — é o comprimento do
 * texto que decide onde a fileira quebra. Um harness com "Botão 1, Botão 2"
 * mediria outra coisa.
 */
// Sem o CSS as classes do Tailwind não existem e os dois modos dão o mesmo
// número — foi o que aconteceu no harness das abas na primeira execução.
import '../../../index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  BookMarked,
  BookOpen,
  Crop,
  Fence,
  Hammer,
  Hand,
  Hash,
  History,
  Layers,
  Minus,
  MousePointer2,
  RectangleHorizontal,
  RectangleVertical,
  Scissors,
  Sigma,
  SquareStack,
} from 'lucide-react';
import Ribbon, { BotaoDoRibbon, GrupoDoRibbon, MenuDoRibbon } from '../../../components/blueprint/Ribbon';

const antes = new URLSearchParams(location.search).has('antes');

const ABAS = [
  { id: 'arquitetura', rotulo: 'Arquitetura' },
  { id: 'terreno', rotulo: 'Terreno' },
  { id: 'instalacoes', rotulo: 'Instalações' },
  { id: 'inserir', rotulo: 'Inserir' },
  { id: 'analisar', rotulo: 'Analisar' },
  { id: 'colaborar', rotulo: 'Colaborar' },
  { id: 'vista', rotulo: 'Vista' },
] as const;

interface ItemDoGrupo {
  icone: React.ComponentType<{ className?: string }>;
  rotulo: string;
  contagem?: number;
}

/** Os comandos de cada grupo, com as contagens medidas na planta do usuário. */
const GRUPOS: { rotulo: string; icone: React.ComponentType<{ className?: string }>; contagem?: number; itens: ItemDoGrupo[] }[] = [
  {
    rotulo: 'Estrutural',
    icone: RectangleVertical,
    itens: [
      { icone: Hash, rotulo: 'Eixo' },
      { icone: RectangleVertical, rotulo: 'Pilares automáticos', contagem: 215 },
      { icone: RectangleHorizontal, rotulo: 'Vigas automáticas', contagem: 197 },
      { icone: Layers, rotulo: 'Lajes automáticas', contagem: 35 },
      { icone: SquareStack, rotulo: 'Fundações automáticas' },
    ],
  },
  {
    rotulo: 'Reforma',
    icone: Hammer,
    itens: [
      { icone: Hammer, rotulo: 'Existente' },
      { icone: Hammer, rotulo: 'A demolir' },
      { icone: Hammer, rotulo: 'Novo' },
      { icone: Hammer, rotulo: 'Antes / depois' },
      { icone: History, rotulo: 'Etapas' },
    ],
  },
  {
    rotulo: 'Acabamentos',
    icone: Layers,
    contagem: 90,
    itens: [
      { icone: Layers, rotulo: 'Piso e forro', contagem: 45 },
      { icone: BookMarked, rotulo: 'Esquadrias', contagem: 90 },
      { icone: Fence, rotulo: 'Guarda-corpos' },
      { icone: Minus, rotulo: 'Rodapés', contagem: 400 },
      { icone: BookOpen, rotulo: 'Materiais' },
      { icone: BookMarked, rotulo: 'Tipos', contagem: 45 },
      { icone: Sigma, rotulo: 'Parâmetros' },
    ],
  },
  {
    rotulo: 'Vistas',
    icone: Scissors,
    itens: [
      { icone: Scissors, rotulo: 'Corte' },
      { icone: Crop, rotulo: 'Vista dependente' },
    ],
  },
];

function Comandos({ itens }: { itens: ItemDoGrupo[] }) {
  return (
    <>
      {itens.map((i) => (
        <BotaoDoRibbon key={i.rotulo} icone={i.icone} rotulo={i.rotulo} contagem={i.contagem} onClick={() => {}} />
      ))}
    </>
  );
}

function Harness() {
  const [recolhido, setRecolhido] = React.useState(false);
  return (
    <Ribbon
      abas={ABAS}
      ativa="arquitetura"
      onEscolher={() => {}}
      ariaLabel="Ferramentas de desenho"
      recolhido={antes ? undefined : recolhido}
      onRecolher={antes ? undefined : setRecolhido}
      esquerda={
        <span className="inline-flex h-7 items-center rounded-md border border-slate-300 px-2.5 text-sm text-slate-600">
          Planta baixa
        </span>
      }
      acessoRapido={
        <div data-acesso-rapido className="flex flex-wrap items-center gap-1">
          {['Desfazer', 'Refazer', 'Recortar', 'Copiar', 'Colar', 'Duplicar', 'Excluir', 'Espelhar', 'Girar', 'Alinhar', 'Isolar', 'Medir'].map((r) => (
            <span
              key={r}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-[10px] text-slate-500"
            >
              {r.slice(0, 2)}
            </span>
          ))}
        </div>
      }
    >
      <GrupoDoRibbon rotulo="Construir">
        <BotaoDoRibbon icone={MousePointer2} rotulo="Selecionar" onClick={() => {}} />
        <BotaoDoRibbon icone={Hand} rotulo="Mover" onClick={() => {}} />
        <BotaoDoRibbon icone={Layers} rotulo="Componentes" onClick={() => {}} />
        <BotaoDoRibbon icone={Layers} rotulo="Mobiliário" onClick={() => {}} />
        <BotaoDoRibbon icone={Hash} rotulo="Juntar" onClick={() => {}} />
      </GrupoDoRibbon>
      {antes ? (
        GRUPOS.map((g) => (
          <GrupoDoRibbon key={g.rotulo} rotulo={g.rotulo}>
            <Comandos itens={g.itens} />
          </GrupoDoRibbon>
        ))
      ) : (
        <GrupoDoRibbon rotulo="Projeto">
          {GRUPOS.map((g) => (
            <MenuDoRibbon key={g.rotulo} rotulo={g.rotulo} icone={g.icone} contagem={g.contagem} ajuda={g.rotulo}>
              <Comandos itens={g.itens} />
            </MenuDoRibbon>
          ))}
        </GrupoDoRibbon>
      )}
    </Ribbon>
  );
}

createRoot(document.getElementById('raiz')!).render(<Harness />);
