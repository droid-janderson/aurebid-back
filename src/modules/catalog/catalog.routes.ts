import { Router } from "express";
import { asyncHandler } from "../../shared/middlewares";
import { validate } from "../../shared/middlewares";
import * as catalogController from "./catalog.controller";
import * as cardexController from "./cardex.controller";
import {
  createBatchSchema,
  updateBatchSchema,
  batchQuerySchema,
} from "./catalog.schemas";
import {
  authenticate,
  authorize,
} from "../../shared/middlewares/auth.middleware";

const router = Router();

router.get(
  "/batchs",
  validate(batchQuerySchema),
  asyncHandler(catalogController.listBatchs),
);

router.get(
  "/batchs/mine",
  authenticate,
  authorize(["AUCTIONEER", "ADMIN"]),
  validate(batchQuerySchema),
  asyncHandler(catalogController.listMyBatchs),
);

router.get("/batchs/:id", asyncHandler(catalogController.getBatchById));

router.get("/cards", asyncHandler(cardexController.searchCards));

router.get("/cards/:id", asyncHandler(cardexController.getCardById));

router.use(authenticate);
router.post(
  "/batchs",
  authorize(["AUCTIONEER", "ADMIN"]),
  validate(createBatchSchema),
  asyncHandler(catalogController.createBatch),
);
router.put(
  "/batchs/:id",
  authorize(["AUCTIONEER", "ADMIN"]),
  validate(updateBatchSchema),
  asyncHandler(catalogController.updateBatch),
);
router.delete(
  "/batchs/:id",
  authorize(["AUCTIONEER", "ADMIN"]),
  asyncHandler(catalogController.deleteBatch),
);

export default router;
