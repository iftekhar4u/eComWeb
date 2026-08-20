import { Router } from 'express'
import { protect } from '../middleware/authMiddleware.js'
const router = Router(); router.use(protect)
router.get('/', async (req, res, next) => { try { await req.user.populate('wishlist'); res.json(req.user.wishlist) } catch (error) { next(error) } })
router.post('/:productId', async (req, res, next) => { try { if (!req.user.wishlist.some((id) => id.toString() === req.params.productId)) req.user.wishlist.push(req.params.productId); await req.user.save(); res.json(req.user.wishlist) } catch (error) { next(error) } })
router.delete('/:productId', async (req, res, next) => { try { req.user.wishlist = req.user.wishlist.filter((id) => id.toString() !== req.params.productId); await req.user.save(); res.json(req.user.wishlist) } catch (error) { next(error) } })
export default router
