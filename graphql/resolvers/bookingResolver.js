import { prisma } from "../../db.js";
import { typeDefs } from "../schemas/bookingSchema.js";

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
            return await prisma.booking.create({
                data: {
                    user_id,
                    ride_id,
                    price
                }
            })
        }
    }
};