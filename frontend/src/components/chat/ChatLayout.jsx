import { useEffect, useRef } from 'react'
import { formatDate, getDocumentStatusLabel, getDocumentStatusTone } from '../../utils/helpers'

export function ChatLayout({
  workspace,
  selectedGroupId,
  onGroupChange,
  selectedGroup,
  messages,
  groupDocuments,
  indexedDocumentCount,
  documentStatus,
  canUpload,
  uploadForm,
  updateUploadForm,
  onDocumentUpload,
  pending,
  canChat,
  draftMessage,
  setDraftMessage,
  onSendMessage,
}) {
  const activeDocument = groupDocuments[0] ?? null
  const streamRef = useRef(null)

  // Auto-scroll to bottom whenever messages or pending state changes
  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight
    }
  }, [messages, pending.chat])

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (canChat && !pending.chat && draftMessage.trim()) {
        onSendMessage(event)
      }
    }
  }

  return (
    <section className="chat-layout">
      <div className="sidebar-stack">
        <section className="panel group-panel">
          <div className="section-heading compact">
            <p>Groups</p>
            <h2>Your workspaces</h2>
          </div>
          <div className="group-list">
            {workspace.groups.map((group) => (
              <button
                key={group.id}
                className={selectedGroupId === group.id ? 'group-item active' : 'group-item'}
                onClick={() => onGroupChange(group.id)}
                type="button"
              >
                <div>
                  <strong>{group.name}</strong>
                  <span>{group.role}</span>
                </div>
                <small>
                  {group.hasDocument
                    ? `${group.documentCount ?? 1} document${(group.documentCount ?? 1) === 1 ? '' : 's'} - ${getDocumentStatusLabel(group.documentStatus, true)}`
                    : 'No document yet'}
                </small>
              </button>
            ))}
          </div>
        </section>

        {selectedGroup ? (
          <section className="panel doc-panel">
            <div className="section-heading compact">
              <p>Knowledge base</p>
              <h2>{selectedGroup.name}</h2>
            </div>
            <div className="doc-meta">
              <span className={`pill ${selectedGroup.role}`}>{selectedGroup.role}</span>
              <span
                className={`pill ${getDocumentStatusTone(
                  selectedGroup.hasDocument ? documentStatus : 'pending',
                )}`}
              >
                {getDocumentStatusLabel(documentStatus, selectedGroup.hasDocument)}
              </span>
              {selectedGroup.hasDocument ? (
                <span className="pill ready">
                  {indexedDocumentCount} indexed / {groupDocuments.length} total
                </span>
              ) : null}
            </div>

            {activeDocument ? (
              <div className="document-list">
                {groupDocuments.map((document) => (
                  <div className="doc-preview" key={document.id}>
                    <h3>{document.title}</h3>
                    <p>{document.summary}</p>
                    <dl>
                      <div>
                        <dt>Uploaded</dt>
                        <dd>{formatDate(document.updatedAt)}</dd>
                      </div>
                      <div>
                        <dt>Source</dt>
                        <dd>{document.fileName}</dd>
                      </div>
                      <div>
                        <dt>Uploaded by</dt>
                        <dd>{document.uploadedBy}</dd>
                      </div>
                    </dl>
                    {document.indexingError ? (
                      <div className="doc-alert failed">{document.indexingError}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-card">
                <h3>No documents indexed</h3>
                <p>
                  Members cannot chat in this group until an admin uploads source
                  documents.
                </p>
              </div>
            )}

            {canUpload ? (
              <form className="upload-form" onSubmit={onDocumentUpload}>
                <label className="field">
                  <span>Document title</span>
                  <input
                    onChange={(event) => updateUploadForm('title', event.target.value)}
                    placeholder="Quarterly support handbook"
                    value={uploadForm.title}
                  />
                </label>
                <label className="field">
                  <span>Description</span>
                  <textarea
                    onChange={(event) => updateUploadForm('description', event.target.value)}
                    placeholder="Explain what this document covers"
                    rows="3"
                    value={uploadForm.description}
                  />
                </label>
                <label className="field file-field">
                  <span>Upload documents</span>
                  <input
                    accept=".txt,.md,.pdf"
                    multiple
                    onChange={(event) =>
                      updateUploadForm('files', Array.from(event.target.files ?? []))
                    }
                    type="file"
                  />
                </label>
                {uploadForm.files.length ? (
                  <div className="selected-files">
                    {uploadForm.files.map((file) => (
                      <span key={`${file.name}-${file.size}`}>{file.name}</span>
                    ))}
                  </div>
                ) : null}
                <button className="primary-button" disabled={pending.upload} type="submit">
                  {pending.upload ? 'Uploading...' : 'Upload and index'}
                </button>
              </form>
            ) : (
              <div className="member-hint">Only admins can upload documents for this group.</div>
            )}
          </section>
        ) : null}
      </div>

      <section className="panel chat-panel">
        <div className="chat-header">
          <div>
            <p>Document chat</p>
            <h2>{selectedGroup ? `${selectedGroup.name} assistant` : 'Choose a group'}</h2>
          </div>
          {pending.workspace ? <span className="status-dot">Refreshing...</span> : null}
        </div>
        <div className="message-stream" ref={streamRef}>
          {messages.length ? (
            messages.map((message) => (
              <article key={message.id} className={`message-card ${message.role}`}>
                <header>
                  <strong>{message.role === 'assistant' ? 'Assistant' : 'You'}</strong>
                  <span>{formatDate(message.createdAt)}</span>
                </header>
                <p>{message.content}</p>
              </article>
            ))
          ) : (
            <div className="empty-card">
              <h3>No messages yet</h3>
              <p>Start the conversation once this group has an indexed document.</p>
            </div>
          )}
          {pending.chat && (
            <article className="message-card assistant pending-animation">
              <header>
                <strong>Assistant</strong>
                <span>Thinking...</span>
              </header>
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </article>
          )}
        </div>
        <form className="composer" onSubmit={onSendMessage}>
          <textarea
            disabled={!canChat || pending.chat}
            onChange={(event) => setDraftMessage(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              canChat
                ? 'Ask about the uploaded documents (Enter to send)'
                : activeDocument
                  ? 'Chat stays locked until indexing completes successfully'
                  : 'Chat stays locked until an admin uploads documents'
            }
            rows="4"
            value={draftMessage}
          />
          <div className="composer-footer">
            <span>
              {canChat
                ? 'Responses are limited to indexed group documents in Chroma.'
                : activeDocument
                  ? 'No uploaded group document is ready for retrieval yet.'
                  : 'Document access is required before members can chat.'}
            </span>
            <button
              className="primary-button"
              disabled={!canChat || pending.chat || !draftMessage.trim()}
              type="submit"
            >
              {pending.chat ? 'Sending...' : 'Send'}
            </button>
          </div>
        </form>
      </section>
    </section>
  )
}
