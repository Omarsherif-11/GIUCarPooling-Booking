
export const typeDefs = `

    enum Status {
        pending
        succeeded
        failed
        canceled
    }

    type Query {
        getBookings(user_id: Int!): [Booking]
        viewBookings(user_id: Int!): [Booking]
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
    }
`;