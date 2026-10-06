require("dotenv").config();

const { Client } = require("pg");

const client = new Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function test() {
  try {
    await client.connect();

    console.log("✅ Connected to Supabase!");

    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log(`Found ${result.rows.length} tables`);

    result.rows.forEach(row => {
      console.log(row.table_name);
    });

    await client.end();

  } catch (error) {
    console.error("❌ Connection failed:");
    console.error(error.message);
  }
}

test();