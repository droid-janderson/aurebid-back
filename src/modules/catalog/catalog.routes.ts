import { Router } from "express";
import { asyncHandler } from "../../shared/middlewares";
import { validate } from "../../shared/middlewares";
import * as catalogController from "./catalog.controller";
import * as cardexController from "./cardex.controller";
import {
  createLotSchema,
  updateLotSchema,
  lotQuerySchema,
} from "./catalog.schemas";
import {
  authenticate,
  authorize,
} from "../../shared/middlewares/auth.middleware";

const router = Router();

router.get(
  "/lots",
  validate(lotQuerySchema),
  asyncHandler(catalogController.listLots),
);

router.get(
  "/lots/mine",
  authenticate,
  authorize(["AUCTIONEER", "ADMIN"]),
  validate(lotQuerySchema),
  asyncHandler(catalogController.listMyLots),
);

router.get("/lots/:id", asyncHandler(catalogController.getLotById));

router.get("/cards", asyncHandler(cardexController.searchCards));

router.get("/cards/:id", asyncHandler(cardexController.getCardById));

router.use(authenticate);
router.post(
  "/lots",
  authorize(["AUCTIONEER", "ADMIN"]),
  validate(createLotSchema),
  asyncHandler(catalogController.createLot),
);
router.put(
  "/lots/:id",
  authorize(["AUCTIONEER", "ADMIN"]),
  validate(updateLotSchema),
  asyncHandler(catalogController.updateLot),
);
router.delete(
  "/lots/:id",
  authorize(["AUCTIONEER", "ADMIN"]),
  asyncHandler(catalogController.deleteLot),
);

export default router;
