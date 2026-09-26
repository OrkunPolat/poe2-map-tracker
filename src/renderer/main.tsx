import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Overlay } from "./Overlay";
import "./styles.css";

const isOverlay = location.hash === "#overlay";
document.documentElement.classList.toggle("overlay", isOverlay);

createRoot(document.getElementById("root")!).render(isOverlay ? <Overlay /> : <App />);
