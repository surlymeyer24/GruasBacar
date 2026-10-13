import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

export type DebugEnvironment = "emulator" | "test" | "production";

export interface ClientErrorIncident {
  id: string;
  fingerprint: string;
  tag: string;
  level: "error";
  message: string;
  environment: DebugEnvironment;
  count: number;
  firstSeen: number;
  lastSeen: number;
  lastClientCreatedAt: number;
  lastStack: string;
  lastRoute: string;
  lastContext: {
    online?: boolean;
    userAgent?: string;
  };
  lastUid: string;
  lastUserName: string;
}

export async function listClientErrorIncidents(limit = 200): Promise<ClientErrorIncident[]> {
  const callable = httpsCallable<{ limit: number }, ClientErrorIncident[]>(
    functions,
    "listarErroresCliente"
  );
  const response = await callable({ limit });
  return response.data;
}
