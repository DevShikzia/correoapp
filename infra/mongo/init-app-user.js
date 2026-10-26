// Se ejecuta una sola vez, al inicializar el volumen de MongoDB.
// Crea un usuario con permisos solo sobre la base de la aplicación.
const database = process.env.MONGO_DATABASE;
const user = process.env.MONGO_APP_USER;
const password = process.env.MONGO_APP_PASSWORD;

if (!database || !user || !password) {
  throw new Error('Faltan MONGO_DATABASE, MONGO_APP_USER o MONGO_APP_PASSWORD');
}

db.getSiblingDB(database).createUser({
  user,
  pwd: password,
  roles: [{ role: 'readWrite', db: database }],
});
