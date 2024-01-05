-- Deleting tables in the order that respects foreign key dependencies
DROP TABLE IF EXISTS mrenclaves_whitelist CASCADE;
DROP TABLE IF EXISTS mrenclaves CASCADE;
DROP TABLE IF EXISTS secrets CASCADE;
DROP TABLE IF EXISTS users CASCADE;