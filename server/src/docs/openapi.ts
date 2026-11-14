/**
 * Especificación OpenAPI 3.1 de la API de DailyTask, escrita a partir del código real
 * (rutas, esquemas, validaciones y errores). Se sirve en /openapi.json y la muestra /api-docs.
 *
 * Una prueba (test/docs.test.ts) comprueba que cada ruta registrada en Fastify aparece aquí
 * y al revés. Los límites indicados son los valores por defecto (configurables en el servidor).
 */

const json = (schema: object, example?: unknown) => ({
  "application/json": { schema, ...(example === undefined ? {} : { example }) },
});

const errorExample = (code: string, message: string, extra: object = {}) => ({ error: { code, message, ...extra } });

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const response = (name: string) => ({ $ref: `#/components/responses/${name}` });

const TASK_EXAMPLE = {
  id: "3f1c2b7e-9a41-4d2c-8b5e-0c6f1a2d9e10",
  title: "Entregar informe de Redes",
  description: "Incluir las capturas de la práctica",
  dueDate: "2026-12-01",
  priority: "alta",
  status: "pendiente",
  createdAt: "2026-11-14T09:30:00.000Z",
  updatedAt: "2026-11-14T09:30:00.000Z",
  completedAt: null,
};

const USER_EXAMPLE = { id: "8b0e4c1a-5d2f-4a7b-9c3e-1f2a3b4c5d6e", username: "ana.dev", name: "Ana" };

const SET_COOKIE_HEADER = {
  "Set-Cookie": {
    description:
      "Cookie de sesión `dt_session=<token>; Path=/; Expires=<+30 días>; HttpOnly; SameSite=Lax; Secure`. El token es opaco y solo se guarda su SHA-256 en el servidor.",
    schema: { type: "string" },
  },
};

const MUTATION_NOTE =
  "Petición que modifica datos: exige la cabecera `Origin` del sitio (si falta o es ajena → 403 `FORBIDDEN_ORIGIN`) y, si lleva cuerpo, `Content-Type: application/json` (si no → 415). El navegador envía `Origin` automáticamente.";

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "DailyTask API",
    version: "1.0.0",
    description: [
      "API REST de DailyTask: cuentas, sesiones y tareas personales.",
      "",
      "**Es la API del propio frontend de DailyTask, no una API pública para terceros.** Comparte origen con la aplicación, se autentica con una cookie `HttpOnly` y rechaza peticiones que modifican datos desde otros orígenes. Esta documentación es de consulta: no permite ejecutar peticiones.",
      "",
      "### Autenticación",
      "1. `POST /api/auth/register` o `POST /api/auth/login` crean una sesión y devuelven la cookie `dt_session` (`HttpOnly`, `SameSite=Lax`, `Secure` en producción).",
      "2. El navegador envía la cookie en las peticiones siguientes; el usuario se obtiene siempre de la sesión, nunca de datos enviados por el cliente.",
      "3. La sesión caduca tras 7 días sin actividad o, como máximo, a los 30 días. `POST /api/auth/logout` la revoca.",
      "",
      "### Reglas comunes",
      "- Cuerpos y respuestas en JSON (UTF-8). Cuerpo máximo: 16 KiB (413).",
      "- Validación estricta: propiedades desconocidas o tipos incorrectos → 400 `VALIDATION_ERROR`, sin conversión implícita de tipos.",
      "- Peticiones que modifican datos (POST, PUT, PATCH, DELETE): `Origin` permitido obligatorio (403) y solo JSON (415).",
      "- Límite global: 300 peticiones por minuto e IP (429, con `Retry-After`).",
      "- Si la base de datos no está disponible → 503 `UNAVAILABLE`.",
      "- Los errores no incluyen detalles internos.",
      "",
      "### Formato de error",
      "```json",
      '{ "error": { "code": "VALIDATION_ERROR", "message": "Revisa los campos marcados.", "fields": { "title": "El título necesita al menos 3 caracteres." } } }',
      "```",
    ].join("\n"),
  },
  servers: [{ url: "/", description: "Mismo origen que la aplicación" }],
  tags: [
    { name: "Salud", description: "Estado del servicio." },
    { name: "Autenticación", description: "Registro, inicio y cierre de sesión, usuario actual." },
    {
      name: "Tareas",
      description:
        "Tareas del usuario autenticado. Todas las rutas requieren sesión. Una tarea de otro usuario responde 404, igual que una inexistente. Máximo 1.000 tareas por usuario.",
    },
  ],
  paths: {
    "/api/health": {
      get: {
        tags: ["Salud"],
        operationId: "getHealth",
        summary: "Estado del servicio",
        description: "Comprueba que el proceso responde y que la base de datos contesta a una consulta simple. Sin autenticación. Respuesta no cacheable.",
        security: [],
        responses: {
          "200": { description: "Servicio y base de datos disponibles.", content: json(ref("Health"), { status: "ok" }) },
          "429": response("RateLimited"),
          "503": response("Unavailable"),
        },
      },
    },
    "/api/auth/register": {
      post: {
        tags: ["Autenticación"],
        operationId: "register",
        summary: "Crear una cuenta",
        description: [
          "Crea la cuenta e inicia sesión (devuelve la cookie). Si la petición ya traía una sesión, se revoca y se crea una nueva.",
          "",
          "- `username`: se normaliza (sin espacios alrededor y en minúsculas) y después debe tener 3–30 caracteres: letras ASCII, números, `.`, `-` o `_`, empezando y terminando con letra o número. Único sin distinguir mayúsculas.",
          "- `name`: 2–100 caracteres tras recortar espacios.",
          "- `password`: **solo** se exige longitud de 6 a 128 caracteres; no se recorta ni hay reglas de complejidad. Se guarda con Argon2id.",
          "",
          "Límite: 5 registros por minuto e IP.",
          "",
          MUTATION_NOTE,
        ].join("\n"),
        security: [],
        parameters: [{ $ref: "#/components/parameters/Origin" }],
        requestBody: {
          required: true,
          content: json(ref("RegisterInput"), { username: "Ana.Dev", name: "Ana", password: "000000" }),
        },
        responses: {
          "201": { description: "Cuenta creada y sesión iniciada.", headers: SET_COOKIE_HEADER, content: json(ref("UserResponse"), { user: USER_EXAMPLE }) },
          "400": response("ValidationError"),
          "403": response("ForbiddenOrigin"),
          "409": {
            description: "El nombre de usuario ya existe.",
            content: json(ref("Error"), errorExample("USERNAME_TAKEN", "Ese nombre de usuario ya está en uso.", { fields: { username: "Ese nombre de usuario ya está en uso." } })),
          },
          "413": response("PayloadTooLarge"),
          "415": response("UnsupportedMediaType"),
          "429": response("RateLimited"),
          "503": response("Unavailable"),
        },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["Autenticación"],
        operationId: "login",
        summary: "Iniciar sesión",
        description: [
          "Verifica usuario y contraseña y crea una sesión nueva (la anterior de la cookie, si existía, se revoca). El `username` se normaliza igual que en el registro.",
          "",
          "La respuesta de error es idéntica si el usuario no existe, si la contraseña es incorrecta o si el formato del usuario no es válido.",
          "",
          "Límites: 10 intentos por minuto e IP, y 5 por minuto por nombre de usuario (cuentan todos los intentos).",
          "",
          MUTATION_NOTE,
        ].join("\n"),
        security: [],
        parameters: [{ $ref: "#/components/parameters/Origin" }],
        requestBody: { required: true, content: json(ref("LoginInput"), { username: "ana.dev", password: "000000" }) },
        responses: {
          "200": { description: "Sesión iniciada.", headers: SET_COOKIE_HEADER, content: json(ref("UserResponse"), { user: USER_EXAMPLE }) },
          "400": {
            description: "Campos vacíos o con tipo incorrecto.",
            content: json(ref("Error"), errorExample("VALIDATION_ERROR", "Revisa los campos marcados.", { fields: { username: "Escribe tu nombre de usuario.", password: "Escribe tu contraseña." } })),
          },
          "401": {
            description: "Credenciales incorrectas (mensaje genérico).",
            content: json(ref("Error"), errorExample("INVALID_CREDENTIALS", "Usuario o contraseña incorrectos.")),
          },
          "403": response("ForbiddenOrigin"),
          "413": response("PayloadTooLarge"),
          "415": response("UnsupportedMediaType"),
          "429": response("RateLimited"),
          "503": response("Unavailable"),
        },
      },
    },
    "/api/auth/logout": {
      post: {
        tags: ["Autenticación"],
        operationId: "logout",
        summary: "Cerrar sesión",
        description: `Revoca la sesión de la cookie en el servidor y la borra en el navegador. Sin cuerpo. Idempotente: sin sesión también responde 204.\n\n${MUTATION_NOTE}`,
        security: [{}, { sessionCookie: [] }],
        parameters: [{ $ref: "#/components/parameters/Origin" }],
        responses: {
          "204": {
            description: "Sesión cerrada (la cookie se borra con `Set-Cookie: dt_session=; Expires=<pasado>`).",
            headers: { "Set-Cookie": { description: "Borra la cookie `dt_session`.", schema: { type: "string" } } },
          },
          "403": response("ForbiddenOrigin"),
          "429": response("RateLimited"),
          "503": response("Unavailable"),
        },
      },
    },
    "/api/auth/me": {
      get: {
        tags: ["Autenticación"],
        operationId: "getCurrentUser",
        summary: "Usuario de la sesión",
        description: "Devuelve el usuario autenticado. Renueva la caducidad por inactividad de la sesión. Si la cookie es inválida o ha caducado, responde 401 y la borra.",
        security: [{ sessionCookie: [] }],
        responses: {
          "200": { description: "Usuario autenticado.", content: json(ref("UserResponse"), { user: USER_EXAMPLE }) },
          "401": response("Unauthenticated"),
          "429": response("RateLimited"),
          "503": response("Unavailable"),
        },
      },
    },
    "/api/tasks": {
      get: {
        tags: ["Tareas"],
        operationId: "listTasks",
        summary: "Listar tareas",
        description:
          "Devuelve todas las tareas del usuario (sin paginación; el máximo es 1.000), ordenadas por fecha de vencimiento ascendente y, a igual fecha, por prioridad alta → baja. Filtros opcionales. Cualquier otro parámetro de consulta → 400.",
        security: [{ sessionCookie: [] }],
        parameters: [
          { name: "status", in: "query", required: false, description: "Filtrar por estado.", schema: ref("Status") },
          { name: "priority", in: "query", required: false, description: "Filtrar por prioridad.", schema: ref("Priority") },
          {
            name: "q",
            in: "query",
            required: false,
            description: "Texto a buscar en título o descripción, sin distinguir mayúsculas ni tildes. `%`, `_` y `\\` se buscan literalmente. Se recorta; vacío = sin filtro.",
            schema: { type: "string", maxLength: 100 },
          },
        ],
        responses: {
          "200": { description: "Tareas del usuario.", content: json(ref("TaskListResponse"), { tasks: [TASK_EXAMPLE] }) },
          "400": response("ValidationError"),
          "401": response("Unauthenticated"),
          "429": response("RateLimited"),
          "503": response("Unavailable"),
        },
      },
      post: {
        tags: ["Tareas"],
        operationId: "createTask",
        summary: "Crear tarea",
        description: [
          "Crea una tarea. El servidor genera `id`, `createdAt` y `updatedAt`; `completedAt` se fija solo si `status` es `completada`.",
          "",
          "Límite: 1.000 tareas por usuario, comprobado de forma segura incluso con peticiones simultáneas. Al alcanzarlo → 409 `TASK_LIMIT_REACHED`.",
          "",
          MUTATION_NOTE,
        ].join("\n"),
        security: [{ sessionCookie: [] }],
        parameters: [{ $ref: "#/components/parameters/Origin" }],
        requestBody: {
          required: true,
          content: json(ref("TaskInput"), { title: "Entregar informe de Redes", description: "Incluir las capturas de la práctica", dueDate: "2026-12-01", priority: "alta", status: "pendiente" }),
        },
        responses: {
          "201": {
            description: "Tarea creada.",
            headers: { Location: { description: "`/api/tasks/{id}` de la tarea creada.", schema: { type: "string" } } },
            content: json(ref("TaskResponse"), { task: TASK_EXAMPLE }),
          },
          "400": response("TaskValidationError"),
          "401": response("Unauthenticated"),
          "403": response("ForbiddenOrigin"),
          "409": {
            description: "Se alcanzó el máximo de tareas.",
            content: json(ref("Error"), errorExample("TASK_LIMIT_REACHED", "Has alcanzado el máximo de 1000 tareas. Elimina alguna para crear una nueva.", { limit: 1000 })),
          },
          "413": response("PayloadTooLarge"),
          "415": response("UnsupportedMediaType"),
          "429": response("RateLimited"),
          "503": response("Unavailable"),
        },
      },
    },
    "/api/tasks/{id}": {
      parameters: [{ $ref: "#/components/parameters/TaskId" }],
      get: {
        tags: ["Tareas"],
        operationId: "getTask",
        summary: "Obtener una tarea",
        security: [{ sessionCookie: [] }],
        responses: {
          "200": { description: "La tarea.", content: json(ref("TaskResponse"), { task: TASK_EXAMPLE }) },
          "401": response("Unauthenticated"),
          "404": response("TaskNotFound"),
          "429": response("RateLimited"),
          "503": response("Unavailable"),
        },
      },
      put: {
        tags: ["Tareas"],
        operationId: "updateTask",
        summary: "Editar una tarea",
        description: [
          "Reemplaza los campos editables (edición completa). `updatedAt` = ahora.",
          "",
          "`completedAt`: se **conserva** si la tarea ya estaba completada y sigue así; se fija a ahora si pasa a `completada`; se anula si deja de estarlo.",
          "",
          MUTATION_NOTE,
        ].join("\n"),
        security: [{ sessionCookie: [] }],
        parameters: [{ $ref: "#/components/parameters/Origin" }],
        requestBody: {
          required: true,
          content: json(ref("TaskInput"), { title: "Entregar informe de Redes", description: "", dueDate: "2026-12-02", priority: "media", status: "en_progreso" }),
        },
        responses: {
          "200": { description: "Tarea actualizada.", content: json(ref("TaskResponse"), { task: { ...TASK_EXAMPLE, status: "en_progreso" } }) },
          "400": response("TaskValidationError"),
          "401": response("Unauthenticated"),
          "403": response("ForbiddenOrigin"),
          "404": response("TaskNotFound"),
          "413": response("PayloadTooLarge"),
          "415": response("UnsupportedMediaType"),
          "429": response("RateLimited"),
          "503": response("Unavailable"),
        },
      },
      delete: {
        tags: ["Tareas"],
        operationId: "deleteTask",
        summary: "Eliminar una tarea",
        description: `Eliminación definitiva.\n\n${MUTATION_NOTE}`,
        security: [{ sessionCookie: [] }],
        parameters: [{ $ref: "#/components/parameters/Origin" }],
        responses: {
          "204": { description: "Tarea eliminada." },
          "401": response("Unauthenticated"),
          "403": response("ForbiddenOrigin"),
          "404": response("TaskNotFound"),
          "429": response("RateLimited"),
          "503": response("Unavailable"),
        },
      },
    },
    "/api/tasks/{id}/status": {
      parameters: [{ $ref: "#/components/parameters/TaskId" }],
      patch: {
        tags: ["Tareas"],
        operationId: "changeTaskStatus",
        summary: "Cambiar el estado (completar o reabrir)",
        description: [
          "Cambia solo el estado. Sirve para completar (`completada`) y reabrir (`pendiente` o `en_progreso`). `updatedAt` = ahora.",
          "",
          "`completedAt`: se fija a ahora si el nuevo estado es `completada` (**aunque ya lo estuviera**, a diferencia de la edición completa); en otro caso se anula.",
          "",
          MUTATION_NOTE,
        ].join("\n"),
        security: [{ sessionCookie: [] }],
        parameters: [{ $ref: "#/components/parameters/Origin" }],
        requestBody: { required: true, content: json(ref("TaskStatusInput"), { status: "completada" }) },
        responses: {
          "200": {
            description: "Estado actualizado.",
            content: json(ref("TaskResponse"), { task: { ...TASK_EXAMPLE, status: "completada", completedAt: "2026-11-14T10:00:00.000Z", updatedAt: "2026-11-14T10:00:00.000Z" } }),
          },
          "400": response("ValidationError"),
          "401": response("Unauthenticated"),
          "403": response("ForbiddenOrigin"),
          "404": response("TaskNotFound"),
          "413": response("PayloadTooLarge"),
          "415": response("UnsupportedMediaType"),
          "429": response("RateLimited"),
          "503": response("Unavailable"),
        },
      },
    },
  },
  components: {
    securitySchemes: {
      sessionCookie: {
        type: "apiKey",
        in: "cookie",
        name: "dt_session",
        description: "Cookie de sesión `HttpOnly` creada por `register` o `login`. El navegador la gestiona; el código JavaScript no puede leerla.",
      },
    },
    parameters: {
      Origin: {
        name: "Origin",
        in: "header",
        required: false,
        description:
          "Origen del sitio. Obligatorio en peticiones que modifican datos: si falta (salvo `Sec-Fetch-Site: same-origin`), es `null` o no está permitido → 403. El navegador lo envía solo.",
        schema: { type: "string" },
        example: "https://dailytask.korikashi.uk",
      },
      TaskId: {
        name: "id",
        in: "path",
        required: true,
        description: "UUID de la tarea. Un valor que no sea un UUID responde 404, igual que una tarea inexistente o de otro usuario.",
        schema: { type: "string", format: "uuid" },
      },
    },
    schemas: {
      Priority: { type: "string", enum: ["alta", "media", "baja"] },
      Status: { type: "string", enum: ["pendiente", "en_progreso", "completada"] },
      Health: {
        type: "object",
        properties: { status: { type: "string", const: "ok" } },
        required: ["status"],
        additionalProperties: false,
      },
      User: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          username: { type: "string", description: "Normalizado en minúsculas." },
          name: { type: "string", description: "Nombre visible." },
        },
        required: ["id", "username", "name"],
        additionalProperties: false,
      },
      UserResponse: {
        type: "object",
        properties: { user: ref("User") },
        required: ["user"],
        additionalProperties: false,
      },
      RegisterInput: {
        type: "object",
        properties: {
          username: {
            type: "string",
            maxLength: 100,
            description: "Tras normalizar (trim y minúsculas): 3–30 caracteres que cumplan `^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$`.",
          },
          name: { type: "string", maxLength: 300, description: "2–100 caracteres tras recortar espacios." },
          password: { type: "string", minLength: 6, maxLength: 128, description: "6–128 caracteres. Sin reglas de complejidad; no se recorta." },
        },
        required: ["username", "name", "password"],
        additionalProperties: false,
      },
      LoginInput: {
        type: "object",
        properties: {
          username: { type: "string", maxLength: 100, description: "Se normaliza (trim y minúsculas). No puede quedar vacío." },
          password: { type: "string", maxLength: 1024, description: "No puede estar vacía." },
        },
        required: ["username", "password"],
        additionalProperties: false,
      },
      Task: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          title: { type: "string" },
          description: { type: "string" },
          dueDate: { type: "string", format: "date", description: "Fecha de calendario `YYYY-MM-DD` (sin zona horaria)." },
          priority: ref("Priority"),
          status: ref("Status"),
          createdAt: { type: "string", format: "date-time", description: "ISO 8601 en UTC." },
          updatedAt: { type: "string", format: "date-time", description: "ISO 8601 en UTC." },
          completedAt: { type: ["string", "null"], format: "date-time", description: "Fecha de finalización o `null`." },
        },
        required: ["id", "title", "description", "dueDate", "priority", "status", "createdAt", "updatedAt", "completedAt"],
        additionalProperties: false,
      },
      TaskInput: {
        type: "object",
        properties: {
          title: { type: "string", maxLength: 1000, description: "3–80 caracteres tras recortar espacios." },
          description: { type: "string", maxLength: 4000, description: "Opcional (por defecto `\"\"`). Hasta 400 caracteres tras recortar espacios." },
          dueDate: {
            type: "string",
            maxLength: 32,
            description: "`YYYY-MM-DD` y fecha real entre 1970-01-01 y 9999-12-31 (`2026-02-30` se rechaza). Se admiten fechas pasadas.",
          },
          priority: ref("Priority"),
          status: ref("Status"),
        },
        required: ["title", "dueDate", "priority", "status"],
        additionalProperties: false,
      },
      TaskStatusInput: {
        type: "object",
        properties: { status: ref("Status") },
        required: ["status"],
        additionalProperties: false,
      },
      TaskResponse: { type: "object", properties: { task: ref("Task") }, required: ["task"], additionalProperties: false },
      TaskListResponse: {
        type: "object",
        properties: { tasks: { type: "array", items: ref("Task") } },
        required: ["tasks"],
        additionalProperties: false,
      },
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: {
                type: "string",
                enum: [
                  "BAD_REQUEST",
                  "VALIDATION_ERROR",
                  "UNAUTHENTICATED",
                  "INVALID_CREDENTIALS",
                  "FORBIDDEN_ORIGIN",
                  "NOT_FOUND",
                  "USERNAME_TAKEN",
                  "TASK_LIMIT_REACHED",
                  "PAYLOAD_TOO_LARGE",
                  "UNSUPPORTED_MEDIA_TYPE",
                  "RATE_LIMITED",
                  "REQUEST_TIMEOUT",
                  "INTERNAL",
                  "UNAVAILABLE",
                ],
              },
              message: { type: "string", description: "Mensaje en español, apto para mostrar al usuario." },
              fields: {
                type: "object",
                additionalProperties: { type: "string" },
                description: "Errores por campo (solo en errores de validación y en `USERNAME_TAKEN`).",
              },
              limit: { type: "integer", description: "Solo en `TASK_LIMIT_REACHED`: máximo de tareas por usuario." },
            },
            required: ["code", "message"],
          },
        },
        required: ["error"],
      },
    },
    responses: {
      ValidationError: {
        description: "Datos inválidos: tipo incorrecto, propiedad no permitida, valor fuera de rango o JSON mal formado (`BAD_REQUEST`).",
        content: json(ref("Error"), errorExample("VALIDATION_ERROR", "Revisa los campos marcados.", { fields: { username: "Este campo es obligatorio.", email: "Este campo no está permitido." } })),
      },
      TaskValidationError: {
        description: "Datos de la tarea inválidos.",
        content: json(
          ref("Error"),
          errorExample("VALIDATION_ERROR", "Revisa los campos marcados.", {
            fields: { title: "El título necesita al menos 3 caracteres.", dueDate: "Elige una fecha de vencimiento válida (AAAA-MM-DD)." },
          }),
        ),
      },
      Unauthenticated: {
        description: "Sin sesión válida (falta la cookie, caducó o se revocó).",
        content: json(ref("Error"), errorExample("UNAUTHENTICATED", "Inicia sesión para continuar.")),
      },
      ForbiddenOrigin: {
        description: "Petición que modifica datos sin `Origin` permitido (protección CSRF).",
        content: json(ref("Error"), errorExample("FORBIDDEN_ORIGIN", "Origen de la petición no permitido.")),
      },
      TaskNotFound: {
        description: "La tarea no existe, no es del usuario o el `id` no es un UUID (no se distingue).",
        content: json(ref("Error"), errorExample("NOT_FOUND", "Tarea no encontrada.")),
      },
      PayloadTooLarge: {
        description: "Cuerpo mayor de 16 KiB.",
        content: json(ref("Error"), errorExample("PAYLOAD_TOO_LARGE", "La petición es demasiado grande.")),
      },
      UnsupportedMediaType: {
        description: "El cuerpo no es JSON (también `text/plain`, formularios y multipart).",
        content: json(ref("Error"), errorExample("UNSUPPORTED_MEDIA_TYPE", "El contenido debe enviarse como JSON.")),
      },
      RateLimited: {
        description: "Demasiadas peticiones (límite global o específico de la ruta).",
        headers: { "Retry-After": { description: "Segundos hasta poder reintentar.", schema: { type: "integer" } } },
        content: json(ref("Error"), errorExample("RATE_LIMITED", "Demasiadas peticiones. Inténtalo de nuevo en unos momentos.")),
      },
      Unavailable: {
        description: "La base de datos no está disponible.",
        content: json(ref("Error"), errorExample("UNAVAILABLE", "Servicio no disponible temporalmente.")),
      },
    },
  },
} as const;
