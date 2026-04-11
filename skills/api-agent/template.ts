export function apiHandlerTemplate(resource: string): string {
  const Resource = resource.charAt(0).toUpperCase() + resource.slice(1);

  return `import type { Request, Response } from "express";

interface ${Resource} {
  id: string;
  // TODO: add fields
  createdAt: Date;
  updatedAt: Date;
}

interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  status: number;
}

/** GET /api/${resource} */
export async function getAll${Resource}s(req: Request, res: Response): Promise<void> {
  try {
    // TODO: fetch from DB
    const items: ${Resource}[] = [];
    res.json({ data: items, error: null, status: 200 } satisfies ApiResponse<${Resource}[]>);
  } catch (error) {
    res.status(500).json({ data: null, error: "Failed to fetch ${resource}s", status: 500 });
  }
}

/** GET /api/${resource}/:id */
export async function get${Resource}ById(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    // TODO: fetch by id
    res.json({ data: null, error: null, status: 200 });
  } catch {
    res.status(404).json({ data: null, error: "${Resource} not found", status: 404 });
  }
}

/** POST /api/${resource} */
export async function create${Resource}(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body;
    // TODO: validate + create
    res.status(201).json({ data: body, error: null, status: 201 });
  } catch (error) {
    res.status(400).json({ data: null, error: "Invalid request body", status: 400 });
  }
}

/** DELETE /api/${resource}/:id */
export async function delete${Resource}(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    // TODO: delete by id
    res.json({ data: { id }, error: null, status: 200 });
  } catch {
    res.status(404).json({ data: null, error: "${Resource} not found", status: 404 });
  }
}
`;
}
