import React, { useMemo, useState } from 'react';
import { volumeDoAmbienteM3 } from '../../utils/blueprintNumeracao';
import { Calculator } from 'lucide-react';
import { ROTULO_DA_CONEXAO, nomeDoTipoEstrutural, type BlueprintModel, type DisciplinaDeRede, type TipoDePontoEletrico, type TipoDePontoHidraulico, type computeQuantities } from '../../utils/blueprintKernel';
import { ROTULO_DA_DISCIPLINA, ROTULO_DO_PONTO_ELETRICO } from '../../utils/blueprintRede';
import { ROTULO_DO_PONTO_HIDRAULICO } from '../../utils/blueprintHidraulica';
import type { ArmaduraQuantificada } from '../../utils/blueprintArmadura';
import {
  nomeDoPavimento,
  pavimentoDasEntidades,
  quantitativosPorPavimento,
  type QuantitativoDoPavimento,
} from '../../utils/blueprintQuantitativosPorPavimento';
import type { BlueprintQuantitySnapshot } from '../../types/blueprint';
import { StandardTable, type StandardTableColumn } from '../ui/StandardTable';
import { TabsBar, type TabsBarItem } from '../ui/TabsBar';
import { usePersistedState } from '../ui/TableUtils';
import { CartaoDaAvaliacao } from './TelaAvaliacao';
import type { Avaliacao } from '../../utils/blueprintAvaliacao';

/**
 * TELA de Quantitativos (17/09/2026: *"Analisar < quantitativos: criar nova
 * tela também em vez de drawer"*).
 *
 * Era um drawer (`PainelQuantitativos`) com `<dl>` e cartões; virou tela em
 * fluxo, como a Armadura e o Quadro de cargas: cabeçalho com voltar (no
 * editor), a faixa OFICIAL × AO VIVO, `TabsBar` §19.1 + `StandardTable` §5.2.
 * Abas: **Resumo** (os totais, uma grandeza por linha, com a decomposição por
 * material e o aço esquemático), **Por ambiente**, **Por peça estrutural**
 * (clique seleciona no desenho), **Por pavimento** (17/09/2026, *"incluir
 * pavimentos em quantitativos"*: os mesmos totais, um nível por linha, mais a
 * coluna Pavimento e um filtro nas abas de ambiente e de peça) e
 * **Sobreposições** (o volume que duas peças dividem — a linha "contado duas
 * vezes" é a razão da aba existir).
 *
 * O CONTEÚDO não mudou de sentido: cada regra de "só aparece se houver" do
 * painel antigo virou uma linha condicional aqui — quatro zeros empilhados
 * continuam sendo ruído numa planta sem estrutura.
 */

type Quant = ReturnType<typeof computeQuantities>;
type AbaDosQuantitativos = 'resumo' | 'ambientes' | 'estruturas' | 'pavimentos' | 'instalacoes' | 'sobreposicoes';

/** Uma linha de compra das instalações: tubo por DN, ponto por classificação, conexão por tipo × DN. */
interface LinhaDeInstalacao {
  chave: string;
  familia: 'Tubo' | 'Ponto' | 'Conexão';
  disciplina: DisciplinaDeRede;
  item: string;
  dnMm: number | null;
  quantidade: number;
  unidade: 'm' | 'un';
  detalhe: string;
}

interface LinhaDoResumo {
  chave: string;
  grupo: 'Arquitetura' | 'Estrutura' | 'Aço' | 'Material' | 'Acabamento' | 'Instalações';
  item: string;
  valor: number;
  unidade: string;
  detalhe: string;
  forte?: boolean;
}

const COLUNAS_RESUMO: StandardTableColumn[] = [
  { key: 'grupo', label: 'Grupo', width: 120 },
  { key: 'item', label: 'Item', width: 260 },
  { key: 'valor', label: 'Quantidade', width: 130, align: 'right' },
  { key: 'unidade', label: 'Unidade', width: 90 },
  { key: 'detalhe', label: 'Detalhe', width: 360, sortable: false },
];
const COLUNAS_AMBIENTE: StandardTableColumn[] = [
  { key: 'nome', label: 'Ambiente', width: 200 },
  { key: 'pavimento', label: 'Pavimento', width: 130 },
  { key: 'areaPisoM2', label: 'Piso (m²)', width: 110, align: 'right' },
  { key: 'areaEixoM2', label: 'Eixo (m²)', width: 110, align: 'right' },
  { key: 'areaEstruturaM2', label: 'Pilares (− m²)', width: 120, align: 'right' },
  { key: 'comprimentoRodapeM', label: 'Rodapé (m)', width: 110, align: 'right' },
  // ACABAMENTOS DECLARADOS (E7.2): o que a etiqueta do ambiente diz; "—" sem declaração.
  { key: 'piso', label: 'Piso', width: 170, sortable: false },
  { key: 'forro', label: 'Forro', width: 170, sortable: false },
  { key: 'rodapeDeclarado', label: 'Rodapé (material)', width: 150, sortable: false },
  // Pé-direito do PAVIMENTO e volume = piso × pé-direito (E0.2). O ambiente não
  // tem altura própria no modelo; a coluna diz de onde o número veio.
  { key: 'peDireitoM', label: 'Pé-direito (m)', width: 120, align: 'right' },
  { key: 'volumeM3', label: 'Volume (m³)', width: 110, align: 'right' },
  { key: 'formulaAreaPiso', label: 'Fórmula da área de piso', width: 380, sortable: false },
];
const COLUNAS_ESTRUTURA: StandardTableColumn[] = [
  { key: 'rotulo', label: 'Peça', width: 120 },
  { key: 'tipo', label: 'Tipo', width: 150 },
  { key: 'pavimento', label: 'Pavimento', width: 130 },
  { key: 'volumeConcretoM3', label: 'Concreto (m³)', width: 120, align: 'right' },
  { key: 'areaFormaM2', label: 'Fôrma (m²)', width: 110, align: 'right' },
  { key: 'kg', label: 'Aço (kg)', width: 100, align: 'right' },
  { key: 'aco', label: 'Esquema do aço', width: 260, sortable: false },
  { key: 'formula', label: 'Fórmula', width: 360, sortable: false },
];
const COLUNAS_PAVIMENTO: StandardTableColumn[] = [
  { key: 'nome', label: 'Pavimento', width: 160 },
  { key: 'elevationMm', label: 'Cota (m)', width: 90, align: 'right' },
  { key: 'ambientes', label: 'Ambientes', width: 100, align: 'right' },
  { key: 'areaConstruidaM2', label: 'Construída (m²)', width: 130, align: 'right' },
  { key: 'areaPisoM2', label: 'Piso (m²)', width: 110, align: 'right' },
  { key: 'areaParedeDuasFacesM2', label: 'Parede 2 faces (m²)', width: 150, align: 'right' },
  { key: 'volumeAlvenariaM3', label: 'Alvenaria (m³)', width: 130, align: 'right' },
  { key: 'comprimentoRodapeM', label: 'Rodapé (m)', width: 110, align: 'right' },
  { key: 'aberturas', label: 'Aberturas', width: 170, align: 'right' },
  { key: 'pecas', label: 'Peças estr.', width: 100, align: 'right' },
  { key: 'volumeConcretoM3', label: 'Concreto (m³)', width: 120, align: 'right' },
  { key: 'areaFormaM2', label: 'Fôrma (m²)', width: 110, align: 'right' },
  { key: 'acoKg', label: 'Aço (kg)', width: 100, align: 'right' },
];
const COLUNAS_INSTALACAO: StandardTableColumn[] = [
  { key: 'familia', label: 'Família', width: 100 },
  { key: 'disciplina', label: 'Disciplina', width: 120 },
  { key: 'item', label: 'Item', width: 240 },
  { key: 'dnMm', label: 'DN (mm)', width: 90, align: 'right' },
  { key: 'quantidade', label: 'Quantidade', width: 120, align: 'right' },
  { key: 'unidade', label: 'Unidade', width: 80 },
  { key: 'detalhe', label: 'Detalhe', width: 300, sortable: false },
];
const COLUNAS_SOBREPOSICAO: StandardTableColumn[] = [
  { key: 'volumeM3', label: 'Volume (m³)', width: 120, align: 'right' },
  { key: 'situacao', label: 'Situação', width: 220 },
  { key: 'explicacao', label: 'O que fazer', width: 520, sortable: false },
];

interface Props {
  /** O modelo — é nele que se lê o pavimento de cada entidade (o quantitativo não o carrega). */
  model: BlueprintModel;
  quant: Quant;
  /** O aço esquemático — mesma conta do orçamento; opcional para quem lê só o concreto. */
  armadura?: ArmaduraQuantificada;
  revisao: number;
  oficial: BlueprintQuantitySnapshot | null;
  gerando: boolean;
  onGerar: () => void;
  dirty: boolean;
  /** Selecionar a peça no desenho a partir da linha. */
  onSelecionarPeca?: (id: string) => void;
  /** SCORE (E5.2): o cartão no Resumo, com o atalho para a tela Avaliação. */
  avaliacao?: Avaliacao | null;
  onAbrirAvaliacao?: () => void;
}

type Fmt = (v: number) => string;
const num = (fmt: Fmt, v: number) => <span className="block text-right text-sm tabular-nums text-gray-700">{fmt(v)}</span>;

export default function TelaQuantitativos({ model, quant, armadura, revisao, oficial, gerando, onGerar, dirty, onSelecionarPeca, avaliacao, onAbrirAvaliacao }: Props) {
  const t = quant.totais;
  // PAVIMENTOS: o mapa entidade → nível, as linhas por pavimento e o filtro
  // das abas de ambiente/peça. O filtro só aparece com dois níveis ou mais —
  // num térreo solto ele seria uma pergunta sem alternativa.
  const mapaDePavimento = useMemo(() => pavimentoDasEntidades(model), [model]);
  const pavimentos = useMemo(() => quantitativosPorPavimento(model, quant, armadura), [model, quant, armadura]);
  const [pavimentoFiltro, setPavimentoFiltro] = useState('');
  const pavimentoDe = (id: string) => nomeDoPavimento(model, mapaDePavimento, id);
  const doPavimento = (id: string) => !pavimentoFiltro || mapaDePavimento.get(id) === pavimentoFiltro;
  const filtroDePavimento =
    model.levels.length > 1 ? (
      <select
        value={pavimentoFiltro}
        onChange={(e) => setPavimentoFiltro(e.target.value)}
        aria-label="Filtrar por pavimento"
        className="h-9 rounded-[6px] border border-gray-200 bg-white px-2 text-sm text-gray-700"
      >
        <option value="">Todos os pavimentos</option>
        {pavimentos.map((p) => (
          <option key={p.levelId} value={p.levelId}>
            {p.nome}
          </option>
        ))}
      </select>
    ) : undefined;
  const ambientesVisiveis = useMemo(
    () =>
      quant.ambientes
        .map((a, i) => {
          const nivel = model.levels.find((l) => l.id === mapaDePavimento.get(a.spaceId));
          const peDireitoM = nivel ? nivel.defaultHeightMm / 1000 : 0;
          return { ...a, indice: i + 1, peDireitoM, volumeM3: nivel ? volumeDoAmbienteM3(a.areaPisoM2, nivel.defaultHeightMm) : 0 };
        })
        .filter((a) => doPavimento(a.spaceId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quant.ambientes, pavimentoFiltro, mapaDePavimento, model.levels],
  );
  const estruturasVisiveis = useMemo(
    () => quant.estruturas.map((e, i) => ({ ...e, indice: i + 1 })).filter((e) => doPavimento(e.structuralId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quant.estruturas, pavimentoFiltro, mapaDePavimento],
  );
  // As casas vêm da POLÍTICA (é ela que define o arredondamento do quantitativo);
  // o separador é o do pt-BR — `formatarQuantidade` do kernel devolve `toFixed`
  // com ponto, que serve ao payload, não à tela.
  const casas = quant.policy.casas;
  const fmt = useMemo<Fmt>(
    () => (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }),
    [casas],
  );
  const [aba, setAba] = usePersistedState<AbaDosQuantitativos>('blueprint:quantitativos:aba', 'resumo');

  const resumo = useMemo<LinhaDoResumo[]>(() => {
    const linhas: LinhaDoResumo[] = [];
    const add = (l: Omit<LinhaDoResumo, 'chave'>) => linhas.push({ ...l, chave: `${l.grupo}:${l.item}` });
    if (quant.ambientes.length > 0) {
      add({ grupo: 'Arquitetura', item: 'Área de piso', valor: t.areaPisoM2, unidade: 'm²', detalhe: 'Pela face interna, já descontada a seção dos pilares', forte: true });
      add({ grupo: 'Arquitetura', item: `Piso + perda ${(quant.policy.perdaRevestimento * 100).toFixed(0)}%`, valor: t.areaPisoComPerdaM2, unidade: 'm²', detalhe: 'Área de revestimento a comprar' });
      add({ grupo: 'Arquitetura', item: 'Parede (2 faces)', valor: t.areaParedeDuasFacesM2, unidade: 'm²', detalhe: 'Área líquida de face, descontadas as aberturas', forte: true });
      add({ grupo: 'Arquitetura', item: 'Alvenaria', valor: t.volumeAlvenariaM3, unidade: 'm³', detalhe: 'Volume das paredes, descontadas aberturas e o que cede à estrutura' });
      // POR MATERIAL: a decomposição da alvenaria — só quando alguma parede tem composição.
      for (const m of t.porMaterial) {
        add({ grupo: 'Material', item: m.descricao || m.itemCode || 'Sem material', valor: m.volumeM3, unidade: 'm³', detalhe: `${fmt(m.areaFaceM2)} m² de face · função ${m.funcao}` });
      }
      add({ grupo: 'Arquitetura', item: 'Rodapé', valor: t.comprimentoRodapeM, unidade: 'm', detalhe: 'Perímetro interno menos os vãos de porta; zero onde o ambiente declarou "sem rodapé"' });
      // ACABAMENTOS DECLARADOS (E7.2): piso e forro por material (m² e m³), rodapé declarado por material (m).
      for (const m of t.porAcabamento ?? []) {
        const escopo = m.escopo === 'PISO' ? 'Piso' : m.escopo === 'FORRO' ? 'Forro' : 'Rodapé';
        add({
          grupo: 'Acabamento',
          item: `${escopo} · ${m.descricao || m.itemCode || 'sem material'}`,
          valor: m.escopo === 'RODAPE' ? m.comprimentoM : m.areaM2,
          unidade: m.escopo === 'RODAPE' ? 'm' : 'm²',
          detalhe: m.escopo === 'RODAPE' ? `${fmt(m.areaM2)} m² (comprimento × altura declarada) · ${m.ambientes} ambiente(s)` : `${fmt(m.volumeM3)} m³ · função ${m.funcao ?? '—'} · ${m.ambientes} ambiente(s)`,
        });
      }
      add({ grupo: 'Arquitetura', item: 'Aberturas', valor: t.areaAberturasM2, unidade: 'm²', detalhe: `${t.portas} porta(s), ${t.janelas} janela(s)` });
      // GUARDA-CORPOS (E7.3): metros por tipo e a lista por material/item.
      if ((t.comprimentoGuardaCorpoM ?? 0) > 0) add({ grupo: 'Arquitetura', item: 'Guarda-corpo', valor: t.comprimentoGuardaCorpoM, unidade: 'm', detalhe: 'Comprimento das polilinhas (NBR 14718: h ≥ 1,10 m)' });
      if ((t.comprimentoCorrimaoM ?? 0) > 0) add({ grupo: 'Arquitetura', item: 'Corrimão', valor: t.comprimentoCorrimaoM, unidade: 'm', detalhe: 'Comprimento das polilinhas (NBR 9050: 0,80–0,92 m)' });
      for (const g of t.porGuardaCorpo ?? []) {
        add({ grupo: 'Acabamento', item: `${g.tipo === 'CORRIMAO' ? 'Corrimão' : 'Guarda-corpo'} · ${g.material.toLowerCase()}${g.descricao || g.itemCode ? ` · ${g.descricao || g.itemCode}` : ''}`, valor: g.comprimentoM, unidade: 'm', detalhe: `${fmt(g.areaM2)} m² (comprimento × altura) · ${g.pecas} peça(s)${g.itemCode ? '' : ' · sem item de catálogo'}` });
      }
    }
    if (quant.estruturas.length > 0) {
      if (t.volumeConcretoPilarM3 > 0) add({ grupo: 'Estrutura', item: 'Concreto — pilares', valor: t.volumeConcretoPilarM3, unidade: 'm³', detalhe: `${fmt(t.areaFormaPilarM2)} m² de fôrma`, forte: true });
      if (t.volumeConcretoVigaM3 > 0) add({ grupo: 'Estrutura', item: 'Concreto — vigas', valor: t.volumeConcretoVigaM3, unidade: 'm³', detalhe: `${fmt(t.areaFormaVigaM2)} m² de fôrma`, forte: true });
      if (t.volumeConcretoLajeM3 > 0) add({ grupo: 'Estrutura', item: 'Concreto — lajes', valor: t.volumeConcretoLajeM3, unidade: 'm³', detalhe: `${fmt(t.areaLajeM2)} m² de laje`, forte: true });
      if (t.volumeConcretoFundacaoM3 > 0) add({ grupo: 'Estrutura', item: 'Concreto — fundação', valor: t.volumeConcretoFundacaoM3, unidade: 'm³', detalhe: `${fmt(t.areaFormaFundacaoM2)} m² de fôrma`, forte: true });
      if (t.estacas > 0) add({ grupo: 'Estrutura', item: 'Estacas', valor: t.comprimentoEstacasM, unidade: 'm', detalhe: `${t.estacas} un · comprimento perfurado` });
      if (t.pilares > 0 || t.blocosCoroamento > 0) add({ grupo: 'Estrutura', item: 'Peças', valor: t.pilares + t.blocosCoroamento, unidade: 'un', detalhe: `${t.pilares} pilar(es), ${t.blocosCoroamento} bloco(s)` });
      if (armadura && armadura.totais.totalKg > 0) {
        const a = armadura.totais;
        if (a.pilarKg > 0) add({ grupo: 'Aço', item: 'Aço — pilares', valor: a.pilarKg, unidade: 'kg', detalhe: `${fmt(a.taxaPilarKgM3)} kg/m³` });
        if (a.vigaKg > 0) add({ grupo: 'Aço', item: 'Aço — vigas', valor: a.vigaKg, unidade: 'kg', detalhe: `${fmt(a.taxaVigaKgM3)} kg/m³` });
        if (a.lajeKg > 0) add({ grupo: 'Aço', item: 'Aço — lajes', valor: a.lajeKg, unidade: 'kg', detalhe: `${fmt(a.taxaLajeKgM3)} kg/m³` });
        if (a.fundacaoKg > 0) add({ grupo: 'Aço', item: 'Aço — fundação', valor: a.fundacaoKg, unidade: 'kg', detalhe: `${fmt(a.taxaFundacaoKgM3)} kg/m³` });
        add({ grupo: 'Aço', item: 'Aço — total (esquemático)', valor: a.totalKg, unidade: 'kg', detalhe: `CA-50 ${fmt(a.ca50Kg)} kg · CA-60 ${fmt(a.ca60Kg)} kg`, forte: true });
      }
    }
    // INSTALAÇÕES (18/09/2026): tubo por disciplina e DN, pontos por classificação,
    // conexões deduzidas dos encontros — as linhas de compra da rede.
    for (const b of t.porBitola ?? []) {
      add({ grupo: 'Instalações', item: `${ROTULO_DA_DISCIPLINA[b.disciplina as DisciplinaDeRede] ?? b.disciplina} DN ${b.bitolaMm}`, valor: b.comprimentoM, unidade: 'm', detalhe: `${b.trechos} trecho(s), comprimento real` });
    }
    for (const p of t.porTerminal ?? []) {
      if (p.disciplina === 'ELETRICA') continue;
      const nome = p.classificacao ? (ROTULO_DO_PONTO_HIDRAULICO[p.classificacao as TipoDePontoHidraulico] ?? ROTULO_DO_PONTO_ELETRICO[p.classificacao as TipoDePontoEletrico] ?? p.tipo) : `${p.tipo} (sem tipo)`;
      add({ grupo: 'Instalações', item: `${nome} · ${ROTULO_DA_DISCIPLINA[p.disciplina as DisciplinaDeRede] ?? p.disciplina}`, valor: p.quantidade, unidade: 'un', detalhe: p.classificacao ? 'ponto classificado' : 'a classificar' });
    }
    for (const c of t.porConexao ?? []) {
      add({ grupo: 'Instalações', item: `${ROTULO_DA_CONEXAO[c.tipo]} DN ${c.bitolaMm}${c.paraMm != null ? `→${c.paraMm}` : ''} · ${ROTULO_DA_DISCIPLINA[c.disciplina as DisciplinaDeRede] ?? c.disciplina}`, valor: c.quantidade, unidade: 'un', detalhe: `${c.derivadas} deduzida(s) dos encontros${c.manuais ? ` + ${c.manuais} manual(is)` : ''}` });
    }
    return linhas;
  }, [quant, armadura, fmt, t]);

  const acoDe = (structuralId: string) => armadura?.pecas.find((p) => p.structuralId === structuralId);

  // INSTALAÇÕES (18/09/2026: *"incluir hidráulica no quantitativo"*): as linhas
  // de compra da rede — tubo por disciplina e DN, ponto por classificação,
  // conexão por tipo × DN —, com filtro por disciplina. É a mesma conta do
  // orçamento (`COMPRIMENTO_TUBO_*`, `CONTAGEM_PONTOS_HIDRAULICOS`, `CONTAGEM_CONEXOES`).
  const [disciplinaFiltro, setDisciplinaFiltro] = useState<'' | DisciplinaDeRede>('');
  const instalacoes = useMemo<LinhaDeInstalacao[]>(() => {
    const nomeDaDisciplina = (d: string) => ROTULO_DA_DISCIPLINA[d as DisciplinaDeRede] ?? d;
    const linhas: LinhaDeInstalacao[] = [];
    for (const b of t.porBitola ?? []) {
      linhas.push({ chave: `tubo:${b.disciplina}:${b.bitolaMm}:${b.itemCode ?? ''}`, familia: 'Tubo', disciplina: b.disciplina as DisciplinaDeRede, item: `${b.disciplina === 'ELETRICA' ? 'Eletroduto' : `Tubo ${nomeDaDisciplina(b.disciplina).toLowerCase()}`}${b.itemCode ? ` · ${b.itemCode}` : ''}`, dnMm: b.bitolaMm, quantidade: b.comprimentoM, unidade: 'm', detalhe: `${b.trechos} trecho(s) · comprimento real, com prumadas e caimento` });
    }
    for (const p of t.porTerminal ?? []) {
      const nome = p.classificacao
        ? (ROTULO_DO_PONTO_HIDRAULICO[p.classificacao as TipoDePontoHidraulico] ?? ROTULO_DO_PONTO_ELETRICO[p.classificacao as TipoDePontoEletrico] ?? p.classificacao)
        : `${p.tipo} (sem tipo)`;
      linhas.push({ chave: `ponto:${p.disciplina}:${p.classificacao ?? p.tipo}:${p.itemCode ?? ''}`, familia: 'Ponto', disciplina: p.disciplina as DisciplinaDeRede, item: `${nome}${p.itemCode ? ` · ${p.itemCode}` : ''}`, dnMm: null, quantidade: p.quantidade, unidade: 'un', detalhe: p.classificacao ? 'ponto classificado' : 'a classificar — escolha o tipo no painel do ponto' });
    }
    for (const c of t.porConexao ?? []) {
      linhas.push({ chave: `conexao:${c.disciplina}:${c.tipo}:${c.bitolaMm}:${c.paraMm ?? ''}`, familia: 'Conexão', disciplina: c.disciplina as DisciplinaDeRede, item: `${ROTULO_DA_CONEXAO[c.tipo]}${c.paraMm != null ? ` ${c.bitolaMm}→${c.paraMm}` : ''}`, dnMm: c.bitolaMm, quantidade: c.quantidade, unidade: 'un', detalhe: `${c.derivadas} deduzida(s) dos encontros${c.manuais ? ` + ${c.manuais} manual(is)` : ''}` });
    }
    return linhas;
  }, [t]);
  const instalacoesVisiveis = useMemo(
    () => (disciplinaFiltro ? instalacoes.filter((l) => l.disciplina === disciplinaFiltro) : instalacoes),
    [instalacoes, disciplinaFiltro],
  );
  const disciplinasPresentes = [...new Set(instalacoes.map((l) => l.disciplina))];
  const conflitantes = quant.sobreposicoes.filter((s) => s.quemCede === 'NINGUEM').length;

  const abas: TabsBarItem<AbaDosQuantitativos>[] = [
    { id: 'resumo', label: 'Resumo', badge: resumo.length },
    { id: 'ambientes', label: 'Por ambiente', badge: quant.ambientes.length },
    { id: 'estruturas', label: 'Por peça estrutural', badge: quant.estruturas.length },
    { id: 'pavimentos', label: 'Por pavimento', badge: pavimentos.length },
    { id: 'instalacoes', label: 'Instalações', badge: instalacoes.length },
    { id: 'sobreposicoes', label: 'Sobreposições', badge: conflitantes > 0 ? `${conflitantes} !` : quant.sobreposicoes.length },
  ];

  const vazio = quant.ambientes.length === 0 && quant.estruturas.length === 0;

  return (
    <div className="space-y-4">
      {/* OFICIAL × AO VIVO. A distinção é o ponto: o orçamento cita o oficial. */}
      <div className="rounded-[10px] border border-slate-200 bg-white p-4" data-testid="quantitativo-oficial">
        {revisao === 0 ? (
          <p className="text-sm text-slate-600">
            Do desenho atual (política {quant.policy.version}). Publique uma versão para gerar o quantitativo oficial — o orçamento não cita rascunho.
          </p>
        ) : oficial ? (
          <>
            <p className="text-sm text-emerald-700">
              <strong>Oficial da revisão {revisao}</strong> gerado em {new Date(oficial.computed_at).toLocaleDateString('pt-BR')} · política {quant.policy.version}.
            </p>
            {dirty && (
              <p className="mt-1 text-sm text-amber-700">
                O desenho mudou desde então. Publique de novo para gerar o oficial da próxima revisão.
              </p>
            )}
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              A revisão {revisao} ainda não tem quantitativo oficial · política {quant.policy.version}.
            </p>
            <button
              type="button"
              onClick={onGerar}
              disabled={gerando}
              className="inline-flex h-9 items-center gap-2 rounded-[6px] bg-blue-600 px-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Calculator className="h-4 w-4" />
              {gerando ? 'Gerando…' : 'Gerar oficial'}
            </button>
          </div>
        )}
      </div>

      <TabsBar tabs={abas} value={aba} onChange={setAba}>
        <span className="text-xs text-slate-500">
          {vazio
            ? 'Nenhum ambiente fechado — sem contorno fechado não há área para quantificar.'
            : `Piso ${fmt(t.areaPisoM2)} m² · alvenaria ${fmt(t.volumeAlvenariaM3)} m³ · concreto ${fmt(
                t.volumeConcretoPilarM3 + t.volumeConcretoVigaM3 + t.volumeConcretoLajeM3 + t.volumeConcretoFundacaoM3,
              )} m³${armadura && armadura.totais.totalKg > 0 ? ` · aço ${fmt(armadura.totais.totalKg)} kg` : ''}`}
        </span>
      </TabsBar>

      {aba === 'resumo' && avaliacao && onAbrirAvaliacao && <CartaoDaAvaliacao avaliacao={avaliacao} onAbrir={onAbrirAvaliacao} />}
      {aba === 'resumo' && (
        <StandardTable<LinhaDoResumo>
          columns={COLUNAS_RESUMO}
          storageKey="blueprint:quantitativosResumo"
          rows={resumo}
          rowKey={(l) => l.chave}
          renderCell={(key, l) => {
            switch (key) {
              case 'grupo':
                return <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{l.grupo}</span>;
              case 'item':
                return <span className={`text-sm ${l.forte ? 'font-semibold text-gray-900' : 'text-gray-700'} ${l.grupo === 'Material' ? 'pl-4' : ''}`}>{l.grupo === 'Material' ? '↳ ' : ''}{l.item}</span>;
              case 'valor':
                // Contagem em unidades é inteira — "1,00 un" seria precisão que não existe.
                return <span className={`block text-right text-sm tabular-nums ${l.forte ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{l.unidade === 'un' ? l.valor.toLocaleString('pt-BR') : fmt(l.valor)}</span>;
              case 'unidade':
                return <span className="text-sm text-gray-500">{l.unidade}</span>;
              case 'detalhe':
                return <span className="text-xs text-gray-500">{l.detalhe}</span>;
              default:
                return null;
            }
          }}
          sortValue={(key, l) => (key === 'valor' ? l.valor : (l as unknown as Record<string, string>)[key])}
          searchText={(l) => `${l.grupo} ${l.item} ${l.detalhe}`}
          searchPlaceholder="Buscar grandeza..."
          empty={{
            title: 'Nenhum ambiente fechado',
            subtitle: 'Sem contorno fechado não há área para quantificar. Feche o contorno das paredes ou lance a estrutura.',
          }}
        />
      )}

      {aba === 'ambientes' && (
        <StandardTable<Quant['ambientes'][number] & { indice: number; peDireitoM: number; volumeM3: number }>
          columns={COLUNAS_AMBIENTE}
          storageKey="blueprint:quantitativosAmbientes"
          rows={ambientesVisiveis}
          rowKey={(a) => a.spaceId}
          filters={filtroDePavimento}
          renderCell={(key, a) => {
            switch (key) {
              case 'nome':
                return <span className="text-sm font-medium text-gray-800">{a.nome ?? `Ambiente ${a.indice}`}</span>;
              case 'pavimento':
                return <span className="text-sm text-gray-600">{pavimentoDe(a.spaceId)}</span>;
              case 'areaPisoM2':
                return <span className="block text-right text-sm font-semibold tabular-nums text-gray-900">{fmt(a.areaPisoM2)}</span>;
              case 'areaEixoM2':
                return num(fmt, a.areaEixoM2);
              case 'areaEstruturaM2':
                // Só quando há desconto: "− 0,00" em todo ambiente sem pilar ensinaria a ignorar a coluna.
                return a.areaEstruturaM2 > 0 ? <span className="block text-right text-sm tabular-nums text-gray-700">− {fmt(a.areaEstruturaM2)}</span> : <span className="block text-right text-sm text-gray-300">—</span>;
              case 'comprimentoRodapeM':
                return num(fmt, a.comprimentoRodapeM);
              case 'piso': {
                const topo = a.piso?.camadas[a.piso.camadas.length - 1];
                return topo ? <span className="text-xs text-gray-700">{topo.descricao || topo.funcao.toLowerCase()} · {Math.round(a.piso!.camadas.reduce((s, c) => s + c.espessuraM, 0) * 1000)} mm</span> : <span className="text-xs text-gray-300">—</span>;
              }
              case 'forro': {
                const face = a.forro?.camadas[0];
                return face ? <span className="text-xs text-gray-700">{face.descricao || face.funcao.toLowerCase()}{a.forro!.rebaixoM ? ` · rebaixo ${fmt(a.forro!.rebaixoM)} m` : ' · colado'}</span> : <span className="text-xs text-gray-300">—</span>;
              }
              case 'rodapeDeclarado':
                return a.rodapeDeclarado === null ? <span className="text-xs text-gray-700">sem rodapé</span> : a.rodapeDeclarado ? <span className="text-xs text-gray-700">{a.rodapeDeclarado.descricao || a.rodapeDeclarado.itemCode || 'declarado'} · {Math.round(a.rodapeDeclarado.alturaMm / 10)} cm</span> : <span className="text-xs text-gray-300">política</span>;
              case 'peDireitoM':
                return num(fmt, a.peDireitoM);
              case 'volumeM3':
                return num(fmt, a.volumeM3);
              case 'formulaAreaPiso':
                return <span className="text-xs italic text-gray-400">{a.formulaAreaPiso}</span>;
              default:
                return null;
            }
          }}
          sortValue={(key, a) =>
            key === 'nome' ? a.nome ?? `Ambiente ${a.indice}` : key === 'pavimento' ? pavimentoDe(a.spaceId) : (a as unknown as Record<string, number>)[key]
          }
          searchText={(a) => `${a.nome ?? ''} ${pavimentoDe(a.spaceId)} ${a.formulaAreaPiso}`}
          searchPlaceholder="Buscar ambiente..."
          empty={{ title: 'Nenhum ambiente fechado', subtitle: 'Feche o contorno das paredes para o ambiente nascer.' }}
          renderTotals={(n) => (
            <tr className="bg-gray-50 text-sm font-semibold text-gray-700">
              <td colSpan={n} className="px-6 py-2.5">
                <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <span>Total {pavimentoFiltro ? 'do pavimento' : 'dos ambientes'}</span>
                  <span className="tabular-nums">
                    piso {fmt(ambientesVisiveis.reduce((s, a) => s + a.areaPisoM2, 0))} m² · rodapé{' '}
                    {fmt(ambientesVisiveis.reduce((s, a) => s + a.comprimentoRodapeM, 0))} m
                  </span>
                </span>
              </td>
            </tr>
          )}
        />
      )}

      {aba === 'estruturas' && (
        <StandardTable<Quant['estruturas'][number] & { indice: number }>
          columns={COLUNAS_ESTRUTURA}
          storageKey="blueprint:quantitativosEstruturas"
          rows={estruturasVisiveis}
          rowKey={(s) => s.structuralId}
          filters={filtroDePavimento}
          renderCell={(key, s) => {
            const aco = acoDe(s.structuralId);
            switch (key) {
              case 'rotulo':
                return <span className="text-sm font-medium text-gray-800">{s.rotulo || `${nomeDoTipoEstrutural(s.kind)} ${s.indice}`}</span>;
              case 'tipo':
                return <span className="text-sm text-gray-700">{nomeDoTipoEstrutural(s.kind)}</span>;
              case 'pavimento':
                return <span className="text-sm text-gray-600">{pavimentoDe(s.structuralId)}</span>;
              case 'volumeConcretoM3':
                return <span className="block text-right text-sm font-semibold tabular-nums text-gray-900">{fmt(s.volumeConcretoM3)}</span>;
              case 'areaFormaM2':
                return num(fmt, s.areaFormaM2);
              case 'kg':
                return aco ? num(fmt, aco.kg) : <span className="block text-right text-sm text-gray-300">—</span>;
              case 'aco':
                return <span className="text-xs text-gray-500">{aco?.descricao ?? ''}</span>;
              case 'formula':
                // A FÓRMULA junto do número (RF-121): um volume que não diz de onde veio não se confere.
                return <span className="text-xs italic text-gray-400">{s.formula}</span>;
              default:
                return null;
            }
          }}
          sortValue={(key, s) => {
            if (key === 'rotulo') return s.rotulo || s.structuralId;
            if (key === 'tipo') return nomeDoTipoEstrutural(s.kind);
            if (key === 'pavimento') return pavimentoDe(s.structuralId);
            if (key === 'kg') return acoDe(s.structuralId)?.kg ?? 0;
            return (s as unknown as Record<string, number>)[key];
          }}
          searchText={(s) => `${s.rotulo} ${nomeDoTipoEstrutural(s.kind)} ${pavimentoDe(s.structuralId)} ${s.formula}`}
          searchPlaceholder="Buscar peça..."
          onRowClick={onSelecionarPeca ? (s) => onSelecionarPeca(s.structuralId) : undefined}
          empty={{ title: 'Nenhuma peça estrutural na planta', subtitle: 'Lance pilares, vigas, lajes ou fundações (Arquitetura › Estrutural).' }}
          renderTotals={(n) => (
            <tr className="bg-gray-50 text-sm font-semibold text-gray-700">
              <td colSpan={n} className="px-6 py-2.5">
                <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <span>Total {pavimentoFiltro ? 'do pavimento' : 'da estrutura'}</span>
                  <span className="tabular-nums">
                    {fmt(estruturasVisiveis.reduce((a, s) => a + s.volumeConcretoM3, 0))} m³ · {fmt(estruturasVisiveis.reduce((a, s) => a + s.areaFormaM2, 0))} m² fôrma
                    {armadura ? ` · ${fmt(estruturasVisiveis.reduce((a, s) => a + (acoDe(s.structuralId)?.kg ?? 0), 0))} kg` : ''}
                  </span>
                </span>
              </td>
            </tr>
          )}
        />
      )}

      {aba === 'pavimentos' && (
        <StandardTable<QuantitativoDoPavimento>
          columns={COLUNAS_PAVIMENTO}
          storageKey="blueprint:quantitativosPavimentos"
          rows={pavimentos}
          rowKey={(p) => p.levelId}
          renderCell={(key, p) => {
            switch (key) {
              case 'nome':
                return <span className="text-sm font-medium text-gray-800">{p.nome}</span>;
              case 'elevationMm':
                return <span className="block text-right text-sm tabular-nums text-gray-600">{(p.elevationMm / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
              case 'ambientes':
              case 'pecas':
                return <span className="block text-right text-sm tabular-nums text-gray-700">{p[key]}</span>;
              case 'areaPisoM2':
              case 'volumeConcretoM3':
                return <span className="block text-right text-sm font-semibold tabular-nums text-gray-900">{fmt(p[key])}</span>;
              case 'aberturas':
                return <span className="block text-right text-xs tabular-nums text-gray-600">{p.portas} porta(s), {p.janelas} janela(s) · {fmt(p.areaAberturasM2)} m²</span>;
              case 'areaConstruidaM2':
              case 'areaParedeDuasFacesM2':
              case 'volumeAlvenariaM3':
              case 'comprimentoRodapeM':
              case 'areaFormaM2':
              case 'acoKg':
                return num(fmt, p[key]);
              default:
                return null;
            }
          }}
          sortValue={(key, p) => (key === 'nome' ? p.nome : key === 'aberturas' ? p.portas + p.janelas : (p as unknown as Record<string, number>)[key])}
          searchText={(p) => p.nome}
          searchPlaceholder="Buscar pavimento..."
          empty={{ title: 'Nenhum pavimento', subtitle: 'Adicione um pavimento no painel Pavimentos.' }}
          renderTotals={(n) => (
            <tr className="bg-gray-50 text-sm font-semibold text-gray-700">
              <td colSpan={n} className="px-6 py-2.5">
                <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <span>Total dos pavimentos</span>
                  <span className="tabular-nums">
                    construída {fmt(t.areaConstruidaM2)} m² · piso {fmt(t.areaPisoM2)} m² · alvenaria {fmt(t.volumeAlvenariaM3)} m³ · concreto{' '}
                    {fmt(pavimentos.reduce((s, p) => s + p.volumeConcretoM3, 0))} m³
                    {armadura ? ` · aço ${fmt(pavimentos.reduce((s, p) => s + p.acoKg, 0))} kg` : ''}
                  </span>
                </span>
              </td>
            </tr>
          )}
        />
      )}

      {aba === 'instalacoes' && (
        <StandardTable<LinhaDeInstalacao>
          columns={COLUNAS_INSTALACAO}
          storageKey="blueprint:quantitativosInstalacoes"
          rows={instalacoesVisiveis}
          rowKey={(l) => l.chave}
          renderCell={(key, l) => {
            switch (key) {
              case 'familia':
                return <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{l.familia}</span>;
              case 'disciplina':
                return <span className="text-sm text-gray-700">{ROTULO_DA_DISCIPLINA[l.disciplina] ?? l.disciplina}</span>;
              case 'item':
                return <span className="text-sm font-medium text-gray-800">{l.item}</span>;
              case 'dnMm':
                return <span className="block text-right text-sm tabular-nums text-gray-700">{l.dnMm ?? '—'}</span>;
              case 'quantidade':
                return <span className="block text-right text-sm font-semibold tabular-nums text-gray-900">{l.unidade === 'un' ? l.quantidade.toLocaleString('pt-BR') : fmt(l.quantidade)}</span>;
              case 'unidade':
                return <span className="text-sm text-gray-500">{l.unidade}</span>;
              case 'detalhe':
                return <span className="text-xs text-gray-500">{l.detalhe}</span>;
              default:
                return null;
            }
          }}
          sortValue={(key, l) => (key === 'quantidade' || key === 'dnMm' ? (l as unknown as Record<string, number>)[key] ?? 0 : key === 'disciplina' ? ROTULO_DA_DISCIPLINA[l.disciplina] : (l as unknown as Record<string, string>)[key])}
          searchText={(l) => `${l.familia} ${ROTULO_DA_DISCIPLINA[l.disciplina]} ${l.item} ${l.dnMm ?? ''} ${l.detalhe}`}
          searchPlaceholder="Buscar tubo, ponto ou conexão..."
          filters={
            disciplinasPresentes.length > 1 ? (
              <select
                value={disciplinaFiltro}
                onChange={(e) => setDisciplinaFiltro(e.target.value as '' | DisciplinaDeRede)}
                aria-label="Filtrar por disciplina"
                className="h-9 rounded-[6px] border border-gray-200 bg-white px-2 text-sm text-gray-700"
              >
                <option value="">Todas as disciplinas</option>
                {disciplinasPresentes.map((d) => (
                  <option key={d} value={d}>
                    {ROTULO_DA_DISCIPLINA[d]}
                  </option>
                ))}
              </select>
            ) : undefined
          }
          empty={{ title: 'Nenhuma instalação na planta', subtitle: 'Lance pontos e trechos em Elétrica ou Hidráulica — ou use os lançamentos automáticos.' }}
          renderTotals={(n) => (
            <tr className="bg-gray-50 text-sm font-semibold text-gray-700">
              <td colSpan={n} className="px-6 py-2.5">
                <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <span>Total {disciplinaFiltro ? `— ${ROTULO_DA_DISCIPLINA[disciplinaFiltro]}` : 'das instalações'}</span>
                  <span className="tabular-nums">
                    tubo {fmt(instalacoesVisiveis.filter((l) => l.familia === 'Tubo').reduce((s, l) => s + l.quantidade, 0))} m ·{' '}
                    {instalacoesVisiveis.filter((l) => l.familia === 'Ponto').reduce((s, l) => s + l.quantidade, 0)} ponto(s) ·{' '}
                    {instalacoesVisiveis.filter((l) => l.familia === 'Conexão').reduce((s, l) => s + l.quantidade, 0)} conexão(ões)
                  </span>
                </span>
              </td>
            </tr>
          )}
        />
      )}

      {aba === 'sobreposicoes' && (
        <StandardTable<Quant['sobreposicoes'][number]>
          columns={COLUNAS_SOBREPOSICAO}
          storageKey="blueprint:quantitativosSobreposicoes"
          rows={quant.sobreposicoes}
          rowKey={(s) => `${s.aId}-${s.bId}`}
          rowClassName={(s) => (s.quemCede === 'NINGUEM' ? 'bg-amber-50' : '')}
          renderCell={(key, s) => {
            switch (key) {
              case 'volumeM3':
                return <span className="block text-right text-sm font-semibold tabular-nums text-gray-900">{fmt(s.volumeM3)}</span>;
              case 'situacao':
                return s.quemCede === 'NINGUEM' ? (
                  <span className="inline-flex rounded-[6px] bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Contado duas vezes</span>
                ) : (
                  <span className="text-sm text-gray-700">{s.quemCede === 'PAREDE' ? 'Descontado da alvenaria' : 'Descontado do concreto'}</span>
                );
              case 'explicacao':
                return (
                  <span className="text-xs text-gray-500">
                    {s.quemCede === 'NINGUEM'
                      ? 'Como concreto e como alvenaria. Selecione uma das duas peças e escolha quem cede.'
                      : 'Decisão registrada na peça que cede o volume.'}
                  </span>
                );
              default:
                return null;
            }
          }}
          sortValue={(key, s) => (key === 'volumeM3' ? s.volumeM3 : s.quemCede)}
          empty={{ title: 'Nenhuma sobreposição entre peças', subtitle: 'Quando uma estrutura atravessar uma parede, o volume dividido aparece aqui.' }}
        />
      )}

      <p className="text-[11px] leading-relaxed text-slate-400">
        Estudo preliminar assistido; requer validação de profissional habilitado. Política {quant.policy.version} · kernel {quant.kernelVersion}.
        {quant.ambientes[0] ? ` Área de piso = ${quant.ambientes[0].formulaAreaPiso}` : ''}
      </p>
    </div>
  );
}
