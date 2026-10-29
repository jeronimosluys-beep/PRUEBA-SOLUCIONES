# Soluciones Integrales — Billetera Beta 2.0

**ATENCIÓN: BETA DE DINERO FICTICIO. No es un producto financiero operativo.** No recibe transferencias bancarias, no tiene CVU, Pago Fácil ni Rapipago. No procesar dinero real ni datos bancarios.

## Qué incluye
- Registro e inicio de sesión con correo y contraseña (10 caracteres mínimo)
- Distintos usuarios, cada uno con secciones **personal** y **comercial**
- Saldo centralizado en servidor SQLite, no en el celular
- Crédito ficticio de $50.000 una sola vez por usuario
- Transferencias simuladas por correo entre usuarios o entre secciones propias
- Historial de movimientos con referencias de operaciones
- Débito/crédito de doble partida en transacción atómica, sin saldo negativo

## Ejecutar localmente
Requiere **Node.js 22 o posterior**. No usa dependencias externas.

```bash
npm start
```

Abrir http://localhost:3000. Para pruebas con dos usuarios, abrir una ventana normal y una incógnito o dos dispositivos conectados al servidor.

Datos SQLite almacenados en `./data/beta.sqlite` (se crea al iniciar). Para cambiar destino: `DATA_DIR=/data npm start`.

## Publicar para testers
1. Subir estos archivos a un repositorio privado Git.
2. Configurar hosting de Node 22 con **HTTPS** y disco **persistente**, montar disco en `/data`.
3. Definir `DATA_DIR=/data`, `PORT` según la plataforma y ejecutar `npm start` o crear contenedor con `Dockerfile`.
4. Habilitar acceso solo a un grupo pequeño de testers y respaldar periódicamente base de datos.
5. Compartir el URL `https://...` asignado por el hosting.

**Importante:** en proveedores sin disco persistente, la base puede perderse al reiniciar o redeployar. No publicar en hosting estático (GitHub Pages, Netlify estático) porque requiere backend. No es suficiente abrir el archivo HTML localmente. Los primeros testers deben usar datos ficticios y no compartir contraseñas reales.

## Limitaciones antes de una beta pública amplia
Faltan verificación de correo, recuperación de contraseña, 2FA, protección CSRF si se usan cookies, controles antifraude, auditoría ampliada, backups administrados, monitoreo, política de privacidad y pruebas de seguridad externas. La autenticación actual usa tokens de sesión en `sessionStorage`; para producción se recomienda migrar a cookies HttpOnly/Secure y controles más avanzados. La limitación de intentos es básica en memoria. Se recomienda entorno cerrado con testers de confianza, no lanzamiento público masivo.

## Cargar dinero real
Para depósitos bancarios/CVU y redes Pago Fácil/Rapipago se requieren proveedores/contratos, infraestructura y cumplimiento legal/regulatorio: **no está implementado**. El botón de carga es exclusivamente crédito SIMULADO sin dinero.
