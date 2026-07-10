import { GoogleAuth } from 'google-auth-library'

export const FOLDER_MIME = 'application/vnd.google-apps.folder'
const DRIVE_API = 'https://www.googleapis.com/drive/v3'

export async function createDriveClient() {
  const auth = new GoogleAuth({
    credentials: JSON.parse(process.env.GDRIVE_SERVICE_ACCOUNT_KEY),
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  })
  return auth.getClient()
}

export async function listChildren(drive, folderId) {
  let files = []
  let pageToken
  do {
    const res = await drive.request({
      url: `${DRIVE_API}/files`,
      params: {
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType)',
        pageSize: 1000,
        pageToken,
      },
    })
    files = files.concat(res.data.files ?? [])
    pageToken = res.data.nextPageToken
  } while (pageToken)
  return files
}

// Flat list of every non-folder file under rootId, each tagged with the
// chain of ancestor folder names/ids from the root (mirrors what
// webkitRelativePath gives the browser importer, but built from Drive's
// actual parent/child structure instead of a path string).
export async function walkDrive(drive, rootId) {
  const results = []
  async function recurse(folderId, pathSegments, folderIdPath) {
    const children = await listChildren(drive, folderId)
    for (const child of children) {
      if (child.mimeType === FOLDER_MIME) {
        await recurse(child.id, [...pathSegments, child.name], [...folderIdPath, child.id])
      } else {
        results.push({ ...child, pathSegments, folderIdPath })
      }
    }
  }
  await recurse(rootId, [], [])
  return results
}

export async function downloadText(drive, fileId) {
  const res = await drive.request({
    url: `${DRIVE_API}/files/${fileId}`,
    params: { alt: 'media' },
    responseType: 'text',
  })
  return res.data
}

export async function downloadBuffer(drive, fileId) {
  const res = await drive.request({
    url: `${DRIVE_API}/files/${fileId}`,
    params: { alt: 'media' },
    responseType: 'arraybuffer',
  })
  return Buffer.from(res.data)
}
