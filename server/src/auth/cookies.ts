import type { CookieSerializeOptions } from "@fastify/cookie";
import type { AuthConfig } from "../config.ts";

/** Atributos de la cookie `dt_session`: HttpOnly, SameSite=Lax, Secure según entorno, toda la ruta. */
export function cookieOptions(auth: AuthConfig): CookieSerializeOptions {
  return { httpOnly: true, secure: auth.cookieSecure, sameSite: "lax", path: "/" };
}
