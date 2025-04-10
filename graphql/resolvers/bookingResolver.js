import { prisma } from "../../db.js";
import { typeDefs } from "../schemas/bookingSchema.js";
import { sendBookingCreatedEvent, sendBookingCanceledEvent, sendRideStatusUpdateEvent } from "../../kafka/index.js";
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
                
                // Create booking with PENDING status and meeting point ID
                // Fix: Use the enum value directly instead of a string
                const booking = await prisma.booking.create({
                    data: {
                        user_id,
                        ride_id,
                        meeting_point_id,
                        price,
                        status: "PENDING" // Changed from lowercase "pending" to uppercase "PENDING"
                    }
                });
                
                // Send event to Kafka for rides service to add passenger
                sendBookingCreatedEvent(booking).catch(error => {
                    console.error("Error sending booking event:", error);
                    
                    // If there's an error sending the event, update booking status to failed
                    prisma.booking.update({
                        where: { id: booking.id },
                        data: { status: "FAILED", successful: false }
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
        },

        cancelBooking: async (_, { id }) => {
            try {
                // Get the booking to check if it can be canceled
                const booking = await prisma.booking.findUnique({
                    where: { id },
                    include: { ride: true }
                });

                if (!booking) {
                    throw new Error("Booking not found");
                }

                if (booking.status === "CANCELLED") {
                    throw new Error("Booking is already cancelled");
                }

                if (booking.ride && booking.ride.status !== "PENDING") {
                    throw new Error("Cannot cancel booking for a ride that is already in progress or completed");
                }

                // Update booking status to canceled
                const updatedBooking = await prisma.booking.update({
                    where: { id },
                    data: { 
                        status: "CANCELLED",
                        successful: false
                    }
                });

                // Send event to Kafka for rides service to remove passenger
                sendBookingCanceledEvent(updatedBooking).catch(error => {
                    console.error("Error sending booking cancellation event:", error);
                });

                return updatedBooking;
            } catch (error) {
                console.error("Error canceling booking:", error);
                throw new Error(`Failed to cancel booking: ${error.message}`);
            }
        },

        updateRideStatus: async (_, { id, status }) => {
            try {
                // Check if ride exists
                const ride = await prisma.localRide.findUnique({
                    where: { id }
                });

                if (!ride) {
                    throw new Error("Ride not found");
                }

                // Validate status transition
                if (ride.status === "COMPLETED" && status !== "COMPLETED") {
                    throw new Error("Cannot change status of a completed ride");
                }

                if (ride.status === "CANCELLED" && status !== "CANCELLED") {
                    throw new Error("Cannot change status of a cancelled ride");
                }

                // Update ride status
                const updatedRide = await prisma.localRide.update({
                    where: { id },
                    data: { status }
                });

                // If ride is canceled, update all associated bookings
                if (status === "CANCELLED") {
                    await prisma.booking.updateMany({
                        where: { 
                            ride_id: id,
                            status: {
                                not: "CANCELLED"
                            }
                        },
                        data: { 
                            status: "CANCELLED",
                            successful: false
                        }
                    });
                }

                // Send event to Kafka for rides service to update status
                sendRideStatusUpdateEvent(updatedRide).catch(error => {
                    console.error("Error sending ride status update event:", error);
                });

                return updatedRide;
            } catch (error) {
                console.error("Error updating ride status:", error);
                throw new Error(`Failed to update ride status: ${error.message}`);
            }
        }
    }
};