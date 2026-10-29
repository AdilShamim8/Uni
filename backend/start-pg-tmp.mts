// Start embedded PostgreSQL on 5432 for local backend dev verification.
import EmbeddedPostgres from 'embedded-postgres'

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: '/home/z/uni-test/pg-data',
    user: 'uni',
    password: 'uni_dev_change_me',
    port: 5432,
    persistent: true,
  })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('uni')
  console.log('PostgreSQL ready on 5432')
  setInterval(() => {}, 60000)
}
main().catch((e) => { console.error(e); process.exit(1) })
