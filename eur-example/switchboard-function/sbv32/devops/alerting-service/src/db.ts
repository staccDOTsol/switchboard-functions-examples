import { Pool } from "pg";

let pool;

export async function dbInit() {
  pool = new Pool({
    host: process.env.DB_ENDPOINT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE_NAME,
    max: 5, // max idle connections, the default value is the same as `connectionLimit`
    idleTimeoutMillis: 60000, // idle connections timeout, in milliseconds, the default value 60000
  });
}

export async function getPagers(): Promise<any> {
  // Execute the SQL query
  const { rows } = await pool.execute(`
  SELECT to_watch.chain, to_watch.network, to_watch.type, to_watch.address, to_watch.silence_until, user.notification_config
  FROM to_watch
  JOIN user ON to_watch.user_id = user.user_id;
`);

  return rows;
}

export async function handlePagers(rows: any[]) {
  const result = rows.map((row) => {
    const silenceUntil = new Date(row.silence_until);
    const now = new Date();
    if (silenceUntil < now) {
      switch (row.type) {
        case "balance":
          break;
        case "lease":
          break;
        case "staleness":
          break;
        case "variance":
          break;
      }
    }
    // Do something with each row
    console.log(
      row.chain,
      row.network,
      row.type,
      row.address,
      row.notification_config
    );
  });
}
