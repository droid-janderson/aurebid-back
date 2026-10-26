import { Router } from "express";
import { asyncHandler } from "../../shared/middlewares";
import { validate } from "../../shared/middlewares";
import * as bidsController from "./bids.controller";
import { bidQuerySchema } from "./bids.schemas";
import {
  authenticate,
  authorize,
} from "../../shared/middlewares/auth.middleware";

const router = Router();

router.use(authenticate);

router.get(
  "/admin/all",
  authorize(["ADMIN"]),
  validate(bidQuerySchema),
  asyncHandler(bidsController.listAllBids),
);

router.get(
  "/",
  validate(bidQuerySchema),
  asyncHandler(bidsController.listMyBids),
);
router.get("/:id", asyncHandler(bidsController.getBidById));

export default router;
