path "secret/data/backend/*" {
  capabilities = ["read"]
}

# The API also needs the database password to build its DATABASE_URL
path "secret/data/db/*" {
  capabilities = ["read"]
}
