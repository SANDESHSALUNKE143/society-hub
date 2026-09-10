export type MysqlConnectOptions = {
  uri: string;
  connectTimeout: number;
  ssl?: { rejectUnauthorized: true };
};

/** Fail hung TiDB/MySQL connects before Render's 15-minute health window. */
export const MYSQL_CONNECT_TIMEOUT_MS = 20_000;

/** TiDB Cloud requires TLS. Local MySQL Workbench / Docker does not. */
export function mysqlConnectOptions(url: string): MysqlConnectOptions {
  const base: MysqlConnectOptions = {
    uri: url,
    connectTimeout: MYSQL_CONNECT_TIMEOUT_MS,
  };
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return base;
  }
  if (host.endsWith("tidbcloud.com")) {
    return { ...base, ssl: { rejectUnauthorized: true } };
  }
  return base;
}
