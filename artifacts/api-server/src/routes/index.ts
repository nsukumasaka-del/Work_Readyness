import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import careerRouter from "./career";
import adminRouter from "./admin";

import paymentsRouter from './payments';
const router: IRouter = Router();
router.use(paymentsRouter);

router.use(healthRouter);
router.use(authRouter);
router.use(careerRouter);
router.use(adminRouter);

export default router;
