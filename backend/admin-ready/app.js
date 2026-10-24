import { createPaymentSettings } from '../payments/settings.js'
import paymentAdminRoutes from '../payments/adminRoutes.js'
import securityRoutes from './security.js'
import { createIntegrationStore } from '../integrations/store.js'
import { integrationRoutes, publicIntegrationRoutes } from '../integrations/routes.js'
import readyRoutes from './routes.js'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import session from 'express-session'
import MongoStore from 'connect-mongo'
import passport from 'passport'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import mongoose from 'mongoose'
import { getConfig, getMongoUri } from '../config/env.js'
import productRoutes from '../routes/productRoutes.js'
import authRoutes from '../routes/authRoutes.js'
import wishlistRoutes from '../routes/wishlistRoutes.js'
import adminRoutes from '../routes/adminRoutes.js'
import adminStudioRoutes from '../routes/adminStudioRoutes.js'
import contentRoutes from '../routes/contentRoutes.js'
import orderRoutes from '../routes/orderRoutes.js'
import { razorpayWebhook } from '../routes/webhookRoutes.js'
import { createRazorpay } from '../services/razorpay.js'
import cartRoutes from '../routes/cartRoutes.js'
import { requireCsrf } from '../middleware/csrfMiddleware.js'
import { errorHandler, notFound } from '../middleware/errorMiddleware.js'
import { configurePassport } from '../config/passport.js'
import { adminSeoRoutes, publicSeoRoutes, crawlRoutes, seoHtml } from '../seo/routes.js'
import adminEmailRoutes from '../email/adminRoutes.js'
import publicEmailRoutes from '../email/publicRoutes.js'
import { createEmailService } from '../email/service.js'

export function createReadyApp({ config = getConfig(), store, gateway, staticDirectory, integrations = createIntegrationStore(config), emailService, paymentSettings } = {}) {
  const app = express()
  app.locals.config = config
  app.locals.gateway = gateway || createRazorpay(config)
  app.locals.payments = paymentSettings || createPaymentSettings(config, gateway)
  app.locals.googleAuthEnabled = config.GOOGLE_AUTH_ENABLED
  app.locals.clientUrl = config.CLIENT_URL
  app.locals.email = emailService || createEmailService(config)
  app.disable('x-powered-by')
  app.set('trust proxy', config.TRUST_PROXY)
  app.use(helmet({ contentSecurityPolicy: config.NODE_ENV === 'production' ? { directives: { imgSrc: ["'self'", 'data:', 'https:'], scriptSrc: ["'self'", 'https://checkout.razorpay.com'], frameSrc: ["'self'", 'https://api.razorpay.com', 'https://checkout.razorpay.com'], connectSrc: ["'self'", 'https://api.razorpay.com', 'https://checkout.razorpay.com'], formAction: ["'self'", 'https://api.razorpay.com'] } } : false }))
  app.use(cors({ origin: config.CLIENT_URL, credentials: true }))
  app.post(['/api/payments/razorpay/webhook','/api/payments/razorpay/webhook/:profileId'], express.raw({ type: 'application/json', limit: '100kb' }), razorpayWebhook)
  app.use(express.json({ limit: '100kb' }))
  app.use(cookieParser())
  app.use(session({
    name: 'aurelia.sid',
    secret: config.SESSION_SECRET || 'test-session-secret-test-session-secret',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: store || (config.MONGO_URI ? MongoStore.create({ mongoUrl: config.MONGO_URI, ttl: 60 * 60 * 24 * 7, autoRemove: 'interval', autoRemoveInterval: 10 }) : undefined),
    cookie: { httpOnly: true, secure: config.NODE_ENV === 'production', sameSite: 'lax', maxAge: 30 * 60 * 1000 },
  }))
  configurePassport(passport, config)
  app.use(passport.initialize())
  app.use(passport.session())
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 200, standardHeaders: 'draft-8', legacyHeaders: false }))
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', brand: 'AURELIA' }))
  app.use('/api/seo', publicSeoRoutes)
  app.use('/api/admin/seo', adminSeoRoutes)
  app.use('/api/email', requireCsrf, publicEmailRoutes)
  app.use('/api/admin/email', requireCsrf, adminEmailRoutes)
  app.use('/api/integrations', publicIntegrationRoutes(integrations))
  app.use('/api/admin-ready/integrations', requireCsrf, integrationRoutes({ store: integrations, config }))
  app.use('/api/admin-ready/security', requireCsrf, securityRoutes)
  app.use('/api/admin-ready', requireCsrf, readyRoutes)
  app.use('/api/admin/studio', requireCsrf, adminStudioRoutes)
  app.use('/api/admin', requireCsrf, paymentAdminRoutes)
  app.use('/api/admin', requireCsrf, adminRoutes)
  app.use('/api/orders', requireCsrf, orderRoutes)
  app.use('/api/content', requireCsrf, contentRoutes)
  app.use('/api/v1/auth', requireCsrf, authRoutes)
  app.use('/api/v1', requireCsrf, authRoutes)
  app.use('/api/v1/products', productRoutes)
  app.use('/api/v1/wishlist', requireCsrf, wishlistRoutes)
  app.use('/api/v1/cart', requireCsrf, cartRoutes)
  app.use('/api/auth', requireCsrf, authRoutes)
  app.use('/api/products', productRoutes)
  app.use('/api/wishlist', requireCsrf, wishlistRoutes)
  app.use('/api/cart', requireCsrf, cartRoutes)
  app.use(crawlRoutes)
  if(staticDirectory) {
    app.use(seoHtml(staticDirectory))
    app.use(express.static(staticDirectory, { index: false }))
  }
  app.use(notFound)
  app.use(errorHandler)
  return app
}

export async function connectDatabase(config = getConfig()) {
  if (config.NODE_ENV === 'test' && !config.MONGO_URI) return
  await mongoose.connect(config.MONGO_URI || getMongoUri(config), { serverSelectionTimeoutMS: 30000, autoIndex: false, autoCreate: false })
}
