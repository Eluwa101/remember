import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../env";

export function verifyDashboardToken(token: string): { phone: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { phone: string };
  } catch {
    return null;
  }
}

export const requireDashboardAuth = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const decoded = verifyDashboardToken(authHeader.split(" ")[1]);
  if (!decoded) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  req.user = decoded; // Attach user to request
  next();
};
