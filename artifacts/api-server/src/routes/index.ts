import { Router, type IRouter } from "express";
import healthRouter from "./health";
import careerRouter from "./career";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(careerRouter);
router.use(adminRouter);

export default router;
