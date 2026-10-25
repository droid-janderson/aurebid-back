import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes';
import catalogRoutes from '../modules/catalog/catalog.routes';
import auctionRoutes from '../modules/auctions/auctions.routes';
import bidRoutes from '../modules/bids/bids.routes';
import walletRoutes from '../modules/wallets/wallets.routes';
import settlementRoutes from '../modules/settlements/settlements.routes';
import auditRoutes from '../modules/audit/audit.routes';

const router = Router();

// Mount module routes
router.use('/auth', authRoutes);
router.use('/catalog', catalogRoutes);
router.use('/auctions', auctionRoutes);
router.use('/bids', bidRoutes);
router.use('/wallets', walletRoutes);
router.use('/settlements', settlementRoutes);
router.use('/audit', auditRoutes);

export default router;