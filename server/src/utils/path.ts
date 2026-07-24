import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export { __dirname };

export function projectRoot(): string {
  return path.resolve(__dirname, "../..");
}
