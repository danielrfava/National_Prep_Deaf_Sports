import { mountPublicTopNav } from "./components/publicTopNav.js";

const active = document.body.dataset.navActive || "about";
const footerActive = document.body.dataset.footerActive || active;
const basePath = document.body.dataset.basePath || "";

mountPublicTopNav({ active, footerActive, basePath });
