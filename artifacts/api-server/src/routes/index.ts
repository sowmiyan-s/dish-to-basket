import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ingredientPlansRouter from "./ingredient-plans";

const router: IRouter = Router();

router.use(healthRouter);
router.use(ingredientPlansRouter);

export default router;
