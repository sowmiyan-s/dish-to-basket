import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ingredientPlansRouter from "./ingredient-plans";
import productImagesRouter from "./product-images";

const router: IRouter = Router();

router.use(healthRouter);
router.use(ingredientPlansRouter);
router.use(productImagesRouter);

export default router;
