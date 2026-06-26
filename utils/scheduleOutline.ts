import { OutlineNode } from '../types/schedule';
import { BudgetEntry } from '../types/budget';

/**
 * Pure tree helpers for the schedule outline (WBS). All mutating helpers are
 * immutable: they return new arrays/nodes so they fit `setSchedule(prev => ...)`.
 *
 * The outline is the source of truth for structure and order once present. See
 * buildHierarchy in FinancialSchedule for how it is rendered, and
 * seedOutlineFromBudget for how it is materialized from the legacy budget grouping.
 */

export type OutlineNodeType = OutlineNode['type'];

const STRUCTURAL: OutlineNodeType[] = ['group', 'phase', 'subphase'];

export const isStructural = (t: OutlineNodeType): boolean => STRUCTURAL.includes(t);
export const isLeaf = (t: OutlineNodeType): boolean => t === 'item' || t === 'activity';

/** Hierarchy rank — a node may only be nested under a strictly lower rank. */
const RANK: Record<OutlineNodeType, number> = { group: 0, phase: 1, subphase: 2, item: 3, activity: 3 };

export const genId = (): string =>
    (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);

/** Numeric WBS prefix of a name, e.g. "01.02. Etapa" → "01.02". Mirrors extractWbsPrefix. */
function wbsPrefix(name: string): string {
    const match = name?.match(/^([\d.]+)/);
    return match ? match[1].replace(/\.$/, '') : name || '';
}

// ──────────────────────────────────────────────────────────────
// Seed: materialize an explicit outline from the budget string grouping
// ──────────────────────────────────────────────────────────────

export function seedOutlineFromBudget(budget: BudgetEntry[]): OutlineNode[] {
    const groups: OutlineNode[] = [];
    const groupByName = new Map<string, OutlineNode>();
    const phaseByKey = new Map<string, OutlineNode>();
    const subByKey = new Map<string, OutlineNode>();

    budget.forEach(item => {
        const groupName = item.group || 'Sem Grupo';
        let group = groupByName.get(groupName);
        if (!group) {
            group = { id: genId(), type: 'group', name: groupName, children: [] };
            groupByName.set(groupName, group);
            groups.push(group);
        }

        const phaseName = item.phase || 'Sem Etapa';
        const phaseKey = `${groupName}|||${phaseName}`;
        let phase = phaseByKey.get(phaseKey);
        if (!phase) {
            phase = { id: genId(), type: 'phase', name: phaseName, children: [] };
            phaseByKey.set(phaseKey, phase);
            group.children!.push(phase);
        }

        let parent = phase;
        if (item.subPhase) {
            const subKey = `${phaseKey}|||${item.subPhase}`;
            let sub = subByKey.get(subKey);
            if (!sub) {
                sub = { id: genId(), type: 'subphase', name: item.subPhase, children: [] };
                subByKey.set(subKey, sub);
                phase.children!.push(sub);
            }
            parent = sub;
        }

        parent.children!.push({
            id: item.id,
            type: 'item',
            name: item.sinapiItem.description,
            budgetItemId: item.id,
            children: [],
        });
    });

    // Sort structural levels by WBS prefix (matches legacy sortByWbs); items keep budget order.
    const sortStructural = (nodes: OutlineNode[]) => {
        nodes.sort((a, b) => {
            if (isLeaf(a.type) && isLeaf(b.type)) return 0;
            if (isLeaf(a.type)) return 1;   // leaves after structural
            if (isLeaf(b.type)) return -1;
            return wbsPrefix(a.name).localeCompare(wbsPrefix(b.name), undefined, { numeric: true });
        });
        nodes.forEach(n => { if (n.children?.length) sortStructural(n.children); });
    };
    sortStructural(groups);

    return groups;
}

/** Set of budgetItemIds currently referenced anywhere in the outline. */
export function outlineBudgetItemIds(outline: OutlineNode[]): Set<string> {
    const ids = new Set<string>();
    const walk = (n: OutlineNode) => {
        if (n.budgetItemId) ids.add(n.budgetItemId);
        (n.children || []).forEach(walk);
    };
    outline.forEach(walk);
    return ids;
}

/**
 * Add outline item-nodes for budget entries missing from the outline, placing each
 * under its group › phase › subphase path (matched by name, created if absent).
 * Non-destructive: existing structure/order is preserved; orphan items are left as-is.
 */
export function reconcileOutlineWithBudget(outline: OutlineNode[], budget: BudgetEntry[]): { outline: OutlineNode[]; added: number } {
    const present = outlineBudgetItemIds(outline);
    const missing = budget.filter(b => !present.has(b.id));
    if (missing.length === 0) return { outline, added: 0 };

    const roots = JSON.parse(JSON.stringify(outline)) as OutlineNode[];
    const childByName = (siblings: OutlineNode[], type: OutlineNodeType, name: string) =>
        siblings.find(n => n.type === type && n.name === name);

    missing.forEach(item => {
        const groupName = item.group || 'Sem Grupo';
        let group = childByName(roots, 'group', groupName);
        if (!group) { group = { id: genId(), type: 'group', name: groupName, children: [] }; roots.push(group); }

        const phaseName = item.phase || 'Sem Etapa';
        group.children ||= [];
        let phase = childByName(group.children, 'phase', phaseName);
        if (!phase) { phase = { id: genId(), type: 'phase', name: phaseName, children: [] }; group.children.push(phase); }

        let parent = phase;
        if (item.subPhase) {
            phase.children ||= [];
            let sub = childByName(phase.children, 'subphase', item.subPhase);
            if (!sub) { sub = { id: genId(), type: 'subphase', name: item.subPhase, children: [] }; phase.children.push(sub); }
            parent = sub;
        }
        parent.children ||= [];
        parent.children.push({ id: item.id, type: 'item', name: item.sinapiItem.description, budgetItemId: item.id, children: [] });
    });

    return { outline: roots, added: missing.length };
}

// ──────────────────────────────────────────────────────────────
// Lookup
// ──────────────────────────────────────────────────────────────

export interface OutlineLocation {
    node: OutlineNode;
    parent: OutlineNode | null;   // null when node is at root
    siblings: OutlineNode[];
    index: number;
}

/** Depth-first search returning the node and its location, or null. */
export function findLocation(roots: OutlineNode[], id: string, parent: OutlineNode | null = null): OutlineLocation | null {
    const siblings = parent ? (parent.children || []) : roots;
    for (let i = 0; i < siblings.length; i++) {
        const node = siblings[i];
        if (node.id === id) return { node, parent, siblings, index: i };
        if (node.children?.length) {
            const found = findLocation(roots, id, node);
            if (found) return found;
        }
    }
    return null;
}

export function findNode(roots: OutlineNode[], id: string): OutlineNode | null {
    return findLocation(roots, id)?.node ?? null;
}

/** Ancestors from root down to (and including) the node, or [] if not found. */
export function getAncestors(roots: OutlineNode[], id: string): OutlineNode[] {
    const path: OutlineNode[] = [];
    const dfs = (nodes: OutlineNode[]): boolean => {
        for (const n of nodes) {
            path.push(n);
            if (n.id === id) return true;
            if (n.children?.length && dfs(n.children)) return true;
            path.pop();
        }
        return false;
    };
    return dfs(roots) ? path : [];
}

/** Resolve {group, phase, subPhase} labels for a structural parent (for budget consistency). */
export function parentWbsLabels(roots: OutlineNode[], parentId: string | null): { group?: string; phase?: string; subPhase?: string } {
    if (!parentId) return {};
    const chain = getAncestors(roots, parentId);
    const byType = (t: OutlineNodeType) => chain.find(n => n.type === t)?.name;
    return { group: byType('group'), phase: byType('phase'), subPhase: byType('subphase') };
}

const cloneRoots = (roots: OutlineNode[]): OutlineNode[] => JSON.parse(JSON.stringify(roots));

// ──────────────────────────────────────────────────────────────
// Mutations (immutable)
// ──────────────────────────────────────────────────────────────

/** Insert `node` under `parentId` (null = root) at `index` (default: end). */
export function insertNode(roots: OutlineNode[], parentId: string | null, node: OutlineNode, index?: number): OutlineNode[] {
    const next = cloneRoots(roots);
    const target = parentId ? findNode(next, parentId) : null;
    if (parentId && !target) return roots;
    const arr = target ? (target.children ||= []) : next;
    const at = index === undefined ? arr.length : Math.max(0, Math.min(index, arr.length));
    arr.splice(at, 0, node);
    return next;
}

/** Remove the node (and its subtree). Returns new roots and the removed subtree. */
export function removeNode(roots: OutlineNode[], id: string): { roots: OutlineNode[]; removed: OutlineNode | null } {
    const next = cloneRoots(roots);
    const loc = findLocation(next, id);
    if (!loc) return { roots, removed: null };
    const [removed] = loc.siblings.splice(loc.index, 1);
    return { roots: next, removed };
}

/** Update a node's name. */
export function renameNode(roots: OutlineNode[], id: string, name: string): OutlineNode[] {
    const next = cloneRoots(roots);
    const node = findNode(next, id);
    if (!node) return roots;
    node.name = name;
    return next;
}

/** Reorder a node within its siblings. dir: -1 up, +1 down. */
export function reorderSibling(roots: OutlineNode[], id: string, dir: -1 | 1): OutlineNode[] {
    const next = cloneRoots(roots);
    const loc = findLocation(next, id);
    if (!loc) return roots;
    const j = loc.index + dir;
    if (j < 0 || j >= loc.siblings.length) return roots;
    [loc.siblings[loc.index], loc.siblings[j]] = [loc.siblings[j], loc.siblings[loc.index]];
    return next;
}

/** Whether `id` can be nested under `newParentId` (null = root). */
export function canMove(roots: OutlineNode[], id: string, newParentId: string | null): boolean {
    const node = findNode(roots, id);
    if (!node) return false;
    if (id === newParentId) return false;

    // A node may only move under a strictly-lower-rank structural parent (or root).
    if (newParentId) {
        const parent = findNode(roots, newParentId);
        if (!parent) return false;
        if (!isStructural(parent.type)) return false;          // leaves can't be parents
        if (RANK[parent.type] >= RANK[node.type]) return false; // must nest deeper
        // No cycles: newParent must not be inside node's subtree
        if (findLocation(node.children || [], newParentId)) return false;
        if (newParentId === id) return false;
    } else {
        // Only groups may live at root
        if (node.type !== 'group') return false;
    }
    return true;
}

/** Move a node under `newParentId` (null = root) at `index`. Validates with canMove. */
export function moveNode(roots: OutlineNode[], id: string, newParentId: string | null, index?: number): OutlineNode[] {
    if (!canMove(roots, id, newParentId)) return roots;
    const { roots: without, removed } = removeNode(roots, id);
    if (!removed) return roots;
    return insertNode(without, newParentId, removed, index);
}

// ──────────────────────────────────────────────────────────────
// Duplicate
// ──────────────────────────────────────────────────────────────

export interface DuplicateResult {
    clone: OutlineNode;
    /** old id → new id for every node in the cloned subtree (items + activities + structural). */
    idMap: Record<string, string>;
}

/**
 * Deep-clone a subtree assigning fresh ids to every node. For cost-backed items the
 * new id is also the new BudgetEntry id (caller clones the BudgetEntry using idMap).
 * Returns the clone and the id mapping so the caller can clone schedules/budget and
 * remap predecessors within the duplicated subtree.
 */
export function duplicateSubtree(node: OutlineNode): DuplicateResult {
    const idMap: Record<string, string> = {};
    const recur = (n: OutlineNode): OutlineNode => {
        const newId = genId();
        idMap[n.id] = newId;
        const clone: OutlineNode = {
            ...n,
            id: newId,
            budgetItemId: n.budgetItemId ? newId : undefined,
            children: (n.children || []).map(recur),
        };
        return clone;
    };
    const clone = recur(node);
    return { clone, idMap };
}

/** Collect leaf ids in a subtree, split by kind. */
export function collectLeafIds(node: OutlineNode): { budgetItemIds: string[]; activityIds: string[]; allIds: string[] } {
    const budgetItemIds: string[] = [];
    const activityIds: string[] = [];
    const allIds: string[] = [];
    const walk = (n: OutlineNode) => {
        allIds.push(n.id);
        if (n.type === 'item' && n.budgetItemId) budgetItemIds.push(n.budgetItemId);
        if (n.type === 'activity') activityIds.push(n.id);
        (n.children || []).forEach(walk);
    };
    walk(node);
    return { budgetItemIds, activityIds, allIds };
}
