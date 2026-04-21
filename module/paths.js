import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PROJECT_ROOT = path.resolve(__dirname, "..");
export const OUTPUT_DIR = path.join(PROJECT_ROOT, "output");
export const RESULTS_DIR = path.join(OUTPUT_DIR, "results");
export const PROGRESS_DIR = path.join(OUTPUT_DIR, "progress");
export const SESSION_DIR = path.join(OUTPUT_DIR, "session");
