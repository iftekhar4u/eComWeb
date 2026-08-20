import { Router } from 'express'
import { protect } from '../middleware/authMiddleware.js'
const router = Router(); router.use(protect)
router.get('/', async (req, res, next) => { try { await req.user.populate('cart.product'); res.json(req.user.cart) } catch (error) { next(error) } })
router.post('/', async (req, res, next) => { try { const item = req.user.cart.find((entry) => entry.product.toString() === req.body.productId); if (item) item.quantity += Number(req.body.quantity || 1); else req.user.cart.push({ product: req.body.productId, quantity: Number(req.body.quantity || 1) }); await req.user.save(); res.json(req.user.cart) } catch (error) { next(error) } })
router.put('/:productId', async (req, res, next) => { try { const item = req.user.cart.find((entry) => entry.product.toString() === req.params.productId); if (!item) return res.status(404).json({ message: 'Cart item not found' }); item.quantity = Math.max(Number(req.body.quantity) || 1, 1); await req.user.save(); res.json(req.user.cart) } catch (error) { next(error) } })
router.delete('/:productId', async (req, res, next) => { try { req.user.cart = req.user.cart.filter((entry) => entry.product.toString() !== req.params.productId); await req.user.save(); res.json(req.user.cart) } catch (error) { next(error) } })
router.delete('/', async (req, res, next) => { try { req.user.cart = []; await req.user.save(); res.json([]) } catch (error) { next(error) } })
export default router
