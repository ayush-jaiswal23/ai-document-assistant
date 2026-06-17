export function formatDate(value) {
  if (!value) return 'No recent activity'
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function getDocumentStatusTone(status) {
  if (status === 'indexed') return 'ready'
  if (status === 'failed') return 'failed'
  return 'pending'
}

export function getDocumentStatusLabel(status, hasDocument) {
  if (!hasDocument) return 'Upload required'
  if (status === 'indexed') return 'Indexed in Chroma'
  if (status === 'failed') return 'Indexing failed'
  return 'Indexing pending'
}
