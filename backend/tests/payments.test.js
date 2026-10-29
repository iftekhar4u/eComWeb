import { PaymentSettings, PaymentProfile } from '../payments/models.js'
import { PaymentEvent } from '../models/domainModels.js'
import { beforeEach } from 'vitest'
import crypto from 'node:crypto'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.js'
import { getConfig } from '../config/env.js'
import { createRazorpay, validSignature } from '../services/razorpay.js'
import { addressInput, lineItemsInput, internalLink, imageUrl } from '../services/validation.js'

const config = { NODE_ENV: 'test', CLIENT_URL: 'http://localhost:5173', TRUST_PROXY: 0, SESSION_SECRET: 'unit-test-session-secret-at-least-32', RAZORPAY_KEY_ID: 'rzp_test_Example', RAZORPAY_KEY_SECRET: 'unit-test-payment-secret', RAZORPAY_WEBHOOK_SECRET: 'unit-test-webhook-secret' }
const sign = (body, secret) => crypto.createHmac('sha256', secret).update(body).digest('hex')
beforeEach(() => {
  const q = value => ({ lean:()=>Promise.resolve(value), select:()=>({lean:()=>Promise.resolve(value)}) })
  vi.spyOn(PaymentSettings,'findOne').mockImplementation(()=>q(null))
  vi.spyOn(PaymentProfile,'find').mockImplementation(()=>q([]))
  vi.spyOn(PaymentProfile,'updateOne').mockResolvedValue({modifiedCount:0})
  vi.spyOn(PaymentEvent,'create').mockResolvedValue({})
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('Razorpay trust boundary', () => {
  it('checks checkout HMAC against the saved provider order and rejects malformed values', () => {
    const gateway = createRazorpay(config)
    const signature = sign('order_123|pay_123', config.RAZORPAY_KEY_SECRET)
    expect(gateway.verifyCheckout('order_123', 'pay_123', signature)).toBe(true)
    expect(gateway.verifyCheckout('order_other', 'pay_123', signature)).toBe(false)
    for (const invalid of ['', null, {}, 'aa', 'x'.repeat(64)]) expect(validSignature('payload', invalid, config.RAZORPAY_KEY_SECRET)).toBe(false)
  })
  it('authenticates the original webhook bytes, not reserialized JSON or checkout credentials', async () => {
    const body = '{ "event": "unhandled.event" }'
    const app = createApp({ config })
    expect((await request(app).post('/api/payments/razorpay/webhook').set('Content-Type','application/json').set('x-razorpay-signature', sign(body, config.RAZORPAY_WEBHOOK_SECRET)).send(body)).status).toBe(200)
    expect((await request(app).post('/api/payments/razorpay/webhook').set('Content-Type','application/json').set('x-razorpay-signature', sign(body, config.RAZORPAY_KEY_SECRET)).send(body)).status).toBe(400)
    expect((await request(app).post('/api/payments/razorpay/webhook').set('Content-Type','application/json').set('x-razorpay-signature', sign(body, config.RAZORPAY_WEBHOOK_SECRET)).send(JSON.stringify(JSON.parse(body)))).status).toBe(400)
  })
  it('never simulates a successful payment when credentials are missing', async () => {
    const gateway = createRazorpay({})
    expect(gateway.enabled).toBe(false)
    await expect(gateway.createOrder({})).rejects.toMatchObject({ status: 503 })
    expect(gateway.verifyCheckout('order_1','pay_1','0'.repeat(64))).toBe(false)
    const response = await request(createApp({ config: { ...config, RAZORPAY_KEY_ID: undefined, RAZORPAY_KEY_SECRET: undefined } })).get('/api/orders/config')
    expect(response.body).toMatchObject({ razorpayEnabled: false, codEnabled: false })
    expect(JSON.stringify(response.body)).not.toContain('secret')
  })
  it('sends server-priced integer paise, receipt and local reference to the provider', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'order_123' }) }); vi.stubGlobal('fetch', fetcher)
    await createRazorpay(config).createOrder({ _id: 'local-id', totalPaise: 159900, orderNumber: 'AUR-123' })
    const [url, options] = fetcher.mock.calls[0]
    expect(url).toBe('https://api.razorpay.com/v1/orders')
    expect(JSON.parse(options.body)).toEqual({ amount:159900, currency:'INR', receipt:'AUR-123', partial_payment:false, notes:{localOrderId:'local-id'} })
    expect(options.headers.Authorization).toMatch(/^Basic /)
  })
  it('treats provider timeouts and provider errors as unresolved, without revealing credentials', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private upstream details')))
    await expect(createRazorpay(config).fetchPayment('pay_123')).rejects.toMatchObject({ status:503 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok:false, json:async()=>({ error:{description:'secret details'} }) }))
    await expect(createRazorpay(config).fetchPayment('pay_123')).rejects.toMatchObject({ status:502 })
  })
})

describe('checkout input and configuration', () => {
  it('rejects negative, fractional, duplicated or client-priced line items', () => {
    const valid = { variantId:'a'.repeat(24), quantity:1 }
    expect(lineItemsInput.safeParse([valid]).success).toBe(true)
    for (const input of [[{...valid,quantity:-1}],[{...valid,quantity:1.5}],[valid,valid],[{...valid,price:1}]]) expect(lineItemsInput.safeParse(input).success).toBe(false)
  })
  it('accepts Indian shipping details and rejects invalid PIN codes and phone numbers', () => {
    const address = {name:'Test Customer',line1:'10 Sample Road',city:'Delhi',state:'Delhi',postalCode:'110001',phone:'+919876543210'}
    expect(addressInput.parse(address).country).toBe('IN')
    expect(addressInput.safeParse({...address,postalCode:'000000'}).success).toBe(false)
    expect(addressInput.safeParse({...address,phone:'123'}).success).toBe(false)
  })
  it('blocks script and offsite CMS button URLs', () => {
    expect(internalLink.safeParse('/shop?category=skincare').success).toBe(true)
    for (const value of ['//attacker.example','javascript:alert(1)','/\\attacker.example']) expect(internalLink.safeParse(value).success).toBe(false)
    expect(imageUrl.safeParse('javascript:alert(1)').success).toBe(false)
  })
  it('accepts blank optional provider values but refuses half-configured keys and live configuration without webhooks', () => {
    expect(getConfig({ NODE_ENV:'test', GOOGLE_CLIENT_ID:'', GOOGLE_CLIENT_SECRET:'', GOOGLE_CALLBACK_URL:'', RAZORPAY_KEY_ID:'', RAZORPAY_KEY_SECRET:'' }).GOOGLE_AUTH_ENABLED).toBe(false)
    expect(() => getConfig({...config,RAZORPAY_KEY_SECRET:''})).toThrow(/both Razorpay/)
    expect(() => getConfig({...config,NODE_ENV:'production',CLIENT_URL:'https://shop.example',INTEGRATIONS_DIRECTORY:'/private-test',MONGO_URI:'mongodb://localhost/aurelia',MFA_ENCRYPTION_KEY:'x'.repeat(32),RAZORPAY_WEBHOOK_SECRET:''})).toThrow(/WEBHOOK/)
  })
})
