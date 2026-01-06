import { defineCollection, z } from "astro:content";

const blog = defineCollection({
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.string(),
    tags: z.array(z.string()),
  }),
});

const books = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    author: z.string(),
    date: z.string(),
    rating: z.number().min(1).max(5),
    url: z.string().optional(),
  }),
});

const games = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    year: z.number(),
    date: z.string(),
    rating: z.number().min(1).max(5),
    url: z.string().optional(),
  }),
});

const movies = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    year: z.number(),
    date: z.string(),
    rating: z.number().min(1).max(5),
    url: z.string().optional(),
  }),
});

const countries = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    country: z.string(),
    date: z.string(),
    rating: z.number().min(1).max(5),
    flag: z.string(),
    favorite: z.boolean().optional(),
  }),
});

const bookmarks = defineCollection({
  type: 'data',
  schema: z.object({
    items: z.array(z.object({
      title: z.string(),
      url: z.string(),
      description: z.string().optional(),
      date: z.string(),
      tags: z.array(z.string()).optional(),
    })),
  }),
});

export const collections = { blog, books, games, movies, countries, bookmarks };
