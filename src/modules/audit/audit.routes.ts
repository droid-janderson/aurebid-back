import { Router } from "express";
import { asyncHandler } from "../../shared/middlewares";
import { validate } from "../../shared/middlewares";
import * as auditController from "./audit.controller";
import {
  auditQuerySchema,
  batchAuditSchema,
  bidAuditSchema,
} from "./audit.schemas";
import {
  authenticate,
  authorize,
} from "../../shared/middlewares/auth.middleware";

const router = Router();

router.use(authenticate);
router.use(authorize(["ADMIN"]));

router.get(
  "/",
  validate(auditQuerySchema),
  asyncHandler(auditController.listAuditEntries),
);
router.get(
  "/batchs/:batchId/verify",
  validate(batchAuditSchema),
  asyncHandler(auditController.verifyBatchChain),
);
router.get(
  "/batchs/:batchId",
  validate(batchAuditSchema),
  asyncHandler(auditController.listAuditByBatch),
);
router.get(
  "/bids/:bidId",
  validate(bidAuditSchema),
  asyncHandler(auditController.getAuditEntryByBid),
);

export default router;
