import fs from "node:fs";
import path from "node:path";

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || "";

const envContent = `window.ENV = {\n  SUPABASE_URL: "${supabaseUrl}",\n  SUPABASE_ANON_KEY: "${supabaseAnonKey}"\n};\n`;

const outputPath = path.resolve("./src/env.js");
fs.writeFileSync(outputPath, envContent, "utf8");

console.log("Generated src/env.js");
