import re

# Fix ElectricalEditorView.tsx CanvasState
file_path = 'components/electrical/ElectricalEditorView.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

old_state = """export interface CanvasState {
  walls: OpuraElectricalWall[];
  rooms: OpuraElectricalRoom[];
  points: OpuraElectricalPoint[];
  elements: any[];
  conduits: OpuraElectricalConduit[];
}"""

new_state = """export interface CanvasState {
  walls: OpuraElectricalWall[];
  rooms: OpuraElectricalRoom[];
  points: OpuraElectricalPoint[];
  elements?: any[];
  conduits?: OpuraElectricalConduit[];
}"""

content = content.replace(old_state, new_state)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

# Fix services/electricalProjectService.ts
file_path = 'services/electricalProjectService.ts'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("OpuraElectricalPoint, OpuraElectricalWall, OpuraElectricalElement } from '../types/electrical';", "OpuraElectricalPoint, OpuraElectricalWall, OpuraElectricalElement, OpuraElectricalConduit } from '../types/electrical';")

old_create = """  async createConduit(planId: string, sourceId: string, targetId: string, type: string = 'teto'): Promise<OpuraElectricalConduit> {
    const orgId = await getOrgId();
    if (!orgId) throw new Error("Organization ID missing");

    const { data, error } = await supabase
      .from('opura_electrical_conduits')
      .insert({
        organization_id: orgId,"""

new_create = """  async createConduit(organizationId: string, planId: string, sourceId: string, targetId: string, type: string = 'teto'): Promise<OpuraElectricalConduit> {
    const { data, error } = await supabase
      .from('opura_electrical_conduits')
      .insert({
        organization_id: organizationId,"""

content = content.replace(old_create, new_create)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Patch 4 executed")
