const express = require('express');

const {PrismaClient} = require('@prisma/client')

const prisma = new PrismaClient();

const app = express();

app.get('/', async (req, res) => {
    return res.status(200).json(await prisma.$queryRaw`SELECT now() as current_time`);
})

app.listen(3000, () => console.log('App running on port 3000'));