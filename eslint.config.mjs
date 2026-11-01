// Flat ESLint config. eslint-config-next 16 ships flat-config arrays directly,
// so we compose them without FlatCompat.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [".next/**", "out/**", "dist/**", "public/sw.js", "coverage/**"],
  },
];

export default eslintConfig;
