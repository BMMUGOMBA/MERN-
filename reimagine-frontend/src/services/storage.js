import { v4 as uuid } from 'uuid'

const KEY = 'ab-projects'

export function listProjects() {
  const raw = localStorage.getItem(KEY)
  return raw ? JSON.parse(raw) : []
}

export function getProject(id) {
  return listProjects().find(p => p.id === id) || null
}

export function createProject(payload) {
  const now = new Date().toISOString()
  const project = {
    id: uuid(),
    status: 'Draft',         // Draft | Submitted | In Review | Approved
    createdAt: now,
    updatedAt: now,
    ...payload
  }
  const list = listProjects()
  list.unshift(project)
  localStorage.setItem(KEY, JSON.stringify(list))
  return project
}

export function updateProject(id, patch) {
  const list = listProjects().map(p =>
    p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p
  )
  localStorage.setItem(KEY, JSON.stringify(list))
  return list.find(p => p.id === id)
}

export function removeProject(id) {
  const list = listProjects().filter(p => p.id !== id)
  localStorage.setItem(KEY, JSON.stringify(list))
}
