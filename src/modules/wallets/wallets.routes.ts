import { Router } from 'express';
import { asyncHandler } from '../../shared/middlewares';
import { validate } from '../../shared/middlewares';
import * as walletsController from './wallets.controller';
import { depositSchema, withdrawSchema, transactionQuerySchema } from './wallets.schemas';
import { authenticate, authorize } from '../../shared/middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', asyncHandler(walletsController.getWallet));
router.get('/transactions', validate(transactionQuerySchema), asyncHandler(walletsController.listTransactions));
router.post('/deposit', validate(depositSchema), asyncHandler(walletsController.deposit));
router.post('/withdraw', validate(withdrawSchema), asyncHandler(walletsController.withdraw));

router.get('/admin/all', authorize(['ADMIN']), validate(transactionQuerySchema), asyncHandler(walletsController.listAllWallets));
router.get('/admin/:userId', authorize(['ADMIN']), asyncHandler(walletsController.getWalletByUserId));

export default router;
