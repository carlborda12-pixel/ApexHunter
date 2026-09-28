# Apex Hunter

Tus finanzas mes a mes y tu bitácora de entrenamiento, en una sola app instalable que funciona sin internet.

## Qué hay en la carpeta

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La app completa |
| `sw.js` | Hace que funcione sin internet y manda los recordatorios |
| `manifest.webmanifest` | Nombre, colores e íconos para instalarla |
| `icons/` | Ícono de la app en todos los tamaños |
| `vercel.json` | Encabezados para que Vercel sirva bien el service worker |

No hay que compilar nada: es un sitio estático.

## Subirla a Vercel

**Opción A — con GitHub (recomendada, cada cambio se publica solo)**
1. Creá un repositorio nuevo y subí el contenido de esta carpeta (que `index.html` quede en la raíz).
2. En vercel.com → **Add New… → Project** → importá el repositorio.
3. Framework Preset: **Other**. Build Command y Output Directory: vacíos.
4. **Deploy**.

**Opción B — desde la terminal**
```bash
npm i -g vercel
cd apex-hunter
vercel          # primera vez: crea el proyecto
vercel --prod   # publica en producción
```

## Instalarla en el celular o la compu

- **Android / Chrome / Edge:** abrí la URL de Vercel y tocá **Instalar** (arriba en la app) o el menú del navegador → *Instalar app*.
- **iPhone:** abrila en Safari → **Compartir → Agregar a inicio**.

Una vez instalada abre como app propia, con su ícono, y funciona sin conexión.

## Recordatorios

Se activan desde el botón **Recordatorios**:
- **Entrenamiento:** aviso a la hora que elijas si ese día no registraste sesión y todavía no cumpliste la meta semanal.
- **Finanzas:** aviso si ese día no cargaste movimientos. El día 1 llega el resumen del mes que cerró.

Límites a tener en cuenta (son del navegador, no de la app):
- Llegan con la app abierta o en segundo plano.
- En Android con la app instalada, Chrome puede avisar con la app cerrada, pero no garantiza la hora exacta.
- En iPhone solo funcionan con la app agregada a inicio.
- Para avisos exactos con la app cerrada hace falta un servidor de notificaciones push (se puede sumar después con una función de Vercel).

## Tus datos

Se guardan en el dispositivo donde usás la app (no en un servidor). Usá **Exportar copia** para bajar un `.json` y **Importar copia** para pasarlos a otro dispositivo. Si venías usando la versión anterior en el mismo navegador y dominio, los datos se cargan solos; si no, importá la copia.

## Publicar una actualización

Si cambiás archivos, subí también un cambio a `VERSION` dentro de `sw.js` (por ejemplo `apex-hunter-v2`) para que los dispositivos descarguen los íconos y archivos nuevos.
