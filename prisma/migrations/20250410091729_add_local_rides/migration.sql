-- CreateEnum
CREATE TYPE "RideStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELED');

-- CreateTable
CREATE TABLE "LocalRide" (
    "id" INTEGER NOT NULL,
    "driver_id" INTEGER NOT NULL,
    "departure_time" TIMESTAMP(3) NOT NULL,
    "seats_available" INTEGER NOT NULL,
    "status" "RideStatus" NOT NULL DEFAULT 'PENDING',
    "girls_only" BOOLEAN NOT NULL DEFAULT false,
    "to_giu" BOOLEAN NOT NULL,
    "area_id" INTEGER NOT NULL,

    CONSTRAINT "LocalRide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalRideMeetingPoint" (
    "id" SERIAL NOT NULL,
    "ride_id" INTEGER NOT NULL,
    "meeting_point_id" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "order_index" INTEGER NOT NULL,

    CONSTRAINT "LocalRideMeetingPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalRidePassenger" (
    "id" SERIAL NOT NULL,
    "ride_id" INTEGER NOT NULL,
    "passenger_id" INTEGER NOT NULL,
    "passenger_name" TEXT NOT NULL,

    CONSTRAINT "LocalRidePassenger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LocalRideMeetingPoint_ride_id_meeting_point_id_key" ON "LocalRideMeetingPoint"("ride_id", "meeting_point_id");

-- CreateIndex
CREATE UNIQUE INDEX "LocalRidePassenger_ride_id_passenger_id_key" ON "LocalRidePassenger"("ride_id", "passenger_id");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "LocalRide"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalRideMeetingPoint" ADD CONSTRAINT "LocalRideMeetingPoint_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "LocalRide"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalRidePassenger" ADD CONSTRAINT "LocalRidePassenger_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "LocalRide"("id") ON DELETE CASCADE ON UPDATE CASCADE;
