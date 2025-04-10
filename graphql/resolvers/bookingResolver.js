import { prisma } from "../../db.js";
import { typeDefs } from "../schemas/bookingSchema.js";
import { sendBookingCreatedEvent } from "../../kafka/index.js";
import { RideService } from "../../services/rideService.js";

export const resolvers = {
    Query: {
        getBookings: async (_, {user_id}) => {
            //First param is parent, second is args
            return await prisma.booking.findMany({
                where: {
                    user_id: user_id
                }
            });
        },

        viewBookings: async (_, {user_id}) => {
            //If user_id is an admin user
            return await prisma.booking.findMany();
            //Else return unauthorized
        },
        
        getAvailableRides: async () => {
            const rideService = new RideService();
            return await rideService.getAvailableRides();
        }
    },

    Mutation: {
        createBooking: async (_, args) => {
            const {user_id, ride_id, meeting_point_id} = args;
            
            try {
                const rideService = new RideService();
                
                // Validate ride is available for booking locally
                const ride = await rideService.validateRideForBooking(ride_id, user_id);
                
                // Get price for the meeting point
                const price = await rideService.getPriceForMeetingPoint(ride_id, meeting_point_id);
                
                // Create booking with pending status and meeting point ID
                const booking = await prisma.booking.create({
                    data: {
                        user_id,
                        ride_id,
                        meeting_point_id,
                        price,
                        status: "pending" // Start with pending status
                    }
                });
                
                // Send event to Kafka for rides service to process
                sendBookingCreatedEvent(booking).catch(error => {
                    console.error("Error sending booking event:", error);
                    // If we can't send the event, mark the booking as failed
                    prisma.booking.update({
                        where: { id: booking.id },
                        data: { status: "failed", successful: false }
                    }).catch(err => {
                        console.error("Error updating booking status:", err);
                    });
                });
                
                // Return the booking immediately with pending status
                return booking;
            } catch (error) {
                console.error("Error creating booking:", error);
                throw new Error(`Failed to create booking: ${error.message}`);
            }
        }
    }
};