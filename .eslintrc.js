const OFF   = 0;
const WARN  = 1;
const ERROR = 2;

module.exports = {
  parser: "@typescript-eslint/parser",
  extends: [
    "plugin:@typescript-eslint/recommended",
  ],
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: "module" 
  },
  rules: {
    "@typescript-eslint/no-var-requires": WARN,
    "@typescript-eslint/no-explicit-any": WARN,
    "@typescript-eslint/interface-name-prefix" : OFF,
    "@typescript-eslint/no-non-null-assertion": OFF,
    "@typescript-eslint/camelcase": OFF,
    "@typescript-eslint/no-inferrable-types": OFF,
    "@typescript-eslint/ban-ts-ignore": WARN,
    "semi": [OFF, "always"],
    "curly": [WARN, "all"],
  }
};
