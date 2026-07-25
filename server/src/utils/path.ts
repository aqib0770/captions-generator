import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export { __dirname };

/** Returns server root path (server/) */
export function projectRoot(): string {
  return path.resolve(__dirname, "../..");
}

/** Returns workspace root path (caption-test/) */
export function workspaceRoot(): string {
  return path.resolve(__dirname, "../../..");
}

/** Returns absolute path to docker-compose.yml */
export function getDockerComposePath(): string {
  const rootCompose = path.join(workspaceRoot(), "docker-compose.yml");
  if (fs.existsSync(rootCompose)) return rootCompose;

  const dockerCompose = path.join(workspaceRoot(), "docker", "docker-compose.yml");
  if (fs.existsSync(dockerCompose)) return dockerCompose;

  return path.join(projectRoot(), "docker-compose.yml");
}
