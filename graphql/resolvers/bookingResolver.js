import { prisma } from "../../db.js";
import { typeDefs } from "../schemas/bookingSchema.js";
import { sendBookingCreatedEvent, sendBookingCanceledEvent, sendRideStatusUpdateEvent } from "../../kafka/index.js";
import { RideService } from "../../services/rideService.js";
import { NotificationService } from "../../services/notificationService.js";

// Initialize notification service
const notificationService = new NotificationService();

export const resolvers = {
    Query: {
        getBookings: async (_, __, context) => {
            if (!context.user) {
                throw new Error("Not authenticated");
            }
            return await prisma.booking.findMany({
                where: {
                    user_id: context.user.id
                },
                include: {
                    ride: true
                }
            });
        },

        viewBookings: async (_, __, context) => {
            if (!context.user || !context.user.isAdmin) {
                throw new Error("Not authorized");
            }
            return await prisma.booking.findMany();
        },

        booking: async (_, { id }, context) => {
            if (!context.user) {
                throw new Error("Not authenticated");
            }
            try {
                const booking = await prisma.booking.findUnique({
                    where: { id: parseInt(id) },
                    include: { ride: true }
                });
                
                if (!booking) {
                    throw new Error("Booking not found");
                }

                // Only allow access if user is admin or the booking belongs to them
                if (!context.user.isAdmin && booking.user_id !== context.user.id) {
                    throw new Error("Not authorized to view this booking");
                }
                
                return booking;
            } catch (error) {
                console.error("Error fetching booking:", error);
                throw new Error(`Failed to fetch booking: ${error.message}`);
            }
        },
        
        getAvailableRides: async () => {
            const rideService = new RideService();
            return await rideService.getAvailableRides();
        },
    },

    Mutation: {
        createBooking: async (_, { ride_id, meeting_point_id }, context) => {
            if (!context.user) {
                throw new Error("Not authenticated");
            }
            
            try {
                const rideService = new RideService();
                
                // Validate ride is available for booking locally
                const ride = await rideService.validateRideForBooking(ride_id, context.user.id);
                
                // Get price for the meeting point
                const price = await rideService.getPriceForMeetingPoint(ride_id, meeting_point_id);
                
                // Create booking with PENDING status and meeting point ID
                const booking = await prisma.booking.create({
                    data: {
                        user_id: context.user.id,
                        ride_id,
                        meeting_point_id,
                        price,
                        status: "PENDING"
                    }
                });
                
                // Send event to Kafka for rides service to add passenger
                // Pass the user object from context to include email
                sendBookingCreatedEvent(booking, context.user).catch(error => {
                    console.error("Error sending booking event:", error);
                    
                    // If there's an error sending the event, update booking status to failed
                    prisma.booking.update({
                        where: { id: booking.id },
                        data: { status: "FAILED", successful: false }
                    }).catch(err => {
                        console.error("Error updating booking status:", err);
                    });
                    
                    // Send booking failed notification
                    const meetingPoint = { name: "Selected Meeting Point" }; // Default value
                    notificationService.sendBookingFailed(booking, context.user, ride, meetingPoint, "Failed to process booking request");
                });
                
                return booking;
            } catch (error) {
                console.error("Error creating booking:", error);
                throw new Error(`Failed to create booking: ${error.message}`);
            }
        },

        cancelBooking: async (_, { id }, context) => {
            if (!context.user) {
                throw new Error("Not authenticated");
            }

            try {
                // Get the booking to check if it can be canceled
                const booking = await prisma.booking.findUnique({
                    where: { id },
                    include: { ride: true }
                });

                if (!booking) {
                    throw new Error("Booking not found");
                }

                // Only allow cancellation if user is admin or the booking belongs to them
                if (!context.user.isAdmin && booking.user_id !== context.user.id) {
                    throw new Error("Not authorized to cancel this booking");
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
                
                // Get meeting point details for notification
                const meetingPoint = await prisma.meetingPoint.findUnique({
                    where: { id: booking.meeting_point_id }
                }).catch(() => ({ name: "Selected Meeting Point" })); // Default if not found
                
                // Send booking cancellation notification
                notificationService.sendBookingCancellation(updatedBooking, context.user, booking.ride, meetingPoint);

                return updatedBooking;
            } catch (error) {
                console.error("Error canceling booking:", error);
                throw new Error(`Failed to cancel booking: ${error.message}`);
            }
        },

        updateRideStatus: async (_, { id, status }, context) => {
            if (!context.user || !context.user.isDriver) {
                throw new Error("Not authorized");
            }

            try {
                // Check if ride exists
                const ride = await prisma.localRide.findUnique({
                    where: { id }
                });

                if (!ride) {
                    throw new Error("Ride not found");
                }

                // Only allow driver of the ride to update status
                if (ride.driver_id !== context.user.id) {
                    throw new Error("Not authorized to update this ride");
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