import { Grua, Corralon, Servicio, Usuario, buildGruaId } from "@gruasbacar/shared";

export const MOTORES_GRUAS: Grua[] = [
  { id: buildGruaId("AB123CD"), patente: "AB123CD", descripcion: "Grúa Plataforma Ford F-550", activa: true },
  { id: buildGruaId("EF456GH"), patente: "EF456GH", descripcion: "Grúa de Arrastre Ram 4000", activa: true },
  { id: buildGruaId("IJ789KL"), patente: "IJ789KL", descripcion: "Grúa Hidráulica Chevrolet Silverado", activa: true },
  { id: buildGruaId("MN012OP"), patente: "MN012OP", descripcion: "Grúa Pesada Mercedes-Benz", activa: true },
];

export const CORRALONES: Corralon[] = [
  { id: "SEM", nombre: "SEM", direccion: "Servicio de Examen Municipal", activo: true },
  { id: "C-NORTE", nombre: "Corralón Municipal Zona Norte", direccion: "Av. de los Constituyentes 4500", activo: true },
  { id: "C-SUR", nombre: "Depósito Judicial Zona Sur", direccion: "Calle de la Herrería 120", activo: true },
  { id: "C-ESTE", nombre: "Playa de Secuestro Este", direccion: "Ruta 9 - Km 12.5", activo: true },
];

const SERVICES_STORE_KEY = "gruas_bacar_services_db";

const DEFAULT_MOCK_SERVICES: Servicio[] = [
  {
    id: "INF-881273-89383-KLO-981",
    patente: "KLO-981",
    numeroInfraccion: "INF-881273",
    identificadorCompuesto: "INF-881273-89383-KLO-981",
    estado: "ENGANCHADO",
    grua: buildGruaId("AB123CD"),
    dupla: { chofer: "Miguel Ángel Chofer", enganchador: "Roberto Pérez", inspector: "Insp. Daniel López" },
    creadoPor: "chofer-uid-2",
    legajoChofer: "89383",
    fechaCreacion: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 mins ago
    eventos: [
      {
        tipo: "ENGANCHE",
        timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        geo: { lat: -34.6037, lng: -58.3816 },
        fotos: [
          {
            driveFileId: "drv_photo_1",
            url: "https://images.unsplash.com/photo-1511919884226-fd3cad34687c?w=400&auto=format&fit=crop&q=60",
            etiqueta: "DELANTERA",
            observacion: "Frente impecable, sin marcas previas"
          },
          {
            driveFileId: "drv_photo_2",
            url: "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=400&auto=format&fit=crop&q=60",
            etiqueta: "LADO_IZQUIERDO",
            observacion: "Rayón superficial en guardabarros trasero"
          }
        ],
        observacionGeneral: "Enganche rápido por obstrucción de rampa de discapacitados."
      }
    ]
  },
  {
    id: "INF-0001-CH001-AAA-999-CD",
    patente: "AAA-999-CD",
    numeroInfraccion: "INF-0001",
    identificadorCompuesto: "INF-0001-CH001-AAA-999-CD",
    estado: "DESENGANCHADO",
    grua: buildGruaId("EF456GH"),
    corralon: "C-NORTE",
    dupla: { chofer: "Esteban Gomis", enganchador: "Mateo Díaz", inspector: "Insp. María Sanabria" },
    creadoPor: "chofer-uid-1",
    legajoChofer: "CH001",
    fechaCreacion: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    finalizadoEn: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    eventos: [
      {
        tipo: "ENGANCHE",
        timestamp: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
        geo: { lat: -34.6080, lng: -58.3720 },
        fotos: []
      },
      {
        tipo: "TRASLADO",
        timestamp: new Date(Date.now() - 4.5 * 3600 * 1000).toISOString(),
      },
      {
        tipo: "DESENGANCHE",
        timestamp: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
        observacionGeneral: "Dejado en Corralón Municipal Zona Norte sin novedades."
      }
    ]
  }
];

export const getMockServices = (): Servicio[] => {
  const saved = localStorage.getItem(SERVICES_STORE_KEY);
  if (saved) {
    try { return JSON.parse(saved); } catch (e) { return DEFAULT_MOCK_SERVICES; }
  }
  localStorage.setItem(SERVICES_STORE_KEY, JSON.stringify(DEFAULT_MOCK_SERVICES));
  return DEFAULT_MOCK_SERVICES;
};

export const saveMockServices = (services: Servicio[]) => {
  localStorage.setItem(SERVICES_STORE_KEY, JSON.stringify(services));
};

export const addMockService = (service: Servicio) => {
  const list = getMockServices();
  list.unshift(service);
  saveMockServices(list);
};

export const updateMockService = (updated: Servicio) => {
  const list = getMockServices();
  const index = list.findIndex((s) => s.id === updated.id);
  if (index !== -1) {
    list[index] = updated;
    saveMockServices(list);
  }
};
