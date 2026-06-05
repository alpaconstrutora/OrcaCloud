import { supabase } from '../lib/supabase'

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface TaskSpace {
  id: string
  org_id: string
  owner_user_id: string
  name: string
  color: string
  icon: string | null
  position: number
  created_at: string
  updated_at: string
}

export interface TaskSpaceMember {
  id: string
  space_id: string
  user_id: string
  role: 'owner' | 'member'
  created_at: string
  // joined from organization_members / profiles
  display_name?: string
  email?: string
}

export interface TaskFolder {
  id: string
  space_id: string
  name: string
  color: string | null
  position: number
  created_at: string
}

// Retornado junto com cada espaço para exibir contador no rail
export interface TaskSpaceWithMeta extends TaskSpace {
  folders: TaskFolder[]
  member_count: number
  open_task_count: number
}

// ── Spaces ───────────────────────────────────────────────────────────────────

async function listSpaces(orgId: string): Promise<TaskSpaceWithMeta[]> {
  const { data: spaces, error } = await supabase
    .from('task_spaces')
    .select('*')
    .eq('org_id', orgId)
    .order('position')
    .order('created_at')

  if (error) throw error
  if (!spaces?.length) return []

  const spaceIds = spaces.map(s => s.id)

  // Pastas, membros e contagem de tarefas abertas em paralelo
  const [foldersRes, membersRes, tasksRes] = await Promise.all([
    supabase
      .from('task_folders')
      .select('*')
      .in('space_id', spaceIds)
      .order('position'),
    supabase
      .from('task_space_members')
      .select('space_id, user_id')
      .in('space_id', spaceIds),
    supabase
      .from('tasks')
      .select('space_id')
      .in('space_id', spaceIds)
      .eq('status', 'open')
      .is('parent_task_id', null),
  ])

  const folders  = (foldersRes.data  ?? []) as TaskFolder[]
  const members  = (membersRes.data  ?? []) as { space_id: string; user_id: string }[]
  const tasks    = (tasksRes.data    ?? []) as { space_id: string }[]

  return spaces.map(s => ({
    ...(s as TaskSpace),
    folders:          folders.filter(f => f.space_id === s.id),
    member_count:     members.filter(m => m.space_id === s.id).length,
    open_task_count:  tasks.filter(t => t.space_id  === s.id).length,
  }))
}

async function createSpace(orgId: string, name: string, color = '#3b82f6', icon?: string): Promise<TaskSpace> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')

  const { data, error } = await supabase
    .from('task_spaces')
    .insert({ org_id: orgId, owner_user_id: user.id, name, color, icon: icon ?? null })
    .select()
    .single()

  if (error) throw error
  return data as TaskSpace
}

async function updateSpace(id: string, patch: Partial<Pick<TaskSpace, 'name' | 'color' | 'icon' | 'position'>>): Promise<void> {
  const { error } = await supabase.from('task_spaces').update(patch).eq('id', id)
  if (error) throw error
}

async function deleteSpace(id: string): Promise<void> {
  // Tarefas ficam com space_id = NULL (ON DELETE SET NULL na migration)
  const { error } = await supabase.from('task_spaces').delete().eq('id', id)
  if (error) throw error
}

// Reordena espaços: recebe array com os ids na nova ordem
async function reorderSpaces(orderedIds: string[]): Promise<void> {
  await Promise.all(
    orderedIds.map((id, i) =>
      supabase.from('task_spaces').update({ position: i }).eq('id', id)
    )
  )
}

// ── Membros ───────────────────────────────────────────────────────────────────

async function listMembers(spaceId: string): Promise<TaskSpaceMember[]> {
  const { data, error } = await supabase
    .from('task_space_members')
    .select('*')
    .eq('space_id', spaceId)
    .order('created_at')

  if (error) throw error
  return (data ?? []) as TaskSpaceMember[]
}

// Retorna usuários da org que AINDA NÃO são membros do espaço (para o seletor "Adicionar membro")
async function listEligibleUsers(
  orgId: string,
  spaceId: string
): Promise<{ user_id: string; name: string; email: string }[]> {
  const [membersRes, orgMembersRes] = await Promise.all([
    supabase
      .from('task_space_members')
      .select('user_id')
      .eq('space_id', spaceId),
    supabase
      .from('organization_members')
      .select('user_id, email, name')
      .eq('organization_id', orgId)
      .not('user_id', 'is', null),
  ])

  const alreadyIn = new Set((membersRes.data ?? []).map(m => m.user_id))
  return ((orgMembersRes.data ?? []) as { user_id: string; email: string; name?: string }[])
    .filter(u => u.user_id && !alreadyIn.has(u.user_id))
    .map(u => ({ user_id: u.user_id, name: u.name ?? u.email, email: u.email }))
}

async function addMember(spaceId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('task_space_members')
    .insert({ space_id: spaceId, user_id: userId, role: 'member' })
  if (error) throw error
}

async function removeMember(spaceId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('task_space_members')
    .delete()
    .eq('space_id', spaceId)
    .eq('user_id', userId)
  if (error) throw error
}

// ── Folders ───────────────────────────────────────────────────────────────────

async function createFolder(spaceId: string, name: string, color?: string): Promise<TaskFolder> {
  const { data, error } = await supabase
    .from('task_folders')
    .insert({ space_id: spaceId, name, color: color ?? null })
    .select()
    .single()
  if (error) throw error
  return data as TaskFolder
}

async function updateFolder(id: string, patch: Partial<Pick<TaskFolder, 'name' | 'color' | 'position'>>): Promise<void> {
  const { error } = await supabase.from('task_folders').update(patch).eq('id', id)
  if (error) throw error
}

async function deleteFolder(id: string): Promise<void> {
  // Tarefas ficam no espaço-pai (folder_id = NULL, space_id preservado — ON DELETE SET NULL)
  const { error } = await supabase.from('task_folders').delete().eq('id', id)
  if (error) throw error
}

async function reorderFolders(orderedIds: string[]): Promise<void> {
  await Promise.all(
    orderedIds.map((id, i) =>
      supabase.from('task_folders').update({ position: i }).eq('id', id)
    )
  )
}

// ── Export ────────────────────────────────────────────────────────────────────

export const taskSpaceService = {
  // spaces
  listSpaces,
  createSpace,
  updateSpace,
  deleteSpace,
  reorderSpaces,
  // members
  listMembers,
  listEligibleUsers,
  addMember,
  removeMember,
  // folders
  createFolder,
  updateFolder,
  deleteFolder,
  reorderFolders,
}
