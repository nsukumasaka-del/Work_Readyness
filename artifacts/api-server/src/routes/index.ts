import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import careerRouter from "./career";
import adminRouter from "./admin";
import internalRouter from "./internal";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(careerRouter);
router.use(adminRouter);
router.use(internalRouter);

export default router;
