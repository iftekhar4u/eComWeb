import mongoose from 'mongoose'

const addressSchema = new mongoose.Schema({
	name: { type: String, required: true, trim: true, maxlength: 100 },
	line1: { type: String, required: true, trim: true, maxlength: 200 },
	line2: { type: String, trim: true, maxlength: 200 },
	city: { type: String, required: true, trim: true, maxlength: 100 },
	state: { type: String, required: true, trim: true, maxlength: 100 },
	postalCode: { type: String, required: true, trim: true, maxlength: 20 },
	country: { type: String, required: true, trim: true, maxlength: 2, uppercase: true },
	phone: { type: String, trim: true, maxlength: 30 },
}, { _id: true, strict: 'throw' })

const userSchema = new mongoose.Schema({
	name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
	email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
	password: { type: String, required: false, select: false, maxlength: 256 },
	google: {
		issuer: { type: String, enum: ['https://accounts.google.com'] },
		subject: { type: String, trim: true, maxlength: 255 },
		linkedAt: Date,
	},
	emailVerifiedAt: Date,
	role: { type: String, enum: ['customer', 'admin'], default: 'customer', immutable: true },
	status: { type: String, enum: ['active', 'suspended'], default: 'active' },
	sessionVersion: { type: Number, required: true, default: 0, min: 0, max: 2147483647 },
	mfa: {
		enabled: { type: Boolean, default: false },
		secretEncrypted: { type: String, select: false, maxlength: 512 },
		recoveryCodeHashes: { type: [String], select: false, default: [], validate: (value) => value.length <= 10 },
	},
	addresses: { type: [addressSchema], default: [], validate: (value) => value.length <= 10 },
	wishlist: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }], validate: (value) => value.length <= 100 },
	cart: { type: [{ product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true }, quantity: { type: Number, required: true, default: 1, min: 1, max: 99 } }], validate: (value) => value.length <= 100 },
}, { timestamps: true, strict: 'throw', optimisticConcurrency: true })

userSchema.pre('validate', function (next) {
	if (!this.password && !this.google?.subject) this.invalidate('password', 'An account requires a local password or linked Google identity')
	if (this.google?.subject && this.google?.issuer !== 'https://accounts.google.com') this.invalidate('google.issuer', 'Unsupported Google issuer')
	next()
})

userSchema.index({ 'google.issuer': 1, 'google.subject': 1 }, { unique: true, partialFilterExpression: { 'google.subject': { $type: 'string' } } })

export default mongoose.model('User', userSchema)