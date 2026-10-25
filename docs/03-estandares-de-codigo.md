# 3. Estándares de Clean Code

## Estructura sugerida
```text
apps/
  api/src/
    config/
    modules/
      auth/
      lots/
      mail/
      public-access/
      notifications/
      audit/
    middleware/
    shared/
    app.ts
    server.ts
  worker/src/
  web/src/app/
    core/
    shared/
    features/
infra/
  compose/
  nginx/
  scripts/
docs/
```

## Backend
Por módulo, usar capas solo donde aporten claridad:
- `*.routes.ts`: define rutas y middleware.
- `*.controller.ts`: traduce HTTP a llamada de servicio y respuesta.
- `*.service.ts`: reglas de negocio.
- `*.repository.ts`: consultas MongoDB cuando ayude a aislar persistencia.
- `*.schema.ts` / `*.validator.ts`: validación de entrada.
- `*.model.ts`: esquema Mongoose.

No crear capas vacías por cumplir una plantilla. En módulos pequeños, combinar archivos relacionados si sigue siendo claro.

## Reglas
- TypeScript `strict`; evitar `any` y casts inseguros.
- Funciones pequeñas y con una sola responsabilidad.
- Nombres expresivos; evitar abreviaturas crípticas.
- Validar inputs en el límite HTTP con una librería mantenida.
- Respuestas API consistentes y errores tipados.
- Controladores delgados; no consultar Mongo directamente desde rutas.
- No duplicar reglas de permisos.
- No capturar errores para ignorarlos.
- No devolver documentos Mongoose completos: mapear a DTOs con campos permitidos.
- Paginación en listados; ordenar por fecha de forma estable.
- Usar UTC en backend y presentar zona horaria local en UI.
- Evitar dependencias sin necesidad clara.
- No agregar abstracciones genéricas antes de tener un caso real.
- Comentarios explican el porqué, no repiten el código.

## Angular
- Componentes de presentación separados de acceso a datos cuando sea útil.
- Servicios API tipados; formularios reactivos para entradas.
- Guards de rutas solo para UX; el backend decide la autorización.
- Estados de carga, error y vacío explícitos.
- No guardar PIN, contraseña ni tokens en `localStorage`.
- No cachear respuestas privadas con Service Worker.

## Git
- Commits pequeños: `feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`.
- No subir `.env`, dumps, archivos de base de datos, logs ni credenciales. La carpeta `docs/` sí se versiona.
- Revisar `git diff` y tests antes de cada commit.
