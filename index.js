import { ApolloServer } from '@apollo/server';

import {startStandaloneServer} from '@apollo/server/standalone'

import { typeDefs } from './graphql/schemas/bookingSchema.js';

import { resolvers } from './graphql/resolvers/bookingResolver.js';

const server = new ApolloServer({typeDefs, resolvers});

const {url} = await startStandaloneServer(server, {
    listen: {port: process.env.PORT || 4000}
});

console.log(`server running at: ${url}`);

