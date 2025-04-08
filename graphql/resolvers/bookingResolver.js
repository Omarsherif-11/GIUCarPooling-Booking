import { prisma } from "../../db.js";
import { typeDefs } from "../schemas/bookingSchema.js";
import { sendBookingCreatedEvent } from "../../kafka/index.js";

export const resolvers = {
    Query: {
        getBookings: async (_, {user_id}) => {
            //First param is parent, second is args
            return await prisma.booking.findMany({
                where: {
                    user_id: user_id
                }
            }
            );
        },

        viewBookings: async (_, {user_id}) => {
            //If user_id is an admin user
            return await prisma.booking.findMany();
            //Else return unauthorized
        }
    },

    Mutation: {
        createBooking: async (_, args) => {
            const {user_id, ride_id, price} = args;
            
            try {
                // Create booking with pending status
                const booking = await prisma.booking.create({
                    data: {
                        user_id,
                        ride_id,
                        price,
                        status: "pending" // Start with pending status
                    }
                });
                
                // Send event to Kafka and wait for result
                const result = await sendBookingCreatedEvent(booking);
                
                // If the result is not successful, throw an error
                if (result.status === 'failed') {
                    throw new Error(result.reason || 'Failed to add passenger to ride');
                }
                
                // Return the updated booking
                return await prisma.booking.findUnique({
                    where: { id: booking.id }
                });
            } catch (error) {
                console.error("Error creating booking:", error);
                throw new Error(`Failed to create booking: ${error.message}`);
            }
        }
    }
};