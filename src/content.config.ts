import { defineCollection, reference } from "astro:content";
import { z } from "astro/zod";
import { glob, file } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: "./src/content/blog" }),
  schema: ({ image }) => z.object({
    title: z.string(),
    description: z.string(),
    descriptionAutomatic: z.boolean().optional(),
    date: z.coerce.date(),
    draft: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
    previewImage: z.string().optional(),
    featured: z.boolean().default(false),
    excerpt: z.string().optional(),
    cover: image().optional(),
    coverAlt: z.string().optional(),
    cities: z.array(reference("countries")).default([]),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: "./src/content/projects" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    draft: z.boolean().optional(),
    demoURL: z.string().optional(),
    repoURL: z.string().optional(),
  }),
});

const galleries = defineCollection({
  loader: glob({ pattern: '*.json', base: 'src/content/galleries' }),
  schema: ({ image }) =>
    z.object({
      images: z.array(
        z.object({
          src: image(),
          alt: z.string(),
          title: z.string(),
          description: z.string(),
        }),
      ),
    }),
});

const reviewFields = {
  title: z.string(),
  draft: z.boolean().default(false),
  date: z.coerce.date(),
  rating: z.number().int().min(1).max(5),
  url: z.url().optional(),
};
const books = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/books" }),
  schema: z.object({ ...reviewFields, author: z.string() }),
});
const games = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/games" }),
  schema: z.object({ ...reviewFields, year: z.number().int() }),
});
const movies = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/movies" }),
  schema: z.object({ ...reviewFields, year: z.number().int() }),
});
const countries = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/countries" }),
  schema: ({ image }) => z.object({ ...reviewFields, country: z.string(), flag: z.string(), favorite: z.boolean().default(false), photo: image().optional(), photoAlt: z.string().optional(), coordinates: z.preprocess(value => value === null || (Array.isArray(value) && value.length === 0) ? undefined : value, z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]).optional()) }),
});
const bookmarkItems = defineCollection({
  loader: file("src/content/bookmarkItems/items.json", {
    parser: (text) => JSON.parse(text).items.map((item: Record<string, unknown>, index: number) => ({ ...item, id: String(index) })),
  }),
  schema: z.object({ title: z.string(), url: z.url(), description: z.string().optional(), date: z.coerce.date(), tags: z.array(z.string()).default([]) }),
});

const pages = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/pages" }),
  schema: z.object({ title: z.string(), description: z.string(), updated: z.coerce.date(), draft: z.boolean().optional() }),
});

export const collections = { pages, blog, projects, galleries, books, games, movies, countries, bookmarkItems };
