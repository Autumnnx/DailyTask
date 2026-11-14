import { type Algorithm, hash, parseOptions, verify } from "@node-rs/argon2";
import type { AuthConfig } from "../config.ts";

// `Algorithm` es un `const enum` ambiental (no utilizable con erasableSyntaxOnly): 2 = Argon2id.
const ARGON2ID = 2 as Algorithm;

/**
 * Hash y verificación de contraseñas con Argon2id (sal aleatoria de 16 bytes
 * generada por la librería; se guarda la cadena PHC completa).
 * La contraseña nunca se modifica (sin trim ni normalización).
 */
export class PasswordHasher {
  private readonly options;
  private dummyHash: Promise<string> | undefined;

  constructor(params: AuthConfig["argon2"]) {
    this.options = { algorithm: ARGON2ID, ...params };
  }

  hash(password: string): Promise<string> {
    return hash(password, this.options);
  }

  async verify(storedHash: string, password: string): Promise<boolean> {
    try {
      return await verify(storedHash, password);
    } catch {
      return false; // hash corrupto o con formato inesperado
    }
  }

  /**
   * Verificación contra un hash ficticio para usuarios inexistentes: iguala el
   * tiempo de respuesta y evita revelar qué nombres de usuario existen.
   */
  async verifyDummy(password: string): Promise<void> {
    this.dummyHash ??= this.hash("dailytask-dummy-password");
    await this.verify(await this.dummyHash, password);
  }

  /** ¿El hash se creó con parámetros más débiles que los actuales? */
  needsRehash(storedHash: string): boolean {
    try {
      const p = parseOptions(storedHash);
      return (
        p.algorithm !== ARGON2ID ||
        p.memoryCost < this.options.memoryCost ||
        p.timeCost < this.options.timeCost ||
        p.parallelism !== this.options.parallelism
      );
    } catch {
      return false;
    }
  }
}
