import { BudgetEntry, ProjectSettings } from '../types';

const jsonClone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export const cloneBudgetForPersistence = (budget: BudgetEntry[] | null | undefined): BudgetEntry[] => {
  if (!Array.isArray(budget)) return [];
  return jsonClone(budget);
};

export const cloneSettingsForPersistence = (settings: ProjectSettings | null | undefined): ProjectSettings => {
  const cloned = jsonClone((settings || {}) as ProjectSettings);

  if (Array.isArray(cloned.versions)) {
    cloned.versions = cloned.versions.map(version => ({
      ...version,
      budget: cloneBudgetForPersistence(version.budget),
    }));
  }

  if (Array.isArray(cloned.basedOnBudgetSnapshot)) {
    cloned.basedOnBudgetSnapshot = cloneBudgetForPersistence(cloned.basedOnBudgetSnapshot);
  }

  return cloned;
};
