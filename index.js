import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { typeDefs } from './graphql/schemas/bookingSchema.js';
import { resolvers } from './graphql/resolvers/bookingResolver.js';
import { prisma } from './db.js';
import { initKafka, disconnectKafka } from './kafka/index.js';
import { initConsumer, disconnectConsumer } from './kafka/consumer.js';

// Initialize Kafka
await initKafka();
await initConsumer();

const server = new ApolloServer({
  typeDefs,
  resolvers,
  introspection: true,
  plugins: [
    ApolloServerPluginLandingPageLocalDefault({
      embed: true,
      includeCookies: true,
    }),
  ],
});

const { url } = await startStandaloneServer(server, {
  listen: { port: 4001 },
  context: async () => ({ prisma })
});

console.log(`🚀 Booking service ready at ${url}`);
console.log(`📝 GraphQL Explorer available at ${url}`);

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  await disconnectKafka();
  await disconnectConsumer();
  process.exit(0);
});