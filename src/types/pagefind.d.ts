declare module "@pagefind/default-ui" {
  interface PagefindResult {
    meta: Record<string, string>;
    excerpt: string;
    [key: string]: unknown;
  }
  interface PagefindUIOptions {
    element: string;
    showImages?: boolean;
    showSubResults?: boolean;
    processResult?: (result: PagefindResult) => PagefindResult;
    excerptLength?: number;
    resetStyles?: boolean;
    translations?: Record<string, string>;
  }
  export class PagefindUI {
    constructor(options: PagefindUIOptions);
    destroy(): void;
  }
}
