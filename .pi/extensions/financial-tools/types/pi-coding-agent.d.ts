// Stub types for pi-coding-agent package (not installed in extension node_modules)
// The extension uses a simpler ToolDefinition shape without label
declare module 'pi-coding-agent' {
  export interface ToolDefinition {
    name: string;
    label?: string;
    description: string;
    parameters: unknown;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: any;
  }
  export interface ExtensionAPI {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerTool(tool: any): void;
    registerCommand(command: unknown): void;
    getContext(): unknown;
  }
}

declare module '@earendil-works/pi-coding-agent' {
  export interface ToolDefinition {
    name: string;
    label?: string;
    description: string;
    parameters: unknown;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: any;
  }
  export interface ExtensionAPI {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerTool(tool: any): void;
    registerCommand(command: unknown): void;
    getContext(): unknown;
  }
}