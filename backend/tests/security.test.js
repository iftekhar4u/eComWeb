import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { getConfig } from '../config/env.js'

const config = { NODE_ENV: 'test', PORT: 5000, CLIENT_URL: 'http://localhost:5173', TRUST_PROXY: 0, SESSION_SECRET: 'test-session-secret-test-session-secret' }

describe('security boundary', () => {
  it('issues CSRF tokens and denies cookie writes without one', async () => {
    const agent = request.agent(createApp({ config }))
    const tokenResponse = await agent.get('/api/auth/csrf-token')
    expect(tokenResponse.status).toBe(200)
    expect(tokenResponse.body.csrfToken).toHaveLength(64)

    const logoutResponse = await agent.post('/api/auth/logout')
    expect(logoutResponse.status).toBe(403)
  })

  it('denies unauthenticated protected resources', async () => {
    const response = await request(createApp({ config })).get('/api/v1/me')
    expect(response.status).toBe(401)
  })

  it('rejects unknown product query fields before database access', async () => {
    const response = await request(createApp({ config })).get('/api/products?\u0024where=true')
    expect(response.status).toBe(400)
  })

  it('rejects production startup without persistent-session configuration', () => {
    expect(() => getConfig({ NODE_ENV: 'production', CLIENT_URL: 'https://shop.example' })).toThrow(/required in production/)
  })

  it('keeps Google auth explicitly disabled when provider configuration is absent', async () => {
    const app = createApp({ config })
    expect((await request(app).get('/api/v1/auth/google/status')).body).toEqual({ enabled: false })
    const response = await request(app).get('/api/v1/auth/google')
    expect(response.status).toBe(503)
    expect(response.body.message).toMatch(/not configured/)
  })

  it('starts Google auth with a browser redirect and minimal OIDC scopes when enabled', async () => {
    const app = createApp({ config: { ...config, GOOGLE_AUTH_ENABLED: true, GOOGLE_CLIENT_ID: 'test-client-id', GOOGLE_CLIENT_SECRET: 'test-client-secret', GOOGLE_CALLBACK_URL: 'http://localhost:5000/api/v1/auth/google/callback' } })
    const response = await request.agent(app).get('/api/v1/auth/google')
    expect(response.status).toBe(302)
    expect(response.headers.location).toMatch(/accounts\.google\.com/)
    expect(response.headers.location).toMatch(/scope=openid%20email%20profile/)
    expect(response.headers.location).toMatch(/nonce=/)
  })
})
