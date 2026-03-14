import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    ignores: [
      "database.js",
      "service-worker.js",
      "scripts/*.cjs",
      ".next/**",
      "node_modules/**"
    ]
  }
];

export default eslintConfig;