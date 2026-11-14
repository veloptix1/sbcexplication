import { createRoot } from "react-dom/client";
import { Admin } from "./Admin.js";
import { Shop } from "./Shop.js";
import { isAdminPath, slugFromPath } from "./api.js";
import "./storefront.css";

const slug = slugFromPath();
createRoot(document.getElementById("root")!).render(isAdminPath() ? <Admin slug={slug} /> : <Shop slug={slug} />);
