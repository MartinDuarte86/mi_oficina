# Mi Oficina

Tu propia suite de oficina en la web, privada y gratis: **documentos (tipo Word)**, **hojas de cálculo (tipo Excel)** y **presentaciones (tipo PowerPoint)**, con login por contraseña. Entras desde cualquier computadora con una URL, igual que Google Docs.

Todo es código abierto y funciona dentro del plan gratuito de **Vercel** (hosting) + **Neon** (base de datos Postgres).

## Qué incluye

| Módulo | Motor (open source) | Importa | Exporta |
|---|---|---|---|
| Documentos | [Tiptap](https://github.com/ueberdosis/tiptap) (MIT) | .docx, .txt, .md | .docx, PDF (imprimir), HTML |
| Hojas de cálculo | [Univer](https://github.com/dream-num/univer) (Apache-2.0): fórmulas, formato, varias hojas | .xlsx, .csv | .xlsx, .csv |
| Presentaciones | Editor propio + [PptxGenJS](https://github.com/gitbrent/PptxGenJS) (MIT) | – | .pptx, modo presentación a pantalla completa |
| Archivos | Guarda cualquier archivo (PDF, imágenes, zip…) de hasta ~2.9 MB | | Descarga |

- Guardado automático (y `Ctrl+S`).
- Login de una sola persona con contraseña; la sesión dura 30 días.
- Arrastra archivos sobre la página principal para subirlos.
- Todo pasa por tu propio dominio: el navegador solo habla con tu URL de Vercel, no con Google ni con otros servicios. Por eso suele funcionar en redes de empresa que bloquean Google Docs.

## Publicarlo gratis (15 minutos)

### 1. Sube el código a GitHub
1. Crea un repositorio **privado** nuevo en GitHub (por ejemplo `mi-oficina`), sin README.
2. Desde esta carpeta:
   ```bash
   git remote add origin https://github.com/TU_USUARIO/mi-oficina.git
   git push -u origin main
   ```

### 2. Crea el proyecto en Vercel
1. Entra a [vercel.com](https://vercel.com) con tu cuenta de GitHub (plan **Hobby**, gratis).
2. **Add New → Project**, elige el repositorio `mi-oficina` y pulsa **Deploy** (el primer despliegue fallará al usarlo porque faltan las variables; es normal).

### 3. Conecta la base de datos (gratis)
1. En el proyecto de Vercel: **Storage → Create Database → Neon (Postgres)**, plan **Free**.
2. Conéctala al proyecto. Vercel crea sola la variable `DATABASE_URL`.
   La tabla se crea automáticamente la primera vez.

### 4. Configura tu contraseña
En **Settings → Environment Variables** agrega:

| Nombre | Valor |
|---|---|
| `APP_PASSWORD` | La contraseña con la que vas a entrar (larga) |
| `AUTH_SECRET` | Un texto aleatorio de 32+ caracteres (puedes generarlo con `openssl rand -base64 32` o en cualquier generador de contraseñas) |

Luego **Deployments → … → Redeploy**. Listo: abre `https://tu-proyecto.vercel.app`.

> Si tu red de trabajo bloquea `*.vercel.app`, en **Settings → Domains** puedes conectar un dominio propio o un subdominio de tu página (p. ej. `oficina.tupagina.com`).

## Probarlo en tu computadora

```bash
npm install
cp .env.example .env.local   # y edita APP_PASSWORD y AUTH_SECRET
npm run dev
```
Abre http://localhost:3000. Sin `DATABASE_URL`, los archivos se guardan en la carpeta `data/`.

## Límites del plan gratuito (para tenerlos claros)

- **Neon Free**: 0.5 GB de almacenamiento. Alcanza para miles de documentos; las imágenes incrustadas y los archivos subidos son lo que más ocupa.
- **Vercel**: cada guardado/subida puede pesar como máximo ~4.5 MB. Por eso los archivos sueltos tienen un límite de ~2.9 MB y la app avisa si insertas imágenes grandes.
- La importación/exportación de Office conserva contenido, tablas, negritas, colores básicos y fórmulas, pero no todo el formato avanzado de Word/Excel/PowerPoint (macros, gráficos de Excel, animaciones, etc.).
- Es para **una sola persona**: no hay edición simultánea con otras personas.

## Estructura

```
app/page.tsx            Panel "Mis archivos"
app/login/              Pantalla de acceso
app/d/[id]/             Abre el editor que corresponde
app/api/                Login, CRUD de archivos y exportación a .docx
components/DocEditor    Editor de texto (Tiptap)
components/SheetEditor  Hoja de cálculo (Univer)
components/SlidesEditor Presentaciones
lib/db.ts               Almacenamiento (Neon Postgres o carpeta local)
lib/convert.ts          Conversión .docx/.xlsx/.csv
proxy.ts                Protege todas las rutas con la sesión
```
