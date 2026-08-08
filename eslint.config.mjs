import { config } from "@remotion/eslint-config-flat";

export default [
  // Every project-scaffolded composition folder lives under this one
  // gitignored root (see .gitignore) -- one generic ignore covers every
  // current and future project, no per-project name ever needs adding here.
  { ignores: ["src/projects-local/**"] },
  ...config,
];
