import { gql } from 'graphql-tag';

export const typeDefs = gql`
  enum Status {
    pending
    succeeded
    failed
    canceled
  }

  type Query {
    getBookings(user_id: Int!): [Booking]
    viewBookings(user_id: Int!): [Booking]
    booking(id: ID!): Booking
  }
  
  type Mutation {
    createBooking(user_id: Int!, ride_id: Int!, price: Int!): Booking
  }

  type Booking {
    id: ID!
    ride_id: Int
    user_id: Int
    price: Int
    successful: Boolean
    status: Status
    # ride: Ride
  }

#   type Ride {
#     id: ID!
#     driverId: ID!
#     departureTime: String!
#     seatsAvailable: Int!
#   }
`;