declare module "@pagefind/default-ui" {
  interface PagefindUIOptions {
    element: string;
    showImages?: boolean;
    excerptLength?: number;
    resetStyles?: boolean;
    translations?: Record<string, string>;
  }
  export class PagefindUI {
    constructor(options: PagefindUIOptions);
    destroy(): void;
  }
}
