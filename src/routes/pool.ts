import { FastifyInstance } from "fastify";
import ShortUniqueId from "short-unique-id";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate } from "../plugins/authenticate";
import { userRoutes } from "./user";

export async function poolRoutes(fastify: FastifyInstance) {
    fastify.get('/pools/count', async () => {
        const count = await prisma.pool.count()

        return { count }
    })

    fastify.post('/pools', async (request, reply) => {
        const generator = new ShortUniqueId({ length: 6 })
        const PoolRequestBody = z.object({
            title: z.string()
        })

        const code = String(generator()).toUpperCase();
        const { title } = PoolRequestBody.parse(request.body);

        try {
            await request.jwtVerify()

            await prisma.pool.create({
                data: {
                    code,
                    title,
                    ownerId: request.user.sub,

                    participants: {
                        create: {
                            userId: request.user.sub
                        }
                    }
                }
            })
        } catch {
            await prisma.pool.create({
                data: {
                    code,
                    title
                }
            })
        }

        return reply.status(201).send({ code })
    })

    fastify.post('/pools/:id/join', { onRequest: [authenticate] }, async (request, reply) => {

        const joinPoolBody = z.object({
            code: z.string()
        })

        const { code } = joinPoolBody.parse(request.body)

        const pool = await prisma.pool.findUnique({
            where: {
                code,
            },
            include: {
                participants: {
                    where: {
                        userId: request.user.sub
                    }
                }
            }
        })

        if (!pool) {
            return reply.status(400).send({
                message: 'Pool not found!'
            })
        }

        if (pool.participants.length > 0) {
            return reply.status(400).send({
                message: 'You already joined on this Pool!'
            })
        }

        if (!pool.ownerId) {
            await prisma.pool.update({
                where: {
                    id: pool.id
                },
                data: {
                    ownerId: request.user.sub
                }
            })
        }

        await prisma.participant.create({
            data: {
                poolId: pool.id,
                userId: request.user.sub,
            }
        })

        return reply.status(201).send()
    })

    fastify.get('/pools', { onRequest: [authenticate] }, async (request) => {
        const pools = await prisma.pool.findMany({
            where: {
                participants: {
                    some: {
                        userId: request.user.sub
                    }
                }
            },
            include: {
                _count: {
                    select: {
                        participants: true
                    }
                },
                participants: {
                    select: {
                        id: true,

                        user: {
                            select: {
                                avatarURL: true
                            }
                        }
                    },
                    take: 4
                },
                owner: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        })

        return { pools }
    })
}