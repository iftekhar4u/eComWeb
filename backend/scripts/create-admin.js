import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import argon2 from 'argon2'
import mongoose from 'mongoose'
import { getConfig } from '../config/env.js'
import User from '../models/User.js'

const config = getConfig()
const prompt = readline.createInterface({ input, output })
try {
  const name = await prompt.question('Admin name: ')
  const email = (await prompt.question('Admin email: ')).trim().toLowerCase()
  const password = await prompt.question('Admin password (12+ characters): ')
  if (password.length < 12) throw new Error('Password must be at least 12 characters')
  await mongoose.connect(config.MONGO_URI)
  const exists = await User.exists({ email })
  if (exists) throw new Error('An account already exists for that email')
  await User.create({ name, email, password: await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }), role: 'admin', status: 'active' })
  console.log('Admin created. Sign in, complete MFA setup, and store recovery codes securely.')
} finally {
  prompt.close()
  await mongoose.disconnect()
}
