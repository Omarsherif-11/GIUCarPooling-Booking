import { gql } from 'graphql-tag';

export const typeDefs = gql`
  enum Status {
    PENDING
    SUCCEEDED
    FAILED
    CANCELLED
  }

  enum RideStatus {
    PENDING
    IN_PROGRESS
    COMPLETED
    CANCELLED
  }

  type Query {
    getBookings: [Booking]
    viewBookings: [Booking]
    booking(id: ID!): Booking
    getAvailableRides: [Ride]
  }
  
  type Mutation {
    createBooking(ride_id: Int!, meeting_point_id: Int!): Booking
    cancelBooking(id: Int!): Booking
    updateRideStatus(id: Int!, status: RideStatus!): Ride
  }

  type Booking {
    id: ID!
    ride_id: Int
    user_id: Int
    price: Int
    successful: Boolean
    status: Status
    ride: Ride
  }

  type Ride {
    id: ID!
    driver_id: Int
    departure_time: String
    seats_available: Int
    status: RideStatus
    girls_only: Boolean
    to_giu: Boolean
    area_id: Int
    meeting_points: [RideMeetingPoint]
  }

  type RideMeetingPoint {
    id: ID!
    ride_id: Int
    meeting_point_id: Int
    price: Int
    order_index: Int
  }
`;