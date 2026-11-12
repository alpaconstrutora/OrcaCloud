/**
 * O motor da CASA AUTOMÁTICA. Desde a etapa D2 (11/11/2026) ele mora em `utils/casaAutomatica/` — um arquivo por
 * assunto —, e este arquivo só reexporta os nomes públicos de antes: nenhum import do app muda.
 */
export { HIPOTESES_DA_IMPLANTACAO_PADRAO, ROTULO_DA_ETAPA_DA_CASA, HIPOTESES_DA_ESTRUTURA_DA_CASA_PADRAO, HIPOTESES_DO_FORRO_DA_CASA_PADRAO, SUBIDA_DO_ALIMENTADOR_DA_CASA, HIPOTESES_DA_PRESSAO_DA_CASA_PADRAO, HIPOTESES_DA_ELETRICA_DA_CASA_PADRAO, HIPOTESES_DA_CASA_PADRAO } from './casaAutomatica/hipoteses';
export type { DivisaDeEncosto, HipotesesDaImplantacao, EtapaDaCasaId, HipotesesDaEstruturaDaCasa, EtapaDaCasa, EntradaDaCasa, HipotesesDaCasa, HipotesesDoForroDaCasa, HipotesesDaPressaoDaCasa, HipotesesDaEletricaDaCasa, PlanoDaCasa, ResumoDoSobrado, ResumoDaEletricaDaCasa, OpcoesDoPlanoDaCasa } from './casaAutomatica/hipoteses';
export { quadroDaFrente, paraLocal, paraMundo, ROTULO_DO_LIMITANTE, LIMITADA_POR, anelDoL, implantacaoDaCasa, resumoDaImplantacao } from './casaAutomatica/quadroEImplantacao';
export type { QuadroDaFrente, LimitanteDaImplantacao, ImplantacaoDaCasa, ResultadoDaImplantacao, ImplantacaoDoSobrado } from './casaAutomatica/quadroEImplantacao';
export { hipotesesDoForroDaCasa, forroEletricoDaCasa, forroDaAguaDaCasa, faixaDaAguaQuenteDaCasa, faixaDaAguaQuenteDaCasaNoModelo, esgotoDaCasaNoModelo, rebaixoDoForroMm, deficitDePressaoM, decidirPressao } from './casaAutomatica/forroEPressao';
export type { DecisaoDaPressao } from './casaAutomatica/forroEPressao';
export { motivoParaNaoGerar, comandosNoMundo, comandosLocaisNoMundo } from './casaAutomatica/escolhaEShaft';
export { terreaNaoComporta, problemasDoPlano, planejarCasa } from './casaAutomatica/orquestrador';
export { conferirPlanoDaCasa, planejarCasaDoPedido, assinaturaDoPedidoDaCasa } from './casaAutomatica/pedido';
export type { PedidoDaCasa } from './casaAutomatica/pedido';
