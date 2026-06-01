export interface ActivePlayer {
  userId: string;
  username: string;
  x: number;
  y: number;
  color: string;
  speechCount: number;
  sizeLevel: 1 | 2 | 3 | 4;
  isSupporter: boolean;
  isInactive: boolean;
  lastActiveAt: number;
}

export interface ChatBubble {
  userId: string;
  username: string;
  content: string;
  x: number;
  y: number;
  timestamp: number;
}

export interface LandSummary {
  id: string;
  ownerId: string;
  ownerUsername: string;
  name: string;
  description: string;
  x: number;
  y: number;
  width: number;
  height: number;
  xPx: number;
  yPx: number;
}

export interface SignSummary {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  xPx: number;
  yPx: number;
  title: string;
  content: string;
}

// Client → Server
export interface ClientToServerEvents {
  "player:join": () => void;
  "player:move": (payload: { x: number; y: number }) => void;
  "chat:send": (payload: { content: string }) => void;
  "player:color": (payload: { color: string }) => void;
}

// Server → Client
export interface ServerToClientEvents {
  "world:init": (payload: {
    self: ActivePlayer;
    players: ActivePlayer[];
    lands: LandSummary[];
    signs: SignSummary[];
  }) => void;
  "player:entered": (payload: { player: ActivePlayer }) => void;
  "player:moved": (payload: { userId: string; x: number; y: number }) => void;
  "player:left": (payload: { userId: string }) => void;
  "chat:receive": (payload: ChatBubble) => void;
  "player:colored": (payload: { userId: string; color: string }) => void;
  "player:size_updated": (payload: {
    speechCount: number;
    sizeLevel: 1 | 2 | 3 | 4;
    lastActiveAt: number;
  }) => void;
  "land:created": (payload: LandSummary) => void;
  "land:deleted": (payload: { id: string }) => void;
  "sign:created": (payload: SignSummary) => void;
  "sign:deleted": (payload: { id: string }) => void;
  error: (payload: { code: string; message: string }) => void;
}

export interface SocketData {
  userId: string;
  username: string;
  isSupporter: boolean;
}
