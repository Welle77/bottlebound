declare module "virtual:rules-reference" {
  export const RULES_REFERENCE: import("./rules-reference/types").RulesReference;
}

declare module "*.svg?url" {
  const url: string;
  export default url;
}
