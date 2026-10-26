import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  canonicalSaveResultSchema,
  libraryArtifactDtoSchema,
  libraryArtifactVersionDtoSchema,
} from '@uni/contracts'
import { signUpUser, startTestApp, type TestApp } from './harness.js'

/**
 * B04 slice 3 — the server Library: artifacts with immutable versions
 * and the canonical-save transaction enforcing the m07 conflict rules
 * (no churn on unchanged content, in-place updates, explicit recreate
 * after deletion, one artifact per saved reply).
 */

describe('library — artifacts, versions, canonical save', () => {
  let testApp: TestApp
  let alice: { cookie: string }
  let bob: { cookie: string }

  beforeAll(async () => {
    testApp = await startTestApp()
    alice = await signUpUser(testApp.app, { name: 'Alice Library' })
    bob = await signUpUser(testApp.app, { name: 'Bob Library' })
  }, 180_000)

  afterAll(async () => {
    await testApp.stop()
  })

  async function createArtifact(cookie: string, markdown: string) {
    const response = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/library/artifacts',
      headers: { cookie },
      payload: {
        title: 'Quarterly report',
        kind: 'report',
        markdown,
        provenance: 'provider-generated',
        generatedBy: { providerLabel: 'Fake', modelLabel: 'model-alpha' },
      },
    })
    expect(response.statusCode).toBe(201)
    return libraryArtifactDtoSchema.parse(response.json())
  }

  it('creates an artifact with version 1 and lists it newest-first', async () => {
    const first = await createArtifact(alice.cookie, '# One')
    expect(first.versionCount).toBe(1)
    await createArtifact(alice.cookie, '# Two')
    const listed = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/library/artifacts',
      headers: { cookie: alice.cookie },
    })
    expect(listed.statusCode).toBe(200)
    const items = (listed.json() as { items: Array<{ markdown: string }> }).items
    expect(items.length).toBeGreaterThanOrEqual(2)
    expect(items[0]!.markdown).toBe('# Two')
  })

  it('bumps a version only when content actually changes', async () => {
    const artifact = await createArtifact(alice.cookie, '# Original')
    const unchanged = await testApp.app.inject({
      method: 'PATCH',
      url: `/api/v1/library/artifacts/${artifact.id}`,
      headers: { cookie: alice.cookie },
      payload: { title: artifact.title, markdown: artifact.markdown },
    })
    expect(unchanged.statusCode).toBe(200)
    expect(libraryArtifactDtoSchema.parse(unchanged.json()).versionCount).toBe(1)

    const changed = await testApp.app.inject({
      method: 'PATCH',
      url: `/api/v1/library/artifacts/${artifact.id}`,
      headers: { cookie: alice.cookie },
      payload: { markdown: '# Revised' },
    })
    expect(changed.statusCode).toBe(200)
    expect(libraryArtifactDtoSchema.parse(changed.json()).versionCount).toBe(2)

    const versions = await testApp.app.inject({
      method: 'GET',
      url: `/api/v1/library/artifacts/${artifact.id}/versions`,
      headers: { cookie: alice.cookie },
    })
    expect(versions.statusCode).toBe(200)
    const items = (versions.json() as { items: unknown[] }).items.map((v) =>
      libraryArtifactVersionDtoSchema.parse(v),
    )
    expect(items).toHaveLength(2)
    expect(items[0]!.version).toBe(2)
    expect(items[0]!.markdown).toBe('# Revised')
    expect(items[1]!.version).toBe(1)
    expect(items[1]!.markdown).toBe('# Original')
  })

  it('scopes artifacts to the owning workspace', async () => {
    const mine = await createArtifact(alice.cookie, '# Alice only')
    const foreign = await testApp.app.inject({
      method: 'GET',
      url: `/api/v1/library/artifacts/${mine.id}`,
      headers: { cookie: bob.cookie },
    })
    expect(foreign.statusCode).toBe(404)
    const foreignSave = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/library/canonical-save',
      headers: { cookie: bob.cookie },
      payload: {
        title: 'Hijack',
        kind: 'document',
        markdown: '# nope',
        provenance: 'demo-simulation',
        generatedBy: null,
        taskId: null,
        sourceConversationId: null,
        sourceMessageId: null,
        linkedArtifactId: mine.id,
      },
    })
    // A foreign linked id is simply unknown: a NEW artifact is created
    // in bob's workspace, never a cross-workspace write.
    expect(foreignSave.statusCode).toBe(200)
    const result = canonicalSaveResultSchema.parse(foreignSave.json())
    expect(result.created).toBe(true)
    expect(result.artifactId).not.toBe(mine.id)
  })

  describe('canonical save — the m07 conflict rules', () => {
    it('updates the linked artifact in place without version churn on unchanged content', async () => {
      const artifact = await createArtifact(alice.cookie, '# Report body')
      const save = await testApp.app.inject({
        method: 'POST',
        url: '/api/v1/library/canonical-save',
        headers: { cookie: alice.cookie },
        payload: {
          title: artifact.title,
          kind: 'report',
          markdown: '# Report body',
          provenance: 'provider-generated',
          generatedBy: { providerLabel: 'Fake', modelLabel: 'model-alpha' },
          taskId: null,
          sourceConversationId: null,
          sourceMessageId: null,
          linkedArtifactId: artifact.id,
        },
      })
      expect(save.statusCode).toBe(200)
      const result = canonicalSaveResultSchema.parse(save.json())
      expect(result.created).toBe(false)
      expect(result.recreated).toBe(false)
      expect(result.artifactId).toBe(artifact.id)
      expect(result.version).toBe(1)
    })

    it('explicitly recreates a deleted-but-still-linked artifact', async () => {
      const artifact = await createArtifact(alice.cookie, '# Will be deleted')
      const removed = await testApp.app.inject({
        method: 'DELETE',
        url: `/api/v1/library/artifacts/${artifact.id}`,
        headers: { cookie: alice.cookie },
      })
      expect(removed.statusCode).toBe(204)

      const save = await testApp.app.inject({
        method: 'POST',
        url: '/api/v1/library/canonical-save',
        headers: { cookie: alice.cookie },
        payload: {
          title: 'Will be deleted',
          kind: 'report',
          markdown: '# Will be deleted',
          provenance: 'provider-generated',
          generatedBy: null,
          taskId: null,
          sourceConversationId: null,
          sourceMessageId: null,
          linkedArtifactId: artifact.id,
        },
      })
      expect(save.statusCode).toBe(200)
      const result = canonicalSaveResultSchema.parse(save.json())
      expect(result.created).toBe(true)
      expect(result.recreated).toBe(true)
      expect(result.artifactId).not.toBe(artifact.id)
      expect(result.version).toBe(1)
    })

    it('never twins a saved reply: the same source message updates its artifact', async () => {
      const message = 'msg-1234'
      const first = await testApp.app.inject({
        method: 'POST',
        url: '/api/v1/library/canonical-save',
        headers: { cookie: alice.cookie },
        payload: {
          title: 'Saved reply',
          kind: 'document',
          markdown: '# First save',
          provenance: 'demo-simulation',
          generatedBy: null,
          taskId: null,
          sourceConversationId: 'conv-1',
          sourceMessageId: message,
          linkedArtifactId: null,
        },
      })
      expect(first.statusCode).toBe(200)
      const firstResult = canonicalSaveResultSchema.parse(first.json())
      expect(firstResult.created).toBe(true)

      // Same message saved again (caller lost track of the link): must
      // update the existing artifact, not create a twin.
      const second = await testApp.app.inject({
        method: 'POST',
        url: '/api/v1/library/canonical-save',
        headers: { cookie: alice.cookie },
        payload: {
          title: 'Saved reply',
          kind: 'document',
          markdown: '# First save (edited)',
          provenance: 'demo-simulation',
          generatedBy: null,
          taskId: null,
          sourceConversationId: 'conv-1',
          sourceMessageId: message,
          linkedArtifactId: null,
        },
      })
      expect(second.statusCode).toBe(200)
      const secondResult = canonicalSaveResultSchema.parse(second.json())
      expect(secondResult.created).toBe(false)
      expect(secondResult.artifactId).toBe(firstResult.artifactId)
      expect(secondResult.version).toBe(2)

      const all = await testApp.app.inject({
        method: 'GET',
        url: '/api/v1/library/artifacts',
        headers: { cookie: alice.cookie },
      })
      const withMessage = (
        (all.json() as { items: Array<{ sourceMessageId: string | null }> }).items
      ).filter((item) => item.sourceMessageId === message)
      expect(withMessage).toHaveLength(1)
    })
  })
})
