import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Overlay } from "./Overlay";
import { PriceCheck } from "./PriceCheck";
import "@fontsource-variable/inter";
import "./styles.css";

const isOverlay = location.hash === "#overlay";
const isPriceCheck = location.hash === "#pricecheck";
document.documentElement.classList.toggle("overlay", isOverlay);
document.documentElement.classList.toggle("pricecheck", isPriceCheck);

createRoot(document.getElementById("root")!).render(isOverlay ? <Overlay /> : isPriceCheck ? <PriceCheck /> : <App />);
