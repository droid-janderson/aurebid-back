import { Router } from "express";
import { asyncHandler } from "../../shared/middlewares";
import { validate } from "../../shared/middlewares";
import * as settlementsController from "./settlements.controller";
import {
  settlementQuerySchema,
  settlementIdSchema,
  lotIdSchema,
} from "./settlements.schemas";
import {
  authenticate,
  authorize,
} from "../../shared/middlewares/auth.middleware";

const router = Router();

// Public
router.get(
  "/public/:token",
  asyncHandler(settlementsController.getSettlementByToken),
);

router.use(authenticate);

// Admin
router.get(
  "/admin/all",
  authorize(["ADMIN"]),
  validate(settlementQuerySchema),
  asyncHandler(settlementsController.listAllSettlements),
);
router.post(
  "/admin/lots/:lotId",
  authorize(["ADMIN"]),
  validate(lotIdSchema),
  asyncHandler(settlementsController.createSettlementForLotHandler),
);
router.post(
  "/admin/:id/complete",
  authorize(["ADMIN"]),
  validate(settlementIdSchema),
  asyncHandler(settlementsController.completeSettlementHandler),
);
router.post(
  "/admin/:id/fail",
  authorize(["ADMIN"]),
  validate(settlementIdSchema),
  asyncHandler(settlementsController.failSettlementHandler),
);

// Protected
router.get(
  "/",
  validate(settlementQuerySchema),
  asyncHandler(settlementsController.listMySettlements),
);
router.get(
  "/:id",
  validate(settlementIdSchema),
  asyncHandler(settlementsController.getSettlementById),
);
router.post(
  "/:id/process",
  validate(settlementIdSchema),
  asyncHandler(settlementsController.processSettlement),
);

export default router;
