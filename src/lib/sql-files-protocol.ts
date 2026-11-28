export const SQL_FILES_ANNOUNCE = 'ganymede.sql.files.v1';
export const SQL_FILES_CALLS = 'ganymede.sql.files.v1.calls';

export interface SqlReadRequest {
  id: number;
  op: 'read';
  path: string;
}

export interface SqlQueryRequest {
  id: number;
  op: 'sql';
  sql: string;
  loaded: string[];
}

export type SqlFilesRequest = SqlReadRequest | SqlQueryRequest;

export interface SqlFilesReply {
  id: number;
  /** File paths returned, in the same order as `buffers`. */
  names?: string[];
  /** True when no local data file matched or existed on disk. */
  skip?: boolean;
  /** Refusal (outside root or over the in-app memory limit) or read failure. */
  error?: string;
}
