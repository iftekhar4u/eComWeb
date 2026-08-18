import User from '../models/User.js'

export async function protect(req, res, next) {
	if (!req.session?.userId) return res.status(401).json({ message: 'Authentication required' })
	const user = await User.findById(req.session.userId)
	if (!user || user.status !== 'active' || req.session.sessionVersion !== user.sessionVersion) {
		req.session.destroy(() => {})
		return res.status(401).json({ message: 'Authentication required' })
	}
	if (user.role === 'admin' && !req.session.mfaVerified) return res.status(403).json({ message: 'Administrator MFA required' })
	req.user = user
	next()
}

export function requireAdmin(req, res, next) {
	if (req.user?.role !== 'admin' || !req.session.mfaVerified) return res.status(403).json({ message: 'Administrator access required' })
	next()
}

export function safeUser(user) {
	return { id: user._id, name: user.name, email: user.email, role: user.role, status: user.status, mfaEnabled: Boolean(user.mfa?.enabled) }
}

export async function protectPendingAdmin(req, res, next) {
	if (!req.session?.userId) return res.status(401).json({ message: 'Authentication required' })
	const user = await User.findById(req.session.userId).select('+mfa.secretEncrypted +mfa.recoveryCodeHashes')
	if (!user || user.status !== 'active' || user.role !== 'admin' || req.session.sessionVersion !== user.sessionVersion) return res.status(403).json({ message: 'Administrator access required' })
	req.user = user
	next()
}