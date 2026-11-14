import { handle } from "hono/vercel";
import { createApp } from "../src/server/app.js";

/** Point d'entrée Vercel : toutes les routes /api/* arrivent ici (voir vercel.json). */
const handler = createApp(process.env).then((app) => handle(app));

const run = async (req: Request): Promise<Response> => (await handler)(req);
export const GET = run;
export const POST = run;
export const PATCH = run;
export const PUT = run;
export const DELETE = run;
