import { Request, Response } from "express";

/**
 * GET /api/hello
 *
 * This is an xscript handler. It runs on the server inside a Node VM sandbox.
 * Available globals: req, res, next, console, require, Buffer, fetch, process.env
 */
export default function handler(req: Request, res: Response) {
  const name = req.query.name ?? "World";
  res.json({ message: `Hello, ${name}!` });
}
