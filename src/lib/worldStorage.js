import { supabase } from './supabaseClient'

const BUCKET = 'worlds'

export function getWorldHeroImageUrl(path) {
  if (!path) return null
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

export async function uploadWorldHeroImage(file) {
  const ext = file.name.split('.').pop()
  const path = `${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file)
  if (error) throw error
  return path
}

export async function deleteWorldHeroImage(path) {
  if (!path) return
  await supabase.storage.from(BUCKET).remove([path])
}
