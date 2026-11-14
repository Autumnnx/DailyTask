import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hash } from "@node-rs/argon2";
import { PasswordHasher } from "../src/auth/password.ts";
import { isValidUsername, normalizeUsername, validateRegister } from "../src/auth/validation.ts";

const OWASP = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

describe("reglas de registro", () => {
  it("normaliza el username a minúsculas y sin espacios alrededor", () => {
    assert.equal(normalizeUsername("  KoRi.Dev_01 "), "kori.dev_01");
  });

  it("username: 3–30, [a-z0-9._-], empieza y termina con letra o número", () => {
    for (const ok of ["abc", "a.b", "kori-dev", "user_01", "a".repeat(30), "123"]) assert.ok(isValidUsername(ok), ok);
    for (const ko of ["ab", "a".repeat(31), "_abc", "abc.", "-abc", "con espacio", "ñandu", "user@x", ""]) {
      assert.ok(!isValidUsername(ko), ko);
    }
  });

  it("contraseña: solo se exige longitud 6–128; sin reglas de complejidad", () => {
    const base = { username: "valido", name: "Nombre" };
    for (const password of ["000000", "123456", "aaaaaa", "abc123", "      ", "x".repeat(128)]) {
      assert.deepEqual(validateRegister({ ...base, password }).fields, {}, password);
    }
    for (const password of ["00000", "", "x".repeat(129)]) {
      assert.ok(validateRegister({ ...base, password }).fields.password, password);
    }
  });

  it("la contraseña no se recorta ni modifica", () => {
    assert.equal(validateRegister({ username: "valido", name: "Nombre", password: "  clave  " }).value.password, "  clave  ");
  });

  it("nombre visible: 2–100 tras recortar espacios", () => {
    const base = { username: "valido", password: "123456" };
    assert.equal(validateRegister({ ...base, name: "  Jo  " }).value.name, "Jo");
    assert.ok(validateRegister({ ...base, name: " J " }).fields.name);
    assert.ok(validateRegister({ ...base, name: "x".repeat(101) }).fields.name);
    assert.deepEqual(validateRegister({ ...base, name: "x".repeat(100) }).fields, {});
  });
});

describe("hash de contraseñas (Argon2id)", () => {
  const hasher = new PasswordHasher(OWASP);

  it("genera cadenas PHC Argon2id con los parámetros configurados y sal aleatoria", async () => {
    const a = await hasher.hash("000000");
    const b = await hasher.hash("000000");
    assert.match(a, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    assert.notEqual(a, b, "la sal debe ser distinta en cada hash");
    assert.ok(!a.includes("000000"));
  });

  it("verifica la contraseña exacta (sin recortar) y rechaza las demás", async () => {
    const stored = await hasher.hash(" clave ");
    assert.equal(await hasher.verify(stored, " clave "), true);
    assert.equal(await hasher.verify(stored, "clave"), false);
    assert.equal(await hasher.verify("no-es-un-hash", "clave"), false);
  });

  it("detecta hashes con parámetros más débiles (rehash)", async () => {
    assert.equal(hasher.needsRehash(await hasher.hash("x12345")), false);
    const weak = await hash("x12345", { memoryCost: 8_192, timeCost: 1, parallelism: 1 });
    assert.equal(hasher.needsRehash(weak), true);
  });
});
