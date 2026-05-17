import { BudgetEntry, ProjectSettings } from "../types";

// Integração Gemini desabilitada temporariamente por decisão de arquitetura.
// Para reabilitar: remover este stub, restaurar a implementação e configurar
// GEMINI_API_KEY no ambiente. Toda entrada de usuário deve ser sanitizada antes
// de ser enviada ao modelo.

export const generateBudgetAnalysis = async (
  _budget: BudgetEntry[],
  _settings: ProjectSettings,
  _userPrompt: string
): Promise<string> => {
  return "Assistente de IA temporariamente desabilitado. Entre em contato com o suporte.";
};