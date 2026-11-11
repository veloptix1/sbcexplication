import { handle } from "hono/vercel";
import { createApp } from "../src/server/app.js";

/** Point d'entrée Vercel : toutes les routes /api/* arrivent ici (voir vercel.json). */
const handler = handle(createApp(process.env));

export const GET = handler;
export const POST = handler;
