// Global type stubs for modules that can't be resolved through pnpm junctions on Windows

// Node builtins
declare module "vitest" {
	export const describe: any;
	export const it: any;
	export const expect: any;
	export const vi: any;
	export const beforeEach: any;
	export const afterEach: any;
}

declare module "fs" {
	namespace fs {
		function existsSync(path: string): boolean;
		function readFileSync(path: string, encoding?: string): string;
		function writeFileSync(path: string, data: string, encoding?: string): void;
		function mkdirSync(path: string, options?: unknown): void;
		function readdirSync(path: string): string[];
		function statSync(path: string): unknown;
		function lstatSync(path: string): unknown;
		function realpathSync(path: string): string;
		function createReadStream(path: string): unknown;
		function createWriteStream(path: string): unknown;
		function appendFileSync(path: string, data: string): void;
		function unlinkSync(path: string): void;
		function rmdirSync(path: string): void;
		function mkdtempSync(prefix: string): string;
		function rmSync(path: string, options?: unknown): void;
	}
	export = fs;
}

declare module "path" {
	namespace path {
		function resolve(...paths: string[]): string;
		function dirname(p: string): string;
		function basename(p: string, ext?: string): string;
		function extname(p: string): string;
		function join(...paths: string[]): string;
		function isAbsolute(p: string): boolean;
		function relative(from: string, to: string): string;
		function normalize(p: string): string;
		function parse(p: string): {
			root: string;
			dir: string;
			base: string;
			ext: string;
			name: string;
		};
		function format(p: {
			root?: string;
			dir?: string;
			base?: string;
			ext?: string;
			name?: string;
		}): string;
		const sep: string;
		const delimiter: string;
	}
	export = path;
}

declare module "url" {
	namespace url {
		function fileURLToPath(url: string): string;
		function pathToFileURL(path: string): unknown;
	}
	export = url;
}

declare module "node:fs" {
	function existsSync(path: string): boolean;
	function readFileSync(path: string, encoding?: string): string;
	function writeFileSync(path: string, data: string): void;
	function mkdirSync(path: string, options?: unknown): void;
	function readdirSync(path: string): string[];
	function statSync(path: string): unknown;
	function lstatSync(path: string): unknown;
	function realpathSync(path: string): string;
	function createReadStream(path: string): unknown;
	function createWriteStream(path: string): unknown;
	function appendFileSync(path: string, data: string): void;
	function unlinkSync(path: string): void;
	function rmdirSync(path: string): void;
	function mkdtempSync(prefix: string): string;
	function rmSync(path: string, options?: unknown): void;
}

declare module "node:path" {
	function resolve(...paths: string[]): string;
	function dirname(p: string): string;
	function basename(p: string, ext?: string): string;
	function extname(p: string): string;
	function join(...paths: string[]): string;
	function isAbsolute(p: string): boolean;
	function relative(from: string, to: string): string;
	function normalize(p: string): string;
	const sep: string;
	const delimiter: string;
}

declare module "node:url" {
	function fileURLToPath(url: string): string;
	function pathToFileURL(path: string): unknown;
}

declare module "node:crypto" {
	function randomUUID(): string;
}

declare module "node:module" {
	function createRequire(path: string): {
		(id: string): unknown;
		resolve(id: string): string;
	};
}

declare module "node:fs/promises" {
	function readFile(path: string, encoding?: string): Promise<string>;
	function writeFile(path: string, data: string): Promise<void>;
	function mkdir(path: string, options?: unknown): Promise<void>;
	function readdir(path: string): Promise<string[]>;
	function unlink(path: string): Promise<void>;
}

declare module "crypto" {
	function randomUUID(): string;
}

declare module "module" {
	function createRequire(path: string): {
		(id: string): unknown;
		resolve(id: string): string;
	};
}

// Global environment declarations
declare const console: {
	log(...args: unknown[]): void;
	error(...args: unknown[]): void;
	warn(...args: unknown[]): void;
	info(...args: unknown[]): void;
	debug(...args: unknown[]): void;
	table(data: unknown): void;
	time(label?: string): void;
	timeEnd(label?: string): void;
	timeLog(label?: string): void;
	group(...label: unknown[]): void;
	groupCollapsed(...label: unknown[]): void;
	groupEnd(): void;
	assert(condition: boolean, ...data: unknown[]): void;
	count(label?: string): void;
	countReset(label?: string): void;
	dir(obj: unknown, options?: unknown): void;
	trace(...args: unknown[]): void;
};

declare function setTimeout(
	callback: (...args: unknown[]) => void,
	ms?: number,
	...args: unknown[]
): NodeJS.Timeout;
declare function clearTimeout(id: NodeJS.Timeout): void;
declare function setInterval(
	callback: (...args: unknown[]) => void,
	ms?: number,
	...args: unknown[]
): NodeJS.Timeout;
declare function clearInterval(id: NodeJS.Timeout): void;
declare function setImmediate(
	callback: (...args: unknown[]) => void,
	...args: unknown[]
): NodeJS.Immediate;
declare function clearImmediate(id: NodeJS.Immediate): void;
declare function queueMicrotask(callback: () => void): void;
declare function structuredClone<T>(value: T, options?: unknown): T;

declare namespace NodeJS {
	interface Timeout {
		hasRef(): boolean;
		ref(): Timeout;
		unref(): Timeout;
		close(): void;
	}
	interface Immediate {
		hasRef(): boolean;
		ref(): Immediate;
		unref(): Immediate;
		close(): void;
	}
	interface Process {
		env: Record<string, string | undefined>;
		cwd(): string;
		exit(code?: number): never;
		on(s: string, cb: (...args: unknown[]) => void): this;
		off(s: string, cb: (...args: unknown[]) => void): this;
		argv: string[];
		version: string;
		platform: string;
		arch: string;
	}
	interface PoolClient {
		query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
		release(): void;
	}
}
declare const process: NodeJS.Process;
declare const __dirname: string;
declare const crypto: { randomUUID(): string };

declare function fetch(input: unknown, init?: unknown): Promise<FetchResponse>;
interface FetchResponse {
	ok: boolean;
	status: number;
	statusText: string;
	text(): Promise<string>;
	json(): Promise<unknown>;
	headers: { get(name: string): string | null };
}

declare interface RequestInit {
	method?: string;
	headers?: Record<string, string>;
	body?: string;
}
declare type RequestInfo = {};
declare type StructuredSerializeOptions = {};

declare interface ImportMeta {
	url: string;
	readonly env: Record<string, unknown>;
}

declare module "@earendil-works/pi-coding-agent" {
	interface AgentEvent {
		type: string;
		message?: unknown;
		[key: string]: unknown;
	}
	interface ImageContent {}
	export class RpcClient {
		constructor(options?: Record<string, unknown>);
		start(): Promise<void>;
		stop(): Promise<void>;
		onEvent(listener: (event: AgentEvent) => void): () => void;
		getStderr(): string;
		prompt(message: string, images?: ImageContent[]): Promise<void>;
		steer(message: string, images?: ImageContent[]): Promise<void>;
		followUp(message: string, images?: ImageContent[]): Promise<void>;
		abort(): Promise<void>;
		newSession(parentSession?: string): Promise<{ cancelled: boolean }>;
		getState(): Promise<unknown>;
		setModel(
			provider: string,
			modelId: string,
		): Promise<{ provider: string; id: string }>;
		cycleModel(): Promise<{
			model: { provider: string; id: string };
			thinkingLevel: unknown;
			isScoped: boolean;
		} | null>;
		getAvailableModels(): Promise<
			Array<{
				provider: string;
				id: string;
				contextWindow: number;
				reasoning: boolean;
			}>
		>;
		setThinkingLevel(level: unknown): Promise<void>;
		cycleThinkingLevel(): Promise<{ level: unknown } | null>;
		setSteeringMode(mode: "all" | "one-at-a-time"): Promise<void>;
		setFollowUpMode(mode: "all" | "one-at-a-time"): Promise<void>;
		compact(customInstructions?: string): Promise<unknown>;
		setAutoCompaction(enabled: boolean): Promise<void>;
		setAutoRetry(enabled: boolean): Promise<void>;
		abortRetry(): Promise<void>;
		bash(command: string): Promise<unknown>;
		abortBash(): Promise<void>;
		getSessionStats(): Promise<unknown>;
		exportHtml(outputPath?: string): Promise<{ path: string }>;
		switchSession(sessionPath: string): Promise<{ cancelled: boolean }>;
		fork(entryId: string): Promise<{ text: string; cancelled: boolean }>;
		clone(): Promise<{ cancelled: boolean }>;
		getForkMessages(): Promise<Array<{ entryId: string; text: string }>>;
		getLastAssistantText(): Promise<string | null>;
		setSessionName(name: string): Promise<void>;
		getMessages(): Promise<unknown[]>;
		getCommands(): Promise<unknown[]>;
		waitForIdle(timeout?: number): Promise<void>;
		collectEvents(timeout?: number): Promise<AgentEvent[]>;
		promptAndWait(
			message: string,
			images?: ImageContent[],
			timeout?: number,
		): Promise<AgentEvent[]>;
	}
}

declare module "fastify" {
	interface FastifyRequest {
		body: unknown;
		params: Record<string, string>;
		query: Record<string, string>;
		headers: Record<string, string>;
	}
	interface FastifyReply {
		send(payload: unknown): FastifyReply;
		status(code: number): FastifyReply;
		json(payload: unknown): FastifyReply;
		code(code: number): FastifyReply;
	}
	interface FastifyInstance {
		post(
			path: string,
			handler: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>,
		): FastifyInstance;
		get(
			path: string,
			handler: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>,
		): FastifyInstance;
		listen(opts: { port: number; host: string }, cb?: () => void): void;
		close(): Promise<void>;
		log: {
			info(msg: string, ...args: unknown[]): void;
			error(msg: unknown, ...args: unknown[]): void;
			warn(msg: string, ...args: unknown[]): void;
		};
	}
	function fastify(opts?: { logger?: boolean }): FastifyInstance;
	export type { FastifyInstance, FastifyRequest, FastifyReply };
	export default fastify;
}

declare module "pg" {
	interface QueryResultRow {
		[key: string]: unknown;
	}
	interface QueryResult<T = unknown> {
		rows: T[];
		rowCount: number;
		command: string;
		oid: number;
	}
	interface PoolClient {
		query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
		release(): void;
	}
	interface PoolConfig {
		connectionString: string;
		max?: number;
		idleTimeoutMillis?: number;
		connectionTimeoutMillis?: number;
	}
	class Pool {
		constructor(config: PoolConfig);
		query<T = QueryResultRow>(
			sql: string,
			params?: unknown[],
		): Promise<QueryResult<T>>;
		end(): Promise<void>;
		connect(): Promise<PoolClient>;
		on(event: string, listener: (...args: unknown[]) => void): Pool;
	}
	namespace pg {
		type Pool = Pool;
		type QueryResultRow = { [key: string]: unknown };
		type QueryResult<T = unknown> = {
			rows: T[];
			rowCount: number;
			command: string;
			oid: number;
		};
		type PoolClient = PoolClient;
		type PoolConfig = PoolConfig;
	}
	const pg: typeof Pool & {
		Pool: typeof Pool;
		QueryResult: typeof QueryResult;
		QueryResultRow: QueryResultRow;
		PoolClient: PoolClient;
		PoolConfig: PoolConfig;
	};
	export = pg;
}
