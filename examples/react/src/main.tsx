import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Agent from "./pages/Agent";
import "./styles/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Agent />
  </StrictMode>
);
