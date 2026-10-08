import { MongoClient, type Db } from "mongodb";

const globalForMongo = globalThis as typeof globalThis & {
  mongoClient?: MongoClient;
};

export function getMongoClient() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set");
  }

  if (!globalForMongo.mongoClient) {
    globalForMongo.mongoClient = new MongoClient(uri);
  }

  return globalForMongo.mongoClient;
}

export function getDb(): Db {
  return getMongoClient().db();
}
