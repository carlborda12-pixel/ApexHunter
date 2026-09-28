# Apex Hunter v5

Finanzas mes a mes y bitácora de entrenamiento. App instalable, funciona sin internet y, con el backend configurado, se sincroniza entre dispositivos y manda avisos push.

## Archivos

```
index.html  sw.js  reminders.js  manifest.webmanifest  vercel.json  package.json
icon.svg  icon-192.png  icon-512.png  icon-maskable-192.png  icon-maskable-512.png
apple-touch-icon.png  favicon-32.png  badge-96.png
api/
  _lib.js  sync.js  push.js  cron.js  dolar.js
```

Todo va en la raíz del repo, **salvo los 5 archivos de `api/`, que tienen que estar dentro de una carpeta `api`**. Vercel solo reconoce las funciones ahí.

**Subir la carpeta `api` desde la web de GitHub:** *Add file → Create new file*, escribí `api/sync.js` como nombre (al poner la barra GitHub crea la carpeta), pegá el contenido y guardá. Repetí con los otros cuatro archivos.

## Qué funciona sin configurar nada

Editar movimientos, gastos fijos, cobros pendientes, presupuestos, temporizador de rounds, plan semanal, objetivos, récords, bloqueo con PIN/huella, avisos locales y la cotización del dólar.

## Configurar sincronización y push (una sola vez)

### 1. Base de datos
En tu proyecto de Vercel → **Storage** (o **Marketplace**) → **Upstash for Redis** → *Create* y conectalo al proyecto. El plan gratuito alcanza. Vercel agrega solo las variables de conexión.

### 2. Variables de entorno
En *Settings → Environment Variables* agregá:

| Variable | Qué poner |
|---|---|
| `APP_SECRET` | Una clave larga y aleatoria (mínimo 16 caracteres). Es la que vas a pegar en cada dispositivo. |
| `CRON_SECRET` | Otra clave aleatoria distinta, para el disparador de avisos. |
| `VAPID_PUBLIC_KEY` | Ver abajo. |
| `VAPID_PRIVATE_KEY` | Ver abajo. |
| `VAPID_SUBJECT` | `mailto:` + tu email, por ejemplo `mailto:vos@ejemplo.com` |

Para generar las claves aleatorias:
```bash
openssl rand -hex 32
```
Para las claves VAPID (necesitás Node):
```bash
npx web-push generate-vapid-keys
```

Después, **Redeploy** para que tome las variables.

### 3. Disparador de avisos cada 5 minutos
El plan Hobby de Vercel solo permite tareas programadas una vez por día, así que `vercel.json` trae una diaria como respaldo. Para avisos a la hora exacta:

1. Creá una cuenta gratis en **cron-job.org**.
2. Nuevo cronjob con esta URL (con tu dominio y tu `CRON_SECRET`):
   ```
   https://TU-APP.vercel.app/api/cron?key=TU_CRON_SECRET
   ```
3. Frecuencia: cada 5 minutos.

### 4. En cada dispositivo
**Ajustes → Sincronización y push** → pegá el `APP_SECRET` → **Conectar**. Después activá **Avisos con la app cerrada** y tocá **Probar**.

## Cómo se unen los datos
Cada registro guarda cuándo se cambió por última vez. Al sincronizar gana el cambio más reciente de cada registro, así que podés cargar cosas sin conexión en el celular y en la compu y se juntan bien. Lo borrado queda marcado para que no reaparezca.

## Seguridad
- Las funciones rechazan cualquier pedido sin el `APP_SECRET` (comparación en tiempo constante).
- El PIN se guarda como hash PBKDF2 (150.000 iteraciones) con sal aleatoria. La huella usa WebAuthn del dispositivo.
- El bloqueo evita que otra persona abra la app; los datos no quedan cifrados en el dispositivo ni en la base.
- Si cambiás el `APP_SECRET`, tenés que volver a conectar cada dispositivo.

## Actualizaciones
Si modificás archivos, cambiá `VERSION` en `sw.js` (por ejemplo `apex-hunter-v6`) para que los dispositivos instalados descarguen lo nuevo.
