import { buildApp } from "./app.js";
import { loadEnvironment } from "./config/env.js";

const environment = loadEnvironment();
const app = buildApp({ environment });

await app.listen({ host: "0.0.0.0", port: environment.PORT });
