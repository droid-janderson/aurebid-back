import { Router } from "express";
import { asyncHandler } from "../../shared/middlewares";
import { validate } from "../../shared/middlewares";
import * as auctionController from "./auctions.controller";
import {
  auctionQuerySchema,
  placeBidSchema,
  bidQuerySchema,
  updateBatchStatusSchema,
} from "./auctions.schemas";
import {
  authenticate,
  authorize,
  optionalAuth,
} from "../../shared/middlewares/auth.middleware";

const router = Router();

router.get(
  "/admin/all",
  authenticate,
  authorize(["ADMIN"]),
  validate(auctionQuerySchema),
  asyncHandler(auctionController.listAllAuctions),
);

router.get(
  "/",
  optionalAuth,
  validate(auctionQuerySchema),
  asyncHandler(auctionController.listAuctions),
);
router.get("/:id", optionalAuth, asyncHandler(auctionController.getAuctionById));
router.get(
  "/:id/bids",
  optionalAuth,
  validate(bidQuerySchema),
  asyncHandler(auctionController.getAuctionBids),
);
router.get("/:id/audit", optionalAuth, asyncHandler(auctionController.getPublicAudit));
router.get(
  "/:id/audit/verify",
  optionalAuth,
  asyncHandler(auctionController.verifyPublicAudit),
);

router.use(authenticate);

router.post(
  "/:id/publish",
  authorize(["AUCTIONEER", "ADMIN"]),
  asyncHandler(auctionController.publishAuction),
);
router.post(
  "/:id/cancel",
  authorize(["AUCTIONEER", "ADMIN"]),
  asyncHandler(auctionController.cancelAuction),
);
router.post(
  "/:id/end",
  authorize(["AUCTIONEER", "ADMIN"]),
  asyncHandler(auctionController.endAuction),
);

router.post(
  "/:id/bids",
  authorize(["BIDDER"]),
  validate(placeBidSchema),
  asyncHandler(auctionController.placeBid),
);

router.put(
  "/:id/status",
  authorize(["ADMIN"]),
  validate(updateBatchStatusSchema),
  asyncHandler(auctionController.updateAuctionStatus),
);

export default router;
