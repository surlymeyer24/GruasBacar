# Estructura del Proyecto — gruasBacar

```
gruasBacar/
├── firebase.json                 # Config Firebase Hosting + Functions
├── firestore.rules               # Security Rules de Firestore
├── storage.rules                 # Security Rules de Storage
├── .firebaserc                   # Proyecto Firebase asociado
│
├── shared/                       # Tipos compartidos frontend ↔ functions
│   └── src/
│       ├── types.ts              # Interfaces: Servicio, Evento, Usuario, etc.
│       └── index.ts              # Re-export
│
├── functions/                    # Firebase Functions (backend)
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts              # Entry point — exporta todas las functions
│       ├── services/
│       │   ├── servicio.service.ts   # Lógica: iniciar enganche, traslado, desenganche, anular
│       │   └── usuario.service.ts    # Lógica: gestión de usuarios
│       ├── middleware/
│       │   └── auth.middleware.ts     # Validación de token + roles
│       └── utils/
│           └── validators.ts          # Validaciones compartidas
│
└── frontend/                     # React + Vite + TypeScript + Tailwind
    └── src/
        ├── App.tsx               # Router principal
        ├── main.tsx              # Entry point
        ├── firebase.ts           # Inicialización Firebase SDK
        │
        ├── types/
        │   └── index.ts          # Re-export de shared/types
        │
        ├── context/
        │   └── AuthContext.tsx    # Estado global de autenticación
        │
        ├── hooks/
        │   ├── useAuth.ts            # Login, logout, estado del usuario
        │   ├── useServicioActivo.ts  # Listener en tiempo real del servicio abierto
        │   ├── useGeolocation.ts     # Obtener coordenadas
        │   └── useCamera.ts          # Acceder a cámara, capturar, forzar live
        │
        ├── services/
        │   ├── auth.service.ts       # Llamadas a Firebase Auth
        │   ├── servicio.service.ts   # Llamadas a Functions de servicio
        │   ├── foto.service.ts       # Subida de fotos a Drive via Functions
        │   ├── fotoCache.service.ts  # Borrador local de fotos (IndexedDB)
        │   ├── grua.service.ts       # CRUD grúas
        │   ├── corralon.service.ts   # CRUD corralones
        │   ├── dupla.service.ts      # CRUD duplas
        │   └── usuario.service.ts    # CRUD usuarios
        │
        ├── pages/
        │   ├── LoginPage.tsx         # Pantalla de login
        │   ├── HomePage.tsx          # Inicio — redirige según estado
        │   ├── EnganchePage.tsx      # Datos + fotos de enganche
        │   ├── TrasladoPage.tsx      # Pantalla de espera
        │   ├── DesenganchePage.tsx   # Llegada + fotos + confirmación
        │   ├── HistorialPage.tsx     # Historial de actas (completo o propio según rol)
        │   ├── AdminDashboardPage.tsx   # Dashboard admin
        │   ├── SupervisorDashboardPage.tsx  # Dashboard supervisor (monitoreo)
        │   └── AdminPage.tsx         # Panel de administración
        │
        ├── components/
        │   ├── auth/
        │   │   ├── LoginForm.tsx         # Formulario email/password
        │   │   ├── ProtectedRoute.tsx    # Redirect si no está logueado
        │   │   ├── RoleGuard.tsx         # Redirect si no tiene el rol
        │   │   ├── HomeRoute.tsx         # Home operador (redirect si no es operador)
        │   │   └── DefaultRedirect.tsx   # Fallback de rutas desconocidas
        │   │
        │   ├── enganche/
        │   │   ├── DatosForm.tsx             # Form: infracción, patente, grúa, dupla, inspector
        │   │   ├── ResumenConfirmacion.tsx   # Resumen antes de confirmar
        │   │   └── FotoGuiada.tsx            # Flujo guiado de 5 fotos con observaciones
        │   │
        │   ├── traslado/
        │   │   └── PantallaTraslado.tsx  # Espera + botón "Desenganche"
        │   │
        │   ├── desenganche/
        │   │   ├── LlegadaCorralon.tsx   # Geo + timestamp + selector corralón
        │   │   ├── FotoDesenganche.tsx   # Flujo guiado de 5 fotos
        │   │   └── ConfirmacionFinal.tsx # Confirmación final
        │   │
        │   ├── admin/
        │   │   ├── GruasCRUD.tsx         # ABM grúas
        │   │   ├── CorralonesCRUD.tsx    # ABM corralones
        │   │   ├── DuplasCRUD.tsx        # ABM duplas
        │   │   ├── UsuariosCRUD.tsx      # ABM usuarios
        │   │   └── ServiciosList.tsx     # Lista de todos los servicios
        │   │
        │   └── shared/
        │       ├── FotoLoteUpload.tsx    # Captura guiada de lote de fotos + borrador IndexedDB
        │       ├── FotoGuiaModal.tsx     # Modal paso a paso para sacar fotos
        │       ├── ConfirmDialog.tsx     # Dialog de confirmación genérico
        │       ├── LoadingSpinner.tsx    # Spinner
        │       ├── Layout.tsx           # Layout principal con navbar
        │       └── Navbar.tsx           # Navegación responsive
        │
        └── utils/
            ├── compressImage.ts     # Compresión de foto via canvas
            └── formatters.ts        # Formateo de fechas, patentes, etc.
```