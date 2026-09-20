/**
 * TEMPLATES DE VISTA (19/09/2026, roadmap E8.2) — a parte PURA: o que é uma
 * configuração de vista (as camadas de exibição da planta, o modo de cor dos
 * ambientes, as camadas e o estilo do 3D), a sanitização do JSONB que volta do
 * banco, o diff entre duas configurações e os templates de fábrica.
 *
 * É configuração de LEITURA: aplicar um template não toca no payload nem no
 * hash — só no que a tela mostra. Por isso mora fora do kernel.
 */
import { MODOS_DE_COR, type ModoDeCor } from './blueprintPaletas';
import { FILTROS_DE_FASE, ROTULO_DO_FILTRO_DE_FASE, type FiltroDeFase } from './blueprintFases';

export type Estilo3d = 'SOMBREADO' | 'LINHA_OCULTA' | 'TRANSPARENTE';
export const ESTILOS_3D: readonly Estilo3d[] = ['SOMBREADO', 'LINHA_OCULTA', 'TRANSPARENTE'];
export const ROTULO_DO_ESTILO_3D: Record<Estilo3d, string> = { SOMBREADO: 'Sombreado', LINHA_OCULTA: 'Linha oculta', TRANSPARENTE: 'Transparente' };
/** ESTILO DA PLANTA (E8.4): técnica (paredes vazadas, fundo neutro) ou humanizada (pisos por material, sombra, mobiliário colorido, vegetação). */
export type EstiloDaPlanta = 'TECNICA' | 'HUMANIZADA';
export const ESTILOS_DA_PLANTA: readonly EstiloDaPlanta[] = ['TECNICA', 'HUMANIZADA'];
export const ROTULO_DO_ESTILO_DA_PLANTA: Record<EstiloDaPlanta, string> = { TECNICA: 'Técnica', HUMANIZADA: 'Humanizada' };

export interface CamadasDaPlanta {
  medidas: boolean;
  camadas: boolean;
  cotas: boolean;
  cotaInterna: boolean;
  circuitos: boolean;
  rotulos: boolean;
  grade: boolean;
  preenchimento: boolean;
  preenchimentoTerreno: boolean;
  curvasDeNivel: boolean;
  envelope: boolean;
  cotaAltoContraste: boolean;
  mobiliario: boolean;
}
export interface Camadas3d {
  laje: boolean;
  arestas: boolean;
  armadura: boolean;
  terreno: boolean;
  envelope: boolean;
}
export interface ConfiguracaoDeVista {
  planta: CamadasDaPlanta;
  modoDeCor: ModoDeCor;
  vista3d: Camadas3d;
  estilo3d: Estilo3d;
  /** Ausente em templates gravados antes da E8.4 → técnica. */
  estiloPlanta: EstiloDaPlanta;
  /** FASES DE REFORMA (E10.2): tudo / antes / depois / só demolição. Ausente → tudo. */
  fase: FiltroDeFase;
}

export const CONFIGURACAO_PADRAO: ConfiguracaoDeVista = {
  planta: { medidas: false, camadas: false, cotas: false, cotaInterna: false, circuitos: false, rotulos: true, grade: true, preenchimento: true, preenchimentoTerreno: true, curvasDeNivel: true, envelope: true, cotaAltoContraste: false, mobiliario: false },
  modoDeCor: 'NENHUM',
  vista3d: { laje: false, arestas: true, armadura: false, terreno: false, envelope: true },
  estilo3d: 'SOMBREADO',
  estiloPlanta: 'TECNICA',
  fase: 'TUDO',
};

export interface TemplateDeVista {
  id: string;
  organizationId: string;
  nome: string;
  config: ConfiguracaoDeVista;
  active: boolean;
  /** Os de fábrica não vêm do banco e não se apagam. */
  deFabrica?: boolean;
}

const bool = (v: unknown, padrao: boolean) => (typeof v === 'boolean' ? v : padrao);

/** Sanitiza o JSONB: chave desconhecida cai, ausente ganha o padrão, valor fora da lista volta ao padrão. */
export function configuracaoDaColuna(raw: unknown): ConfiguracaoDeVista {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const p = (o.planta && typeof o.planta === 'object' ? o.planta : {}) as Record<string, unknown>;
  const v = (o.vista3d && typeof o.vista3d === 'object' ? o.vista3d : {}) as Record<string, unknown>;
  const planta = Object.fromEntries(
    (Object.keys(CONFIGURACAO_PADRAO.planta) as (keyof CamadasDaPlanta)[]).map((k) => [k, bool(p[k], CONFIGURACAO_PADRAO.planta[k])]),
  ) as unknown as CamadasDaPlanta;
  const vista3d = Object.fromEntries(
    (Object.keys(CONFIGURACAO_PADRAO.vista3d) as (keyof Camadas3d)[]).map((k) => [k, bool(v[k], CONFIGURACAO_PADRAO.vista3d[k])]),
  ) as unknown as Camadas3d;
  return {
    planta,
    modoDeCor: MODOS_DE_COR.includes(o.modoDeCor as ModoDeCor) ? (o.modoDeCor as ModoDeCor) : CONFIGURACAO_PADRAO.modoDeCor,
    vista3d,
    estilo3d: ESTILOS_3D.includes(o.estilo3d as Estilo3d) ? (o.estilo3d as Estilo3d) : CONFIGURACAO_PADRAO.estilo3d,
    estiloPlanta: ESTILOS_DA_PLANTA.includes(o.estiloPlanta as EstiloDaPlanta) ? (o.estiloPlanta as EstiloDaPlanta) : CONFIGURACAO_PADRAO.estiloPlanta,
    fase: FILTROS_DE_FASE.includes(o.fase as FiltroDeFase) ? (o.fase as FiltroDeFase) : CONFIGURACAO_PADRAO.fase,
  };
}

const ROTULO_PLANTA: Record<keyof CamadasDaPlanta, string> = {
  medidas: 'Medidas das paredes',
  camadas: 'Camadas das paredes',
  cotas: 'Cadeias de cota',
  cotaInterna: 'Cota interna',
  circuitos: 'Circuito nos pontos',
  rotulos: 'Nomes e etiquetas',
  grade: 'Grade',
  preenchimento: 'Preenchimento dos ambientes',
  preenchimentoTerreno: 'Preenchimento do terreno',
  curvasDeNivel: 'Curvas de nível',
  envelope: 'Envelope construtivo',
  cotaAltoContraste: 'Cota em alto contraste',
  mobiliario: 'Mobiliário mínimo',
};
const ROTULO_3D: Record<keyof Camadas3d, string> = { laje: 'Laje (3D)', arestas: 'Arestas (3D)', armadura: 'Armadura (3D)', terreno: 'Terreno (3D)', envelope: 'Envelope (3D)' };

/** O que muda de `de` para `para`, em frases curtas — a prévia antes de aplicar. */
export function diferencas(de: ConfiguracaoDeVista, para: ConfiguracaoDeVista): string[] {
  const out: string[] = [];
  for (const k of Object.keys(ROTULO_PLANTA) as (keyof CamadasDaPlanta)[]) {
    if (de.planta[k] !== para.planta[k]) out.push(`${ROTULO_PLANTA[k]}: ${para.planta[k] ? 'ligar' : 'desligar'}`);
  }
  if (de.modoDeCor !== para.modoDeCor) out.push(`Colorir por: ${para.modoDeCor}`);
  for (const k of Object.keys(ROTULO_3D) as (keyof Camadas3d)[]) {
    if (de.vista3d[k] !== para.vista3d[k]) out.push(`${ROTULO_3D[k]}: ${para.vista3d[k] ? 'ligar' : 'desligar'}`);
  }
  if (de.estilo3d !== para.estilo3d) out.push(`Estilo 3D: ${ROTULO_DO_ESTILO_3D[para.estilo3d]}`);
  if (de.estiloPlanta !== para.estiloPlanta) out.push(`Planta: ${ROTULO_DO_ESTILO_DA_PLANTA[para.estiloPlanta]}`);
  if (de.fase !== para.fase) out.push(`Fase: ${ROTULO_DO_FILTRO_DE_FASE[para.fase]}`);
  return out;
}

export function mesmaConfiguracao(a: ConfiguracaoDeVista, b: ConfiguracaoDeVista): boolean {
  return diferencas(a, b).length === 0;
}

/** Templates de fábrica — sempre disponíveis, antes dos da organização. */
export const TEMPLATES_DE_FABRICA: readonly TemplateDeVista[] = [
  { id: 'fab:apresentacao', organizationId: '', nome: 'Apresentação', deFabrica: true, active: true, config: { ...CONFIGURACAO_PADRAO, planta: { ...CONFIGURACAO_PADRAO.planta, medidas: false, cotas: false, camadas: false, circuitos: false, mobiliario: true, grade: false }, modoDeCor: 'TIPO_DE_AMBIENTE', vista3d: { ...CONFIGURACAO_PADRAO.vista3d, laje: true, arestas: false }, estilo3d: 'SOMBREADO' } },
  { id: 'fab:executivo', organizationId: '', nome: 'Executivo (cotas)', deFabrica: true, active: true, config: { ...CONFIGURACAO_PADRAO, planta: { ...CONFIGURACAO_PADRAO.planta, medidas: true, cotas: true, cotaInterna: true, camadas: true, preenchimento: false, grade: true }, modoDeCor: 'NENHUM', estilo3d: 'LINHA_OCULTA' } },
  { id: 'fab:instalacoes', organizationId: '', nome: 'Instalações', deFabrica: true, active: true, config: { ...CONFIGURACAO_PADRAO, planta: { ...CONFIGURACAO_PADRAO.planta, circuitos: true, preenchimento: false, rotulos: true }, modoDeCor: 'NENHUM', vista3d: { ...CONFIGURACAO_PADRAO.vista3d, laje: false }, estilo3d: 'TRANSPARENTE' } },
  { id: 'fab:comercial', organizationId: '', nome: 'Comercial (unidades)', deFabrica: true, active: true, config: { ...CONFIGURACAO_PADRAO, planta: { ...CONFIGURACAO_PADRAO.planta, grade: false, medidas: false, cotas: false }, modoDeCor: 'UNIDADE', vista3d: { ...CONFIGURACAO_PADRAO.vista3d, laje: true }, estilo3d: 'SOMBREADO' } },
  // E8.4: a planta de venda — sem grade, sem medida, sem cota, sem circuito; pisos por material e mobiliário.
  { id: 'fab:humanizada', organizationId: '', nome: 'Humanizada (venda)', deFabrica: true, active: true, config: { ...CONFIGURACAO_PADRAO, planta: { ...CONFIGURACAO_PADRAO.planta, grade: false, medidas: false, cotas: false, cotaInterna: false, camadas: false, circuitos: false, preenchimento: true, rotulos: true }, modoDeCor: 'NENHUM', vista3d: { ...CONFIGURACAO_PADRAO.vista3d, laje: true }, estilo3d: 'SOMBREADO', estiloPlanta: 'HUMANIZADA' } },
];

/** Erros antes de gravar; vazio = pode. */
export function validarTemplate(nome: string, existentes: readonly TemplateDeVista[], idAtual?: string): string[] {
  const n = nome.trim();
  if (!n) return ['nome é obrigatório'];
  if (n.length > 60) return ['nome maior que 60 caracteres'];
  if (existentes.some((t) => t.id !== idAtual && t.nome.trim().toLowerCase() === n.toLowerCase())) return [`já existe um template chamado "${n}"`];
  return [];
}
