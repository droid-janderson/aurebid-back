import { Router } from "express";
import { asyncHandler } from "../../shared/middlewares";
import { validate } from "../../shared/middlewares";
import * as authController from "./auth.controller";
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  changePasswordSchema,
  updateProfileSchema,
  userQuerySchema,
  updateUserRoleSchema,
} from "./auth.schemas";
import {
  authenticate,
  authorize,
} from "../../shared/middlewares/auth.middleware";

const router = Router();

// Public
router.post(
  "/register",
  validate(registerSchema),
  asyncHandler(authController.register),
);
router.post(
  "/login",
  validate(loginSchema),
  asyncHandler(authController.login),
);
router.post(
  "/refresh",
  validate(refreshTokenSchema),
  asyncHandler(authController.refreshToken),
);

// Protected
router.use(authenticate);
router.get("/me", asyncHandler(authController.getMe));
router.put(
  "/me",
  validate(updateProfileSchema),
  asyncHandler(authController.updateProfile),
);
router.post(
  "/change-password",
  validate(changePasswordSchema),
  asyncHandler(authController.changePassword),
);
router.post("/logout", asyncHandler(authController.logout));

// Admin
router.get(
  "/users",
  authorize(["ADMIN"]),
  validate(userQuerySchema),
  asyncHandler(authController.listUsers),
);
router.get(
  "/users/:id",
  authorize(["ADMIN"]),
  asyncHandler(authController.getUserById),
);
router.put(
  "/users/:id/role",
  authorize(["ADMIN"]),
  validate(updateUserRoleSchema),
  asyncHandler(authController.updateUserRole),
);
router.delete(
  "/users/:id",
  authorize(["ADMIN"]),
  asyncHandler(authController.deleteUser),
);

export default router;
