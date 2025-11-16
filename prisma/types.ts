import type { Prisma } from "./client/browser";
export type { PrismaClient } from "./client/client";
export type PrismaPromise<T> = Prisma.PrismaPromise<T>;
export type {
  GetResult,
  DefaultArgs,
  Types,
  ITXClientDenyList
} from "@prisma/client/runtime/client";