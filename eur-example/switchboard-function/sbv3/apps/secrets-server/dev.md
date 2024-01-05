#

Install the sqlx-cli crate:

```bash
cargo install sqlx-cli --no-default-features --features native-tls,postgres
```

**NOTE:** You may need to install postgres on your system

```bash
brew install postgresql
brew services start postgresql
```

1. Set the database url:

```bash
export DATABASE_URL="postgres://cllaefkd:LuJ-94yCzaa4OW2RbEpaDtmSQ_JX1qfl@mahmud.db.elephantsql.com/cllaefkd"
```

2. Create the database

```bash
sqlx db create
```

3. Run the sql migration

```bash
sqlx migrate run
```

4. Start the server

```bash
cargo run
```
